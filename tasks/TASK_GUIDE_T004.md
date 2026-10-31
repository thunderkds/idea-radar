# TASK_GUIDE — T004: HUN-146 GH Archive streaming + repo_daily rollup
**Date**: 2026-10-31
**Complexity Level**: C2
**Risk Level**: Low
**Priority**: P1
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: HUN-146

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`), `docs/SPEC.md` § Sources + § Risks, `docs/ISSUES.md` § HUN-146.
2. Read the memory slice in your spawn prompt.
3. Read this file completely, then `agents/backend.md`.
4. C2: read `memory/codebase-map.md` if it exists.

---

## Requirement (Pillar 1)

`docs/ISSUES.md` § HUN-146 (verbatim):
- Download `https://data.gharchive.org/YYYY-MM-DD-H.json.gz`, stream-gunzip, parse NDJSON line by line (never load a full hour into memory).
- Keep only `KEPT_EVENT_TYPES`; aggregate per `(repo.id, UTC date)` into `repo_daily` (`WatchEvent` → stars_new, `ForkEvent` → forks_new, etc.; `distinct_actors` = unique actor ids).
- Track the last processed hour so reruns are idempotent and gaps are backfilled.
- Fixture test with a small hand-made NDJSON file.

Hosting open question (BigQuery vs dumps): this task uses dumps — FACT: `docs/ISSUES.md` § HUN-146 "Download `https://data.gharchive.org/…json.gz`".

**Restated intent**
> Given the completed UTC days since the cursor, the GH Archive ingester streams each hour's dump, filters to the five kept event types, and produces `RepoDaily` rollup rows plus the new cursor — with memory bounded by the day's aggregate (never the raw events) and idempotent reruns.

**Out of scope**
- Postgres writes. T002 (in parallel) adds `upsertRepoDaily`, `getCursor`, `setCursor` in `@idea-radar/db`. This task defines a small store interface in its own file and tests with an in-memory fake; worker wiring is T007.
- BigQuery mode. Fake-star actor analysis (T011).

**Requirement Refs**: `docs/ISSUES.md` § HUN-146; `docs/SPEC.md` § Risks (GH Archive volume).

### Requirement Fidelity Gate
- [x] Restated intent confirmed — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T001 — `pnpm test` runner
**Entry point**: `GhArchiveConnector`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `hourUrl(date)` yields `https://data.gharchive.org/2026-10-30-0.json.gz` style URLs (hour not zero-padded, UTC) | URL format |
| 2 | Event stream: gzip body → `zlib.createGunzip()` → line reader → `JSON.parse` per line; works on a fixture `.json.gz` built from a hand-made NDJSON file | stream, line by line |
| 3 | Non-kept event types and malformed lines are skipped (malformed counted and reported, not thrown) | keep only KEPT |
| 4 | `rollup(events)` maps WatchEvent→stars_new, ForkEvent→forks_new, PushEvent→pushes, IssuesEvent with `action: "opened"`→issues_opened, PullRequestEvent with `action: "opened"`→prs_opened; `distinct_actors` = unique actor ids across all kept events of that repo/day | aggregation |
| 5 | Events crossing midnight UTC split into two `RepoDaily` rows by UTC date | UTC date |
| 6 | `ingestDays(store, { now })` reads the cursor (last fully ingested UTC date) from `store`, then for each completed UTC day after it (a day is complete when its hour 23 dump exists, i.e. `now` ≥ day+1 01:00 UTC) streams hours 0..23 sequentially, aggregates the whole day in memory, calls `store.writeDaily(rows)` once (replace semantics, matching T002 `upsertRepoDaily`), then `store.setCursor(date)`; a rerun with the same cursor processes nothing; gaps of several days are backfilled in order | idempotent + backfill |
| 7 | `distinct_actors` is exact for the whole UTC day (unique actor ids across all 24 hours) — this is why the unit of work is a day, not an hour (Supervisor decision 2026-10-31) | correct daily totals |
| 8 | HTTP 404 for an hour not yet published stops the run without advancing the cursor; other HTTP errors throw | negative |

---

## Evaluation & Acceptance

### Success Criteria

| # | Given | Expect | How it's checked |
|---|-------|--------|------------------|
| 1 | fixture with 12 events (3 repos, 2 days, mixed types, 1 malformed line) | exact `RepoDaily[]` expected values | unit test |
| 2 | fake store, cursor = D-3, `now` = D 02:00 UTC | days D-2 and D-1 processed (48 injected hour fetches), cursor = D-1 | unit test |
| 3 | rerun | 0 hours processed | unit test |

### Verification Command

```bash
pnpm --filter @idea-radar/connectors test && pnpm typecheck
```

---

## Approach

**Pattern reference**: `packages/connectors/src/gh-archive.ts` — keep `KEPT_EVENT_TYPES`, `isKept`; extend in place.
**Vital slice**: stream → filter → rollup for one hour, plus the cursor loop.
**Cut list**: BigQuery mode; parallel hour downloads; on-disk caching of dumps (`data/gharchive/` is gitignored if you need a temp dir, but prefer pure streaming).

- Node built-ins only (`zlib`, `readline` or `stream`), global `fetch` with an injectable `fetchImpl`.
- Aggregate in a `Map` keyed `${repoId}|${date}` with a `Set` of actor ids; one hour of a busy repo is fine in memory — the full day of events is not — keep only the per-(repo, date) aggregate, never the events.
- Store interface lives in `gh-archive.ts` (e.g. `RollupStore { getCursor(); setCursor(); writeDaily(rows) }`), so T007 can adapt T002's functions to it.

---

## Edge Case Checklist
- [ ] Last line without trailing newline is still parsed
- [ ] Event with missing `repo.id` → skipped
- [ ] Cursor absent (first run) → start at a configurable backfill start (default: yesterday only)
- [ ] Scheduler still calls it hourly (T007); an hourly call with no newly completed day is a cheap no-op
- [ ] Very large hour: memory stays bounded (no `await res.text()`)

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/connectors/src/gh-archive.ts` | implementation |
| `packages/connectors/src/gh-archive.test.ts` | tests |
| `packages/connectors/src/fixtures/gh-archive/*.ndjson` | hand-made fixture (gzip it in the test at runtime, or commit the `.gz`) |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/core/src/connector.ts` | interface stable |
| `packages/db/**` | T002 |
| other `packages/connectors/src/*.ts` | T003, T005 in parallel |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/` | Supervisor-owned |

---

## Test Plan
Fixture-based unit tests; optional real-download smoke for one past hour, guarded by `GHARCHIVE_LIVE=1`.

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
