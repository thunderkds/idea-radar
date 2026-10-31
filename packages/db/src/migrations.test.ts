import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import pg from "pg";
import { applyMigrations, rollbackMigration } from "./index.js";

const url = process.env.TEST_DATABASE_URL;
const UP = "005_source_first_seen.sql";
const UP_006 = "006_tracking.sql";

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

describe("migration files", () => {
  it("005 ships a down sibling that drops its view (no database needed)", () => {
    const files = readdirSync(new URL("../migrations", import.meta.url));
    assert.ok(files.includes("005_source_first_seen.down.sql"));
  });

  it("006 ships a down sibling (no database needed, T024 AC 1)", () => {
    const files = readdirSync(new URL("../migrations", import.meta.url));
    assert.ok(files.includes("006_tracking.down.sql"));
  });
});

describe("rollbackMigration and *.down.sql files (needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;
  let client: pg.PoolClient;

  const viewExists = async () =>
    (await client.query<{ v: string | null }>("SELECT to_regclass('repo_source_first_seen')::text AS v")).rows[0]!.v !== null;
  const applied = async () =>
    (await client.query<{ name: string }>("SELECT name FROM schema_migrations ORDER BY name")).rows.map((r) => r.name);

  before(async () => {
    admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 2 });
    client = await pool.connect();
  });

  after(async () => {
    client?.release();
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  it("applyMigrations never applies or records a down file", async () => {
    const ups = readdirSync(new URL("../migrations", import.meta.url))
      .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
      .sort();
    assert.deepEqual(await applyMigrations(client), ups);
    assert.deepEqual(await applied(), ups);
    assert.ok(await viewExists(), "the down file must not have dropped the view right after the up");
  });

  it("up -> down -> up for 005: the view and its schema_migrations row go and come back", async () => {
    await rollbackMigration(client, UP);
    assert.equal(await viewExists(), false);
    assert.ok(!(await applied()).includes(UP));
    assert.deepEqual(await applyMigrations(client), [UP]);
    assert.ok(await viewExists());
    assert.ok((await applied()).includes(UP));
  });

  it("up -> down -> up for 006: tracked_repos, repo_snapshots and repo_star_gains go and come back (T024 AC 1)", async () => {
    const present = async () =>
      (
        await client.query<{ t: string | null; s: string | null; v: string | null; i: string | null }>(
          `SELECT to_regclass('tracked_repos')::text AS t, to_regclass('repo_snapshots')::text AS s,
                  to_regclass('repo_star_gains')::text AS v, to_regclass('tracked_repos_due_idx')::text AS i`,
        )
      ).rows[0]!;
    assert.ok(Object.values(await present()).every((x) => x !== null), "all four objects exist after up");
    await client.query("INSERT INTO tracked_repos (repo_id, added_reason) VALUES (1, 'signal')");
    const row = (await client.query("SELECT priority, group_key, last_snapshot_at, next_due_at <= now() AS due FROM tracked_repos")).rows[0];
    assert.deepEqual(row, { priority: "normal", group_key: null, last_snapshot_at: null, due: true });
    await assert.rejects(
      client.query("INSERT INTO tracked_repos (repo_id, priority, added_reason) VALUES (2, 'urgent', 'signal')"),
      /check/i,
    );
    await rollbackMigration(client, UP_006);
    assert.deepEqual(Object.values(await present()), [null, null, null, null]);
    assert.ok(!(await applied()).includes(UP_006));
    assert.deepEqual(await applyMigrations(client), [UP_006]);
    assert.ok(Object.values(await present()).every((x) => x !== null));
    assert.equal((await client.query("SELECT count(*)::int AS n FROM tracked_repos")).rows[0].n, 0);
  });

  it("rejects a migration that is not applied, has no down file, or is itself a down file", async () => {
    await rollbackMigration(client, UP);
    await assert.rejects(rollbackMigration(client, UP), /not applied/);
    await assert.rejects(rollbackMigration(client, "001_init.sql"), /no down file/);
    await assert.rejects(rollbackMigration(client, "005_source_first_seen.down.sql"), /invalid migration name/);
    await assert.rejects(rollbackMigration(client, "../migrations/005_source_first_seen.sql"), /invalid migration name/);
    assert.ok((await applied()).includes("001_init.sql"), "a failed rollback leaves the other rows alone");
    await applyMigrations(client);
  });
});
