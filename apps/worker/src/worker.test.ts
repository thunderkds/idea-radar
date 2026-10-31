import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import pg from "pg";
import type { Repo, Signal, SourceConnector } from "@idea-radar/core";
import { GhArchiveConnector, GithubApiConnector } from "@idea-radar/connectors";
import { applyMigrations, claimNext, enqueueDue, MAX_JOB_ATTEMPTS } from "@idea-radar/db";
import type { Job, Pool } from "@idea-radar/db";
import { buildCaps, buildHandlers, buildSchedule, RESOLVE_PENDING_JOB, SHORTLIST_JOB } from "./handlers.js";
import type { JobHandler } from "./handlers.js";
import { runWorker } from "./runner.js";

const url = process.env.TEST_DATABASE_URL;

/** Returns why the DB tests must skip, or undefined when Postgres answers. */
async function skipReason(): Promise<string | undefined> {
  if (!url) return "TEST_DATABASE_URL is not set";
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return undefined;
  } catch (err) {
    return `Postgres unreachable at TEST_DATABASE_URL: ${(err as Error).message}`;
  } finally {
    await client.end().catch(() => {});
  }
}

const skip = await skipReason();

const NOW = new Date("2026-10-31T06:10:00Z");
const clock = () => NOW;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A fetch-based connector over a fixed list of names, optionally failing after `failAfter` items. */
class FakeConnector implements SourceConnector<string> {
  readonly name = "Fake";
  readonly licenseNote = "";
  readonly displayable = true;
  readonly schedule = "daily" as const;
  constructor(
    readonly id: string,
    private readonly items: string[],
    private readonly failAfter = Infinity,
    readonly rateLimit = { perHour: 60, concurrency: 1 },
    readonly enabled = true,
  ) {}
  async *fetch(): AsyncIterable<string> {
    for (const [i, item] of this.items.entries()) {
      if (i >= this.failAfter) throw new Error("upstream broke");
      yield item;
    }
  }
  normalize(item: string): Signal[] {
    return [{ repoId: 0, fullName: item, source: this.id, signalType: "listed", value: {}, observedAt: NOW }];
  }
}

const repo = (repoId: number, fullName: string): Repo => ({
  repoId, fullName, description: null, language: null, topics: [], license: null,
  stars: 1, forks: 0, archived: false, createdAt: NOW, pushedAt: null,
});

describe("worker (needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;

  const jobs = async () =>
    (await pool.query("SELECT * FROM jobs ORDER BY id")).rows as Record<string, any>[];
  const job = async (name: string) => (await jobs()).find((j) => j.name === name)!;
  const source = async (id: string) =>
    (await pool.query("SELECT * FROM sources WHERE id = $1", [id])).rows[0] as Record<string, any> | undefined;
  const count = async (table: string) =>
    (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]!.n;

  before(async () => {
    admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 10 });
    const client = await pool.connect();
    try {
      await applyMigrations(client);
    } finally {
      client.release();
    }
  });

  after(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  beforeEach(async () => {
    const { rows } = await pool.query<{ s: string }>("SELECT current_schema() AS s");
    assert.equal(rows[0]!.s, schema, "refusing to truncate outside the throwaway schema");
    await pool.query(
      "TRUNCATE jobs, repos, repo_daily, signals, sources, pending_signals, ingest_cursors, repo_scores, candidates, repo_content",
    );
  });

  const once = (handlers: Record<string, JobHandler>, caps = {}) =>
    runWorker({ db: pool, handlers, caps: { defaultPerName: 5, ...caps }, once: true, now: clock });

  describe("runWorker --once", () => {
    it("runs every due job once, records source health, and a second pass runs nothing (AC 7, 8)", async () => {
      const ran: string[] = [];
      const handlers: Record<string, JobHandler> = {
        good: { sourceId: "good", run: async ({ job: j }) => void ran.push(j.name) },
        bad: { sourceId: "bad", run: async () => { throw new Error("it broke"); } },
        score: { sourceId: null, run: async ({ job: j }) => void ran.push(j.name) },
      };
      await once(handlers);
      assert.deepEqual(ran, ["good"], "score waits: bad is not ok");
      assert.equal((await job("good")).status, "ok");
      const bad = await job("bad");
      assert.equal([bad.status, bad.attempts, bad.last_error].join("|"), "pending|1|it broke");

      const good = await source("good");
      assert.equal(good!.last_status, "ok");
      assert.ok(good!.last_run_at);
      assert.equal(good!.last_error, null);
      const broke = await source("bad");
      assert.equal([broke!.last_status, broke!.last_error].join("|"), "error|it broke");

      await once(handlers); // bad is still in backoff; good and score must not run again
      assert.deepEqual(ran, ["good"]);
    });

    it("a source goes back to ok after an error, clearing last_error", async () => {
      let fail = true;
      const handlers = { flaky: { sourceId: "flaky", run: async () => { if (fail) throw new Error("x"); } } };
      await once(handlers);
      assert.equal((await source("flaky"))!.last_status, "error");
      fail = false;
      await pool.query("UPDATE jobs SET run_after = now() - interval '1 day'");
      await runWorker({ db: pool, handlers, caps: { defaultPerName: 5 }, once: true, now: () => new Date() });
      const s = await source("flaky");
      assert.equal(s!.last_status, "ok");
      assert.equal(s!.last_error, null);
    });

    it(`ends a permanently failing job as failed after ${MAX_JOB_ATTEMPTS} attempts`, async () => {
      const handlers = { bad: { sourceId: "bad", run: async () => { throw new Error("nope"); } } };
      let t = NOW.getTime();
      for (let i = 0; i < MAX_JOB_ATTEMPTS + 1; i++) {
        await runWorker({ db: pool, handlers, caps: { defaultPerName: 5 }, once: true, now: () => new Date(t) });
        t += 3 * 3_600_000;
      }
      const j = await job("bad");
      assert.equal([j.status, j.attempts].join("|"), `failed|${MAX_JOB_ATTEMPTS}`);
    });

    it("fails a job with no handler instead of leaving it running", async () => {
      await enqueueDue(pool, NOW, { hourly: [], daily: ["ghost"] });
      await runWorker({ db: pool, handlers: {}, caps: {}, once: true, now: clock });
      // No handlers means no schedule either, so ghost was enqueued by hand above and never claimed.
      assert.equal((await job("ghost")).status, "pending");
      await runWorker({
        db: pool, handlers: { other: { sourceId: null, run: async () => {} } }, caps: { defaultPerName: 5 },
        once: true, now: clock,
      });
      const ghost = await job("ghost");
      assert.equal([ghost.status, ghost.last_error].join("|"), 'pending|no handler for job "ghost"');
    });

    it("never runs more than the per-name or global cap at once (AC 3)", async () => {
      let active = 0, activeA = 0, maxActive = 0, maxA = 0;
      const slow = (isA: boolean): JobHandler => ({
        sourceId: null,
        run: async () => {
          active++; maxActive = Math.max(maxActive, active);
          if (isA) { activeA++; maxA = Math.max(maxA, activeA); }
          await sleep(40);
          active--; if (isA) activeA--;
        },
      });
      // Hourly jobs for several hours of two names; enqueue them by hand as separate data keys.
      const values = [0, 1, 2, 3, 4, 5].flatMap((h) => [`('a','k${h}')`, `('b','k${h}')`, `('c','k${h}')`]);
      await pool.query(`INSERT INTO jobs (name, data_key) VALUES ${values.join(",")}`);
      await runWorker({
        db: pool,
        handlers: { a: slow(true), b: slow(false), c: slow(false) },
        caps: { global: 4, perName: { a: 2 }, defaultPerName: 3 },
        once: true,
        now: () => new Date(Date.now() + 1000),
      });
      // enqueueDue added the hour/day jobs too; every job must still have run.
      assert.equal((await jobs()).filter((j) => j.status !== "ok").length, 0);
      assert.ok(maxA <= 2, `a ran ${maxA} at once`);
      assert.ok(maxActive <= 4, `${maxActive} ran at once`);
      assert.ok(maxActive >= 3, "should actually run in parallel");
    });

    it("runs score after all ingest jobs of its date are ok, in one pass", async () => {
      const order: string[] = [];
      const h = (name: string, ms: number): JobHandler => ({
        sourceId: null,
        run: async () => { await sleep(ms); order.push(name); },
      });
      await runWorker({
        db: pool, handlers: { gh_archive: h("gh_archive", 30), ossinsight: h("ossinsight", 10), score: h("score", 0) },
        caps: { defaultPerName: 5 }, once: true, now: () => new Date("2026-10-31T03:00:00Z"),
      });
      assert.deepEqual(order, ["ossinsight", "gh_archive", "score"]);
    });
  });

  describe("run token and heartbeat (T023)", () => {
    /** Simulate a newer run taking the job over: a stuck-job reclaim bumps `attempts` by 1. */
    const reclaim = (name: string) => pool.query("UPDATE jobs SET attempts = attempts + 1 WHERE name = $1", [name]);
    const lines: string[] = [];
    beforeEach(() => void (lines.length = 0));
    const run = (handlers: Record<string, JobHandler>, extra: { heartbeatMs?: number } = {}) =>
      runWorker({
        db: pool, handlers, caps: { defaultPerName: 5 }, once: true, now: () => new Date(), log: (l) => lines.push(l),
        ...extra,
      });

    it("sends a heartbeat while the handler runs and none after it ends (AC 5)", async () => {
      let before: Date | undefined;
      let during: Date | undefined;
      const handlers = {
        slow: {
          sourceId: null,
          run: async () => {
            before = (await job("slow")).locked_at;
            await sleep(200);
            during = (await job("slow")).locked_at;
          },
        },
      };
      await run(handlers, { heartbeatMs: 20 });
      assert.ok(before && during && during.getTime() > before.getTime(), "locked_at moved while the handler ran");
      assert.equal((await job("slow")).status, "ok");
      lines.length = 0;
      await sleep(100);
      assert.deepEqual(lines, [], "no heartbeat (and no heartbeat error) after the job ended");
    });

    it("logs a heartbeat error and keeps the run going (AC 5)", async () => {
      // A pool whose heartbeat UPDATE fails; every other query goes through.
      const flaky = new Proxy(pool, {
        get: (target, prop) =>
          prop === "query"
            ? (text: unknown, ...rest: unknown[]) =>
                typeof text === "string" && text.includes("SET locked_at = $3")
                  ? Promise.reject(new Error("heartbeat boom"))
                  : (target.query as (...a: unknown[]) => unknown)(text, ...rest)
            : Reflect.get(target, prop).bind?.(target) ?? Reflect.get(target, prop),
      });
      const handlers = { slow: { sourceId: null, run: async () => void (await sleep(100)) } };
      await runWorker({
        db: flaky, handlers, caps: { defaultPerName: 5 }, once: true, now: () => new Date(),
        log: (l) => lines.push(l), heartbeatMs: 20,
      });
      assert.ok(lines.some((l) => JSON.parse(l).error === "heartbeat boom"), lines.join("\n"));
      assert.equal((await job("slow")).status, "ok");
    });

    it("a run that lost the job logs lost, leaves the job alone and records no source health (AC 6)", async () => {
      const handlers = { stale: { sourceId: "stale", run: async () => void (await reclaim("stale")) } };
      await run(handlers);
      const j = await job("stale");
      assert.equal([j.status, j.attempts].join("|"), "running|1");
      assert.equal(await source("stale"), undefined);
      assert.equal(JSON.parse(lines.at(-1)!).status, "lost");
    });

    it("a failing run that lost the job logs lost, does not fail the job and records no source health (AC 6)", async () => {
      const handlers = {
        stale: {
          sourceId: "stale",
          run: async () => {
            await reclaim("stale");
            throw new Error("late failure");
          },
        },
      };
      await run(handlers);
      const j = await job("stale");
      assert.equal([j.status, j.attempts, j.last_error].join("|"), "running|1|");
      assert.equal(await source("stale"), undefined);
      assert.equal(JSON.parse(lines.at(-1)!).status, "lost");
    });

    it("fetch connector: a stale run commits no signals and logs the loss (AC 7)", async () => {
      await pool.query("INSERT INTO repos (repo_id, full_name) VALUES (7, 'known/repo')");
      class Stale extends FakeConnector {
        override async *fetch(): AsyncIterable<string> {
          yield "known/repo";
          await reclaim("fake");
        }
      }
      await run(buildHandlers({ connectors: [new Stale("fake", [])], log: (l) => lines.push(l) }));
      assert.equal(await count("signals"), 0, "stale run rolled back");
      assert.equal((await job("fake")).status, "running");
      assert.equal(await source("fake"), undefined);
      assert.ok(lines.some((l) => JSON.parse(l).status === "lost"), lines.join("\n"));
    });
  });

  describe("handlers", () => {
    const ctx = (connectors: SourceConnector[], extra = {}) => buildHandlers({ connectors, ...extra });

    it("fetch connector: inserts signals, queues unknown names, completes the job, records ok", async () => {
      await pool.query("INSERT INTO repos (repo_id, full_name) VALUES (7, 'known/repo')");
      const fake = new FakeConnector("fake", ["known/repo", "new/one", "new/two"]);
      await once(ctx([fake]));
      assert.equal(await count("signals"), 1);
      assert.equal(await count("pending_signals"), 2);
      assert.equal((await job("fake")).status, "ok");
      assert.equal((await source("fake"))!.last_status, "ok");
    });

    it("fetch connector: a mid-run failure leaves no signals and a retry does not duplicate (AC 7, gap A12)", async () => {
      await pool.query("INSERT INTO repos (repo_id, full_name) VALUES (7, 'a/a'), (8, 'b/b')");
      let broken = true;
      class Flaky extends FakeConnector {
        override async *fetch(): AsyncIterable<string> {
          yield "a/a";
          yield "b/b";
          if (broken) throw new Error("upstream broke");
        }
      }
      const handlers = ctx([new Flaky("fake", [])]);
      await once(handlers);
      assert.equal(await count("signals"), 0, "partial run rolled back");
      const failed = await job("fake");
      assert.equal([failed.status, failed.attempts, failed.last_error].join("|"), "pending|1|upstream broke");
      assert.equal((await source("fake"))!.last_status, "error");

      broken = false;
      await pool.query("UPDATE jobs SET run_after = now() - interval '1 day'");
      await runWorker({ db: pool, handlers, caps: { defaultPerName: 5 }, once: true, now: () => new Date() });
      assert.equal(await count("signals"), 2);
      assert.equal((await job("fake")).status, "ok");
    });

    it("disabled connectors get no job", async () => {
      await once(ctx([new FakeConnector("off", ["x/y"], Infinity, undefined, false), new FakeConnector("on", [])]));
      assert.deepEqual((await jobs()).map((j) => j.name).sort(), ["on", "score", "shortlist"]);
    });

    it("resolve_pending: resolves names through the one shared GitHub connector, keeps observed_at, bumps not-found", async () => {
      const observed = new Date("2026-10-01T00:00:00Z");
      await pool.query(
        `INSERT INTO pending_signals (full_name, source, signal_type, observed_at)
         VALUES ('Owner/Found','github_trending','listed',$1), ('ghost/gone','github_trending','listed',$1)`,
        [observed],
      );
      let calls = 0;
      class FakeGithub extends GithubApiConnector {
        override async resolveNames(names: string[]) {
          calls++;
          const resolved = new Map<string, Repo>();
          const notFound: string[] = [];
          for (const n of names) (n === "Owner/Found" ? resolved.set(n, repo(99, "owner/found")) : notFound.push(n));
          return { resolved, notFound };
        }
      }
      await once(ctx([new FakeGithub("tok", true)]));
      assert.equal(calls, 1);
      assert.equal((await pool.query("SELECT full_name FROM repos")).rows[0].full_name, "owner/found");
      const sig = (await pool.query("SELECT repo_id, observed_at FROM signals")).rows;
      assert.deepEqual(sig.map((s) => [s.repo_id, s.observed_at.toISOString()]), [[99, observed.toISOString()]]);
      assert.equal((await pool.query("SELECT attempts FROM pending_signals")).rows[0].attempts, 1);
      assert.equal((await job(RESOLVE_PENDING_JOB)).status, "ok");
      assert.equal((await source("github_api"))!.last_status, "ok");
    });

    it("resolve_pending: not scheduled without a GitHub token; with nothing pending it makes no API call", async () => {
      const off = ctx([new GithubApiConnector(undefined)]);
      assert.ok(!(RESOLVE_PENDING_JOB in off));
      let calls = 0;
      class FakeGithub extends GithubApiConnector {
        override async resolveNames() { calls++; return { resolved: new Map(), notFound: [] }; }
      }
      await once(ctx([new FakeGithub("tok", true)]));
      assert.equal(calls, 0);
      assert.equal((await job(RESOLVE_PENDING_JOB)).status, "ok");
    });

    it("gh_archive: ingests a completed day into repo_daily and sets the cursor; the next call is a no-op", async () => {
      const day = "2026-10-30";
      const event = { type: "WatchEvent", actor: { id: 1, login: "u" }, repo: { id: 42, name: "a/b" }, created_at: `${day}T05:00:00Z` };
      const requested: string[] = [];
      const fetchImpl = async (u: string) => {
        requested.push(u);
        return new Response(gzipSync(Buffer.from(u.endsWith("-5.json.gz") ? JSON.stringify(event) + "\n" : "")));
      };
      const handlers = ctx([new GhArchiveConnector()], { ghArchive: { now: NOW, fetchImpl, backfillDays: 1 } });
      await once(handlers);
      assert.equal(requested.length, 24);
      const daily = (await pool.query("SELECT repo_id, date::text AS date, stars_new FROM repo_daily")).rows;
      assert.deepEqual(daily, [{ repo_id: 42, date: day, stars_new: 1 }]);
      assert.equal((await pool.query("SELECT cursor FROM ingest_cursors WHERE source_id = 'gh_archive'")).rows[0].cursor, day);
      assert.equal((await job("gh_archive")).status, "ok");
      assert.equal((await source("gh_archive"))!.last_status, "ok");

      // The next hour: no new completed day, so no download.
      requested.length = 0;
      const next = new Date("2026-10-31T07:10:00Z");
      await runWorker({ db: pool, handlers, caps: { defaultPerName: 5 }, once: true, now: () => next });
      assert.deepEqual(requested, []);
      assert.equal((await jobs()).filter((j) => j.name === "gh_archive").length, 2);
    });

    it("gh_archive: a 404 hour is not an error", async () => {
      const handlers = ctx([new GhArchiveConnector()], {
        ghArchive: { now: NOW, fetchImpl: async () => new Response(null, { status: 404 }), backfillDays: 1 },
      });
      await once(handlers);
      assert.equal((await job("gh_archive")).status, "ok");
      assert.equal((await source("gh_archive"))!.last_status, "ok");
      assert.equal(await count("repo_daily"), 0);
    });

    it("gh_archive: an HTTP 500 fails the job and shows in sources", async () => {
      const handlers = ctx([new GhArchiveConnector()], {
        ghArchive: { now: NOW, fetchImpl: async () => new Response(null, { status: 500 }), backfillDays: 1 },
      });
      await once(handlers);
      const j = await job("gh_archive");
      assert.equal(j.status, "pending");
      assert.match(j.last_error, /HTTP 500/);
      assert.equal((await source("gh_archive"))!.last_status, "error");
    });

    it("score runs scoreDay, then applyConsensus, for the job's date, with no source row", async () => {
      await pool.query("INSERT INTO repos (repo_id, full_name, stars) VALUES (5, 'o/listed', 800)");
      await pool.query("INSERT INTO repo_daily (repo_id, date, stars_new) VALUES (5, '2026-10-29', 10)");
      await pool.query(
        `INSERT INTO signals (repo_id, source, signal_type, observed_at) VALUES
           (5, 'github_trending', 'x', '2026-10-30T10:00:00Z'), (5, 'trendshift', 'x', '2026-10-30T11:00:00Z')`,
      );
      await once(ctx([]));
      assert.equal((await job("score")).status, "ok");
      assert.equal(await count("sources"), 0);
      const rows = (
        await pool.query("SELECT repo_id, date::text AS date, tier, score, consensus_count FROM repo_scores")
      ).rows;
      assert.deepEqual(rows, [{ repo_id: 5, date: "2026-10-31", tier: "trending", score: 11, consensus_count: 2 }]);
    });
  });

  describe("score fake-star check (HUN-151)", () => {
    const logs: string[] = [];
    /** Fake GitHub: every sampled repo's stargazers are all brand-new accounts. */
    class SamplingGithub extends GithubApiConnector {
      sampled: [number, number][] = [];
      override async sampleStargazers(repoId: number, n?: number) {
        this.sampled.push([repoId, n as number]);
        return Array.from({ length: 10 }, () => ({
          starredAt: "2026-10-30T12:00:00Z", createdAt: "2026-10-29T00:00:00Z", publicRepos: 0, followers: 0, contributions: 0,
        }));
      }
    }
    const seed = async () => {
      await pool.query("INSERT INTO repos (repo_id, full_name, stars) VALUES (5, 'o/burst', 800)");
      await pool.query(
        "INSERT INTO signals (repo_id, source, signal_type, observed_at) VALUES (5, 'github_trending', 'x', '2026-10-30T10:00:00Z')",
      );
      await pool.query("INSERT INTO repo_daily (repo_id, date, stars_new, stars_max_hour) VALUES (5, '2026-10-30', 200, 80)");
    };
    const scoreOnly = (github?: GithubApiConnector) => {
      const handlers = buildHandlers({ connectors: github ? [github] : [], log: (l) => logs.push(l) });
      return once({ score: handlers.score! });
    };
    const scoreRow = async () =>
      (await pool.query("SELECT score, fake_star_flag, components FROM repo_scores WHERE repo_id = 5")).rows[0];

    beforeEach(() => void (logs.length = 0));

    it("samples the burst repo right after scoreDay, flags it and discounts the score (AC 4)", async () => {
      await seed();
      const gh = new SamplingGithub("tok", true);
      await scoreOnly(gh);
      assert.equal((await job("score")).status, "ok");
      assert.deepEqual(gh.sampled, [[5, 100]]);
      const row = await scoreRow();
      assert.equal(row.fake_star_flag, true);
      assert.equal(row.score, 0); // share 1: 200 * (1 - 1)
      assert.equal(row.components.fakeStarSampled, 10);
      assert.deepEqual(JSON.parse(logs[0]!), { job: "score", date: "2026-10-31", checked: 1, flagged: 1 });
    });

    it("without a token, scores normally and logs that the check was skipped", async () => {
      await seed();
      await scoreOnly(new SamplingGithub(undefined));
      assert.equal((await job("score")).status, "ok");
      const row = await scoreRow();
      assert.equal(row.fake_star_flag, false);
      assert.equal(row.score, 200);
      assert.match(logs.join("\n"), /fake-star check skipped/);
    });
  });

  describe("shortlist (HUN-148)", () => {
    const DAY = "2026-10-30";
    const setCursorTo = (day: string) =>
      pool.query("INSERT INTO ingest_cursors (source_id, cursor) VALUES ('gh_archive', $1)", [day]);
    const stars = (repoId: number, n: number) =>
      pool.query("INSERT INTO repo_daily (repo_id, date, stars_new) VALUES ($1, $2, $3)", [repoId, DAY, n]);

    /** Fake GitHub: repos 1 and 2 exist; 3 is gone. Records every id it is asked for. */
    class FakeGithub extends GithubApiConnector {
      byIds: number[][] = [];
      content: number[][] = [];
      contentError: Error | null = null;
      override async fetchByIds(ids: number[]) {
        this.byIds.push(ids);
        return { repos: ids.filter((i) => i !== 3).map((i) => repo(i, `o/r${i}`)), missing: ids.filter((i) => i === 3) };
      }
      override async fetchContent(ids: number[]) {
        this.content.push(ids);
        if (this.contentError) throw this.contentError;
        return {
          contents: ids.filter((i) => i !== 3).map((i) => ({
            repoId: i,
            readmeMd: `# repo ${i}`,
            manifests: { "package.json": "{}" },
            fileTreeSummary: { entries: [{ name: "package.json", type: "blob" }], total: 1 },
            stackTags: ["node"],
          })),
          missing: ids.filter((i) => i === 3),
        };
      }
    }

    const seed = async () => {
      await setCursorTo(DAY);
      await stars(1, 10);
      await stars(2, 5);
      await stars(3, 4);
      await stars(4, 1); // under minStars7d: not a candidate
    };
    const lines: string[] = [];
    const handlersFor = (github: GithubApiConnector) =>
      buildHandlers({ connectors: [github], log: (l) => lines.push(l) });
    const shortlist = (handlers: Record<string, JobHandler>) =>
      once({ [SHORTLIST_JOB]: handlers[SHORTLIST_JOB]! });
    const contentRows = async () =>
      (await pool.query("SELECT repo_id, readme_md, stack_tags FROM repo_content ORDER BY repo_id")).rows;

    beforeEach(() => void (lines.length = 0));

    it("selects the GH Archive day's candidates, fetches metadata, then README/manifests/tags (AC 3, 6)", async () => {
      await seed();
      const gh = new FakeGithub("tok", true);
      await shortlist(handlersFor(gh));
      assert.deepEqual(
        (await pool.query("SELECT repo_id FROM candidates WHERE date = $1 ORDER BY repo_id", [DAY])).rows.map((r) => r.repo_id),
        [1, 2, 3],
      );
      assert.deepEqual(gh.byIds, [[1, 2, 3]], "metadata for every candidate, best first");
      assert.deepEqual(
        (await pool.query("SELECT repo_id FROM repos ORDER BY repo_id")).rows.map((r) => r.repo_id),
        [1, 2],
      );
      assert.deepEqual(gh.content, [[1, 2]], "no content call for the repo GitHub could not return");
      assert.deepEqual(await contentRows(), [
        { repo_id: 1, readme_md: "# repo 1", stack_tags: ["node"] },
        { repo_id: 2, readme_md: "# repo 2", stack_tags: ["node"] },
      ]);
      assert.equal((await job(SHORTLIST_JOB)).status, "ok");
      const health = await source("github_api");
      assert.equal(health!.last_status, "ok");
      assert.deepEqual(JSON.parse(lines.at(-1)!), {
        job: "shortlist", day: DAY, selected: 3, metadata: 2, metadataMissing: 1, content: 2, contentMissing: 0,
      });
    });

    it("skips repos with fresh metadata and fresh content; refetches stale ones (AC 3, 4)", async () => {
      await seed();
      const gh = new FakeGithub("tok", true);
      const handlers = handlersFor(gh);
      await shortlist(handlers);
      gh.byIds.length = 0;
      gh.content.length = 0;

      await pool.query("UPDATE jobs SET status = 'pending', run_after = now() - interval '1 day'");
      await shortlist(handlers);
      assert.deepEqual(gh.byIds, [[3]], "3 has no repos row, so it is retried; 1 and 2 are fresh");
      assert.deepEqual(gh.content, []);

      await pool.query("UPDATE repo_content SET fetched_at = now() - interval '8 days' WHERE repo_id = 2");
      await pool.query("UPDATE repos SET updated_at = now() - interval '8 days' WHERE repo_id = 1");
      gh.byIds.length = 0;
      await pool.query("UPDATE jobs SET status = 'pending', run_after = now() - interval '1 day'");
      await shortlist(handlers);
      assert.deepEqual(gh.byIds, [[1, 3]]);
      assert.deepEqual(gh.content, [[2]]);
    });

    it("a failure in the content step keeps the metadata, fails the job and marks github_api error (AC 6)", async () => {
      await seed();
      const gh = new FakeGithub("tok", true);
      gh.contentError = new Error("GitHub API HTTP 502");
      await shortlist(handlersFor(gh));
      assert.equal(await count("repos"), 2);
      assert.equal(await count("repo_content"), 0);
      const j = await job(SHORTLIST_JOB);
      assert.equal([j.status, j.last_error].join("|"), "pending|GitHub API HTTP 502");
      const health = await source("github_api");
      assert.equal([health!.last_status, health!.last_error].join("|"), "error|GitHub API HTTP 502");
    });

    it("without a GitHub token it selects candidates, makes no fetch, logs the skip, and records no github_api health (AC 3)", async () => {
      await seed();
      await shortlist(handlersFor(new GithubApiConnector(undefined)));
      assert.equal(await count("candidates"), 3);
      assert.equal(await count("repos"), 0);
      assert.equal((await job(SHORTLIST_JOB)).status, "ok");
      assert.equal(await source("github_api"), undefined);
      assert.match(lines.join("\n"), /no token/);
    });

    it("with no GH Archive cursor it skips the run with a log line and selects nothing (AC 3)", async () => {
      await stars(1, 10);
      const gh = new FakeGithub("tok", true);
      await shortlist(handlersFor(gh));
      assert.equal(await count("candidates"), 0);
      assert.deepEqual(gh.byIds, []);
      assert.equal((await job(SHORTLIST_JOB)).status, "ok");
      assert.match(lines.join("\n"), /no gh_archive cursor/);
    });

    it("score for a date waits for shortlist of that date (AC 5)", async () => {
      await seed();
      const gh = new FakeGithub("tok", true);
      gh.contentError = new Error("boom");
      const ran: string[] = [];
      const handlers = {
        ...handlersFor(gh),
        score: { sourceId: null, run: async () => void ran.push("score") },
      };
      const at = () => new Date("2026-10-31T03:00:00Z");
      await runWorker({ db: pool, handlers, caps: { defaultPerName: 5 }, once: true, now: at });
      assert.deepEqual(ran, [], "shortlist failed, so score must not run");
      assert.equal((await job(SHORTLIST_JOB)).status, "pending");

      gh.contentError = null;
      await pool.query("UPDATE jobs SET run_after = $1 WHERE name = 'shortlist'", [at()]);
      await runWorker({ db: pool, handlers, caps: { defaultPerName: 5 }, once: true, now: at });
      assert.equal((await job(SHORTLIST_JOB)).status, "ok");
      assert.deepEqual(ran, ["score"]);
    });
  });

  describe("claim after runWorker leaves nothing stuck", () => {
    it("no job is left running after a pass", async () => {
      await once({ a: { sourceId: null, run: async () => {} } });
      assert.equal(await claimNext(pool, { defaultPerName: 5 }, NOW), null);
      assert.equal((await jobs()).filter((j) => j.status === "running").length, 0);
    });
  });
});

describe("worker plan (no database)", () => {
  const fakes = [
    new FakeConnector("ossinsight", [], Infinity, { perHour: 600, concurrency: 2 }),
    new FakeConnector("github_trending", []),
    new GhArchiveConnector(),
    new GithubApiConnector("tok", true),
  ];

  it("gh_archive is hourly; everything else daily, with score and resolve_pending", () => {
    const schedule = buildSchedule(buildHandlers({ connectors: fakes }));
    assert.deepEqual(schedule.hourly, ["gh_archive"]);
    assert.deepEqual([...schedule.daily].sort(), ["github_trending", "ossinsight", "resolve_pending", "score", "shortlist"]);
  });

  it("a failed ROLLBACK is logged at warn level and the original error is rethrown", async () => {
    const logs: string[] = [];
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql === "ROLLBACK") throw new Error("connection terminated");
        return { rows: [] };
      },
      release: () => statements.push("release"),
    };
    const db = { connect: async () => client } as unknown as Pool;
    const handlers = buildHandlers({
      connectors: [new FakeConnector("ossinsight", ["a"], 0)],
      log: (l) => logs.push(l),
    });
    await assert.rejects(
      handlers.ossinsight!.run({ db, job: { id: 7 } as Job, now: NOW }),
      /upstream broke/,
    );
    assert.deepEqual(statements, ["BEGIN", "ROLLBACK", "release"]);
    assert.equal(logs.length, 1);
    const line = JSON.parse(logs[0]!) as Record<string, unknown>;
    assert.equal(line.level, "warn");
    assert.equal(line.job, "ossinsight");
    assert.equal(line.jobId, 7);
    assert.match(String(line.error), /connection terminated/);
    assert.match(String(line.message), /ROLLBACK failed/);
  });

  it("per-name caps come from rateLimit.concurrency; gh_archive is 1; global defaults to 20 and reads WORKER_MAX_CONCURRENCY", () => {
    const caps = buildCaps(fakes, {});
    assert.equal(caps.global, 20);
    assert.deepEqual(caps.perName, { gh_archive: 1, shortlist: 1, score: 1, ossinsight: 2, github_trending: 1, resolve_pending: 10 });
    assert.equal(caps.timeoutMs?.gh_archive, 6 * 3_600_000);
    assert.equal(caps.timeoutMs?.shortlist, 6 * 3_600_000);
    assert.equal(buildCaps(fakes, { WORKER_MAX_CONCURRENCY: "7" }).global, 7);
    assert.equal(buildCaps(fakes, { WORKER_MAX_CONCURRENCY: "abc" }).global, 20);
  });
});
