# TASK_REVIEW — T025: GitHub Search discovery

> Sibling of `tasks/TASK_GUIDE_T025.md`. Everything here is **filled by the reviewer at Stage
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
1. Search goes through REST `GET /search/repositories` (real page numbers, full metadata per item), not GraphQL `search()` — RULE: `tasks/TASK_GUIDE_T025.md` § Acceptance Criteria (AC 2 "REST or GraphQL `search(type: REPOSITORY)`")
2. Discovery covers TypeScript, JavaScript, Python, Go, Rust and Java; 5 pages per query; 120 requests a day (one full pass is 60) — SAFER OPTION: well inside the Search limit and the 1,000-results cap; the values sit in `discoveryConfig` for tuning ⚠ decided for you — please review
3. `score` does not wait for `discover` in any state; a failed `discover` stays visible (job `failed`, `github_api` health `error`) — FACT: `packages/db/src/jobs.ts:18 "export const SCORE_DOES_NOT_WAIT_FOR = ["discover"] as const;"` (review finding R1.1: discovery is not an input to that day's score)
4. `trackRepos` never changes an existing tracked row (priority, reason, due time) — RULE: `tasks/TASK_GUIDE_T025.md` § Acceptance Criteria (AC 3 "existing tracked rows keep their priority and due time")
5. The P2 and P3 review findings are left as follow-ups — RULE: `.claude/skills/code-review/SKILL.md` § Phase 4 — Apply Safe Fixes ("Do not apply P2/P3 fixes automatically")
Checks: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` (Supervisor rerun in the worktree under T025, after R1) — core 58/58, dashboard 140/140, connectors 98/99 (1 pre-existing live-token skip), db 150/150, api 23/23, worker 43/43, scripts 21/21, exit 0; `pnpm lint`, `pnpm typecheck` exit 0; reviews code-review — round 1: P1 1 (a failed discover blocked the day's score), fixed in R1 with red-first tests; after R1: P0 0, P1 0, P2 2 (no `retry-after` handling on Search 403/429; config values chosen by the agent), P3 2; security-review — not required (Risk Low); easy-verifier score — overall 71, floor 80 missed, change_risk 100 (Companion score row); real run: Demonstration script on a scratch schema with the saved Search response — printed `{"job":"discover","date":"2026-10-31","queries":12,"requests":12,"found":3,"added":3}` (auto-checked, not /verify)
Memory: memory/learnings.md — "Stacked auto-mode branches and score blocking (T025/T026)" (covers the score-wait opt-out)
Not done: merge (yours); auto verify: running (T182)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/core/src/discovery.test.ts` (config + queries), `packages/connectors/src/github-search.test.ts` (mapping, paging, 1,000 cap, token, HTTP error redaction, limiter: 31 calls ≥ 60 s, 70 concurrent), `packages/db/src/discovery.test.ts` (added once, existing leader kept), `packages/db/src/score-wait.test.ts` (R1.1: score does not wait for discover, still waits for a failed snapshot), `apps/worker/src/discover.test.ts` (job, cap, no token, 403, failing discover does not hold back score). Output: connectors 98/99, db 150/150, worker 43/43, core 58/58 |
| Verification command run | ☑ pass | `pnpm lint && pnpm typecheck && TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` exit 0 (Supervisor rerun after R1, under T025) |
| Negative cases hold | ☑ pass | no token → skipped and logged; page 0 / 11 → no request; Search 403 → job pending with retry, `github_api` error, earlier pages kept; a failed discover does not block score; a failed snapshot still does |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `searchRepos` + limiter, `discoveryConfig`/`discoveryQueries`, `trackRepos`, `discoverHandler`, the score-wait exemption in `claimNext`, and their tests. `lane: C2, 13 files, 866 lines, EXCEEDS (lines 866 > 500)`: mostly new test files and the 100-item Search fixture |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 |
| **Companion score (easy-verifier)** | ☑ fail | overall 71 (floor 80 missed), change_risk 100 (feature, confirmed; `new_code_without_test_share` 0 passed), scope changes, ref `hun-t024-star-snapshots...HEAD`, abstentions: solution-fit, requirement-fidelity, api, data, operations, infrastructure, gates: none offered, test pairs: 6 proposals confirmed, divergence: no findings sent (the verifier accepts only refs from its own pack), ratings: architecture 100, code-quality 100, blast-radius 65 (churn hotspots), test-strategy 65 (`source_files_without_covering_test_share`, `network_calls_in_unit_tests_observed`: the fixtures stub fetch), security 59 (`redaction_hits_observed`: lockfile/kit hashes, field report E2), supply-chain 55 (field report E1; no provenance step), reliability 50 (`swallowed_errors_observed` 2 in `github-api.ts` and `jobs.ts`: the existing `ROLLBACK().catch(() => {})` patterns). report: `/home/hungnguyenhuu/.easy-verifier-reports/T025/evidence-report-changes-20261031T155553-093523Z.html` |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: connector, db and worker only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: connector, db and worker only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: connector, db and worker only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**: captured 2026-10-31T15:38Z, branch `hun-172-search-discovery` at `f26b2df` (no implementation commit yet). Command: `cd apps/worker && pnpm exec tsx --conditions=source <scratchpad>/demo.mts` (scratch schema, a saved Search fixture behind a stub `fetch`, the worker's own `buildHandlers` + `runWorker --once`):

```
2026-10-31T15:38:26.596Z scratch schema demo_1793461106349
2026-10-31T15:38:26.597Z registered jobs: shortlist, snapshot, resolve_pending, score
2026-10-31T15:38:26.597Z NO 'discover' handler registered
2026-10-31T15:38:26.598Z tracked_repos rows: 0
[]
repos rows: 0
job log lines: []
```

**AFTER**: same command, captured 2026-10-31T15:49Z after commit `T025: trackRepos and the discover job` (the stub returns the saved fixture for the TypeScript "created" query, page 1; the other 11 queries return no results):

```
2026-10-31T15:49:22.203Z scratch schema demo_1793461761892
2026-10-31T15:49:22.204Z registered jobs: shortlist, snapshot, discover, resolve_pending, score
2026-10-31T15:49:22.294Z tracked_repos rows: 3
[
  {
    repo_id: 880100001,
    full_name: 'alice/tiny-queue',
    priority: 'normal',
    added_reason: 'search',
    next_due_at: 2026-10-31T15:49:22.274Z
  },
  {
    repo_id: 880100002,
    full_name: 'bob/dotfiles-sync',
    priority: 'normal',
    added_reason: 'search',
    next_due_at: 2026-10-31T15:49:22.274Z
  },
  {
    repo_id: 880100003,
    full_name: 'carol/rss-digest',
    priority: 'normal',
    added_reason: 'search',
    next_due_at: 2026-10-31T15:49:22.274Z
  }
]
repos rows: 3
job log lines: [
  '{"job":"discover","date":"2026-10-31","queries":12,"requests":12,"found":3,"added":3}'
]
```

**DELTA**: the daily `discover` job now finds small, recent repos through GitHub Search, stores their metadata in `repos` and adds them to `tracked_repos` as `normal`, due now, reason `search`; before, the job did not exist and nothing outside GH Archive and the signal sources could add a repo to the tracked set.

**WITNESS**: Supervisor reran the full suite in the worktree on 2026-10-31 under the T025 trace (`memory/event-trace/T025.jsonl`); BEFORE/AFTER captures are the implementing agent's (commits `7b4ee5b`, before any implementation, and `5054540`).
