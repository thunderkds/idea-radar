import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { applyConsensus, applyMigrations, createPool, type Pool } from "@idea-radar/db";
import { createApi } from "./app.js";

const url = process.env.TEST_DATABASE_URL;

/** Returns why the DB tests must skip, or undefined when Postgres answers. */
async function skipReason(): Promise<string | undefined> {
  if (!url) return "TEST_DATABASE_URL is not set";
  const probe = createPool(url);
  try {
    await probe.query("SELECT 1");
    return undefined;
  } catch (err) {
    return `Postgres unreachable at TEST_DATABASE_URL: ${(err as Error).message}`;
  } finally {
    await probe.end().catch(() => {});
  }
}

const skip = await skipReason();

/** The non-displayable source. Its id, name and counts must appear in no response. */
const HIDDEN = "trendshift";

describe("read-only API (needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: Pool;
  let pool: Pool;
  let server: Server;
  let base: string;

  const get = async (path: string): Promise<{ status: number; text: string; body: any }> => {
    const res = await fetch(`${base}${path}`);
    const text = await res.text();
    return { status: res.status, text, body: JSON.parse(text) };
  };

  before(async () => {
    admin = createPool(url);
    await admin.query(`CREATE SCHEMA ${schema}`);
    // Every pool connection resolves unqualified names in the throwaway schema only.
    pool = createPool(`${url}${url!.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`);
    const client = await pool.connect();
    try {
      await applyMigrations(client);
    } finally {
      client.release();
    }
    server = createServer(createApi(pool));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  beforeEach(async () => {
    const { rows } = await pool.query<{ s: string }>("SELECT current_schema() AS s");
    assert.equal(rows[0]!.s, schema, "refusing to truncate outside the throwaway schema");
    await pool.query("TRUNCATE repos, repo_daily, signals, repo_content, repo_scores, sources");
    await seed();
  });

  /**
   * Repos 1-5 are lowkey on 2026-10-30 (the latest scored date); repos 2 and 3 tie on score. Repo 6 is
   * medium. Repo 1 also has a lowkey row on 2026-10-29 with a different score (must not show).
   */
  async function seed(): Promise<void> {
    await pool.query(
      `INSERT INTO sources (id, name, enabled, displayable, last_run_at, last_status, last_error) VALUES
         ('github_api', 'GitHub API', TRUE, TRUE, '2026-10-30T01:00:00Z', 'ok', NULL),
         ('ossinsight', 'OSS Insight', TRUE, TRUE, '2026-10-30T02:00:00Z', 'error', 'boom'),
         ('github_trending', 'GitHub Trending', FALSE, TRUE, NULL, NULL, NULL),
         ('${HIDDEN}', 'Trendshift', TRUE, FALSE, '2026-10-30T03:00:00Z', 'ok', NULL)`,
    );
    await pool.query(
      `INSERT INTO repos (repo_id, full_name, description, language, topics, stars) VALUES
         (1, 'a/one', 'first', 'TypeScript', '{cli,tools}', 120),
         (2, 'a/two', 'second', 'Rust', '{cli}', 80),
         (3, 'a/three', NULL, 'rust', '{web}', 60),
         (4, 'a/four', 'fourth', 'Go', '{}', 40),
         (5, 'a/five', 'fifth', NULL, '{cli,web}', 20),
         (6, 'b/six', 'sixth', 'TypeScript', '{}', 900)`,
    );
    await pool.query(
      `INSERT INTO repo_scores (repo_id, date, tier, score, components, consensus_count, fake_star_flag) VALUES
         (1, '2026-10-30', 'lowkey', 0.9, '{"velocityLift":0.8,"${HIDDEN}_boost":0.3,"consensusBoost":1.2}', 3, FALSE),
         (2, '2026-10-30', 'lowkey', 0.5, '{"velocityLift":0.5}', 1, FALSE),
         (3, '2026-10-30', 'lowkey', 0.5, '{"velocityLift":0.4}', 1, FALSE),
         (4, '2026-10-30', 'lowkey', 0.3, '{}', 0, TRUE),
         (5, '2026-10-30', 'lowkey', 0.1, '{}', 0, FALSE),
         (6, '2026-10-30', 'medium', 0.7, '{}', 0, FALSE),
         (1, '2026-10-29', 'lowkey', 0.99, '{}', 0, FALSE)`,
    );
    await pool.query(
      `INSERT INTO repo_daily (repo_id, date, stars_new) VALUES
         (1, '2026-10-30', 10), (1, '2026-10-25', 5), (1, '2026-10-10', 20), (1, '2026-07-01', 99)`,
    );
    await pool.query(
      `INSERT INTO repo_content (repo_id, readme_md, stack_tags) VALUES
         (1, repeat('x', 2500), '{node,postgres}'), (2, 'short', '{}')`,
    );
    await pool.query(
      `INSERT INTO signals (repo_id, source, signal_type, value, observed_at) VALUES
         (1, 'ossinsight', 'trending_rank', '{"rank":1,"collections":["Dev Tools","AI"]}', '2026-10-29T10:00:00Z'),
         (2, 'ossinsight', 'trending_rank', '{"rank":2,"collections":["Dev Tools"]}', '2026-09-01T10:00:00Z'),
         (3, 'ossinsight', 'trending_rank', '{"rank":3,"collections":["AI"]}', '2026-10-28T10:00:00Z'),
         (1, 'github_trending', 'listed', '{"period":"daily"}', '2026-10-29T11:00:00Z'),
         (1, '${HIDDEN}', 'spike', '{"score":42}', '2026-10-29T08:00:00Z'),
         (2, '${HIDDEN}', 'spike', '{"score":7}', '2026-10-29T08:00:00Z')`,
    );
  }

  const ids = (body: any): number[] => body.items.map((i: any) => i.repoId);

  describe("GET /health and stubs", () => {
    it("answers health and keeps rising-topics as a stub; non-GET is 405", async () => {
      assert.deepEqual((await get("/health")).body, { ok: true });
      assert.deepEqual((await get("/topics/rising")).body, { items: [] });
      assert.equal((await get("/nope")).status, 404);
      const post = await fetch(`${base}/health`, { method: "POST" });
      assert.equal(post.status, 405);
    });
  });

  describe("GET /tiers/:tier (AC 2)", () => {
    it("returns the latest date's tier, ordered by score DESC then repo_id, with the item fields", async () => {
      const { status, body } = await get("/tiers/lowkey");
      assert.equal(status, 200);
      assert.equal(body.tier, "lowkey");
      assert.equal(body.date, "2026-10-30");
      assert.equal(body.nextCursor, null);
      assert.deepEqual(ids(body), [1, 2, 3, 4, 5]);
      assert.deepEqual(Object.keys(body.items[0]).sort(), [
        "components", "consensusCount", "description", "fakeStarFlag", "fullName", "language", "repoId", "score", "stackTags", "stars",
        "starsGained", "topics",
      ]);
      const one = body.items[0];
      assert.equal(one.fullName, "a/one");
      assert.equal(one.score, 0.9);
      assert.equal(one.stars, 120);
      assert.deepEqual(one.topics, ["cli", "tools"]);
      assert.deepEqual(one.stackTags, ["node", "postgres"]);
      assert.deepEqual(one.components, { velocityLift: 0.8 }, "a non-displayable source's component and consensusBoost are removed");
      assert.deepEqual(body.items[3].stackTags, [], "no repo_content row gives an empty list");
    });

    it("carries consensusCount (displayable sources only, 7 days) and fakeStarFlag (AC 5, 7)", async () => {
      const { body } = await get("/tiers/lowkey");
      const by = new Map<number, any>(body.items.map((i: any) => [i.repoId, i]));
      // stored consensus_count of repo 1 is 3; one of its three sources is hidden
      assert.equal(by.get(1).consensusCount, 2);
      assert.equal(by.get(2).consensusCount, 0, "its only displayable signal is older than 7 days");
      assert.equal(by.get(3).consensusCount, 1);
      assert.equal(by.get(5).consensusCount, 0);
      assert.deepEqual([1, 2, 3, 4, 5].map((id) => by.get(id).fakeStarFlag), [false, false, false, true, false]);
    });

    it("returns another tier, an empty tier, and 404 for an unknown tier", async () => {
      assert.deepEqual(ids((await get("/tiers/medium")).body), [6]);
      assert.deepEqual((await get("/tiers/trending")).body, { tier: "trending", date: "2026-10-30", items: [], nextCursor: null });
      assert.equal((await get("/tiers/gold")).status, 404);
    });

    it("returns date null and no items before anything is scored", async () => {
      await pool.query("TRUNCATE repo_scores");
      assert.deepEqual((await get("/tiers/lowkey")).body, { tier: "lowkey", date: null, items: [], nextCursor: null });
    });
  });

  describe("filters and paging (AC 3)", () => {
    it("pages with cursor across two pages (ties on score included) without gaps or repeats", async () => {
      const first = (await get("/tiers/lowkey?limit=2")).body;
      assert.deepEqual(ids(first), [1, 2]);
      assert.ok(typeof first.nextCursor === "string");
      const second = (await get(`/tiers/lowkey?limit=2&cursor=${first.nextCursor}`)).body;
      assert.deepEqual(ids(second), [3, 4]);
      const third = (await get(`/tiers/lowkey?limit=2&cursor=${second.nextCursor}`)).body;
      assert.deepEqual(ids(third), [5]);
      assert.equal(third.nextCursor, null);
      // A page that ends exactly on the last row has no next cursor.
      assert.equal((await get("/tiers/lowkey?limit=5")).body.nextCursor, null);
    });

    it("language: case-insensitive equality", async () => {
      assert.deepEqual(ids((await get("/tiers/lowkey?language=RUST")).body), [2, 3]);
      assert.deepEqual(ids((await get("/tiers/lowkey?language=rus")).body), []);
    });

    it("topic: membership in repos.topics", async () => {
      assert.deepEqual(ids((await get("/tiers/lowkey?topic=cli")).body), [1, 2, 5]);
      assert.deepEqual(ids((await get("/tiers/lowkey?topic=web&language=Rust")).body), [3]);
    });

    it("collection: an ossinsight signal in the last 30 days lists it; an older one does not", async () => {
      assert.deepEqual(ids((await get("/tiers/lowkey?collection=Dev%20Tools")).body), [1], "repo 2's signal is from September");
      assert.deepEqual(ids((await get("/tiers/lowkey?collection=AI")).body), [1, 3]);
      assert.deepEqual(ids((await get("/tiers/lowkey?collection=nothing")).body), []);
    });

    it("window: chooses which star gain each item carries (default 7d); order stays by score", async () => {
      const d7 = (await get("/tiers/lowkey")).body;
      const d30 = (await get("/tiers/lowkey?window=30d")).body;
      assert.equal(d7.items[0].starsGained, 15, "10 + 5, the 20 from 20 days ago is outside 7d");
      assert.equal((await get("/tiers/lowkey?window=7d")).body.items[0].starsGained, 15);
      assert.equal(d30.items[0].starsGained, 35);
      assert.equal(d7.items[1].starsGained, 0, "no repo_daily rows gives 0");
      assert.deepEqual(ids(d7), ids(d30));
    });

    it("returns 400 naming the parameter for every invalid value", async () => {
      const bad: [string, string][] = [
        ["limit=0", "limit"],
        ["limit=201", "limit"],
        ["limit=abc", "limit"],
        ["limit=1.5", "limit"],
        ["limit=-1", "limit"],
        ["window=90d", "window"],
        ["window=", "window"],
        ["cursor=not-a-cursor", "cursor"],
        [`cursor=${Buffer.from('{"score":1,"repoId":"x"}').toString("base64url")}`, "cursor"],
        [`cursor=${Buffer.from("[]").toString("base64url")}`, "cursor"],
        ["language=", "language"],
        ["topic=", "topic"],
        ["collection=", "collection"],
        [`language=${"x".repeat(201)}`, "language"],
      ];
      for (const [qs, param] of bad) {
        const r = await get(`/tiers/lowkey?${qs}`);
        assert.equal(r.status, 400, qs);
        assert.match(r.body.error, new RegExp(`^${param}:`), qs);
      }
      assert.equal((await get("/tiers/lowkey?limit=200")).status, 200);
      assert.equal((await get("/tiers/lowkey?limit=1")).status, 200);
    });
  });

  describe("GET /repos/:id (AC 4)", () => {
    it("returns 400 for a non-numeric id and 404 for an unknown repo", async () => {
      for (const id of ["abc", "1.5", "-1", "99999999999999999999"]) {
        const r = await get(`/repos/${id}`);
        assert.equal(r.status, 400, id);
        assert.match(r.body.error, /^id:/);
      }
      assert.equal((await get("/repos/424242")).status, 404);
    });

    it("returns metadata, latest score, 90-day series, stack tags, README excerpt and displayable signals", async () => {
      const { status, body } = await get("/repos/1");
      assert.equal(status, 200);
      assert.equal(body.repo.fullName, "a/one");
      assert.equal(body.repo.stars, 120);
      assert.deepEqual(body.repo.topics, ["cli", "tools"]);
      assert.equal(body.score.date, "2026-10-30", "the latest score row, not 2026-10-29");
      assert.equal(body.score.tier, "lowkey");
      assert.equal(body.score.score, 0.9);
      assert.deepEqual(body.score.components, { velocityLift: 0.8 });
      assert.equal(body.score.fakeStarFlag, false);
      assert.deepEqual(body.starsSeries, [
        { date: "2026-10-10", starsNew: 20 },
        { date: "2026-10-25", starsNew: 5 },
        { date: "2026-10-30", starsNew: 10 },
      ]);
      assert.deepEqual(body.stackTags, ["node", "postgres"]);
      assert.equal(body.readmeExcerpt.length, 2000);
      assert.deepEqual(
        body.signals.map((s: any) => [s.source, s.signalType]),
        [["github_trending", "listed"], ["ossinsight", "trending_rank"]],
      );
      assert.equal(body.score.consensusCount, 2, "stored count was 3; the non-displayable source is not counted");
    });

    it("has a timeline of displayable sources, oldest first-seen first, with first and last seen (AC 5, 7)", async () => {
      await pool.query(
        `INSERT INTO signals (repo_id, source, signal_type, observed_at) VALUES (1, 'ossinsight', 'trending_rank', '2026-10-01T10:00:00Z')`,
      );
      const { body } = await get("/repos/1");
      assert.deepEqual(body.timeline, [
        { source: "ossinsight", firstSeenAt: "2026-10-01T10:00:00.000Z", lastSeenAt: "2026-10-29T10:00:00.000Z" },
        { source: "github_trending", firstSeenAt: "2026-10-29T11:00:00.000Z", lastSeenAt: "2026-10-29T11:00:00.000Z" },
      ]);
    });

    it("handles a repo with no score, no content and no signals", async () => {
      await pool.query("INSERT INTO repos (repo_id, full_name) VALUES (7, 'c/seven')");
      const { status, body } = await get("/repos/7");
      assert.equal(status, 200);
      assert.equal(body.score, null);
      assert.deepEqual(body.starsSeries, []);
      assert.deepEqual(body.stackTags, []);
      assert.equal(body.readmeExcerpt, null);
      assert.deepEqual(body.signals, []);
      assert.deepEqual(body.timeline, []);
    });
  });

  describe("one consensus window for scoring and API", () => {
    // Score date D = 2026-10-30: the window is [D-7 00:00Z, D 00:00Z) = [2026-10-23, 2026-10-30), as in applyConsensus.
    it("counts a signal at exactly D-7 00:00Z, not one at D 00:00Z or just before D-7; API count equals the stored count", async () => {
      await pool.query("INSERT INTO sources (id, name, enabled, displayable) VALUES ('hackernews', 'Hacker News', TRUE, TRUE)");
      await pool.query("DELETE FROM signals");
      await pool.query(
        `INSERT INTO signals (repo_id, source, signal_type, observed_at) VALUES
           (1, 'github_trending', 'x', '2026-10-23T00:00:00Z'), (1, 'ossinsight', 'x', '2026-10-29T23:59:59Z'),
           (2, 'github_trending', 'x', '2026-10-22T23:59:59Z'), (2, 'ossinsight', 'x', '2026-10-30T00:00:00Z'),
           (3, 'github_trending', 'x', '2026-10-30T00:00:00Z'), (3, 'ossinsight', 'x', '2026-10-29T10:00:00Z'),
           (4, 'ossinsight', 'x', '2026-10-22T23:59:59Z'), (4, 'hackernews', 'x', '2026-10-29T10:00:00Z')`,
      );
      await applyConsensus(pool, "2026-10-30");
      const stored = new Map<number, number>(
        (await pool.query("SELECT repo_id, consensus_count FROM repo_scores WHERE date = '2026-10-30'")).rows.map((r) => [r.repo_id, r.consensus_count]),
      );
      assert.deepEqual([1, 2, 3, 4, 5, 6].map((id) => stored.get(id)), [2, 0, 1, 1, 0, 0]);
      const tier = new Map<number, any>((await get("/tiers/lowkey")).body.items.map((i: any) => [i.repoId, i]));
      for (const id of [1, 2, 3, 4, 5]) assert.equal(tier.get(id).consensusCount, stored.get(id), `tier item ${id}`);
      for (const id of [1, 2, 3, 4]) assert.equal((await get(`/repos/${id}`)).body.score.consensusCount, stored.get(id), `detail ${id}`);
      assert.equal((await get("/tiers/medium")).body.items[0].consensusCount, stored.get(6));
      const consensus = await get("/consensus");
      assert.deepEqual(ids(consensus.body), [1], "only repo 1 has two sources inside the window");
      assert.deepEqual(consensus.body.items[0].sources.map((x: any) => x.source), ["github_trending", "ossinsight"]);
    });
  });

  describe("GET /consensus (AC 6, 7)", () => {
    /**
     * Seed adds to the base data. Displayable sources in the 7 days up to 2026-10-30:
     * repo 4: three (ossinsight, github_trending, hackernews, all 10-26); repo 3: ossinsight 10-28 + hackernews 10-27;
     * repo 1: ossinsight 10-29T10 + github_trending 10-30T09 (+ hidden trendshift); repo 5: ossinsight + hackernews, both
     * 10-29T10 (ties repo 1 on count and first seen); repo 6: one displayable + hidden; repo 2: one in the window;
     * repo 99 (no repos row): two.
     */
    beforeEach(async () => {
      await pool.query("INSERT INTO sources (id, name, enabled, displayable) VALUES ('hackernews', 'Hacker News', TRUE, TRUE)");
      await pool.query(
        `INSERT INTO signals (repo_id, source, signal_type, observed_at) VALUES
           (4, 'ossinsight', 'x', '2026-10-26T10:00:00Z'), (4, 'github_trending', 'x', '2026-10-26T10:00:00Z'),
           (4, 'hackernews', 'x', '2026-10-26T10:00:00Z'),
           (3, 'hackernews', 'x', '2026-10-27T10:00:00Z'),
           (5, 'ossinsight', 'x', '2026-10-29T10:00:00Z'), (5, 'hackernews', 'x', '2026-10-29T10:00:00Z'),
           (6, 'hackernews', 'x', '2026-10-29T10:00:00Z'), (6, '${HIDDEN}', 'spike', '2026-10-29T10:00:00Z'),
           (2, 'github_trending', 'x', '2026-10-29T10:00:00Z'),
           (99, 'ossinsight', 'x', '2026-10-29T10:00:00Z'), (99, 'hackernews', 'x', '2026-10-29T10:00:00Z')`,
      );
    });

    it("lists repos with 2+ displayable sources in the window, by count then earliest first-seen then repo id", async () => {
      const { status, body } = await get("/consensus");
      assert.equal(status, 200);
      assert.equal(body.date, "2026-10-30");
      assert.equal(body.nextCursor, null);
      assert.deepEqual(ids(body), [4, 3, 1, 5]);
      assert.deepEqual(Object.keys(body.items[0]).sort(), ["consensusCount", "fullName", "repoId", "sources"]);
      assert.deepEqual(body.items.map((i: any) => i.consensusCount), [3, 2, 2, 2]);
      assert.equal(body.items[0].fullName, "a/four");
      assert.deepEqual(body.items[1].sources, [
        { source: "hackernews", firstSeenAt: "2026-10-27T10:00:00.000Z" },
        { source: "ossinsight", firstSeenAt: "2026-10-28T10:00:00.000Z" },
      ]);
      assert.deepEqual(body.items[2].sources, [
        { source: "ossinsight", firstSeenAt: "2026-10-29T10:00:00.000Z" },
        { source: "github_trending", firstSeenAt: "2026-10-29T11:00:00.000Z" },
      ]);
    });

    it("pages with cursor one item at a time without gaps or repeats (ties included)", async () => {
      const seen: number[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 6; page++) {
        const { status, body }: { status: number; body: any } = await get(`/consensus?limit=1${cursor ? `&cursor=${cursor}` : ""}`);
        assert.equal(status, 200);
        seen.push(...ids(body));
        cursor = body.nextCursor;
        if (!cursor) break;
      }
      assert.deepEqual(seen, [4, 3, 1, 5]);
      assert.deepEqual(ids((await get("/consensus?limit=3")).body), [4, 3, 1]);
    });

    it("returns 400 naming the parameter for a bad limit or cursor", async () => {
      for (const q of ["limit=0", "limit=201", "limit=x", "cursor=abc", `cursor=${Buffer.from('{"count":2,"firstSeen":"nope","repoId":1}').toString("base64url")}`]) {
        const r = await get(`/consensus?${q}`);
        assert.equal(r.status, 400, q);
        assert.match(r.body.error, /^(limit|cursor):/, q);
      }
    });

    it("is empty before anything is scored", async () => {
      await pool.query("TRUNCATE repo_scores");
      assert.deepEqual((await get("/consensus")).body, { date: null, items: [], nextCursor: null });
    });

    it("never counts or names the non-displayable source: repo 6 has one displayable source plus a hidden one", async () => {
      const { text } = await get("/consensus");
      assert.ok(!text.toLowerCase().includes(HIDDEN));
      assert.ok(!ids(JSON.parse(text)).includes(6), "a hidden source does not make a second source");
    });
  });

  describe("GET /ops/sources (AC 5)", () => {
    it("lists each displayable source with enabled, lastRunAt, lastStatus, lastError", async () => {
      const { status, body } = await get("/ops/sources");
      assert.equal(status, 200);
      assert.deepEqual(
        body.items.map((s: any) => s.id),
        ["github_api", "github_trending", "ossinsight"],
      );
      const oss = body.items.find((s: any) => s.id === "ossinsight");
      assert.deepEqual(oss, {
        id: "ossinsight",
        name: "OSS Insight",
        enabled: true,
        lastRunAt: "2026-10-30T02:00:00.000Z",
        lastStatus: "error",
        lastError: "boom",
      });
      const trending = body.items.find((s: any) => s.id === "github_trending");
      assert.equal(trending.enabled, false);
      assert.equal(trending.lastRunAt, null);
    });
  });

  describe("displayable rule (AC 6)", () => {
    it("no route's body contains the non-displayable source's id, name, signals or count", async () => {
      // Repos 1 and 3 get a second displayable source, so /consensus has rows that also carry hidden signals.
      await pool.query("INSERT INTO sources (id, name, enabled, displayable) VALUES ('hackernews', 'Hacker News', TRUE, TRUE)");
      await pool.query(
        `INSERT INTO signals (repo_id, source, signal_type, value, observed_at) VALUES
           (3, 'hackernews', 'x', '{}', '2026-10-29T10:00:00Z'), (3, '${HIDDEN}', 'spike', '{}', '2026-10-29T10:00:00Z')`,
      );
      const paths = [
        "/health", "/consensus", "/consensus?limit=1", "/topics/rising", "/ops/sources",
        "/tiers/lowkey", "/tiers/medium", "/tiers/trending", "/tiers/lowkey?window=30d&topic=cli",
        "/repos/1", "/repos/2", "/repos/6",
      ];
      for (const p of paths) {
        const r = await get(p);
        assert.equal(r.status, 200, p);
        assert.ok(!r.text.toLowerCase().includes(HIDDEN), `${p} leaked the hidden source`);
        assert.ok(!r.text.includes('"spike"'), `${p} leaked a hidden signal type`);
      }
      // An unknown source row (no `sources` entry) is hidden as well: fail closed.
      await pool.query(`INSERT INTO signals (repo_id, source, signal_type, value) VALUES (1, 'mystery', 'x', '{}')`);
      const detail = await get("/repos/1");
      assert.ok(!detail.text.includes("mystery"));
      const consensus = await get("/consensus");
      assert.ok(!consensus.text.includes("mystery"));
      assert.deepEqual(ids(consensus.body), [3, 1], "repos 3 (first seen earlier) and 1 have two displayable sources; the hidden one adds nothing");
      assert.deepEqual(consensus.body.items.map((i: any) => i.consensusCount), [2, 2]);
      // The stored count includes the hidden source; the body never shows it (repo 1 stored 3, shown 2).
      assert.equal((await get("/repos/1")).body.score.consensusCount, 2);
      assert.equal((await get("/tiers/lowkey")).body.items[0].consensusCount, 2);
    });
  });
});
