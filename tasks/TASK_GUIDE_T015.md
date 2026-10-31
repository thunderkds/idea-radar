# TASK_GUIDE — T015: HUN-155 Source consensus score (+ API fields)
**Date**: 2026-10-31
**Complexity Level**: C2
**Risk Level**: Low
**Priority**: P1
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: HUN-155

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`), `docs/SPEC.md` § Tier scoring ("Source consensus"), § Dashboard views, `docs/ISSUES.md` § HUN-155, HUN-157, HUN-158, `docs/analysis/2026-10-31-gaps.md` rows U4, U6.
2. Read the memory slice in your spawn prompt, then `memory/learnings.md`.
3. Read this file completely, then `agents/backend.md`, `packages/db/src/api.ts`, `apps/api/src/app.ts` and `packages/db/src/scores.ts`.
4. Schema work: run `Skill({ skill: "migration-safety" })` before writing migration 005.

---

## Requirement (Pillar 1)

`docs/ISSUES.md` § HUN-155 (verbatim):
- `consensus_count` = distinct displayable-or-not sources with a signal for the repo in the last 7 days.
- Store first-seen date per source (in `components` or a small view) for the "who caught it first" timeline.

`docs/SPEC.md` § Tier scoring: "`consensus_count` = number of distinct sources flagging the repo in the last 7 days, with the first-seen date per source. It boosts Trending ranking and powers the "who caught it first" timeline." § Dashboard views: "Source consensus — Repos flagged by 2+ sources, with who flagged them first."

`AGENTS.md` § Rules: "`displayable: false` sources (Trendshift) never reach API responses or the UI. They may only influence scores."

T016 review gap (`tasks/TASK_REVIEW_T016.md`): tier items carry no consensus count or fake-star flag, but HUN-157's list shows "consensus badges, fake-star warning". This task adds both fields, so T017 can show them.

**Restated intent**
> After each daily scoring run, every scored repo's `consensus_count` counts the distinct sources that flagged it in the 7 days, a view gives each repo's first-seen date per source, Trending rows get a configured boost from consensus, and the API exposes displayable-only consensus (tier items, repo timeline, `/consensus`) plus the fake-star flag.

**Out of scope**
- GH Archive and Idea Radar itself are not sources on the timeline (U6). Dashboard pages (T017/T018).

### Requirement Fidelity Gate
- [x] Restated intent confirmed — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T009 — `scoreDay`; T016 — `packages/db/src/api.ts`, `apps/api/src/app.ts`
**Entry point**: `applyConsensus`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | Migration `packages/db/migrations/005_source_first_seen.sql` adds view `repo_source_first_seen (repo_id, source, first_seen_at, last_seen_at, signals)` over `signals`; additive, rollback SQL in the header; an index only if a test or `EXPLAIN` shows it is needed | first-seen per source |
| 2 | `applyConsensus(db, date)` in `packages/db/src/consensus.ts` sets `repo_scores.consensus_count` for the date = distinct sources (displayable or not) with a signal in the 7-day window ending at the same window end as `scoreDay` | consensus_count |
| 3 | Trending rows: `score` × (1 + `consensusConfig.trendingBoostPerSource` × max(`consensus_count` − 1, 0)), default boost 0.1, config at the end of `packages/core/src/scoring.ts`; `components.consensusBoost` records the factor. Valid only right after `scoreDay` (doc comment says so) | boosts Trending |
| 4 | Worker `score` handler calls `applyConsensus` right after `scoreDay` | wiring |
| 5 | API `/tiers/:tier` items gain `consensusCount` (displayable sources only, same rule as `getRepoDetail`) and `fakeStarFlag`; `/repos/:id` gains `timeline: [{ source, firstSeenAt, lastSeenAt }]` for displayable sources, oldest first | HUN-157 fields |
| 6 | `GET /consensus?limit&cursor` returns repos with ≥ 2 displayable sources in the 7 days up to the latest scored date, each with `repoId`, `fullName`, `consensusCount`, `sources: [{ source, firstSeenAt }]`, ordered by count desc then earliest first-seen; replaces the `TODO(HUN-155)` stub | Source consensus view |
| 7 | A non-displayable source counts in `repo_scores.consensus_count` and the boost, but never appears in any API body (extend T016's leak test to the new fields and route) | AGENTS.md rule |
| 8 | Integration tests (temp schema, skip without `TEST_DATABASE_URL`): count across sources, window edges, boost only on trending, view rows, every new API field and `/consensus` paging | tests |

---

## Evaluation & Acceptance

### Verification Command

```bash
# ci: skip — needs local Postgres
pnpm test && pnpm typecheck
```

---

## Approach

**Pattern reference**: `packages/db/src/api.ts` (displayable join, keyset cursor) and `apps/api/src/app.ts` (validation, 400s).
**Vital slice**: `consensus_count` + the two tier-item fields; then the view, timeline and `/consensus`.
**Cut list**: materialising the view; consensus history across days.

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/db/migrations/005_source_first_seen.sql` | new view |
| `packages/db/src/consensus.ts`, test; `index.ts` | `applyConsensus` |
| `packages/core/src/scoring.ts` | `consensusConfig` (end of file) |
| `packages/db/src/api.ts`, `apps/api/src/app.ts`, `app.test.ts` | new fields, `/consensus` |
| `apps/worker/src/handlers.ts`, `worker.test.ts` | score handler call |
| `packages/db/src/repository.test.ts` | migration count assertions, if any |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/db/src/scores.ts`, `packages/core/src/lowkey.ts` | T010 in parallel |
| `packages/connectors/**`, `packages/db/src/fake-stars.ts` | T011 in parallel |
| `apps/dashboard/**` | T017 |
| `packages/db/migrations/00[1-4]*` | applied |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/` | Supervisor-owned |

---

## Completion Checklist
- [ ] `migration-safety` run
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
