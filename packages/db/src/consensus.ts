import { consensusConfig } from "@idea-radar/core";
import type { Queryable } from "./index.js";

const DAY_MS = 24 * 3_600_000;

export interface ConsensusRun {
  /** `repo_scores` rows of the date whose `consensus_count` was written. */
  updated: number;
  /** Of those, trending rows that got a score boost (`consensus_count` of 2 or more). */
  boosted: number;
}

/**
 * Write `consensus_count` for every `repo_scores` row of `date` (a UTC date, 'YYYY-MM-DD'): the number
 * of distinct sources, displayable or not, with a signal for the repo in the 7 days ending at the same
 * window end as `scoreDay` (`date` - 1, or `opts.windowEnd` when that is earlier). That window is
 * [end - 6 days 00:00Z, end + 1 day 00:00Z), the one `scoreDay` uses for its `listed` input.
 *
 * Trending rows are also boosted: `score` is multiplied by
 * 1 + `consensusConfig.trendingBoostPerSource` × max(`consensus_count` - 1, 0), and the factor is stored in
 * `components.consensusBoost`. The boost multiplies the stored score, so call this once, right after
 * `scoreDay` for the same date; a second call without `scoreDay` in between would boost twice.
 * Medium and lowkey scores are never changed. One statement, so it commits or fails whole.
 */
export async function applyConsensus(db: Queryable, date: string, opts: { windowEnd?: string } = {}): Promise<ConsensusRun> {
  const lastComplete = new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
  const windowEnd = opts.windowEnd && opts.windowEnd < lastComplete ? opts.windowEnd : lastComplete;
  const res = await db.query<{ boosted: boolean }>(
    `WITH c AS (
       SELECT g.repo_id, count(DISTINCT g.source)::int AS n
         FROM signals g
        WHERE g.observed_at >= (($2::date - ($3::int - 1))::timestamp AT TIME ZONE 'UTC')
          AND g.observed_at <  (($2::date + 1)::timestamp AT TIME ZONE 'UTC')
        GROUP BY g.repo_id
     ), x AS (
       SELECT s.repo_id, coalesce(c.n, 0) AS n,
              1 + $4::numeric * greatest(coalesce(c.n, 0) - 1, 0) AS factor
         FROM repo_scores s LEFT JOIN c USING (repo_id)
        WHERE s.date = $1::date
     )
     UPDATE repo_scores s
        SET consensus_count = x.n,
            score = CASE WHEN s.tier = 'trending' THEN round(s.score * x.factor, 6) ELSE s.score END,
            components = CASE WHEN s.tier = 'trending'
                              THEN s.components || jsonb_build_object('consensusBoost', x.factor)
                              ELSE s.components END
       FROM x
      WHERE s.date = $1::date AND s.repo_id = x.repo_id
  RETURNING (s.tier = 'trending' AND x.n >= 2) AS boosted`,
    [date, windowEnd, consensusConfig.windowDays, consensusConfig.trendingBoostPerSource],
  );
  return { updated: res.rows.length, boosted: res.rows.filter((r) => r.boosted).length };
}
