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
| verify | ☑ pass | Run by the Supervisor on commit `36056fb`, not a user-typed `/verify` (the user said "do T041 now"): a real production build on a fresh PGlite (port 55437) and a server on port 18091. `tools/list` with the write token returned the four tools and the `submit_ideas` text says "one submission", "the submission schema" and "send the whole submission again" (no `idea file`, `whole file` or `idea schema`; `routine only` kept); the read token listed three tools. A valid 13-idea submission saved 13, and sent again saved 13 with `list_ideas` count 13. Probes rejected: a 2,001-character summary, kind `github` (12 lines, `... and 3 more errors`), a `javascript:` url; the read token got `Tool submit_ideas not found`; the dashboard list returned 200. Both processes stopped by PID — pass |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `git diff main...t041-tool-text`: `tools.ts`, `index-store.ts`, `tools.test.ts` plus this file. Callers and tests read: `server.test.ts:111` and `tools.test.ts:127` (both match `routine only`, kept). Stale sweep over `apps packages scripts routines docs README.md PRD.md PROJECT_SPEC.md` listed in the code-review report; `lane_check`: C1, 3 files, 11 lines, FITS |
| Full smoke suite still green (no regression) | ☑ pass | The agent's full run (ideas 13, db 23, mcp 108, scripts 15, 0 skipped). The Supervisor did not re-run the full suite; the real-server drive above is the Supervisor's own run |
| **Companion score (easy-verifier)** | ☒ N/A | The easy-verifier server failed to connect in this session (CONNECT_TIMEOUT), so there is no score |
| **UI: Visual regression (diff or verdict pasted)** | ☒ N/A | No UI change (a tool description string, a comment and a test) |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☒ N/A | No UI change (a tool description string, a comment and a test) |
| **UI: Responsiveness at target viewports** | ☒ N/A | No UI change (a tool description string, a comment and a test) |

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

**WITNESS**: the Supervisor, 2026-11-11, ran the real production build and drove `tools/list` plus the submit probes on port 18091 (see the `verify` row). The `memory/event-trace/T041.jsonl` file was not consulted.

## Stage 4 reviews (2026-11-11, by the Supervisor; the agent did not run the review skills)

- **Code review**: no P0, P1 or P2. Three P3 notes: the new test checks the word `submission` loosely and bans three exact phrases; `.env.example:6` still says "idea files" (the owner deletes line 7 and can drop the comment; a permission rule stops the Supervisor); the `PROJECT_SPEC.md` glossary keeps `idea file` as a defined term. Report: `reports/code-review_t041-tool-text_20261111T144543.html`.
- **Security review**: nothing at confidence 8 or higher. Report: `reports/security-review_t041-tool-text_20261111T144543.html`.
- **lane_check**: C1, 3 files, 11 lines, FITS.
