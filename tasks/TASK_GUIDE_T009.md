# TASK_GUIDE — T009: HUN-149 Tier classification job
**Date**: 2026-10-31
**Complexity Level**: C2
**Risk Level**: Low
**Priority**: P1
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: HUN-149

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`), `docs/SPEC.md` § Tier scoring, `docs/ISSUES.md` § HUN-149, HUN-150, `docs/analysis/2026-10-31-gaps.md` rows U1, U5, U8 and A3.
2. Read the memory slice in your spawn prompt, then `memory/learnings.md` and `memory/decisions.md`.
3. Read this file completely, then `agents/backend.md` and `memory/codebase-map.md`.

---

## Requirement (Pillar 1)

`docs/ISSUES.md` § HUN-149 (verbatim):
- Daily job computes per-repo inputs from `repo_daily`, `repos`, `signals` and calls `classifyTier`; writes `repo_scores` with `components`.
- Velocity percentile computed across all repos with activity in the window.
- Unit tests for each tier boundary.

`docs/SPEC.md` § Tier scoring (verbatim rows):
- Trending: "Top 1% of 7-day star velocity, or listed on GitHub Trending / OSS Insight this week" — ranked by "7-day stars, consensus count".
- Medium: "500+ stars and positive 30-day velocity for 4+ consecutive weeks, not in Trending" — ranked by "30-day growth rate, activity".
- Lowkey: "Under ~200 stars, pushed in last 30 days, 2+ distinct contributors, README present, 7-day velocity above its own 90-day baseline" — ranked by "Lowkey score".

Supervisor decisions for open questions (auto mode, recorded in `tasks/TASK_REVIEW_T009.md`):
- **U1 (medium rule):** "positive 30-day velocity" for week k = stars gained in the 30 days ending at checkpoint k is ≥ `tierConfig.medium.min30dStars`. Checkpoints step back 7 days from the window end. `positiveWeeks` = consecutive checkpoints from the newest that pass. Default `min30dStars: 1` is the spec's literal reading; the owner tunes it.
- **U8 (contributors):** `contributors` = the largest daily `repo_daily.contributors` over the last 30 days. Daily distinct counts cannot be summed into a distinct count, so this is a lower bound.
- **Lowkey baseline:** `classifyTier` gets a new `velocityAboveBaseline` input, with the same definition as T021's `velocity` reason: the 7-day daily rate is above the prior-83-day daily rate, and no prior history counts as above.

**Restated intent**
> The daily `score` job turns the latest ingested data into one `repo_scores` row per repo that matches a tier, with every input stored in `components`, so the API can list each tier ranked and explain why each repo is there.

**Out of scope**
- The real lowkey score components (T010): until then the lowkey `score` is the interim value below, with `components.interim = true`.
- `consensus_count` (T015) and `fake_star_flag` (T011): write `0` and `false`.

### Requirement Fidelity Gate
- [x] Restated intent confirmed — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T002 — `upsertRepoScores`, `repo_daily`; T007 — `score` job; T021 — velocity definition
**Entry point**: `scoreDay`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `scoreDay(db, date)` in `packages/db/src/scores.ts` computes `TierInput` in SQL for every repo with a `repos` row and any `repo_daily` or `signals` row in the last 90 days. Windows end at `date` − 1 day (the last complete UTC day) | inputs |
| 2 | `velocityPercentile` = `percent_rank()` of 7-day `stars_new` across all repos with a `repo_daily` row in the 7-day window | percentile |
| 3 | `listedByTrendingSource` = any `github_trending` or `ossinsight` signal in the 7-day window | trending rule |
| 4 | `positiveWeeks` and `contributors` follow the U1 and U8 decisions above; `daysSincePush` from `repos.pushed_at` (null → not lowkey); `hasReadme` = non-empty `repo_content.readme_md`; archived repos get no tier | medium, lowkey rules |
| 5 | `classifyTier` gains `velocityAboveBaseline`; `tierConfig.medium` gains `min30dStars: 1` and `tierConfig.lowkey` gains `requireVelocityAboveBaseline: true`, all in `packages/core/src/scoring.ts` | AGENTS.md § Rules |
| 6 | `score` per tier: trending = 7-day stars; medium = 30-day stars ÷ max(stars − 30-day stars, 1); lowkey (interim) = 7-day stars ÷ (prior daily rate × 7 + 1). `components` holds every `TierInput` field plus `stars7d`, `stars30d`, and `interim: true` for lowkey | ranked by, explainable |
| 7 | Writes for `date` in one transaction: delete that date's rows, then `upsertRepoScores`; a rerun gives the same rows; returns `{ scored, byTier, skippedNoMetadata }` | idempotent |
| 8 | The worker `score` handler calls `scoreDay(db, job data date)` instead of the placeholder | wiring |
| 9 | Unit tests in `packages/core/src/scoring.test.ts` for each tier boundary (99th percentile edge, listed flag, 499/500 stars, 3/4 weeks, 199/200 stars, 30/31 days, 1/2 contributors, README absent, baseline equal/above, tier order). Integration tests (temp schema, skip without `TEST_DATABASE_URL`) for one repo per tier, percentile, idempotent rerun | tests |

---

## Evaluation & Acceptance

### Verification Command

```bash
# ci: skip — needs local Postgres
pnpm test && pnpm typecheck
```

---

## Approach

**Pattern reference**: `packages/db/src/candidates.ts` (one `INSERT … SELECT` style over `repo_daily` / `signals`, windows ending at a date) and `packages/core/src/scoring.ts`.
**Vital slice**: inputs SQL + `classifyTier` per row + persisted rows for all three tiers.
**Cut list**: T010 lowkey components; consensus; fake stars; history beyond one row per day.

- Compute inputs in SQL (one query, CTEs), classify in Node with `classifyTier` (the rule must stay in `core`), and write with `upsertRepoScores` in batches. Only repos with a `repos` row get scored; T008 fetches metadata for candidates.
- New file `scores.ts` and `scores.test.ts`; one re-export line in `packages/db/src/index.ts`.

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/core/src/scoring.ts`, `scoring.test.ts` | config + `velocityAboveBaseline` + boundary tests |
| `packages/db/src/scores.ts`, `scores.test.ts`, `index.ts` | `scoreDay` |
| `apps/worker/src/handlers.ts` | the `score` handler line only |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| other handlers in `apps/worker/src/handlers.ts`, `candidateConfig` in `scoring.ts` | T008 in parallel |
| `packages/connectors/**`, `apps/api/**` | T008, T012, T016 in parallel |
| `packages/db/migrations/00[1-4]*` | applied; if you need a migration use **006** |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/` | Supervisor-owned |

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
