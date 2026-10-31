import { fakeStarConfig, suspiciousShare, type StargazerAccount } from "@idea-radar/core";
import type { Queryable } from "./index.js";

/** Fetches the newest `n` stargazers of one repo; `GithubApiConnector.sampleStargazers` fits. */
export type StargazerSampler = (repoId: number, n: number) => Promise<StargazerAccount[]>;

export interface FakeStarRun {
  /** Burst repos whose stargazers were sampled (an empty sample counts: the repo was checked, not judged). */
  checked: number;
  flagged: number;
}

const DAY_MS = 24 * 3_600_000;
const round = (n: number) => Number(n.toFixed(6));

/**
 * Fake-star check (HUN-151) for the `repo_scores` rows of `date` (a UTC date, 'YYYY-MM-DD').
 * Only repos with a star burst are sampled: `repo_daily.stars_max_hour` >= `fakeStarConfig.burstStarsPerHour`
 * on a day of the 7-day window that `scoreDay` used (it ends at `min(date - 1, windowEnd)`). Each gets a
 * sample of `fakeStarConfig.sampleSize` stargazers. `components.fakeStarShare` is the low-activity share and
 * `components.fakeStarSampled` the sample size. At a share >= `flagShare` the row gets `fake_star_flag` and
 * its trending or lowkey `score` is multiplied by (1 - share); medium is flagged but not discounted.
 * Rows are never deleted and tiers never change.
 *
 * Valid only right after `scoreDay` for the same `date`: `scoreDay` rewrites the date's rows, which resets
 * the flag and the score. Running this twice on one scoring would discount the score twice, so it is not
 * re-entrant. A sampler error stops the run; rows already handled keep their flag, so rerun `scoreDay` first.
 */
export async function applyFakeStarFlags(
  db: Queryable,
  date: string,
  sampler: StargazerSampler,
  opts: { windowEnd?: string } = {},
): Promise<FakeStarRun> {
  const lastComplete = new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
  const windowEnd = opts.windowEnd && opts.windowEnd < lastComplete ? opts.windowEnd : lastComplete;
  const { rows } = await db.query<{ repo_id: number; tier: string; score: number }>(BURST_SQL, [
    date,
    windowEnd,
    fakeStarConfig.burstStarsPerHour,
  ]);

  let checked = 0;
  let flagged = 0;
  for (const row of rows) {
    const sample = await sampler(row.repo_id, fakeStarConfig.sampleSize);
    checked++;
    const share = suspiciousShare(sample);
    if (share === null) continue;
    const flag = share >= fakeStarConfig.flagShare;
    const discounted = flag && row.tier !== "medium";
    await db.query(
      `UPDATE repo_scores
       SET fake_star_flag = $3,
           score = CASE WHEN $4::boolean THEN round(score * (1 - $5::numeric), 6) ELSE score END,
           components = components || $6::jsonb
       WHERE repo_id = $1 AND date = $2::date`,
      [
        row.repo_id,
        date,
        flag,
        discounted,
        round(share),
        JSON.stringify({ fakeStarShare: round(share), fakeStarSampled: sample.length }),
      ],
    );
    if (flag) flagged++;
  }
  return { checked, flagged };
}

// $1 = score date; $2 = last day of the 7-day window; $3 = stars an hour that count as a burst.
const BURST_SQL = `
SELECT s.repo_id, s.tier, s.score FROM repo_scores s
WHERE s.date = $1::date
  AND EXISTS (SELECT 1 FROM repo_daily d
              WHERE d.repo_id = s.repo_id AND d.date > $2::date - 7 AND d.date <= $2::date
                AND d.stars_max_hour >= $3::int)
ORDER BY s.repo_id`;
