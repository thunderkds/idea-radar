import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { lowkeyNormalisation, lowkeyWeights } from "@idea-radar/core";
import { applyMigrations, scoreDay } from "./index.js";

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

const round6 = (n: number) => Number(n.toFixed(6));
const GOOD_README = ["# Project", "x".repeat(1600), "## Installation", "## Usage", "## API", "## Contributing", "## License"].join("\n");

// Scoring 2026-10-31 uses the last complete day E = 2026-10-30.
// 7-day window (2026-10-23, E]; 30-day (2026-10-01, E]; 90-day (2026-08-01, E]; baseline (2026-08-01, 2026-10-23].
const DATE = "2026-10-31";
const E = "2026-10-30";
const dayBefore = (days: number) => new Date(Date.parse(`${E}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

interface ScoreRow {
  repo_id: number;
  tier: string;
  score: number;
  components: Record<string, number>;
  consensus_count: number;
  fake_star_flag: boolean;
}

describe("scoreDay (needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;

  const repo = (repoId: number, o: { stars?: number; pushedAt?: string | null; archived?: boolean } = {}) =>
    pool.query("INSERT INTO repos (repo_id, full_name, stars, pushed_at, archived) VALUES ($1, $2, $3, $4, $5)", [
      repoId,
      `o/r${repoId}`,
      o.stars ?? 50,
      o.pushedAt === undefined ? `${E}T12:00:00Z` : o.pushedAt,
      o.archived ?? false,
    ]);
  const readme = (repoId: number, text = "# readme") =>
    pool.query("INSERT INTO repo_content (repo_id, readme_md) VALUES ($1, $2)", [repoId, text]);
  const readmeUpdate = (repoId: number, text: string) =>
    pool.query(
      "INSERT INTO repo_content (repo_id, readme_md) VALUES ($1, $2) ON CONFLICT (repo_id) DO UPDATE SET readme_md = $2",
      [repoId, text],
    );
  const day = (repoId: number, date: string, starsNew: number, contributors = 0) =>
    pool.query("INSERT INTO repo_daily (repo_id, date, stars_new, contributors) VALUES ($1, $2, $3, $4)", [
      repoId, date, starsNew, contributors,
    ]);
  const signal = (repoId: number, source: string, observedAt: string) =>
    pool.query("INSERT INTO signals (repo_id, source, signal_type, observed_at) VALUES ($1, $2, 'x', $3)", [
      repoId, source, observedAt,
    ]);
  const scores = async (date = DATE) =>
    (await pool.query<ScoreRow>("SELECT * FROM repo_scores WHERE date = $1 ORDER BY repo_id", [date])).rows;
  const byId = async () => new Map((await scores()).map((r) => [r.repo_id, r]));

  /** A repo that passes every lowkey rule; `o` overrides one rule at a time. */
  async function lowkeyRepo(
    id: number,
    o: { stars?: number; pushedAt?: string | null; archived?: boolean; readme?: boolean; contributors?: number } = {},
  ) {
    await repo(id, o);
    if (o.readme !== false) await readme(id);
    await day(id, dayBefore(2), 14, o.contributors ?? 3); // 14 in 7 days = 2 a day
    await day(id, dayBefore(30), 83); // prior 83 in 83 days = 1 a day: velocity above baseline
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
    const { rows } = await pool.query<{ s: string }>("SELECT current_schema() AS s");
    assert.equal(rows[0]!.s, schema, "refusing to truncate outside the throwaway schema");
    await pool.query("TRUNCATE repo_scores, repo_daily, signals, repos, repo_content");
  });

  describe("one repo per tier", () => {
    it("trending by 7-day velocity percentile: score = 7-day stars, components explain it (AC 1, 2, 6)", async () => {
      // 100 filler repos without a repos row (1..100 stars) so the percentile has a population; repo 1 is above all.
      for (let i = 1; i <= 100; i++) await day(1000 + i, dayBefore(1), i);
      await repo(1, { stars: 3000 });
      await day(1, dayBefore(3), 500);
      await day(1, dayBefore(5), 500);
      const res = await scoreDay(pool, DATE);
      assert.deepEqual(res.byTier, { trending: 1 });
      const row = (await byId()).get(1)!;
      assert.equal(row.tier, "trending");
      assert.equal(row.score, 1000);
      assert.equal(row.components.velocityPercentile, 1);
      assert.equal(row.components.stars7d, 1000);
      assert.equal(row.components.stars, 3000);
      assert.equal(row.consensus_count, 0);
      assert.equal(row.fake_star_flag, false);
    });

    it("trending by a github_trending or ossinsight signal in the 7 days; other sources and older ones do not count (AC 3)", async () => {
      for (const id of [2, 3, 4, 5]) await repo(id, { stars: 800 });
      await signal(2, "github_trending", `${dayBefore(6)}T00:00:00Z`); // first instant of the window
      await signal(3, "ossinsight", `${E}T23:59:59Z`);
      await signal(4, "trendshift", `${E}T10:00:00Z`); // never makes a repo trending here
      await signal(5, "github_trending", `${dayBefore(7)}T23:59:59Z`); // one second too old
      await scoreDay(pool, DATE);
      const rows = await byId();
      assert.deepEqual([...rows.keys()], [2, 3]);
      assert.equal(rows.get(2)!.components.listedByTrendingSource, 1);
      assert.equal(rows.get(2)!.score, 0); // listed but no stars of its own
    });

    it("medium: 4 positive weeks scored as 30-day stars / (stars - 30-day stars); 3 weeks gets no tier (AC 4, 6)", async () => {
      await repo(10, { stars: 800 });
      await day(10, dayBefore(21), 1); // in the 30 days ending 0, 7, 14 and 21 days back: 4 weeks
      await repo(11, { stars: 800 });
      await day(11, dayBefore(20), 1); // misses the 30 days ending 21 days back: 3 weeks
      await scoreDay(pool, DATE);
      const rows = await byId();
      assert.deepEqual([...rows.keys()], [10]);
      const row = rows.get(10)!;
      assert.equal(row.tier, "medium");
      assert.equal(row.score, Number((1 / 799).toFixed(6)));
      assert.equal(row.components.positiveWeeks, 4);
      assert.equal(row.components.stars30d, 1);
    });

    it("lowkey: score is the weighted sum of five 0..1 components, all stored; interim is gone (T010 AC 2, 4, 7)", async () => {
      await lowkeyRepo(20);
      const res = await scoreDay(pool, DATE);
      assert.deepEqual(res, { scored: 1, byTier: { lowkey: 1 }, skippedNoMetadata: 0 });
      const row = (await byId()).get(20)!;
      assert.equal(row.tier, "lowkey");
      // velocity: 14 stars / 7 days = 2 a day vs 1 a day prior = lift 2 -> (2 - 1) / 4; contributors 3 / 5;
      // readme "# readme": 8 chars and 1 heading, no install or usage section; no activity events; no reply data.
      assert.deepEqual(row.components, {
        stars: 50, starsLast7d: 14, velocityPercentile: 0, positiveWeeks: 4, contributors: 3, hasReadme: 1,
        listedByTrendingSource: 0, velocityAboveBaseline: 1, stars7d: 14, stars30d: 14, insufficient_history: 0,
        daysSincePush: 0,
        velocityLift: 0.25, activity: 0, contributorsScore: 0.6, readmeQuality: 0.062133, issueResponsiveness: 0,
        pushes30d: 0, prsOpened30d: 0, issuesOpened30d: 0, issueResponsivenessKnown: 0,
      });
      assert.equal(row.score, 0.1868);
    });

    it("lowkey: score equals the sum of lowkeyWeights times the stored components", async () => {
      await lowkeyRepo(21);
      await lowkeyRepo(22, { contributors: 5 });
      await readmeUpdate(22, GOOD_README);
      await pool.query("UPDATE repo_daily SET pushes = 10, prs_opened = 5, issues_opened = 5 WHERE repo_id = 22 AND date = $1", [dayBefore(2)]);
      await scoreDay(pool, DATE);
      const rows = await byId();
      for (const id of [21, 22]) {
        const row = rows.get(id)!;
        const c = row.components;
        const sum =
          lowkeyWeights.velocityLift * c.velocityLift! +
          lowkeyWeights.activity * c.activity! +
          lowkeyWeights.contributors * c.contributorsScore! +
          lowkeyWeights.readmeQuality * c.readmeQuality! +
          lowkeyWeights.issueResponsiveness * c.issueResponsiveness!;
        assert.ok(Math.abs(row.score - sum) < 1e-4, `repo ${id}: ${row.score} vs ${sum}`);
        for (const k of ["velocityLift", "activity", "contributorsScore", "readmeQuality", "issueResponsiveness"]) {
          assert.ok(c[k]! >= 0 && c[k]! <= 1, `${k}=${c[k]}`);
        }
      }
      const c22 = rows.get(22)!.components;
      assert.equal(c22.activity, round6(20 / 30));
      assert.equal(c22.contributorsScore, 1);
      assert.equal(c22.readmeQuality, 1);
      assert.equal(c22.pushes30d, 10);
      assert.ok(rows.get(22)!.score > rows.get(21)!.score);
    });

    it("lowkey: no baseline history gives the configured velocity value, not 1; a NULL README is no lowkey candidate", async () => {
      await repo(23);
      await pool.query("INSERT INTO repo_content (repo_id, readme_md) VALUES (23, NULL)");
      await day(23, dayBefore(2), 3, 3);
      await scoreDay(pool, DATE);
      const row = (await byId()).get(23);
      // has_readme requires non-blank text, so a NULL README is not a lowkey candidate at all.
      assert.equal(row, undefined);
      await readmeUpdate(23, "# Hi");
      await scoreDay(pool, DATE);
      const c = (await byId()).get(23)!.components;
      assert.equal(c.insufficient_history, 1);
      assert.equal(c.velocityLift, lowkeyNormalisation.velocityLift.noHistory);
      assert.equal(c.issueResponsivenessKnown, 0);
    });
  });

  describe("lowkey rules (AC 4)", () => {
    it("drops a repo for each failed rule: README, contributors, push age, archived, no push date", async () => {
      await lowkeyRepo(30); // control: stays lowkey
      await lowkeyRepo(31, { readme: false });
      await lowkeyRepo(32, { contributors: 1 });
      await lowkeyRepo(33, { pushedAt: "2026-09-30T00:00:00Z" }); // 31 days before the scoring date: out
      await lowkeyRepo(34, { pushedAt: "2026-10-01T00:00:00Z" }); // 30 days: in
      await lowkeyRepo(35, { archived: true });
      await lowkeyRepo(36, { pushedAt: null });
      await lowkeyRepo(37, { stars: 200 });
      await lowkeyRepo(38, { stars: 199 });
      await readme(39, "   \n"); // blank README
      await lowkeyRepo(39, { readme: false });
      await scoreDay(pool, DATE);
      assert.deepEqual([...(await byId()).keys()], [30, 34, 38]);
    });

    it("takes contributors as the largest daily count in the 30 days", async () => {
      await lowkeyRepo(40, { contributors: 1 });
      await day(40, dayBefore(29), 0, 2); // inside the 30 days: lifts the maximum to 2
      await pool.query("UPDATE repo_daily SET contributors = 9 WHERE repo_id = 40 AND date = $1", [dayBefore(30)]); // outside (E-30, E]
      await scoreDay(pool, DATE);
      assert.equal((await byId()).get(40)!.components.contributors, 2);
    });

    it("needs the 7-day daily rate strictly above the prior-83-day rate; no prior rows counts as above, flagged insufficient_history", async () => {
      await lowkeyRepo(50);
      await pool.query("DELETE FROM repo_daily WHERE repo_id = 50 AND date = $1", [dayBefore(2)]);
      await day(50, dayBefore(2), 7); // 7 / 7 = 1 a day, equal to 83 / 83: not above
      await lowkeyRepo(51);
      await pool.query("DELETE FROM repo_daily WHERE repo_id = 51 AND date = $1", [dayBefore(30)]); // no prior history
      await scoreDay(pool, DATE);
      const rows = await byId();
      assert.deepEqual([...rows.keys()], [51]);
      assert.equal(rows.get(51)!.components.insufficient_history, 1);
      assert.equal(rows.get(51)!.components.velocityAboveBaseline, 1);
    });
  });

  describe("scope and counts", () => {
    it("scores only repos with a repos row and activity in the 90 days ending at the window end (AC 1)", async () => {
      await lowkeyRepo(60);
      await repo(61); // a repos row, no activity at all
      await repo(62);
      await day(62, dayBefore(90), 5, 3); // 90 days back is outside (E-90, E]
      await readme(62);
      await day(63, dayBefore(1), 5, 3); // activity but no repos row
      await signal(64, "ossinsight", `${E}T10:00:00Z`); // signal for a repo with no row
      await signal(63, "ossinsight", `${E}T10:00:00Z`);
      const res = await scoreDay(pool, DATE);
      assert.deepEqual([...(await byId()).keys()], [60]);
      assert.equal(res.skippedNoMetadata, 2);
    });

    it("ends the windows at an earlier windowEnd (GH Archive lag); a later one is ignored", async () => {
      await repo(71, { stars: 800 });
      await signal(71, "ossinsight", `${E}T12:00:00Z`);
      assert.equal((await scoreDay(pool, DATE)).scored, 1);
      assert.equal((await scoreDay(pool, DATE, { windowEnd: DATE })).scored, 1);
      assert.equal((await scoreDay(pool, DATE, { windowEnd: dayBefore(1) })).scored, 0);
    });

    it("ignores data from the scoring date itself (windows end at date - 1)", async () => {
      await repo(70, { stars: 800 });
      await day(70, DATE, 5000);
      await signal(70, "ossinsight", `${DATE}T00:00:00Z`);
      assert.equal((await scoreDay(pool, DATE)).scored, 0);
    });

    it("puts the top 1% at percentile >= 0.99: of 101 repos the top two are trending (AC 2, edge)", async () => {
      for (let i = 1; i <= 101; i++) {
        await repo(i, { stars: 1000 });
        await day(i, dayBefore(1), i);
      }
      const res = await scoreDay(pool, DATE);
      assert.deepEqual(res.byTier, { trending: 2 });
      assert.deepEqual([...(await byId()).keys()], [100, 101]);
      assert.equal((await byId()).get(100)!.components.velocityPercentile, 0.99);
    });
  });

  describe("persistence (AC 7)", () => {
    it("rerunning gives the same rows, removes stale rows of that date, and leaves other dates alone", async () => {
      await lowkeyRepo(80);
      await repo(81, { stars: 800 });
      await signal(81, "github_trending", `${E}T10:00:00Z`);
      await pool.query(
        "INSERT INTO repo_scores (repo_id, date, tier, score) VALUES (999, $1, 'lowkey', 1), (80, '2026-10-30', 'lowkey', 7)",
        [DATE],
      );
      const first = await scoreDay(pool, DATE);
      const afterFirst = await scores();
      const second = await scoreDay(pool, DATE);
      assert.deepEqual(first, { scored: 2, byTier: { lowkey: 1, trending: 1 }, skippedNoMetadata: 0 });
      assert.deepEqual(second, first);
      assert.deepEqual(await scores(), afterFirst);
      assert.deepEqual(afterFirst.map((r) => r.repo_id), [80, 81]);
      assert.equal((await scores("2026-10-30")).length, 1);
    });

    it("works on a client inside no transaction and rolls back on failure", async () => {
      await lowkeyRepo(90);
      await pool.query("INSERT INTO repo_scores (repo_id, date, tier, score) VALUES (998, $1, 'lowkey', 1)", [DATE]);
      await pool.query("ALTER TABLE repo_scores ADD CONSTRAINT no_scores_for_90 CHECK (repo_id <> 90)");
      try {
        await assert.rejects(scoreDay(pool, DATE));
        assert.deepEqual((await scores()).map((r) => r.repo_id), [998], "old rows survive a failed run");
      } finally {
        await pool.query("ALTER TABLE repo_scores DROP CONSTRAINT no_scores_for_90");
      }
      const client = await pool.connect();
      try {
        assert.equal((await scoreDay(client, DATE)).scored, 1);
      } finally {
        client.release();
      }
    });
  });
});
