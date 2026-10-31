# TASK_REVIEW — T001: Test runner + workspace install

> Sibling of `tasks/TASK_GUIDE_T001.md`. Everything here is **filled by the reviewer at Stage
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
1. Pulled origin `b21072b`; `docs/SPEC.md` + `docs/ISSUES.md` replace the Linear spec doc as the requirements — RULE: user message "pull the latest for replace the reqs"
2. Backed up the untracked kit `AGENTS.md` to `memory/backups/AGENTS.kit.md` before the pull overwrote it — RULE: `docs/claude-md/tracks.md` `### Stops that stay`
3. Merged `AGENTS.md`: repo project rules first, kit doctrine after — SAFER OPTION: keeps both; neither set of rules is lost ⚠ decided for you — please review
4. Stage 0.5 grilling/brainstorming answered from the locked spec, not re-run as sessions — FACT: `docs/ISSUES.md`:3 "this file gives each task its acceptance criteria" ⚠ decided for you — please review
5. Wave 1 = T001 first, then T002–T005 in parallel; T006+ guides written before pickup — RULE: `docs/claude-md/tracks.md` `## Auto mode` row 12 (Supervisor's own breakdown)
6. Test stack = `tsx` + `node:test`, no Jest/Vitest — RULE: `AGENTS.md` § Karpathy Engineering Principles (Simplicity First)
7. Spawned on Claude Code with the session model — SAFER OPTION: no other CLI named (`docs/claude-md/tracks.md` `## Auto mode` row 14) ⚠ decided for you — please review
8. Kit and plan committed on branch `setup/supervisor-kit`, not `main` — RULE: commit on default branch forbidden; worktrees need the guides
9. T001 branch re-applied as a patch on top of `setup/supervisor-kit` (agent commits kept on `backup/t001-orig`), because the agent worktree started from `main` without the guides — RULE: `docs/claude-md/tracks.md` `## Auto mode` (the merge gate blocks `git rebase` while In Progress)
10. MCP servers added to `.mcp.json`: easy-verifier over HTTP to the running container, easy-memory as the local stdio script (no memory container exists) — SAFER OPTION: `docker ps -a` lists no easy-memory container ⚠ decided for you — please review
Checks: tests `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test` — exit 0, 6/6 pass; reviews code-review — P0 0, P1 1 (process: agent could not read `agents/common-infrastructure.md`, absent in its worktree), P2 3 (CI still `pnpm install` without `--frozen-lockfile` and no `pnpm test` step; `TEST_DATABASE_URL` shares the dev `radar` DB — moved to T002 guide; `engines` `>=20` but `node --test` globs need Node 21+), P3 1 (compiled `*.test.js` land in `dist/`); real run `pnpm worker -- --once` — printed `"status":"ok"` lines (auto-checked, not /verify)
Memory: decisions.md — "GH Archive ingests whole UTC days, not hours"; decisions.md — "Requirements live in docs/SPEC.md + docs/ISSUES.md; AGENTS.md is merged"
Not done: merge (yours); auto verify: running (T182)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/core/src/scoring.test.ts` (6 tests: lowkeyScore bounds/clamp, classifyTier trending/medium/lowkey/null). Output: `packages/core test: ℹ tests 6 ℹ pass 6 ℹ fail 0` |
| Verification command run | ☑ pass | `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test` → exit=0 (see AFTER) |
| Negative cases hold | ☑ pass | Agent: injected `assert.fail("deliberate")` → `neg_exit=1`, "ℹ fail 1", "ELIFECYCLE Test failed"; removed after |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | Reviewed the 13 files in `git diff 92fe8a4..HEAD` + `.github/workflows/ci.yml` (caller of the scripts). `lane_check`: `lane: C1, 12 files, 99 lines, EXCEEDS (files 12 > 6); unpredicted: .gitignore, docker-compose.yml` — mostly one-line package.json script edits; label kept at C1 |
| Full smoke suite still green (no regression) | ☑ pass | `pnpm worker -- --once` exit 0, `pnpm api` /health ok (agent run 04:54 UTC) |
| **Companion score (easy-verifier)** | ☑ N/A | not run for T001: config-only change; the score skill runs from T002 on |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: build/test config only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: build/test config only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: build/test config only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**: captured by common-infrastructure on branch `hun-t001-test-runner` at HEAD `b21072b`, before any implementation commit (Node v26.7.0, pnpm 9.12.0).

```
$ date -u; pnpm install; pnpm test; echo exit=$?
Sat Oct 31 04:47:34 AM UTC 2026
... + @types/node 22.20.5, + typescript 5.9.3 ... Done in 18.9s
> idea-radar@0.1.0 test ... > pnpm -r test
Scope: 6 of 7 workspace projects
(no package defines a "test" script, nothing ran)
exit=0            <- vacuous pass: zero tests exist

$ date -u; pnpm typecheck
Sat Oct 31 04:48:17 AM UTC 2026
packages/connectors typecheck: tsconfig.json(5,18): error TS6306: Referenced project '.../packages/core' must have setting "composite": true.
 ELIFECYCLE  Command failed with exit code 2.

$ pnpm worker -- --once 2>&1 | head -12
> @idea-radar/worker@0.1.0 dev .../apps/worker
> node --experimental-strip-types src/index.ts "--" "--once"

node:internal/modules/esm/resolve:202
  const resolvedOption = FSLegacyMainResolve(pkgPath, packageConfig.main, baseStringified);
                         ^
(module resolution error: @idea-radar/connectors main "dist/index.js" does not exist; src uses "./x.js" imports that strip-types cannot map to .ts)
```

**AFTER**: Supervisor rerun on the rebased branch `f9e6ff0`, Sat Oct 31 05:32:31 AM UTC 2026, `packages/*/dist` deleted first:

```
$ pnpm install --frozen-lockfile && pnpm typecheck && pnpm test
packages/core test: ℹ tests 6 / ℹ pass 6 / ℹ fail 0
packages/db, packages/connectors, apps/api, apps/worker test: ℹ tests 0 / ℹ fail 0 — Done
apps/dashboard test: no tests yet — Done
exit=0
```
Agent run (04:54 UTC): `pnpm worker -- --once` printed `{"connectorId":"gh_archive",...,"status":"ok"}` etc. and exited 0; `pnpm api` served `{"ok":true}` on `/health`.

**DELTA**: Contributors can now run `*.test.ts` tests from source with `pnpm test`, and `pnpm typecheck`, `pnpm worker` and `pnpm api` work from a clean checkout.

**WITNESS**: Supervisor session, 2026-10-31 05:32 UTC, rerun in the T001 worktree (trace: `memory/event-trace/T001.jsonl`).
