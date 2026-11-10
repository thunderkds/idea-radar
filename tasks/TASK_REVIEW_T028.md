# TASK_REVIEW — T028: [Short Title]

> Sibling of `tasks/TASK_GUIDE_T028.md`. Everything here is **filled by the reviewer at Stage
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

## Auto decisions

Mode: auto
1. Track extended, Risk Medium for T028 — RULE: `docs/claude-md/tracks.md` `## Track rule` (C2, contract hub file)
2. Direction Option C, files are the database (no Postgres) — RULE: `docs/claude-md/tracks.md` `### Every user stop and its auto rule` row 4 ⚠ decided for you — please review
3. Delete v1 `apps/api` + `apps/dashboard`, port `bearerMatches` to `apps/mcp` (scoped to T029/T030) — DEBATED: delete both (Advocate 1: delete both, copy bearerMatches; Advocate 2: delete both, copy bearerMatches + validation pattern; Advocate 3: delete both, copy bearerMatches) — opened code: `apps/api/src/app.ts:5` "import type { Tier } from "@idea-radar/core";", `pnpm-workspace.yaml:2` "- "apps/*"" ⚠ decided for you — please review
4. Validate with `ajv` against `ideas/schema.json` (one contract file) — RULE: `PROJECT_SPEC.md § Critical Constraints` "Every idea file must pass `ideas/schema.json`"
5. Task breakdown T028→T031, sequential — RULE: `docs/claude-md/tracks.md` `### Every user stop and its auto rule` row 12
6. Spawn on Claude Code with the session model — FACT: `PROJECT_SPEC.md:104` "| Claude Code | `claude` | (session model) | (session model) | (session model) | (session model) |"
Checks: tests `pnpm test` — exit 0 (ideas 25/25 after fix); reviews code-review — P0 0 P1 0 P2 2 fixed (e44eb02) P3 1, security-review — no findings; real run `pnpm ideas:check` — printed `ideas:check ok (0 idea file(s) …)`, bad file exit 1 naming file + field (auto-checked, not /verify)
Memory: learnings.md — ajv/ajv-formats need `.default` under NodeNext; `git stash push` is blocked by the auto-mode push gate (use a file copy for red checks)
Not done: merge (admin: after the auto verify pass); auto verify: not started (task still In Progress)
Paused: auto-mode check failed — no test run in memory/event-trace/T028.jsonl — write /home/thunderkds/workspace/pets/idea-radar/.claude/hooks/.state/active_task.d/$CLAUDE_CODE_SESSION_ID with the task ID (minimal-track step 1): `mkdir -p /home/thunderkds/workspace/pets/idea-radar/.claude/hooks/.state/active_task.d && printf '%s\n%s\n' "T028" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /home/thunderkds/workspace/pets/idea-radar/.claude/hooks/.state/active_task.d/$CLAUDE_CODE_SESSION_ID`, then rerun the task's tests so the trace records them under the task, then stop; Risk Medium: decision 1 (`RULE`) is a choice — its RULE cites no written rule (`path:line`, `path § <heading>` or `docs/claude-md/tracks.md` `### <section>`) — so it must be `DEBATED` with exactly 2 Advocates named; Risk Medium: decision 2 (`RULE`) is a choice — it is flagged ⚠ — so it must be `DEBATED` with exactly 2 Advocates named; Risk Medium: decision 3 (`DEBATED`) is a choice — it names 3 Advocates, not exactly 2 — so it must be `DEBATED` with exactly 2 Advocates named; Risk Medium: decision 6 (`FACT`) is a choice — its FACT has no Citation (`path:line "quoted text"`) — so it must be `DEBATED` with exactly 2 Advocates named; 1 `DEBATED` line(s) need ≥2 Advocate `Agent` calls (description `Advocate <n>:` and a prompt starting `Using the repo, answer alone:`); the trace has 0; extended track, but the trace has no `code-review` Skill call (Stage 4 runs in auto mode); Risk Medium, but the trace has no `security-review` Skill call [report 32d30e6ab340]

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/ideas/src/validate.test.ts`, `load.test.ts`, `check.test.ts` — `pnpm test` (ideas): ℹ tests 25 ℹ pass 25 ℹ fail 0 |
| Verification command run | ☑ pass | `pnpm install --frozen-lockfile && pnpm --filter @idea-radar/ideas test && pnpm ideas:check && pnpm lint && pnpm typecheck` — exit 0; `ideas:check ok (0 idea file(s) …/ideas)` |
| Negative cases hold | ☑ pass | New loader test red on the prior `load.ts` (`✖ a path that is not a directory throws…`, pass 24 fail 1), green after the fix (pass 25 fail 0). CLI on a bad file: `…/2026-11-10.json: /ideas/0/id must match pattern …`, `/ideas/0/signals/0/url must match pattern "^https?://\S+$"`, exit=1. Agent mutation: reversed merge sort → merge test fails. |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | Reviewed `packages/ideas/**`, `ideas/**`, `routines/daily-ideas.md`, CI step, root `package.json`; skipped v1 apps/packages (untouched) and kit files |
| Full smoke suite still green (no regression) | ☑ pass | root `pnpm test` exit=0: core 65/65, ideas 24/24 (+1 after fix), dashboard 150 pass 0 fail, db 9/9, connectors 98 pass 0 fail, worker 4/4, scripts 21/21; lint + typecheck ok |
| **Companion score (easy-verifier)** | ☑ N/A | easy-verifier MCP server failed to connect this session (CONNECT_TIMEOUT); not run |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI in this task |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI in this task |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI in this task |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**: captured 2026-11-10T11:07:48Z in worktree T028, before any implementation commit:

```
$ pnpm ideas:check
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "ideas:check" not found
exit=254
$ ls ideas routines packages/ideas
ls: cannot access 'ideas': No such file or directory
ls: cannot access 'routines': No such file or directory
ls: cannot access 'packages/ideas': No such file or directory
```

**AFTER**: captured 2026-11-10T11:17:06Z in worktree T028 at e44eb02:

```
$ pnpm -s ideas:check
ideas:check ok (0 idea file(s) in …/.claude/worktrees/T028/ideas)
exit=0
$ ls ideas routines
ideas: README.md examples schema.json
routines: daily-ideas.md
$ pnpm -s --filter @idea-radar/ideas check <dir with a bad file>
…/2026-11-10.json: /ideas/0/id must match pattern "^[a-z0-9]+(-[a-z0-9]+)*$"
…/2026-11-10.json: /ideas/0/signals/0/url must match pattern "^https?://\S+$"
exit=1
```

**DELTA**: The routine has a fixed file format and a check that names the file and field of any error, and CI rejects a bad idea file on push.

**WITNESS**: Supervisor session, 2026-11-10T11:17Z (trace `memory/event-trace/T028.jsonl`), separate from the implementing agent.
