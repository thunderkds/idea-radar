import { consensusConfig } from "@idea-radar/core";
import type { Queryable } from "./index.js";

/**
 * Read-only queries for apps/api (HUN-156). Every statement is parameterised.
 *
 * Displayable rule (AGENTS.md, gap A10/U4): a row from `signals` is only ever read through an inner
 * join on `sources` with `displayable = TRUE`, so a source with no `sources` row is left out too.
 * `repo_scores.components` and `consensus_count` can carry the influence of a non-displayable
 * source, so the former is filtered by source id and the latter is recomputed from displayable signals.
 */

export type ApiTier = "trending" | "medium" | "lowkey";
export type StarsWindow = "7d" | "30d";

/**
 * What `window` means: the number of days of `repo_daily.stars_new` that make up `starsGained`,
 * counted back from the scored date. The one place to change if the meaning of `window` changes.
 */
export const STARS_WINDOW_DAYS: Record<StarsWindow, number> = { "7d": 7, "30d": 30 };

/** Days of OSS Insight signals that count for the `collection` filter. */
const COLLECTION_DAYS = 30;
/** Days of signals that count towards a repo's consensus. */
const CONSENSUS_DAYS = consensusConfig.windowDays;
/** Days of `repo_daily` returned on the repo detail. */
const SERIES_DAYS = 90;
const README_EXCERPT_CHARS = 2000;
const DETAIL_SIGNAL_LIMIT = 100;

/**
 * Distinct displayable sources with a signal for the repo in the `daysParam` days up to the end of the
 * score date. `scoreDate` is a SQL expression for a DATE; `repoId` one for the repo id. The one rule
 * behind `consensusCount` on tier items and the repo detail, and the window of `listConsensus`.
 */
const consensusWindow = (scoreDate: string, daysParam: string) =>
  `g.observed_at > (${scoreDate}::timestamp AT TIME ZONE 'UTC') + interval '1 day' - make_interval(days => ${daysParam}::int)
   AND g.observed_at <= (${scoreDate}::timestamp AT TIME ZONE 'UTC') + interval '1 day'`;
const displayableConsensusCount = (scoreDate: string, repoId: string, daysParam: string) =>
  `(SELECT count(DISTINCT g.source)::int FROM signals g
      JOIN sources so ON so.id = g.source AND so.displayable
     WHERE g.repo_id = ${repoId} AND ${consensusWindow(scoreDate, daysParam)})`;

export interface TierQuery {
  tier: ApiTier;
  language?: string;
  topic?: string;
  collection?: string;
  window: StarsWindow;
  limit: number;
  /** Keyset position of the last row of the previous page. `score` is the numeric as text (exact). */
  after?: { score: string; repoId: number };
}

export interface TierItem {
  repoId: number;
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  score: number;
  /** Sum of `repo_daily.stars_new` over the requested window. */
  starsGained: number;
  components: Record<string, number>;
  stackTags: string[];
  /** Distinct displayable sources with a signal in the 7 days up to the score date (a hidden source is not counted). */
  consensusCount: number;
  fakeStarFlag: boolean;
  /** Only for the cursor; not part of the API response. */
  scoreText: string;
}

export interface TierPage {
  /** Latest `repo_scores.date` (YYYY-MM-DD), or null when nothing is scored yet. */
  date: string | null;
  items: TierItem[];
  /** True when more rows follow the last item. */
  hasMore: boolean;
}

/** Drop the keys that name a non-displayable source (the id itself, or the id followed by `_`, `:` or `.`). */
export function stripHiddenComponents<T>(components: Record<string, T>, hiddenIds: string[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(components)) {
    const lower = key.toLowerCase();
    if (hiddenIds.some((id) => lower === id || [`${id}_`, `${id}:`, `${id}.`].some((p) => lower.startsWith(p)))) continue;
    out[key] = value;
  }
  return out;
}

/**
 * `components` as the API shows it: hidden-source keys are dropped, and so is `consensusBoost`, because
 * the factor (1 + boost × (count - 1)) would give away the count including a non-displayable source.
 */
function publicComponents(components: Record<string, number>, hiddenIds: string[]): Record<string, number> {
  const { consensusBoost: _consensusBoost, ...rest } = stripHiddenComponents(components, hiddenIds);
  return rest;
}

async function hiddenSourceIds(db: Queryable): Promise<string[]> {
  const res = await db.query<{ id: string }>("SELECT lower(id) AS id FROM sources WHERE NOT displayable");
  return res.rows.map((r) => r.id);
}

/** One page of a tier for the latest scored date, ordered by `score DESC, repo_id`. */
export async function listTier(db: Queryable, q: TierQuery): Promise<TierPage> {
  const dateRes = await db.query<{ date: string | null }>("SELECT max(date)::text AS date FROM repo_scores");
  const date = dateRes.rows[0]?.date ?? null;
  if (!date) return { date: null, items: [], hasMore: false };

  const res = await db.query<{
    repo_id: number;
    full_name: string;
    description: string | null;
    language: string | null;
    topics: string[];
    stars: number;
    score: number;
    score_text: string;
    components: Record<string, number>;
    stars_gained: number;
    stack_tags: string[];
    consensus_count: number;
    fake_star_flag: boolean;
  }>(
    `SELECT s.repo_id, r.full_name, r.description, r.language, r.topics, r.stars,
            s.score, s.score::text AS score_text, s.components,
            COALESCE((SELECT sum(d.stars_new) FROM repo_daily d
                       WHERE d.repo_id = s.repo_id AND d.date <= s.date AND d.date > s.date - $4::int), 0)::int AS stars_gained,
            COALESCE(c.stack_tags, '{}') AS stack_tags,
            ${displayableConsensusCount("s.date", "s.repo_id", "$11")} AS consensus_count,
            s.fake_star_flag
       FROM repo_scores s
       JOIN repos r ON r.repo_id = s.repo_id
       LEFT JOIN repo_content c ON c.repo_id = s.repo_id
      WHERE s.date = $1::date AND s.tier = $2
        AND ($3::text IS NULL OR lower(r.language) = lower($3))
        AND ($5::text IS NULL OR $5 = ANY(r.topics))
        AND ($6::text IS NULL OR EXISTS (
              SELECT 1 FROM signals g
                JOIN sources so ON so.id = g.source AND so.displayable
               WHERE g.repo_id = s.repo_id AND g.source = 'ossinsight'
                 AND g.observed_at > (s.date::timestamp AT TIME ZONE 'UTC') - make_interval(days => $7::int)
                 AND g.value->'collections' @> to_jsonb($6::text)))
        AND ($8::numeric IS NULL OR s.score < $8::numeric OR (s.score = $8::numeric AND s.repo_id > $9::bigint))
      ORDER BY s.score DESC, s.repo_id
      LIMIT $10`,
    [
      date,
      q.tier,
      q.language ?? null,
      STARS_WINDOW_DAYS[q.window],
      q.topic ?? null,
      q.collection ?? null,
      COLLECTION_DAYS,
      q.after?.score ?? null,
      q.after?.repoId ?? null,
      q.limit + 1,
      CONSENSUS_DAYS,
    ],
  );

  const hidden = await hiddenSourceIds(db);
  const items = res.rows.slice(0, q.limit).map<TierItem>((r) => ({
    repoId: r.repo_id,
    fullName: r.full_name,
    description: r.description,
    language: r.language,
    topics: r.topics,
    stars: r.stars,
    score: r.score,
    starsGained: r.stars_gained,
    components: publicComponents(r.components, hidden),
    stackTags: r.stack_tags,
    consensusCount: r.consensus_count,
    fakeStarFlag: r.fake_star_flag,
    scoreText: r.score_text,
  }));
  return { date, items, hasMore: res.rows.length > q.limit };
}

export interface RepoDetail {
  repo: {
    repoId: number;
    fullName: string;
    description: string | null;
    language: string | null;
    topics: string[];
    license: string | null;
    stars: number;
    forks: number;
    archived: boolean;
    createdAt: Date | null;
    pushedAt: Date | null;
  };
  /** The repo's latest `repo_scores` row, or null if it was never scored. */
  score: {
    date: string;
    tier: ApiTier;
    score: number;
    components: Record<string, number>;
    /** Distinct displayable sources with a signal in the 7 days up to the score date. */
    consensusCount: number;
    fakeStarFlag: boolean;
  } | null;
  starsSeries: { date: string; starsNew: number }[];
  /** "Who caught it first": each displayable source that ever flagged the repo, oldest first-seen first. */
  timeline: { source: string; firstSeenAt: Date; lastSeenAt: Date }[];
  stackTags: string[];
  readmeExcerpt: string | null;
  signals: { source: string; signalType: string; value: Record<string, unknown>; observedAt: Date }[];
}

/** One repo with its latest score, 90-day star series, README excerpt and displayable signals; null if unknown. */
export async function getRepoDetail(db: Queryable, repoId: number): Promise<RepoDetail | null> {
  const repoRes = await db.query(
    `SELECT r.repo_id, r.full_name, r.description, r.language, r.topics, r.license, r.stars, r.forks,
            r.archived, r.created_at, r.pushed_at,
            COALESCE(c.stack_tags, '{}') AS stack_tags, left(c.readme_md, $2::int) AS readme_excerpt
       FROM repos r LEFT JOIN repo_content c ON c.repo_id = r.repo_id
      WHERE r.repo_id = $1`,
    [repoId, README_EXCERPT_CHARS],
  );
  const r = repoRes.rows[0];
  if (!r) return null;

  const [scoreRes, seriesRes, signalRes, timelineRes, hidden] = await Promise.all([
    db.query(
      `SELECT s.date::text AS date, s.tier, s.score, s.components, s.fake_star_flag,
              ${displayableConsensusCount("s.date", "s.repo_id", "$2")} AS consensus_count
         FROM repo_scores s WHERE s.repo_id = $1 ORDER BY s.date DESC LIMIT 1`,
      [repoId, CONSENSUS_DAYS],
    ),
    db.query(
      `SELECT d.date::text AS date, d.stars_new FROM repo_daily d
        WHERE d.repo_id = $1
          AND d.date > COALESCE((SELECT max(date) FROM repo_scores), current_date) - $2::int
        ORDER BY d.date`,
      [repoId, SERIES_DAYS],
    ),
    db.query(
      `SELECT g.source, g.signal_type, g.value, g.observed_at
         FROM signals g JOIN sources so ON so.id = g.source AND so.displayable
        WHERE g.repo_id = $1 ORDER BY g.observed_at DESC, g.id DESC LIMIT $2`,
      [repoId, DETAIL_SIGNAL_LIMIT],
    ),
    db.query(
      `SELECT v.source, v.first_seen_at, v.last_seen_at
         FROM repo_source_first_seen v JOIN sources so ON so.id = v.source AND so.displayable
        WHERE v.repo_id = $1 ORDER BY v.first_seen_at, v.source`,
      [repoId],
    ),
    hiddenSourceIds(db),
  ]);

  const s = scoreRes.rows[0];
  return {
    repo: {
      repoId: r.repo_id,
      fullName: r.full_name,
      description: r.description,
      language: r.language,
      topics: r.topics,
      license: r.license,
      stars: r.stars,
      forks: r.forks,
      archived: r.archived,
      createdAt: r.created_at,
      pushedAt: r.pushed_at,
    },
    score: s
      ? {
          date: s.date,
          tier: s.tier,
          score: s.score,
          components: publicComponents(s.components, hidden),
          consensusCount: s.consensus_count,
          fakeStarFlag: s.fake_star_flag,
        }
      : null,
    starsSeries: seriesRes.rows.map((d) => ({ date: d.date, starsNew: d.stars_new })),
    timeline: timelineRes.rows.map((t) => ({ source: t.source, firstSeenAt: t.first_seen_at, lastSeenAt: t.last_seen_at })),
    stackTags: r.stack_tags,
    readmeExcerpt: r.readme_excerpt,
    signals: signalRes.rows.map((g) => ({
      source: g.source,
      signalType: g.signal_type,
      value: g.value,
      observedAt: g.observed_at,
    })),
  };
}

export interface SourceHealth {
  id: string;
  name: string;
  enabled: boolean;
  lastRunAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
}

/** Health of each displayable source. A `displayable = FALSE` source is not listed. */
export async function listDisplayableSources(db: Queryable): Promise<SourceHealth[]> {
  const res = await db.query(
    `SELECT id, name, enabled, last_run_at, last_status, last_error FROM sources WHERE displayable ORDER BY id`,
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    lastRunAt: r.last_run_at,
    lastStatus: r.last_status,
    lastError: r.last_error,
  }));
}

export interface ConsensusQuery {
  limit: number;
  /** Keyset position of the last row of the previous page; `firstSeen` is the timestamptz as text (exact). */
  after?: { count: number; firstSeen: string; repoId: number };
}

export interface ConsensusItem {
  repoId: number;
  fullName: string;
  /** Distinct displayable sources in the 7 days up to the latest scored date; equals `sources.length`. */
  consensusCount: number;
  /** Those sources, the one that flagged the repo first leading; `firstSeenAt` is the source's first signal ever. */
  sources: { source: string; firstSeenAt: Date }[];
  /** Only for the cursor; not part of the API response. */
  firstSeenText: string;
}

export interface ConsensusPage {
  /** Latest `repo_scores.date` (YYYY-MM-DD) the window ends at, or null when nothing is scored yet. */
  date: string | null;
  items: ConsensusItem[];
  hasMore: boolean;
}

/**
 * Repos flagged by 2 or more displayable sources in the 7 days up to the latest scored date, ordered by
 * source count DESC, earliest first-seen ASC, `repo_id`. Repos with no `repos` row are left out.
 */
export async function listConsensus(db: Queryable, q: ConsensusQuery): Promise<ConsensusPage> {
  const dateRes = await db.query<{ date: string | null }>("SELECT max(date)::text AS date FROM repo_scores");
  const date = dateRes.rows[0]?.date ?? null;
  if (!date) return { date: null, items: [], hasMore: false };

  const res = await db.query<{
    repo_id: number;
    full_name: string;
    n: number;
    first_seen_text: string;
    sources: string[];
    first_seen_ats: Date[];
  }>(
    `WITH ws AS (
       SELECT DISTINCT g.repo_id, g.source FROM signals g
         JOIN sources so ON so.id = g.source AND so.displayable
        WHERE ${consensusWindow("$1::date", "$2")}
     ), agg AS (
       SELECT ws.repo_id, count(*)::int AS n, min(f.first_seen_at) AS first_seen,
              array_agg(ws.source ORDER BY f.first_seen_at, ws.source) AS sources,
              array_agg(f.first_seen_at ORDER BY f.first_seen_at, ws.source) AS first_seen_ats
         FROM ws
        CROSS JOIN LATERAL (SELECT v.first_seen_at FROM repo_source_first_seen v
                             WHERE v.repo_id = ws.repo_id AND v.source = ws.source) f
        GROUP BY ws.repo_id
       HAVING count(*) >= 2
     )
     SELECT a.repo_id, r.full_name, a.n, a.first_seen::text AS first_seen_text, a.sources, a.first_seen_ats
       FROM agg a JOIN repos r ON r.repo_id = a.repo_id
      WHERE ($4::int IS NULL OR a.n < $4::int
             OR (a.n = $4::int AND (a.first_seen > $5::timestamptz
                                    OR (a.first_seen = $5::timestamptz AND a.repo_id > $6::bigint))))
      ORDER BY a.n DESC, a.first_seen, a.repo_id
      LIMIT $3`,
    [date, CONSENSUS_DAYS, q.limit + 1, q.after?.count ?? null, q.after?.firstSeen ?? null, q.after?.repoId ?? null],
  );

  const items = res.rows.slice(0, q.limit).map<ConsensusItem>((r) => ({
    repoId: r.repo_id,
    fullName: r.full_name,
    consensusCount: r.n,
    sources: r.sources.map((source, i) => ({ source, firstSeenAt: r.first_seen_ats[i]! })),
    firstSeenText: r.first_seen_text,
  }));
  return { date, items, hasMore: res.rows.length > q.limit };
}
