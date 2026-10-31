# TASK_REVIEW — T023: Job queue run token + heartbeat

> Sibling of `tasks/TASK_GUIDE_T023.md`. Everything here is **filled by the reviewer at Stage
> 4/5** — it is deliberately NOT in the guide, because the implementing agent re-reads the guide on
> every turn and never fills these two sections.
>
> Consumers resolve each section **guide first, this file second** (`.claude/hooks/lib/guide_sections.py`):
> a legacy guide that still carries these sections inline keeps working unchanged, and a stray
> review file can never override an inline section.

---

<!-- Optional: the final report, only for a task run in auto mode (the user's `[auto]` tag,
`docs/claude-md/tracks.md` `## Auto mode`). To use it, copy the block below out of this comment, to this
place, and replace every <...>. Keep `Mode: auto` as its first line, exactly as written: T182's hook reads
it. Write it to this file before the run ends; the chat message is a copy, not the report. The same
block is the Supervisor's final chat message. It is not the `delivery-report` page and not
Evidence. A taste decision (what the user wants) also ends with the flag. Write `DEBATED` only when ≥2
Advocate `Agent` calls ran for that question, naming each Advocate's option. A decision with no Advocates is
labelled `RULE`, `FACT` or `SAFER OPTION`, never `DEBATED`. A decision flagged `⚠ decided for you` is a choice, and is never labelled `FACT`. A
safety action a rule requires (for example the backup before a delete) is `RULE` without the flag.
At Risk Medium or High, a `RULE:` counts only when it names a written rule (`path:line`,
`path § <heading>`, or `docs/claude-md/tracks.md` `### <section>`), and a `FACT:` needs a Citation
(`path:line "quoted text"`); without one it is a choice and must be `DEBATED`. Good: `2. backed up the CSV
— RULE: `docs/claude-md/tracks.md` `### Stops that stay``. Bad: `1. kept recurring.csv — RULE: Surgical Changes`.
`Memory:` records the diff-driven memory pass you run before you stop: each entry written, or `nothing new`.
After an auto verify pass the hook, never you, adds `Closed: row moved to Done <date> — …` and moves the row,
or adds `Paused: done not moved — <reason>`. It moves the row only when this block holds `Mode: auto`, a
numbered decision, `Checks:`, `Memory:`, the `Not done:` auto verify slot with its result, and `Not done:`
naming the merge — no `<...>` left (`docs/claude-md/tracks.md` `### Auto close-out`).

## Auto decisions

Mode: auto
1. <what was decided> — RULE: <the rule>
2. <what was decided> — FACT: <path>:<line> "<quoted text>"
3. <what was decided> — DEBATED: <option> (Advocate 1: <its proposal>; Advocate 2: <its proposal>) ⚠ decided for you — please review
4. <what was decided> — SAFER OPTION: <why> ⚠ decided for you — please review
Paused: <only when a stop that stays paused the task: which one, and why>
Checks: tests `<command>` — <result>; reviews <skill — result>; real run `<command>` — printed `<what it printed>` (auto-checked, not /verify)
Memory: <each entry the memory pass wrote, as `file — entry` | nothing new>
Not done: merge (yours); <auto verify: running (T182) | auto verify: <result> | /verify (yours)>

-->
## Auto decisions

Mode: auto
1. The run token is the existing `attempts` column; no migration and no new column — RULE: `tasks/TASK_GUIDE_T023.md` § Approach ("Token = `attempts`.")
2. Small fix on the in-repo queue; BullMQ and Postgres queue libraries deferred — RULE: `tasks/TASK_GUIDE_T023.md` § Requirement (Pillar 1) (user decision 2026-10-31, quoted there; `memory/decisions.md` "Job queue stays on Postgres; BullMQ deferred (T023)")
3. `JobHandler.run` may resolve `"completed"` so the runner skips its own `completeJob` when `fetchHandler` already completed the job inside its transaction — FACT: `apps/worker/src/handlers.ts:93 "await completeJob(client, job.id);"` (on `wave5-guides`: the fetch handler completes the job itself, so a second token-checked `completeJob` would return false and log a false `lost`)
4. The P2 (late heartbeat logs a false `heartbeat_lost`) and three P3 findings are left as suggestions, not fixed — RULE: `.claude/skills/code-review/SKILL.md` § Phase 4 — Apply Safe Fixes ("Do not apply P2/P3 fixes automatically")
Checks: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` (Supervisor rerun in the worktree under T023) — core 52/52, dashboard 140/140, connectors 87/88 (1 pre-existing live-token skip), db 122/122, api 23/23, worker 32/32, scripts 21/21, exit 0; `pnpm lint` and `pnpm typecheck` exit 0; reviews code-review — P0 0, P1 0, P2 1 (late heartbeat after completion logs a false `heartbeat_lost`; log only), P3 3 (heartbeats not chained if Postgres hangs; AC 5 test uses real timers; stale score/shortlist/gh_archive runs still write their data, only completion is fenced — accepted in the guide's cut list); security-review — no findings; easy-verifier score — overall 74, floor 80 missed, change_risk 100 (Companion score row); real run `DEMO_AFTER=1 … tsx t023-demo.mts` — printed `run 2 still holds the job? yes (fenced)` (auto-checked, not /verify)
Memory: memory/learnings.md — easy-verifier `score` findings need `confidence` low/medium/high and an `evidence_ref` taken from that dimension's own evidence pack
Not done: merge (yours); auto verify: ☑ pass (session caa06316-710d-4618-94b6-c5f054bcc071, commit 60d4de7189f256124707bad69c264dcc0941cb88, log .claude/verify-runs/T023-60d4de7189f2.log)
Closed: row moved to Done 2026-10-31 — auto verify pass (session caa06316-710d-4618-94b6-c5f054bcc071, commit 60d4de7189f256124707bad69c264dcc0941cb88); Gates 5 and 6 checked

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/db/src/jobs.test.ts` (stale `completeJob`/`failJob` after a reclaim are no-ops; heartbeat at T0+1h50m prevents reclaim at T0+2h10m; stale-token and not-running heartbeat return false), `apps/worker/src/worker.test.ts` "run token and heartbeat (T023)" (heartbeat moves `locked_at` and stops after the job; heartbeat error logged, job still `ok`; lost run logs `lost` with no source health, on success and on throw; stale fetch run commits 0 signals). Output: db 122/122, worker 32/32 |
| Verification command run | ☑ pass | `pnpm lint && pnpm typecheck && TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` exit 0 (Supervisor rerun in the worktree under T023): core 52, dashboard 140, connectors 88 (1 pre-existing skip), db 122, api 23, worker 32, scripts 21, 0 failed |
| Negative cases hold | ☑ pass | stale token: `completeJob` false, `failJob` null, `heartbeatJob` false, row unchanged; heartbeat on a non-running job false; heartbeat query error logged, never thrown; stale fetch run rolls back |
| verify | ☑ pass | auto-run by hook, session caa06316-710d-4618-94b6-c5f054bcc071, commit 60d4de7189f256124707bad69c264dcc0941cb88, log .claude/verify-runs/T023-60d4de7189f2.log — pass |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `jobs.ts` (claim/complete/fail/heartbeat), `runner.ts`, `handlers.ts` `fetchHandler` + `JobHandler` type, and their tests. Callers of `completeJob`/`failJob`: only `runner.ts` and `fetchHandler`. `lane: C2, 5 files, 274 lines, FITS` |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 |
| **Companion score (easy-verifier)** | ☑ fail | overall 74 (floor 80 missed), change_risk 100 (bugfix, confirmed; `bugfix_without_regression_test` passed with `apps/worker/src/worker.test.ts` and `packages/db/src/jobs.test.ts`), scope changes, ref `wave5-guides...HEAD`, abstentions: solution-fit, requirement-fidelity, reliability, api, data, operations, infrastructure, gates: none offered, test pairs: 2 proposals confirmed + `runner.ts`↔`worker.test.ts:219` added, divergence: findings not sent (the verifier accepts only `evidence_ref`s from its own pack; the code-review refs were rejected), ratings: architecture 100, code-quality 100, blast-radius 65 (`changed_files_in_churn_hotspots_share`), test-strategy 65 (`source_files_without_covering_test_share`, `network_calls_in_unit_tests_observed`), security 59 (`redaction_hits_observed` — lockfile/kit hashes, field report E2), supply-chain 55 (`ci_actions_unpinned_share` although pinned — field report E1; `ci_provenance_step_missing`). The gap to 80 is repo-wide, not this diff. report: `/home/hungnguyenhuu/.easy-verifier-reports/T023/evidence-report-changes-20261031T135120-890805Z.html` |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: worker and db only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: worker and db only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: worker and db only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE** (captured 2026-10-31T13:43:25Z on `main` code @ 7eeeac1, before any implementation commit; script `/tmp/claude-1000/-home-hungnguyenhuu-workspace-pets-hungnguyen111-idea-radar/38a748fd-166b-4d4f-b351-2bf435c26688/scratchpad/t023-demo.mts`, throwaway schema in `idea-radar-test-pg`):

```
$ TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm exec tsx --conditions=source t023-demo.mts
2026-10-31T13:43:25Z
run 1 claimed         {"id":1,"name":"a","dataKey":"1","attempts":0}
run 2 reclaimed       {"id":1,"name":"a","dataKey":"1","attempts":1} (run 1 was slow but alive)
run 1 completeJob returned undefined
row after stale completeJob: {"status":"ok","attempts":1,"locked_at":null}
run 2 still holds the job? NO - stale run overwrote it
```

**AFTER** (captured 2026-10-31T13:47:18Z, same script, same command plus `DEMO_AFTER=1` so the stale run passes its claimed job instead of the bare id):

```
$ DEMO_AFTER=1 TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm exec tsx --conditions=source t023-demo.mts
2026-10-31T13:47:18Z
run 1 claimed         {"id":1,"name":"a","dataKey":"1","attempts":0}
run 2 reclaimed       {"id":1,"name":"a","dataKey":"1","attempts":1} (run 1 was slow but alive)
run 1 completeJob returned false
row after stale completeJob: {"status":"running","attempts":1,"locked_at":"2026-10-31T08:10:01.000Z"}
run 2 still holds the job? yes (fenced)
```

**DELTA**: A slow but alive run that lost its job to a reclaim can no longer mark the new run's job `ok`, fail it, or commit its signals, and a running job now sends a heartbeat so it is not reclaimed while alive.

**WITNESS**: Supervisor reran the full suite in the worktree on 2026-10-31 under the T023 trace (`memory/event-trace/T023.jsonl`); the BEFORE/AFTER captures are the implementing agent's, from commits `98bb541` (before any implementation) and `98bc5af`.
