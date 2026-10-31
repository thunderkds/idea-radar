import { claimNext, completeJob, enqueueDue, failJob, heartbeatJob, recordSourceRun } from "@idea-radar/db";
import type { ClaimCaps, Job, Pool } from "@idea-radar/db";
import type { JobHandler } from "./handlers.js";
import { buildSchedule } from "./handlers.js";

export interface RunWorkerOptions {
  db: Pool;
  handlers: Record<string, JobHandler>;
  caps: ClaimCaps;
  /** One enqueue + drain pass, then return. Default: run until `signal` aborts. */
  once?: boolean;
  /** Pause between polls when nothing is claimable. Default 5000. */
  pollMs?: number;
  /** How often a running job refreshes its `locked_at`. Default 60000; keep far below the shortest job timeout (2 h). */
  heartbeatMs?: number;
  signal?: AbortSignal;
  /** Injected in tests. Default: the real clock. */
  now?: () => Date;
  log?: (line: string) => void;
}

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Run one claimed job: handler, then job state and source health. Never throws. A heartbeat keeps the
 * job's `locked_at` fresh while the handler runs. A run whose token no longer matches (a newer run
 * reclaimed the job) changes nothing, logs `lost` and records no source health.
 */
async function runJob(job: Job, opts: RunWorkerOptions): Promise<void> {
  const { db, handlers } = opts;
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => {});
  const handler = handlers[job.name];
  const startedAt = now();
  const line = (fields: object) => log(JSON.stringify({ job: job.name, dataKey: job.dataKey, ...fields }));
  const heartbeat = setInterval(() => {
    heartbeatJob(db, job, now()).then(
      (alive) => alive || line({ status: "heartbeat_lost" }),
      (err: unknown) => line({ status: "heartbeat_error", error: errorMessage(err) }),
    );
  }, opts.heartbeatMs ?? 60_000);
  try {
    if (!handler) throw new Error(`no handler for job "${job.name}"`);
    // A handler that completes the job in its own transaction returns "completed".
    const completed = (await handler.run({ db, job, now: startedAt })) === "completed";
    if (!completed && !(await completeJob(db, job, now()))) {
      line({ status: "lost" });
      return;
    }
    if (handler.sourceId) await recordSourceRun(db, handler.sourceId, "ok", null, now());
    line({ status: "ok", ms: now().getTime() - startedAt.getTime() });
  } catch (err) {
    const message = errorMessage(err);
    try {
      const next = await failJob(db, job, message, now());
      if (next === null) return line({ status: "lost", error: message });
      if (handler?.sourceId) await recordSourceRun(db, handler.sourceId, "error", message, now());
      line({ status: next, error: message });
    } catch (bookkeeping) {
      // Could not even record the failure (database down): the stuck-job timeout reclaims the job.
      line({ status: "unrecorded", error: errorMessage(bookkeeping) });
    }
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * The worker: each pass enqueues the jobs due now (idempotent), then claims and runs jobs up to the
 * caps. With `once` it returns when nothing is claimable and nothing is running; otherwise it polls
 * until `signal` aborts, then waits for running jobs to finish.
 */
export async function runWorker(opts: RunWorkerOptions): Promise<void> {
  const now = opts.now ?? (() => new Date());
  const pollMs = opts.pollMs ?? 5000;
  const schedule = buildSchedule(opts.handlers);
  const running = new Set<Promise<void>>();

  while (!opts.signal?.aborted) {
    await enqueueDue(opts.db, now(), schedule);
    let claimedAny = false;
    for (;;) {
      const job = await claimNext(opts.db, opts.caps, now());
      if (!job) break;
      claimedAny = true;
      const task: Promise<void> = runJob(job, opts).finally(() => running.delete(task));
      running.add(task);
    }
    if (opts.once) {
      if (running.size > 0) await Promise.race(running); // a finished job may unblock a dependent one
      else if (!claimedAny) break;
      continue;
    }
    // Wake when a job ends (a slot or a dependent job may have opened), on abort, or after the poll interval.
    let timer: NodeJS.Timeout | undefined;
    const tick = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, pollMs);
      opts.signal?.addEventListener("abort", () => resolve(), { once: true });
    });
    await Promise.race([tick, ...running]);
    clearTimeout(timer);
  }
  await Promise.all(running);
}
