import { candidateConfig, type CandidateConfig } from "@idea-radar/core";
import type { Queryable } from "./index.js";
import { starsPerDaySql } from "./tracking.js";

export interface CandidateSelection {
  selected: number;
  byReason: Record<string, number>;
}

/**
 * Pick the day's candidates and store them in `candidates` (rewriting that date in one transaction).
 * Two reasons, each decided in SQL over stars per day and `signals` (repo_daily holds millions of rows a day).
 * Stars per day are the snapshot gain where a snapshot covers the day, else GH Archive `stars_new` (T024):
 *  - `velocity`: stars in the `recentDays` ending at `date` reach `minStars7d`, and the daily rate is above
 *    the repo's own rate over the `baselineDays` before that. A repo with no baseline rows counts as above.
 *  - `signal`: any signal in the same window from a source other than `github_api`.
 * A repo with both is stored as `signal`. `priority` = recent stars / (baseline daily rate * recentDays + 1);
 * the cap keeps the highest priority, signals first on ties.
 * `db` may be a pool, or a client that is not inside a transaction.
 */
export async function selectCandidates(
  db: Queryable,
  date: string,
  config: CandidateConfig = candidateConfig,
): Promise<CandidateSelection> {
  // A Pool has no `release`; a PoolClient does. Borrow a client from a pool so BEGIN..COMMIT share one connection.
  const borrowed = "release" in db ? undefined : await db.connect();
  const client = borrowed ?? db;
  try {
    await client.query("BEGIN");
    try {
      await client.query("DELETE FROM candidates WHERE date = $1::date", [date]);
      const res = await client.query<{ reason: string; n: number }>(SELECT_SQL, [
        date,
        config.minStars7d,
        config.recentDays,
        config.baselineDays,
        config.cap,
      ]);
      await client.query("COMMIT");
      const byReason: Record<string, number> = {};
      let selected = 0;
      for (const r of res.rows) {
        byReason[r.reason] = r.n;
        selected += r.n;
      }
      return { selected, byReason };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
  } finally {
    borrowed?.release();
  }
}

// $1 date, $2 minStars7d, $3 recentDays, $4 baselineDays, $5 cap.
// Recent window = ($1 - $3, $1]; baseline window = ($1 - $3 - $4, $1 - $3]; signals use the recent window in UTC.
const SELECT_SQL = `
WITH sd AS (${starsPerDaySql("$1::date - $3::int - $4::int", "$1::date")}
), vel AS (
  SELECT repo_id FROM sd
  WHERE date > $1::date - $3::int AND date <= $1::date
  GROUP BY repo_id HAVING sum(stars_new) >= $2::int
), sig AS (
  SELECT DISTINCT repo_id FROM signals
  WHERE source <> 'github_api'
    AND observed_at >= (($1::date - $3::int + 1)::timestamp AT TIME ZONE 'UTC')
    AND observed_at <  (($1::date + 1)::timestamp AT TIME ZONE 'UTC')
), ids AS (
  SELECT repo_id FROM vel UNION SELECT repo_id FROM sig
), recent AS (
  SELECT i.repo_id, coalesce(sum(d.stars_new), 0)::numeric AS stars
  FROM ids i LEFT JOIN sd d
    ON d.repo_id = i.repo_id AND d.date > $1::date - $3::int AND d.date <= $1::date
  GROUP BY i.repo_id
), base AS (
  SELECT i.repo_id, coalesce(sum(d.stars_new), 0)::numeric AS stars, count(d.repo_id) AS day_rows
  FROM ids i LEFT JOIN sd d
    ON d.repo_id = i.repo_id AND d.date > $1::date - $3::int - $4::int AND d.date <= $1::date - $3::int
  GROUP BY i.repo_id
), scored AS (
  SELECT r.repo_id,
         (r.stars >= $2::int AND (b.day_rows = 0 OR r.stars / $3::int > b.stars / $4::int)) AS is_velocity,
         (s.repo_id IS NOT NULL) AS is_signal,
         r.stars / (b.stars / $4::int * $3::int + 1) AS priority
  FROM recent r
  JOIN base b USING (repo_id)
  LEFT JOIN sig s USING (repo_id)
), picked AS (
  SELECT repo_id, CASE WHEN is_signal THEN 'signal' ELSE 'velocity' END AS reason, priority
  FROM scored
  WHERE is_velocity OR is_signal
  ORDER BY priority DESC, is_signal DESC, repo_id
  LIMIT $5::int
), ins AS (
  INSERT INTO candidates (date, repo_id, reason, priority)
  SELECT $1::date, repo_id, reason, priority FROM picked
  RETURNING reason
)
SELECT reason, count(*)::int AS n FROM ins GROUP BY reason`;

/**
 * Candidate repo ids for `date`, best first (priority, signals first on ties). With `needsMetadata`, only
 * repos with no `repos` row or one not updated in the last `metadataMaxAgeDays`.
 */
export async function listCandidates(
  db: Queryable,
  date: string,
  opts: { needsMetadata?: boolean; metadataMaxAgeDays?: number } = {},
): Promise<number[]> {
  const res = await db.query<{ repo_id: number }>(
    `SELECT c.repo_id FROM candidates c
     LEFT JOIN repos r ON r.repo_id = c.repo_id
     WHERE c.date = $1::date
       AND (NOT $2::boolean OR r.repo_id IS NULL OR r.updated_at < now() - make_interval(days => $3::int))
     ORDER BY c.priority DESC, (c.reason = 'signal') DESC, c.repo_id`,
    [date, opts.needsMetadata ?? false, opts.metadataMaxAgeDays ?? candidateConfig.metadataMaxAgeDays],
  );
  return res.rows.map((r) => r.repo_id);
}
