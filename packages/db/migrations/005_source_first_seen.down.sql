-- Rollback for 005_source_first_seen.sql (HUN-155). Run by rollbackMigration(); never applied as an up migration.
-- A view holds no data, so dropping it loses nothing; signals is untouched.
DROP VIEW IF EXISTS repo_source_first_seen;
