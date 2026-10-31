-- Idea Radar v1 schema. Everything keys on GitHub's numeric repo id,
-- which is stable across renames and transfers.

CREATE TABLE IF NOT EXISTS repos (
  repo_id        BIGINT PRIMARY KEY,
  full_name      TEXT        NOT NULL,
  description    TEXT,
  language       TEXT,
  topics         TEXT[]      NOT NULL DEFAULT '{}',
  license        TEXT,
  stars          INTEGER     NOT NULL DEFAULT 0,
  forks          INTEGER     NOT NULL DEFAULT 0,
  archived       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ,
  pushed_at      TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS repos_full_name_idx ON repos (lower(full_name));
CREATE INDEX IF NOT EXISTS repos_language_idx  ON repos (language);

-- Daily rollup from GH Archive events.
CREATE TABLE IF NOT EXISTS repo_daily (
  repo_id         BIGINT  NOT NULL,
  date            DATE    NOT NULL,
  stars_new       INTEGER NOT NULL DEFAULT 0,
  forks_new       INTEGER NOT NULL DEFAULT 0,
  pushes          INTEGER NOT NULL DEFAULT 0,
  issues_opened   INTEGER NOT NULL DEFAULT 0,
  prs_opened      INTEGER NOT NULL DEFAULT 0,
  distinct_actors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (repo_id, date)
);
CREATE INDEX IF NOT EXISTS repo_daily_date_idx ON repo_daily (date);

-- Append-only observations from every source.
CREATE TABLE IF NOT EXISTS signals (
  id           BIGSERIAL PRIMARY KEY,
  repo_id      BIGINT      NOT NULL,
  source       TEXT        NOT NULL,
  signal_type  TEXT        NOT NULL,
  value        JSONB       NOT NULL DEFAULT '{}',
  observed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signals_repo_idx   ON signals (repo_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS signals_source_idx ON signals (source, observed_at DESC);

-- README, manifests and file tree for shortlisted repos (v2 embeddings build on this).
CREATE TABLE IF NOT EXISTS repo_content (
  repo_id            BIGINT PRIMARY KEY,
  readme_md          TEXT,
  manifests          JSONB NOT NULL DEFAULT '{}',
  file_tree_summary  JSONB NOT NULL DEFAULT '{}',
  stack_tags         TEXT[] NOT NULL DEFAULT '{}',
  fetched_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily scores; components keep each score explainable.
CREATE TABLE IF NOT EXISTS repo_scores (
  repo_id          BIGINT  NOT NULL,
  date             DATE    NOT NULL,
  tier             TEXT    NOT NULL CHECK (tier IN ('trending', 'medium', 'lowkey')),
  score            NUMERIC NOT NULL,
  components       JSONB   NOT NULL DEFAULT '{}',
  consensus_count  INTEGER NOT NULL DEFAULT 0,
  fake_star_flag   BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (repo_id, date)
);
CREATE INDEX IF NOT EXISTS repo_scores_tier_idx ON repo_scores (date, tier, score DESC);

-- Connector registry + health for the Ops view.
CREATE TABLE IF NOT EXISTS sources (
  id            TEXT PRIMARY KEY,
  name          TEXT    NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  displayable   BOOLEAN NOT NULL DEFAULT TRUE,
  license_note  TEXT,
  last_run_at   TIMESTAMPTZ,
  last_status   TEXT,
  last_error    TEXT
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name        TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
