# TASK_REVIEW — T012: OSS Insight connector

> Sibling of `tasks/TASK_GUIDE_T012.md`. Everything here is **filled by the reviewer at Stage
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
1. Empty trends over all periods throws `OssInsightEmptyError` with the API's `data_quality.status` and `reason`; one empty period alongside a period with rows is fine — RULE: `docs/ISSUES.md` § HUN-152 ("handle non-200 and empty responses")
2. Collection fixtures are hand-written, because every live `/v1/collections/*` endpoint returned HTTP 500 on 2026-10-31; endpoint paths and row fields are unverified live — SAFER OPTION: tests cover the parser on the standard `{data:{rows}}` shape and a live mismatch throws, never writes wrong tags ⚠ decided for you — please review
3. Any collection fetch failure fails the whole run, so trending rows are lost while collections are down — RULE: `tasks/TASK_GUIDE_T012.md` AC 4 ("A collection fetch failure fails the run")
4. Request budget is counted per run (sequential, throws before request 601); not tracked across runs in one hour, because the job is daily — SAFER OPTION: smallest rule that keeps one run under 600/hr ⚠ decided for you — please review
5. Left `OSSINSIGHT_ENABLED` as is: once merged, the daily `ossinsight` job fails every day and Ops shows the error until OSS Insight recovers — SAFER OPTION: the failure is the requested signal; disabling is the owner's call ⚠ decided for you — please review
Checks: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` — core 6/6, connectors 63/64 (1 pre-existing skip), db 54/54, worker 18/18, exit 0; reviews code-review — P0 0, P1 0, P2 1 (collection paths and shapes unverified live), P3 0; real run `tsx` script iterating `fetch` against the live API — printed `threw: OSS Insight trends/repos returned 0 rows for periods [past_24_hours]; past_24_hours: data_quality.status=unavailable: ...` (auto-checked, not /verify)
Memory: memory/learnings.md — OSS Insight collections endpoints return HTTP 500 (2026-10-31)
Not done: merge (yours); auto verify: ☑ pass (session 7ec0579b-cda9-4c2b-8293-e1cb05b85a14, commit 5bdded0a5401465c4f5696086facda6152c3fbb4, log .claude/verify-runs/T012-5bdded0a5401.log)
Closed: row moved to Done 2026-10-31 — auto verify pass (session 7ec0579b-cda9-4c2b-8293-e1cb05b85a14, commit 5bdded0a5401465c4f5696086facda6152c3fbb4); Gates 5 and 6 checked

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/connectors/src/ossinsight.test.ts` (13 tests: empty trends with/without data_quality, non-200, non-JSON, bad shape, collection tags merge, collection failure fails run, empty list, unavailable member list, budget 600 pass / 601 throw, normalize). connectors `ℹ tests 64 ℹ pass 63 ℹ fail 0 ℹ skipped 1` |
| Verification command run | ☑ pass | `TEST_DATABASE_URL=… pnpm test` exit 0 (Supervisor rerun under T012); `pnpm typecheck` clean (agent) |
| Negative cases hold | ☑ pass | empty, non-200, non-JSON, wrong shape, collection 500 and budget overrun all throw; tests use injected `fetchImpl`, no network |
| verify | ☑ pass | auto-run by hook, session 7ec0579b-cda9-4c2b-8293-e1cb05b85a14, commit 5bdded0a5401465c4f5696086facda6152c3fbb4, log .claude/verify-runs/T012-5bdded0a5401.log — pass |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `ossinsight.ts` + test + fixtures; callers: `packages/connectors/src/index.ts` (constructor call unchanged), worker `fetchHandler` (throw → job error). `lane: C1, 9 files, 440 lines, EXCEEDS (files 9 > 6; lines 440 > 250)` — 7 of 9 files are fixtures |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 |
| **Companion score (easy-verifier)** | ☑ N/A | not run in this session |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: connector only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: connector only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: connector only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE** (captured 2026-10-31, before any implementation commit; connector at `97db755`):

Live API, `curl https://api.ossinsight.io/v1/trends/repos/?period=past_24_hours` at 2026-10-31T07:42:29Z:
```
HTTP/2 200
warning: 199 - "degraded data: star-event derived ranking unavailable"
{"type":"sql_endpoint","data":{"columns":[],"rows":[],"result":{"row_count":0}},"data_quality":{"status":"unavailable","metric":"github_event_derived_ranking",...,"unavailable_since":"2026-03-01","reason":"This ranking is ordered by recent star/PR/issue event counts, ..."}}
```
Current connector against it (`pnpm exec tsx --conditions=source before.mts`, `new OssInsightConnector(true, ["past_24_hours"])`, iterate `fetch`), 2026-10-31T07:43:13Z:
```
fetch finished without throwing; rows yielded = 0
```
Baseline `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test`, 2026-10-31T07:43:17Z: packages/db 54 pass / 0 fail, apps/worker 18 pass / 0 fail (no ossinsight tests exist).

**AFTER** (same script and live API, 2026-10-31T07:46:07Z):
```
threw: OSS Insight trends/repos returned 0 rows for periods [past_24_hours]; past_24_hours: data_quality.status=unavailable: This ranking is ordered by recent star/PR/issue event counts, ... An empty result here means the metric cannot be computed, not that there are no matching repositories.
```
`TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` at 2026-10-31T07:45:57Z: connectors 63 pass / 1 skipped (pre-existing) / 0 fail, db 54 pass, worker 18 pass, core 6 pass; 13 new tests in `packages/connectors/src/ossinsight.test.ts`. `pnpm typecheck` clean.

**DELTA**: A daily OSS Insight run now fails with the API's own `data_quality` reason instead of recording `ok` with 0 signals, and when data exists each signal carries `value.collections`.

**WITNESS**: Supervisor session, 2026-10-31: reran `TEST_DATABASE_URL=… pnpm test` under T012 (exit 0, recorded in `memory/event-trace/T012.jsonl`) and read the AFTER run output above.
