import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { applyMigrations, listDueTracked, trackRepos } from "./index.js";

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

describe("trackRepos (T025, needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;

  const tracked = async () =>
    (
      await pool.query<Record<string, any>>(
        "SELECT repo_id, priority, added_reason, next_due_at::text AS due FROM tracked_repos ORDER BY repo_id",
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
    await pool.query("TRUNCATE tracked_repos");
  });

  it("tracks each new repo once, as normal and due now, with the given reason (AC 3, AC 4)", async () => {
    assert.equal(await trackRepos(pool, [3, 1, 2, 1], "search"), 3, "a repeated id counts once");
    assert.deepEqual((await tracked()).map((r) => [r.repo_id, r.priority, r.added_reason]), [
      [1, "normal", "search"],
      [2, "normal", "search"],
      [3, "normal", "search"],
    ]);
    assert.deepEqual(await listDueTracked(pool, new Date()), [1, 2, 3]);
    assert.equal(await trackRepos(pool, [1, 2, 3], "search"), 0, "a second run adds nothing");
    assert.equal((await tracked()).length, 3);
  });

  it("an existing leader stays a leader, with its reason and due time (AC 3, AC 4)", async () => {
    await pool.query("INSERT INTO tracked_repos (repo_id, priority, added_reason, next_due_at) VALUES (1, 'leader', 'signal', '2026-11-05T00:00:00Z')");
    await pool.query("INSERT INTO tracked_repos (repo_id, priority, added_reason, next_due_at) VALUES (2, 'parked', 'velocity', 'infinity')");
    assert.equal(await trackRepos(pool, [1, 2, 3], "search"), 1);
    const rows = await tracked();
    assert.deepEqual(rows.map((r) => [r.repo_id, r.priority, r.added_reason]), [
      [1, "leader", "signal"],
      [2, "parked", "velocity"],
      [3, "normal", "search"],
    ]);
    assert.match(rows[0]!.due, /^2026-11-05/);
    assert.equal(rows[1]!.due, "infinity", "a parked repo stays parked");
  });

  it("an empty list does nothing", async () => {
    assert.equal(await trackRepos(pool, [], "search"), 0);
  });
});
