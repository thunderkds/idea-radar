# TASK_REVIEW — T026: Idea groups + leader picks

> Sibling of `tasks/TASK_GUIDE_T026.md`. Everything here is **filled by the reviewer at Stage
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
1. A repo with a stack tag but no specific topic gets no group key (a stack alone is not an idea) and keeps its own priority — FACT: `packages/core/src/grouping.ts:34 "if (kept.length === 0) return null;"` (guide AC 1: "returns `null` when nothing is left"; AC 3: "A repo with `group_key` null keeps its own priority")
2. Weekly jobs are keyed `W` + the Monday of the UTC week, so a failed regroup does not block that Monday's score (review finding R1.2) — FACT: `packages/db/src/jobs.ts:123 "WHERE o.name <> '${SCORE_JOB}' AND left(o.data_key, 10) = left(j.data_key, 10) AND o.status <> 'ok'))"` (score waits for every job whose key starts with its date)
3. A repo never snapshotted is not parked for inactivity; one already parked stays parked (review finding R1.1) — FACT: `packages/db/src/tracking.ts:184 "const inactive = r.score === null && !r.has_recent_snapshot && (r.was_snapshotted || r.priority === "parked");"`
4. T025 and T026 run in parallel, both stacked on `hun-t024-star-snapshots` (T024 was Ready for Review, then Done), so neither waits for a merge — RULE: `docs/claude-md/tracks.md` `### Auto mode` (the Supervisor never merges in auto mode, so dependent work stacks on the reviewed branch)
5. The two P2 and two P3 review findings are left as follow-ups — RULE: `.claude/skills/code-review/SKILL.md` § Phase 4 — Apply Safe Fixes ("Do not apply P2/P3 fixes automatically")
Checks: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` (Supervisor rerun in the worktree under T026, after R1) — core 61/61, dashboard 140/140, connectors 91/92 (1 pre-existing live-token skip), db 157/157, api 23/23, worker 39/39, scripts 21/21, exit 0; `pnpm lint`, `pnpm typecheck` exit 0; reviews code-review — round 1: P1 2 (new repos parked before their first snapshot; a failed weekly regroup blocks Monday's score), fixed in R1 with red-first tests; after R1: P0 0, P1 0, P2 2 (two-topic keys may split ideas into one-repo groups whose only active repo becomes a daily leader — measure on the first real run; parked-before-first-snapshot repos rely on `priority = 'parked'`), P3 2; security-review — no findings; easy-verifier score — overall 62, floor 80 missed, change_risk 100 (Companion score row); real run: Demonstration script on a scratch schema — printed `{"tracked":10,"groups":1,"leaders":2,"normal":8,"parked":0,"promoted":2}` (auto-checked, not /verify)
Memory: memory/learnings.md — "Stacked auto-mode branches and score blocking" (written with this review)
Not done: merge (yours); auto verify: ☑ pass (session a3ba81c8-7338-462d-a122-b9e1704523ab, commit 7a195041fce843a7cac0529c07ff17d64e1ef738, log .claude/verify-runs/T026-7a195041fce8.log)
Closed: row moved to Done 2026-10-31 — auto verify pass (session a3ba81c8-7338-462d-a122-b9e1704523ab, commit 7a195041fce843a7cac0529c07ff17d64e1ef738); Gates 5 and 6 checked

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/core/src/grouping.test.ts` (6 key tests + config), `packages/db/src/tracking.test.ts` "regroupTracked" (10 repos → 2 leaders/8 normal, archived and inactive parked, never-snapshotted not parked R1.1, request-made due time kept, independent groups, null key, AC 4, idempotent) and first-snapshot follow-up (AC 6), `packages/db/src/jobs.test.ts` (weekly key `W`+Monday; failed weekly job does not block score R1.2), `apps/worker/src/worker.test.ts` (regroup job, schedule.weekly, caps). Output: core 61/61, db 157/157, worker 39/39 |
| Verification command run | ☑ pass | `pnpm lint && pnpm typecheck && TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` exit 0 (Supervisor rerun after R1, under T026) |
| Negative cases hold | ☑ pass | repo with no specific topic → no group, keeps priority; never-snapshotted repo not parked; archived parked with `infinity`; a group with one active repo gets one leader; rank-0 repo never leader; failed weekly job does not block score |
| verify | ☑ pass | auto-run by hook, session a3ba81c8-7338-462d-a122-b9e1704523ab, commit 7a195041fce843a7cac0529c07ff17d64e1ef738, log .claude/verify-runs/T026-7a195041fce8.log — pass |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `grouping.ts`, `groupingConfig`, `regroupTracked`, `recordSnapshots` follow-up, `enqueueDue` weekly, `regroupHandler`, and their tests. `lane: C2, 12 files, 555 lines, EXCEEDS (lines 555 > 500)`: mostly tests plus the weekly schedule in `jobs.ts` |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 |
| **Companion score (easy-verifier)** | ☑ fail | overall 62 (floor 80 missed), change_risk 100 (feature, confirmed; `new_code_without_test_share` 0.17 passed, only `packages/core/src/index.ts` unpaired), scope changes, ref `hun-t024-star-snapshots...HEAD`, abstentions: solution-fit, requirement-fidelity, reliability, api, data, operations, infrastructure, gates: none offered, test pairs: 5 proposals confirmed, divergence: no findings sent (the verifier accepts only refs from its own pack), ratings: architecture 100, code-quality 80 (`max_function_ccn`: `regroupTracked`), test-strategy 75, supply-chain 55 (field report E1; no provenance step), blast-radius 30 (`max_fan_in_changed`, churn hotspots), security 30 (`redaction_hits_observed`: lockfile/kit hashes, field report E2). report: `/home/hungnguyenhuu/.easy-verifier-reports/T026/evidence-report-changes-20261031T155212-047659Z.html` |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: core, db and worker only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: core, db and worker only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: core, db and worker only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**: captured 2026-10-31T15:38Z on branch `hun-173-idea-groups` at commit `98680cb` (no implementation yet). Script `/tmp/claude-1000/-home-hungnguyenhuu-workspace-pets-hungnguyen111-idea-radar/38a748fd-166b-4d4f-b351-2bf435c26688/scratchpad/t026-demo.mts` (scratch schema in `idea-radar-test-pg`): 10 tracked repos of one idea (topics vector-database + rag in different order and case), 2 of them with a score and 40 commits in 30 days. Run: `pnpm exec tsx --conditions=source .../t026-demo.mts`

```
2026-10-31T15:38:54.646Z before regroup [{"priority":"normal","n":10,"group_key":null}]
2026-10-31T15:38:54.646Z regroupTracked is not exported from @idea-radar/db: nothing can pick leaders
```

**AFTER**: captured 2026-10-31T15:45Z at commit `99e2573`, same script and data (`pnpm exec tsx --conditions=source .../t026-demo.mts`):

```
2026-10-31T15:45:39.305Z before regroup [{"priority":"normal","n":10,"group_key":null}]
2026-10-31T15:45:39.306Z regroup result {"tracked":10,"groups":1,"leaders":2,"normal":8,"parked":0,"promoted":2}
2026-10-31T15:45:39.314Z after regroup [{"priority":"leader","n":2,"group_key":"rag+vector-database|"},{"priority":"normal","n":8,"group_key":"rag+vector-database|"}]
```

**DELTA**: The weekly `regroup` job now groups tracked repos by idea (topics given in a different order and case give one key) and makes the 2 active repos of a 10-repo group `leader` (daily snapshots, due now) and the other 8 `normal` (weekly); before, all 10 stayed `normal`.

**WITNESS**: Supervisor reran the full suite in the worktree on 2026-10-31 under the T026 trace (`memory/event-trace/T026.jsonl`); BEFORE/AFTER captures are the implementing agent's (commits `04932d2`, before any implementation, and `e74d6a1`).
