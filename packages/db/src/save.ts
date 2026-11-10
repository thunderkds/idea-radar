import type { IdeaFile } from "@idea-radar/ideas";
import type pg from "pg";
import { withTransaction } from "./pool.js";
import { validDateOrNull } from "./util.js";

const MAX_ERROR_CHARS = 2000;

/** Postgres text cannot hold NUL; cap the length so a hostile payload cannot bloat the run log. */
const clean = (text: string, max: number): string => text.replaceAll("\u0000", "").slice(0, max);

/**
 * Merge rule (FR-005), one statement per idea. `version_date` is the date of the stored content:
 * a submission with an equal or newer date replaces the content (equal date: the later submission wins);
 * an older one changes nothing but `first_seen`. `updated_at` moves only when the content really changes,
 * so re-sending a submission leaves the row byte-identical.
 */
const UPSERT_IDEA = `
INSERT INTO ideas (id, title, summary, why_now, tags, signals, related_repos, version_date, first_seen, last_seen, search_text)
VALUES ($1, $2::text, $3::text, $4::text, $5::text[], $6::jsonb, $7::text[], $8::date, $8::date, $8::date,
        lower(concat_ws(' ', $2::text, $3::text, $4::text, array_to_string($5::text[], ' '))))
ON CONFLICT (id) DO UPDATE SET
  title         = CASE WHEN EXCLUDED.version_date >= ideas.version_date THEN EXCLUDED.title ELSE ideas.title END,
  summary       = CASE WHEN EXCLUDED.version_date >= ideas.version_date THEN EXCLUDED.summary ELSE ideas.summary END,
  why_now       = CASE WHEN EXCLUDED.version_date >= ideas.version_date THEN EXCLUDED.why_now ELSE ideas.why_now END,
  tags          = CASE WHEN EXCLUDED.version_date >= ideas.version_date THEN EXCLUDED.tags ELSE ideas.tags END,
  signals       = CASE WHEN EXCLUDED.version_date >= ideas.version_date THEN EXCLUDED.signals ELSE ideas.signals END,
  related_repos = CASE WHEN EXCLUDED.version_date >= ideas.version_date THEN EXCLUDED.related_repos ELSE ideas.related_repos END,
  search_text   = CASE WHEN EXCLUDED.version_date >= ideas.version_date THEN EXCLUDED.search_text ELSE ideas.search_text END,
  updated_at    = CASE WHEN EXCLUDED.version_date >= ideas.version_date
                        AND (EXCLUDED.title, EXCLUDED.summary, EXCLUDED.why_now, EXCLUDED.tags, EXCLUDED.signals, EXCLUDED.related_repos)
                            IS DISTINCT FROM (ideas.title, ideas.summary, ideas.why_now, ideas.tags, ideas.signals, ideas.related_repos)
                       THEN now() ELSE ideas.updated_at END,
  version_date  = GREATEST(ideas.version_date, EXCLUDED.version_date),
  first_seen    = LEAST(ideas.first_seen, EXCLUDED.first_seen),
  last_seen     = GREATEST(ideas.last_seen, EXCLUDED.last_seen)`;

/**
 * Save a schema-valid submission: every idea upserted and one `ok` run row, in ONE transaction.
 * Any error rolls everything back (no run row either) and is rethrown; the caller decides whether to `logRejected`.
 */
export async function saveSubmission(pool: pg.Pool, file: IdeaFile): Promise<{ runId: number }> {
  // Sorted by id so two concurrent submissions lock rows in the same order and cannot deadlock.
  const ideas = [...file.ideas].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return withTransaction(pool, async (client) => {
    for (const i of ideas) {
      await client.query(UPSERT_IDEA, [
        i.id,
        i.title,
        i.summary,
        i.why_now ?? null,
        i.tags,
        JSON.stringify(i.signals),
        i.related_repos,
        file.date,
      ]);
    }
    const run = await client.query<{ id: string }>(
      "INSERT INTO runs (date, routine, idea_count, status) VALUES ($1::date, $2, $3, 'ok') RETURNING id",
      [file.date, file.routine, ideas.length],
    );
    return { runId: Number(run.rows[0].id) };
  });
}

/**
 * Record a rejected call. `date` and `routine` come from an unvalidated payload, so an impossible date
 * is stored as NULL and long text is truncated; this must never fail because of what the caller sent.
 */
export async function logRejected(
  pool: pg.Pool,
  r: { date?: unknown; routine?: unknown; error: string },
): Promise<void> {
  const routine = typeof r.routine === "string" ? clean(r.routine, 200) : null;
  await pool.query(
    "INSERT INTO runs (date, routine, idea_count, status, error) VALUES ($1::date, $2, 0, 'rejected', $3)",
    [validDateOrNull(r.date), routine, clean(r.error, MAX_ERROR_CHARS)],
  );
}
