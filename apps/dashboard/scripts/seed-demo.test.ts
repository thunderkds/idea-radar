import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { applyMigrations, createPool, getRepoDetail, type Pool } from "../../../packages/db/src/index.js";
import { demoDbName, seedDemo } from "./seed-demo";

describe("demoDbName", () => {
  it("returns the database name of a dash_ database", () => {
    assert.equal(demoDbName("postgres://u:p@localhost:5436/dash_t017"), "dash_t017");
  });
  it("refuses any other database before it connects", async () => {
    assert.throws(() => demoDbName("postgres://u:p@localhost:5436/radar"), /must start with dash_/);
    await assert.rejects(seedDemo("postgres://u:p@localhost:1/radar"), /must start with dash_/);
  });
});

const adminUrl = process.env.TEST_DATABASE_URL;

describe("seedDemo (needs TEST_DATABASE_URL)", () => {
  const name = `dash_seedtest_${randomBytes(4).toString("hex")}`;
  let skipReason: string | undefined;
  let admin: Pool | undefined;
  let db: Pool | undefined;
  let summary: Awaited<ReturnType<typeof seedDemo>>;

  before(async () => {
    if (!adminUrl) {
      skipReason = "TEST_DATABASE_URL is not set";
      return;
    }
    admin = createPool(adminUrl);
    try {
      await admin.query("SELECT 1");
    } catch (err) {
      skipReason = `Postgres unreachable at TEST_DATABASE_URL: ${(err as Error).message}`;
      await admin.end().catch(() => {});
      admin = undefined;
      return;
    }
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(adminUrl);
    url.pathname = `/${name}`;
    db = createPool(url.toString());
    const client = await db.connect();
    try {
      await applyMigrations(client);
    } finally {
      client.release();
    }
    summary = await seedDemo(url.toString());
  });
  after(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin?.end();
  });

  /** An `it` that skips cleanly when Postgres is not available. */
  const dbIt = (title: string, fn: (db: Pool) => Promise<void> | void) =>
    it(title, async (t) => {
      if (skipReason) return t.skip(skipReason);
      await fn(db!);
    });
  const one = async <T>(db: Pool, sql: string) => (await db.query(sql)).rows as T[];

  dbIt("reports what it seeded", () => {
    assert.equal(summary.database, name);
    assert.equal(summary.repos, 58);
  });
  dbIt("scores repos in all three tiers", async (db) => {
    const rows = await one<{ tier: string; n: number }>(db, "SELECT tier, count(*)::int AS n FROM repo_scores GROUP BY tier ORDER BY tier");
    assert.deepEqual(rows, [
      { tier: "lowkey", n: 54 },
      { tier: "medium", n: 2 },
      { tier: "trending", n: 2 },
    ]);
  });
  dbIt("has a hidden trendshift source with signals, next to four displayable sources", async (db) => {
    const sources = await one<{ id: string; displayable: boolean }>(db, "SELECT id, displayable FROM sources ORDER BY id");
    assert.equal(sources.find((s) => s.id === "trendshift")?.displayable, false);
    assert.equal(sources.filter((s) => s.displayable).length, 4);
    const [{ n }] = await one<{ n: number }>(db, "SELECT count(*)::int AS n FROM signals WHERE source = 'trendshift'");
    assert.ok(n > 0);
  });
  dbIt("writes 90 days of repo_daily for every repo", async (db) => {
    const [{ repos, rows }] = await one<{ repos: number; rows: number }>(
      db,
      "SELECT count(DISTINCT repo_id)::int AS repos, count(*)::int AS rows FROM repo_daily",
    );
    assert.equal(repos, 58);
    assert.equal(rows, 58 * 90);
    const [{ short }] = await one<{ short: number }>(
      db,
      "SELECT count(*)::int AS short FROM (SELECT repo_id FROM repo_daily GROUP BY repo_id HAVING count(*) <> 90) x",
    );
    assert.equal(short, 0);
  });
  dbIt("flags one repo as fake-star", async (db) => {
    const rows = await one<{ repo_id: string }>(db, "SELECT repo_id FROM repo_scores WHERE fake_star_flag");
    assert.deepEqual(rows.map((r) => Number(r.repo_id)), [1002]);
  });
  dbIt("gives repo 1001 two displayable sources inside the consensus window, and hides trendshift from the API", async (db) => {
    const detail = await getRepoDetail(db, 1001);
    assert.equal(detail?.score?.consensusCount, 2);
    assert.deepEqual(detail?.timeline.map((t) => t.source).sort(), ["github_trending", "ossinsight"]);
    assert.equal("trendshift" in (detail?.score?.components ?? {}), false);
    assert.equal(detail?.score?.fakeStarFlag, false);
  });
  dbIt("shows the fake-star flag on repo 1002 through the API", async (db) => {
    assert.equal((await getRepoDetail(db, 1002))?.score?.fakeStarFlag, true);
  });
  dbIt("seeds a repo with no README and no description for the no-data states", async (db) => {
    const [{ n }] = await one<{ n: number }>(db, "SELECT count(*)::int AS n FROM repo_content WHERE repo_id = 1003");
    assert.equal(n, 0);
    assert.equal((await getRepoDetail(db, 1003))?.repo.description, null);
  });
});
