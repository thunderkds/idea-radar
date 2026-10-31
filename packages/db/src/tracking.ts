import { trackingConfig } from "@idea-radar/core";
import type { TrackingPriority } from "@idea-radar/core";
import type { Queryable } from "./index.js";

/** One GitHub API reading of a repo. Same shape as the connector's `RepoSnapshot` (connectors do not depend on db). */
export interface SnapshotInput {
  repoId: number;
  stars: number;
  forks: number;
  pushedAt: Date | null;
  commits30d: number;
}

/**
 * Track every repo in `candidates` for `date` (T024). A new repo starts `normal` and due now, with the
 * candidate's reason; a repo already tracked is left alone, so its priority and due time survive.
 * Returns how many repos were added.
 */
export async function trackCandidates(db: Queryable, date: string): Promise<number> {
  const res = await db.query(
    `INSERT INTO tracked_repos (repo_id, added_reason)
     SELECT repo_id, reason FROM candidates WHERE date = $1::date
     ON CONFLICT (repo_id) DO NOTHING`,
    [date],
  );
  return res.rowCount ?? 0;
}

/**
 * Tracked repos due at `now`, oldest due first, at most `limit`. A `parked` repo has `next_due_at = 'infinity'`
 * until a request sets it, so it is never picked otherwise.
 */
export async function listDueTracked(
  db: Queryable,
  now: Date,
  limit: number = trackingConfig.dailyCap,
): Promise<number[]> {
  const res = await db.query<{ repo_id: number }>(
    "SELECT repo_id FROM tracked_repos WHERE next_due_at <= $1 ORDER BY next_due_at, repo_id LIMIT $2",
    [now, limit],
  );
  return res.rows.map((r) => r.repo_id);
}

/** The due time after a snapshot on `date`: the start of that UTC day plus the priority's cadence; `infinity` when only on request. */
function nextDue(priority: TrackingPriority, date: string): string {
  const days = trackingConfig.cadenceDays[priority];
  if (days === null) return "infinity";
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 24 * 3_600_000).toISOString();
}

/**
 * Store the day's snapshots (one row per repo and `date`; a rerun overwrites) and move each repo's due time.
 * `last_snapshot_at` = `now`. The due time counts from the start of the snapshot's UTC day, not from `now`,
 * so a job that runs a few minutes later each day still finds a daily `leader` due. Ids in `missing`
 * (GitHub no longer returns them) become `parked` and are not due until a request marks them.
 * Idempotent, so a run that stopped halfway can repeat.
 */
export async function recordSnapshots(
  db: Queryable,
  date: string,
  snapshots: SnapshotInput[],
  missing: number[],
  now: Date,
): Promise<void> {
  if (snapshots.length > 0) {
    await db.query(
      `INSERT INTO repo_snapshots (repo_id, date, stars, forks, pushed_at, commits_30d)
       SELECT repo_id, $1::date, stars, forks, pushed_at, commits_30d
       FROM unnest($2::bigint[], $3::int[], $4::int[], $5::timestamptz[], $6::int[])
         AS t(repo_id, stars, forks, pushed_at, commits_30d)
       ON CONFLICT (repo_id, date) DO UPDATE SET
         stars = EXCLUDED.stars, forks = EXCLUDED.forks, pushed_at = EXCLUDED.pushed_at, commits_30d = EXCLUDED.commits_30d`,
      [
        date,
        snapshots.map((s) => s.repoId),
        snapshots.map((s) => s.stars),
        snapshots.map((s) => s.forks),
        snapshots.map((s) => s.pushedAt),
        snapshots.map((s) => s.commits30d),
      ],
    );
    await db.query(
      `UPDATE tracked_repos SET last_snapshot_at = $2,
         next_due_at = CASE priority WHEN 'leader' THEN $3::timestamptz WHEN 'normal' THEN $4::timestamptz ELSE $5::timestamptz END
       WHERE repo_id = ANY($1::bigint[])`,
      [snapshots.map((s) => s.repoId), now, nextDue("leader", date), nextDue("normal", date), nextDue("parked", date)],
    );
  }
  if (missing.length > 0) {
    await db.query(
      "UPDATE tracked_repos SET priority = 'parked', next_due_at = 'infinity' WHERE repo_id = ANY($1::bigint[])",
      [missing],
    );
  }
}
