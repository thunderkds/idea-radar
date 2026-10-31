-- Migration 004 (HUN-144). Additive only: one new table, nothing existing is touched.
-- Rollback (manual; the table holds only scheduler state, which enqueueDue rebuilds):
--   DROP TABLE IF EXISTS jobs;
--   DELETE FROM schema_migrations WHERE name = '004_jobs.sql';

-- Durable job queue for apps/worker. One row per (job name, data key): the key is the UTC hour
-- (gh_archive, 'YYYY-MM-DDTHH') or the UTC date (everything else, 'YYYY-MM-DD'), so a job for a
-- given data period exists once and never runs twice. Claimed with FOR UPDATE SKIP LOCKED.
CREATE TABLE IF NOT EXISTS jobs (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT        NOT NULL,
  data_key     TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'ok', 'failed')),
  attempts     INTEGER     NOT NULL DEFAULT 0,
  run_after    TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at    TIMESTAMPTZ,
  last_error   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  UNIQUE (name, data_key)
);
-- Claim query scans only the open rows.
CREATE INDEX IF NOT EXISTS jobs_open_idx ON jobs (run_after, id) WHERE status IN ('pending', 'running');
