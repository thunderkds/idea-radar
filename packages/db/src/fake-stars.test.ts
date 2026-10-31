import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { fakeStarConfig, type StargazerAccount } from "@idea-radar/core";
import { applyFakeStarFlags, applyMigrations, scoreDay, type StargazerSampler } from "./index.js";

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

// Scoring 2026-10-31 uses the last complete day E = 2026-10-30; the 7-day window is (2026-10-23, E].
const DATE = "2026-10-31";
const E = "2026-10-30";
const dayBefore = (days: number) => new Date(Date.parse(`${E}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

const STARRED = "2026-10-30T12:00:00Z";
/** `bad` of `total` accounts are brand new (low-activity); the rest are old and active. */
function sample(total: number, bad: number): StargazerAccount[] {
  return Array.from({ length: total }, (_, i) => ({
    starredAt: STARRED,
    createdAt: i < bad ? "2026-10-29T00:00:00Z" : "2020-01-01T00:00:00Z",
    publicRepos: 3,
    followers: 3,
    contributions: 30,
  }));
}

interface ScoreRow {
  repo_id: number;
  tier: string;
  score: number;
  components: Record<string, number>;
  fake_star_flag: boolean;
}

describe("applyFakeStarFlags (needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;

  /** A `repo_scores` row for DATE and a `repo_daily` row with the given hourly peak. */
  const seed = async (repoId: number, tier: string, score: number, maxHour: number, daysBack = 1) => {
    await pool.query("INSERT INTO repo_scores (repo_id, date, tier, score, components) VALUES ($1, $2, $3, $4, '{\"stars7d\": 7}')", [
      repoId, DATE, tier, score,
    ]);
    await pool.query("INSERT INTO repo_daily (repo_id, date, stars_new, stars_max_hour) VALUES ($1, $2, 100, $3)", [
      repoId, dayBefore(daysBack - 1), maxHour,
    ]);
  };
  const rows = async () =>
    new Map(
      (await pool.query<ScoreRow>("SELECT * FROM repo_scores WHERE date = $1 ORDER BY repo_id", [DATE])).rows.map((r) => [r.repo_id, r]),
    );

  /** Fake sampler: records each call and answers from `samples` (a missing id answers an empty sample). */
  function fake(samples: Record<number, StargazerAccount[]>) {
    const calls: [number, number][] = [];
    const sampler: StargazerSampler = async (id, n) => {
      calls.push([id, n]);
      return samples[id] ?? [];
    };
    return { calls, sampler };
  }

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
    await pool.query("TRUNCATE repo_scores, repo_daily, signals, repos, repo_content");
  });

  it("burst + suspicious sample: flagged, score discounted by the share, components explain it (AC 3, 6)", async () => {
    await seed(1, "trending", 1000, 60);
    await seed(2, "lowkey", 2, 50);
    const { calls, sampler } = fake({ 1: sample(100, 80), 2: sample(10, 5) });
    const res = await applyFakeStarFlags(pool, DATE, sampler);
    assert.deepEqual(res, { checked: 2, flagged: 2 });
    assert.deepEqual(calls, [[1, fakeStarConfig.sampleSize], [2, fakeStarConfig.sampleSize]]);
    const r = await rows();
    assert.equal(r.get(1)!.fake_star_flag, true);
    assert.equal(r.get(1)!.score, 200); // 1000 * (1 - 0.8)
    assert.equal(r.get(1)!.components.fakeStarShare, 0.8);
    assert.equal(r.get(1)!.components.fakeStarSampled, 100);
    assert.equal(r.get(1)!.components.stars7d, 7, "existing components are kept");
    assert.equal(r.get(2)!.fake_star_flag, true, "exactly the flag share flags");
    assert.equal(r.get(2)!.score, 1);
  });

  it("burst + healthy sample: not flagged, score unchanged, share still recorded", async () => {
    await seed(3, "trending", 500, 80);
    const res = await applyFakeStarFlags(pool, DATE, fake({ 3: sample(100, 49) }).sampler);
    assert.deepEqual(res, { checked: 1, flagged: 0 });
    const row = (await rows()).get(3)!;
    assert.equal(row.fake_star_flag, false);
    assert.equal(row.score, 500);
    assert.equal(row.components.fakeStarShare, 0.49);
  });

  it("no burst: never sampled (49 stars an hour, or a burst outside the 7-day window)", async () => {
    await seed(4, "trending", 500, 49);
    await seed(5, "trending", 500, 500, 8); // peak 7 days back: outside (E-7, E]
    const { calls, sampler } = fake({ 4: sample(10, 10), 5: sample(10, 10) });
    assert.deepEqual(await applyFakeStarFlags(pool, DATE, sampler), { checked: 0, flagged: 0 });
    assert.deepEqual(calls, []);
    assert.equal([...(await rows()).values()].filter((r) => r.fake_star_flag).length, 0);
  });

  it("burst exactly at the threshold, on the first and last day of the window, is checked", async () => {
    await seed(6, "trending", 100, fakeStarConfig.burstStarsPerHour, 7); // E-6, first day of the window
    await seed(7, "trending", 100, fakeStarConfig.burstStarsPerHour, 1); // E
    const { calls, sampler } = fake({});
    await applyFakeStarFlags(pool, DATE, sampler);
    assert.deepEqual(calls.map((c) => c[0]), [6, 7]);
  });

  it("medium is flagged but its score is not discounted (AC 3, 6)", async () => {
    await seed(8, "medium", 0.4, 90);
    const res = await applyFakeStarFlags(pool, DATE, fake({ 8: sample(100, 100) }).sampler);
    assert.deepEqual(res, { checked: 1, flagged: 1 });
    const row = (await rows()).get(8)!;
    assert.equal(row.fake_star_flag, true);
    assert.equal(row.score, 0.4);
    assert.equal(row.tier, "medium");
  });

  it("a flagged repo stays listed: row kept, tier unchanged (AC 5)", async () => {
    await seed(9, "lowkey", 3, 70);
    await applyFakeStarFlags(pool, DATE, fake({ 9: sample(20, 20) }).sampler);
    const row = (await rows()).get(9)!;
    assert.equal(row.tier, "lowkey");
    assert.equal(row.fake_star_flag, true);
    assert.equal(row.score, 0, "a share of 1 discounts the score to 0, it does not delete the row");
  });

  it("an empty sample is checked but neither flagged nor changed", async () => {
    await seed(10, "trending", 300, 70);
    assert.deepEqual(await applyFakeStarFlags(pool, DATE, fake({}).sampler), { checked: 1, flagged: 0 });
    const row = (await rows()).get(10)!;
    assert.equal(row.score, 300);
    assert.equal(row.components.fakeStarShare, undefined);
  });

  it("only touches the given date's rows", async () => {
    await seed(11, "trending", 300, 70);
    await pool.query("INSERT INTO repo_scores (repo_id, date, tier, score) VALUES (11, '2026-10-30', 'trending', 50)");
    await applyFakeStarFlags(pool, DATE, fake({ 11: sample(10, 10) }).sampler);
    const old = await pool.query<ScoreRow>("SELECT * FROM repo_scores WHERE date = '2026-10-30'");
    assert.equal(old.rows[0]!.fake_star_flag, false);
    assert.equal(old.rows[0]!.score, 50);
  });

  it("windowEnd moves the burst window earlier, like scoreDay", async () => {
    await seed(12, "trending", 100, 99, 1); // burst on E = 2026-10-30
    const { calls, sampler } = fake({});
    await applyFakeStarFlags(pool, DATE, sampler, { windowEnd: "2026-10-29" });
    assert.deepEqual(calls, [], "E is after the window end");
    await applyFakeStarFlags(pool, DATE, sampler, { windowEnd: "2026-10-30" });
    assert.equal(calls.length, 1);
  });

  it("a sampler error is thrown to the caller", async () => {
    await seed(13, "trending", 100, 99);
    await assert.rejects(
      applyFakeStarFlags(pool, DATE, async () => {
        throw new Error("rate limited");
      }),
      /rate limited/,
    );
  });

  it("works on the rows scoreDay writes", async () => {
    await pool.query("INSERT INTO repos (repo_id, full_name, stars, pushed_at) VALUES (20, 'o/listed', 800, $1)", [`${E}T12:00:00Z`]);
    await pool.query("INSERT INTO signals (repo_id, source, signal_type, observed_at) VALUES (20, 'github_trending', 'x', $1)", [`${E}T10:00:00Z`]);
    await pool.query("INSERT INTO repo_daily (repo_id, date, stars_new, stars_max_hour) VALUES (20, $1, 400, 120)", [E]);
    await scoreDay(pool, DATE);
    const before = (await rows()).get(20)!;
    assert.equal(before.score, 400);
    const res = await applyFakeStarFlags(pool, DATE, fake({ 20: sample(10, 9) }).sampler);
    assert.deepEqual(res, { checked: 1, flagged: 1 });
    assert.equal((await rows()).get(20)!.score, 40);
    // scoreDay rewrites the date, which resets the flag: the check must run after it.
    await scoreDay(pool, DATE);
    assert.equal((await rows()).get(20)!.fake_star_flag, false);
  });
});
