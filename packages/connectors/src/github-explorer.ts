import type { SourceConnector, Signal } from "@idea-radar/core";

export interface ExplorerProject {
  full_name?: string;
  fullName?: string;
  category?: string;
  [key: string]: unknown;
}

/**
 * Optional. Reads the committed data/projects.json from the GitHub Explorer
 * repo as an AI/agent curation signal. Check that repo's license first.
 * Linear: HUN-154
 */
export class GithubExplorerConnector implements SourceConnector<ExplorerProject> {
  readonly id = "github_explorer";
  readonly name = "GitHub Explorer";
  readonly licenseNote = "Check upstream repo license before enabling";
  readonly displayable = true;
  readonly rateLimit = { perHour: 24, concurrency: 1 };
  readonly schedule = "daily" as const;

  constructor(readonly enabled = false) {}

  async *fetch(_since: Date): AsyncIterable<ExplorerProject> {
    // TODO(HUN-154): fetch data/projects.json via the GitHub contents API.
    return;
  }

  normalize(item: ExplorerProject): Signal[] {
    const fullName = item.full_name ?? item.fullName;
    if (!fullName) return [];
    return [
      {
        repoId: 0,
        fullName,
        source: this.id,
        signalType: "curated",
        value: { category: item.category ?? null },
        observedAt: new Date(),
      },
    ];
  }
}
