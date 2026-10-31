import type { ScoreComponents, Tier } from "./types.js";

/**
 * Starting thresholds from the v1 spec. Tune against the hand-labelled set
 * (see Linear: "Lowkey score + hand-labelled tuning set").
 */
export const tierConfig = {
  trending: {
    /** Top share of repos by 7-day star velocity. */
    velocityPercentile: 0.99,
  },
  medium: {
    minStars: 500,
    /** Consecutive weeks of positive 30-day velocity. */
    minPositiveWeeks: 4,
    /** A week is positive when the 30 days ending at its checkpoint gained at least this many stars. */
    min30dStars: 1,
  },
  lowkey: {
    maxStars: 200,
    maxDaysSincePush: 30,
    minContributors: 2,
    requireReadme: true,
    /** 7-day daily star rate must be above the repo's own prior-83-day rate (no prior history counts as above). */
    requireVelocityAboveBaseline: true,
  },
} as const;

export const lowkeyWeights = {
  velocityLift: 0.35,
  activity: 0.25,
  contributors: 0.15,
  readmeQuality: 0.15,
  issueResponsiveness: 0.1,
} as const;

export type LowkeyComponent = keyof typeof lowkeyWeights;

/** Weighted sum of normalized (0..1) components. */
export function lowkeyScore(components: Record<LowkeyComponent, number>): number {
  let total = 0;
  for (const key of Object.keys(lowkeyWeights) as LowkeyComponent[]) {
    const v = Math.min(1, Math.max(0, components[key] ?? 0));
    total += lowkeyWeights[key] * v;
  }
  return Number(total.toFixed(4));
}

export interface TierInput {
  stars: number;
  starsLast7d: number;
  velocityPercentile: number;
  positiveWeeks: number;
  daysSincePush: number;
  contributors: number;
  hasReadme: boolean;
  listedByTrendingSource: boolean;
  /** 7-day daily star rate is above the repo's own prior-83-day daily rate; no prior history counts as above. */
  velocityAboveBaseline: boolean;
}

export function classifyTier(input: TierInput): Tier | null {
  if (
    input.velocityPercentile >= tierConfig.trending.velocityPercentile ||
    input.listedByTrendingSource
  ) {
    return "trending";
  }
  if (
    input.stars >= tierConfig.medium.minStars &&
    input.positiveWeeks >= tierConfig.medium.minPositiveWeeks
  ) {
    return "medium";
  }
  const lk = tierConfig.lowkey;
  if (
    input.stars < lk.maxStars &&
    input.daysSincePush <= lk.maxDaysSincePush &&
    input.contributors >= lk.minContributors &&
    (!lk.requireReadme || input.hasReadme) &&
    (!lk.requireVelocityAboveBaseline || input.velocityAboveBaseline)
  ) {
    return "lowkey";
  }
  return null;
}

export type { ScoreComponents };

export interface CandidateConfig {
  /** Window in days ending at the selection date (inclusive) for the velocity and signal reasons. */
  recentDays: number;
  /** Days before the recent window that make a repo's own baseline daily rate (7 + 83 = 90 days). */
  baselineDays: number;
  /** `velocity` reason: minimum stars gained in the recent window. */
  minStars7d: number;
  /** Maximum candidates stored per day, taken in priority order. */
  cap: number;
  /** `listCandidates({ needsMetadata })`: a repos row older than this many days counts as stale. */
  metadataMaxAgeDays: number;
  /** `listCandidatesNeedingContent`: a `repo_content` row fetched longer ago than this many days counts as stale. */
  contentMaxAgeDays: number;
}

/** Candidate selection (T021): which repos get metadata and README fetched each day. */
export const candidateConfig: CandidateConfig = {
  recentDays: 7,
  baselineDays: 83,
  minStars7d: 3,
  cap: 5000,
  metadataMaxAgeDays: 7,
  contentMaxAgeDays: 7,
};

/**
 * Normalisation constants for the five lowkey components (T010, HUN-150). Each component maps a raw
 * measure to 0..1: 0 at the low end, 1 at the "full" value or above. Starting points; tune against the
 * hand-labelled set, together with `lowkeyWeights`.
 */
export const lowkeyNormalisation = {
  velocityLift: {
    /** Floor for the repo's own prior daily star rate, so a repo with 0 prior stars does not divide by 0 or get a huge lift from one star. */
    baselineFloorStarsPerDay: 0.1,
    /** Lift (7-day daily rate / prior daily rate) that maps to 1; a lift of 1 (flat) maps to 0. */
    fullLift: 5,
    /** Component value when the repo has no `repo_daily` row in the baseline window (its lift is unknown). */
    noHistory: 0.5,
  },
  activity: {
    /** Pushes + PRs opened + issues opened in 30 days that map to 1. */
    fullEvents30d: 30,
  },
  contributors: {
    /** Distinct contributors that map to 1. */
    fullContributors: 5,
  },
  readme: {
    /** README characters (trimmed) that map to a full length score. */
    fullChars: 1500,
    /** Markdown headings that map to a full heading score. */
    fullHeadings: 5,
    /** Share of `readmeQuality` per part; the four sum to 1. */
    weights: { length: 0.4, headings: 0.3, install: 0.15, usage: 0.15 },
    /** A heading whose text matches counts as an install section (case-insensitive). */
    installHeading: /\b(install(ation)?|getting started|setup|set up)\b/i,
    /** A heading whose text matches counts as a usage section (case-insensitive). */
    usageHeading: /\b(usage|quick ?start|how to use|examples?)\b/i,
  },
} as const;

/** Fake-star check (T011). Run only for repos with an hourly star burst; a bounded stargazer sample is checked. */
export const fakeStarConfig = {
  /** A repo is checked when `repo_daily.stars_max_hour` reaches this on a day in the 7-day window. */
  burstStarsPerHour: 50,
  /** Newest stargazers fetched per checked repo (one GraphQL query). */
  sampleSize: 100,
  /** An account created fewer days than this before it starred the repo is low-activity. */
  minAccountAgeDays: 30,
  /** A repo is flagged when at least this share of the sample is low-activity. */
  flagShare: 0.5,
};

/** Source consensus (HUN-155): how many distinct sources flagging a repo count, and what they add to Trending. */
export const consensusConfig = {
  /** Days of signals, ending at the scoring window end (inclusive), in which a source counts as flagging a repo. */
  windowDays: 7,
  /** Trending score is multiplied by 1 + this × (consensus_count - 1), never below 1. */
  trendingBoostPerSource: 0.1,
} as const;

/**
 * The Trending score factor for `consensusCount` sources: 1 + `trendingBoostPerSource` × (count - 1), never below 1.
 * `applyConsensus` computes the same factor in SQL; `consensus.test.ts` checks the two agree.
 */
export function consensusBoostFactor(consensusCount: number): number {
  return 1 + consensusConfig.trendingBoostPerSource * Math.max(consensusCount - 1, 0);
}

export type TrackingPriority = "leader" | "normal" | "parked";

/**
 * Tracked repos and API snapshots (T024, `docs/SPEC.md` § Tracking strategy). `cadenceDays` is how long after a
 * snapshot a repo is due again; `null` (`parked`) means only when a request marks it due.
 */
export const trackingConfig = {
  cadenceDays: { leader: 1, normal: 7, parked: null } as Record<TrackingPriority, number | null>,
  /** Repos per GraphQL snapshot query. */
  batchSize: 100,
  /** Most repos the `snapshot` job refreshes in one run (100 queries at the batch size). */
  dailyCap: 10_000,
  /** Window of default-branch commits stored as `commits_30d`. */
  commitWindowDays: 30,
};

/**
 * Idea groups and leader picks (T026, `docs/SPEC.md` § Tracking strategy). Starting points; tune with real data.
 */
export const groupingConfig = {
  /** Top repos of each group that become `leader` (snapshot daily). The rest of the group are `normal`. */
  leadersPerGroup: 2,
  /** Topics that say nothing about the idea. Compared after lowercasing. */
  genericTopics: ["awesome", "awesome-list", "github", "hacktoberfest", "open-source", "opensource", "hacktoberfest-accepted"],
  /** Event topics with a year (`hacktoberfest2025`) are generic too. */
  genericTopicPattern: /^hacktoberfest\d+$/,
  /** Topics kept in the key (the most specific ones; see `ideaGroupKey`). */
  topicsInKey: 2,
  /** Stack tags that name a language (`deriveStackTags` kinds). A framework tag is the primary stack tag before any of these. */
  languageStackTags: ["go", "java", "node", "python", "rust"],
  /**
   * Leader ranking inside a group: `score` (latest `repo_scores.score`) and `commits30d` (latest snapshot in the
   * last 30 days) are each divided by the group's maximum, so tiers with different score scales compare,
   * then weighted. A repo whose rank is 0 (no score and no commits) never becomes a leader.
   */
  leaderWeights: { score: 0.6, commits30d: 0.4 },
  /** A repo with no score and no snapshot in this many days before the regroup date is `parked`. */
  activeWindowDays: 30,
  /** After a repo's first snapshot it is due again this many days later, whatever its priority (not `parked`), so velocity shows after 1 day. */
  firstSnapshotFollowUpDays: 1,
};

/**
 * GitHub Search discovery (T025, `docs/SPEC.md` § Tracking strategy). The `discover` job runs, for every language,
 * one query for repos created within `createdWithinDays` and one for repos pushed within `pushedWithinDays`,
 * both with a star count in `stars`. Search returns at most 1,000 results per query (10 pages of 100) and allows 30 requests a minute.
 */
export const discoveryConfig = {
  languages: ["TypeScript", "JavaScript", "Python", "Go", "Rust", "Java"],
  createdWithinDays: 30,
  pushedWithinDays: 7,
  /** Star range of the lowkey tier, inclusive. */
  stars: { min: 5, max: 200 },
  /** Pages of 100 fetched per query (at most 10: the Search cap). */
  pagesPerQuery: 5,
  /** Most Search requests one `discover` run makes. */
  dailyRequestCap: 120,
};

/** The Search queries of one `discover` run at `now`: per language a created query, then a pushed query. Windows count back from the UTC day of `now`. */
export function discoveryQueries(now: Date): string[] {
  const since = (days: number) => new Date(now.getTime() - days * 24 * 3_600_000).toISOString().slice(0, 10);
  const stars = `stars:${discoveryConfig.stars.min}..${discoveryConfig.stars.max}`;
  return discoveryConfig.languages.flatMap((language) => [
    `language:${language} created:>=${since(discoveryConfig.createdWithinDays)} ${stars}`,
    `language:${language} pushed:>=${since(discoveryConfig.pushedWithinDays)} ${stars}`,
  ]);
}
