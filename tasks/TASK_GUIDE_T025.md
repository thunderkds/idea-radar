# TASK_GUIDE — T025: GitHub Search discovery into the tracked set
**Date**: 2026-10-31
**Complexity Level**: C2
**Risk Level**: Low
**Priority**: P1
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: HUN-172

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md`, `docs/SPEC.md` § Tracking strategy and § Sources (Search 30 req/min).
2. Call easy-memory `memory_search` first (GitHub Search, discovery, tracked_repos, rate limit); then the memory slice in your spawn prompt.
3. Read this file, `agents/backend.md`, `tasks/TASK_GUIDE_T024.md`, `packages/connectors/src/github-api.ts`, `packages/db/src/tracking.ts`.

---

## Requirement (Pillar 1)

GH Archive no longer sees most new repos (`memory/learnings.md`, 2026-10-31), so the lowkey tier needs another way to find small, recent repos. `docs/SPEC.md` § Tracking strategy names a GitHub Search slice as a discovery source.

**Restated intent**
> A daily `discover` job runs a fixed set of GitHub Search queries (repos created or pushed recently, stars within the lowkey range, per language in a configured list), and adds every result to `tracked_repos` as `normal`, due now, with `added_reason = 'search'`. It writes the results' metadata through the GitHub API connector (it is the only writer of `repos`) and respects the Search limit of 30 requests per minute and the 1,000-results-per-query cap.

**Out of scope**: grouping (T026); topic-specific searches driven by the dashboard.

### Requirement Fidelity Gate
- [x] Restated intent confirmed — Supervisor, from the user's choice to use GitHub's API (2026-10-31)
- [x] Domain terms align with `docs/SPEC.md` § Tracking strategy
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T024 — tracked repos + snapshots
**Entry point**: `discoverHandler`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `discoveryConfig` in `scoring.ts`: languages list, `createdWithinDays` 30, `pushedWithinDays` 7, `stars` range 5..200, pages per query, daily request cap | config |
| 2 | `GithubApiConnector.searchRepos(query, page)`: REST or GraphQL `search(type: REPOSITORY)`, own limiter at ≤ 30 req/min shared across calls, stops at 1,000 results; fixture test | search |
| 3 | `discover` job (daily, cap 1, needs the token; skipped and logged without it): runs the configured queries, upserts results into `repos` and `tracked_repos` (existing tracked rows keep their priority and due time) | discovery |
| 4 | Tests: limiter spaces 31 calls over ≥ 60 s with a fake clock; a query's results land in `tracked_repos` once; an existing `leader` stays `leader` | tests |

---

## Evaluation & Acceptance

### Verification Command

```bash
pnpm lint && pnpm typecheck && TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test
```

### Demonstration
BEFORE/AFTER in `tasks/TASK_REVIEW_T025.md`: run the job against a saved Search fixture on a scratch schema; BEFORE `tracked_repos` empty; AFTER the fixture's repos present with `added_reason = 'search'`.

---

## Approach

**Pattern reference**: `resolveNames` and its rate limiter in `github-api.ts`.
**Vital slice**: `searchRepos` + `discover` job.
**Cut list**: topic-driven searches, adaptive query slicing.
- Never run `git push`. Never read or write `.env*`. Only `idea-radar-test-pg` on 5436.

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/connectors/src/github-api.ts` (+ test, fixture) | `searchRepos` |
| `packages/core/src/scoring.ts` | `discoveryConfig` |
| `packages/db/src/tracking.ts` (+ test) | upsert from discovery |
| `apps/worker/src/handlers.ts` (+ test) | `discoverHandler` |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/db/migrations/**` | no schema change needed |
| `apps/api/**`, `apps/dashboard/**` | out of scope |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/`, `.claude/**`, `memory/` | Supervisor-owned |

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
