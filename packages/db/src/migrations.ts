import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Arbitrary constant; one session-level advisory lock serialises every migrate run on a database. */
const LOCK_SQL = "SELECT pg_advisory_lock(hashtext('idea-radar:migrate'))";
const UNLOCK_SQL = "SELECT pg_advisory_unlock(hashtext('idea-radar:migrate'))";

/**
 * Apply every `migrations/*.sql` not yet in `schema_migrations`, in name order, one transaction per file.
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
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
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
