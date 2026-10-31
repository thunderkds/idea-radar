import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { applyConsensus, applyMigrations, scoreDay } from "./index.js";

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

// Scoring 2026-10-31 uses the last complete day E = 2026-10-30; the consensus window is
// [2026-10-24T00:00Z, 2026-10-31T00:00Z).
const DATE = "2026-10-31";
const E = "2026-10-30";

interface ScoreRow {
  repo_id: number;
  tier: string;
  score: number;
  components: Record<string, number>;
  consensus_count: number;
}

describe("applyConsensus and repo_source_first_seen (needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;

  const score = (repoId: number, tier: string, value: number, date = DATE) =>
    pool.query("INSERT INTO repo_scores (repo_id, date, tier, score) VALUES ($1, $2, $3, $4)", [repoId, date, tier, value]);
  const signal = (repoId: number, source: string, observedAt: string) =>
    pool.query("INSERT INTO signals (repo_id, source, signal_type, observed_at) VALUES ($1, $2, 'x', $3)", [
      repoId, source, observedAt,
    ]);
  const rows = async (date = DATE) =>
    new Map(
      (await pool.query<ScoreRow>("SELECT * FROM repo_scores WHERE date = $1 ORDER BY repo_id", [date])).rows.map((r) => [r.repo_id, r]),
    );

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
    const { rows: r } = await pool.query<{ s: string }>("SELECT current_schema() AS s");
    assert.equal(r[0]!.s, schema, "refusing to truncate outside the throwaway schema");
    await pool.query("TRUNCATE repo_scores, repo_daily, signals, repos, repo_content, sources");
  });

  describe("consensus_count (AC 2)", () => {
    it("counts distinct sources, displayable or not, once each however many signals; no signal gives 0", async () => {
      await pool.query(
        "INSERT INTO sources (id, name, displayable) VALUES ('github_trending','GT',TRUE),('ossinsight','OI',TRUE),('trendshift','TS',FALSE)",
      );
      for (const id of [1, 2, 3]) await score(id, "medium", 1);
      await signal(1, "github_trending", `${E}T10:00:00Z`);
      await signal(1, "github_trending", `${E}T11:00:00Z`); // same source twice
      await signal(1, "ossinsight", `${E}T10:00:00Z`);
      await signal(1, "trendshift", `${E}T10:00:00Z`); // hidden, still counted here
      await signal(2, "mystery", `${E}T10:00:00Z`); // not in `sources`, still counted
      const res = await applyConsensus(pool, DATE);
      assert.deepEqual(res, { updated: 3, boosted: 0 });
      const r = await rows();
      assert.equal(r.get(1)!.consensus_count, 3);
      assert.equal(r.get(2)!.consensus_count, 1);
      assert.equal(r.get(3)!.consensus_count, 0);
    });

    it("window edges: first instant of day E-6 counts, one second earlier and the next day's midnight do not", async () => {
      for (const id of [1, 2, 3, 4]) await score(id, "lowkey", 1);
      await signal(1, "a", "2026-10-24T00:00:00Z");
      await signal(2, "a", "2026-10-23T23:59:59Z");
      await signal(3, "a", "2026-10-30T23:59:59Z");
      await signal(4, "a", "2026-10-31T00:00:00Z");
      await applyConsensus(pool, DATE);
      const r = await rows();
      assert.deepEqual([1, 2, 3, 4].map((id) => r.get(id)!.consensus_count), [1, 0, 1, 0]);
    });

    it("windowEnd moves the window earlier when the last ingested day lags, and is ignored when later", async () => {
      await score(1, "lowkey", 1);
      await signal(1, "a", "2026-10-27T10:00:00Z"); // inside the window ending 2026-10-28
      await signal(1, "b", "2026-10-29T10:00:00Z"); // after it
      await applyConsensus(pool, DATE, { windowEnd: "2026-10-28" });
      assert.equal((await rows()).get(1)!.consensus_count, 1);
      await applyConsensus(pool, DATE, { windowEnd: "2026-11-05" });
      assert.equal((await rows()).get(1)!.consensus_count, 2, "a later windowEnd is ignored");
    });

    it("only touches the given date and resets a stale count", async () => {
      await score(1, "lowkey", 1);
      await score(1, "lowkey", 1, "2026-10-30");
      await pool.query("UPDATE repo_scores SET consensus_count = 9");
      await signal(1, "a", `${E}T10:00:00Z`);
      await applyConsensus(pool, DATE);
      assert.equal((await rows()).get(1)!.consensus_count, 1);
      assert.equal((await rows("2026-10-30")).get(1)!.consensus_count, 9);
    });
  });

  describe("trending boost (AC 3)", () => {
    it("trending score is multiplied by 1 + 0.1 x (count - 1) and the factor is recorded; medium and lowkey are unchanged", async () => {
      await score(1, "trending", 100);
      await score(2, "trending", 100);
      await score(3, "trending", 100);
      await score(4, "medium", 100);
      await score(5, "lowkey", 100);
      for (const [id, sources] of [[1, 3], [2, 1], [4, 3], [5, 3]] as const) {
        for (let i = 0; i < sources; i++) await signal(id, `s${i}`, `${E}T10:00:00Z`);
      }
      const res = await applyConsensus(pool, DATE);
      assert.deepEqual(res, { updated: 5, boosted: 1 });
      const r = await rows();
      assert.equal(r.get(1)!.score, 120);
      assert.equal(r.get(1)!.components.consensusBoost, 1.2);
      assert.equal(r.get(1)!.consensus_count, 3);
      assert.equal(r.get(2)!.score, 100, "one source is no boost");
      assert.equal(r.get(2)!.components.consensusBoost, 1);
      assert.equal(r.get(3)!.score, 100, "no signal is no boost, never below 1");
      assert.equal(r.get(3)!.components.consensusBoost, 1);
      for (const id of [4, 5]) {
        assert.equal(r.get(id)!.score, 100);
        assert.equal(r.get(id)!.consensus_count, 3);
        assert.ok(!("consensusBoost" in r.get(id)!.components), "boost is trending only");
      }
    });

    it("runs right after scoreDay: a scored trending repo gets its count and boosted score; scoreDay again resets it", async () => {
      await pool.query("INSERT INTO repos (repo_id, full_name, stars, pushed_at) VALUES (1, 'o/r1', 3000, $1)", [`${E}T12:00:00Z`]);
      await pool.query("INSERT INTO repo_daily (repo_id, date, stars_new) VALUES (1, $1, 50)", [E]);
      await signal(1, "github_trending", `${E}T01:00:00Z`);
      await signal(1, "ossinsight", `${E}T02:00:00Z`);
      await scoreDay(pool, DATE);
      const base = (await rows()).get(1)!;
      assert.equal(base.tier, "trending");
      assert.equal(base.consensus_count, 0);
      await applyConsensus(pool, DATE);
      const boosted = (await rows()).get(1)!;
      assert.equal(boosted.consensus_count, 2);
      assert.equal(boosted.score, Number((base.score * 1.1).toFixed(6)));
      await scoreDay(pool, DATE);
      assert.equal((await rows()).get(1)!.score, base.score, "scoreDay rewrites the unboosted score");
    });
  });

  describe("repo_source_first_seen (AC 1)", () => {
    it("has one row per repo and source with first and last seen and the signal count", async () => {
      await signal(1, "a", "2026-10-01T10:00:00Z");
      await signal(1, "a", "2026-10-20T10:00:00Z");
      await signal(1, "a", "2026-10-10T10:00:00Z");
      await signal(1, "b", "2026-10-15T10:00:00Z");
      await signal(2, "a", "2026-10-05T10:00:00Z");
      const { rows: v } = await pool.query(
        "SELECT repo_id, source, first_seen_at, last_seen_at, signals FROM repo_source_first_seen ORDER BY repo_id, source",
      );
      assert.deepEqual(
        v.map((r) => [r.repo_id, r.source, r.first_seen_at.toISOString(), r.last_seen_at.toISOString(), r.signals]),
        [
          [1, "a", "2026-10-01T10:00:00.000Z", "2026-10-20T10:00:00.000Z", 3],
          [1, "b", "2026-10-15T10:00:00.000Z", "2026-10-15T10:00:00.000Z", 1],
          [2, "a", "2026-10-05T10:00:00.000Z", "2026-10-05T10:00:00.000Z", 1],
        ],
      );
    });

    it("is a view, so a later signal is visible at once", async () => {
      await signal(1, "a", "2026-10-05T10:00:00Z");
      await signal(1, "a", "2026-10-01T10:00:00Z");
      const { rows: v } = await pool.query("SELECT first_seen_at FROM repo_source_first_seen WHERE repo_id = 1");
      assert.equal(v[0].first_seen_at.toISOString(), "2026-10-01T10:00:00.000Z");
    });
  });
});
