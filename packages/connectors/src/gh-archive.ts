import type { SourceConnector, Signal } from "@idea-radar/core";

/** The subset of GH Archive event types we keep. Everything else is dropped at ingest. */
export const KEPT_EVENT_TYPES = [
  "WatchEvent", // a star
  "ForkEvent",
  "PushEvent",
  "IssuesEvent",
  "PullRequestEvent",
] as const;

export type KeptEventType = (typeof KEPT_EVENT_TYPES)[number];

export interface GhArchiveEvent {
  type: string;
  actor: { id: number; login: string };
  repo: { id: number; name: string };
  created_at: string;
  payload?: { action?: string };
}

/**
 * Hourly public event dumps (https://www.gharchive.org) — the basis for star
 * velocity across all public repos, and the only source that can surface the
 * lowkey tier. Events are rolled up into repo_daily rather than stored raw.
 * Linear: HUN-146
 */
export class GhArchiveConnector implements SourceConnector<GhArchiveEvent> {
  readonly id = "gh_archive";
  readonly name = "GH Archive";
  readonly enabled = true;
  readonly licenseNote = "Public event data";
  readonly displayable = true;
  readonly rateLimit = { perHour: 60, concurrency: 2 };
  readonly schedule = "hourly" as const;

  constructor(readonly mode: "dumps" | "bigquery" = "dumps") {}

  async *fetch(_since: Date): AsyncIterable<GhArchiveEvent> {
    // TODO(HUN-146): for each hour since `since`, download
    // https://data.gharchive.org/YYYY-MM-DD-H.json.gz, stream-gunzip,
    // parse NDJSON and yield events whose type is in KEPT_EVENT_TYPES.
    return;
  }

  isKept(event: GhArchiveEvent): event is GhArchiveEvent & { type: KeptEventType } {
    return (KEPT_EVENT_TYPES as readonly string[]).includes(event.type);
  }

  /** Events feed the repo_daily rollup, not the signals table. */
  normalize(_item: GhArchiveEvent): Signal[] {
    return [];
  }
}
