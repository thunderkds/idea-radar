# TASK_REVIEW — T002: HUN-142 Postgres data-access module + migration 002

> Sibling of `tasks/TASK_GUIDE_T002.md`. Everything here is **filled by the reviewer at Stage
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
Paused: auto-mode check failed — tasks/TASK_REVIEW_T002.md has no `## Auto decisions` section starting with `Mode: auto`; no `Memory:` line in the report — run the memory pass before you stop and record it there (each entry written, or `Memory: nothing new`); no test run in memory/event-trace/T002.jsonl — write /home/hungnguyenhuu/workspace/pets/hungnguyen111/idea-radar/.claude/hooks/.state/active_task.d/$CLAUDE_CODE_SESSION_ID with the task ID (minimal-track step 1): `mkdir -p /home/hungnguyenhuu/workspace/pets/hungnguyen111/idea-radar/.claude/hooks/.state/active_task.d && printf '%s\n%s\n' "T002" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /home/hungnguyenhuu/workspace/pets/hungnguyen111/idea-radar/.claude/hooks/.state/active_task.d/$CLAUDE_CODE_SESSION_ID`, then rerun the task's tests so the trace records them under the task, then stop; extended track, but the trace has no `code-review` Skill call (Stage 4 runs in auto mode); Risk Medium, but the trace has no `security-review` Skill call

## Auto decisions

Mode: auto
1. Migration 002 adds `repo_daily.contributors`, `repo_daily.stars_max_hour`, `pending_signals` attempts/expiry and `ingest_cursors` — RULE: `tasks/TASK_GUIDE_T002.md` § Acceptance Criteria (AC 8, 11, 12)
2. Tests run in a throwaway schema, never truncating shared tables — RULE: `tasks/TASK_GUIDE_T002.md` § Test Plan
3. Signal dedup / `run_id` on retries left out — RULE: `tasks/TASK_GUIDE_T002.md` § Approach cut list ("signal dedup / `run_id` on retries (T007, gap A12)")
4. Approved the agent's tdd plan as matching the guide — RULE: `docs/claude-md/tracks.md` `### Every user stop and its auto rule` (row 15: "The Supervisor approves a `tdd` plan that matches the guide")
Checks: tests `pnpm --filter @idea-radar/db test` — 19/19 pass with Postgres 16, suite skips cleanly without `TEST_DATABASE_URL`; reviews migration-safety — GO (additive only, rollback SQL in header, up→down→up tested by agent on seeded scratch DB; no production data exists yet, so no prod-like dry run), code-review — P0 0, P1 0, P2 3 (global `pg` type parsers are a process-wide side effect of importing `@idea-radar/db`; `insertSignals` is not atomic across `signals`/`pending_signals` unless the caller passes a transaction client; `repo_daily.date` still parses as a local-time `Date` on read — T016 should set a DATE parser or cast), security-review — no findings ≥ 8/10 (all SQL parameterised, migration path fixed, `recordSourceRun` creates unknown sources as non-displayable); real run `pnpm db:migrate` twice on a fresh DB (agent) — applied 001 and 002, then nothing (auto-checked, not /verify)
Memory: nothing new
Not done: merge (yours); auto verify: running (T182)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/db/src/repository.test.ts` (19 integration tests, AC 1–14, incl. concurrent-migrate lock test). Output with DB: `ℹ tests 19 ℹ pass 19 ℹ fail 0` |
| Verification command run | ☑ pass | DB run 19/19; skip run exits 0 with the suite skipped (see AFTER); agent: `pnpm typecheck` exit 0, `pnpm db:migrate` twice on a fresh DB — second run applied nothing |
| Negative cases hold | ☑ pass | `repoId: 0` with no `fullName` throws before any SQL; dead-port `TEST_DATABASE_URL` skips, 0 fail; agent mutation check: advisory-lock line removed → concurrent-migrate test fails (18/19) |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `packages/db/**`, `packages/core/src/types.ts` and its users (`github-api.ts` `toRepo` compiles with nullable `createdAt`). `lane: C2, 8 files, 807 lines, EXCEEDS (lines 807 > 500)` — 380 are tests; label kept at C2 |
| Full smoke suite still green (no regression) | ☑ pass | agent: `TEST_DATABASE_URL= pnpm test` whole repo exit 0 (core 6 pass) |
| **Companion score (easy-verifier)** | ☑ N/A | not run in this session; offered for the merge decision |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: database layer only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: database layer only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: database layer only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**: captured before any implementation commit (`date -u; pnpm --filter @idea-radar/db test; ls packages/db/src`):

```
Sat Oct 31 05:37:20 AM UTC 2026

> @idea-radar/db@0.1.0 test /home/hungnguyenhuu/workspace/pets/hungnguyen111/idea-radar/.claude/worktrees/T002/packages/db
> tsx --conditions=source --test "src/**/*.test.ts"

ℹ tests 0
ℹ suites 0
ℹ pass 0
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5.509529
index.ts
migrate.ts
```

No data-access module and no DB tests exist (0 tests, only `index.ts` and `migrate.ts`).

**AFTER**: Supervisor rerun, 2026-10-31 05:41 UTC, fresh Postgres 16 on host port 5433 (compose project `idea-radar-t002r`, torn down after):

```
$ TEST_DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm --filter @idea-radar/db test
ℹ tests 19
ℹ pass 19
ℹ fail 0
ℹ skipped 0

$ TEST_DATABASE_URL= pnpm --filter @idea-radar/db test
﹣ db data access (needs TEST_DATABASE_URL) # TEST_DATABASE_URL is not set
ℹ tests 0
ℹ fail 0
```

**DELTA**: Every ingest path now has a typed, tested function to write to Postgres, and signals for repos not yet known are queued in `pending_signals` instead of being lost.

**WITNESS**: Supervisor session, 2026-10-31 05:41 UTC, T002 worktree (trace `memory/event-trace/T002.jsonl`).
