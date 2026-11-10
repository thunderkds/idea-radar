# TASK_REVIEW — T031: Railway deploy config and routine/MCP setup docs

> Sibling of `tasks/TASK_GUIDE_T031.md`. Everything here is **filled by the reviewer at Stage
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
1. Track extended, Risk Medium for T031 (deploy config and the setup path for the only secret) — RULE: docs/claude-md/tracks.md § Track rule
2. Start with `node apps/mcp/dist/index.js` instead of `pnpm --filter … start` (pnpm at runtime unverified) — RULE: skills/code-review/SKILL.md § Phase 4 — Apply Safe Fixes
3. Spawn on Claude Code with the session model — FACT: PROJECT_SPEC.md:104 "| Claude Code | `claude` | (session model) | (session model) | (session model) | (session model) |"
4. Live Railway deploy and routine creation left to the user (needs their logins) — RULE: docs/claude-md/tracks.md `### Stops that stay`
Checks: tests `pnpm test` — exit 0 (ideas 25/25, mcp 36/36, scripts 5/5); reviews code-review — P0 0 P1 0 P2 2 (start command fixed f75bde3; stale toggle wording fixed on main) P3 0, security-review — no findings; real run railway.json build + `node apps/mcp/dist/index.js` in a clean clone — printed `{"ok":true,"ideas":0,"files":0,"skipped":0}` and `no-token: 401` (auto-checked, not /verify)
Memory: learnings.md — Railway watchPatterns use leading-slash gitignore syntax; Anthropic docs now call routines "scheduled tasks" and no longer list the unrestricted-push toggle
Not done: merge (admin: after the auto verify pass); auto verify: ☑ pass (session e4834ff2-1ba3-4a6e-b91c-fcab428dc6e3, commit c1812a9ec1f2fe14e5d62341b660495cdea1ea46, log .claude/verify-runs/T031-c1812a9ec1f2.log); live Railway deploy + routine creation (yours — needs your Railway and claude.ai logins)
Closed: row moved to Done 2026-11-10 — auto verify pass (session e4834ff2-1ba3-4a6e-b91c-fcab428dc6e3, commit c1812a9ec1f2fe14e5d62341b660495cdea1ea46); Gates 5 and 6 checked

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | Config/docs task: acceptance is the run check, not a unit test — `railway.json` read by `node -e` (healthcheckPath present) and its exact build/start commands run in a clean clone; existing suites ideas 25/25, mcp 36/36, scripts 5/5 |
| Verification command run | ☑ pass | clean clone of f75bde3: `railway.json ok`; build command (from railway.json) exit 0; start command `node apps/mcp/dist/index.js` → `loaded 0 ideas from 0 files, 0 skipped` + `listening on port 8792`; `/health` → `{"ok":true,"ideas":0,"files":0,"skipped":0}` |
| Negative cases hold | ☑ pass | no token → `no-token: 401`; agent's check: the `node -e` gate exits 1 when `healthcheckPath` is absent; secret grep (40+ hex / long Bearer) over railway.json, docs/deploy.md, README.md: no matches |
| verify | ☑ pass | auto-run by hook, session e4834ff2-1ba3-4a6e-b91c-fcab428dc6e3, commit c1812a9ec1f2fe14e5d62341b660495cdea1ea46, log .claude/verify-runs/T031-c1812a9ec1f2.log — pass |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | Reviewed railway.json, docs/deploy.md, README Deploy section against apps/mcp start/env behaviour; apps/mcp and packages/ideas code unchanged |
| Full smoke suite still green (no regression) | ☑ pass | `pnpm test` in the worktree: ideas 25/25, mcp 36/36, scripts 5/5, fail 0 |
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

**BEFORE** (2026-11-10T12:52:59Z, before any T031 implementation commit; docs/config change, so verbatim prior state):

```
$ ls railway.json docs/deploy.md
ls: cannot access 'railway.json': No such file or directory
ls: cannot access 'docs/deploy.md': No such file or directory
```

README.md "## Deploy" section, verbatim:

```
## Deploy

See docs/deploy.md (T031).
```

**AFTER** (2026-11-10T12:58:28Z, clean clone at f75bde3, commands read from `railway.json`):

```
$ ls railway.json docs/deploy.md
railway.json  docs/deploy.md
railway.json ok
build=0
loaded 0 ideas from 0 files, 0 skipped (…/t031clone/ideas)
listening on port 8792
{"ok":true,"ideas":0,"files":0,"skipped":0}
no-token: 401
```

**DELTA**: The owner can deploy `apps/mcp` to Railway from the repo with no hand-set build/start command, and follow one doc to create the routine and connect Claude Code/Desktop.

**WITNESS**: Supervisor session, 2026-11-10T12:58Z (trace `memory/event-trace/T031.jsonl`), separate from the implementing agent; output above.
