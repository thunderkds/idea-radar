import type { SourceConnector } from "@idea-radar/core";
import { GhArchiveConnector, GithubApiConnector } from "@idea-radar/connectors";
import {
  applyConsensus,
  applyFakeStarFlags,
  completeJob,
  DEFAULT_GLOBAL_CONCURRENCY,
  getCursor,
  insertSignals,
  listCandidates,
  listCandidatesNeedingContent,
  listUnresolvedNames,
  markNotFound,
  resolvePending,
  SCORE_JOB,
  scoreDay,
  selectCandidates,
  setCursor,
  upsertRepo,
  upsertRepoContent,
  upsertRepoDaily,
} from "@idea-radar/db";
import type { ClaimCaps, Job, JobSchedule, Pool } from "@idea-radar/db";

type IngestOptions = NonNullable<Parameters<GhArchiveConnector["ingest"]>[1]>;
type RollupStore = Parameters<GhArchiveConnector["ingest"]>[0];

export const RESOLVE_PENDING_JOB = "resolve_pending";
export const SHORTLIST_JOB = "shortlist";
const GH_ARCHIVE_ID = "gh_archive";
const GITHUB_API_ID = "github_api";
const DAY_MS = 24 * 3_600_000;
const SIGNAL_BATCH = 500;
/** One resolve_pending run looks up this many unresolved names (the connector batches 100 per query). */
const RESOLVE_LIMIT = 100;
/** A GH Archive day is minutes of CPU: no short timeout. */
const GH_ARCHIVE_TIMEOUT_MS = 6 * 3_600_000;
/** A shortlist run can sit out a GitHub rate-limit reset (up to an hour), so it gets the same long timeout. */
const SHORTLIST_TIMEOUT_MS = 6 * 3_600_000;
/** The shortlist job writes to the database after every this many repos, so a failure keeps earlier work. */
const SHORTLIST_CHUNK = 200;

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
  /** One JSON line per notable event outside a job's normal result (default: none; the worker entry point passes `console.log`). */
  log?: (line: string) => void;
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
function fetchHandler(c: SourceConnector, log: (line: string) => void): JobHandler {
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
        // The original error is what the job reports; a failed ROLLBACK (dead connection) is only logged.
        await client.query("ROLLBACK").catch((rollbackErr: unknown) =>
          log(
            JSON.stringify({
              level: "warn",
              job: c.id,
              jobId: job.id,
              message: "ROLLBACK failed after a fetch error; rethrowing the original error",
              error: String(rollbackErr),
            }),
          ),
        );
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Daily shortlist (HUN-148) for the last day GH Archive has ingested: pick the day's candidates, then,
 * with a GitHub token, fetch metadata for those with no fresh `repos` row and README, manifests and
 * the file tree for those with no fresh `repo_content` row. Safe to re-run: selection rewrites the
 * day and each step skips what is fresh, so a retry after a failure only does the remainder.
 * Without a token the run only selects, and its health is not recorded against `github_api`.
 */
function shortlistHandler(github: GithubApiConnector | undefined, log: (line: string) => void): JobHandler {
  const enabled = Boolean(github?.enabled);
  return {
    sourceId: enabled ? GITHUB_API_ID : null,
    async run({ db }) {
      const day = await getCursor(db, GH_ARCHIVE_ID);
      if (!day) {
        log(JSON.stringify({ job: SHORTLIST_JOB, skipped: "no gh_archive cursor yet" }));
        return;
      }
      const selection = await selectCandidates(db, day);
      const summary: Record<string, unknown> = { job: SHORTLIST_JOB, day, selected: selection.selected };
      if (!github?.enabled) {
        log(JSON.stringify({ ...summary, skipped: "GitHub API connector disabled (no token): no metadata or content fetch" }));
        return;
      }
      let metadata = 0, metadataMissing = 0, content = 0, contentMissing = 0;
      for (const ids of chunks(await listCandidates(db, day, { needsMetadata: true }), SHORTLIST_CHUNK)) {
        const { repos, missing } = await github.fetchByIds(ids);
        await upsertRepo(db, repos);
        metadata += repos.length;
        metadataMissing += missing.length;
      }
      for (const ids of chunks(await listCandidatesNeedingContent(db, day), SHORTLIST_CHUNK)) {
        const { contents, missing } = await github.fetchContent(ids);
        await upsertRepoContent(db, contents);
        content += contents.length;
        contentMissing += missing.length;
      }
      log(JSON.stringify({ ...summary, metadata, metadataMissing, content, contentMissing }));
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
    handlers[c.id] = fetchHandler(c, deps.log ?? (() => {}));
  }
  if (archive?.enabled) {
    handlers[GH_ARCHIVE_ID] = {
      sourceId: GH_ARCHIVE_ID,
      // No new completed UTC day: ingest is a no-op. A 404 (`stoppedAt`) is the day not published yet, not an error.
      run: async ({ db }) => void (await archive.ingest(rollupStore(db), deps.ghArchive)),
    };
  }
  handlers[SHORTLIST_JOB] = shortlistHandler(github, deps.log ?? (() => {}));
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
  // Order matters: scoreDay rewrites the date's rows, then applyConsensus boosts Trending and the fake-star
  // check (HUN-151) discounts flagged repos. Both multiply the stored score, so a rerun starts with scoreDay again.
  const log = deps.log ?? (() => {});
  handlers[SCORE_JOB] = {
    sourceId: null,
    async run({ db, job }) {
      const cursor = await getCursor(db, GH_ARCHIVE_ID);
      const windows = cursor ? { windowEnd: cursor } : {};
      await scoreDay(db, job.dataKey, windows);
      await applyConsensus(db, job.dataKey, windows);
      if (!github?.enabled) {
        log(JSON.stringify({ job: SCORE_JOB, date: job.dataKey, skipped: "fake-star check skipped: GitHub API connector disabled (no token)" }));
        return;
      }
      const run = await applyFakeStarFlags(db, job.dataKey, (id, n) => github.sampleStargazers(id, n), windows);
      log(JSON.stringify({ job: SCORE_JOB, date: job.dataKey, ...run }));
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
 * GitHub API connector's work and takes its limit. `shortlist` and `score` run alone.
 */
export function buildCaps(connectors: SourceConnector[], env: NodeJS.ProcessEnv = process.env): ClaimCaps {
  const perName: Record<string, number> = { [GH_ARCHIVE_ID]: 1, [SHORTLIST_JOB]: 1, [SCORE_JOB]: 1 };
  for (const c of connectors) {
    if (c.id === GH_ARCHIVE_ID) continue;
    perName[c.id === GITHUB_API_ID ? RESOLVE_PENDING_JOB : c.id] = c.rateLimit.concurrency;
  }
  const requested = Number(env.WORKER_MAX_CONCURRENCY);
  return {
    global: Number.isInteger(requested) && requested >= 1 ? requested : DEFAULT_GLOBAL_CONCURRENCY,
    perName,
    timeoutMs: { [GH_ARCHIVE_ID]: GH_ARCHIVE_TIMEOUT_MS, [SHORTLIST_JOB]: SHORTLIST_TIMEOUT_MS },
  };
}
