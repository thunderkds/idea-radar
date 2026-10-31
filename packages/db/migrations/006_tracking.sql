-- Migration 006 (T024). Additive only: two new tables, one index, one view. No existing table is touched.
-- Rollback: 006_tracking.down.sql (run by rollbackMigration()).

-- The repos we follow with GitHub API snapshots, and when each is next due.
-- next_due_at = 'infinity' means "only on request": a `parked` repo, or one GitHub no longer returns.
-- A request (T027) sets next_due_at = now(); the snapshot job puts it back to its cadence afterwards.
-- Not keyed to `repos`: a candidate may be tracked before its metadata is fetched.
CREATE TABLE IF NOT EXISTS tracked_repos (
  repo_id          BIGINT      PRIMARY KEY,
  priority         TEXT        NOT NULL DEFAULT 'normal' CHECK (priority IN ('leader', 'normal', 'parked')),
  group_key        TEXT,
  added_reason     TEXT        NOT NULL,
  added_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_due_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_snapshot_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tracked_repos_due_idx ON tracked_repos (next_due_at);

-- One GitHub API reading per repo per UTC day (stars, forks, pushed_at, default-branch commits in 30 days).
CREATE TABLE IF NOT EXISTS repo_snapshots (
  repo_id      BIGINT      NOT NULL,
  date         DATE        NOT NULL,
  stars        INTEGER     NOT NULL,
  forks        INTEGER     NOT NULL,
  pushed_at    TIMESTAMPTZ,
  commits_30d  INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (repo_id, date)
);

-- Star velocity from snapshots: the gain between two consecutive snapshots of a repo (never below 0) is
-- spread over the days after the earlier one up to and including the later one. Day k of n gets
-- floor(gain * k / n) - floor(gain * (k - 1) / n), so the days differ by at most 1 and add up to the gain exactly.
-- A repo's first snapshot has no earlier one and covers no day.
CREATE OR REPLACE VIEW repo_star_gains AS
SELECT s.repo_id,
       (s.prev_date + k.k)::date AS date,
       ((s.gain * k.k) / (s.date - s.prev_date) - (s.gain * (k.k - 1)) / (s.date - s.prev_date))::integer AS stars_new
  FROM (SELECT repo_id, date,
               lag(date) OVER w AS prev_date,
               greatest(stars - lag(stars) OVER w, 0)::bigint AS gain
          FROM repo_snapshots
        WINDOW w AS (PARTITION BY repo_id ORDER BY date)) s
 CROSS JOIN LATERAL generate_series(1, s.date - s.prev_date) AS k(k)
 WHERE s.prev_date IS NOT NULL;
