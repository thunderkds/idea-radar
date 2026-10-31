/** GitHub numeric repository ID — stable across renames and transfers. */
export type RepoId = number;

export type Tier = "trending" | "medium" | "lowkey";

/** Canonical repo metadata. Only the GitHub API connector writes this. */
export interface Repo {
  repoId: RepoId;
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
  license: string | null;
  stars: number;
  forks: number;
  archived: boolean;
  createdAt: Date;
  pushedAt: Date | null;
}

/** Daily activity rollup per repo, computed from GH Archive events. */
export interface RepoDaily {
  repoId: RepoId;
  date: string; // YYYY-MM-DD (UTC)
  starsNew: number;
  forksNew: number;
  pushes: number;
  issuesOpened: number;
  prsOpened: number;
  distinctActors: number;
}

/**
 * One observation from one source about one repo.
 * Append-only; scores are derived from these.
 * Examples: github_trending/listed, ossinsight/trending_rank, trendshift/spike.
 */
export interface Signal {
  repoId: RepoId;
  /** Present when the source only knows owner/name; resolved to repoId during normalize. */
  fullName?: string;
  source: string;
  signalType: string;
  value: Record<string, unknown>;
  observedAt: Date;
}

export interface ScoreComponents {
  [component: string]: number;
}

export interface RepoScore {
  repoId: RepoId;
  date: string;
  tier: Tier;
  score: number;
  components: ScoreComponents;
  consensusCount: number;
}
