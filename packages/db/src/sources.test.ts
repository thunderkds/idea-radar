import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import type { SourceConnector } from "@idea-radar/core";
import { applyMigrations, recordSourceRun, syncSources } from "./index.js";

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

/** Only the registry fields syncSources reads; the rest of the interface is not needed here. */
const connector = (id: string, extra: Partial<SourceConnector> = {}): SourceConnector =>
  ({
    id,
    name: `Name ${id}`,
    enabled: true,
    licenseNote: `note ${id}`,
    displayable: true,
    rateLimit: { perHour: 1, concurrency: 1 },
    schedule: "daily",
    ...extra,
  }) as SourceConnector;

describe("syncSources (needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;

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
    await pool.query("TRUNCATE sources");
  });

  const rowOf = async (id: string) =>
    (await pool.query("SELECT * FROM sources WHERE id = $1", [id])).rows[0];

  it("inserts one row per connector with the code's flags (AC 1)", async () => {
    await syncSources(pool, [
      connector("a"),
      connector("b", { enabled: false, displayable: false, licenseNote: "no redistribution" }),
    ]);
    const { rows } = await pool.query("SELECT * FROM sources ORDER BY id");
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((r) => [r.id, r.name, r.enabled, r.displayable, r.license_note]),
      [
        ["a", "Name a", true, true, "note a"],
        ["b", "Name b", false, false, "no redistribution"],
      ],
    );
  });

  it("a second sync updates changed fields and keeps run state (AC 1)", async () => {
    await syncSources(pool, [connector("a")]);
    const at = new Date("2026-10-31T01:00:00Z");
    await recordSourceRun(pool, "a", "error", "boom", at);
    await syncSources(pool, [connector("a", { name: "Renamed", enabled: false, licenseNote: "new note" })]);
    const r = await rowOf("a");
    assert.equal(r.name, "Renamed");
    assert.equal(r.enabled, false);
    assert.equal(r.license_note, "new note");
    assert.equal(r.last_status, "error");
    assert.equal(r.last_error, "boom");
    assert.equal(r.last_run_at.toISOString(), at.toISOString());
  });

  it("overwrites the placeholder recordSourceRun created with the code's real flags (AC 2)", async () => {
    await recordSourceRun(pool, "a", "ok");
    assert.equal((await rowOf("a")).displayable, false, "placeholder is fail-closed");
    await syncSources(pool, [connector("a", { displayable: true })]);
    const r = await rowOf("a");
    assert.equal(r.displayable, true);
    assert.equal(r.name, "Name a");
    assert.equal(r.last_status, "ok");

    // Code wins in the other direction too: a DB row flipped to displayable is pulled back (A10, A19).
    await pool.query("UPDATE sources SET displayable = TRUE, enabled = TRUE WHERE id = 'a'");
    await syncSources(pool, [connector("a", { displayable: false, enabled: false })]);
    const r2 = await rowOf("a");
    assert.equal(r2.displayable, false);
    assert.equal(r2.enabled, false);
  });

  it("disables, but does not delete, a DB source that has no connector (AC 3)", async () => {
    await syncSources(pool, [connector("a"), connector("gone")]);
    assert.equal((await rowOf("gone")).enabled, true);
    await syncSources(pool, [connector("a")]);
    const gone = await rowOf("gone");
    assert.ok(gone, "row is kept");
    assert.equal(gone.enabled, false);
    assert.equal((await rowOf("a")).enabled, true);
  });
});
