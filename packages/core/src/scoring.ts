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
  },
  lowkey: {
    maxStars: 200,
    maxDaysSincePush: 30,
    minContributors: 2,
    requireReadme: true,
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
    (!lk.requireReadme || input.hasReadme)
  ) {
    return "lowkey";
  }
  return null;
}

export type { ScoreComponents };
