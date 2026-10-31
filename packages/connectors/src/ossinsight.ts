import type { SourceConnector, Signal } from "@idea-radar/core";

export interface OssInsightTrendingRow {
  repo_id: number | string;
  repo_name: string;
  primary_language?: string | null;
  stars?: number | string;
  total_score?: number | string;
  collection_names?: string | null;
}

const BASE = "https://api.ossinsight.io/v1";

/**
 * Optional. Public API, no key, 600 requests/hour per IP.
 * Gives trending by period/language and curated collections (category tags).
 * Linear: HUN-152
 */
export class OssInsightConnector implements SourceConnector<OssInsightTrendingRow> {
  readonly id = "ossinsight";
  readonly name = "OSS Insight";
  readonly licenseNote = "Public API; check ossinsight.io terms before display";
  readonly displayable = true;
  readonly rateLimit = { perHour: 600, concurrency: 2 };
  readonly schedule = "daily" as const;

  constructor(
    readonly enabled = true,
    readonly periods = ["past_24_hours", "past_week", "past_month"] as const,
  ) {}

  async *fetch(_since: Date): AsyncIterable<OssInsightTrendingRow> {
    for (const period of this.periods) {
      const url = `${BASE}/trends/repos/?period=${period}`;
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`OSS Insight ${period}: HTTP ${res.status}`);
      const body = (await res.json()) as { data?: { rows?: OssInsightTrendingRow[] } };
      for (const row of body.data?.rows ?? []) yield row;
    }
  }

  normalize(item: OssInsightTrendingRow): Signal[] {
    return [
      {
        repoId: Number(item.repo_id),
        fullName: item.repo_name,
        source: this.id,
        signalType: "trending",
        value: {
          score: item.total_score != null ? Number(item.total_score) : null,
          language: item.primary_language ?? null,
          collections: item.collection_names?.split(",").map((s) => s.trim()) ?? [],
        },
        observedAt: new Date(),
      },
    ];
  }
}
