import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import pg from "pg";
import type { Repo, Signal, SourceConnector } from "@idea-radar/core";
import { GhArchiveConnector, GithubApiConnector } from "@idea-radar/connectors";
import { applyMigrations, claimNext, enqueueDue, MAX_JOB_ATTEMPTS } from "@idea-radar/db";
import { buildCaps, buildHandlers, buildSchedule, RESOLVE_PENDING_JOB } from "./handlers.js";
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
      "TRUNCATE jobs, repos, repo_daily, signals, sources, pending_signals, ingest_cursors",
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
      assert.deepEqual((await jobs()).map((j) => j.name).sort(), ["on", "score"]);
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

    it("score is a placeholder with no source row", async () => {
      await once(ctx([]));
      assert.equal((await job("score")).status, "ok");
      assert.equal(await count("sources"), 0);
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
    assert.deepEqual([...schedule.daily].sort(), ["github_trending", "ossinsight", "resolve_pending", "score"]);
  });

  it("per-name caps come from rateLimit.concurrency; gh_archive is 1; global defaults to 20 and reads WORKER_MAX_CONCURRENCY", () => {
    const caps = buildCaps(fakes, {});
    assert.equal(caps.global, 20);
    assert.deepEqual(caps.perName, { gh_archive: 1, score: 1, ossinsight: 2, github_trending: 1, resolve_pending: 10 });
    assert.equal(caps.timeoutMs?.gh_archive, 6 * 3_600_000);
    assert.equal(buildCaps(fakes, { WORKER_MAX_CONCURRENCY: "7" }).global, 7);
    assert.equal(buildCaps(fakes, { WORKER_MAX_CONCURRENCY: "abc" }).global, 20);
  });
});
