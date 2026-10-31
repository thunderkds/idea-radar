import { groupingConfig, ideaGroupKey, trackingConfig } from "@idea-radar/core";
import type { TrackingPriority } from "@idea-radar/core";
import type { Queryable } from "./index.js";

/** One GitHub API reading of a repo. Same shape as the connector's `RepoSnapshot` (connectors do not depend on db). */
export interface SnapshotInput {
  repoId: number;
  stars: number;
  forks: number;
  pushedAt: Date | null;
  commits30d: number;
}

/**
 * Track every repo in `candidates` for `date` (T024). A new repo starts `normal` and due now, with the
 * candidate's reason; a repo already tracked is left alone, so its priority and due time survive.
 * Returns how many repos were added.
 */
export async function trackCandidates(db: Queryable, date: string): Promise<number> {
  const res = await db.query(
    `INSERT INTO tracked_repos (repo_id, added_reason)
     SELECT repo_id, reason FROM candidates WHERE date = $1::date
     ON CONFLICT (repo_id) DO NOTHING`,
    [date],
  );
  return res.rowCount ?? 0;
}

/**
 * Tracked repos due at `now`, oldest due first, at most `limit`. A `parked` repo has `next_due_at = 'infinity'`
 * until a request sets it, so it is never picked otherwise.
 */
export async function listDueTracked(
  db: Queryable,
  now: Date,
  limit: number = trackingConfig.dailyCap,
): Promise<number[]> {
  const res = await db.query<{ repo_id: number }>(
    "SELECT repo_id FROM tracked_repos WHERE next_due_at <= $1 ORDER BY next_due_at, repo_id LIMIT $2",
    [now, limit],
  );
  return res.rows.map((r) => r.repo_id);
}

/** The due time after a snapshot on `date`: the start of that UTC day plus the priority's cadence; `infinity` when only on request. */
function nextDue(priority: TrackingPriority, date: string): string {
  const days = trackingConfig.cadenceDays[priority];
  if (days === null) return "infinity";
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 24 * 3_600_000).toISOString();
}

/**
 * Store the day's snapshots (one row per repo and `date`; a rerun overwrites) and move each repo's due time.
 * `last_snapshot_at` = `now`. The due time counts from the start of the snapshot's UTC day, not from `now`,
 * so a job that runs a few minutes later each day still finds a daily `leader` due. Ids in `missing`
 * (GitHub no longer returns them) become `parked` and are not due until a request marks them.
 * A repo with exactly one snapshot (its first) is due again `firstSnapshotFollowUpDays` after the snapshot day, whatever its
 * priority except `parked`, so its star velocity shows after 1 day instead of a week (T026).
 * Idempotent, so a run that stopped halfway can repeat.
 */
export async function recordSnapshots(
  db: Queryable,
  date: string,
  snapshots: SnapshotInput[],
  missing: number[],
  now: Date,
): Promise<void> {
  if (snapshots.length > 0) {
    await db.query(
      `INSERT INTO repo_snapshots (repo_id, date, stars, forks, pushed_at, commits_30d)
       SELECT repo_id, $1::date, stars, forks, pushed_at, commits_30d
       FROM unnest($2::bigint[], $3::int[], $4::int[], $5::timestamptz[], $6::int[])
         AS t(repo_id, stars, forks, pushed_at, commits_30d)
       ON CONFLICT (repo_id, date) DO UPDATE SET
         stars = EXCLUDED.stars, forks = EXCLUDED.forks, pushed_at = EXCLUDED.pushed_at, commits_30d = EXCLUDED.commits_30d`,
      [
        date,
        snapshots.map((s) => s.repoId),
        snapshots.map((s) => s.stars),
        snapshots.map((s) => s.forks),
        snapshots.map((s) => s.pushedAt),
        snapshots.map((s) => s.commits30d),
      ],
    );
    await db.query(
      `UPDATE tracked_repos SET last_snapshot_at = $2,
         next_due_at = CASE
           WHEN priority <> 'parked' AND (SELECT count(*) FROM repo_snapshots s WHERE s.repo_id = tracked_repos.repo_id) = 1
             THEN $6::timestamptz
           ELSE CASE priority WHEN 'leader' THEN $3::timestamptz WHEN 'normal' THEN $4::timestamptz ELSE $5::timestamptz END
         END
       WHERE repo_id = ANY($1::bigint[])`,
      [
        snapshots.map((s) => s.repoId),
        now,
        nextDue("leader", date),
        nextDue("normal", date),
        nextDue("parked", date),
        new Date(Date.parse(`${date}T00:00:00Z`) + groupingConfig.firstSnapshotFollowUpDays * 24 * 3_600_000).toISOString(),
      ],
    );
  }
  if (missing.length > 0) {
    await db.query(
      "UPDATE tracked_repos SET priority = 'parked', next_due_at = 'infinity' WHERE repo_id = ANY($1::bigint[])",
      [missing],
    );
  }
}

/** The daily job that snapshots the due tracked repos; its name is the worker's `SNAPSHOT_JOB` (apps/worker/src/handlers.ts). */
const SNAPSHOT_JOB = "snapshot";

/** What a re-scrape request names: one tracked repo, or every tracked repo of an idea group. */
export type RescrapeTarget = { repoId: number } | { groupKey: string };

/**
 * Re-scrape on request (T027). Make the named tracked repo (or every tracked repo of the group) due at `now` and queue
 * today's `snapshot` job (keyed on the UTC date of `now`). It never changes `priority`: a `parked` repo is snapshotted
 * once and the snapshot job then puts it back to `infinity`. A job that already ran (`ok` or `failed`) is re-opened:
 * `pending`, `run_after = now`, unlocked, unfinished; `attempts` stays, because `(id, attempts)` fences each run. A
 * `running` job is not touched (its run ends and the repo is due on the next run) and neither is a `pending` one.
 * One statement, so the repos and the job change together. Returns how many tracked repos were marked; 0 means
 * the repo or group is unknown, and then no job is queued.
 */
export async function requestRescrape(db: Queryable, target: RescrapeTarget, now: Date): Promise<number> {
  const [column, value] = "repoId" in target ? ["repo_id", target.repoId] : ["group_key", target.groupKey];
  const res = await db.query<{ n: number }>(
    `WITH due AS (
       UPDATE tracked_repos SET next_due_at = $1::timestamptz WHERE ${column} = $2 RETURNING repo_id
     ), queued AS (
       INSERT INTO jobs (name, data_key, run_after)
       SELECT $3, $4, $1::timestamptz WHERE EXISTS (SELECT 1 FROM due)
       ON CONFLICT (name, data_key) DO UPDATE
         SET status = 'pending', run_after = $1::timestamptz, locked_at = NULL, finished_at = NULL
         WHERE jobs.status IN ('ok', 'failed')
     )
     SELECT count(*)::int AS n FROM due`,
    [now.toISOString(), value, SNAPSHOT_JOB, now.toISOString().slice(0, 10)],
  );
  return res.rows[0]?.n ?? 0;
}

/**
 * SQL for a CTE body: one row `(repo_id, date, stars_new)` per repo and day in (`from`, `to`], where `from` and
 * `to` are SQL date expressions. Stars per day come from `repo_star_gains` (snapshot differences) where a snapshot
 * covers the day, else from GH Archive `repo_daily`: a day in both counts the snapshot only, never the sum.
 * Scoring and candidate selection read stars through this.
 */
export function starsPerDaySql(from: string, to: string): string {
  return `
  SELECT coalesce(d.repo_id, g.repo_id) AS repo_id,
         coalesce(d.date, g.date) AS date,
         coalesce(g.stars_new, d.stars_new) AS stars_new
  FROM (SELECT repo_id, date, stars_new FROM repo_daily WHERE date > ${from} AND date <= ${to}) d
  FULL JOIN (SELECT repo_id, date, stars_new FROM repo_star_gains WHERE date > ${from} AND date <= ${to}) g
    ON g.repo_id = d.repo_id AND g.date = d.date`;
}

export interface RegroupResult {
  /** Tracked repos looked at. */
  tracked: number;
  /** Idea groups with at least one repo that is not parked. */
  groups: number;
  leaders: number;
  normal: number;
  parked: number;
  /** Repos made due now: a new `leader`, or a `parked` repo that is active again. */
  promoted: number;
}

interface RegroupRow {
  repo_id: number;
  priority: TrackingPriority;
  topics: string[] | null;
  stack_tags: string[] | null;
  archived: boolean | null;
  score: number | null;
  commits_30d: number | null;
  has_recent_snapshot: boolean;
  was_snapshotted: boolean;
}

/**
 * Weekly regroup (T026). Recompute every tracked repo's idea-group key (`ideaGroupKey` of its topics and stack
 * tags), rank each group by the latest score and the latest 30-day commit count (`groupingConfig.leaderWeights`,
 * each divided by the group maximum) and set the priority: the top `leadersPerGroup` active repos `leader`, the
 * rest `normal`. An archived repo, or one with no score and no snapshot in the `activeWindowDays` days up to `date`, is
 * `parked`; a repo never snapshotted yet (just added) is not parked for that, so its first snapshot still runs. A repo with no key keeps its priority (a group of one). A repo that becomes `leader` or leaves `parked`
 * is due now (never later than it was); one that becomes `parked` is not due; any other repo keeps its due time,
 * so a `parked` repo that a request made due stays due. One statement writes the result, and a rerun with
 * unchanged data changes nothing.
 */
export async function regroupTracked(db: Queryable, date: string, now: Date): Promise<RegroupResult> {
  const { rows } = await db.query<RegroupRow>(
    `SELECT t.repo_id, t.priority, r.topics, c.stack_tags, r.archived, sc.score, sn.commits_30d,
            sn.commits_30d IS NOT NULL AS has_recent_snapshot, t.last_snapshot_at IS NOT NULL AS was_snapshotted
     FROM tracked_repos t
     LEFT JOIN repos r ON r.repo_id = t.repo_id
     LEFT JOIN repo_content c ON c.repo_id = t.repo_id
     LEFT JOIN LATERAL (SELECT score FROM repo_scores s WHERE s.repo_id = t.repo_id AND s.date <= $1::date
                        ORDER BY s.date DESC LIMIT 1) sc ON true
     LEFT JOIN LATERAL (SELECT commits_30d FROM repo_snapshots p
                        WHERE p.repo_id = t.repo_id AND p.date <= $1::date AND p.date > $1::date - $2::int
                        ORDER BY p.date DESC LIMIT 1) sn ON true`,
    [date, groupingConfig.activeWindowDays],
  );

  const keys = new Map<number, string | null>();
  const parked = new Set<number>();
  const groups = new Map<string, RegroupRow[]>();
  for (const r of rows) {
    const key = ideaGroupKey(r.topics ?? [], r.stack_tags ?? []);
    keys.set(r.repo_id, key);
    // Inactive = no score and no recent snapshot. A repo never snapshotted is only new (its first snapshot may not
    // have run yet), so it is not parked for that, unless it is parked already (a repo GitHub no longer returns).
    const inactive = r.score === null && !r.has_recent_snapshot && (r.was_snapshotted || r.priority === "parked");
    if (r.archived === true || inactive) {
      parked.add(r.repo_id);
    } else if (key !== null) {
      const members = groups.get(key) ?? [];
      members.push(r);
      groups.set(key, members);
    }
  }

  const priority = new Map<number, TrackingPriority>();
  for (const r of rows) {
    if (parked.has(r.repo_id)) priority.set(r.repo_id, "parked");
    // Not parked and in no group: keep the priority, but a repo coming back from `parked` starts `normal`.
    else if (keys.get(r.repo_id) === null) priority.set(r.repo_id, r.priority === "parked" ? "normal" : r.priority);
  }
  const w = groupingConfig.leaderWeights;
  for (const members of groups.values()) {
    const maxScore = Math.max(0, ...members.map((m) => m.score ?? 0));
    const maxCommits = Math.max(0, ...members.map((m) => m.commits_30d ?? 0));
    const ranked = members
      .map((m) => ({
        id: m.repo_id,
        rank:
          (maxScore > 0 ? (w.score * Math.max(m.score ?? 0, 0)) / maxScore : 0) +
          (maxCommits > 0 ? (w.commits30d * (m.commits_30d ?? 0)) / maxCommits : 0),
      }))
      .sort((a, b) => b.rank - a.rank || a.id - b.id);
    ranked.forEach((m, i) => priority.set(m.id, i < groupingConfig.leadersPerGroup && m.rank > 0 ? "leader" : "normal"));
  }

  const out: RegroupResult = { tracked: rows.length, groups: groups.size, leaders: 0, normal: 0, parked: 0, promoted: 0 };
  for (const r of rows) {
    const next = priority.get(r.repo_id)!;
    out[next === "leader" ? "leaders" : next]++;
    if ((next === "leader" && r.priority !== "leader") || (r.priority === "parked" && next !== "parked")) out.promoted++;
  }
  if (rows.length === 0) return out;
  await db.query(
    `UPDATE tracked_repos t SET group_key = u.group_key, priority = u.priority,
       next_due_at = CASE
         WHEN u.priority = 'parked' AND t.priority <> 'parked' THEN 'infinity'::timestamptz
         WHEN (u.priority = 'leader' AND t.priority <> 'leader') OR (t.priority = 'parked' AND u.priority <> 'parked')
           THEN least(t.next_due_at, $4::timestamptz)
         ELSE t.next_due_at
       END
     FROM unnest($1::bigint[], $2::text[], $3::text[]) AS u(repo_id, group_key, priority)
     WHERE t.repo_id = u.repo_id`,
    [rows.map((r) => r.repo_id), rows.map((r) => keys.get(r.repo_id) ?? null), rows.map((r) => priority.get(r.repo_id)), now],
  );
  return out;
}
