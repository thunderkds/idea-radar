import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { applyMigrations, listCandidatesNeedingContent } from "./index.js";

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
const DATE = "2026-10-30";

describe("listCandidatesNeedingContent (needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;

  const candidate = (repoId: number, priority: number, reason = "velocity", date = DATE) =>
    pool.query("INSERT INTO candidates (date, repo_id, reason, priority) VALUES ($1, $2, $3, $4)", [
      date, repoId, reason, priority,
    ]);
  const repoRow = (repoId: number) =>
    pool.query("INSERT INTO repos (repo_id, full_name) VALUES ($1, $2)", [repoId, `o/r${repoId}`]);
  const content = (repoId: number, ageDays: number) =>
    pool.query(
      "INSERT INTO repo_content (repo_id, fetched_at) VALUES ($1, now() - make_interval(days => $2::int))",
      [repoId, ageDays],
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
    const { rows } = await pool.query<{ s: string }>("SELECT current_schema() AS s");
    assert.equal(rows[0]!.s, schema, "refusing to truncate outside the throwaway schema");
    await pool.query("TRUNCATE candidates, repos, repo_content");
  });

  it("lists candidates with no content or content older than 7 days, best first", async () => {
    for (const id of [1, 2, 3, 4, 5]) await repoRow(id);
    await candidate(1, 1);
    await candidate(2, 9); // no content row
    await candidate(3, 5); // fetched 8 days ago: stale
    await candidate(4, 7); // fetched 6 days ago: fresh
    await candidate(5, 5, "signal"); // no content; ties with 3, signal first
    await content(3, 8);
    await content(4, 6);
    assert.deepEqual(await listCandidatesNeedingContent(pool, DATE), [2, 5, 3, 1]);
  });

  it("honours contentMaxAgeDays", async () => {
    await repoRow(1);
    await candidate(1, 1);
    await content(1, 3);
    assert.deepEqual(await listCandidatesNeedingContent(pool, DATE), []);
    assert.deepEqual(await listCandidatesNeedingContent(pool, DATE, { contentMaxAgeDays: 2 }), [1]);
  });

  it("skips candidates with no repos row, other dates, and non-candidates", async () => {
    await repoRow(1);
    await repoRow(2);
    await repoRow(3);
    await candidate(1, 1);
    await candidate(9, 1); // no repos row
    await candidate(2, 1, "velocity", "2026-10-29"); // other date
    assert.deepEqual(await listCandidatesNeedingContent(pool, DATE), [1]);
  });
});
