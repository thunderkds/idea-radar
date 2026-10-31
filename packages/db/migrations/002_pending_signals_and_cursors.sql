-- Migration 002 (HUN-142). Additive only.
-- Rollback (manual, no data of other tables is touched):
--   DROP TABLE IF EXISTS ingest_cursors;
--   DROP TABLE IF EXISTS pending_signals;
--   ALTER TABLE repo_daily DROP COLUMN IF EXISTS stars_max_hour, DROP COLUMN IF EXISTS contributors;
--   DELETE FROM schema_migrations WHERE name = '002_pending_signals_and_cursors.sql';

-- Gap A4/A5: lowkey "contributors" rule and fake-star hourly burst rule.
ALTER TABLE repo_daily ADD COLUMN IF NOT EXISTS contributors    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE repo_daily ADD COLUMN IF NOT EXISTS stars_max_hour  INTEGER NOT NULL DEFAULT 0;

-- Signals whose repo is not in `repos` yet (repo_id unknown, only full_name).
-- The GitHub API connector resolves names; resolved rows move to `signals`.
CREATE TABLE IF NOT EXISTS pending_signals (
  id               BIGSERIAL PRIMARY KEY,
  full_name        TEXT        NOT NULL,
  source           TEXT        NOT NULL,
  signal_type      TEXT        NOT NULL,
  value            JSONB       NOT NULL DEFAULT '{}',
  observed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  queued_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts         INTEGER     NOT NULL DEFAULT 0,
  last_attempt_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pending_signals_name_idx ON pending_signals (lower(full_name));

-- Per-source ingest position, e.g. GH Archive last processed UTC day.
CREATE TABLE IF NOT EXISTS ingest_cursors (
  source_id   TEXT PRIMARY KEY,
  cursor      TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
