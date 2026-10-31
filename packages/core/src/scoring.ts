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
