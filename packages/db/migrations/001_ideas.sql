-- T033: ideas (one row per idea id) and runs (one row per submit_ideas call).
-- Needs the pg_trgm extension (a trusted extension on PostgreSQL 13+, so the database owner can create it).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE ideas (
  id            text PRIMARY KEY,
  title         text NOT NULL,
  summary       text NOT NULL,
  why_now       text,
  tags          text[] NOT NULL,
  signals       jsonb NOT NULL,
  related_repos text[] NOT NULL,
  -- date of the submission whose content is stored (the merge rule compares against it)
  version_date  date NOT NULL,
  first_seen    date NOT NULL,
  last_seen     date NOT NULL,
  -- lower-cased title + summary + why_now + tags, kept in step with the content by the upsert; trigram-indexed
  search_text   text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ideas_last_seen_idx ON ideas (last_seen DESC, id);
CREATE INDEX ideas_search_idx ON ideas USING gin (search_text gin_trgm_ops);

CREATE TABLE runs (
  id          bigserial PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  date        date,
  routine     text,
  idea_count  integer NOT NULL DEFAULT 0,
  status      text NOT NULL CHECK (status IN ('ok', 'rejected')),
  error       text
);
