# TASK_REVIEW — T036: Replace git ingest with MCP ingest

> Sibling of `tasks/TASK_GUIDE_T036.md`. Everything here is **filled by the reviewer at Stage
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
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `scripts/repo-hygiene.test.ts`, 4 new tests (5 existing stay green, 9 total): AC1 routine prompt mentions `submit_ideas`, has none of `git push`, `git commit`, `git clone`, `pnpm`, `ideas:check`, and says "never clone, edit, commit or push"; AC2 CI has no `ideas:check` and the root script is gone; AC3 `railway.json` drops `/ideas/**` and keeps `/ideas/schema.json`; AC4 `docs/deploy.md` names `DATABASE_URL`, `MCP_TOKEN`, `MCP_WRITE_TOKEN`, `DASHBOARD_TOKEN`, `/login`, shows no real token, and (added in review) carries the caution to prefer the connector and Custom network access. AC5 (README flow and env list) and the AC4 setup steps are checked by review against the code, not by test. |
| Verification command run | ☑ pass | Supervisor re-ran on branch `t036-mcp-ingest` at `a5ac1da` (loopback PGlite `:55432`, `TEST_DATABASE_URL` set): `pnpm install --frozen-lockfile` exit 0; `pnpm test` exit 0 — packages/ideas 11/11, packages/db 23/23, apps/mcp 88/88, scripts 9/9, **131/131, 0 skipped**; `pnpm lint` exit 0; `pnpm typecheck` exit 0; `pnpm format:check` exit 0. Success criterion 1 grep: 22 hits before, 6 after, none tells anyone to commit or push idea files (see AFTER). |
| Negative cases hold | ☑ pass | Red run (implementing agent, before any change): `tsx --test scripts/repo-hygiene.test.ts` `tests 9, pass 5, fail 4`, all four new tests failed; review-round assertion red first: `pass 8, fail 1` (`deploy.md must prefer the connector over the env-var route`), then green `pass 9, fail 0`. Supervisor mutations on the committed branch (each `git diff --stat` non-empty, file restored after, `git status` 0 changes; baseline pass 9 / fail 0): a `git push` line appended to the routine prompt → pass 8 / **fail 1**; `railway.json` watching `/ideas/**` again → pass 8 / **fail 1**; a real-looking `Bearer` token appended to `deploy.md` → pass 8 / **fail 1**; `pnpm ideas:check` back in `ci.yml` → pass 8 / **fail 1**. |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | Reviewed `git diff main...HEAD` (18 files, 710 lines): routine prompt, `docs/deploy.md`, `README.md`, `ideas/README.md`, `railway.json`, `ci.yml`, root and package scripts, removed loader/check/cli code, types, hygiene tests, PRD and PROJECT_SPEC text. Every doc claim (error strings, tool parameters, token rules, `/health`, example file) checked against `apps/mcp/src/{tools,auth,server,index}.ts` and `packages/db/src/save.ts`; `git grep` for `IDEAS_DIR`, `loadIdeas`, `MergedIdea` (nothing uses them). Skipped: `apps/mcp/src/**` and `packages/db/**` (guide: must not touch, `git diff` empty there), T033-T035 code already merged and reviewed. code-review: no P0/P1; P2×3 (two fixed, `.env.example` is the user's), P3×3 (one fixed). security-review: no findings, 0 High/Med/Low, 4 hardening notes. Reports: `reports/code-review_t036-mcp-ingest_20261111T110432.html`, `reports/security-review_t036-mcp-ingest_20261111T110432.html`. |
| Full smoke suite still green (no regression) | ☑ pass | Same run: 131/131, 0 skipped. The ideas package went from 25 to 11 tests because the removed loader and checker took their own tests with them; the `validateIdeaFile` tests stay. |
| **Companion score (easy-verifier)** | ☑ N/A | easy-verifier and easy-ui failed to connect in this session (CONNECT_TIMEOUT), so no score was run. |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | not a UI task: docs, config and removal of code; no component changed |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | not a UI task |
| **UI: Responsiveness at target viewports** | ☑ N/A | not a UI task |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**: captured by the Supervisor, no T036 implementation commit yet (command output pasted verbatim; long lines cut to 110 characters):

```
# 2026-11-11T03:54:32Z base 1146064 (main + T036 board row), no T036 implementation commit
$ grep -rnE "git push|commit|ideas:check" routines/ README.md docs/deploy.md .github/ | wc -l
22
$ grep -rnE "git push|commit|ideas:check" routines/ README.md docs/deploy.md .github/ | cut -c1-110 | head -12
README.md:3:A Claude scheduled routine researches one batch of project ideas each day and commits it to this r
README.md:11:2. CI validates every idea file against [`ideas/schema.json`](ideas/schema.json) (`pnpm ideas:che
README.md:32:pnpm lint && pnpm typecheck && pnpm test && pnpm ideas:check
docs/deploy.md:33:   `MCP_TOKEN` lives only here and in your own client config, never in a commit.
docs/deploy.md:50:  A routine commit to `ideas/` therefore redeploys, and the new ideas are queryable after th
docs/deploy.md:52:Optional: in the service settings turn on **Wait for CI**, so Railway deploys a commit only 
docs/deploy.md:53:Actions workflow (`.github/workflows/ci.yml`, which runs `pnpm ideas:check`) passes. A commi
docs/deploy.md:78:   - a commit `ideas: <date>` by you appears on `main` and touches only `ideas/<date>.json`;
docs/deploy.md:79:   - the GitHub Actions run for that commit is green;
docs/deploy.md:82:### Known problem: 403 on `git push`
docs/deploy.md:84:There is a report (August 2026) that scheduled runs can get an HTTP 403 on `git push` to `ma
docs/deploy.md:92:A missed day shows as no new `ideas/<date>.json` commit on `main`, and an unchanged `ideas` 
$ grep -c submit_ideas routines/daily-ideas.md
0
$ pnpm ideas:check ideas/examples  (exit code)
exit=0

ideas:check ok (0 idea file(s) in ideas/examples)
$ grep -n ideas railway.json
7:      "/ideas/**",
9:      "/packages/ideas/**",
$ ls packages/ideas/src
check.test.ts
check.ts
cli.ts
index.ts
load.test.ts
load.ts
types.ts
validate.test.ts
validate.ts
```

Today the routine prompt never mentions `submit_ideas` (0), 22 lines in the docs and CI still tell a reader to commit, push or run `ideas:check`, `railway.json` still watches `/ideas/**`, and `pnpm ideas:check` still runs.

**AFTER**: same commands run on the implementation working tree by the implementing agent (command output pasted verbatim; long lines cut to 110 characters). The 6 remaining `commit` hits are the prompt's prohibition (`Never clone, edit, commit or push`) and three prose uses in `docs/deploy.md` ("never in a commit", "deploys a commit only after CI", "never committed"); none tells anyone to commit or push idea files.

```
# 2026-11-11T03:58:40Z base 1146064 + T036 working tree (implementation, uncommitted)
$ grep -rnE "git push|commit|ideas:check" routines/ README.md docs/deploy.md .github/ | wc -l
6
$ grep -rnE "git push|commit|ideas:check" routines/ README.md docs/deploy.md .github/ | cut -c1-110
routines/daily-ideas.md:42:4. Never clone, edit, commit or push anything, and never write the ideas to a file.
docs/deploy.md:53:   client config, never in a commit.
docs/deploy.md:74:Optional: in the service settings turn on **Wait for CI**, so Railway deploys a commit only 
docs/deploy.md:75:Actions workflow (`.github/workflows/ci.yml`) passes. A commit that fails CI is then not dep
docs/deploy.md:117:takes the token from the routine's environment, so the token is never committed. Add this e
docs/deploy.md:174:`"type": "http"` and `"headers": { "Authorization": "Bearer ${MCP_TOKEN}" }` so no secret i
$ grep -c submit_ideas routines/daily-ideas.md
4
$ pnpm ideas:check ideas/examples  (exit code)
exit=254
undefined
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "ideas:check" not found

Did you mean "pnpm format:check"?
$ grep -n ideas railway.json
7:      "/ideas/schema.json",
9:      "/packages/ideas/**",
$ ls packages/ideas/src
index.ts
types.ts
validate.test.ts
validate.ts
```

**DELTA**: The routine now sends its ideas with one `submit_ideas` call and never touches the repository, and one setup document (`docs/deploy.md`) covers Postgres, the three tokens, the routine's connector, the dashboard login and the clients, where before the routine had to commit and push an idea file and CI ran `pnpm ideas:check`.

**WITNESS**: [who ran it and when — derived from `memory/event-trace/Txxx.jsonl`, never the
implementing agent alone]
