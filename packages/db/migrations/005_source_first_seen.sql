-- Migration 005 (HUN-155). Additive only: one new view over `signals`, no table is touched.
-- Rollback (manual; a view holds no data):
--   DROP VIEW IF EXISTS repo_source_first_seen;
--   DELETE FROM schema_migrations WHERE name = '005_source_first_seen.sql';

-- Per repo and source: when the source first and last flagged the repo, and how many signals it wrote.
-- Powers the "who caught it first" timeline. Not materialised: lookups filter on repo_id, which
-- signals_repo_idx (repo_id, observed_at DESC) serves, so no new index is needed.
-- Includes non-displayable sources; the API reads it only through an inner join on displayable `sources`.
CREATE OR REPLACE VIEW repo_source_first_seen AS
SELECT repo_id,
       source,
       min(observed_at) AS first_seen_at,
       max(observed_at) AS last_seen_at,
       count(*)         AS signals
  FROM signals
 GROUP BY repo_id, source;
