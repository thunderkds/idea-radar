import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Arbitrary constant; one session-level advisory lock serialises every migrate run on a database. */
const LOCK_SQL = "SELECT pg_advisory_lock(hashtext('idea-radar:migrate'))";
const UNLOCK_SQL = "SELECT pg_advisory_unlock(hashtext('idea-radar:migrate'))";

const DOWN_SUFFIX = ".down.sql";
/** An up migration file name: `NNN_slug.sql`. A `*.down.sql` name does not match. */
const UP_NAME = /^\d{3}_[a-z0-9_]+\.sql$/;

/**
 * Apply every `migrations/*.sql` (except `*.down.sql` rollback files) not yet in `schema_migrations`, in name order, one transaction per file.
 * Takes an advisory lock so two processes cannot migrate at once; the second waits, then finds nothing to do.
 * Returns the names applied by this call.
 */
export async function applyMigrations(client: pg.Client | pg.PoolClient): Promise<string[]> {
  await client.query(LOCK_SQL);
  const done: string[] = [];
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const applied = new Set(
      (await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name),
    );
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql") && !f.endsWith(DOWN_SUFFIX)).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(migrationsDir, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
      done.push(file);
    }
    return done;
  } finally {
    await client.query(UNLOCK_SQL).catch(() => {});
  }
}

/**
 * Roll back one applied migration: run its `<name>.down.sql` sibling and delete its `schema_migrations` row,
 * in one transaction, under the same advisory lock as `applyMigrations`. Throws, changing nothing, when
 * `name` is not an up migration name, is not applied, or has no down file.
 */
export async function rollbackMigration(client: pg.Client | pg.PoolClient, name: string): Promise<void> {
  if (!UP_NAME.test(name)) throw new Error(`invalid migration name: ${name}`);
  await client.query(LOCK_SQL);
  try {
    const found = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
    if (found.rowCount === 0) throw new Error(`migration not applied: ${name}`);
    const downFile = name.replace(/\.sql$/, DOWN_SUFFIX);
    if (!(await readdir(migrationsDir)).includes(downFile)) throw new Error(`no down file for ${name}`);
    const sql = await readFile(join(migrationsDir, downFile), "utf8");
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("DELETE FROM schema_migrations WHERE name = $1", [name]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
  } finally {
    await client.query(UNLOCK_SQL).catch(() => {});
  }
}
