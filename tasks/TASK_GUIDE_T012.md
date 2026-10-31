# TASK_GUIDE — T012: HUN-152 OSS Insight connector (collections, loud failure on empty data)
**Date**: 2026-10-31
**Complexity Level**: C1
**Risk Level**: Low
**Priority**: P2
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: HUN-152

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`), `docs/ISSUES.md` § HUN-152.
2. Read the memory slice in your spawn prompt, then `memory/learnings.md` (entry "OSS Insight API returns no data").
3. Read this file completely, then `agents/backend.md`.

---

## Requirement (Pillar 1)

`docs/ISSUES.md` § HUN-152 (verbatim):
- `fetch` already calls `/trends/repos/`; add collections: map each repo to collection names as topic-like tags.
- Respect 600 req/hr; handle non-200 and empty responses.

`memory/learnings.md` "OSS Insight API returns no data": since 2026-03-01 `/v1/trends/repos/` returns `rows: []` with `data_quality.status: "unavailable"`. The current `fetch` yields nothing and the run is recorded `ok`, so the Ops view shows a healthy source with no data.

**Restated intent**
> Each daily run either yields OSS Insight trending rows tagged with the collections each repo belongs to, or fails with a message that says why (HTTP status, empty rows, or the API's own `data_quality` status) — never a silent empty success.

**Out of scope**
- Displaying collections (T016/T017 read them from signals). Retries (T007 scheduler).

### Requirement Fidelity Gate
- [x] Restated intent confirmed — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T001 — test runner; T007 — `fetch`-based handler records `error` on throw
**Entry point**: `OssInsightConnector`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | A `trends/repos` response with zero rows over all periods throws `OssInsightEmptyError`; its message includes `data_quality.status` (and its message/reason field if present) when the body has one | empty responses |
| 2 | A non-200 response throws with the URL and status; a body that is not the expected JSON shape throws | non-200 |
| 3 | Collections: fetch the collection list and each collection's member repos once per run (check the live API for the real endpoints and shapes — `https://api.ossinsight.io/v1/collections/` — and save one small response of each as a fixture); emitted signals carry `value.collections` = the names of every collection the repo belongs to (merge with `collection_names` if a trends row has it) | map repo → collections |
| 4 | A collection fetch failure fails the run (no partial tags written silently) | fail loudly |
| 5 | Requests go one at a time up to `rateLimit.concurrency` and the run stays under `rateLimit.perHour` (600): count the requests a run makes and throw before exceeding the budget | 600 req/hr |
| 6 | Injectable `fetchImpl`; unit tests on fixtures cover AC 1–5 | tests |

---

## Evaluation & Acceptance

### Verification Command

```bash
pnpm test && pnpm typecheck
```

---

## Approach

**Pattern reference**: `packages/connectors/src/github-trending.ts` (injectable `fetchImpl`, `TrendingParseError`, loud failure on 0 rows).
**Vital slice**: loud failure on empty data + collection tags from fixtures.
**Cut list**: caching the collection list across runs; per-language trends.

- Run one live request per endpoint to see the real shape before writing the parser; quote what you saw in the report. Do not depend on the live API in tests.

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/connectors/src/ossinsight.ts` | collections, errors, budget |
| `packages/connectors/src/ossinsight.test.ts` | new |
| `packages/connectors/src/fixtures/ossinsight/` | saved responses |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/connectors/src/github-api.ts`, `index.ts`, `apps/**`, `packages/db/**` | T008, T009, T016 in parallel |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/` | Supervisor-owned |

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
