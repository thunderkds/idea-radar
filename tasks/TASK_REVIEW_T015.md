# TASK_REVIEW — T015: Source consensus score

> Sibling of `tasks/TASK_GUIDE_T015.md`. Everything here is **filled by the reviewer at Stage
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
Checks: tests `<command>` — <result>; reviews <skill — result>; real run `<command>` — printed `<what it printed>` (auto-checked, not /verify)
Memory: <each entry the memory pass wrote, as `file — entry` | nothing new>
Not done: merge (yours); <auto verify: running (T182) | auto verify: <result> | /verify (yours)>

-->

## Auto decisions

Mode: auto
1. Stored `consensus_count` counts every source, Trendshift included; the API shows a count of displayable sources only — RULE: `AGENTS.md` § Rules ("`displayable: false` sources (Trendshift) never reach API responses or the UI. They may only influence scores.")
2. The API strips `components.consensusBoost`, because the boost factor reveals the hidden-source count — RULE: `AGENTS.md` § Rules (same rule)
3. Trending boost = 1 + 0.1 per source beyond the first, in `consensusConfig` — SAFER OPTION: small, reversible starting value; the owner tunes it ⚠ decided for you — please review
4. Verify fix: the API and scoring now use one consensus window, the 7 days before the score date (`[D-7 00:00Z, D 00:00Z)`); hidden sources are the only intended difference between stored and shown counts — RULE: `docs/claude-md/tracks.md` `### Auto verify (Stop hook)` (the auto verify run found the one-day mismatch; fixed test-first in `9d9eabd`)
5. Timeline and `/consensus` first-seen dates are all-time per source, from the view — RULE: `docs/ISSUES.md` § HUN-155 ("Store first-seen date per source … for the 'who caught it first' timeline")
Checks: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` — core 18/18, connectors 80/81 (1 pre-existing skip), db 78/78, api 23/23, worker 24/24, exit 0; reviews migration-safety — GO (one additive `CREATE OR REPLACE VIEW`, no table touched, rollback SQL in header; up → down → up on a scratch database applied cleanly; a view holds no data, so no backfill or lock risk), code-review — P0 0, P1 0, P2 1 (the agent wrote tests alongside code, not strictly test-first); first auto verify — fail: stored and shown consensus windows differed by one day, fixed in `9d9eabd` with a red-first test, P3 0; real run: API on a temp schema printed `/consensus` with 2 rows and trending score 100 → 120 (agent run, in AFTER) (auto-checked, not /verify); easy-verifier score — overall 67, floor 80 missed (Companion score row)
Memory: memory/learnings.md — kit gotchas from wave 4 (report helper, verify close-out)
Not done: merge (yours); auto verify: ☑ pass (session 2ae3f276-bc65-4c5d-b9d8-28abdd602e19, commit 39245bcad85167932d5d0b89760a75d0892586d8, log .claude/verify-runs/T015-39245bcad851.log)
Closed: row moved to Done 2026-10-31 — auto verify pass (session 2ae3f276-bc65-4c5d-b9d8-28abdd602e19, commit 39245bcad85167932d5d0b89760a75d0892586d8); Gates 5 and 6 checked

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/db/src/consensus.test.ts` (8 tests: count across sources incl. hidden, window edges, boost only on trending, view rows), `apps/api/src/app.test.ts` (+7: tier fields, timeline, `/consensus` paging and 400s, leak test on new fields and route), `apps/worker/src/worker.test.ts` (score handler order). api `ℹ tests 22 ℹ fail 0`, db `ℹ tests 78 ℹ fail 0` |
| Verification command run | ☑ pass | `TEST_DATABASE_URL=… pnpm test` exit 0 (Supervisor rerun under T015); `pnpm typecheck` clean (agent) |
| Negative cases hold | ☑ pass | count 0/1 gives boost 1; medium and lowkey not boosted; a hidden source is counted in storage but never in any API body; bad `limit`/`cursor` on `/consensus` → 400 |
| verify | ☑ pass | auto-run by hook, session 2ae3f276-bc65-4c5d-b9d8-28abdd602e19, commit 39245bcad85167932d5d0b89760a75d0892586d8, log .claude/verify-runs/T015-39245bcad851.log — pass |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | migration 005, `consensus.ts`, `api.ts`, `app.ts`, worker score handler, `consensusConfig`. `lane: C2, 10 files, 619 lines, EXCEEDS (lines 619 > 500)` — mostly tests |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 |
| **Companion score (easy-verifier)** | ☑ fail | overall 67 (floor 80 missed; rescored after `9d9eabd`, same value), change_risk 0 (feature, confirmed; rule `new_code_without_test_share` failed: 0.5 > 0.2, unpaired `packages/core/src/scoring.ts`, `packages/db/src/api.ts`, `packages/db/src/index.ts`), scope changes, ref `b0dfcf3...HEAD`, abstentions: solution-fit, requirement-fidelity, reliability, api, operations, infrastructure, gates: code-quality offered (borderline CCN) and left abstained — no kit-held complexity evidence, divergence: no findings sent, task-specific drags: data 62 (`migrations_without_rollback_share` 1 — the rule wants a down migration; 005 has rollback SQL only in a header comment), test-strategy 65 (`network_calls_in_unit_tests_observed` 2 in `apps/api/src/app.test.ts`, which serves on port 0 by design); repo-wide drags: supply-chain 20, security 59 (redaction hits), report: `/home/hungnguyenhuu/.easy-verifier-reports/T015/evidence-report-changes-20261031T085308-604444Z.html` |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: scoring and API only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: scoring and API only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: scoring and API only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE** (captured 2026-10-31T08:32-08:33Z, before any implementation commit; worktree HEAD b0dfcf3; throwaway schema `t015_before` seeded with repo 1 trending, 2 displayable sources + 1 hidden source signal, repo 2 lowkey):

```
=== 2026-10-31T08:33:16Z schema t015_before, API :47015 ===
$ curl /consensus
{"items":[]}
$ curl /tiers/trending
{"tier":"trending","date":"2026-10-30","items":[{"repoId":1,"fullName":"a/one","description":null,"language":null,"topics":[],"stars":900,"score":100,"starsGained":0,"components":{},"stackTags":[]}],"nextCursor":null}
$ curl /repos/1 -> score + timeline key
{"score":{"date":"2026-10-30","tier":"trending","score":100,"components":{},"consensusCount":2,"fakeStarFlag":true},"hasTimeline":false}
stored repo_scores:
1|trending|0|100|{}
2|lowkey|0|0.5|{}

=== 2026-10-31T08:32:51Z verification command (BEFORE): TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test ===
packages/core: tests 18, pass 18, fail 0
packages/connectors: tests 81, pass 80, fail 0 (1 skipped)
packages/db: tests 70, pass 70, fail 0
apps/api: tests 15, pass 15, fail 0
apps/worker: tests 24, pass 24, fail 0
```

Shows: `/consensus` is the stub `{"items":[]}`; tier items have no `consensusCount` / `fakeStarFlag`; `/repos/1` has no `timeline`; stored `consensus_count` is 0 and the trending score is unboosted (100).

**AFTER** (2026-10-31T08:37-08:38Z; same seed, then `applyConsensus(pool, "2026-10-30")` -> `{"updated":2,"boosted":1}`, and two more displayable-source signals added for repo 2 afterwards, so only repo 2's stored count is still 0):

```
=== 2026-10-31T08:38:34Z schema t015_before, API :47017 ===
$ curl /consensus
{"date":"2026-10-30","items":[{"repoId":2,"fullName":"a/two","consensusCount":2,"sources":[{"source":"github_trending","firstSeenAt":"2026-10-27T10:00:00.000Z"},{"source":"ossinsight","firstSeenAt":"2026-10-29T12:00:00.000Z"}]},{"repoId":1,"fullName":"a/one","consensusCount":2,"sources":[{"source":"github_trending","firstSeenAt":"2026-10-28T10:00:00.000Z"},{"source":"ossinsight","firstSeenAt":"2026-10-29T10:00:00.000Z"}]}],"nextCursor":null}
$ curl /tiers/trending
{"tier":"trending","date":"2026-10-30","items":[{"repoId":1,"fullName":"a/one","description":null,"language":null,"topics":[],"stars":900,"score":120,"starsGained":0,"components":{},"stackTags":[],"consensusCount":2,"fakeStarFlag":true}],"nextCursor":null}
$ curl /repos/1 -> score + timeline key
{"score":{"date":"2026-10-30","tier":"trending","score":120,"components":{},"consensusCount":2,"fakeStarFlag":true},"hasTimeline":true}
stored repo_scores:
1|trending|3|120.000000|{"consensusBoost": 1.2}
2|lowkey|0|0.5|{}
```

Full suite after the change: `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` -> core 18/18, connectors 80 pass + 1 skipped of 81, db 78/78, api 23/23, worker 24/24; `pnpm typecheck` clean.

**DELTA**: After each score run every scored repo has a stored `consensus_count`, Trending rows are boosted by it, and the API shows displayable-only consensus on tier items, a per-source timeline on a repo, and a paged `/consensus` list instead of the empty stub.

**WITNESS**: Supervisor session, 2026-10-31T08:40:15Z: reran `TEST_DATABASE_URL=… pnpm test` under T015 (exit 0, recorded in `memory/event-trace/T015.jsonl`) and applied migration 005 up, down and up again on a scratch database.

### Rework R1

**BEFORE** (captured 2026-10-31T10:53Z, before any R1 implementation commit; worktree HEAD 7ffdfc8; `pnpm install --frozen-lockfile` and `pnpm build` ran first because the worktree had no node_modules):

```
=== 2026-10-31T10:53:09Z ls packages/db/migrations/; pnpm lint ===
001_init.sql
002_pending_signals_and_cursors.sql
003_candidates.sql
004_jobs.sql
005_source_first_seen.sql

> idea-radar@0.1.0 lint /home/hungnguyenhuu/workspace/pets/hungnguyen111/idea-radar/.claude/worktrees/T015
> pnpm -r lint && eslint scripts eslint.config.js

Scope: 6 of 7 workspace projects
apps/dashboard lint$ eslint .
packages/core lint$ eslint .
apps/dashboard lint: Done
packages/core lint: Done
packages/connectors lint$ eslint .
packages/db lint$ eslint .
packages/db lint: /home/hungnguyenhuu/workspace/pets/hungnguyen111/idea-radar/.claude/worktrees/T015/packages/db/src/api.ts
packages/db lint:   98:27  error  '_consensusBoost' is assigned a value but never used  @typescript-eslint/no-unused-vars
packages/db lint: ✖ 1 problem (1 error, 0 warnings)
packages/db lint: Failed
/home/hungnguyenhuu/workspace/pets/hungnguyen111/idea-radar/.claude/worktrees/T015/packages/db:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @idea-radar/db@0.1.0 lint: `eslint .`
Exit status 1
packages/connectors lint: Done
 ELIFECYCLE  Command failed with exit code 1.
exit 1
```

Shows: only one migration file per migration (no `005_source_first_seen.down.sql`), and `pnpm lint` fails on `api.ts:98:27 _consensusBoost`.

**AFTER** (2026-10-31T10:55Z, same command, worktree after the R1 commits; `lint exit 0` confirmed by a rerun):

```
=== 2026-10-31T10:55:56Z ls packages/db/migrations/; pnpm lint ===
001_init.sql
002_pending_signals_and_cursors.sql
003_candidates.sql
004_jobs.sql
005_source_first_seen.down.sql
005_source_first_seen.sql

> idea-radar@0.1.0 lint /home/hungnguyenhuu/workspace/pets/hungnguyen111/idea-radar/.claude/worktrees/T015
> pnpm -r lint && eslint scripts eslint.config.js

Scope: 6 of 7 workspace projects
apps/dashboard lint$ eslint .
packages/core lint$ eslint .
apps/dashboard lint: Done
packages/core lint: Done
packages/connectors lint$ eslint .
packages/db lint$ eslint .
packages/db lint: Done
packages/connectors lint: Done
apps/api lint$ eslint .
apps/worker lint$ eslint .
apps/api lint: Done
apps/worker lint: Done
exit 0
```

Full suite: `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` exit 0 -> core 23/23, connectors 80 pass + 1 skipped of 81, db 94/94, api 23/23, worker 24/24; `pnpm typecheck` clean.

**DELTA**: `005_source_first_seen.down.sql` now exists beside migration 005 (005 itself unchanged), `rollbackMigration` runs it, `pnpm lint` passes (was 1 error), and `scoring.ts`, `api.ts`, `index.ts`, `migrations.ts` each have a sibling test changed on this branch.
