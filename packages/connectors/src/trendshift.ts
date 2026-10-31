import type { SourceConnector, Signal } from "@idea-radar/core";

export interface TrendshiftSpike {
  full_name: string;
  metric: string;
  value: number;
}

/**
 * Optional, paid ($9/mo Starter). Terms forbid redistributing raw API data,
 * so signals feed scoring only and are never shown or re-exposed.
 * Linear: HUN-153
 */
export class TrendshiftConnector implements SourceConnector<TrendshiftSpike> {
  readonly id = "trendshift";
  readonly name = "Trendshift";
  readonly licenseNote = "No redistribution — internal scoring only";
  readonly displayable = false;
  readonly rateLimit = { perHour: 600, concurrency: 1 };
  readonly schedule = "daily" as const;

  constructor(
    private readonly apiKey: string | undefined,
    readonly enabled = Boolean(apiKey),
  ) {}

  async *fetch(_since: Date): AsyncIterable<TrendshiftSpike> {
    // TODO(HUN-153): GET /v1/engagement-spikes/{metric} with the API key.
    return;
  }

  normalize(item: TrendshiftSpike): Signal[] {
    return [
      {
        repoId: 0,
        fullName: item.full_name,
        source: this.id,
        signalType: "engagement_spike",
        value: { metric: item.metric, value: item.value },
        observedAt: new Date(),
      },
    ];
  }
}
