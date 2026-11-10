import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import type { Idea, IdeaFile } from "@idea-radar/ideas";
import type pg from "pg";
import { createPool, getIdea, listIdeas, logRejected, migrate, saveSubmission, searchIdeas, stats } from "./index.js";
import { assertLoopbackDatabaseUrl } from "./util.js";

const url = process.env.TEST_DATABASE_URL;
if (url) assertLoopbackDatabaseUrl(url);
const skip = url
  ? false
  : "TEST_DATABASE_URL is not set: run `pnpm --filter @idea-radar/db test:server` and set TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres";

const idea = (id: string, over: Partial<Idea> = {}): Idea => ({
  id,
  title: `Title of ${id}`,
  summary: `Summary of ${id}`,
  tags: ["cli"],
  signals: [{ kind: "repo", url: "https://github.com/a/b", note: "n" }],
  related_repos: ["a/b"],
  ...over,
});
const file = (date: string, ideas: Idea[], routine = "daily"): IdeaFile => ({
  schema_version: 1,
  date,
  routine,
  ideas,
});

describe("packages/db (needs TEST_DATABASE_URL)", { skip }, () => {
  let pool: pg.Pool;

  const reset = async () => {
    await pool.query("DROP TABLE IF EXISTS ideas, runs, schema_migrations");
    await migrate(pool);
  };
  const rows = async () => (await pool.query("SELECT * FROM ideas ORDER BY id")).rows;
  const runs = async () => (await pool.query("SELECT * FROM runs ORDER BY id")).rows;

  before(async () => {
    pool = createPool(url!);
    await reset();
  });
  after(async () => {
    await pool.end();
  });

  test("migrate twice: tables exist, the second run applies nothing", async () => {
    await pool.query("DROP TABLE IF EXISTS ideas, runs, schema_migrations");
    assert.deepEqual(await migrate(pool), ["001_ideas.sql"]);
    assert.deepEqual(await migrate(pool), []);
    const t = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('ideas','runs','schema_migrations') ORDER BY 1",
    );
    assert.deepEqual(
      t.rows.map((r) => r.table_name),
      ["ideas", "runs", "schema_migrations"],
    );
    const m = await pool.query("SELECT name FROM schema_migrations");
    assert.deepEqual(
      m.rows.map((r) => r.name),
      ["001_ideas.sql"],
    );
  });

  test("a newer date replaces content and keeps first_seen", async () => {
    await reset();
    await saveSubmission(pool, file("2026-11-09", [idea("a", { title: "Old title", tags: ["old"] })]));
    await saveSubmission(pool, file("2026-11-10", [idea("a", { title: "New title", tags: ["new"], why_now: "now" })]));
    const got = await getIdea(pool, "a");
    assert.equal(got?.title, "New title");
    assert.deepEqual(got?.tags, ["new"]);
    assert.equal(got?.why_now, "now");
    assert.equal(got?.first_seen, "2026-11-09");
    assert.equal(got?.last_seen, "2026-11-10");
  });

  test("an older date only widens first_seen; content stays", async () => {
    await reset();
    await saveSubmission(pool, file("2026-11-10", [idea("a", { title: "Newest" })]));
    await saveSubmission(pool, file("2026-11-08", [idea("a", { title: "Stale" })]));
    const got = await getIdea(pool, "a");
    assert.equal(got?.title, "Newest");
    assert.equal(got?.first_seen, "2026-11-08");
    assert.equal(got?.last_seen, "2026-11-10");
  });

  test("the same date replaces: the later submission wins", async () => {
    await reset();
    await saveSubmission(pool, file("2026-11-10", [idea("a", { title: "First" })]));
    await saveSubmission(pool, file("2026-11-10", [idea("a", { title: "Second" })]));
    assert.equal((await getIdea(pool, "a"))?.title, "Second");
  });

  test("an idea sent without why_now clears an older why_now when newer", async () => {
    await reset();
    await saveSubmission(pool, file("2026-11-09", [idea("a", { why_now: "was" })]));
    await saveSubmission(pool, file("2026-11-10", [idea("a")]));
    assert.equal((await getIdea(pool, "a"))?.why_now, undefined);
  });

  test("sending the same submission twice leaves ideas identical, adds a run row", async () => {
    await reset();
    const f = file("2026-11-10", [idea("a"), idea("b", { why_now: "x" })]);
    await saveSubmission(pool, f);
    const before = await rows();
    await saveSubmission(pool, f);
    assert.deepEqual(await rows(), before);
    const r = await runs();
    assert.equal(r.length, 2);
    assert.deepEqual(
      r.map((x) => [x.status, x.idea_count, x.routine]),
      [
        ["ok", 2, "daily"],
        ["ok", 2, "daily"],
      ],
    );
  });

  test("an empty submission writes only a run row", async () => {
    await reset();
    await saveSubmission(pool, file("2026-11-10", []));
    assert.equal((await rows()).length, 0);
    const r = await runs();
    assert.equal(r.length, 1);
    assert.equal(r[0].idea_count, 0);
  });

  test("a failure mid-transaction writes no idea rows and no run row", async () => {
    await reset();
    // Postgres text cannot hold NUL: the second idea fails after the first was already upserted.
    const bad = file("2026-11-10", [idea("a"), idea("b", { title: "bad\u0000title" })]);
    await assert.rejects(saveSubmission(pool, bad));
    assert.equal((await rows()).length, 0);
    assert.equal((await runs()).length, 0);
  });

  test("concurrent submissions of the same ids in opposite order do not deadlock", async () => {
    await reset();
    const ids = Array.from({ length: 30 }, (_, i) => `c${String(i).padStart(2, "0")}`);
    const fwd = file(
      "2026-11-10",
      ids.map((id) => idea(id, { title: "fwd" })),
    );
    const rev = file(
      "2026-11-10",
      [...ids].reverse().map((id) => idea(id, { title: "rev" })),
    );
    await Promise.all([saveSubmission(pool, fwd), saveSubmission(pool, rev)]);
    const got = await rows();
    assert.equal(got.length, 30);
    assert.equal(new Set(got.map((r) => r.title)).size, 1, "each submission lands whole, never interleaved");
    assert.equal((await runs()).length, 2);
  });

  test("logRejected inserts a rejected run row only", async () => {
    await reset();
    await logRejected(pool, { date: "2026-11-10", routine: "daily", error: "/ideas/0/id bad" });
    await logRejected(pool, { date: "2026-02-31", error: "x".repeat(10_000) });
    await logRejected(pool, { error: "not json" });
    assert.equal((await rows()).length, 0);
    const r = await runs();
    assert.deepEqual(
      r.map((x) => x.status),
      ["rejected", "rejected", "rejected"],
    );
    assert.equal(r[0].idea_count, 0);
    assert.equal(r[1].date, null, "an impossible date is stored as NULL, not an error");
    assert.ok(r[1].error.length <= 2000);
    assert.equal(r[2].routine, null);
  });

  describe("reads", () => {
    before(async () => {
      await reset();
      await saveSubmission(
        pool,
        file("2026-11-08", [
          idea("alpha", { title: "Alpha tracker", tags: ["rust", "cli"], summary: "tracks things" }),
          idea("beta", { title: "Beta", tags: ["web"], summary: "Mentions Alpha inside", why_now: "100% growth_rate" }),
        ]),
      );
      await saveSubmission(
        pool,
        file("2026-11-10", [
          idea("gamma", { title: "Gamma", tags: ["cli"], summary: "g", why_now: 'o\'brien "quoted"' }),
        ]),
      );
    });

    test("listIdeas: newest last_seen first, ties by id", async () => {
      const all = await listIdeas(pool, { limit: 10 });
      assert.deepEqual(
        all.map((i) => i.id),
        ["gamma", "alpha", "beta"],
      );
      assert.equal(all[0].last_seen, "2026-11-10");
      assert.equal(typeof all[0].updated_at, "string");
    });

    test("listIdeas: tag (case-insensitive), since/until and limit", async () => {
      assert.deepEqual(
        (await listIdeas(pool, { tag: "CLI", limit: 10 })).map((i) => i.id),
        ["gamma", "alpha"],
      );
      assert.deepEqual(
        (await listIdeas(pool, { since: "2026-11-09", limit: 10 })).map((i) => i.id),
        ["gamma"],
      );
      assert.deepEqual(
        (await listIdeas(pool, { until: "2026-11-09", limit: 10 })).map((i) => i.id),
        ["alpha", "beta"],
      );
      assert.equal((await listIdeas(pool, { limit: 1 })).length, 1);
    });

    test("searchIdeas: title matches first, case-insensitive, over title/summary/tags/why_now", async () => {
      assert.deepEqual(
        (await searchIdeas(pool, "ALPHA", 10)).map((i) => i.id),
        ["alpha", "beta"],
      );
      assert.deepEqual(
        (await searchIdeas(pool, "rust", 10)).map((i) => i.id),
        ["alpha"],
      );
      assert.deepEqual(
        (await searchIdeas(pool, "growth", 10)).map((i) => i.id),
        ["beta"],
      );
    });

    test("searchIdeas: %, _, quotes and SQL are plain text", async () => {
      assert.deepEqual(
        (await searchIdeas(pool, "100%", 10)).map((i) => i.id),
        ["beta"],
      );
      assert.deepEqual(
        (await searchIdeas(pool, "%", 10)).map((i) => i.id),
        ["beta"],
        "a lone % is not 'match all'",
      );
      assert.deepEqual(
        (await searchIdeas(pool, "growth_rate", 10)).map((i) => i.id),
        ["beta"],
      );
      assert.deepEqual(
        (await searchIdeas(pool, "growth-rate", 10)).map((i) => i.id),
        [],
      );
      assert.deepEqual(
        (await searchIdeas(pool, "growth_rat_", 10)).map((i) => i.id),
        [],
        "_ is not a wildcard",
      );
      assert.deepEqual(
        (await searchIdeas(pool, 'o\'brien "quoted"', 10)).map((i) => i.id),
        ["gamma"],
      );
      assert.deepEqual(await searchIdeas(pool, "'; DROP TABLE ideas; --", 10), []);
      assert.deepEqual(await searchIdeas(pool, "   ", 10), []);
      assert.equal((await rows()).length, 3, "ideas table intact");
    });

    test("getIdea returns the full idea or null", async () => {
      const got = await getIdea(pool, "alpha");
      assert.deepEqual(got?.signals, [{ kind: "repo", url: "https://github.com/a/b", note: "n" }]);
      assert.deepEqual(got?.related_repos, ["a/b"]);
      assert.deepEqual(got?.tags, ["rust", "cli"]);
      assert.equal(await getIdea(pool, "nope"), null);
    });

    test("stats: counts and last run time", async () => {
      const s = await stats(pool);
      assert.equal(s.ideas, 3);
      assert.equal(s.runs, 2);
      assert.match(s.last_run ?? "", /^\d{4}-\d{2}-\d{2}T/);
      await reset();
      assert.deepEqual(await stats(pool), { ideas: 0, runs: 0, last_run: null });
    });
  });

  test("10,000 ideas: list, search and get each answer in under 1 s", async () => {
    await reset();
    // Seed through the real upsert path, 100 ideas per submission (the schema's maximum).
    const words = ["radar", "agent", "payments", "weather", "kernel", "garden", "pixel", "ledger", "orbit", "quartz"];
    for (let b = 0; b < 100; b++) {
      const ideas = Array.from({ length: 100 }, (_, k) => {
        const n = b * 100 + k;
        const w = words[n % words.length];
        return idea(`idea-${n}`, {
          title: `${w} helper number ${n}`,
          summary: `A ${w} tool for people who like ${words[(n + 3) % words.length]} (item ${n})`,
          tags: [w, `t${n % 50}`],
        });
      });
      await saveSubmission(pool, file(`2026-0${1 + (b % 9)}-1${b % 9}`, ideas));
    }
    assert.equal((await stats(pool)).ideas, 10_000);

    const timed = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
      const t0 = performance.now();
      const out = await fn();
      const ms = performance.now() - t0;
      console.log(`  [10k] ${label}: ${ms.toFixed(1)} ms`);
      assert.ok(ms < 1000, `${label} took ${ms} ms`);
      return out;
    };
    assert.equal((await timed("list (limit 50)", () => listIdeas(pool, { limit: 50 }))).length, 50);
    assert.ok((await timed("list (tag t7)", () => listIdeas(pool, { tag: "t7", limit: 50 }))).length > 0);
    assert.equal((await timed("search 'quartz'", () => searchIdeas(pool, "quartz", 50))).length, 50);
    assert.equal((await timed("search 'item 9999'", () => searchIdeas(pool, "item 9999", 50))).length, 1);
    assert.equal((await timed("get idea-5000", () => getIdea(pool, "idea-5000")))?.id, "idea-5000");
  });
});
