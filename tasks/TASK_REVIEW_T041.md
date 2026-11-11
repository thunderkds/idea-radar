# TASK_REVIEW — T041: submit_ideas tool text says submission, not idea file

> Sibling of `tasks/TASK_GUIDE_T[NNN].md`. Everything here is **filled by the reviewer at Stage
> 4/5** — it is deliberately NOT in the guide, because the implementing agent re-reads the guide on
> every turn and never fills these two sections.
>
> Consumers resolve each section **guide first, this file second** (`.claude/hooks/lib/guide_sections.py`):
> a legacy guide that still carries these sections inline keeps working unchanged, and a stray
> review file can never override an inline section.

---

<!-- Optional: the final report, only for a task run in auto mode (the user's `[auto]` or `[admin]` tag; with `[admin]`, the `Not done:` line names `merge (admin: after the auto verify pass)`,
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

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `apps/mcp/src/tools.test.ts`: `submit_ideas description calls the input a submission, not a file` (asserts `routine only`, `submission`, and no `idea file` / `whole file` / `idea schema`) |
| Verification command run | ☑ pass | `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` exit 0 with `TEST_DATABASE_URL=postgres://postgres:pg@localhost:55436/postgres`. ideas 13/13, db 23/23, apps/mcp 108/108, scripts 15/15; 0 skipped in every suite; `All matched files use Prettier code style!` |
| Negative cases hold | ☑ pass | RED before the reword (2026-11-11): `AssertionError: The input did not match the regular expression /submission/i`, `pass 9 fail 1`. Mutation: put `one idea file (schema_version` back in `tools.ts:16`, `git diff --stat` non-empty (4 files, `tools.ts` 1 line), test red `pass 9 fail 1`, `AssertionError: stale file wording: ...The input is one idea file...`. Restored, green `pass 10 fail 0` |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☐ pass / ☐ fail | [what was reviewed vs. skipped, and why] |
| Full smoke suite still green (no regression) | ☐ pass / ☐ fail | |
| **Companion score (easy-verifier)** | ☐ pass / ☐ fail / ☐ N/A | [`overall` and `change_risk` as the tool returned them, the scope, the ref, and the absolute path of the verifier report after a literal `report:` label — e.g. "overall 86 (>= 80), change_risk pass, scope changes, ref `main...HEAD`, report: `/home/me/.easy-verifier-reports/kit/score_changes_20261028T0530Z.html`". The gate reads the path that follows `report:` and nothing else, so with no label, or a path that is absent, the row is unscored — write ☑ N/A instead. ☑ N/A with a reason when neither companion tool was run: the merge gate blocks on ☑ fail only, never on an absent or N/A row] |
| **UI: Visual regression (diff or verdict pasted)** | ☐ pass / ☐ fail / ☐ N/A | [screenshot path or LLM verdict — required for UI tasks, Hard-Stop Gate 6] |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☐ pass / ☐ fail / ☐ N/A | [method used + output] |
| **UI: Responsiveness at target viewports** | ☐ pass / ☐ fail / ☐ N/A | [viewports tested, any overflow findings] |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE** (captured 2026-11-11T14:42:34Z, before any implementation commit; `sed -n 16p apps/mcp/src/tools.ts` and `sed -n 39p apps/mcp/src/index-store.ts`):

```
apps/mcp/src/tools.ts:16
    "For the daily research routine only: readers must not call this. Save one day's ideas. The input is one idea file (schema_version 1, date YYYY-MM-DD, routine, ideas[]). It is checked against the idea schema; if any field is wrong nothing is saved and each field error is listed, so fix them and send the whole file again. An idea with an id that already exists is updated when the date is the same or newer. Returns { saved, date }.",

apps/mcp/src/index-store.ts:39
  /** Validate one idea file against the schema and save it; a rejected call is written to the run log. */
```

**AFTER** (same two lines, post-change):

```
apps/mcp/src/tools.ts:16
    "For the daily research routine only: readers must not call this. Save one day's ideas. The input is one submission (schema_version 1, date YYYY-MM-DD, routine, ideas[]). It is checked against the submission schema; if any field is wrong nothing is saved and each field error is listed, so fix them and send the whole submission again. An idea with an id that already exists is updated when the date is the same or newer. Returns { saved, date }.",

apps/mcp/src/index-store.ts:39
  /** Validate one submission against the schema and save it; a rejected call is written to the run log. */
```

**DELTA**: The routine's model is told to send one submission (and to send the whole submission again), the same word the routine prompt uses, instead of a file it never writes.

**WITNESS**: [who ran it and when — derived from `memory/event-trace/Txxx.jsonl`, never the
implementing agent alone]
