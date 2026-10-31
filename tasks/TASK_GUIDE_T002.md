# TASK_GUIDE — T002: HUN-142 Postgres data-access module + migration 002
**Date**: 2026-10-31
**Complexity Level**: C2
**Risk Level**: Medium
**Priority**: P0
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: HUN-142

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`), `docs/SPEC.md` § Data model, `docs/ISSUES.md` § HUN-142.
2. Read the memory slice in your spawn prompt.
3. Read this file completely, then `agents/backend.md`.
4. C2: read `memory/codebase-map.md` if it exists.
5. Schema work: run `Skill({ skill: "migration-safety" })` before writing migration 002.

---

## Requirement (Pillar 1)

`docs/ISSUES.md` § HUN-142 (verbatim):
- `pnpm db:migrate` applies `packages/db/migrations/*.sql` in order against `DATABASE_URL` and is idempotent.
- Add a data-access module in `packages/db/src` with typed functions: `upsertRepo`, `upsertRepoDaily`, `insertSignals` (batch), `upsertRepoContent`, `upsertRepoScores`, `recordSourceRun`.
- `insertSignals` resolves `fullName` → `repo_id` from `repos` when `repoId` is 0; signals that cannot be resolved are queued for the GitHub API connector to look up (do not drop silently).
- Integration test against a real Postgres (docker-compose) covering each function.

Plus two storage needs of wave-1 siblings, owned here so only one task writes migrations:
- GH Archive (T004) must track the last processed hour → a per-source cursor: `getCursor(sourceId)`, `setCursor(sourceId, value)`.
- The unresolved-signal queue needs read/clear functions for the GitHub API connector side: `listUnresolvedNames(limit)` and a way to re-insert resolved signals and remove them from the queue (`resolvePending(map: Map<fullName, repoId>)` or similar).

**Restated intent**
> Every ingest path has one typed, tested function to write its data to Postgres; no signal is ever lost because its repo is not yet known.

**Out of scope**
- Calling the GitHub API to resolve names (T003). Worker wiring (T006/T007). Query functions for the API (T016).
- Editing `001_init.sql` (forbidden — new changes go in `002_*.sql`).

**Requirement Refs**: `docs/ISSUES.md` § HUN-142; `docs/SPEC.md` § Data model; `AGENTS.md` § Rules.

### Requirement Fidelity Gate
- [x] Restated intent confirmed — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T001 — `pnpm test` runner and `TEST_DATABASE_URL` convention
**Entry point**: `insertSignals`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | Running `pnpm db:migrate` twice on an empty DB applies all migrations once and the second run is a no-op (exit 0) | idempotent migrate |
| 2 | `upsertRepo` inserts, then updates on same `repo_id` (rename changes `full_name`, row count stays 1) | repos keyed on repo_id |
| 3 | `upsertRepoDaily` upserts on `(repo_id, date)`; second call with same key replaces counts (document: replace, not add) | repo_daily |
| 4 | `insertSignals` inserts a batch of N signals in one round trip (single multi-row INSERT or `unnest`), `value` stored as jsonb | batch |
| 5 | `insertSignals` with `repoId: 0` + known `fullName` (case-insensitive) stores the resolved `repo_id` | name resolution |
| 6 | `insertSignals` with `repoId: 0` + unknown `fullName` writes the signal to a pending queue table (migration 002), not to `signals`, and returns counts `{ inserted, queued }` | do not drop silently |
| 7 | `upsertRepoContent`, `upsertRepoScores` upsert on their keys; `recordSourceRun` updates `last_run_at`, `last_status`, `last_error` and inserts the `sources` row if missing | each function |
| 8 | `getCursor`/`setCursor` round-trip a value per source id | T004 need |
| 9 | Integration tests run against `TEST_DATABASE_URL` and **skip** (not fail) when it is unset or unreachable | AGENTS.md § Rules |
| 10 | A signal with `repoId: 0` and no `fullName` throws (programmer error) | negative |
| 11 | Migration 002 adds `repo_daily.contributors` and `repo_daily.stars_max_hour` (INTEGER NOT NULL DEFAULT 0); `upsertRepoDaily` writes them; `RepoDaily` in `packages/core/src/types.ts` gains `contributors` and `starsMaxHour` | gap A4/A5 (`docs/analysis/2026-10-31-gaps.md`) |
| 12 | `pending_signals` has `attempts` and `last_attempt_at`; `resolvePending` moves rows to `signals` keeping the original `observed_at`; `markNotFound(names)` bumps `attempts`, and rows at `attempts >= 5` are deleted (count returned) | gap A8 |
| 13 | `pg` returns BIGINT and NUMERIC columns as JS numbers (type parsers set in `packages/db/src/index.ts`); `RepoScore` gains `fakeStarFlag`; `Repo.createdAt` becomes `Date \| null` to match the nullable column | gap A16 |
| 14 | `migrate.ts` takes `pg_advisory_lock` for the run so two processes cannot apply migrations at once | gap A19 |

---

## Evaluation & Acceptance

### Success Criteria

| # | Given | Expect | How it's checked |
|---|-------|--------|------------------|
| 1 | fresh DB, `pnpm db:migrate` ×2 | both exit 0; `schema_migrations` lists 001 and 002 once | integration test or command |
| 2 | signals `[known by id, known by name, unknown name]` | `{ inserted: 2, queued: 1 }` | integration test |
| 3 | `TEST_DATABASE_URL` unset | DB tests reported as skipped, suite exits 0 | `pnpm test` |

### Verification Command

```bash
# ci: skip — needs local Postgres from docker compose
docker compose up -d postgres && pnpm --filter @idea-radar/db test && TEST_DATABASE_URL= pnpm --filter @idea-radar/db test
```

---

## Approach

**Pattern reference**: `packages/db/src/migrate.ts` — plain `pg` client, parameterised SQL, no ORM. Imitate it.
**Vital slice**: `insertSignals` with resolution + queue, then the five upserts.
**Cut list**: query helpers for API reads (T016); connection retry logic; ORM / query builder; signal dedup / `run_id` on retries (T007, gap A12).

- Plain SQL with `$n` parameters only — never string-concatenate values.
- Functions take a `Pool | PoolClient` (a `Queryable` type) as first arg so the worker can run them in a transaction.
- Migration 002: `pending_signals` (same columns as `signals` + `full_name` NOT NULL, `queued_at`), index on `lower(full_name)`; `ingest_cursors (source_id TEXT PRIMARY KEY, cursor TEXT NOT NULL, updated_at)`. Additive only — reversible by DROP.
- Note `migrate.ts` today runs `BEGIN` per file but `ROLLBACK` only in the outer catch — check it is correct per file; fix only if a test proves a bug.

---

## Edge Case Checklist
- [ ] `fullName` match is case-insensitive (`repos_full_name_idx` is on `lower(full_name)`)
- [ ] Empty array to `insertSignals` / upserts is a no-op, no SQL error
- [ ] `observedAt` timezone kept (TIMESTAMPTZ)
- [ ] Same unknown name queued twice — acceptable, but `listUnresolvedNames` returns distinct names
- [ ] Large batch (e.g. 5,000 signals) does not exceed the 65,535 bind-parameter limit — chunk or use `unnest`

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/db/migrations/002_pending_signals_and_cursors.sql` | new |
| `packages/db/src/repository.ts` (or similar) | data-access functions |
| `packages/db/src/index.ts` | re-export |
| `packages/db/src/*.test.ts` | integration tests |
| `packages/db/package.json` | depend on `@idea-radar/core` for types if needed |
| `packages/core/src/types.ts` | `RepoDaily`, `RepoScore`, `Repo.createdAt` changes (AC 11, 13) — this task is the only wave-1 owner of this file |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/db/migrations/001_init.sql` | applied migrations are immutable |
| `packages/connectors/**`, `apps/**` | sibling tasks T003–T005 work there in parallel |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/` | Supervisor-owned |

---

## Test Plan
Integration tests per function against `TEST_DATABASE_URL`. Run every test in a temporary schema (`CREATE SCHEMA test_<random>`, `SET search_path`, apply migrations there, `DROP SCHEMA … CASCADE` after) — `TEST_DATABASE_URL` points at the same `radar` database as dev data, so never truncate shared tables. Local Postgres: `POSTGRES_PORT=5433 docker compose up -d postgres` (host port 5432 is taken by another container); `TEST_DATABASE_URL=postgres://radar:radar@localhost:5433/radar`. Show the skip path with the env var unset.

---

## Completion Checklist
- [ ] `migration-safety` run
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
