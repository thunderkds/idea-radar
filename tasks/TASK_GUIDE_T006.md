# TASK_GUIDE — T006: HUN-143 Registry sync into `sources` + env-flag tests
**Date**: 2026-10-31
**Complexity Level**: C1
**Risk Level**: Low
**Priority**: P1
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: HUN-143

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`), `docs/ISSUES.md` § HUN-143.
2. Read the memory slice in your spawn prompt.
3. Read this file completely, then `agents/backend.md`.

---

## Requirement (Pillar 1)

`docs/ISSUES.md` § HUN-143 (verbatim):
- Interface already exists in `packages/core/src/connector.ts`; keep it stable.
- On worker start, sync `buildRegistry()` into the `sources` table (id, name, enabled, displayable, license_note).
- Unit test: registry honours the `*_ENABLED` env flags; Trendshift is disabled without an API key.

Gap A10 (`docs/analysis/2026-10-31-gaps.md`): the source of truth for `enabled` / `displayable` is the code registry, not the DB column default (`sources.displayable DEFAULT TRUE` in 001 is fail-open). Gap A19: env vs DB `enabled` precedence — code wins.

**Restated intent**
> After the worker starts, the `sources` table lists every connector with the `enabled` and `displayable` flags the code says, so the API and Ops view can trust it.

**Out of scope**
- Calling the sync from the worker loop (T007 owns `apps/worker`; it calls your function on start).
- Changing `SourceConnector`.

### Requirement Fidelity Gate
- [x] Restated intent confirmed — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T002 — `@idea-radar/db` data-access module and `recordSourceRun`
**Entry point**: `syncSources`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `syncSources(db, connectors)` in `packages/db/src/sources.ts` upserts one `sources` row per connector with id, name, enabled, displayable, license_note; it never touches `last_run_at`, `last_status`, `last_error` | sync on start |
| 2 | A row created earlier by `recordSourceRun` (non-displayable placeholder) gets the real flags from the code after `syncSources` | A10 |
| 3 | A source row in the DB with no connector in the code is marked `enabled = false` (not deleted) | stale sources |
| 4 | Unit tests on `buildRegistry(env)`: `OSSINSIGHT_ENABLED=false` disables OSS Insight; `TRENDSHIFT_ENABLED=true` without `TRENDSHIFT_API_KEY` stays disabled; `GITHUB_EXPLORER_ENABLED` defaults false; Trendshift `displayable` is `false` | env flags |
| 5 | Integration test for `syncSources` against `TEST_DATABASE_URL`, skipping cleanly without it (reuse T002's temp-schema helper pattern) | DB test |

---

## Evaluation & Acceptance

### Verification Command

```bash
# ci: skip — needs local Postgres
pnpm --filter @idea-radar/connectors test && pnpm --filter @idea-radar/db test && pnpm typecheck
```

---

## Approach

**Pattern reference**: `packages/db/src/repository.ts` (`recordSourceRun`, unnest batch upserts, `Queryable`) and `packages/db/src/repository.test.ts` (temp schema setup).
**Vital slice**: `syncSources` + the four env-flag unit tests.
**Cut list**: reading `enabled` back from the DB to override env (code wins, A19).

Put the function in a new file `packages/db/src/sources.ts` and re-export it from `index.ts` — T021 adds functions to `@idea-radar/db` in parallel in its own file, so do not edit `repository.ts`.

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/db/src/sources.ts` | new |
| `packages/db/src/sources.test.ts` | new |
| `packages/db/src/index.ts` | one re-export line |
| `packages/connectors/src/index.test.ts` | new env-flag tests |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `apps/worker/**` | T007 in parallel |
| `packages/db/src/repository.ts`, `packages/db/migrations/**` | T021 in parallel adds migration 003 |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/` | Supervisor-owned |

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
