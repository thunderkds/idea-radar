# TASK_REVIEW — T030: Retire the v1 scraping stack

> Sibling of `tasks/TASK_GUIDE_T030.md`. Everything here is **filled by the reviewer at Stage
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
1. Track extended, Risk Medium for T030 (deletes a storage format and most of the code) — RULE: docs/claude-md/tracks.md § Track rule
2. Delete `apps/api` and `apps/dashboard` with the rest of v1 — FACT: PRD.md:54 "| FR-008 | The worker, connectors, scoring, tiering, the v1 API and the v1 dashboard must be removed from `main`; the v1 code stays reachable through the `v1-scraper` tag. | US-004 |"
3. Spawn on Claude Code with the session model — FACT: PROJECT_SPEC.md:104 "| Claude Code | `claude` | (session model) | (session model) | (session model) | (session model) |"
4. Reworded the two AC 5 residuals (history wording, not code) instead of narrowing AC 5 — RULE: templates/TASK_GUIDE_template.md § Approach
5. Applied the P2 review fix (stale v1 `.gitignore` entries) — RULE: skills/code-review/SKILL.md § Phase 4 — Apply Safe Fixes
Checks: tests `pnpm test` — exit 0 from a clean build (ideas 25/25, mcp 36/36, scripts 5/5); reviews code-review — P0 0 P1 0 P2 1 fixed (e0677a7) P3 1, security-review — no findings; real run `ls apps packages` + `git ls-tree --name-only v1-scraper apps/` — printed `mcp` / `ideas` and the 3 v1 apps (auto-checked, not /verify)
Memory: learnings.md — zsh errors "no matches found" on an unquoted `--include=*.md` in grep; quote the glob
Not done: merge (admin: after the auto verify pass); auto verify: running (T182)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | Deletion task: no new tests; the acceptance checks are commands — remaining suites `packages/ideas` 25/25, `apps/mcp` 36/36, `scripts/repo-hygiene.test.ts` 5/5; AC 5 grep (`scratchpad/ac5.sh`) and `git ls-tree --name-only v1-scraper apps/` |
| Verification command run | ☑ pass | clean rebuild (dist removed): `pnpm install --frozen-lockfile` 0, `pnpm lint` 0, `pnpm typecheck` 0, `pnpm test` 0, `pnpm ideas:check` ok, `pnpm format:check` 0; `ls apps packages` → `mcp` / `ideas` |
| Negative cases hold | ☑ pass | AC 5 grep: 149 lines BEFORE → 0 after (2 history-wording residuals reworded: BRAINSTORMING_LOG.md:51 in e0677a7, PROJECT_KANBAN.md:29 on main); tag still lists `apps/api`, `apps/dashboard`, `apps/worker` (AC 2) |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | Reviewed the non-deletion edits (package.json, eslint.config.js, .env.example, .gitignore, ci.yml, README, docs notes) and that the remaining v2 code imports nothing deleted (typecheck from clean) |
| Full smoke suite still green (no regression) | ☑ pass | `pnpm test` exit 0 from a clean build: ideas 25/25, mcp 36/36, scripts 5/5 |
| **Companion score (easy-verifier)** | ☑ N/A | easy-verifier MCP server failed to connect this session (CONNECT_TIMEOUT); not run |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI in this task (the dashboard is deleted) |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI in this task |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI in this task |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE** (captured 2026-11-10T11:43:46Z on branch `t030-retire-v1`, before any deletion):

```
$ ls apps packages
apps:
api
dashboard
mcp
worker

packages:
connectors
core
db
ideas

$ <AC5 grep, excluding docs/SPEC.md, docs/ISSUES.md, docs/analysis/, tasks/, memory/, reports/, .claude/, node_modules, pnpm-lock.yaml> | wc -l
149

$ git ls-tree --name-only v1-scraper apps/
apps/api
apps/dashboard
apps/worker
```

**AFTER** (2026-11-10T11:45:53Z, same branch, after the deletion commit):

```
$ ls apps packages
apps:
mcp

packages:
ideas

$ git ls-tree --name-only v1-scraper apps/
apps/api
apps/dashboard
apps/worker

$ pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm ideas:check
(all exit 0) packages/ideas 25/25, apps/mcp 36/36, scripts/repo-hygiene 5/5
ideas:check ok (0 idea file(s) in .../ideas)
```

AC 5 grep: 0 hits in code/config; 2 residual `.md` hits outside the exclusion list, both history records the
Supervisor owns (`PROJECT_KANBAN.md:29` T025 row, `BRAINSTORMING_LOG.md:51` Option B text).

**DELTA**: `main` holds only the v2 stack (`apps/mcp`, `packages/ideas`); the v1 scraper, its Postgres setup and
docs pointers are gone, and v1 stays reachable through tag `v1-scraper`.

**WITNESS**: Supervisor session, 2026-11-10T11:5xZ, clean rebuild in worktree T030 (trace `memory/event-trace/T030.jsonl`), separate from the implementing agent: install/lint/typecheck/test/format all exit 0; `ls apps packages` → `mcp`, `ideas`; tag lists the 3 v1 apps.
