# TASK_GUIDE — T026: Idea groups + leader picks (topics + stack, weekly regroup)
**Date**: 2026-10-31
**Complexity Level**: C2
**Risk Level**: Medium
**Priority**: P1
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: HUN-173

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md`, `docs/SPEC.md` § Tracking strategy.
2. Call easy-memory `memory_search` first (tracked_repos, idea groups, leader, stack tags); then the memory slice in your spawn prompt.
3. Read this file, `agents/backend.md`, `tasks/TASK_GUIDE_T024.md` (the tables this builds on), `packages/db/src/tracking.ts`, `packages/connectors/src/stack-tags.ts`, `packages/db/src/scores.ts`.
4. Run `Skill({ skill: "migration-safety" })` if you add a migration.

---

## Requirement (Pillar 1)

User 2026-10-31 (chat, verbatim): "if for the same idea, same category, we should pick 1 or 2 of repos in that field to track frequently, not all … we scrape 10 repos with the idea A but in 10 repos, we got 1-2 repos active, good direction, we can pick it for following, another should mark lowest priority or will need to rescrape by the request." Grouping choice: "Topics now, README later". Others: "Weekly + on request".

**Restated intent**
> Every tracked repo gets an idea-group key built from its normalised GitHub topics and detected stack tags. A weekly `regroup` job recomputes the keys, picks each group's top 1–2 repos as `leader` (daily snapshots) and sets the rest `normal` (weekly). A repo with no group activity, archived, or never scored becomes `parked` (only on request). The key function is one place so README similarity can replace it in v2.

**Out of scope**: README embeddings; any UI or write API (T027); changing the snapshot job (T024).

### Requirement Fidelity Gate
- [x] Restated intent confirmed — user (chat, 2026-10-31)
- [x] Domain terms align with `docs/SPEC.md` § Tracking strategy
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T024 — tracked repos + snapshots
**Entry point**: `regroupHandler`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `ideaGroupKey(topics, stackTags)` in `packages/core` (pure): lowercases, drops generic topics from a list in `scoring.ts` (e.g. `awesome`, `hacktoberfest`, `github`), keeps the 2 most specific topics by a fixed order plus the primary stack tag; returns `null` when nothing is left. Unit tests on real-looking inputs, including two repos of one idea with topics in a different order → same key | grouping |
| 2 | `groupingConfig` in `scoring.ts`: `leadersPerGroup` 2, generic-topic list, the leader ranking weights | config |
| 3 | `regroup` job, weekly (Mondays UTC, cap 1): sets `tracked_repos.group_key` for every tracked repo; ranks each group by latest `repo_scores.score` plus 30-day `commits_30d` (weights from config); top `leadersPerGroup` → `leader`, rest → `normal`; archived, or no score and no snapshot in 30 days → `parked`. A repo with `group_key` null keeps its own priority (one-repo group of itself) | leaders |
| 4 | A newly promoted leader becomes due now; a demoted repo keeps its `next_due_at` | cadence |
| 6 | A tracked repo with exactly one snapshot is due again the next UTC day whatever its priority, so it shows velocity after 1 day instead of 7 (T024 review follow-up); `parked` repos are set with `next_due_at = 'infinity'` (T024 convention) | cadence |
| 5 | Postgres tests: 10 repos of one key with 2 active → those 2 `leader`, 8 `normal`; an archived repo → `parked`; two keys stay independent; rerun is idempotent | tests |

---

## Evaluation & Acceptance

### Verification Command

```bash
pnpm lint && pnpm typecheck && TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test
```

### Demonstration
BEFORE/AFTER in `tasks/TASK_REVIEW_T026.md`: a scratch-schema script with 10 tracked repos of one idea; BEFORE all `normal`; AFTER the regroup, 2 `leader`.

---

## Approach

**Pattern reference**: `packages/connectors/src/stack-tags.ts` (pure, tested), `selectCandidates` (one transaction per date).
**Vital slice**: `ideaGroupKey` + `regroup` job.
**Cut list**: README similarity, group names for display, OSS Insight collection hints (add only if trivial).
- Never run `git push`. Never read or write `.env*`. Only `idea-radar-test-pg` on 5436.

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/core/src/grouping.ts` (+ test), `scoring.ts` | key function, config |
| `packages/db/src/tracking.ts` (+ test) | `regroup` |
| `apps/worker/src/handlers.ts` (+ test) | `regroupHandler`, weekly schedule |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/db/migrations/001_*`–`006_*` | applied |
| `apps/api/**`, `apps/dashboard/**` | T027 |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/`, `.claude/**`, `memory/` | Supervisor-owned |

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
