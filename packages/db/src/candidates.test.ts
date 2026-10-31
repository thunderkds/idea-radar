import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { candidateConfig } from "@idea-radar/core";
import { applyMigrations, listCandidates, selectCandidates } from "./index.js";

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

// Recent window for DATE = 2026-10-24..2026-10-30; baseline window = 2026-08-02..2026-10-23 (83 days).
const DATE = "2026-10-30";

describe("candidate selection (needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;

  const stars = (repoId: number, date: string, starsNew: number) =>
    pool.query("INSERT INTO repo_daily (repo_id, date, stars_new) VALUES ($1, $2, $3)", [repoId, date, starsNew]);
  const signal = (repoId: number, source: string, observedAt: string) =>
    pool.query(
      "INSERT INTO signals (repo_id, source, signal_type, observed_at) VALUES ($1, $2, 'trending_rank', $3)",
      [repoId, source, observedAt],
    );
  const rows = async (date = DATE) =>
    (
      await pool.query<{ repo_id: number; reason: string; priority: number }>(
        "SELECT repo_id, reason, priority FROM candidates WHERE date = $1 ORDER BY repo_id",
        [date],
      )
    ).rows;

  before(async () => {
    admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 4 });
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
    await pool.query("TRUNCATE candidates, repo_daily, signals, repos");
  });

  describe("velocity reason", () => {
    it("picks a repo with no prior history once it reaches minStars7d, priority = 7-day stars (AC 3, 5, 8)", async () => {
      await stars(1, "2026-10-24", 2); // first day of the window: counted
      await stars(1, "2026-10-30", 2); // last day of the window: counted
      const res = await selectCandidates(pool, DATE);
      assert.deepEqual(res, { selected: 1, byReason: { velocity: 1 } });
      assert.deepEqual(await rows(), [{ repo_id: 1, reason: "velocity", priority: 4 }]);
    });

    it("skips a repo under minStars7d, and ignores stars outside the 7-day window", async () => {
      await stars(2, "2026-10-30", 2); // 2 < 3
      await stars(3, "2026-10-23", 50); // one day before the window; only baseline
      await stars(4, "2026-10-31", 50); // after the date
      assert.equal((await selectCandidates(pool, DATE)).selected, 0);
    });

    it("needs a 7-day daily rate strictly above the repo's own prior-83-day rate", async () => {
      // Baseline 830 stars / 83 days = 10 a day. Recent 70 = exactly 10 a day: not above.
      await stars(5, "2026-08-02", 830);
      await stars(5, "2026-10-30", 70);
      // Same baseline, recent 77 = 11 a day: above. Priority 77 / (10 * 7 + 1).
      await stars(6, "2026-10-01", 830);
      await stars(6, "2026-10-30", 77);
      // Baseline stars just outside the 83-day window (2026-08-01) do not count, so this repo has no history.
      await stars(7, "2026-08-01", 9999);
      await stars(7, "2026-10-30", 3);
      const res = await selectCandidates(pool, DATE);
      assert.deepEqual(res.byReason, { velocity: 2 });
      const got = await rows();
      assert.deepEqual(
        got.map((r) => r.repo_id),
        [6, 7],
      );
      assert.ok(Math.abs(got[0]!.priority - 77 / 71) < 1e-9);
      assert.equal(got[1]!.priority, 3);
    });
  });

  describe("signal reason", () => {
    it("picks a repo with a non-github_api signal in the 7 days ending at the date (AC 4)", async () => {
      await signal(10, "ossinsight", "2026-10-24T00:00:00Z"); // first instant of the window
      await signal(11, "github_trending", "2026-10-30T23:59:59Z"); // last instant of the window
      await signal(12, "github_api", "2026-10-28T10:00:00Z"); // own source: not a candidate signal
      await signal(13, "ossinsight", "2026-10-23T23:59:59Z"); // too old
      await signal(14, "ossinsight", "2026-10-31T00:00:00Z"); // after the date
      const res = await selectCandidates(pool, DATE);
      assert.deepEqual(res, { selected: 2, byReason: { signal: 2 } });
      assert.deepEqual(
        (await rows()).map((r) => [r.repo_id, r.reason, r.priority]),
        [
          [10, "signal", 0],
          [11, "signal", 0],
        ],
      );
    });

    it("labels a repo that has both a signal and velocity as signal, with its velocity priority", async () => {
      await stars(20, "2026-10-29", 6);
      await signal(20, "ossinsight", "2026-10-29T10:00:00Z");
      assert.deepEqual(await selectCandidates(pool, DATE), { selected: 1, byReason: { signal: 1 } });
      assert.deepEqual(await rows(), [{ repo_id: 20, reason: "signal", priority: 6 }]);
    });

    it("gives a signal repo with fewer than minStars7d stars its real 7-day priority", async () => {
      await stars(21, "2026-10-29", 2);
      await signal(21, "trendshift", "2026-10-29T10:00:00Z");
      await selectCandidates(pool, DATE);
      assert.deepEqual(await rows(), [{ repo_id: 21, reason: "signal", priority: 2 }]);
    });
  });

  describe("cap and order", () => {
    it("keeps the highest priority first, signals first on ties, and at most cap rows (AC 5)", async () => {
      await stars(30, "2026-10-30", 10); // velocity, priority 10
      await stars(31, "2026-10-30", 20); // velocity, priority 20
      await stars(32, "2026-10-30", 10); // signal, priority 10: wins the tie against 30
      await signal(32, "ossinsight", "2026-10-30T01:00:00Z");
      await stars(33, "2026-10-30", 3); // velocity, priority 3: cut
      const res = await selectCandidates(pool, DATE, { ...candidateConfig, cap: 3 });
      assert.deepEqual(res, { selected: 3, byReason: { velocity: 2, signal: 1 } });
      assert.deepEqual(
        (await rows()).map((r) => r.repo_id),
        [30, 31, 32],
      );
      assert.deepEqual(await listCandidates(pool, DATE, {}), [31, 32, 30]);
    });

    it("defaults the cap to candidateConfig.cap (5,000)", () => {
      assert.equal(candidateConfig.cap, 5000);
    });
  });

  describe("storage", () => {
    it("is idempotent: the same date twice gives the same rows (AC 2, 8)", async () => {
      await stars(40, "2026-10-30", 5);
      await signal(41, "ossinsight", "2026-10-30T01:00:00Z");
      const first = await selectCandidates(pool, DATE);
      const before = await rows();
      assert.deepEqual(await selectCandidates(pool, DATE), first);
      assert.deepEqual(await rows(), before);
      assert.equal(before.length, 2);
    });

    it("replaces the date's rows with the new list and leaves other dates alone", async () => {
      await pool.query("INSERT INTO candidates (date, repo_id, reason, priority) VALUES ('2026-10-29', 99, 'signal', 1)");
      await pool.query("INSERT INTO candidates (date, repo_id, reason, priority) VALUES ($1, 98, 'signal', 1)", [DATE]);
      await stars(42, "2026-10-30", 5);
      await selectCandidates(pool, DATE);
      assert.deepEqual(
        (await rows()).map((r) => r.repo_id),
        [42],
      );
      assert.deepEqual(
        (await rows("2026-10-29")).map((r) => r.repo_id),
        [99],
      );
    });

    it("keeps the previous list when the new insert fails (one transaction)", async () => {
      await stars(43, "2026-10-30", 5);
      await selectCandidates(pool, DATE);
      await assert.rejects(selectCandidates(pool, DATE, { ...candidateConfig, cap: -1 }));
      assert.deepEqual(
        (await rows()).map((r) => r.repo_id),
        [43],
      );
    });

    it("works on a client the caller checked out, and releases nothing it does not own", async () => {
      await stars(44, "2026-10-30", 5);
      const client = await pool.connect();
      try {
        assert.equal((await selectCandidates(client, DATE)).selected, 1);
        await client.query("SELECT 1"); // still usable
      } finally {
        client.release();
      }
    });
  });

  describe("listCandidates", () => {
    it("returns every candidate, or only those without fresh metadata (AC 7)", async () => {
      await stars(50, "2026-10-30", 9); // no repos row
      await stars(51, "2026-10-30", 8); // repos row fetched just now
      await stars(52, "2026-10-30", 7); // repos row older than 7 days
      await stars(53, "2026-10-30", 6); // repos row 6 days old: still fresh
      await pool.query(
        `INSERT INTO repos (repo_id, full_name, updated_at) VALUES
           (51, 'a/b', now()), (52, 'a/c', now() - interval '8 days'), (53, 'a/d', now() - interval '6 days')`,
      );
      await selectCandidates(pool, DATE);
      assert.deepEqual(await listCandidates(pool, DATE, {}), [50, 51, 52, 53]);
      assert.deepEqual(await listCandidates(pool, DATE, { needsMetadata: true }), [50, 52]);
      assert.deepEqual(await listCandidates(pool, "2026-10-29", { needsMetadata: true }), []);
    });
  });
});
