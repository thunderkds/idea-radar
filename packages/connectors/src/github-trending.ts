import type { SourceConnector, Signal } from "@idea-radar/core";

export interface TrendingEntry {
  fullName: string;
  rank: number;
  period: "daily" | "weekly" | "monthly";
  language: string | null;
  starsInPeriod: number | null;
}

/**
 * Daily scrape of github.com/trending. Brittle by nature: keep parsing isolated
 * and fail loudly so the Ops view shows breakage.
 * Linear: HUN-147
 */
export class GithubTrendingConnector implements SourceConnector<TrendingEntry> {
  readonly id = "github_trending";
  readonly name = "GitHub Trending page";
  readonly enabled = true;
  readonly licenseNote = "Public page; store rank only";
  readonly displayable = true;
  readonly rateLimit = { perHour: 60, concurrency: 1 };
  readonly schedule = "daily" as const;

  constructor(
    readonly languages: (string | null)[] = [null, "typescript", "python", "go", "rust"],
    readonly periods: TrendingEntry["period"][] = ["daily", "weekly", "monthly"],
  ) {}

  async *fetch(_since: Date): AsyncIterable<TrendingEntry> {
    // TODO(HUN-147): GET https://github.com/trending/{language}?since={period},
    // parse each <article class="Box-row"> into a TrendingEntry with its rank.
    return;
  }

  normalize(item: TrendingEntry): Signal[] {
    return [
      {
        repoId: 0, // resolved from fullName during ingest
        fullName: item.fullName,
        source: this.id,
        signalType: "listed",
        value: {
          rank: item.rank,
          period: item.period,
          language: item.language,
          starsInPeriod: item.starsInPeriod,
        },
        observedAt: new Date(),
      },
    ];
  }
}
