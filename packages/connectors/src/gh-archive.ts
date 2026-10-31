import { createGunzip } from "node:zlib";
import { Readable, pipeline } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import type { SourceConnector, Signal, RepoDaily } from "@idea-radar/core";

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

/** One repo_daily row. `RepoDaily` plus the two columns T002 adds (gaps A4, A5). */
export type DailyRollupRow = RepoDaily & {
  /** Distinct actor ids of PushEvent and opened PullRequestEvent that day (not stargazers). */
  contributors: number;
  /** Largest number of WatchEvents in a single UTC hour that day. */
  starsMaxHour: number;
};

/** What the ingester needs from storage. T007 adapts T002's getCursor/setCursor/upsertRepoDaily to it. */
export interface RollupStore {
  /** Last fully ingested UTC date (YYYY-MM-DD), or null on the first run. */
  getCursor(): Promise<string | null>;
  setCursor(date: string): Promise<void>;
  /** Replace semantics per (repoId, date): a rewritten day overwrites the old row. */
  writeDaily(rows: DailyRollupRow[]): Promise<void>;
}

export interface StreamStats {
  lines: number;
  /** Lines that were not valid JSON. */
  malformed: number;
}

export type AddResult = "kept" | "ignored" | "invalid" | "outOfDay";

const CREATED_AT = /^(\d{4}-\d{2}-\d{2})T(\d{2})/;
const isId = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

interface DayEntry {
  repoId: number;
  date: string;
  starsNew: number;
  forksNew: number;
  pushes: number;
  issuesOpened: number;
  prsOpened: number;
  actors: Set<number>;
  contributors: Set<number>;
  /** Stars per UTC hour; allocated on the first star. */
  starHours: number[] | null;
}

/**
 * Folds events into one entry per (repo_id, UTC date). Memory is bounded by the
 * number of active repos and their distinct actor ids, never by the event count.
 * With `onlyDate`, events dated on any other day are counted and dropped.
 */
export class DayAggregator {
  private readonly entries = new Map<string, DayEntry>();

  constructor(private readonly onlyDate?: string) {}

  add(event: GhArchiveEvent): AddResult {
    if (!event || !(KEPT_EVENT_TYPES as readonly string[]).includes(event.type)) return "ignored";
    const repoId = event.repo?.id;
    const actorId = event.actor?.id;
    const m = typeof event.created_at === "string" ? CREATED_AT.exec(event.created_at) : null;
    if (!isId(repoId) || !isId(actorId) || !m) return "invalid";
    const date = m[1]!;
    if (this.onlyDate !== undefined && date !== this.onlyDate) return "outOfDay";

    const key = `${repoId}|${date}`;
    let e = this.entries.get(key);
    if (!e) {
      e = {
        repoId, date,
        starsNew: 0, forksNew: 0, pushes: 0, issuesOpened: 0, prsOpened: 0,
        actors: new Set(), contributors: new Set(), starHours: null,
      };
      this.entries.set(key, e);
    }
    e.actors.add(actorId);
    const opened = event.payload?.action === "opened";
    switch (event.type as KeptEventType) {
      case "WatchEvent": {
        e.starsNew++;
        e.starHours ??= new Array<number>(24).fill(0);
        e.starHours[Number(m[2])]!++;
        break;
      }
      case "ForkEvent":
        e.forksNew++;
        break;
      case "PushEvent":
        e.pushes++;
        e.contributors.add(actorId);
        break;
      case "IssuesEvent":
        if (opened) e.issuesOpened++;
        break;
      case "PullRequestEvent":
        if (opened) {
          e.prsOpened++;
          e.contributors.add(actorId);
        }
        break;
    }
    return "kept";
  }

  /** Rows sorted by (date, repoId). */
  rows(): DailyRollupRow[] {
    return [...this.entries.values()]
      .map((e) => ({
        repoId: e.repoId,
        date: e.date,
        starsNew: e.starsNew,
        forksNew: e.forksNew,
        pushes: e.pushes,
        issuesOpened: e.issuesOpened,
        prsOpened: e.prsOpened,
        distinctActors: e.actors.size,
        contributors: e.contributors.size,
        starsMaxHour: e.starHours ? Math.max(...e.starHours) : 0,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.repoId - b.repoId));
  }
}

/** Aggregate events (any iterable) into repo_daily rows, split by the event's UTC date. */
export function rollup(events: Iterable<GhArchiveEvent>): DailyRollupRow[] {
  const agg = new DayAggregator();
  for (const e of events) agg.add(e);
  return agg.rows();
}

/** `https://data.gharchive.org/YYYY-MM-DD-H.json.gz` for the UTC hour of `date`; hour is not zero-padded. */
export function hourUrl(date: Date): string {
  return `https://data.gharchive.org/${date.toISOString().slice(0, 10)}-${date.getUTCHours()}.json.gz`;
}

/**
 * Gunzip a stream and yield one parsed JSON value per NDJSON line. Never holds
 * more than one chunk plus one partial line. A line that is not JSON is counted
 * in `stats.malformed` and skipped. A corrupt gzip body rejects.
 */
export async function* streamNdjsonGz(source: Readable, stats: StreamStats): AsyncGenerator<unknown> {
  const gunzip = createGunzip();
  pipeline(source, gunzip, () => {}); // a source error destroys gunzip, so the loop below rejects
  const decoder = new StringDecoder("utf8");
  let rest = "";
  const parse = (raw: string): { ok: true; value: unknown } | null => {
    const text = raw.trim();
    if (text === "") return null;
    stats.lines++;
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch {
      stats.malformed++;
      return null;
    }
  };
  for await (const chunk of gunzip) {
    rest += decoder.write(chunk as Buffer);
    let nl: number;
    while ((nl = rest.indexOf("\n")) !== -1) {
      const r = parse(rest.slice(0, nl));
      rest = rest.slice(nl + 1);
      if (r) yield r.value;
    }
  }
  const last = parse(rest + decoder.end());
  if (last) yield last.value;
}

export class HourNotPublishedError extends Error {
  constructor(readonly url: string) {
    super(`GH Archive dump not published yet: ${url}`);
  }
}

type FetchImpl = (url: string) => Promise<Response>;

async function openHour(url: string, fetchImpl: FetchImpl): Promise<Readable> {
  const res = await fetchImpl(url);
  if (res.status === 404) {
    await res.body?.cancel();
    throw new HourNotPublishedError(url);
  }
  if (!res.ok || !res.body) {
    await res.body?.cancel();
    throw new Error(`GH Archive request failed: HTTP ${res.status} ${url}`);
  }
  return Readable.fromWeb(res.body as never);
}

const DAY_MS = 86_400_000;
const utcDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) => utcDate(new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS));

/** Days to start from on the first run: `GHARCHIVE_BACKFILL_DAYS`, default 1 (yesterday only). */
export function backfillDaysFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.GHARCHIVE_BACKFILL_DAYS);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export interface IngestOptions {
  now?: Date;
  fetchImpl?: FetchImpl;
  /** Overrides `GHARCHIVE_BACKFILL_DAYS` for the first run. */
  backfillDays?: number;
  env?: NodeJS.ProcessEnv;
}

export interface IngestResult {
  daysProcessed: string[];
  hoursProcessed: number;
  /** Kept events folded into rows. */
  kept: number;
  /** Lines that were not JSON, plus kept events with a missing repo/actor id or bad created_at. */
  malformed: number;
  /** Kept events dated outside the day being ingested (dropped, see ingestDays). */
  outOfDay: number;
  /** URL of the first hour that returned 404; the run stopped there. */
  stoppedAt?: string;
  cursor: string | null;
}

/**
 * Ingest every completed UTC day after the store's cursor, oldest first.
 * A day is complete once its hour 23 dump can exist (now >= day+1 01:00 UTC).
 * Per day: stream hours 0..23 one after another into one aggregate, write the
 * rows once (replace semantics), then advance the cursor. A 404 hour stops the
 * run with the cursor on the last good day; other HTTP errors throw. A rerun
 * rewrites at most the day that was in flight, so it is idempotent.
 *
 * Events dated outside the day being ingested (late arrivals in a neighbouring
 * dump) are dropped: writing them would replace that day's complete row with a
 * partial one.
 */
export async function ingestDays(store: RollupStore, opts: IngestOptions = {}): Promise<IngestResult> {
  const now = opts.now ?? new Date();
  const fetchImpl: FetchImpl = opts.fetchImpl ?? ((u) => fetch(u));
  const lastComplete = addDays(utcDate(new Date(now.getTime() - 3_600_000)), -1);
  const cursor = await store.getCursor();
  const backfill = opts.backfillDays ?? backfillDaysFromEnv(opts.env);
  const first = cursor ? addDays(cursor, 1) : addDays(lastComplete, -(backfill - 1));

  const result: IngestResult = {
    daysProcessed: [], hoursProcessed: 0, kept: 0, malformed: 0, outOfDay: 0, cursor,
  };
  for (let day = first; day <= lastComplete; day = addDays(day, 1)) {
    const agg = new DayAggregator(day);
    const dayCounts = { hours: 0, kept: 0, malformed: 0, outOfDay: 0 };
    for (let h = 0; h < 24; h++) {
      const url = hourUrl(new Date(`${day}T${String(h).padStart(2, "0")}:00:00Z`));
      let source: Readable;
      try {
        source = await openHour(url, fetchImpl);
      } catch (err) {
        if (err instanceof HourNotPublishedError) {
          result.stoppedAt = url;
          return result;
        }
        throw err;
      }
      const stats: StreamStats = { lines: 0, malformed: 0 };
      for await (const raw of streamNdjsonGz(source, stats)) {
        const r = agg.add(raw as GhArchiveEvent);
        if (r === "kept") dayCounts.kept++;
        else if (r === "invalid") dayCounts.malformed++;
        else if (r === "outOfDay") dayCounts.outOfDay++;
      }
      dayCounts.malformed += stats.malformed;
      dayCounts.hours++;
    }
    const rows = agg.rows();
    if (rows.length > 0) await store.writeDaily(rows);
    await store.setCursor(day);
    result.cursor = day;
    result.daysProcessed.push(day);
    result.hoursProcessed += dayCounts.hours;
    result.kept += dayCounts.kept;
    result.malformed += dayCounts.malformed;
    result.outOfDay += dayCounts.outOfDay;
  }
  return result;
}

/**
 * Hourly public event dumps (https://www.gharchive.org) — the basis for star
 * velocity across all public repos, and the only source that can surface the
 * lowkey tier. Events are rolled up into repo_daily rather than stored raw,
 * one completed UTC day at a time (see `ingestDays`).
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

  /** The worker (T007) calls this each hour; it is a no-op until a new UTC day completes. */
  ingest(store: RollupStore, opts?: IngestOptions): Promise<IngestResult> {
    return ingestDays(store, opts);
  }

  /** GH Archive feeds repo_daily through `ingest()`, not signals, so there is nothing to yield. */
  async *fetch(_since: Date): AsyncIterable<GhArchiveEvent> {
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
