import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { applyMigrations, getRepoDetail, listConsensus, listTier, stripHiddenComponents } from "./index.js";

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

// Scored date D: the consensus window is [2026-10-24T00:00Z, 2026-10-31T00:00Z).
const D = "2026-10-31";
const IN = "2026-10-29T10:00:00Z";

describe("stripHiddenComponents", () => {
  it("drops the id and id-prefixed keys of a hidden source, keeps the rest", () => {
    assert.deepEqual(stripHiddenComponents({ trendshift: 1, trendshift_rank: 2, "trendshift:x": 3, "trendshift.y": 4, velocity: 5, trendshiftish: 6 }, ["trendshift"]), {
      velocity: 5,
      trendshiftish: 6,
    });
  });
});

describe("query functions of the read-only API (needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;

  const signal = (repoId: number, source: string, observedAt: string) =>
    pool.query("INSERT INTO signals (repo_id, source, signal_type, observed_at) VALUES ($1, $2, 'x', $3)", [repoId, source, observedAt]);
  const tier = (over: Partial<Parameters<typeof listTier>[1]> = {}) =>
    listTier(pool, { tier: "trending", window: "7d", limit: 10, ...over });

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
    await pool.query("TRUNCATE repo_scores, repo_daily, signals, repos, repo_content, sources, tracked_repos");
    await pool.query(
      `INSERT INTO sources (id, name, displayable) VALUES
         ('github_trending','GitHub Trending',TRUE),('ossinsight','OSS Insight',TRUE),('hackernews','Hacker News',TRUE),('trendshift','Trendshift',FALSE)`,
    );
    await pool.query("INSERT INTO repos (repo_id, full_name, stars) VALUES (1,'a/one',900),(2,'a/two',50),(3,'a/three',60)");
  });

  describe("listTier: consensusCount and fakeStarFlag", () => {
    it("counts displayable sources in the window only and carries the stored fake-star flag", async () => {
      await pool.query(
        `INSERT INTO repo_scores (repo_id, date, tier, score, consensus_count, fake_star_flag, components) VALUES
           (1, $1, 'trending', 90, 4, TRUE, '{"consensusBoost": 1.3}'),
           (2, $1, 'trending', 80, 0, FALSE, '{}')`,
        [D],
      );
      await signal(1, "github_trending", IN);
      await signal(1, "github_trending", "2026-10-30T10:00:00Z"); // same source twice
      await signal(1, "ossinsight", IN);
      await signal(1, "trendshift", IN); // hidden: in the stored count, not the shown one
      await signal(1, "hackernews", "2026-10-23T23:59:59Z"); // one second before the window
      await signal(2, "hackernews", "2026-10-31T00:00:00Z"); // at the window end: outside
      const page = await tier();
      assert.deepEqual(
        page.items.map((i) => [i.repoId, i.consensusCount, i.fakeStarFlag]),
        [[1, 2, true], [2, 0, false]],
      );
    });

    it("strips consensusBoost and hidden-source keys from components", async () => {
      await pool.query(
        `INSERT INTO repo_scores (repo_id, date, tier, score, components) VALUES
           (1, $1, 'trending', 90, '{"consensusBoost": 1.3, "trendshift_rank": 7, "velocity": 0.5}')`,
        [D],
      );
      assert.deepEqual((await tier()).items[0]!.components, { velocity: 0.5 });
    });

    it("reports date null and no items before anything is scored", async () => {
      assert.deepEqual(await tier(), { date: null, items: [], hasMore: false });
    });
  });

  describe("getRepoDetail: timeline", () => {
    it("lists displayable sources only, oldest first-seen first, with first and last seen", async () => {
      await signal(1, "ossinsight", "2026-09-01T10:00:00Z");
      await signal(1, "ossinsight", "2026-10-20T10:00:00Z");
      await signal(1, "github_trending", "2026-10-05T10:00:00Z");
      await signal(1, "trendshift", "2026-08-01T10:00:00Z"); // oldest of all, but hidden
      const detail = await getRepoDetail(pool, 1);
      assert.deepEqual(
        detail!.timeline.map((t) => [t.source, t.firstSeenAt.toISOString(), t.lastSeenAt.toISOString()]),
        [
          ["ossinsight", "2026-09-01T10:00:00.000Z", "2026-10-20T10:00:00.000Z"],
          ["github_trending", "2026-10-05T10:00:00.000Z", "2026-10-05T10:00:00.000Z"],
        ],
      );
    });

    it("has an empty timeline for a repo with no signals, and null for an unknown repo", async () => {
      assert.deepEqual((await getRepoDetail(pool, 2))!.timeline, []);
      assert.equal(await getRepoDetail(pool, 999), null);
    });

    it("score carries the same displayable-only consensusCount and fakeStarFlag as the tier item", async () => {
      await pool.query(
        "INSERT INTO repo_scores (repo_id, date, tier, score, consensus_count, fake_star_flag, components) VALUES (1, $1, 'trending', 90, 3, TRUE, '{\"consensusBoost\": 1.2}')",
        [D],
      );
      await signal(1, "github_trending", IN);
      await signal(1, "trendshift", IN);
      const { score } = (await getRepoDetail(pool, 1))!;
      assert.equal(score!.consensusCount, 1);
      assert.equal(score!.fakeStarFlag, true);
      assert.ok(!("consensusBoost" in score!.components));
    });
  });

  describe("getRepoDetail: tracking (T027)", () => {
    const trackIn = (repoId: number, priority: string, group: string | null, due: string, last: string | null) =>
      pool.query(
        "INSERT INTO tracked_repos (repo_id, priority, group_key, added_reason, next_due_at, last_snapshot_at) VALUES ($1, $2, $3, 'signal', $4, $5)",
        [repoId, priority, group, due, last],
      );

    it("is null and the group list empty for a repo that is not tracked", async () => {
      const d = (await getRepoDetail(pool, 1))!;
      assert.equal(d.tracking, null);
      assert.deepEqual(d.groupRepos, []);
    });

    it("carries priority, group key, last snapshot and next due time; the group's other repos lead with leaders", async () => {
      await trackIn(1, "normal", "cli|go", "2026-11-05T00:00:00Z", "2026-10-30T03:00:00Z");
      await trackIn(2, "parked", "cli|go", "infinity", null);
      await trackIn(3, "leader", "cli|go", "2026-11-01T00:00:00Z", null);
      await trackIn(4, "leader", "other|x", "2026-11-01T00:00:00Z", null); // another group
      await pool.query("INSERT INTO repos (repo_id, full_name, stars) VALUES (4, 'a/four', 1)");
      const d = (await getRepoDetail(pool, 1))!;
      assert.deepEqual(d.tracking, {
        priority: "normal",
        groupKey: "cli|go",
        lastSnapshotAt: new Date("2026-10-30T03:00:00Z"),
        nextDueAt: new Date("2026-11-05T00:00:00Z"),
      });
      assert.deepEqual(d.groupRepos, [
        { repoId: 3, fullName: "a/three", priority: "leader" },
        { repoId: 2, fullName: "a/two", priority: "parked" },
      ]);
    });

    it("reports nextDueAt null for a parked repo ('only on request', not the Infinity date) and no group list without a group", async () => {
      await trackIn(1, "parked", null, "infinity", null);
      await trackIn(2, "normal", null, "2026-11-05T00:00:00Z", null);
      const d = (await getRepoDetail(pool, 1))!;
      assert.deepEqual(d.tracking, { priority: "parked", groupKey: null, lastSnapshotAt: null, nextDueAt: null });
      assert.deepEqual(d.groupRepos, []);
      assert.equal(JSON.stringify(d).includes("nextDueAt\":null"), true);
    });

    it("leaves out a group member that has no repos row, and caps the list", async () => {
      await trackIn(1, "normal", "g", "2026-11-05T00:00:00Z", null);
      await trackIn(2, "normal", "g", "2026-11-05T00:00:00Z", null);
      await trackIn(77, "normal", "g", "2026-11-05T00:00:00Z", null); // tracked before its metadata was fetched
      for (let i = 100; i < 140; i++) {
        await pool.query("INSERT INTO repos (repo_id, full_name, stars) VALUES ($1, $2, 1)", [i, `b/r${i}`]);
        await trackIn(i, "normal", "g", "2026-11-05T00:00:00Z", null);
      }
      const d = (await getRepoDetail(pool, 1))!;
      assert.equal(d.groupRepos.length, 20);
      assert.ok(!d.groupRepos.some((g) => g.repoId === 77 || g.repoId === 1));
    });
  });

  describe("listConsensus", () => {
    beforeEach(async () => {
      await pool.query("INSERT INTO repo_scores (repo_id, date, tier, score) VALUES (1,$1,'trending',1),(2,$1,'trending',1),(3,$1,'trending',1)", [D]);
      // repo 1: three sources; repo 2: two sources; repo 3: one displayable + one hidden source
      await signal(1, "github_trending", "2026-10-26T10:00:00Z");
      await signal(1, "ossinsight", "2026-10-27T10:00:00Z");
      await signal(1, "hackernews", "2026-10-28T10:00:00Z");
      await signal(2, "ossinsight", "2026-10-25T10:00:00Z");
      await signal(2, "github_trending", "2026-10-29T10:00:00Z");
      await signal(3, "ossinsight", IN);
      await signal(3, "trendshift", IN);
    });

    it("lists repos with 2+ displayable sources, by count desc, each with its sources oldest first", async () => {
      const page = await listConsensus(pool, { limit: 10 });
      assert.equal(page.date, D);
      assert.equal(page.hasMore, false);
      assert.deepEqual(
        page.items.map((i) => [i.repoId, i.fullName, i.consensusCount, i.sources.map((s) => s.source)]),
        [
          [1, "a/one", 3, ["github_trending", "ossinsight", "hackernews"]],
          [2, "a/two", 2, ["ossinsight", "github_trending"]],
        ],
      );
      assert.equal(page.items[0]!.sources[0]!.firstSeenAt.toISOString(), "2026-10-26T10:00:00.000Z");
    });

    it("pages by keyset one item at a time without gaps or repeats", async () => {
      const first = await listConsensus(pool, { limit: 1 });
      assert.deepEqual(first.items.map((i) => i.repoId), [1]);
      assert.equal(first.hasMore, true);
      const last = first.items[0]!;
      const second = await listConsensus(pool, {
        limit: 1,
        after: { count: last.consensusCount, firstSeen: last.firstSeenText, repoId: last.repoId },
      });
      assert.deepEqual(second.items.map((i) => i.repoId), [2]);
      assert.equal(second.hasMore, false);
    });

    it("never names the hidden source and is empty before anything is scored", async () => {
      assert.ok(!JSON.stringify(await listConsensus(pool, { limit: 10 })).includes("trendshift"));
      await pool.query("TRUNCATE repo_scores");
      assert.deepEqual(await listConsensus(pool, { limit: 10 }), { date: null, items: [], hasMore: false });
    });
  });
});
