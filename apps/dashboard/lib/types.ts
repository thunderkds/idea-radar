/** Response shapes of apps/api, as the dashboard reads them. Fields marked optional arrive with HUN-155 (T015). */

export type Tier = "trending" | "medium" | "lowkey";
export type StarsWindow = "7d" | "30d";

export interface TierItem {
  repoId: number;
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  score: number;
  starsGained: number;
  components: Record<string, number>;
  stackTags: string[];
  consensusCount?: number;
  fakeStarFlag?: boolean;
}

export interface TierResponse {
  tier: Tier;
  date: string | null;
  items: TierItem[];
  nextCursor: string | null;
}

export interface TimelineEntry {
  source: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface RepoResponse {
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
    createdAt: string | null;
    pushedAt: string | null;
  };
  score: {
    date: string;
    tier: Tier;
    score: number;
    components: Record<string, number>;
    consensusCount?: number;
    fakeStarFlag?: boolean;
  } | null;
  starsSeries: { date: string; starsNew: number }[];
  stackTags: string[];
  readmeExcerpt: string | null;
  signals: { source: string; signalType: string; value: Record<string, unknown>; observedAt: string }[];
  timeline?: TimelineEntry[];
  /** The repo's tracking row (T027); null when not tracked. `nextDueAt` null = only on request. */
  tracking?: {
    priority: TrackingPriority;
    groupKey: string | null;
    lastSnapshotAt: string | null;
    nextDueAt: string | null;
  } | null;
  /** The other repos of the same idea group. */
  groupRepos?: { repoId: number; fullName: string; priority: TrackingPriority }[];
}

export type TrackingPriority = "leader" | "normal" | "parked";

/** What a refresh request names: one repo, or every tracked repo of an idea group. */
export type RescrapeTarget = { repoId: number } | { groupKey: string };

/** What the refresh server action returns to the button: when it was queued, or why it was not. */
export type RescrapeResult = { ok: true; queued: number; at: string } | { ok: false; message: string };

export const TIERS: { id: Tier; label: string; blurb: string }[] = [
  { id: "lowkey", label: "Lowkey", blurb: "Under ~200 stars, active, growing faster than their own baseline" },
  { id: "medium", label: "Medium", blurb: "Steady growth over several weeks" },
  { id: "trending", label: "Trending", blurb: "Top star velocity and flagged by trending sources" },
];

export function isTier(value: string): value is Tier {
  return TIERS.some((t) => t.id === value);
}
