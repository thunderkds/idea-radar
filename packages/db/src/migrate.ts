import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

// Resolves to packages/db/migrations from both src/ and dist/.
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const MIGRATION_NAME = /^\d{3}_[a-z0-9_]+\.sql$/;

/** Constant key: one session-level advisory lock serialises migrate runs (e.g. two overlapping deploys). */
const LOCK = "SELECT pg_advisory_lock(hashtext('idea-radar:migrate'))";
const UNLOCK = "SELECT pg_advisory_unlock(hashtext('idea-radar:migrate'))";

/**
 * Apply every `migrations/NNN_*.sql` not yet recorded in `schema_migrations`, in name order, one transaction per file.
 * Returns the names applied by this call (empty when up to date).
 */
export async function migrate(pool: pg.Pool): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(LOCK);
    try {
      await client.query(
        "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
      );
      const done = new Set(
        (await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name),
      );
      const files = (await readdir(migrationsDir)).filter((f) => MIGRATION_NAME.test(f)).sort();
      for (const file of files) {
        if (done.has(file)) continue;
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
        applied.push(file);
      }
      return applied;
    } finally {
      await client.query(UNLOCK).catch(() => {});
    }
  } finally {
    client.release();
  }
}
