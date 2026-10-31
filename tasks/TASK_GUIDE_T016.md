# TASK_GUIDE — T016: HUN-156 Read-only API (tiers, repo detail, ops)
**Date**: 2026-10-31
**Complexity Level**: C2
**Risk Level**: Medium
**Priority**: P1
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: HUN-156

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`), `docs/SPEC.md` § Data model, § Dashboard views, `docs/ISSUES.md` § HUN-156, HUN-157, `docs/analysis/2026-10-31-gaps.md` rows U4 and the API rows.
2. Read the memory slice in your spawn prompt, then `memory/learnings.md`.
3. Read this file completely, then `agents/backend.md` and `memory/codebase-map.md`.

---

## Requirement (Pillar 1)

`docs/ISSUES.md` § HUN-156 (verbatim):
- Routes exist as stubs in `apps/api/src/index.ts`: `/tiers/:tier`, `/repos/:id`, `/topics/rising`, `/consensus`, `/ops/sources`, `/health`.
- Filters: `language`, `topic`, `collection`, `window` (7d/30d), `limit`, `cursor`.
- Never return signals from connectors with `displayable = false`.

`AGENTS.md` § Rules: "`displayable: false` sources (Trendshift) never reach API responses or the UI."

Supervisor decisions (auto mode, recorded in `tasks/TASK_REVIEW_T016.md`):
- **Scope:** `/tiers/:tier`, `/repos/:id`, `/ops/sources`, `/health` get real data. `/consensus` stays a stub for T015, and `/topics/rising` stays a stub for the rising-topics work (T018). Each stub keeps its `TODO(HUN-xxx)` comment.
- **U4:** API output names and counts only `displayable` sources. A `displayable = false` source is left out of `/ops/sources` too.
- **`window`:** chooses which star gain each item carries (`starsGained` over 7 or 30 days, default `7d`). Ordering stays by `score`.

**Restated intent**
> The dashboard can page through each tier for the latest scored day with the HUN-156 filters, open one repo's detail, and see source health — and no response ever contains data from a non-displayable source.

**Out of scope**
- Consensus and rising topics (stubs stay). Auth, CORS, caching, rate limiting of the API (v1 is read-only and local; see cut list).

### Requirement Fidelity Gate
- [x] Restated intent confirmed — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T002 — schema and `Queryable`; T009 — `repo_scores` rows (tests seed their own rows)
**Entry point**: `createApi`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `createApi(db)` in `apps/api/src/app.ts` returns a Node `http` request handler; `index.ts` only creates the pool, the server and the listener | testable app |
| 2 | `GET /tiers/:tier` returns `{ tier, date, items, nextCursor }` for the latest `repo_scores.date`, ordered by `score DESC, repo_id`; each item has `repoId`, `fullName`, `description`, `language`, `topics`, `stars`, `score`, `starsGained`, `components`, `stackTags`; unknown tier → 404 | tier list |
| 3 | Filters: `language` (case-insensitive equal), `topic` (in `repos.topics`), `collection` (in `value.collections` of an `ossinsight` signal in the last 30 days), `window` (`7d`/`30d`), `limit` (default 50, 1–200), `cursor` (opaque keyset on `score, repo_id`). An invalid value → 400 with a message naming the parameter | filters |
| 4 | `GET /repos/:id` (numeric id; else 400; unknown → 404) returns metadata, the latest score row, the daily `stars_new` series for the last 90 days, `stackTags`, a README excerpt (first 2,000 chars), and signals from **displayable sources only** | repo detail |
| 5 | `GET /ops/sources` returns each displayable source with `enabled`, `lastRunAt`, `lastStatus`, `lastError` | ops |
| 6 | No response contains a row, id, name or count from a source with `displayable = false`: a test seeds a non-displayable source with signals and checks every route's body for its id | displayable rule |
| 7 | All SQL is parameterised; the query functions live in `packages/db/src/api.ts` (new file, one re-export line in `index.ts`) | AGENTS.md pattern |
| 8 | Integration tests (temp schema, skip without `TEST_DATABASE_URL`) start the handler on port 0 and cover AC 2–6, including paging with `cursor` across two pages and every 400 case | tests |

---

## Evaluation & Acceptance

### Verification Command

```bash
# ci: skip — needs local Postgres
pnpm test && pnpm typecheck
```

---

## Approach

**Pattern reference**: `packages/db/src/repository.ts` (plain `pg`, `Queryable`) and its temp-schema tests; `apps/api/src/index.ts` (route shape — keep `node:http`, no framework).
**Vital slice**: `/tiers/:tier` with filters and paging + the displayable test.
**Cut list**: CORS (T017 decides whether the dashboard calls the API from the server side), auth, caching, OpenAPI file.

- Cursor: base64url of `{ score, repoId }`; reject a cursor that does not decode.
- Never select from `signals` or `sources` without joining `sources.displayable = true`.

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `apps/api/src/app.ts`, `app.test.ts` | new |
| `apps/api/src/index.ts` | use `createApi` |
| `packages/db/src/api.ts`, `index.ts` | query functions |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `apps/worker/**`, `packages/connectors/**`, `packages/core/src/scoring.ts` | T008, T009, T012 in parallel |
| `packages/db/migrations/**` | no schema change expected; if one is needed, stop and report |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/` | Supervisor-owned |

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
