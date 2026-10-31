# decisions.md — Cold Tier: Architectural & Infrastructure Decisions

> **Rules**: Supervisor-only writes. Each entry: `### YYYY-MM-DD — Title`, then **Decision**, **Why**, and **Files** (cite paths — the diff-driven pass greps this file by changed file path).

## Architecture

### 2026-10-31 — GH Archive ingests whole UTC days, not hours
**Decision**: T004 (HUN-146) processes each completed UTC day (hours 0..23) in one pass and writes `repo_daily` once per day, replace semantics. An hourly scheduler call with no new completed day is a no-op.
**Why**: `distinct_actors` (unique actor ids per repo per day) cannot be summed across hourly runs; replace-upsert per day keeps it exact.
**Files**: `packages/connectors/src/gh-archive.ts`, `packages/db/src/`, `tasks/TASK_GUIDE_T004.md`

### 2026-10-31 — Worker job queue is an in-repo `jobs` table (T007)
**Decision**: `apps/worker` uses migration 004's `jobs` table (`UNIQUE (name, data_key)`), claimed with `FOR UPDATE SKIP LOCKED` under an advisory xact lock; no pg-boss. `score(D)` waits until 02:00 UTC and until every other job of date D is `ok`. Backoff 30s·2^n, `failed` after 5 attempts; stuck jobs reclaimed after 2h (gh_archive 6h). New jobs = an entry in `buildHandlers` + a cap in `buildCaps` (`apps/worker/src/handlers.ts`).
**Why**: debated (pg-boss vs own table); no new dependency, fits the plain-`pg` migration runner, "score after ingestion" is one claim rule.
**Update (T023)**: `completeJob`/`failJob`/`heartbeatJob` now take the claim (`id` + `attempts` token) and apply only while that token holds; the runner heartbeats `locked_at` every 60 s; `JobHandler.run` may return `"completed"` when it completed the job in its own transaction (`fetchHandler`).
**Files**: `packages/db/migrations/004_jobs.sql`, `packages/db/src/jobs.ts`, `apps/worker/src/handlers.ts`, `apps/worker/src/runner.ts`, `apps/worker/src/index.ts`

### 2026-10-31 — Tier rule readings for U1 and U8 (T009)
**Decision**: Medium "positive 30-day velocity for 4+ consecutive weeks" = at each of the last 4 weekly checkpoints, the 30 days ending there gained ≥ `tierConfig.medium.min30dStars` (default 1, the literal reading; owner to tune). Lowkey "2+ distinct contributors" = the largest daily `repo_daily.contributors` in 30 days (a lower bound). Score windows end at `min(date - 1, GH Archive cursor)`. `scoreDay` deletes and rewrites a whole date, so consensus (T015) and fake-star (T011) must run after it or inside it.
**Why**: owner questions U1/U8 are unanswered (auto mode); the literal reading with an exposed threshold is reversible.
**Files**: `packages/core/src/scoring.ts`, `packages/db/src/scores.ts`, `apps/worker/src/handlers.ts`

## Infrastructure

### 2026-10-31 — Requirements live in docs/SPEC.md + docs/ISSUES.md; AGENTS.md is merged
**Decision**: `docs/SPEC.md` and `docs/ISSUES.md` (from origin `b21072b`) are the requirements and stand in for `PRD.md`. `AGENTS.md` = repo project rules (top) + kit doctrine (below). Kit-only copy: `memory/backups/AGENTS.kit.md`. Board `Txxx` ↔ Linear `HUN-1xx` mapping is on `PROJECT_KANBAN.md`.
**Why**: the user asked to pull the latest and use it as the requirements; the remote AGENTS.md would otherwise have replaced the kit doctrine.
**Files**: `AGENTS.md`, `docs/SPEC.md`, `docs/ISSUES.md`, `PROJECT_SPEC.md`, `PROJECT_KANBAN.md`

### 2026-10-31 — Score job order: scoreDay → applyConsensus → applyFakeStarFlags (wave-4 merge)
**Decision (Supervisor, wave-4 merge):** the worker `score` handler runs `scoreDay`, then `applyConsensus` (Trending × consensus factor), then `applyFakeStarFlags` (flagged trending/lowkey × (1 − share)). Both later steps multiply the stored score, so the order does not change the result beyond 6-decimal rounding; consensus goes first because the fake-star step returns early when the GitHub connector has no token. Each is valid only right after `scoreDay`; a rerun starts from `scoreDay`.
**Files**: `apps/worker/src/handlers.ts`, `packages/db/src/consensus.ts`, `packages/db/src/fake-stars.ts`

### 2026-10-31 — Job queue stays on Postgres; BullMQ deferred (T023)
**Decision**: fix the stuck-job double run in the in-repo `jobs` queue with a run token (the `attempts` column; `completeJob`/`failJob`/`heartbeatJob` match `id` + `status='running'` + `attempts`) and a runner heartbeat on `locked_at`. No BullMQ, no Redis, no queue library now.
**Why**: user chose "small fix" (2026-10-31). BullMQ would add Redis (hosting, `noeviction`), split job state from Postgres data (no shared transaction), stays at-least-once anyway, and means rewriting runner, caps and the score dependency.
**Revisit when**: several worker hosts run at once and lost/double runs show in logs (`status: "lost"`), or Redis is in the stack for another reason. Then compare BullMQ with a Postgres library (Graphile Worker, pg-boss) before choosing.
**Files**: `packages/db/src/jobs.ts`, `apps/worker/src/runner.ts`, `apps/worker/src/handlers.ts`
