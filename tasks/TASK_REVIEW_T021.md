# TASK_REVIEW — T021: Candidate selection

> Sibling of `tasks/TASK_GUIDE_T021.md`. Everything here is **filled by the reviewer at Stage
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
1. Default thresholds (3+ stars in 7 days, above own prior-83-day rate, cap 5,000) set in the guide as a starting point — RULE: `docs/claude-md/tracks.md` `### Every user stop and its auto rule` (row 12: "The Supervisor's own breakdown, labelled by the Complexity matrices")
2. Thresholds and cap live in `packages/core/src/scoring.ts` as `candidateConfig` — RULE: `AGENTS.md` § Rules ("Scoring thresholds and weights live in `packages/core/src/scoring.ts`")
3. Approved the agent's tdd plan as matching the guide — RULE: `docs/claude-md/tracks.md` `### Every user stop and its auto rule` (row 15: "The Supervisor approves a `tdd` plan that matches the guide")
Checks: tests `TEST_DATABASE_URL=… pnpm test` — db 32/32, connectors 45/45 (+1 skip), core 6/6; reviews migration-safety — GO (additive table, rollback SQL in header, up→down→up on a scratch DB with 200,000 `repo_daily` rows, no data lost), code-review — P0 0, P1 0, P2 3 (signal-only repos with no GH Archive stars get priority 0 and are cut first when the cap binds; a repo picked for both reasons is stored as `signal`, so `byReason` undercounts velocity; `selectCandidates` detects a pool by `"release" in db` and must not be called inside a caller's transaction), P3 1 (no retention for old candidate dates, about 5,000 rows a day), security-review — no findings ≥ 8/10 (date and all config values passed as cast parameters, static SQL text, no scraped text written); real run: none (job wiring is T007) (auto-checked, not /verify)
Memory: nothing new
Not done: merge (yours); auto verify: running (T182)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/db/src/candidates.test.ts` (14 tests: velocity ×3, signal ×3, cap and order ×2, storage ×4, listCandidates ×1, rollback on failure). Output: db `ℹ tests 32 ℹ pass 32 ℹ fail 0` |
| Verification command run | ☑ pass | `TEST_DATABASE_URL=… pnpm test` (see AFTER); agent: `pnpm typecheck` clean, skip run 0 fail |
| Negative cases hold | ☑ pass | equal rate does not pass velocity; window edge instants tested; failed insert rolls back and keeps the old list; suite skips without `TEST_DATABASE_URL` |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | migration 003, `candidates.ts` + test, `index.ts`, `scoring.ts`, `repository.test.ts` (2 migration-count assertions). `lane: C2, 6 files, 398 lines, FITS; unpredicted: packages/db/src/candidates.test.ts, packages/db/src/repository.test.ts` |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 |
| **Companion score (easy-verifier)** | ☑ N/A | not run in this session; offered for the merge decision |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: database selection only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: database selection only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: database selection only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**: captured before any change (worktree T021):
```
$ date -u; ls packages/db/migrations packages/db/src; grep -n "candidate" -ri packages/db packages/core/src || echo "no candidate selection"
Sat Oct 31 06:21:52 AM UTC 2026
packages/db/migrations:
001_init.sql
002_pending_signals_and_cursors.sql

packages/db/src:
index.ts
migrate.ts
migrations.ts
repository.test.ts
repository.ts
no candidate selection
```

**AFTER**: Supervisor rerun, 2026-10-31, fresh Postgres 16 on port 5436:

```
$ TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test
packages/core test: ℹ tests 6 ℹ pass 6 ℹ fail 0
packages/connectors test: ℹ tests 46 ℹ pass 45 ℹ fail 0
packages/db test: ℹ tests 32 ℹ pass 32 ℹ fail 0
```

**DELTA**: Each day the pipeline can now pick, store and rank the repos worth fetching metadata and README for, including lowkey repos seen only in GH Archive.

**WITNESS**: Supervisor session, 2026-10-31, T021 worktree (trace `memory/event-trace/T021.jsonl`).
