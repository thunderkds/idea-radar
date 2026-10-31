# TASK_REVIEW — T016: Read-only API

> Sibling of `tasks/TASK_GUIDE_T016.md`. Everything here is **filled by the reviewer at Stage
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
1. `window` (7d/30d) only chooses the star gain each item carries (`starsGained`); the list stays the latest scored day's tier ordered by `score` — DEBATED: list stays the latest day, `window` picks the figure (Advocate 1: `window` = which star-gain figure, because `repo_scores` holds one daily snapshot and tier rank is fixed by `docs/SPEC.md` § Tier scoring; Advocate 2: `window` = repos that held the tier on any day in the window, so "lowkey this month" stays visible — weakness: shows repos that have left the tier under a stale label) ⚠ decided for you — please review
2. `/consensus` and `/topics/rising` stay stubs with `TODO(HUN-155)` / `TODO(HUN-158)` — FACT: `docs/ISSUES.md:79` "### HUN-155 — Source consensus score" and `docs/ISSUES.md:94` "### HUN-158 — Dashboard: rising topics, consensus, ops"
3. Non-displayable sources are left out of `/ops/sources`, their signals are read only through `sources.displayable = TRUE`, component keys named after them are stripped, and repo-detail `consensusCount` counts displayable sources only (U4) — RULE: `AGENTS.md` § Rules ("`displayable: false` sources (Trendshift) never reach API responses or the UI")
4. The latest day is `max(repo_scores.date)` with no run-complete marker; a half-written day cannot show because `scoreDay` writes a date inside one transaction — FACT: `packages/db/src/scores.ts:50` "await client.query("BEGIN");" (T009 branch)
5. No CORS, auth or caching — RULE: `tasks/TASK_GUIDE_T016.md` § Approach ("Cut list: CORS (T017 decides whether the dashboard calls the API from the server side), auth, caching, OpenAPI file")
Checks: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` — core 6/6, connectors 49/50 (1 pre-existing skip), db 54/54, api 15/15, worker 18/18, exit 0; reviews code-review — P0 0, P1 0, P2 2 (tier items carry no consensus count or fake-star flag that HUN-157's list wants; component-key stripping guesses a `<source>_` prefix, so T009/T015 must keep that naming), P3 0; security-review — no findings ≥ 8/10 (all SQL parameterised, text params capped at 200 chars, cursor validated, numeric id checked, errors return a generic 500); real run `createApi` on port 47318 over a temp schema — printed tier, 400 and ops bodies with no `trendshift` data (auto-checked, not /verify)
Memory: nothing new
Not done: merge (yours); auto verify: running (T182)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `apps/api/src/app.test.ts` (15 tests: tier list and order, each filter, window, limit, cursor paging over two pages, every 400 case, 404s, repo detail, ops, health, non-displayable leak check on every route). api `ℹ tests 15 ℹ fail 0` |
| Verification command run | ☑ pass | `TEST_DATABASE_URL=… pnpm test` exit 0 (Supervisor rerun under T016); `pnpm typecheck` exit 0 (agent) |
| Negative cases hold | ☑ pass | bad window/limit/cursor/id/text → 400; unknown tier/repo → 404; non-GET → 405; removing the `so.displayable` join made the leak tests fail (agent mutation check) |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `apps/api/src/{app,app.test,index}.ts`, `packages/db/src/{api,index}.ts`. `lane: C2, 5 files, 767 lines, EXCEEDS (lines 767 > 500); unpredicted: apps/api/src/app.test.ts, packages/db/src/index.ts` — 400+ lines are tests |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 |
| **Companion score (easy-verifier)** | ☑ N/A | not run in this session |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: HTTP API only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: HTTP API only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: HTTP API only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE** (captured 2026-10-31T07:42:49Z to 07:43:08Z, before any implementation commit, branch `hun-156-api` at 97db755):

Verification command `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` then `pnpm typecheck` (typecheck exit 0):
```
packages/core test: ℹ tests 6 / pass 6 / fail 0
packages/connectors test: ℹ tests 50 / pass 49 / fail 0 / skipped 1
packages/db test: ℹ tests 54 / pass 54 / fail 0
apps/api test: ℹ tests 0 / pass 0 / fail 0
apps/worker test: ℹ tests 18 / pass 18 / fail 0
```
Current stub API (`API_PORT=47316 tsx src/index.ts`), 2026-10-31T07:43:08Z:
```
GET /tiers/lowkey  -> {"tier":"lowkey","items":[]} [200]
GET /repos/1       -> {"repo":null} [200]
GET /ops/sources   -> {"items":[]} [200]
```
The API has no tests and every route returns an empty body.

**AFTER** (2026-10-31T07:46:37Z, `createApi` served on port 47318 over a temp schema seeded with one non-displayable source `trendshift`; bodies cut):
```
GET /tiers/lowkey?limit=1 -> [200] {"tier":"lowkey","date":"2026-10-30","items":[{"repoId":1,"fullName":"a/one",...,"score":0.9,"starsGained":15,"components":{"velocityLift":0.8},"stackTags":[]}],"nextCursor":"eyJzY29yZSI6IjAuOSIsInJlcG9JZCI6MX0"}
GET /repos/abc -> [400] {"error":"id: must be a numeric repo id"}
GET /ops/sources -> [200] {"items":[{"id":"github_api","name":"GitHub API","enabled":true,"lastRunAt":null,"lastStatus":"ok","lastError":null}]}
```
The `trendshift_boost` component and the `trendshift` source are absent. `TEST_DATABASE_URL=... pnpm test`: apps/api 15 tests, 15 pass (BEFORE: 0); whole suite 143 tests, 142 pass, 1 skipped (pre-existing connectors skip); `pnpm typecheck` exit 0.

**DELTA**: The dashboard can now page through a tier with filters, open a repo's detail and read source health, and no response carries data from a non-displayable source.

**WITNESS**: Supervisor session, 2026-10-31: reran `TEST_DATABASE_URL=… pnpm test` under T016 (exit 0, recorded in `memory/event-trace/T016.jsonl`) and read `app.ts` / `api.ts` for the displayable joins.
