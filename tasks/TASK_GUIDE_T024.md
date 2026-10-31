# TASK_GUIDE — T024: Tracked repos + GitHub API star snapshots as the velocity source
**Date**: 2026-10-31
**Complexity Level**: C3
**Risk Level**: Medium
**Priority**: P0
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: HUN-171

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`), and `docs/SPEC.md` § Tracking strategy, § Tier scoring, § Data model.
2. Call easy-memory `memory_search` first (GH Archive volume, star velocity, candidates, scoreDay, GraphQL batch); then read the memory slice in your spawn prompt, then the `memory/learnings.md` entry "GH Archive volume has collapsed".
3. Read this file, then `agents/backend.md`, `packages/connectors/src/github-api.ts` (`fetchByIds`, rate-limit handling), `packages/db/src/scores.ts` (`INPUT_SQL`), `packages/db/src/candidates.ts`, `packages/core/src/scoring.ts`, `apps/worker/src/handlers.ts` (`buildHandlers`, `buildCaps`), `packages/db/migrations/005_*`.
4. Run `Skill({ skill: "migration-safety" })` before writing the migration.

---

## Requirement (Pillar 1)

Measured 2026-10-31 (`memory/learnings.md`): GH Archive now records ~1/55 of 2024's events and no PushEvents, so `repo_daily.stars_new` is a thin sample and `pushes` is always 0. User decisions 2026-10-31 (chat): use GitHub's API for star counts; "pick 1 or 2 of repos in that field to track frequently, not all … another should mark lowest priority or will need to rescrape by the request"; others refresh "Weekly + on request".

**Restated intent**
> Idea Radar keeps a tracked set of repos, each with a priority (`leader`, `normal`, `parked`) and a next-due time. A daily `snapshot` job refreshes every due tracked repo from the GitHub GraphQL API (stars, forks, pushed_at, commits on the default branch in the last 30 days) in batches of 100 and stores one snapshot per repo per day. Scoring and candidate selection take star velocity from snapshot differences, falling back to GH Archive `stars_new` where no snapshot covers a day, and take activity from the snapshot's 30-day commit count instead of GH Archive pushes. This task builds the table, the job and the switch; grouping (T026), Search discovery (T025) and re-scrape on request (T027) come later.

**Out of scope**: grouping and leader picking (T026 sets priorities; until then every tracked repo is `normal`, except that this task seeds `leader` for today's candidates — see AC 3). GitHub Search discovery (T025). Any write API or UI (T027). Dropping `repo_daily` or GH Archive ingest.

### Requirement Fidelity Gate
- [x] Restated intent confirmed — user decisions 2026-10-31 (chat)
- [x] Domain terms align with `docs/SPEC.md` § Tracking strategy
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T003 — GitHub API connector; T009 — tier classification; T021 — candidate selection; T023 — job queue run token
**Entry point**: `snapshotHandler`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | Migration `006_tracking.sql` (+ `006_tracking.down.sql`): `tracked_repos(repo_id PK, priority TEXT NOT NULL DEFAULT 'normal' CHECK in ('leader','normal','parked'), group_key TEXT NULL, added_reason TEXT NOT NULL, added_at, next_due_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_snapshot_at)` with an index on `next_due_at`; `repo_snapshots(repo_id, date, stars, forks, pushed_at, commits_30d, PRIMARY KEY (repo_id, date))`. Additive only; up→down→up tested | tracked set + snapshots |
| 2 | Cadence lives in `packages/core/src/scoring.ts` (`trackingConfig`: `leader` 1 day, `normal` 7 days, `parked` null = only on request; batch 100; daily cap on repos refreshed) | cadence |
| 3 | `trackCandidates(db, date)`: every repo in `candidates` for that date is upserted into `tracked_repos` (`added_reason` = the candidate reason); a new repo starts `normal` and due now. Existing rows keep their priority | tracked set |
| 4 | `GithubApiConnector.fetchSnapshots(ids)`: one GraphQL query per 100 ids returning stars, forks, pushedAt and `defaultBranchRef.target.history(since: now-30d).totalCount`; uses the existing rate-limit state; deleted/inaccessible repos are returned as missing. Fixture test on a saved response | snapshots |
| 5 | `snapshot` job (daily, cap 1, needs the token; skipped and logged without it): picks due tracked repos (`next_due_at <= now`, `parked` only when due was set by a request), up to the daily cap, oldest due first; writes `repo_snapshots` (upsert on `(repo_id, date)`), sets `last_snapshot_at` and `next_due_at = now + cadence(priority)`; a missing repo is set `parked`. Runs before `score` for its date (the score claim already waits for every other job of the date) | job |
| 6 | Star velocity from snapshots: a view or function `repo_star_gains(repo_id, date, stars_new)` spreads each snapshot difference evenly over the days since the previous snapshot. `scores.ts` `INPUT_SQL` and `candidates.ts` read stars per day as the snapshot gain where one covers the day, else GH Archive `stars_new`. The lowkey `activity` component reads `commits_30d` from the latest snapshot in the window instead of `repo_daily.pushes` | velocity switch |
| 7 | Postgres tests: two snapshots 7 days apart (+70 stars) give 10 stars/day over those 7 days; a day with no snapshot falls back to `repo_daily`; a repo with snapshots and GH Archive rows on the same day is not double-counted; activity uses `commits_30d`; due selection respects priority cadence and the cap; a missing repo becomes `parked` | tests |
| 8 | Existing tier, candidate, consensus and fake-star tests still pass (update fixtures only where they assumed `pushes`) | regression |
| 9 | `docs/SPEC.md` § Data model lists the two new tables | spec |

---

## Evaluation & Acceptance

### Verification Command

```bash
pnpm lint && pnpm typecheck && TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test
```

### Demonstration
BEFORE/AFTER/DELTA live in `tasks/TASK_REVIEW_T024.md` `## Demonstration`. BEFORE: a focused script against a scratch schema in `idea-radar-test-pg` that inserts a repo with 0 `repo_daily` star rows but +70 stars between two (hand-inserted) star counts, runs `scoreDay`, and prints the repo's `stars7d` / tier (expected: 0 / no tier). AFTER: same data via `repo_snapshots` → 70 / scored.

---

## Approach

**Pattern reference**: `fetchByIds` (batching, rate limit) in `github-api.ts`; `fetchHandler`/`shortlistHandler` in `handlers.ts`; migration 005 + its `.down.sql`; `INPUT_SQL` windows in `scores.ts`.
**Vital slice**: migration 006 + `fetchSnapshots` + `snapshot` job + the stars-per-day switch in `scores.ts`/`candidates.ts`.
**Cut list**: grouping and leaders (T026), Search discovery (T025), on-request API (T027), backfilling history before the first snapshot, star-history charts.

- Keep thresholds and cadence in `packages/core/src/scoring.ts`.
- Key everything on `repo_id`. Only the GitHub API connector writes `repos`; snapshots are a new table, not `repos` columns.
- Budget: 50,000 tracked repos at batch 100 ≈ 500 queries/day; respect the connector's existing limiter, never exceed 100 concurrent requests.
- Never run `git push`. Never read or write `.env*`. Only the `idea-radar-test-pg` container on port 5436.

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/db/migrations/006_tracking.sql`, `006_tracking.down.sql` | new |
| `packages/db/src/tracking.ts` (+ test) | `trackCandidates`, due selection, snapshot writes |
| `packages/db/src/scores.ts`, `candidates.ts` (+ tests) | stars per day from snapshots, activity from `commits_30d` |
| `packages/core/src/scoring.ts` | `trackingConfig` |
| `packages/connectors/src/github-api.ts` (+ test, fixture) | `fetchSnapshots` |
| `apps/worker/src/handlers.ts` (+ test) | `snapshotHandler`, schedule, caps |
| `packages/db/src/index.ts` | export |
| `docs/SPEC.md` | § Data model rows |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/db/migrations/001_*`–`005_*` | applied |
| `apps/api/**`, `apps/dashboard/**` | T027 / T018 |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/`, `.claude/**`, `memory/` | Supervisor-owned |

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
