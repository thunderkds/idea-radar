# TASK_REVIEW — T024: Tracked repos + star snapshots

> Sibling of `tasks/TASK_GUIDE_T024.md`. Everything here is **filled by the reviewer at Stage
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
1. Every candidate enters `tracked_repos` as `normal`, due now; no `leader` is seeded here (the guide's Out of scope line pointed at AC 3, and AC 3 says `normal`) — RULE: `tasks/TASK_GUIDE_T024.md` § Acceptance Criteria (AC 3 "a new repo starts `normal` and due now")
2. `next_due_at` counts from the start of the snapshot's UTC day plus the cadence, not from the run time, so a daily leader is not skipped when the job starts later each day — FACT: `packages/db/src/tracking.ts:47 "const days = trackingConfig.cadenceDays[priority];"` (cadence in days; a `now`-based due time drifts past the next daily run)
3. `parked` is stored as `next_due_at = 'infinity'`, so due selection needs no special case; T026 and T027 must set or clear it the same way — FACT: `packages/db/migrations/006_tracking.sql:5 "-- next_due_at = 'infinity' means \"only on request\": a `parked` repo"`
4. Activity has no fallback to GH Archive pushes; a repo with no snapshot in 30 days scores activity 0 — RULE: `tasks/TASK_GUIDE_T024.md` § Acceptance Criteria (AC 6 "instead of `repo_daily.pushes`")
5. Three P2 and two P3 review findings are left as follow-ups, not fixed — RULE: `.claude/skills/code-review/SKILL.md` § Phase 4 — Apply Safe Fixes ("Do not apply P2/P3 fixes automatically")
Checks: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` (Supervisor rerun in the worktree under T024) — core 54/54, dashboard 140/140, connectors 91/92 (1 pre-existing live-token skip), db 142/142, api 23/23, worker 36/36, scripts 21/21, exit 0; `pnpm lint`, `pnpm typecheck` exit 0; reviews code-review — P0 0, P1 0, P2 3 (live GraphQL `history` totalCount query and point cost unverified without a token; `repo_star_gains` view scans all snapshot history each run; new repos get no snapshot velocity until a second snapshot 7 days later), P3 2 (`pushes30d` key now holds commits; agent ran migration-safety by hand); migration-safety — GO (additive, up→down→up tested, no locks on existing tables); security-review — no findings; easy-verifier score — overall 64, floor 80 missed, change_risk 100 (Companion score row); real run: Demonstration script on a scratch schema — printed `repo 1: stars7d=70 tier=lowkey` (auto-checked, not /verify)
Memory: memory/decisions.md — "Tracking strategy: GitHub API snapshots, idea groups, leaders (T024–T027)" (written at planning); nothing new from the review
Not done: merge (yours); auto verify: running (T182)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/db/src/tracking.test.ts` (gain spreading +70/7d = 10/day, trackCandidates upsert keeps priority, due selection cadence + cap, missing → parked), `packages/db/src/scores.test.ts` (stars7d 70 from snapshots, fallback to repo_daily, no double count, activity from commits_30d), `packages/db/src/candidates.test.ts`, `packages/db/src/migrations.test.ts` (006 up→down→up), `packages/connectors/src/github-api.test.ts` (fetchSnapshots on `fixtures/github-api/snapshots.json`), `packages/core/src/scoring.test.ts`, `apps/worker/src/worker.test.ts` (snapshot handler). Output: db 142/142, connectors 91/92, worker 36/36, core 54/54 |
| Verification command run | ☑ pass | `pnpm lint && pnpm typecheck && TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` exit 0 (Supervisor rerun in the worktree under T024) |
| Negative cases hold | ☑ pass | no token → job skipped and logged, no github_api health; repo GitHub no longer returns → parked; first snapshot gives no gain; a star loss counts 0; GitHub failure keeps `score` from running; rerun of a day overwrites, no duplicate |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | migration 006, `tracking.ts`, `scores.ts` INPUT_SQL, `candidates.ts` SELECT_SQL, `fetchSnapshots`, `snapshotHandler`, and their tests. `lane: C3, 18 files, 905 lines, FITS` (10 unpredicted files are tests, the fixture and the down migration) |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 |
| **Companion score (easy-verifier)** | ☑ fail | overall 64 (floor 80 missed), change_risk 100 (feature, confirmed; `new_code_without_test_share` 0.14 passed, only `packages/db/src/index.ts` unpaired), scope changes, ref `wave6-guides...HEAD`, abstentions: solution-fit, requirement-fidelity, api, operations, infrastructure, gates: none offered, test pairs: 6 proposals confirmed, divergence: no findings sent (the verifier accepts only refs from its own pack), ratings: architecture 100, code-quality 100, test-strategy 75, data 70 (`migrations_without_rollback_share` 1 although `006_tracking.down.sql` exists — field report E3), supply-chain 55 (E1 pinned-SHA masking, no provenance step), reliability 50 (`swallowed_errors_observed` 2: the pre-existing `ROLLBACK().catch(() => {})` in `candidates.ts` and `scores.ts`), blast-radius 30 (`max_fan_in_changed`, churn hotspots: `scores.ts`, `index.ts`), security 30 (`redaction_hits_observed` — lockfile/kit hashes, field report E2). report: `/home/hungnguyenhuu/.easy-verifier-reports/T024/evidence-report-changes-20261031T153353-837173Z.html` |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: db, connector and worker only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: db, connector and worker only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: db, connector and worker only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**: captured 2026-10-31T15:20Z on branch `hun-t024-star-snapshots` at the base commit (no implementation commit yet), scratch schema in `idea-radar-test-pg` (127.0.0.1:5436); script `/tmp/claude-1000/-home-hungnguyenhuu-workspace-pets-hungnguyen111-idea-radar/38a748fd-166b-4d4f-b351-2bf435c26688/scratchpad/demo.mjs`: repo 1 (170 stars, README, 2 contributors, recent push, GH Archive stars_new only 1/day on 3 baseline days and nothing in the last 7 days; the +70 stars between two API counts cannot be recorded).

```
2026-10-31T15:20:06.843Z migrations applied: 001_init.sql, 002_pending_signals_and_cursors.sql, 003_candidates.sql, 004_jobs.sql, 005_source_first_seen.sql
repo_snapshots table: absent (no way to record the +70 stars)
2026-10-31T15:20:06.861Z scoreDay: {"scored":0,"byTier":{},"skippedNoMetadata":0}
repo 1: stars7d=0 / no tier (not scored; no repo_scores row)
```

**AFTER**: same script (`demo.mjs`), same data, captured 2026-10-31T15:29Z on branch `hun-t024-star-snapshots` after commit "SPEC data model lists tracked_repos and repo_snapshots"; the script now also inserts two `repo_snapshots` rows for repo 1 (100 stars 7 days before, 170 on the window end day, commits_30d 20 then 25).

```
2026-10-31T15:29:31.003Z migrations applied: 001_init.sql, 002_pending_signals_and_cursors.sql, 003_candidates.sql, 004_jobs.sql, 005_source_first_seen.sql, 006_tracking.sql
2026-10-31T15:29:31.100Z scoreDay: {"scored":1,"byTier":{"lowkey":1},"skippedNoMetadata":0}
repo 1: stars7d=70 tier=lowkey score=0.6276 activity=0.833333
```

**DELTA**: A repo whose stars GH Archive no longer sees is now scored from its two GitHub API star counts (+70 in 7 days gives stars7d 70 and a lowkey score, activity 25/30 from its commits), where before it had stars7d 0 and no tier.

**WITNESS**: Supervisor reran the full suite in the worktree on 2026-10-31 under the T024 trace (`memory/event-trace/T024.jsonl`); BEFORE/AFTER captures are the implementing agent's, from commits `9c88425` (before any implementation) and `0b3ecb3`.
