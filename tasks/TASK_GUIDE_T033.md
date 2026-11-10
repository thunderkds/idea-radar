# TASK_GUIDE — T033: Postgres store for ideas (packages/db)
**Date**: 2026-11-10
**Complexity Level**: C2
**Risk Level**: High
**Priority**: P0
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`

---

## Mandatory Startup (Do Not Skip)

Before writing any code:
1. Read `PROJECT_SPEC.md`
2. Read the memory slice in your spawn prompt (`<!-- memory-slice -->`). Read `memory/MEMORY.md` in full only if your work reaches a file, hook, skill or decision the slice does not cover
3. Read this file completely
4. Read `agents/backend.md`
5. Note the **Complexity Level** above and apply the matching process from the Complexity matrix in `agents/backend.md`
6. Read `memory/codebase-map.md` for layout

Also read `PRD.md` (v2.1) and the v2.1 addendum at the end of `BRAINSTORMING_LOG.md`.

---

## Requirement (Pillar 1 — Adapt the requirement)

User (2026-11-10): "claude scan and push to the app mcp, the app will execute and save data, after that, show it in app dashboard"; storage: "Railway Postgres".

**Restated intent** (Supervisor's interpretation, in the project's domain language):
> A small `packages/db` that owns the Postgres schema and every query: save a validated submission in one transaction with the merge rule, log each run, and read ideas back for the MCP tools and the dashboard.

**Out of scope** (what this task explicitly does NOT do):
- The MCP tools and server wiring (T034), dashboard pages (T035), removing git ingest and docs (T036)

**Requirement Refs** (FR/NFR/US IDs from `PRD.md` this task satisfies):
- FR-004: save a valid submission in one transaction; log each call as a run
- FR-005: merge by `id` — latest `date` wins (same date: later submission); keep `first_seen`/`last_seen`; re-sending changes nothing but the run log
- FR-006 (data half): list (newest first, tag/date filters, limit), search (title/summary/tags/why_now), get by id
- NFR-004: queries under 1 s at 10,000 ideas

### Requirement Fidelity Gate (sign off BEFORE implementation)

- [x] Restated intent confirmed to match the user's request — Supervisor, 2026-11-10 (user choices in chat)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary — Supervisor
- [x] Every Acceptance Criterion below traces to a line in the Requirement — Supervisor
- [x] All Requirement Refs exist in `PRD.md` and are fully covered by the Acceptance Criteria — Supervisor

---

## Dependencies & Reachability

**Depends on**: None (uses `packages/ideas` types and validator, already on `main`)

**Entry point**: `saveSubmission` and `migrate` (exported from `@idea-radar/db`, consumed by T034's `apps/mcp`)

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `packages/db` exports `createPool(url)`, `migrate(pool)` (applies `migrations/NNN_*.sql` in order once, recorded in a `schema_migrations` table, inside a transaction each) | FR-004 |
| 2 | Migration `001_ideas.sql` creates `ideas` (`id text pk`, `title`, `summary`, `why_now`, `tags text[]`, `signals jsonb`, `related_repos text[]`, `version_date date`, `first_seen date`, `last_seen date`, `updated_at timestamptz`, a full-text or trigram index for search) and `runs` (`id bigserial`, `received_at`, `date`, `routine`, `idea_count`, `status` ok/rejected, `error text`) | FR-004, FR-006, NFR-004 |
| 3 | `saveSubmission(pool, file: IdeaFile)` upserts every idea in ONE transaction: a newer `date` replaces the content; an older `date` only widens `first_seen`/`last_seen`; the same `date` replaces (later submission wins); then inserts an `ok` run row. Any error rolls everything back | FR-004, FR-005 |
| 4 | Sending the same submission twice leaves `ideas` identical (only a second run row) | FR-005 |
| 5 | `logRejected(pool, {date?, routine?, error})` inserts a `rejected` run row only | FR-004 |
| 6 | `listIdeas(pool, {tag?, since?, until?, limit})` newest `last_seen` first (tie `id`); `searchIdeas(pool, query, limit)` matches title/summary/tags/why_now case-insensitively, title matches first, query passed as a parameter (never concatenated); `getIdea(pool, id)`; `stats(pool)` → `{ideas, runs, last_run}` | FR-006 |
| 7 | All SQL uses parameters; no string-built SQL from inputs | NFR-001 |
| 8 | Integration tests run against a real Postgres when `TEST_DATABASE_URL` is set and skip cleanly (with a visible skip reason) when it is not; CI gets a Postgres service so they run there | FR-004 |

---

## Evaluation & Acceptance (How we know the agent worked correctly)

### Success Criteria (observable, pass/fail)

| # | Given (input/state) | Expect (output/behavior) | How it's checked |
|---|---------------------|--------------------------|------------------|
| 1 | fresh DB | `migrate` twice → tables exist, second run applies nothing | integration test |
| 2 | submissions dated 11-09 then 11-10 with the same id | content from 11-10; `first_seen` 11-09 | integration test |
| 3 | 11-10 then an older 11-08 submission | content stays 11-10; `first_seen` 11-08 | integration test |
| 4 | same submission twice | `ideas` rows identical; 2 run rows | integration test |
| 5 | a failure mid-transaction (e.g. a forced error) | no idea rows written | integration test |
| 6 | 10,000 ideas | list/search/get each < 1 s | integration test |

### Verification Command (exact, runnable)

```bash
# needs a Postgres at TEST_DATABASE_URL. Docker is not usable on this machine (socket permission denied);
# locally use PGlite's wire-protocol server (dev dependency), e.g. `npx pglite-server --port 55432` (check the
# package's real bin name/flags), and CI uses a postgres:16 service. App code always uses `pg`.
TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres pnpm --filter @idea-radar/db test && pnpm lint && pnpm typecheck
```

### Evidence (filled by reviewer at Stage 4/5)

> **Moved.** Filled by the reviewer at Stage 4/5 in `tasks/TASK_REVIEW_T033.md`.

---

## Demonstration

> **Moved.** See `tasks/TASK_REVIEW_T033.md`.

---

## Approach

**Pattern reference**: v1 `packages/db` in tag `v1-scraper` (`git show v1-scraper:packages/db/src/migrations.ts`, `.../index.ts`) — migration runner and pool shape; `packages/ideas/package.json` — package layout.

**Vital slice**: `migrate` + `saveSubmission` with the merge rule; queries are the remainder.
**Cut list**:
- Delete/edit of ideas (manual SQL, PRD assumption 3)
- Read-only DB role for the dashboard (one service, one pool)
- Down migrations

Use `pg` (pin a major). Keep the merge rule in one SQL `INSERT … ON CONFLICT (id) DO UPDATE` with `CASE WHEN EXCLUDED.version_date >= ideas.version_date` for content and `LEAST`/`GREATEST` for the seen dates. Add a `postgres:16` service to `.github/workflows/ci.yml` (image pinned by digest or tag — keep `uses:` SHA-pinned) and pass `TEST_DATABASE_URL`.

---

## Edge Case Checklist

- [ ] Empty submission (`ideas: []`) → only a run row
- [ ] Duplicate ids inside one submission are already rejected by the validator; the DB layer must not assume order
- [ ] Tags compared lowercase
- [ ] Search query with `%`, `_`, quotes → treated as text, not patterns or SQL
- [ ] Concurrent submissions → transactions keep each submission atomic
- [ ] Pin-test pre-flight: the `Pre-existing pin tests` row below is filled before work starts
- [ ] Stale references: grep for old wording this task changes

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/db/{package.json,tsconfig.json}`, `packages/db/src/*.ts`, `packages/db/migrations/001_ideas.sql` | new package |
| `.github/workflows/ci.yml` | Postgres service + `TEST_DATABASE_URL` |
| `pnpm-lock.yaml` | `pg`, `@types/pg` |
| Pre-existing pin tests | `scripts/repo-hygiene.test.ts` pins ci.yml (`uses:` SHA-pinned, `--frozen-lockfile`, least-privilege permissions) — keep passing |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `apps/mcp/**` | T034/T035 |
| `ideas/schema.json`, `packages/ideas/**` | contract — report needed changes |
| `.claude/`, `skills/`, `templates/`, `docs/claude-md/`, `AGENTS.md`, `CLAUDE.md` | kit |

---

## Test Plan

Integration tests per Success Criteria against a disposable Postgres; unit tests for any pure helpers. Run the Verification Command; confirm the suite skips cleanly without `TEST_DATABASE_URL`.

---

## Completion Checklist

- [ ] Implementation done
- [ ] Self-review: `Skill({ skill: "code-review" })` run
- [ ] Security review: `Skill({ skill: "security-review" })` run (if Medium/High risk)
- [ ] `Skill({ skill: "migration-safety" })` run (new schema)
- [ ] Lint passes
- [ ] Tests written AND pass — output pasted into `tasks/TASK_REVIEW_T033.md`'s Evidence table (Hard-Stop Gate 5)
- [ ] `Skill({ skill: "verify" })` run — feature confirmed working in running app
- [ ] Supervisor notified: task ready for Stage 4 review
