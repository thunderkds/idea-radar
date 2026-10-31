-- Rollback for 006_tracking.sql (T024). Run by rollbackMigration(); never applied as an up migration.
-- The view holds no data. The two tables hold only what this migration's job wrote: dropping them loses
-- the tracked set and the snapshot history, which cannot be rebuilt (a snapshot is a reading of that day).
DROP VIEW IF EXISTS repo_star_gains;
DROP TABLE IF EXISTS repo_snapshots;
DROP TABLE IF EXISTS tracked_repos;
