import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { applyMigrations, claimNext, SCORE_DOES_NOT_WAIT_FOR } from "./index.js";

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

const AFTER_DELAY = new Date("2026-10-31T03:00:00Z");
const caps = { defaultPerName: 5 };

describe("score does not wait for discover (T025 R1.1, needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;

  const insert = (name: string, status: string, dataKey = "2026-10-31") =>
    pool.query("INSERT INTO jobs (name, data_key, run_after, status) VALUES ($1, $2, $3, $4)", [name, dataKey, AFTER_DELAY, status]);

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
    await pool.query("TRUNCATE jobs");
  });

  it("names discover and nothing that scoring reads", () => {
    assert.deepEqual([...SCORE_DOES_NOT_WAIT_FOR], ["discover"]);
  });

  it("score is claimable when discover of its date failed and every other job is ok", async () => {
    await insert("discover", "failed");
    await insert("snapshot", "ok");
    await insert("shortlist", "ok");
    await insert("score", "pending");
    assert.equal((await claimNext(pool, caps, AFTER_DELAY))?.name, "score");
  });

  it("score is claimable while discover of its date is still pending", async () => {
    await insert("discover", "pending");
    await insert("score", "pending");
    // discover is claimed first (older id); the second claim must be score even though discover has not finished.
    assert.equal((await claimNext(pool, caps, AFTER_DELAY))?.name, "discover");
    assert.equal((await claimNext(pool, caps, AFTER_DELAY))?.name, "score");
  });

  it("score still waits for snapshot of its date, failed or not", async () => {
    await insert("discover", "ok");
    await insert("snapshot", "failed");
    await insert("score", "pending");
    assert.equal(await claimNext(pool, caps, AFTER_DELAY), null);
  });

  it("a failed discover stays failed: the claim does not touch it", async () => {
    await insert("discover", "failed");
    await insert("score", "pending");
    await claimNext(pool, caps, AFTER_DELAY);
    const { rows } = await pool.query("SELECT status FROM jobs WHERE name = 'discover'");
    assert.equal(rows[0].status, "failed");
  });
});
