# Idea Radar v1 — Task list

Mirrors the [Linear project](https://linear.app/thunderkds/project/idea-radar-v1-8d2ecdbf26cf). Linear is the source of truth for status; this file gives each task its acceptance criteria so it can be worked without Linear access. Reference the ID in branch names and commits (e.g. `hun-142-postgres-schema`, `HUN-142: add repo_daily upsert`).

Work milestones in order. Within a milestone, follow the listed order unless a task says otherwise.

## M1 Foundation

### HUN-141 — Scaffold repo and choose stack ✅ Done
Monorepo with core, connectors, db, worker, api, dashboard; CI; docker-compose.

### HUN-142 — Postgres schema and migrations (High)
- `pnpm db:migrate` applies `packages/db/migrations/*.sql` in order against `DATABASE_URL` and is idempotent.
- Add a data-access module in `packages/db/src` with typed functions: `upsertRepo`, `upsertRepoDaily`, `insertSignals` (batch), `upsertRepoContent`, `upsertRepoScores`, `recordSourceRun`.
- `insertSignals` resolves `fullName` → `repo_id` from `repos` when `repoId` is 0; signals that cannot be resolved are queued for the GitHub API connector to look up (do not drop silently).
- Integration test against a real Postgres (docker-compose) covering each function.

### HUN-143 — SourceConnector interface and connector registry (High)
- Interface already exists in `packages/core/src/connector.ts`; keep it stable.
- On worker start, sync `buildRegistry()` into the `sources` table (id, name, enabled, displayable, license_note).
- Unit test: registry honours the `*_ENABLED` env flags; Trendshift is disabled without an API key.

### HUN-144 — Scheduler and job runner (Medium)
- Replace the interval loop in `apps/worker` with a Postgres-backed job queue (e.g. pg-boss or graphile-worker).
- Jobs: `gh_archive` hourly; other connectors daily; `score` daily after ingestion completes.
- Retries with exponential backoff; per-connector concurrency from `rateLimit.concurrency`; global cap well under GitHub's 100 concurrent requests.
- Each run writes `last_run_at`, `last_status`, `last_error` to `sources`.

### HUN-145 — GitHub API connector (High)
- GraphQL `nodes(ids:)` batches (≤100 per query) for repo metadata; fill `repos`.
- Resolve unknown `owner/name` → `repo_id` for signals from other sources.
- Read `rateLimit { cost remaining resetAt }` on every response; pause when remaining < 10% until `resetAt`.
- Unit test `normalize` with a fixture; integration test behind a `GITHUB_TOKEN` guard.

## M2 Core ingestion

### HUN-146 — GH Archive ingestion and repo_daily rollup (High)
- Download `https://data.gharchive.org/YYYY-MM-DD-H.json.gz`, stream-gunzip, parse NDJSON line by line (never load a full hour into memory).
- Keep only `KEPT_EVENT_TYPES`; aggregate per `(repo.id, UTC date)` into `repo_daily` (`WatchEvent` → stars_new, `ForkEvent` → forks_new, etc.; `distinct_actors` = unique actor ids).
- Track the last processed hour so reruns are idempotent and gaps are backfilled.
- Fixture test with a small hand-made NDJSON file.

### HUN-147 — GitHub Trending page scraper (Medium)
- Scrape `https://github.com/trending/{language}?since={daily|weekly|monthly}` for all languages + configured list.
- Parse rank, `owner/name`, language, stars-in-period; emit `github_trending/listed` signals.
- Parser lives in its own function with a saved-HTML fixture test; a parse returning 0 rows is an error (surfaces in Ops), not success.

### HUN-148 — Shortlist enrichment (Medium)
- Shortlist = repos with any tier candidate signal in the last 7 days (cap configurable, default 5,000/day).
- Fetch README, manifests (`package.json`, `go.mod`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `pom.xml`, `build.gradle`), top-level file tree into `repo_content`.
- Derive `stack_tags` from manifests (e.g. `next`, `react`, `fastapi`, `tokio`). Skip repos fetched within 7 days.

## M3 Scoring

### HUN-149 — Tier classification (High)
- Daily job computes per-repo inputs from `repo_daily`, `repos`, `signals` and calls `classifyTier`; writes `repo_scores` with `components`.
- Velocity percentile computed across all repos with activity in the window.
- Unit tests for each tier boundary.

### HUN-150 — Lowkey score + tuning set (High)
- Implement each component as a 0..1 function: `velocityLift` (7-day vs own 90-day baseline), `activity` (pushes/PRs/issues), `contributors`, `readmeQuality` (length, headings, install/usage sections), `issueResponsiveness`.
- Add `scripts/label.ts` to export a sample of ~200 lowkey candidates to CSV for hand-labelling, and a script reporting precision@50 against the labels.

### HUN-151 — Fake-star detection (Medium)
- Rules from SPEC → Tier scoring. Set `repo_scores.fake_star_flag`; never hide flagged repos.
- Keep GitHub API cost bounded: sample stargazers, don't fetch all.

### HUN-152 — OSS Insight connector (Medium)
- `fetch` already calls `/trends/repos/`; add collections: map each repo to collection names as topic-like tags.
- Respect 600 req/hr; handle non-200 and empty responses.

### HUN-153 — Trendshift connector (Low)
- Implement `/v1/engagement-spikes/{metric}` with API key. `displayable` stays `false`: its signals may affect scores but must never appear in API responses or the UI.
- Add an API-level test asserting no `trendshift` data leaks into any response.

### HUN-154 — GitHub Explorer connector (Low)
- Fetch `data/projects.json` via the GitHub contents API. Check the upstream license first and record it in `licenseNote`; leave disabled if it doesn't allow reuse.

### HUN-155 — Source consensus score (Medium)
- `consensus_count` = distinct displayable-or-not sources with a signal for the repo in the last 7 days.
- Store first-seen date per source (in `components` or a small view) for the "who caught it first" timeline.

### HUN-171 — Tracked repos + GitHub API star snapshots (Urgent) — T024
- Migration 006: `tracked_repos` (priority leader/normal/parked, next due time), `repo_snapshots` (stars, forks, pushed_at, 30-day commits per repo per day), view `repo_star_gains`.
- Daily `snapshot` job, GraphQL batches of 100; scoring and candidates read star velocity from snapshots, GH Archive as fallback; activity from 30-day commits.

### HUN-172 — GitHub Search discovery (High) — T025
- Daily `discover` job: per-language Search queries (created ≤30 days or pushed ≤7 days, 5–200 stars), 30 req/min limiter, 1,000-result cap; new repos tracked as `normal`. `score` does not wait for it.

### HUN-173 — Idea groups + leader picks (High) — T026
- Group key = two most specific topics + primary stack; weekly `regroup` (key `W`+Monday): top 2 active repos per group `leader` (daily), rest `normal` (weekly), archived/inactive `parked` (on request). Second snapshot the next day.

## M4 Dashboard

### HUN-156 — Read-only API (High) — plus `POST /rescrape` since HUN-174
- Routes exist as stubs in `apps/api/src/index.ts`: `/tiers/:tier`, `/repos/:id`, `/topics/rising`, `/consensus`, `/ops/sources`, `/health`.
- Filters: `language`, `topic`, `collection`, `window` (7d/30d), `limit`, `cursor`.
- Never return signals from connectors with `displayable = false`.

### HUN-157 — Dashboard: tier tabs + repo detail (High)
- Lowkey is the default tab. List shows name, description, language, stars, 7-day stars, score, consensus badges, fake-star warning.
- Repo detail: star history chart from `repo_daily`, score breakdown, consensus timeline, README excerpt, stack tags.

### HUN-158 — Dashboard: rising topics, consensus, ops (Medium)
- Rising topics/dependencies over 7/30 days; consensus list (2+ sources); ops table of sources with health and lag.

### HUN-174 — Re-scrape on request (High) — T027
- `POST /rescrape` (`{repoId}` or `{groupKey}`), `Authorization: Bearer <ADMIN_TOKEN>`; "Refresh now" / "Refresh group now" on the repo page via a server action. Unset token → 404 and no buttons. Anyone who can open the dashboard can press the button: keep it private until login or a rate limit (HUN-159).

### HUN-180 — Wake brief (High) — T028
- Daily `wake` job (key = UTC date, from `WAKE_HOUR_UTC`; in `SCORE_DOES_NOT_WAIT_FOR`) writes one `wake_briefs` row from existing tables only: `first_sight` mode before scores exist, `tracked` after. Mapping: `tasks/TASK_GUIDE_T028.md` § DB mapping.
- Claude summary (`ANTHROPIC_API_KEY`, `WAKE_MODEL`) with rule-based fallback; no non-displayable data anywhere, including the prompt.
- `GET /wake`, `GET /wake/:date`; dashboard `/wake`; one email per brief via SMTP when configured.

### HUN-159 — Deploy v1 (Medium)
- Hosting, secrets, monitoring. Decide public vs private-first.
