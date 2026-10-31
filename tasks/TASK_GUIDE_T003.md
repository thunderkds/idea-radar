# TASK_GUIDE — T003: HUN-145 GitHub API connector (metadata, name resolution, rate limit)
**Date**: 2026-10-31
**Complexity Level**: C2
**Risk Level**: Medium
**Priority**: P0
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: HUN-145

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`), `docs/SPEC.md` § Sources, `docs/ISSUES.md` § HUN-145.
2. Read the memory slice in your spawn prompt.
3. Read this file completely, then `agents/backend.md`.
4. C2: read `memory/codebase-map.md` if it exists.

---

## Requirement (Pillar 1)

`docs/ISSUES.md` § HUN-145 (verbatim):
- GraphQL `nodes(ids:)` batches (≤100 per query) for repo metadata; fill `repos`.
- Resolve unknown `owner/name` → `repo_id` for signals from other sources.
- Read `rateLimit { cost remaining resetAt }` on every response; pause when remaining < 10% until `resetAt`.
- Unit test `normalize` with a fixture; integration test behind a `GITHUB_TOKEN` guard.

`docs/SPEC.md` § Sources: 5,000 GraphQL points/hr per token; 2,000 points/min; max 100 concurrent (REST + GraphQL).

**Restated intent**
> Given repo ids or `owner/name` strings, the connector returns canonical `Repo` metadata from GitHub GraphQL in batches of ≤100, never exceeds the rate budget, and never leaks the token.

**Out of scope**
- Writing to Postgres (T002 provides `upsertRepo`; the worker wires them in T007). This task returns data; it does not import `@idea-radar/db`.
- README/manifest fetching (T008). Fake-star stargazer sampling (T011).

**Requirement Refs**: `docs/ISSUES.md` § HUN-145; `docs/SPEC.md` § Sources; `AGENTS.md` § Rules (rate limits, no secrets).

### Requirement Fidelity Gate
- [x] Restated intent confirmed — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T001 — `pnpm test` runner
**Entry point**: `GithubApiConnector`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `fetchByIds(ids)` splits 250 ids into 3 GraphQL calls (100/100/50) using `nodes(ids:)` with GraphQL node ids derived from numeric ids, or an equivalent documented approach | ≤100 per query |
| 2 | `resolveNames(["Owner/Repo", …])` returns `Map<fullName, Repo>` using aliased `repository(owner:,name:)` fields, ≤100 per query; names GitHub does not know are returned in a separate `notFound` list (not thrown) | resolve owner/name |
| 3 | Every query requests `rateLimit { cost remaining resetAt }`; when `remaining < 10%` of `limit`, the next call waits until `resetAt` (tested with an injected clock/sleep — no real waiting in tests) | rate limit |
| 4 | `normalize(fixtureNode)` returns the expected `Signal` and a `toRepo(node)` returns a `Repo` matching `packages/core/src/types.ts` | normalize fixture |
| 5 | HTTP 401/403/5xx and GraphQL `errors[]` surface as thrown errors whose message never contains the token | no secrets |
| 6 | Concurrency of in-flight requests ≤ `rateLimit.concurrency` (10) | 100-concurrent cap |
| 7 | Integration test calling real GitHub for one known repo (e.g. `nodejs/node`) runs only when `GITHUB_TOKEN` is set; otherwise skipped | token guard |
| 8 | `fetch(since)` yields nothing when constructed without a token and `enabled` is false | negative |
| 9 | `normalize()` returns `[]`: metadata goes to `repos` through `toRepo()`, never into `signals`, so GitHub API refreshes do not inflate `consensus_count` | gap A7 (`docs/analysis/2026-10-31-gaps.md`) |
| 10 | No mutable candidate-id state on the connector: `fetchByIds` and `resolveNames` are plain methods the T007 pipeline jobs call; `fetch(since)` yields nothing | gap A9 |
| 11 | When a numeric id cannot be turned into a GraphQL node id, or the node comes back `null`, the id is returned in a `missing` list so the caller can fall back to `resolveNames` | gap A6 |

---

## Evaluation & Acceptance

### Success Criteria

| # | Given | Expect | How it's checked |
|---|-------|--------|------------------|
| 1 | stubbed `fetch` returning fixture JSON | batching + parsing correct | unit test |
| 2 | stub returns `remaining: 400, limit: 5000` | next call sleeps until `resetAt` | unit test with fake clock |
| 3 | stub returns 401 | error thrown; `String(err)` excludes the token | unit test |

### Verification Command

```bash
pnpm --filter @idea-radar/connectors test && pnpm typecheck
```

---

## Approach

**Pattern reference**: `packages/connectors/src/github-api.ts` (existing class shape, `normalize`) — extend in place.
**Vital slice**: one batched GraphQL request function with rate-limit tracking; `fetchByIds` and `resolveNames` built on it.
**Cut list**: REST fallback; Search API; GitHub App auth; persistent / cross-process rate-limit budget (T007, gap A6).

- Use global `fetch` (Node 22+) with an injectable `fetchImpl` for tests — no Octokit dependency (Simplicity First, `AGENTS.md` § Karpathy Engineering Principles).
- Token goes only in the `Authorization: bearer` header; never log request headers.
- Keep `SourceConnector` interface unchanged (`docs/ISSUES.md` § HUN-143 "keep it stable"). `fetch(since)` yields nothing (AC 10).
- `Repo.createdAt` becomes `Date | null` in T002 (parallel); write `toRepo` so it compiles with either (e.g. `createdAt: new Date(node.createdAt)` is fine for both).

---

## Edge Case Checklist
- [ ] Deleted/private repo in `nodes(ids:)` → `null` node; skip it, don't crash
- [ ] Renamed repo: `resolveNames` on old name follows GitHub redirect → returns current `nameWithOwner`; map key stays the requested name
- [ ] Owner/name with `.` or `-` characters; GraphQL alias names must be sanitized (`r0`, `r1`, …)
- [ ] `resetAt` in the past → no wait

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/connectors/src/github-api.ts` | implementation |
| `packages/connectors/src/github-api.test.ts` | unit + guarded integration tests |
| `packages/connectors/src/fixtures/github-api/*.json` | fixtures |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/core/src/connector.ts` | interface must stay stable |
| `packages/db/**` | T002 |
| other `packages/connectors/src/*.ts` | T004, T005 in parallel |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/` | Supervisor-owned |

---

## Test Plan
Unit tests with an injected `fetchImpl` and fake clock; one guarded integration test.

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
