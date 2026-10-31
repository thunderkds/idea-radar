# TASK_GUIDE — T011: HUN-151 Fake-star detection
**Date**: 2026-10-31
**Complexity Level**: C2
**Risk Level**: Low
**Priority**: P2
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: HUN-151

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`), `docs/SPEC.md` § Tier scoring ("Fake-star filter"), `docs/ISSUES.md` § HUN-151, `docs/analysis/2026-10-31-gaps.md` row U3, `memory/decisions.md` entry "Tier rule readings for U1 and U8 (T009)".
2. Read the memory slice in your spawn prompt, then `memory/learnings.md`.
3. Read this file completely, then `agents/backend.md`, `packages/connectors/src/github-api.ts` and `packages/db/src/scores.ts`.

---

## Requirement (Pillar 1)

`docs/SPEC.md` § Tier scoring (verbatim): "**Fake-star filter** — discount stars from accounts under 30 days old or with no public activity, and flag bursts (e.g. 50+ stars within an hour from low-activity accounts). Flagged repos are shown with a warning, not hidden."

`docs/ISSUES.md` § HUN-151 (verbatim):
- Rules from SPEC → Tier scoring. Set `repo_scores.fake_star_flag`; never hide flagged repos.
- Keep GitHub API cost bounded: sample stargazers, don't fetch all.

Supervisor decisions (auto mode, recorded in `tasks/TASK_REVIEW_T011.md`):
- **Which repos get checked:** only the day's scored repos with a star burst, meaning `repo_daily.stars_max_hour` ≥ `fakeStarConfig.burstStarsPerHour` (default 50) on a day in the 7-day window. This bounds the API cost (U3).
- **Low-activity account:** created less than 30 days before it starred the repo, or with no public activity. No public activity means 0 public repos, 0 followers and 0 contributions in the last year. All thresholds live in `fakeStarConfig`.
- **Discount:** `suspiciousShare` is the low-activity share of the sampled stargazers. A repo is flagged when the burst holds and `suspiciousShare` ≥ `fakeStarConfig.flagShare` (default 0.5). For a flagged repo, its trending or lowkey `score` is multiplied by (1 − `suspiciousShare`). Medium is not discounted, because it ranks on growth ratio. `components` gets `fakeStarShare` and `fakeStarSampled`.

**Restated intent**
> After each daily scoring run, repos with a star burst get a bounded sample of their recent stargazers checked; repos whose sample is mostly new or inactive accounts are flagged (still listed) and their trending/lowkey score is discounted by the suspicious share.

**Out of scope**
- Hiding repos. Checking repos without a burst. Cross-day caching of account lookups (cut list).

### Requirement Fidelity Gate
- [x] Restated intent confirmed — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T009 — `scoreDay`, `repo_scores`; T003 — `GithubApiConnector` rate-limit state; T004 — `repo_daily.stars_max_hour`
**Entry point**: `applyFakeStarFlags`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `GithubApiConnector.sampleStargazers(repoId, n)` fetches the newest `n` stargazers (default `fakeStarConfig.sampleSize` = 100) in one GraphQL query with `starredAt`, account `createdAt`, public repo count, follower count and last-year contribution count, through the shared rate-limit state; the token never appears in errors | sample, bounded cost |
| 2 | `isLowActivity(account, starredAt, config)` (pure, `packages/core/src/fake-stars.ts`) implements the rule above; unit tests on each edge (29/30 days, 0/1 repo, 0/1 follower, 0/1 contribution) | rule |
| 3 | `applyFakeStarFlags(db, date, sampler)` in `packages/db/src/fake-stars.ts`: picks the date's `repo_scores` rows with a burst in the 7-day window (same window end as `scoreDay`), samples each, sets `fake_star_flag`, writes `components.fakeStarShare` / `fakeStarSampled`, and discounts trending/lowkey scores per the decision; returns `{ checked, flagged }` | flag + discount |
| 4 | The worker `score` handler calls it right after `scoreDay` when the GitHub connector is enabled; without a token it logs that the check was skipped | wiring |
| 5 | Flagged repos stay in `repo_scores` (never deleted or tier-changed) | never hide |
| 6 | Unit tests with an injected `fetchImpl` and a saved GraphQL fixture for `sampleStargazers`; integration tests (temp schema, skip without `TEST_DATABASE_URL`) with a fake sampler: burst + suspicious → flagged and discounted; burst + healthy → not flagged; no burst → not sampled; medium not discounted | tests |

---

## Evaluation & Acceptance

### Verification Command

```bash
# ci: skip — needs local Postgres
pnpm test && pnpm typecheck
```

---

## Approach

**Pattern reference**: `packages/connectors/src/github-api.ts` (`fetchByIds`, rate-limit pause, token redaction); `packages/db/src/scores.ts` (date window, batch writes).
**Vital slice**: burst filter + sampler + flag on `repo_scores`.
**Cut list**: account cache across days; stargazer pagination beyond one page; per-hour attribution of which stars were in the burst.

- `applyFakeStarFlags` is valid only right after `scoreDay` for that date (the score job runs them in order; `scoreDay` rewrites the date first). State this in its doc comment and do not make it re-entrant.
- Put `fakeStarConfig` at the end of `packages/core/src/scoring.ts` (T010 and T015 add their own blocks in parallel).
- No real token here: say the live GraphQL path is unverified.

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/core/src/fake-stars.ts`, test; `scoring.ts`; `index.ts` | rule + config |
| `packages/connectors/src/github-api.ts`, test, fixture | `sampleStargazers` |
| `packages/db/src/fake-stars.ts`, test; `index.ts` | `applyFakeStarFlags` |
| `apps/worker/src/handlers.ts`, `worker.test.ts` | score handler call |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/db/src/scores.ts`, `packages/core/src/lowkey.ts` | T010 in parallel |
| `packages/db/src/api.ts`, `packages/db/src/consensus.ts` | T015 in parallel |
| `apps/dashboard/**` | T017 |
| `packages/db/migrations/**` | none needed (`fake_star_flag` exists); if one is, stop and report |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/` | Supervisor-owned |

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
