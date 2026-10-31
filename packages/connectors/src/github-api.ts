import type { SourceConnector, Signal } from "@idea-radar/core";

export interface GithubRepoNode {
  databaseId: number;
  nameWithOwner: string;
  description: string | null;
  stargazerCount: number;
  forkCount: number;
  isArchived: boolean;
  primaryLanguage: { name: string } | null;
  licenseInfo: { spdxId: string } | null;
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  createdAt: string;
  pushedAt: string | null;
}

/**
 * Canonical metadata source. GraphQL-first: 5,000 points/hr per token,
 * max 2,000 points/min, max 100 concurrent requests (shared with REST).
 * Linear: HUN-145
 */
export class GithubApiConnector implements SourceConnector<GithubRepoNode> {
  readonly id = "github_api";
  readonly name = "GitHub API";
  readonly licenseNote = "GitHub API terms; canonical metadata";
  readonly displayable = true;
  readonly rateLimit = { perHour: 5000, concurrency: 10 };
  readonly schedule = "daily" as const;

  constructor(
    private readonly token: string | undefined,
    readonly enabled = Boolean(token),
  ) {}

  async *fetch(_since: Date): AsyncIterable<GithubRepoNode> {
    // TODO(HUN-145): batch repo IDs from the candidate shortlist into GraphQL
    // `nodes(ids: …)` queries and track `rateLimit { cost remaining resetAt }`.
    return;
  }

  normalize(item: GithubRepoNode): Signal[] {
    return [
      {
        repoId: item.databaseId,
        fullName: item.nameWithOwner,
        source: this.id,
        signalType: "metadata",
        value: {
          stars: item.stargazerCount,
          forks: item.forkCount,
          language: item.primaryLanguage?.name ?? null,
          topics: item.repositoryTopics.nodes.map((n) => n.topic.name),
          license: item.licenseInfo?.spdxId ?? null,
          archived: item.isArchived,
          pushedAt: item.pushedAt,
        },
        observedAt: new Date(),
      },
    ];
  }
}
