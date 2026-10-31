import type { Repo, RepoDaily, RepoScore, Signal } from "@idea-radar/core";
import type { Queryable } from "./index.js";

/**
 * Data-access functions. Plain parameterised SQL; every batch is one statement built on `unnest`,
 * so the bind-parameter count is fixed (one array per column) however many rows are written.
 * Pass a pool, or a client inside your own transaction. Empty input is a no-op.
 */

/** A pending signal is dropped once the GitHub API has failed to find its repo this many times. */
export const MAX_PENDING_ATTEMPTS = 5;

/** README + manifests for a shortlisted repo (`repo_content`). */
export interface RepoContent {
  repoId: number;
  readmeMd: string | null;
  manifests: Record<string, unknown>;
  fileTreeSummary: Record<string, unknown>;
  stackTags: string[];
  /** Defaults to now. */
  fetchedAt?: Date;
}

export type SourceRunStatus = "ok" | "error";

/** Keep the last row per key: one statement cannot upsert the same key twice. */
function lastPerKey<T>(rows: T[], key: (row: T) => string | number): T[] {
  return [...new Map(rows.map((r) => [key(r), r])).values()];
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Insert or update repos by `repo_id` (a rename changes `full_name`). */
export async function upsertRepo(db: Queryable, repos: Repo[]): Promise<void> {
  if (repos.length === 0) return;
  const rows = lastPerKey(repos, (r) => r.repoId);
  await db.query(
    `INSERT INTO repos (repo_id, full_name, description, language, topics, license, stars, forks, archived, created_at, pushed_at, updated_at)
     SELECT t.repo_id, t.full_name, t.description, t.language, ARRAY(SELECT jsonb_array_elements_text(t.topics::jsonb)),
            t.license, t.stars, t.forks, t.archived, t.created_at, t.pushed_at, now()
     FROM unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[], $8::int[], $9::bool[], $10::timestamptz[], $11::timestamptz[])
          AS t(repo_id, full_name, description, language, topics, license, stars, forks, archived, created_at, pushed_at)
     ON CONFLICT (repo_id) DO UPDATE SET
       full_name = EXCLUDED.full_name, description = EXCLUDED.description, language = EXCLUDED.language,
       topics = EXCLUDED.topics, license = EXCLUDED.license, stars = EXCLUDED.stars, forks = EXCLUDED.forks,
       archived = EXCLUDED.archived, created_at = EXCLUDED.created_at, pushed_at = EXCLUDED.pushed_at,
       updated_at = now()`,
    [
      rows.map((r) => r.repoId),
      rows.map((r) => r.fullName),
      rows.map((r) => r.description),
      rows.map((r) => r.language),
      rows.map((r) => JSON.stringify(r.topics)),
      rows.map((r) => r.license),
      rows.map((r) => r.stars),
      rows.map((r) => r.forks),
      rows.map((r) => r.archived),
      rows.map((r) => iso(r.createdAt)),
      rows.map((r) => iso(r.pushedAt)),
    ],
  );
}

/**
 * Upsert daily rollups on `(repo_id, date)`. A second write for the same key REPLACES the counts, it
 * does not add to them: a rollup is recomputed from a whole day, so a re-run must not double-count.
 */
export async function upsertRepoDaily(db: Queryable, daily: RepoDaily[]): Promise<void> {
  if (daily.length === 0) return;
  const rows = lastPerKey(daily, (r) => `${r.repoId}|${r.date}`);
  await db.query(
    `INSERT INTO repo_daily (repo_id, date, stars_new, forks_new, pushes, issues_opened, prs_opened, distinct_actors, contributors, stars_max_hour)
     SELECT * FROM unnest($1::bigint[], $2::date[], $3::int[], $4::int[], $5::int[], $6::int[], $7::int[], $8::int[], $9::int[], $10::int[])
     ON CONFLICT (repo_id, date) DO UPDATE SET
       stars_new = EXCLUDED.stars_new, forks_new = EXCLUDED.forks_new, pushes = EXCLUDED.pushes,
       issues_opened = EXCLUDED.issues_opened, prs_opened = EXCLUDED.prs_opened,
       distinct_actors = EXCLUDED.distinct_actors, contributors = EXCLUDED.contributors,
       stars_max_hour = EXCLUDED.stars_max_hour`,
    [
      rows.map((r) => r.repoId),
      rows.map((r) => r.date),
      rows.map((r) => r.starsNew),
      rows.map((r) => r.forksNew),
      rows.map((r) => r.pushes),
      rows.map((r) => r.issuesOpened),
      rows.map((r) => r.prsOpened),
      rows.map((r) => r.distinctActors),
      rows.map((r) => r.contributors),
      rows.map((r) => r.starsMaxHour),
    ],
  );
}

/** Columns of a signal as parallel arrays, ready for `unnest`. */
function signalColumns(signals: Signal[]) {
  return [
    signals.map((s) => s.source),
    signals.map((s) => s.signalType),
    signals.map((s) => JSON.stringify(s.value)),
    signals.map((s) => s.observedAt.toISOString()),
  ];
}

/**
 * Append signals. A signal with `repoId: 0` is resolved through `repos.full_name` (case-insensitive);
 * if the repo is not known yet the signal goes to `pending_signals` instead of being dropped, for the
 * GitHub API connector to resolve (`listUnresolvedNames` / `resolvePending`).
 * Throws, before any SQL, on a signal with `repoId: 0` and no `fullName`.
 * Not atomic across the two tables when given a pool; pass a client in a transaction if that matters.
 */
export async function insertSignals(db: Queryable, signals: Signal[]): Promise<{ inserted: number; queued: number }> {
  if (signals.length === 0) return { inserted: 0, queued: 0 };
  for (const s of signals) {
    if (s.repoId === 0 && !s.fullName) {
      throw new Error(`signal ${s.source}/${s.signalType} has repoId 0 and no fullName`);
    }
  }

  const unknownIds = signals.filter((s) => s.repoId === 0);
  const idByName = new Map<string, number>();
  if (unknownIds.length > 0) {
    // Names are not unique over time (rename, then reuse): the most recently updated repo wins.
    const found = await db.query<{ repo_id: number; name: string }>(
      `SELECT repo_id, lower(full_name) AS name FROM repos
       WHERE lower(full_name) = ANY($1::text[]) ORDER BY updated_at`,
      [[...new Set(unknownIds.map((s) => s.fullName!.toLowerCase()))]],
    );
    for (const r of found.rows) idByName.set(r.name, r.repo_id);
  }

  const resolved: Signal[] = [];
  const queued: Signal[] = [];
  for (const s of signals) {
    if (s.repoId !== 0) resolved.push(s);
    else {
      const repoId = idByName.get(s.fullName!.toLowerCase());
      if (repoId === undefined) queued.push(s);
      else resolved.push({ ...s, repoId });
    }
  }

  if (resolved.length > 0) {
    await db.query(
      `INSERT INTO signals (repo_id, source, signal_type, value, observed_at)
       SELECT t.repo_id, t.source, t.signal_type, t.value::jsonb, t.observed_at
       FROM unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::timestamptz[])
            AS t(repo_id, source, signal_type, value, observed_at)`,
      [resolved.map((s) => s.repoId), ...signalColumns(resolved)],
    );
  }
  if (queued.length > 0) {
    await db.query(
      `INSERT INTO pending_signals (full_name, source, signal_type, value, observed_at)
       SELECT t.full_name, t.source, t.signal_type, t.value::jsonb, t.observed_at
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[])
            AS t(full_name, source, signal_type, value, observed_at)`,
      [queued.map((s) => s.fullName!), ...signalColumns(queued)],
    );
  }
  return { inserted: resolved.length, queued: queued.length };
}

/**
 * Names (distinct, case-insensitive; one original spelling each) waiting for a repo id, oldest first.
 * The GitHub API connector looks these up.
 */
export async function listUnresolvedNames(db: Queryable, limit: number): Promise<string[]> {
  const res = await db.query<{ full_name: string }>(
    `SELECT (array_agg(full_name ORDER BY queued_at, id))[1] AS full_name
     FROM pending_signals GROUP BY lower(full_name)
     ORDER BY min(queued_at), lower(full_name) LIMIT $1`,
    [limit],
  );
  return res.rows.map((r) => r.full_name);
}

/**
 * Move pending signals whose name is in `resolved` (case-insensitive) into `signals` under the given
 * repo id, keeping each signal's original `observed_at`. One statement, so a row is moved or left, never both.
 * Returns the number of signals moved.
 */
export async function resolvePending(db: Queryable, resolved: Map<string, number>): Promise<number> {
  const byName = new Map<string, number>();
  for (const [name, repoId] of resolved) if (repoId > 0) byName.set(name.toLowerCase(), repoId);
  if (byName.size === 0) return 0;
  const res = await db.query(
    `WITH m AS (SELECT * FROM unnest($1::text[], $2::bigint[]) AS t(name, repo_id)),
          moved AS (
            DELETE FROM pending_signals p USING m WHERE lower(p.full_name) = m.name
            RETURNING m.repo_id, p.source, p.signal_type, p.value, p.observed_at
          )
     INSERT INTO signals (repo_id, source, signal_type, value, observed_at)
     SELECT repo_id, source, signal_type, value, observed_at FROM moved`,
    [[...byName.keys()], [...byName.values()]],
  );
  return res.rowCount ?? 0;
}

/**
 * Record that the GitHub API could not find these names (case-insensitive). Each pending signal for
 * them gets `attempts + 1`; those reaching `MAX_PENDING_ATTEMPTS` are deleted. Returns the number deleted.
 */
export async function markNotFound(db: Queryable, names: string[]): Promise<number> {
  if (names.length === 0) return 0;
  const lowered = [...new Set(names.map((n) => n.toLowerCase()))];
  // Two disjoint row sets in one statement: expire the ones at the limit, bump the rest.
  const res = await db.query<{ deleted: number }>(
    `WITH expired AS (
       DELETE FROM pending_signals
       WHERE lower(full_name) = ANY($1::text[]) AND attempts + 1 >= $2 RETURNING id
     ), bumped AS (
       UPDATE pending_signals SET attempts = attempts + 1, last_attempt_at = now()
       WHERE lower(full_name) = ANY($1::text[]) AND attempts + 1 < $2 RETURNING id
     )
     SELECT (SELECT count(*) FROM expired) AS deleted, (SELECT count(*) FROM bumped) AS bumped`,
    [lowered, MAX_PENDING_ATTEMPTS],
  );
  return res.rows[0]?.deleted ?? 0;
}

/** Upsert README / manifest content on `repo_id`. */
export async function upsertRepoContent(db: Queryable, contents: RepoContent[]): Promise<void> {
  if (contents.length === 0) return;
  const rows = lastPerKey(contents, (r) => r.repoId);
  await db.query(
    `INSERT INTO repo_content (repo_id, readme_md, manifests, file_tree_summary, stack_tags, fetched_at)
     SELECT t.repo_id, t.readme_md, t.manifests::jsonb, t.file_tree_summary::jsonb,
            ARRAY(SELECT jsonb_array_elements_text(t.stack_tags::jsonb)), coalesce(t.fetched_at, now())
     FROM unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[], $6::timestamptz[])
          AS t(repo_id, readme_md, manifests, file_tree_summary, stack_tags, fetched_at)
     ON CONFLICT (repo_id) DO UPDATE SET
       readme_md = EXCLUDED.readme_md, manifests = EXCLUDED.manifests,
       file_tree_summary = EXCLUDED.file_tree_summary, stack_tags = EXCLUDED.stack_tags,
       fetched_at = EXCLUDED.fetched_at`,
    [
      rows.map((r) => r.repoId),
      rows.map((r) => r.readmeMd),
      rows.map((r) => JSON.stringify(r.manifests)),
      rows.map((r) => JSON.stringify(r.fileTreeSummary)),
      rows.map((r) => JSON.stringify(r.stackTags)),
      rows.map((r) => iso(r.fetchedAt)),
    ],
  );
}

/** Upsert daily scores on `(repo_id, date)`. */
export async function upsertRepoScores(db: Queryable, scores: RepoScore[]): Promise<void> {
  if (scores.length === 0) return;
  const rows = lastPerKey(scores, (r) => `${r.repoId}|${r.date}`);
  await db.query(
    `INSERT INTO repo_scores (repo_id, date, tier, score, components, consensus_count, fake_star_flag)
     SELECT t.repo_id, t.date, t.tier, t.score, t.components::jsonb, t.consensus_count, t.fake_star_flag
     FROM unnest($1::bigint[], $2::date[], $3::text[], $4::numeric[], $5::text[], $6::int[], $7::bool[])
          AS t(repo_id, date, tier, score, components, consensus_count, fake_star_flag)
     ON CONFLICT (repo_id, date) DO UPDATE SET
       tier = EXCLUDED.tier, score = EXCLUDED.score, components = EXCLUDED.components,
       consensus_count = EXCLUDED.consensus_count, fake_star_flag = EXCLUDED.fake_star_flag`,
    [
      rows.map((r) => r.repoId),
      rows.map((r) => r.date),
      rows.map((r) => r.tier),
      rows.map((r) => r.score),
      rows.map((r) => JSON.stringify(r.components)),
      rows.map((r) => r.consensusCount),
      rows.map((r) => r.fakeStarFlag),
    ],
  );
}

/**
 * Record the outcome of one connector run on its `sources` row. If the row is missing it is created
 * with `displayable = false` (fail closed: an unknown source must not be shown); the registry sync
 * (HUN-143) sets the real flags.
 */
export async function recordSourceRun(
  db: Queryable,
  sourceId: string,
  status: SourceRunStatus,
  error: string | null = null,
  at: Date = new Date(),
): Promise<void> {
  await db.query(
    `INSERT INTO sources (id, name, displayable, last_run_at, last_status, last_error)
     VALUES ($1, $1, FALSE, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET last_run_at = EXCLUDED.last_run_at, last_status = EXCLUDED.last_status,
       last_error = EXCLUDED.last_error`,
    [sourceId, at.toISOString(), status, error],
  );
}

/** Last stored cursor for a source (e.g. last GH Archive day processed), or null if none. */
export async function getCursor(db: Queryable, sourceId: string): Promise<string | null> {
  const res = await db.query<{ cursor: string }>("SELECT cursor FROM ingest_cursors WHERE source_id = $1", [sourceId]);
  return res.rows[0]?.cursor ?? null;
}

export async function setCursor(db: Queryable, sourceId: string, value: string): Promise<void> {
  await db.query(
    `INSERT INTO ingest_cursors (source_id, cursor, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (source_id) DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = now()`,
    [sourceId, value],
  );
}
