# TASK_GUIDE — T021: Candidate selection over repo_daily + signals
**Date**: 2026-10-31
**Complexity Level**: C2
**Risk Level**: Medium
**Priority**: P1
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: none yet (new task from gap analysis A1, A11)

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`), `docs/SPEC.md` § Tier scoring, `docs/ISSUES.md` § HUN-145, HUN-148, HUN-149, `docs/analysis/2026-10-31-gaps.md` rows A1, A3, A11.
2. Read the memory slice in your spawn prompt, then `memory/learnings.md`.
3. Read this file completely, then `agents/backend.md` and `memory/codebase-map.md`.
4. Schema work: run `Skill({ skill: "migration-safety" })` before writing migration 003.

---

## Requirement (Pillar 1)

Gap A1 (`docs/analysis/2026-10-31-gaps.md`): nothing selects lowkey candidates. GH Archive only writes `repo_daily`; only the GitHub API connector writes `repos`; so a repo found only through GH Archive never gets metadata, README or a tier. Gap A11: the shortlist (HUN-148: "repos with any tier candidate signal in the last 7 days (cap configurable, default 5,000/day)") has no ordering, cap rule or storage.

**Restated intent**
> Each day, one function picks the repos worth fetching metadata and README for — from GH Archive velocity and from other sources' signals — stores the list with the reason for each pick, and caps it in priority order, so metadata fetch (T003) and enrichment (T008) have one input.

**Out of scope**
- Fetching metadata or README (T003 wiring in T007, T008). Tier classification (T009). Scheduling the job (T007 adds a `candidates` job later; expose a function only).

### Requirement Fidelity Gate
- [x] Restated intent confirmed — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T002 — `repo_daily` columns (`contributors`), `signals`, migration runner
**Entry point**: `selectCandidates`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | Migration `packages/db/migrations/003_candidates.sql` adds `candidates (date DATE, repo_id BIGINT, reason TEXT, priority NUMERIC, PRIMARY KEY (date, repo_id))`; additive only, rollback SQL in header | storage |
| 2 | `selectCandidates(db, date, config)` in `packages/db/src/candidates.ts` writes the day's list in one transaction (delete that date, insert) and returns `{ selected, byReason }` | one input |
| 3 | Reason `velocity`: `stars_new` summed over the 7 days ending at `date` ≥ `minStars7d` (default 3) AND the 7-day daily rate is above the repo's own prior-83-day daily rate (a repo with no prior history counts as above) | A1 lowkey path |
| 4 | Reason `signal`: any `signals` row for the repo in the 7 days ending at `date` from a source other than `github_api` | HUN-148 "tier candidate signal" |
| 5 | Ordering for the cap: `priority` = 7-day stars ÷ (prior daily rate × 7 + 1), signals first on ties; at most `cap` rows (default 5,000) | A11 |
| 6 | Thresholds and cap live in `packages/core/src/scoring.ts` as `candidateConfig` (AGENTS.md § Rules: "Scoring thresholds and weights live in `packages/core/src/scoring.ts`") | rules |
| 7 | `listCandidates(db, date, { needsMetadata })` returns candidate repo ids, optionally only those with no `repos` row or `repos.updated_at` older than 7 days | feeds T003/T008 |
| 8 | Integration tests against `TEST_DATABASE_URL` (temp schema, skip cleanly) cover each reason, the cap order, idempotent rerun of the same date, and a repo with no history | tests |

---

## Evaluation & Acceptance

### Verification Command

```bash
# ci: skip — needs local Postgres
pnpm test && pnpm typecheck
```

---

## Approach

**Pattern reference**: `packages/db/src/repository.ts` (plain `pg`, `Queryable`, one-statement batch SQL) and its temp-schema tests.
**Vital slice**: the SQL for both reasons + the cap order, persisted.
**Cut list**: tuning the thresholds against labelled data (T010); a dashboard view of candidates.

- Do the selection in SQL (one `INSERT … SELECT` over `repo_daily` / `signals`), not by loading rows into Node — `repo_daily` holds millions of rows per day.
- New files only (`candidates.ts`, `candidates.test.ts`); add one re-export line to `packages/db/src/index.ts`. T006 and T007 add their own files in parallel.
- Migration number **003** (T007 owns 004).

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/db/migrations/003_candidates.sql` | new |
| `packages/db/src/candidates.ts`, `candidates.test.ts` | new |
| `packages/db/src/index.ts` | one re-export line |
| `packages/core/src/scoring.ts` | `candidateConfig` |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/db/src/repository.ts`, `apps/worker/**` | T007 in parallel |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/` | Supervisor-owned |

---

## Completion Checklist
- [ ] `migration-safety` run
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
