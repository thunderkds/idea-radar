import { fakeStarConfig } from "./scoring.js";

/** One sampled stargazer: when it starred and the account facts the fake-star rule needs. */
export interface StargazerAccount {
  /** ISO time the account starred the repo. */
  starredAt: string;
  /** ISO time the account was created. */
  createdAt: string;
  publicRepos: number;
  followers: number;
  /** Contributions in the last year. */
  contributions: number;
}

type FakeStarRule = Pick<typeof fakeStarConfig, "minAccountAgeDays">;

const DAY_MS = 24 * 3_600_000;

/**
 * Low-activity account: created fewer than `minAccountAgeDays` days before it starred the repo,
 * or no public activity (0 public repos, 0 followers and 0 contributions in the last year).
 * An unparseable date counts as not low-activity on that test, so bad data never inflates the share.
 */
export function isLowActivity(
  account: StargazerAccount,
  config: FakeStarRule = fakeStarConfig,
): boolean {
  const ageMs = Date.parse(account.starredAt) - Date.parse(account.createdAt);
  if (ageMs < config.minAccountAgeDays * DAY_MS) return true;
  return account.publicRepos === 0 && account.followers === 0 && account.contributions === 0;
}

/** Share (0..1) of the sample that is low-activity; null for an empty sample. */
export function suspiciousShare(sample: StargazerAccount[], config: FakeStarRule = fakeStarConfig): number | null {
  if (sample.length === 0) return null;
  return sample.filter((a) => isLowActivity(a, config)).length / sample.length;
}
