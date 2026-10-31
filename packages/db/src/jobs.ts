import type { Pool, Queryable } from "./index.js";

/**
 * Durable job queue on the `jobs` table (migration 004). A job is one row per `(name, data_key)`;
 * the key is the UTC hour (`2026-10-31T06`) for hourly jobs and the UTC date (`2026-10-31`) for daily
 * ones, so a job for a given data period exists once and never runs twice. Plain parameterised SQL.
 */

/** A job that fails this many times (or times out this many times) ends as `failed`. */
export const MAX_JOB_ATTEMPTS = 5;
/** Default cap on jobs running at once, across all names. Well under GitHub's 100 concurrent requests. */
export const DEFAULT_GLOBAL_CONCURRENCY = 20;
/** A job locked for longer than this is treated as stuck and reclaimed. */
export const DEFAULT_JOB_TIMEOUT_MS = 2 * 3_600_000;
/** The daily scoring job: claimable only when every other job of its date is `ok`. */
export const SCORE_JOB = "score";
/** `score(D)` waits until D 02:00 UTC: GH Archive's hour 23 of D-1 can exist from D 01:00. */
const SCORE_DELAY_MS = 2 * 3_600_000;
const BACKOFF_BASE_SECONDS = 30;
const BACKOFF_MAX_SECONDS = 3600;

export interface JobSchedule {
  /** Job names enqueued once per UTC hour. */
  hourly: string[];
  /** Job names enqueued once per UTC date (include `SCORE_JOB` to schedule scoring). */
  daily: string[];
}

export interface Job {
  id: number;
  name: string;
  dataKey: string;
  /** Failures so far, counting this run if it is a reclaim of a stuck job. */
  attempts: number;
}

export interface ClaimCaps {
  /** Max running jobs across all names. Default `DEFAULT_GLOBAL_CONCURRENCY`. */
  global?: number;
  /** Max running jobs per name (from each connector's `rateLimit.concurrency`). */
  perName?: Record<string, number>;
  /** Cap for a name missing from `perName`. Default 1. */
  defaultPerName?: number;
  /** Stuck-job timeout per name, in ms. */
  timeoutMs?: Record<string, number>;
  /** Timeout for a name missing from `timeoutMs`. Default `DEFAULT_JOB_TIMEOUT_MS`. */
  defaultTimeoutMs?: number;
}

/** Take a transaction-scoped lock so two claimers cannot both pass the concurrency count checks. */
const CLAIM_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtext('idea-radar:jobs:claim'))";

/**
 * Create the jobs due at `now`: each `hourly` name keyed by UTC hour, each `daily` name by UTC date.
 * Idempotent (`ON CONFLICT DO NOTHING`): calling it again, or on a restarted worker, adds nothing.
 * Returns the number of jobs created.
 */
export async function enqueueDue(db: Queryable, now: Date, schedule: JobSchedule): Promise<number> {
  const hour = now.toISOString().slice(0, 13);
  const date = now.toISOString().slice(0, 10);
  const dayStart = new Date(`${date}T00:00:00Z`).getTime();
  const rows: { name: string; key: string; runAfter: Date }[] = [
    ...schedule.hourly.map((name) => ({ name, key: hour, runAfter: now })),
    ...schedule.daily.map((name) => ({
      name,
      key: date,
      runAfter: name === SCORE_JOB ? new Date(dayStart + SCORE_DELAY_MS) : now,
    })),
  ];
  if (rows.length === 0) return 0;
  const res = await db.query(
    `INSERT INTO jobs (name, data_key, run_after)
     SELECT * FROM unnest($1::text[], $2::text[], $3::timestamptz[])
     ON CONFLICT (name, data_key) DO NOTHING`,
    [rows.map((r) => r.name), rows.map((r) => r.key), rows.map((r) => r.runAfter.toISOString())],
  );
  return res.rowCount ?? 0;
}

/**
 * Claim the oldest runnable job, or return null. Runnable means: pending and due, or running but
 * stuck past its timeout (reclaimed, counted as a failed attempt); within the per-name and global caps;
 * and, for `score`, with every other job of the same date `ok`. One transaction, `FOR UPDATE SKIP LOCKED`.
 */
export async function claimNext(pool: Pool, caps: ClaimCaps = {}, now: Date = new Date()): Promise<Job | null> {
  const nowIso = now.toISOString();
  const defaultTimeoutS = (caps.defaultTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS) / 1000;
  const timeoutsS = JSON.stringify(
    Object.fromEntries(Object.entries(caps.timeoutMs ?? {}).map(([k, v]) => [k, v / 1000])),
  );
  const timeoutOf = (col: string) => `coalesce(($3::jsonb->>${col})::float8, $4::float8) * interval '1 second'`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(CLAIM_LOCK_SQL);
    // A stuck job that has used up its attempts ends here instead of being claimed again.
    await client.query(
      `UPDATE jobs SET status = 'failed', attempts = attempts + 1, last_error = 'lock timeout',
                       locked_at = NULL, finished_at = $1::timestamptz
       WHERE status = 'running' AND attempts + 1 >= $2 AND locked_at < $1::timestamptz - ${timeoutOf("name")}`,
      [nowIso, MAX_JOB_ATTEMPTS, timeoutsS, defaultTimeoutS],
    );
    const res = await client.query<{ id: number; name: string; data_key: string; attempts: number }>(
      `WITH live AS (
         SELECT name, count(*)::int AS n FROM jobs
         WHERE status = 'running' AND locked_at >= $1::timestamptz - ${timeoutOf("name")}
         GROUP BY name
       ), pick AS (
         SELECT j.id FROM jobs j
         WHERE ((j.status = 'pending' AND j.run_after <= $1::timestamptz)
             OR (j.status = 'running' AND j.locked_at < $1::timestamptz - ${timeoutOf("j.name")}))
           AND (SELECT coalesce(sum(n), 0) FROM live) < $2
           AND coalesce((SELECT n FROM live WHERE live.name = j.name), 0)
               < coalesce(($5::jsonb->>j.name)::int, $6::int)
           AND (j.name <> '${SCORE_JOB}' OR NOT EXISTS (
                 SELECT 1 FROM jobs o
                 WHERE o.name <> '${SCORE_JOB}' AND left(o.data_key, 10) = left(j.data_key, 10) AND o.status <> 'ok'))
         ORDER BY j.run_after, j.id
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE jobs SET attempts = attempts + CASE WHEN status = 'running' THEN 1 ELSE 0 END,
                       status = 'running', locked_at = $1::timestamptz
       FROM pick WHERE jobs.id = pick.id
       RETURNING jobs.id, jobs.name, jobs.data_key, jobs.attempts`,
      [
        nowIso,
        caps.global ?? DEFAULT_GLOBAL_CONCURRENCY,
        timeoutsS,
        defaultTimeoutS,
        JSON.stringify(caps.perName ?? {}),
        caps.defaultPerName ?? 1,
      ],
    );
    await client.query("COMMIT");
    const row = res.rows[0];
    return row ? { id: row.id, name: row.name, dataKey: row.data_key, attempts: row.attempts } : null;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Mark a running job `ok`. A job no longer running (already completed, or reclaimed) is left alone. */
export async function completeJob(db: Queryable, id: number, now: Date = new Date()): Promise<void> {
  await db.query(
    `UPDATE jobs SET status = 'ok', locked_at = NULL, last_error = NULL, finished_at = $2::timestamptz
     WHERE id = $1 AND status = 'running'`,
    [id, now.toISOString()],
  );
}

/**
 * Record a failed run: `attempts + 1`, retry after `min(2^attempts x 30s, 1h)` (attempts before this
 * failure), or status `failed` once `MAX_JOB_ATTEMPTS` is reached. Returns the new status.
 */
export async function failJob(
  db: Queryable,
  id: number,
  error: string,
  now: Date = new Date(),
): Promise<"pending" | "failed" | null> {
  const res = await db.query<{ status: "pending" | "failed" }>(
    `UPDATE jobs SET
       attempts = attempts + 1,
       status = CASE WHEN attempts + 1 >= $3 THEN 'failed' ELSE 'pending' END,
       run_after = CASE WHEN attempts + 1 >= $3 THEN run_after
                        ELSE $2::timestamptz + least(power(2, attempts) * $4, $5) * interval '1 second' END,
       finished_at = CASE WHEN attempts + 1 >= $3 THEN $2::timestamptz END,
       last_error = $6, locked_at = NULL
     WHERE id = $1 AND status = 'running'
     RETURNING status`,
    [id, now.toISOString(), MAX_JOB_ATTEMPTS, BACKOFF_BASE_SECONDS, BACKOFF_MAX_SECONDS, error],
  );
  return res.rows[0]?.status ?? null;
}
