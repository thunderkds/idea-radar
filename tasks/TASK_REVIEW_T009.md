# TASK_REVIEW — T009: Tier classification job

> Sibling of `tasks/TASK_GUIDE_T009.md`. Everything here is **filled by the reviewer at Stage
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
1. U1 medium rule: week k is positive when the 30 days ending at checkpoint k gained ≥ `tierConfig.medium.min30dStars` (default 1, the spec's literal reading); `positiveWeeks` counts consecutive checkpoints from the newest — SAFER OPTION: literal spec value with the threshold exposed in `scoring.ts` for the owner to tune ⚠ decided for you — please review
2. U8 contributors = the largest daily `repo_daily.contributors` in 30 days (a lower bound; daily distinct counts cannot be summed) — SAFER OPTION: a lower bound never lets a one-person repo pass the 2-contributor lowkey rule ⚠ decided for you — please review
3. Lowkey baseline rule added as `velocityAboveBaseline` with T021's definition (no prior history counts as above, flagged `insufficient_history`) — RULE: `docs/SPEC.md` § Tier scoring (Lowkey: "7-day velocity above its own 90-day baseline")
4. Interim lowkey score = 7-day stars ÷ (prior daily rate × 7 + 1), `components.interim = 1`, until T010 — RULE: `tasks/TASK_GUIDE_T009.md` § Acceptance Criteria (AC 6)
5. Review fix: windows end at the GH Archive cursor when it is earlier than `date` − 1, so a score run before yesterday is ingested does not read that day as zero stars — RULE: `docs/claude-md/tracks.md` `### Every user stop and its auto rule` (Stage 4 safe P0/P1 fixes are applied by `code-review` Phase 4)
Checks: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` — core 18/18, connectors 49/50 (1 pre-existing skip), db 67/67, worker 18/18, exit 0; reviews code-review — P0 0, P1 1 (score windows ignored GH Archive lag — fixed in `7da6b38` with a test), P2 2 (`scoreDay` rewrites the whole date, so T011/T015 must run after it or inside it; contributors is a lower bound), P3 0; real run: none beyond temp-schema integration tests (the worker against real data needs a token and ingested days) (auto-checked, not /verify)
Memory: memory/decisions.md — Tier rule readings for U1 and U8 (T009)
Not done: merge (yours); auto verify: running (T182)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/core/src/scoring.test.ts` (12 new boundary tests), `packages/db/src/scores.test.ts` (13 integration tests incl. the windowEnd fix), `apps/worker/src/worker.test.ts` (score job writes a row). core `ℹ tests 18 ℹ fail 0`, db `ℹ tests 67 ℹ fail 0` |
| Verification command run | ☑ pass | `TEST_DATABASE_URL=… pnpm test` exit 0 and `pnpm typecheck` clean (Supervisor rerun under T009 after the fix) |
| Negative cases hold | ☑ pass | every tier edge on both sides (499/500, 3/4 weeks, 199/200, 30/31 days, 1/2 contributors, no/blank README, equal baseline); archived and null push date get no tier; failed write rolls back |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `scoring.ts` + test, `scores.ts` + test, `db/src/index.ts`, worker `score` handler + test; callers of `classifyTier` (only `scores.ts`). `lane: C2, 7 files, 587 lines, EXCEEDS (lines 587 > 500); unpredicted: apps/worker/src/worker.test.ts, packages/core/src/scoring.test.ts, packages/db/src/index.ts, packages/db/src/scores.test.ts` — mostly tests |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 |
| **Companion score (easy-verifier)** | ☑ N/A | not run in this session |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: scoring job only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: scoring job only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: scoring job only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE** (captured 2026-10-31T07:42:38Z in the T009 worktree, before any implementation commit; `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test`):

```
packages/core test: ℹ tests 6 / pass 6 / fail 0
packages/connectors test: ℹ tests 50 / pass 49 / fail 0
packages/db test: ℹ tests 54 / pass 54 / fail 0
apps/worker test: ℹ tests 18 / pass 18 / fail 0
```

Command showing the missing behaviour:

```
$ grep -n "SCORE_JOB\] =" apps/worker/src/handlers.ts
122:  handlers[SCORE_JOB] = { sourceId: null, run: async () => {} };
$ grep -rn scoreDay packages apps --include='*.ts' (excluding node_modules)
(no match: scoreDay does not exist)
```

`classifyTier` takes no `velocityAboveBaseline`; `tierConfig.medium` has no `min30dStars`. The `score` job is the placeholder `run: async () => {}`, so `repo_scores` is never written.

**AFTER** (Supervisor, 2026-10-31T07:51:06Z, same command after `7da6b38`): `packages/core test: ℹ tests 18 packages/core test: ℹ pass 18 packages/core test: ℹ fail 0 packages/connectors test: ℹ tests 50 packages/connectors test: ℹ pass 49 packages/connectors test: ℹ fail 0 packages/db test: ℹ tests 67 packages/db test: ℹ pass 67 packages/db test: ℹ fail 0 apps/api test: ℹ tests 0 apps/api test: ℹ pass 0 apps/api test: ℹ fail 0 apps/worker test: ℹ tests 18 apps/worker test: ℹ pass 18 apps/worker test: ℹ fail 0`; `pnpm typecheck` clean.

**DELTA**: The daily `score` job now writes one explained `repo_scores` row per repo that matches trending, medium or lowkey, instead of doing nothing.

**WITNESS**: Supervisor session, 2026-10-31T07:51:06Z: reran `TEST_DATABASE_URL=… pnpm test` under T009 (exit 0, recorded in `memory/event-trace/T009.jsonl`).
