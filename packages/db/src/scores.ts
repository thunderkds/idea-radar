import {
  classifyTier,
  lowkeyComponents,
  lowkeyScore,
  tierConfig,
  type RepoScore,
  type Tier,
  type TierInput,
} from "@idea-radar/core";
import type { Queryable } from "./index.js";
import { upsertRepoScores } from "./repository.js";
import { starsPerDaySql } from "./tracking.js";

export interface ScoreRun {
  /** Rows written to `repo_scores` for the date. */
  scored: number;
  byTier: Record<string, number>;
  /** Repos with 7-day `repo_daily` or 90-day signal activity but no `repos` row yet (T008 fetches their metadata). */
  skippedNoMetadata: number;
}

const WRITE_BATCH = 1000;
const DAY_MS = 24 * 3_600_000;

interface InputRow {
  repo_id: number;
  stars: number;
  archived: boolean;
  stars7d: number;
  stars30d: number;
  prior_stars: number;
  prior_rows: number;
  percentile: number;
  positive_weeks: number;
  contributors: number;
  pushes30d: number;
  prs30d: number;
  issues30d: number;
  days_since_push: number | null;
  has_readme: boolean;
  listed: boolean;
  above_baseline: boolean;
}

/**
 * Score every repo for `date` (a UTC date, 'YYYY-MM-DD') and store one `repo_scores` row per repo that
 * matches a tier. Inputs come from the last complete UTC day, `date` - 1, and the 90 days ending on it.
 * Only repos with a `repos` row and any star day (`repo_daily` row or snapshot gain) or `signals` row in those 90 days are scored.
 * Stars per day are the snapshot gain (`repo_star_gains`) where a snapshot covers the day, else GH Archive `stars_new` (T024).
 * `pushes30d` (a lowkey activity input and a stored component) is the latest snapshot's `commits_30d` in the 30 days.
 * The date's rows are deleted and rewritten in one transaction, so a rerun gives the same rows.
 * `components` holds every `TierInput` field (booleans as 0/1) plus `stars7d` and `stars30d`;
 * `daysSincePush` is left out when `repos.pushed_at` is null. `insufficient_history` is 1 when the repo has
 * no `repo_daily` row in the baseline window, so its baseline rate is unknown (gap A3). A lowkey row's score is
 * `lowkeyScore` of five 0..1 components, which `components` also holds: `velocityLift`, `activity`,
 * `contributorsScore` (`contributors` stays the raw count), `readmeQuality`, `issueResponsiveness`; plus
 * `pushes30d`, `prsOpened30d`, `issuesOpened30d` and `issueResponsivenessKnown` (0: no reply data yet, so
 * `issueResponsiveness` is 0). README text is read only for lowkey repos.
 * `consensus_count` and `fake_star_flag` are 0 / false until T015 and T011. `db` may be a pool, or a client
 * that is not inside a transaction.
 * `windowEnd` (e.g. the GH Archive cursor, the last ingested day) moves the windows earlier when the
 * last complete day is not ingested yet; a value after `date` - 1 is ignored.
 */
export async function scoreDay(db: Queryable, date: string, opts: { windowEnd?: string } = {}): Promise<ScoreRun> {
  const lastComplete = new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
  const windowEnd = opts.windowEnd && opts.windowEnd < lastComplete ? opts.windowEnd : lastComplete;
  // A Pool has no `release`; a PoolClient does. Borrow a client from a pool so BEGIN..COMMIT share one connection.
  const borrowed = "release" in db ? undefined : await db.connect();
  const client = borrowed ?? db;
  try {
    await client.query("BEGIN");
    try {
      const res = await client.query<InputRow>(INPUT_SQL, [
        windowEnd,
        tierConfig.medium.min30dStars,
        tierConfig.medium.minPositiveWeeks,
      ]);
      const skipped = await client.query<{ n: number }>(SKIPPED_SQL, [windowEnd]);

      const staged: Staged[] = [];
      for (const row of res.rows) {
        if (row.archived) continue;
        const input = tierInput(row);
        const tier = classifyTier(input);
        if (tier) staged.push({ row, input, tier });
      }
      const readmes = await readmesFor(client, staged.filter((s) => s.tier === "lowkey").map((s) => s.row.repo_id));

      const byTier: Record<string, number> = {};
      const scores: RepoScore[] = [];
      for (const s of staged) {
        const result = scoreRow(s, date, readmes.get(s.row.repo_id));
        scores.push(result);
        byTier[result.tier] = (byTier[result.tier] ?? 0) + 1;
      }

      await client.query("DELETE FROM repo_scores WHERE date = $1::date", [date]);
      for (let i = 0; i < scores.length; i += WRITE_BATCH) {
        await upsertRepoScores(client, scores.slice(i, i + WRITE_BATCH));
      }
      await client.query("COMMIT");
      return { scored: scores.length, byTier, skippedNoMetadata: skipped.rows[0]?.n ?? 0 };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
  } finally {
    borrowed?.release();
  }
}

const round = (n: number) => Number(n.toFixed(6));

interface Staged {
  row: InputRow;
  input: TierInput;
  tier: Tier;
}

function tierInput(row: InputRow): TierInput {
  return {
    stars: row.stars,
    starsLast7d: row.stars7d,
    velocityPercentile: row.percentile,
    positiveWeeks: row.positive_weeks,
    daysSincePush: row.days_since_push ?? Number.POSITIVE_INFINITY,
    contributors: row.contributors,
    hasReadme: row.has_readme,
    listedByTrendingSource: row.listed,
    velocityAboveBaseline: row.above_baseline,
  };
}

/** README text of the given repos, one query; a repo without a `repo_content` row is absent from the map. */
async function readmesFor(db: Queryable, repoIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (repoIds.length === 0) return out;
  const { rows } = await db.query<{ repo_id: number; readme_md: string | null }>(
    "SELECT repo_id, readme_md FROM repo_content WHERE repo_id = ANY($1::bigint[])",
    [repoIds],
  );
  for (const r of rows) if (r.readme_md) out.set(r.repo_id, r.readme_md);
  return out;
}

function scoreRow({ row, input, tier }: Staged, date: string, readme: string | undefined): RepoScore {
  const components: Record<string, number> = {
    stars: input.stars,
    starsLast7d: input.starsLast7d,
    velocityPercentile: round(input.velocityPercentile),
    positiveWeeks: input.positiveWeeks,
    contributors: input.contributors,
    hasReadme: Number(input.hasReadme),
    listedByTrendingSource: Number(input.listedByTrendingSource),
    velocityAboveBaseline: Number(input.velocityAboveBaseline),
    stars7d: row.stars7d,
    stars30d: row.stars30d,
    insufficient_history: Number(row.prior_rows === 0),
  };
  if (row.days_since_push !== null) components.daysSincePush = row.days_since_push;
  let score: number;
  if (tier === "lowkey") {
    const lk = lowkeyComponents({
      starsLast7d: row.stars7d,
      priorStars: row.prior_stars,
      hasPriorHistory: row.prior_rows > 0,
      pushes30d: row.pushes30d,
      prsOpened30d: row.prs30d,
      issuesOpened30d: row.issues30d,
      contributors: row.contributors,
      readme,
    });
    for (const [key, value] of Object.entries(lk)) lk[key as keyof typeof lk] = round(value);
    Object.assign(components, {
      velocityLift: lk.velocityLift,
      activity: lk.activity,
      contributorsScore: lk.contributors,
      readmeQuality: lk.readmeQuality,
      issueResponsiveness: lk.issueResponsiveness,
      pushes30d: row.pushes30d,
      prsOpened30d: row.prs30d,
      issuesOpened30d: row.issues30d,
      issueResponsivenessKnown: 0,
    });
    score = lowkeyScore(lk);
  } else {
    score = tierScore(tier, row);
  }

  return {
    repoId: row.repo_id,
    date,
    tier,
    score: round(score),
    components,
    consensusCount: 0,
    fakeStarFlag: false,
  };
}

/** Ranking value for trending and medium (see the TASK_GUIDE_T009 AC 6); lowkey uses `lowkeyScore` in `scoreRow`. */
function tierScore(tier: "trending" | "medium", row: InputRow): number {
  if (tier === "trending") return row.stars7d;
  return row.stars30d / Math.max(row.stars - row.stars30d, 1);
}

// $1 = E, the last complete UTC day; $2 = min 30-day stars for a positive week; $3 = checkpoints to check.
// Windows: 7 days = (E-7, E]; 30 days = (E-30, E]; 90 days = (E-90, E]; baseline = the 83 days (E-90, E-7].
// Week k (0 = newest) is positive when the 30 days ending at E-7k gained >= $2 stars.
// Stars per day (`sd`) come from snapshot gains where a snapshot covers the day, else from GH Archive (T024).
// The percentile ranks the 7-day stars of every repo with a star day in the 7-day window, with or
// without a `repos` row; the heavier 90-day work is limited to the scored repos (`scope`).
// Contributors, PRs and issues still come from GH Archive. `pushes30d` is the default-branch commit count of the
// latest snapshot in the 30-day window (GH Archive has recorded no pushes since 2025), 0 without a snapshot.
const INPUT_SQL = `
WITH sd AS (${starsPerDaySql("$1::date - 90", "$1::date")}
), vel7 AS (
  SELECT repo_id, sum(stars_new) AS s7 FROM sd
  WHERE date > $1::date - 7
  GROUP BY repo_id
), pct AS (
  SELECT repo_id, percent_rank() OVER (ORDER BY s7) AS pr FROM vel7
), scope AS (
  SELECT r.repo_id, r.stars, r.archived, r.pushed_at FROM repos r
  WHERE EXISTS (SELECT 1 FROM sd WHERE sd.repo_id = r.repo_id)
     OR EXISTS (SELECT 1 FROM signals s
                WHERE s.repo_id = r.repo_id
                  AND s.observed_at >= (($1::date - 89)::timestamp AT TIME ZONE 'UTC')
                  AND s.observed_at <  (($1::date + 1)::timestamp AT TIME ZONE 'UTC'))
), agg AS (
  SELECT d.repo_id,
         coalesce(sum(d.stars_new) FILTER (WHERE d.date > $1::date - 7), 0) AS s7,
         coalesce(sum(d.stars_new) FILTER (WHERE d.date > $1::date - 30), 0) AS s30,
         coalesce(sum(d.stars_new) FILTER (WHERE d.date <= $1::date - 7), 0) AS prior,
         count(*) FILTER (WHERE d.date <= $1::date - 7) AS prior_rows
  FROM sd d JOIN scope USING (repo_id)
  GROUP BY d.repo_id
), act AS (
  SELECT d.repo_id,
         coalesce(max(d.contributors) FILTER (WHERE d.date > $1::date - 30), 0) AS contributors,
         coalesce(sum(d.prs_opened) FILTER (WHERE d.date > $1::date - 30), 0) AS prs30d,
         coalesce(sum(d.issues_opened) FILTER (WHERE d.date > $1::date - 30), 0) AS issues30d
  FROM repo_daily d JOIN scope USING (repo_id)
  WHERE d.date > $1::date - 90 AND d.date <= $1::date
  GROUP BY d.repo_id
), snap AS (
  SELECT DISTINCT ON (n.repo_id) n.repo_id, n.commits_30d
  FROM repo_snapshots n JOIN scope USING (repo_id)
  WHERE n.date > $1::date - 30 AND n.date <= $1::date
  ORDER BY n.repo_id, n.date DESC
), wk AS (
  SELECT d.repo_id, k.k,
         coalesce(sum(d.stars_new) FILTER (WHERE d.date > $1::date - 7 * k.k - 30 AND d.date <= $1::date - 7 * k.k), 0)
           >= $2::int AS ok
  FROM sd d JOIN scope USING (repo_id)
  CROSS JOIN generate_series(0, $3::int - 1) AS k(k)
  GROUP BY d.repo_id, k.k
), weeks AS (
  SELECT repo_id, coalesce(min(k) FILTER (WHERE NOT ok), $3::int) AS positive_weeks FROM wk GROUP BY repo_id
)
SELECT s.repo_id, s.stars, s.archived,
       coalesce(a.s7, 0) AS stars7d,
       coalesce(a.s30, 0) AS stars30d,
       coalesce(a.prior, 0) AS prior_stars,
       coalesce(a.prior_rows, 0) AS prior_rows,
       coalesce(p.pr, 0) AS percentile,
       coalesce(w.positive_weeks, 0) AS positive_weeks,
       coalesce(t.contributors, 0) AS contributors,
       coalesce(n.commits_30d, 0) AS pushes30d,
       coalesce(t.prs30d, 0) AS prs30d,
       coalesce(t.issues30d, 0) AS issues30d,
       CASE WHEN s.pushed_at IS NULL THEN NULL
            ELSE greatest(0, floor(extract(epoch FROM (($1::date + 1)::timestamp AT TIME ZONE 'UTC') - s.pushed_at) / 86400))
       END AS days_since_push,
       EXISTS (SELECT 1 FROM repo_content c WHERE c.repo_id = s.repo_id AND c.readme_md ~ '\\S')
         AS has_readme,
       EXISTS (SELECT 1 FROM signals g
               WHERE g.repo_id = s.repo_id AND g.source IN ('github_trending', 'ossinsight')
                 AND g.observed_at >= (($1::date - 6)::timestamp AT TIME ZONE 'UTC')
                 AND g.observed_at <  (($1::date + 1)::timestamp AT TIME ZONE 'UTC')) AS listed,
       (coalesce(a.prior_rows, 0) = 0 OR coalesce(a.s7, 0) / 7.0 > coalesce(a.prior, 0) / 83.0) AS above_baseline
FROM scope s
LEFT JOIN agg a USING (repo_id)
LEFT JOIN act t USING (repo_id)
LEFT JOIN snap n USING (repo_id)
LEFT JOIN pct p USING (repo_id)
LEFT JOIN weeks w USING (repo_id)
ORDER BY s.repo_id`;

const SKIPPED_SQL = `
SELECT count(*)::int AS n FROM (
  SELECT repo_id FROM repo_daily WHERE date > $1::date - 7 AND date <= $1::date
  UNION
  SELECT repo_id FROM signals
  WHERE observed_at >= (($1::date - 89)::timestamp AT TIME ZONE 'UTC')
    AND observed_at <  (($1::date + 1)::timestamp AT TIME ZONE 'UTC')
) x
WHERE NOT EXISTS (SELECT 1 FROM repos r WHERE r.repo_id = x.repo_id)`;
