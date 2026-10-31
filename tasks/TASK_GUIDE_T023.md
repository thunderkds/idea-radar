# TASK_GUIDE — T023: Job queue run token + heartbeat (no double run after a stuck-job reclaim)
**Date**: 2026-10-31
**Complexity Level**: C2
**Risk Level**: Medium
**Priority**: P1
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: none (follow-up to HUN-144 / T007)

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`).
2. Call easy-memory `memory_search` first for this task's topics (job queue, claimNext, stuck job, reclaim); then read the memory slice in your spawn prompt, then the `memory/decisions.md` entries "Worker job queue is an in-repo `jobs` table (T007)" and "Job queue stays on Postgres; BullMQ deferred (T023)".
3. Read this file completely, then `agents/backend.md`, `packages/db/src/jobs.ts`, `packages/db/src/jobs.test.ts`, `apps/worker/src/runner.ts`, `apps/worker/src/handlers.ts` (`fetchHandler`), `apps/worker/src/worker.test.ts`.

---

## Requirement (Pillar 1)

User decision 2026-10-31 (chat, verbatim): "small fix but not for the suggested if we move to future and met the issue" — after the Supervisor's comparison of (a) a run token + heartbeat on the in-repo queue, (b) BullMQ, (c) a Postgres queue library. Reading: do the small fix (a) now; BullMQ stays a future option, revisited only if the problem shows up again at scale (recorded in `memory/decisions.md`).

The defect (Supervisor analysis of `packages/db/src/jobs.ts` on `main` @ e737126):
- `claimNext` reclaims a `running` job whose `locked_at` is older than its timeout (2 h; 6 h for `gh_archive`, `shortlist`). A run that is slow but alive is then claimed a second time, so two runs of one job execute at once.
- `completeJob(db, id)` and `failJob(db, id, …)` match only `id` and `status = 'running'`. The stale first run can therefore mark the second run `ok`, or reset it to `pending` with backoff.
- `fetchHandler` (`apps/worker/src/handlers.ts`) calls `completeJob` inside the transaction that inserts signals. A stale run commits its signals even though a newer run owns the job, so signals are duplicated.

**Restated intent**
> Each claim of a job carries a run token. Only the run holding the current token can complete, fail or extend the job; a stale run's calls change nothing and it knows it lost the job. A running job sends a heartbeat that keeps `locked_at` fresh, so a slow but alive run is never reclaimed; only a run whose worker died (no heartbeat) is reclaimed after the timeout.

**Out of scope**
- BullMQ, pg-boss, Graphile Worker or any new dependency. Redis.
- A schema migration (the token is the existing `attempts` column — see Approach).
- Cancelling a stale run's handler mid-flight (it finishes; its writes are fenced at completion). Changing timeouts, caps, backoff or the score ordering rule.

### Requirement Fidelity Gate
- [x] Restated intent confirmed — user ("small fix …")
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T007 — Postgres-backed scheduler and job runner
**Entry point**: `heartbeatJob`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `completeJob` and `failJob` take the claimed `Job` (or its `id` + `attempts` token) and update only the row whose `id`, `status = 'running'` **and** `attempts` match. `completeJob` returns `true` when it applied, `false` otherwise; `failJob` keeps returning the new status or `null` | stale run can't overwrite |
| 2 | Postgres test: claim a job at T0, reclaim it after the timeout (second claim), then call `completeJob` and `failJob` with the **first** claim's token → both are no-ops; the row stays `running` with the second claim's `attempts` and `locked_at`. The second claim's `completeJob` then sets `ok` | stale run can't overwrite |
| 3 | New `heartbeatJob(db, job, now)` in `packages/db/src/jobs.ts`, exported from the package index: sets `locked_at = now` only when `id`, `status = 'running'` and `attempts` match; returns `true`/`false` | heartbeat |
| 4 | Postgres test: claim at T0, `heartbeatJob` at T0 + 1h50m, then `claimNext` at T0 + 2h10m returns `null` (job not reclaimed); without the heartbeat the same `claimNext` reclaims it (existing behaviour). `heartbeatJob` with a stale token returns `false` and leaves `locked_at` unchanged | heartbeat |
| 5 | `runWorker` / `runJob` (`apps/worker/src/runner.ts`) send `heartbeatJob` every `heartbeatMs` (option, default 60 000; must stay far below the shortest timeout of 2 h) while the handler runs, and stop when it settles (success or error). A heartbeat error is logged, never thrown. Worker test with a small `heartbeatMs` shows ≥1 heartbeat during a slow handler and none after it ends | heartbeat |
| 6 | A run whose `completeJob`/`failJob` did not apply logs `status: "lost"` and does **not** call `recordSourceRun` | stale run knows |
| 7 | `fetchHandler`: when `completeJob` returns `false` inside its transaction, it rolls back (no signals committed) and logs that the job was lost. Postgres test: a stale fetch run commits no signals | duplicate signals |
| 8 | All existing `jobs.test.ts` and `worker.test.ts` tests still pass (update call sites to the new signatures only) | regression |

---

## Evaluation & Acceptance

### Verification Command

```bash
pnpm lint && pnpm typecheck && TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test
```

### Demonstration
BEFORE/AFTER/DELTA live in `tasks/TASK_REVIEW_T023.md` `## Demonstration`. BEFORE: a focused script or test against `TEST_DATABASE_URL` that claims a job, reclaims it after the timeout, then calls `completeJob` with the first claim's id → the row shows `ok` although the second run still holds it. AFTER: same command → row stays `running`.

---

## Approach

**Pattern reference**: the existing `completeJob`/`failJob` SQL in `packages/db/src/jobs.ts`; worker tests in `apps/worker/src/worker.test.ts`.
**Vital slice**: token check in `completeJob`/`failJob` + `heartbeatJob` + runner heartbeat.
**Cut list**: aborting a stale handler mid-run; a separate `claim_id` column; metrics on lost runs; BullMQ.

- **Token = `attempts`.** Every claim of a row has a distinct `attempts` value: a fresh claim keeps the value set by the previous `failJob` (+1 each failure), and a stuck-job reclaim adds 1 in `claimNext`. So two live runs of one row never share `(id, attempts)`. Do not use `locked_at` as the token: the heartbeat changes it.
- `claimNext` already returns `attempts`; keep its SQL unchanged.
- In `failJob` the token is the `attempts` value **before** this failure (the one `claimNext` returned).
- Heartbeat: `setInterval` in `runJob`, cleared in `finally`. Use the injected `now()` for the timestamp so tests stay deterministic.
- Keep plain parameterised SQL; no migration; no new dependency.
- Never run `git push`. Never read or write `.env*`. Use only the `idea-radar-test-pg` container on port 5436.

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/db/src/jobs.ts` | token in `completeJob`/`failJob`, new `heartbeatJob` |
| `packages/db/src/index.ts` | export `heartbeatJob` (if not exported via `export *`) |
| `packages/db/src/jobs.test.ts` | AC 2, 4; call sites |
| `apps/worker/src/runner.ts` | heartbeat interval, `lost` handling |
| `apps/worker/src/handlers.ts` | `fetchHandler` passes the job, rolls back when lost |
| `apps/worker/src/worker.test.ts` | AC 5, 6, 7 |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/db/migrations/**` | applied; no schema change needed |
| `packages/core/**`, `packages/connectors/**`, `apps/api/**`, `apps/dashboard/**` | out of scope |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/`, `.claude/**`, `memory/` | Supervisor-owned |

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
