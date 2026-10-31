# TASK_REVIEW — T006: HUN-143 Registry sync

> Sibling of `tasks/TASK_GUIDE_T006.md`. Everything here is **filled by the reviewer at Stage
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
1. Code registry wins over the DB for `enabled` / `displayable` — RULE: `tasks/TASK_GUIDE_T006.md` § Requirement (gaps A10, A19)
2. Accepted the agent's choice to leave a stale source's `displayable` unchanged (only `enabled = false`), as the AC asks — SAFER OPTION: smallest change that meets AC 3; flagged as a P2 below ⚠ decided for you — please review
Checks: tests `TEST_DATABASE_URL=… pnpm test` — db 23/23, connectors 49/49 (+1 skip); reviews code-review — P0 0, P1 0, P2 2 (a stale source keeps `displayable = TRUE` and would fail open if re-enabled by hand; upsert and disable are two statements with no transaction); real run: none (wired into the worker by T007) (auto-checked, not /verify)
Memory: nothing new
Not done: merge (yours); auto verify: running (T182)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/db/src/sources.test.ts` (4 DB tests, AC 1–3, 5) and `packages/connectors/src/index.test.ts` (4 env-flag tests, AC 4). Output: db `ℹ tests 23 ℹ pass 23 ℹ fail 0`; connectors `ℹ pass 49 ℹ fail 0` |
| Verification command run | ☑ pass | `TEST_DATABASE_URL=… pnpm test` (see AFTER); agent: `pnpm typecheck` all Done |
| Negative cases hold | ☑ pass | Trendshift without key stays disabled; stale source disabled, not deleted; suite skips without `TEST_DATABASE_URL` |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `packages/db/src/sources.ts`, its test, `index.ts` export, connectors env test. `lane: C1, 4 files, 189 lines, FITS` |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 (core 6, db 23, connectors 49 + 1 skip) |
| **Companion score (easy-verifier)** | ☑ N/A | not run: Risk Low |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: database sync only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: database sync only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: database sync only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**: captured before any implementation commit (`date -u; ls packages/db/src; grep -n "syncSources" -r packages || echo "no syncSources"`):

```
Sat Oct 31 06:21:51 AM UTC 2026
index.ts
migrate.ts
migrations.ts
repository.test.ts
repository.ts
no syncSources
```

**AFTER**: Supervisor rerun, 2026-10-31, fresh Postgres 16 on port 5434:

```
$ TEST_DATABASE_URL=postgres://radar:radar@localhost:5434/radar pnpm test
packages/db test: ✔ syncSources (needs TEST_DATABASE_URL)
packages/db test: ℹ tests 23 ℹ pass 23 ℹ fail 0
packages/connectors test: ℹ tests 50 ℹ pass 49 ℹ fail 0 ℹ skipped 1
```

**DELTA**: The `sources` table can now be made to match the code registry, so `enabled` and `displayable` come from code, not from the fail-open column default.

**WITNESS**: Supervisor session, 2026-10-31, T006 worktree (trace `memory/event-trace/T006.jsonl`).
