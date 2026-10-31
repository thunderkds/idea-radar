# TASK_REVIEW — T027: Re-scrape on request

> Sibling of `tasks/TASK_GUIDE_T027.md`. Everything here is **filled by the reviewer at Stage
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
1. Re-opening today's `snapshot` job keeps its `attempts`, because `(id, attempts)` is the run token; a `running` or `pending` job is left alone — FACT: `packages/db/src/tracking.ts:135 "SET status = 'pending', run_after = $1::timestamptz, locked_at = NULL, finished_at = NULL"` (no `attempts` in the SET; T023 fencing)
2. The refresh buttons call a Next.js server action that adds the token on the dashboard server; the action is reachable by anyone who can open the dashboard, so the dashboard must stay private until login or a rate limit exists (T019) — RULE: `tasks/TASK_GUIDE_T027.md` § Acceptance Criteria (AC 3 "the call goes through a Next.js server action, so the token never reaches the browser")
3. `/rescrape` answers in the order 404 (token unset) → 405 → 401 → 400 → 404 (not tracked) → 202, so an unauthenticated caller learns nothing about body validation — RULE: `tasks/TASK_GUIDE_T027.md` § Acceptance Criteria (AC 1 status codes and "`ADMIN_TOKEN` unset → 404 for the route")
4. The Supervisor updates `AGENTS.md`'s layout row (the API is no longer read-only), since the agent may not touch it — RULE: `tasks/TASK_GUIDE_T027.md` § Files Must NOT Touch ("`AGENTS.md` … Supervisor-owned")
5. The three P2 and two P3 review findings are left as follow-ups — RULE: `.claude/skills/code-review/SKILL.md` § Phase 4 — Apply Safe Fixes ("Do not apply P2/P3 fixes automatically")
Checks: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` (Supervisor rerun in the worktree under T027) — core 61/61, dashboard 158/158, connectors 91/92 (1 pre-existing live-token skip), db 167/167, api 32/32, worker 39/39, scripts 21/21, exit 0; `pnpm lint`, `pnpm typecheck` exit 0; `pnpm --filter @idea-radar/dashboard build` — `✓ Compiled successfully`; reviews code-review — P0 0, P1 0, P2 3 (server action lets any dashboard visitor queue refreshes; `AGENTS.md`/`README.md` still said read-only API — `AGENTS.md` fixed; re-opened failed job keeps attempts 5), P3 2; security-review — no findings (constant-time token check, bound SQL, token absent from HTML and script chunks); easy-verifier score — overall 75, floor 80 missed, change_risk 100 (Companion score row); easy-ui sessions af867efb, 642b984c, c223d876, 3f0af59b, eabc5f37 — all `passed`; real run: `curl -i -X POST http://localhost:4427/rescrape` with the token — printed `HTTP/1.1 202 Accepted {"queued":1}` (agent's Demonstration; auto-checked, not /verify)
Memory: memory/decisions.md — "Re-scrape on request via ADMIN_TOKEN; dashboard must stay private until auth (T027)"
Not done: merge (yours); auto verify: running (T182)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `apps/api/src/app.test.ts` ("POST /rescrape (T027 AC 1)": 202 repo/group, re-opened ok job, 404 unset/empty token and unknown/untracked target, 400 for 17 bad bodies + bad JSON + over-size, 401 for 9 header variants incl. bad body without token, 405 on other methods; "GET /repos/:id: tracking"), `packages/db/src/tracking.test.ts` ("requestRescrape"), `packages/db/src/api.test.ts` ("getRepoDetail: tracking"), `apps/dashboard/app/_components/repo-detail.test.tsx`, `rescrape-action.test.ts`, `rescrape-button.test.tsx`, `apps/dashboard/lib/api.test.ts`, `lib/format.test.ts`. Output: api 32/32, db 167/167, dashboard 158/158 |
| Verification command run | ☑ pass | `pnpm lint && pnpm typecheck && TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test && pnpm --filter @idea-radar/dashboard build` exit 0 (Supervisor rerun under T027) |
| Negative cases hold | ☑ pass | token unset → 404 and buttons hidden; wrong/missing token → 401 before the body is read; bad body → 400; untracked repo/group → 404 and no job queued; running/pending job untouched; parked repo keeps `parked`; server action refuses forged targets; dashboard server down → "Refresh failed: Could not reach the dashboard server", page stays up |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `POST /rescrape` and `GET /repos/:id` in `app.ts`, `requestRescrape`, `getRepoDetail`, dashboard repo page, button, server action, `lib/api.ts`, and their tests. `lane: C2, 26 files, 2069 lines, EXCEEDS (files 26 > 14; lines 2069 > 500)`: under-labelled, really C3 (UI + write endpoint + 5 UI sessions) |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 and the dashboard build |
| **Companion score (easy-verifier)** | ☑ fail | overall 75 (floor 80 missed), change_risk 100 (feature, confirmed; `new_code_without_test_share` 0 passed), scope changes, ref `hun-173-idea-groups...HEAD`, abstentions: solution-fit, requirement-fidelity, api, data, operations, infrastructure, gates: test-strategy answered (85, confidence 0.6, from AC 4 and the code-review), none abstained, test pairs: 9 proposals confirmed + `apps/api/src/index.ts`↔`app.test.ts:1` added, divergence: no findings sent (the verifier accepts only refs from its own pack), ratings: architecture 100, reliability 100, test-strategy 89, code-quality 83 (`max_function_ccn`), blast-radius 65 (`max_fan_in_changed`), supply-chain 55 (field report E1; no provenance step), security 30 (`redaction_hits_observed`: lockfile/kit hashes, field report E2). report: `/home/hungnguyenhuu/.easy-verifier-reports/T027/evidence-report-changes-20261031T161253-806292Z.html` |
| **UI: Visual regression (diff or verdict pasted)** | ☑ pass | easy-ui `apps/dashboard/test/ui/rescrape-visual-regression.json`: `Session af867efb-c809-475b-a775-800c8098a81b ended (passed)` (tracking line, group list, both buttons secondary, parked and untracked repos, buttons hidden without token, token absent from HTML/scripts); report `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/session-20261031-160714-t027-visual-regression-repo-page-trackin-af867efb.html`. Supervisor viewed screenshot `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793462837379.png`: tracking section, "Refresh now" / "Refresh group now", "Refresh queued for 3 repos" — on design |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ pass | easy-ui `rescrape-design-system.json`: `Session 642b984c-8181-49a1-8308-8e4c3879049c ended (passed)` — computed colours match tokens (`--text`, `--line-strong`, `--bg-raised`, `--neon` 2px focus ring + 2px offset, `--text-dim`, `--danger`, `--text-2`), IBM Plex fonts, 36px button height, no primary button, no glow |
| **UI: Responsiveness at target viewports** | ☑ pass | easy-ui `rescrape-responsiveness.json`: `Session c223d876-f02e-41f0-bbb1-6147ea430f6a ended (passed)` — 375 / 768 / 1280 px: no horizontal scroll, buttons inside the viewport, ≥ 44px tall at 375, status line fits after a real click, long repo name wraps. Flow sessions 3f0af59b (queued) and eabc5f37 (error) also passed |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE** (captured 2026-10-31T15:55:48Z by the implementing agent on branch `hun-174-rescrape-button` at `d2f0a42`, before any implementation commit; API on :4427 against the throwaway database `dash_t027` on `idea-radar-test-pg`, repo 1003 is `parked` with `next_due_at = infinity`; the route is absent and every non-GET answers 405, not 404):

```
2026-10-31T15:55:48Z
$ curl -i -X POST http://localhost:4427/rescrape -H "Authorization: Bearer demo-admin-token" -H "content-type: application/json" -d "{\"repoId\":1003}"
HTTP/1.1 405 Method Not Allowed
content-type: application/json
Date: Sat, 31 Oct 2026 15:55:48 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

{"error":"method not allowed"}
$ psql: SELECT repo_id, priority, next_due_at FROM tracked_repos WHERE repo_id=1003
 repo_id | priority | next_due_at |              now              
---------+----------+-------------+-------------------------------
    1003 | parked   | infinity    | 2026-10-31 15:55:48.264627+00
(1 row)

 name | data_key | status 
------+----------+--------
(0 rows)
```

**AFTER** (captured 2026-10-31T16:03:19Z by the implementing agent on branch `hun-174-rescrape-button`; same API on :4427 and the same throwaway database `dash_t027`, started with `ADMIN_TOKEN=demo-admin-token`; repo 1003 was `parked`, `next_due_at = infinity` before the call):

```
2026-10-31T16:03:19Z
$ curl -i -X POST http://localhost:4427/rescrape -H "Authorization: Bearer demo-admin-token" -H "content-type: application/json" -d "{\"repoId\":1003}"
HTTP/1.1 202 Accepted
content-type: application/json
Date: Sat, 31 Oct 2026 16:03:19 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

{"queued":1}
$ psql: SELECT repo_id, priority, next_due_at, now() FROM tracked_repos WHERE repo_id=1003; SELECT name,data_key,status,run_after FROM jobs
 repo_id | priority |        next_due_at         |              now              
---------+----------+----------------------------+-------------------------------
    1003 | parked   | 2026-10-31 16:03:19.947+00 | 2026-10-31 16:03:20.018011+00
(1 row)

   name   |  data_key  | status  |         run_after          
----------+------------+---------+----------------------------
 snapshot | 2026-10-31 | pending | 2026-10-31 16:03:19.947+00
(1 row)

$ without token / wrong token:
HTTP/1.1 401 Unauthorized
{"error":"unauthorized"}HTTP/1.1 401 Unauthorized
{"error":"unauthorized"}
```

**DELTA**: With the admin token, a user can press "Refresh now" (or "Refresh group now") on the repo page, or call `POST /rescrape`, and a parked or weekly repo is made due now and today's `snapshot` job is queued, where before the API answered 405 to every write and no repo could be refreshed on request.

**WITNESS**: Supervisor reran the full suite and the dashboard build in the worktree on 2026-10-31 under the T027 trace (`memory/event-trace/T027.jsonl`) and viewed easy-ui screenshot `screenshot-1793462837379.png`; BEFORE/AFTER captures are the implementing agent's (commit `1fced83`, before any implementation, and `bf74af2`).
