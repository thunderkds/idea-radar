-- Migration 003 (T021, gap A1/A11). Additive only: one new table, no existing table is touched.
-- Rollback (manual; only the table this migration created is dropped):
--   DROP TABLE IF EXISTS candidates;
--   DELETE FROM schema_migrations WHERE name = '003_candidates.sql';

-- The day's list of repos worth fetching metadata and README for, with the reason for each pick.
-- Rewritten per date by selectCandidates; `priority` orders the cap and later consumers.
CREATE TABLE IF NOT EXISTS candidates (
  date      DATE    NOT NULL,
  repo_id   BIGINT  NOT NULL,
  reason    TEXT    NOT NULL,
  priority  NUMERIC NOT NULL,
  PRIMARY KEY (date, repo_id)
);
