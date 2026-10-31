# TASK_GUIDE — T007: HUN-144 Postgres-backed scheduler and job runner
**Date**: 2026-10-31
**Complexity Level**: C2
**Risk Level**: Medium
**Priority**: P1
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: HUN-144

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`), `docs/ISSUES.md` § HUN-144, `docs/analysis/2026-10-31-gaps.md` rows A6, A8, A9, A12.
2. Read the memory slice in your spawn prompt, then `memory/learnings.md` (kit gotchas) and `memory/decisions.md`.
3. Read this file completely, then `agents/backend.md` and `memory/codebase-map.md`.
4. Schema work: run `Skill({ skill: "migration-safety" })` before writing migration 004.

---

## Requirement (Pillar 1)

`docs/ISSUES.md` § HUN-144 (verbatim):
- Replace the interval loop in `apps/worker` with a Postgres-backed job queue (e.g. pg-boss or graphile-worker).
- Jobs: `gh_archive` hourly; other connectors daily; `score` daily after ingestion completes.
- Retries with exponential backoff; per-connector concurrency from `rateLimit.concurrency`; global cap well under GitHub's 100 concurrent requests.
- Each run writes `last_run_at`, `last_status`, `last_error` to `sources`.

Queue choice (debated 2026-10-31, see `tasks/TASK_REVIEW_T007.md` § Auto decisions): **an in-repo `jobs` table claimed with `FOR UPDATE SKIP LOCKED`**, no pg-boss / graphile-worker dependency.

Wiring the wave-1 pieces (cross-task notes from T002–T005 reports):
- `gh_archive`: adapt `@idea-radar/db` `getCursor` / `setCursor` / `upsertRepoDaily` to `RollupStore` and call `new GhArchiveConnector().ingest(store)`; a call with no new completed day is a no-op; `stoppedAt` (404) is not an error. A day is CPU-heavy (~minutes): no short job timeout.
- `github_trending`, `ossinsight` (and other `fetch`-based connectors): `fetch(since)` → `normalize` → `insertSignals` (one transaction per run, `run_id` = job id, gap A12).
- `resolve_pending`: `listUnresolvedNames(db, 100)` → `GithubApiConnector.resolveNames` → `upsertRepo` → `resolvePending` → `markNotFound`. One shared `GithubApiConnector` instance per process (its rate-limit state is per instance, gap A6).
- `score(D)`: a placeholder handler that only records the run (T009 fills it); it is claimable only when every ingest job for data date D is `ok`.
- On start: `applyMigrations`, then `syncSources(db, buildRegistry())` from T006 (parallel task — import it from `@idea-radar/db`; if T006 has not merged when you finish, call it behind a `typeof` guard and note it).

**Restated intent**
> One worker process runs every connector on its schedule from a durable Postgres job table, retries failures with backoff, never exceeds per-connector or global concurrency, never runs the same (job, data date) twice, and records each run's health in `sources`.

**Out of scope**
- Scoring logic (T009/T010), candidate selection (T021, parallel), registry sync itself (T006, parallel).
- A cross-process GitHub token budget (gap A6) beyond one shared connector instance per process.

### Requirement Fidelity Gate
- [x] Restated intent confirmed — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T002 — `@idea-radar/db` data-access functions and `applyMigrations`
**Entry point**: `runWorker`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | Migration `packages/db/migrations/004_jobs.sql` adds `jobs` (id, name, data_key, status, attempts, run_after, locked_at, last_error, created_at, finished_at) with `UNIQUE (name, data_key)`; additive only, rollback SQL in a header comment | durable queue |
| 2 | `enqueueDue(db, now)` inserts due jobs idempotently (`ON CONFLICT DO NOTHING`): `gh_archive` keyed by UTC hour, each enabled daily connector + `resolve_pending` + `score` keyed by UTC date; calling it twice creates no duplicates | schedules |
| 3 | `claimNext(db, caps)` claims with `FOR UPDATE SKIP LOCKED`, honouring per-name concurrency (`rateLimit.concurrency`) and a global cap (default 20, env `WORKER_MAX_CONCURRENCY`) | concurrency |
| 4 | A failed job gets `attempts + 1`, `run_after = now() + min(2^attempts × 30s, 1h)`, `last_error`; after 5 attempts status `failed` | backoff |
| 5 | A job whose `locked_at` is older than its timeout (default 2h; `gh_archive` 6h) is reclaimed | stuck jobs |
| 6 | `score` for date D is not claimable until every ingest job for D is `ok` | score after ingestion |
| 7 | Every connector run calls `recordSourceRun` with `ok` / `error` + message | sources health |
| 8 | `pnpm worker -- --once` runs one enqueue + drain pass and exits 0 against a local DB; without `DATABASE_URL` it exits non-zero with a clear message | entry point |
| 9 | Integration tests against `TEST_DATABASE_URL` (temp schema, skip cleanly without it) cover AC 2–6 | tests |

---

## Evaluation & Acceptance

### Verification Command

```bash
# ci: skip — needs local Postgres
pnpm test && pnpm typecheck
```

---

## Approach

**Pattern reference**: `packages/db/src/repository.ts` (plain `pg`, `Queryable`, parameterised SQL) and `packages/db/src/repository.test.ts` (temp-schema tests).
**Vital slice**: jobs table + enqueue/claim/complete/fail + the `gh_archive` and one `fetch`-based connector wired end to end.
**Cut list**: admin UI, LISTEN/NOTIFY (polling is enough), cross-process GitHub budget, permanent-404 give-up rule for GH Archive (log it as a follow-up unless trivial).

- Queue functions live in `packages/db/src/jobs.ts` (new file; T006 and T021 add their own files in parallel — do not edit `repository.ts`).
- Worker code in `apps/worker/src/` (`runWorker`, handlers per job name). Keep handlers thin.
- Migration number **004** (T021 owns 003 in parallel).

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/db/migrations/004_jobs.sql` | new |
| `packages/db/src/jobs.ts`, `jobs.test.ts` | new |
| `packages/db/src/index.ts` | one re-export line |
| `apps/worker/src/*.ts` | replace interval loop |
| `apps/worker/package.json` | deps if needed |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/db/src/repository.ts`, `packages/db/migrations/00[1-3]*` | applied / owned by others |
| `packages/connectors/src/*.ts` (non-test) | wave-1 code; report needed changes instead |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/` | Supervisor-owned |

---

## Completion Checklist
- [ ] `migration-safety` run
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
