import type { Signal } from "./types.js";

export interface RateLimit {
  /** Requests (or points) allowed per hour. */
  perHour: number;
  /** Max concurrent in-flight requests. GitHub caps this at 100 across REST + GraphQL. */
  concurrency: number;
}

/**
 * Every data source implements this. v3 sources (GitLab, Medium, …) are new
 * implementations, not a rewrite.
 */
export interface SourceConnector<RawItem = unknown> {
  /** Stable id, e.g. "github_trending", "ossinsight". */
  readonly id: string;
  /** Human-readable name for the ops view. */
  readonly name: string;
  /** Whether the connector is turned on (driven by env / sources table). */
  readonly enabled: boolean;
  /** Licensing constraints, e.g. "no redistribution — scoring only". */
  readonly licenseNote: string;
  /** Whether raw data from this source may be shown in the UI / exposed via API. */
  readonly displayable: boolean;
  readonly rateLimit: RateLimit;
  /** How often the scheduler should run it. */
  readonly schedule: "hourly" | "daily";

  /** Pull raw items observed since the given time. */
  fetch(since: Date): AsyncIterable<RawItem>;

  /** Convert one raw item into zero or more signals keyed by GitHub repo. */
  normalize(item: RawItem): Signal[];
}

export interface ConnectorRunResult {
  connectorId: string;
  startedAt: Date;
  finishedAt: Date;
  signalsWritten: number;
  status: "ok" | "error";
  error?: string;
}
