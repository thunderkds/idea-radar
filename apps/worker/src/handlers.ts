import type { SourceConnector } from "@idea-radar/core";
import { GhArchiveConnector, GithubApiConnector } from "@idea-radar/connectors";
import {
  completeJob,
  DEFAULT_GLOBAL_CONCURRENCY,
  getCursor,
  insertSignals,
  listUnresolvedNames,
  markNotFound,
  resolvePending,
  SCORE_JOB,
  scoreDay,
  setCursor,
  upsertRepo,
  upsertRepoDaily,
} from "@idea-radar/db";
import type { ClaimCaps, Job, JobSchedule, Pool } from "@idea-radar/db";

type IngestOptions = NonNullable<Parameters<GhArchiveConnector["ingest"]>[1]>;
type RollupStore = Parameters<GhArchiveConnector["ingest"]>[0];

export const RESOLVE_PENDING_JOB = "resolve_pending";
const GH_ARCHIVE_ID = "gh_archive";
const GITHUB_API_ID = "github_api";
const DAY_MS = 24 * 3_600_000;
const SIGNAL_BATCH = 500;
/** One resolve_pending run looks up this many unresolved names (the connector batches 100 per query). */
const RESOLVE_LIMIT = 100;
/** A GH Archive day is minutes of CPU: no short timeout. */
const GH_ARCHIVE_TIMEOUT_MS = 6 * 3_600_000;

export interface JobContext {
  db: Pool;
  job: Job;
  now: Date;
}

/** One kind of job. `sourceId` is the `sources` row that records each run's health (null: none). */
export interface JobHandler {
  sourceId: string | null;
  run(ctx: JobContext): Promise<void>;
}

export interface HandlerDeps {
  /** From `buildRegistry()`. The `GithubApiConnector` in it is the one shared instance for the process. */
  connectors: SourceConnector[];
  /** Options passed to the GH Archive ingest (tests inject `fetchImpl` and `now`). */
  ghArchive?: IngestOptions;
}

/** Adapt the db cursor and rollup functions to the GH Archive ingester's storage interface. */
function rollupStore(db: Pool): RollupStore {
  return {
    getCursor: () => getCursor(db, GH_ARCHIVE_ID),
    setCursor: (date) => setCursor(db, GH_ARCHIVE_ID, date),
    writeDaily: (rows) => upsertRepoDaily(db, rows),
  };
}

/**
 * A `fetch`-based connector: fetch, normalize, insert. One transaction per run that also completes
 * the job, so a failed run leaves no signals and a retry cannot duplicate them (gap A12).
 */
function fetchHandler(c: SourceConnector): JobHandler {
  return {
    sourceId: c.id,
    async run({ db, job, now }) {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        let batch: ReturnType<SourceConnector["normalize"]> = [];
        for await (const item of c.fetch(new Date(now.getTime() - DAY_MS))) {
          batch.push(...c.normalize(item));
          if (batch.length >= SIGNAL_BATCH) {
            await insertSignals(client, batch);
            batch = [];
          }
        }
        await insertSignals(client, batch);
        await completeJob(client, job.id);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

/** Queue names, the schedule and the claim caps all derive from the connector registry. */
export function buildHandlers(deps: HandlerDeps): Record<string, JobHandler> {
  const handlers: Record<string, JobHandler> = {};
  const github = deps.connectors.find((c): c is GithubApiConnector => c instanceof GithubApiConnector);
  const archive = deps.connectors.find((c): c is GhArchiveConnector => c instanceof GhArchiveConnector);

  for (const c of deps.connectors) {
    if (!c.enabled || c.id === GH_ARCHIVE_ID || c.id === GITHUB_API_ID) continue;
    handlers[c.id] = fetchHandler(c);
  }
  if (archive?.enabled) {
    handlers[GH_ARCHIVE_ID] = {
      sourceId: GH_ARCHIVE_ID,
      // No new completed UTC day: ingest is a no-op. A 404 (`stoppedAt`) is the day not published yet, not an error.
      run: async ({ db }) => void (await archive.ingest(rollupStore(db), deps.ghArchive)),
    };
  }
  if (github?.enabled) {
    handlers[RESOLVE_PENDING_JOB] = {
      sourceId: GITHUB_API_ID,
      async run({ db }) {
        const names = await listUnresolvedNames(db, RESOLVE_LIMIT);
        if (names.length === 0) return;
        const { resolved, notFound } = await github.resolveNames(names);
        await upsertRepo(db, [...resolved.values()]);
        await resolvePending(db, new Map([...resolved].map(([name, repo]) => [name, repo.repoId])));
        await markNotFound(db, notFound);
      },
    };
  }
  // Windows end at the last ingested GH Archive day when it lags behind the last complete UTC day.
  handlers[SCORE_JOB] = {
    sourceId: null,
    async run({ db, job }) {
      const cursor = await getCursor(db, GH_ARCHIVE_ID);
      await scoreDay(db, job.dataKey, cursor ? { windowEnd: cursor } : {});
    },
  };
  return handlers;
}

/** `gh_archive` hourly; every other handler daily. */
export function buildSchedule(handlers: Record<string, JobHandler>): JobSchedule {
  const names = Object.keys(handlers);
  return { hourly: names.filter((n) => n === GH_ARCHIVE_ID), daily: names.filter((n) => n !== GH_ARCHIVE_ID) };
}

/**
 * Per-name caps from each connector's `rateLimit.concurrency`. `gh_archive` is capped at 1: its ingest
 * walks one cursor, so two at once would process the same day twice. `resolve_pending` is the
 * GitHub API connector's work and takes its limit. `score` runs alone.
 */
export function buildCaps(connectors: SourceConnector[], env: NodeJS.ProcessEnv = process.env): ClaimCaps {
  const perName: Record<string, number> = { [GH_ARCHIVE_ID]: 1, [SCORE_JOB]: 1 };
  for (const c of connectors) {
    if (c.id === GH_ARCHIVE_ID) continue;
    perName[c.id === GITHUB_API_ID ? RESOLVE_PENDING_JOB : c.id] = c.rateLimit.concurrency;
  }
  const requested = Number(env.WORKER_MAX_CONCURRENCY);
  return {
    global: Number.isInteger(requested) && requested >= 1 ? requested : DEFAULT_GLOBAL_CONCURRENCY,
    perName,
    timeoutMs: { [GH_ARCHIVE_ID]: GH_ARCHIVE_TIMEOUT_MS },
  };
}
