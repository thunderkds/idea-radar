# TASK_REVIEW — T011: Fake-star detection

> Sibling of `tasks/TASK_GUIDE_T011.md`. Everything here is **filled by the reviewer at Stage
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
1. Only repos with a star burst (`repo_daily.stars_max_hour` >= 50 on a day of the 7-day window) are sampled, 100 newest stargazers each — SAFER OPTION: bounds the GitHub API cost (U3 open) ⚠ decided for you — please review
2. Low-activity account = created under 30 days before it starred, or 0 public repos, 0 followers and 0 contributions in the last year — RULE: `docs/SPEC.md` § Tier scoring ("discount stars from accounts under 30 days old or with no public activity")
3. Flag when the low-activity share >= 0.5; a flagged trending or lowkey score is multiplied by (1 - share); medium is flagged but not discounted — SAFER OPTION: flagged repos stay listed with a warning, and the discount is proportional to the evidence ⚠ decided for you — please review
4. `applyFakeStarFlags` is valid only right after `scoreDay` (not re-entrant; a retry reruns `scoreDay` first) — RULE: `tasks/TASK_GUIDE_T011.md` § Approach ("valid only right after `scoreDay` for that date")
5. Rework R1: every GitHub request is bounded by a 30 s timeout (`AbortSignal.timeout`, raced so an injected `fetchImpl` that ignores the signal still rejects), and a failed `ROLLBACK` after a fetch error is logged at warn level before the original error is rethrown — RULE: `tasks/TASK_GUIDE_T011.md` § Rework R1 (R1.1 "carries a timeout", R1.2 "logs the rollback error at warn level before rethrowing the original")
Checks: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` — core 26/26, connectors 85/86 (1 pre-existing live-GitHub skip), db 81/81, api 15/15, worker 26/26, exit 0; reviews code-review — P0 0, P1 0, P2 2 (live GraphQL query and its point cost unverified without a token; the pre-discount score is not kept in `components`), P3 1 (`scoreDay` doc comment still says the flag is false until T011); real run: none — needs a GitHub token (auto-checked, not /verify); easy-verifier score — overall 52, floor 80 missed (Companion score row); Rework R1: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` — core 27/27, connectors 87/88 (1 pre-existing live-GitHub skip), db 82/82, api 15/15, worker 27/27, root hygiene 5/5, exit 0; `pnpm lint` exit 0; code-review — P0 0, P1 0, P2 0, P3 1 (the default `fetchImpl` adds a second 30 s timeout on top of the one `post` passes; harmless), lane FITS; easy-verifier rescore — overall 75, floor 80 missed (Companion score row)
Memory: memory/learnings.md — easy-verifier masks pinned action SHAs; pnpm -r skips the root (T022) — cited for the remaining supply-chain drag
Not done: merge (yours); auto verify: running (T182)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/core/src/fake-stars.test.ts` (rule edges 29/30 days, 0/1 repo, follower, contribution), `packages/connectors/src/github-api.test.ts` (`sampleStargazers` on a saved fixture), `packages/db/src/fake-stars.test.ts` (burst + suspicious flagged and discounted, burst + healthy, no burst not sampled, medium not discounted, `scoreDay` resets), `apps/worker/src/worker.test.ts` (wiring, no-token skip). db `ℹ tests 81 ℹ fail 0`; Rework R1: `packages/connectors/src/github-api.test.ts` (request timeout rejects within the limit, message names the endpoint not the token), `apps/worker/src/worker.test.ts` (ROLLBACK failure warn log, original error rethrown), `packages/core/src/index.test.ts`, `packages/db/src/index.test.ts` |
| Verification command run | ☑ pass | `TEST_DATABASE_URL=… pnpm test` exit 0 (Supervisor rerun under T011); `pnpm typecheck` clean (agent) |
| Negative cases hold | ☑ pass | no burst → not sampled; healthy sample → not flagged; empty sample → unchanged; no token → check skipped and logged; flagged repos keep their row and tier |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | core rule + config, `github-api.ts` `sampleStargazers`, db `fake-stars.ts`, worker score handler. `lane: C2, 12 files, 615 lines, EXCEEDS (lines 615 > 500)` — mostly tests and the fixture |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 |
| **Companion score (easy-verifier)** | ☑ fail | Rework R1 rescore: overall 75 (floor 80 missed; was 52), change_risk 100 (feature, confirmed; `new_code_without_test_share` 0.125 passed, only `eslint.config.js` unpaired), scope changes, ref `b0dfcf3...HEAD`, abstentions: solution-fit, requirement-fidelity, api, data, operations, infrastructure, gates: none offered, test pairs: 10 proposals confirmed, divergence: no findings sent, ratings: reliability 100 (was 0), code-quality 100, architecture 100, test-strategy 75, blast-radius 65, supply-chain 55 (`ci_actions_unpinned_share` 1 although the actions are pinned to full SHAs — the verifier redacts the SHAs before its pin rule; `ci_provenance_step_missing` 1), security 30 (`redaction_hits_observed` 7), report: `/home/hungnguyenhuu/.easy-verifier-reports/T011/evidence-report-changes-20261031T105836-074597Z.html` |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: scoring step only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: scoring step only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: scoring step only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE** (captured 2026-10-31T08:32:12Z, branch hun-151-fake-stars at its starting commit, before any implementation commit):

```
2026-10-31T08:32:12Z
$ grep -rn "fake_star_flag|fakeStarFlag" packages apps (ts, sql; excluding node_modules, dist)
packages/core/src/types.ts:64:  fakeStarFlag: boolean;
packages/db/src/repository.ts:251:    `INSERT INTO repo_scores (repo_id, date, tier, score, components, consensus_count, fake_star_flag)
packages/db/src/repository.ts:252:     SELECT t.repo_id, t.date, t.tier, t.score, t.components::jsonb, t.consensus_count, t.fake_star_flag
packages/db/src/repository.ts:254:          AS t(repo_id, date, tier, score, components, consensus_count, fake_star_flag)
packages/db/src/repository.ts:257:       consensus_count = EXCLUDED.consensus_count, fake_star_flag = EXCLUDED.fake_star_flag`,
packages/db/src/repository.ts:265:      rows.map((r) => r.fakeStarFlag),
packages/db/src/repository.test.ts:340:        fakeStarFlag: false,
packages/db/src/repository.test.ts:343:      await upsertRepoScores(pool, [{ ...score, tier: "trending", score: 0.9, fakeStarFlag: true }]);
packages/db/src/repository.test.ts:348:      assert.equal(rows[0].fake_star_flag, true);
packages/db/src/scores.test.ts:38:  fake_star_flag: boolean;
packages/db/src/scores.test.ts:120:      assert.equal(row.fake_star_flag, false);
packages/db/src/api.ts:173:    fakeStarFlag: boolean;
packages/db/src/api.ts:196:      `SELECT s.date::text AS date, s.tier, s.score, s.components, s.fake_star_flag,
packages/db/src/api.ts:243:          fakeStarFlag: s.fake_star_flag,
packages/db/src/scores.ts:41: * interim until T010 (`components.interim = 1`). `consensus_count` and `fake_star_flag` are 0 / false until
packages/db/src/scores.ts:127:    fakeStarFlag: false,
packages/db/migrations/001_init.sql:65:  fake_star_flag   BOOLEAN NOT NULL DEFAULT FALSE,
apps/api/src/app.test.ts:95:      `INSERT INTO repo_scores (repo_id, date, tier, score, components, consensus_count, fake_star_flag) VALUES
apps/api/src/app.test.ts:256:      assert.equal(body.score.fakeStarFlag, false);
$ grep -rnE "sampleStargazers|applyFakeStarFlags|fakeStarConfig" packages apps | wc -l
0
$ TEST_DATABASE_URL=... pnpm test (counts)
packages/core test: ℹ tests 18
packages/core test: ℹ pass 18
packages/core test: ℹ fail 0
packages/core test: ℹ skipped 0
packages/connectors test: ℹ tests 81
packages/connectors test: ℹ pass 80
packages/connectors test: ℹ fail 0
packages/connectors test: ℹ skipped 1
packages/db test: ℹ tests 70
packages/db test: ℹ pass 70
packages/db test: ℹ fail 0
packages/db test: ℹ skipped 0
apps/api test: ℹ tests 15
apps/api test: ℹ pass 15
apps/api test: ℹ fail 0
apps/api test: ℹ skipped 0
apps/worker test: ℹ tests 24
apps/worker test: ℹ pass 24
apps/worker test: ℹ fail 0
apps/worker test: ℹ skipped 0
```

Reading: the only writers of `fake_star_flag` are `scoreDay` (hard-coded `false`, `scores.ts:127`) and the generic `upsertRepoScores`; no `sampleStargazers`, `applyFakeStarFlags` or `fakeStarConfig` exists (count 0). `pnpm typecheck` clean at the start.

**AFTER** (captured 2026-10-31T08:35:02Z on the implementation branch):

```
2026-10-31T08:35:02Z
$ grep -rnE "sampleStargazers|applyFakeStarFlags|fakeStarConfig" packages apps | wc -l
50
$ grep -rn "fake_star_flag = " packages/db/src/fake-stars.ts
54:       SET fake_star_flag = $3,
$ TEST_DATABASE_URL=... pnpm test (counts per package)
packages/core test: ℹ tests 26
packages/core test: ℹ pass 26
packages/core test: ℹ fail 0
packages/core test: ℹ skipped 0
packages/connectors test: ℹ tests 86
packages/connectors test: ℹ pass 85
packages/connectors test: ℹ fail 0
packages/connectors test: ℹ skipped 1
packages/db test: ℹ tests 81
packages/db test: ℹ pass 81
packages/db test: ℹ fail 0
packages/db test: ℹ skipped 0
apps/api test: ℹ tests 15
apps/api test: ℹ pass 15
apps/api test: ℹ fail 0
apps/api test: ℹ skipped 0
apps/worker test: ℹ tests 26
apps/worker test: ℹ pass 26
apps/worker test: ℹ fail 0
apps/worker test: ℹ skipped 0
$ pnpm typecheck
0
```

**DELTA**: After each daily scoring run the score job samples the newest 100 stargazers of every repo with a 50+ stars-an-hour burst, sets `repo_scores.fake_star_flag` when at least half are new or inactive accounts, and multiplies that repo's trending or lowkey score by the genuine share, without removing it from the list.

**WITNESS**: Supervisor session, 2026-10-31T08:36:59Z: reran `TEST_DATABASE_URL=… pnpm test` under T011 (exit 0, recorded in `memory/event-trace/T011.jsonl`) and read `packages/db/src/fake-stars.ts` and `packages/core/src/fake-stars.ts`.

### Rework R1

**BEFORE** (captured before any R1 implementation commit; the test is the R1.1 test, written red, in the working tree):

```
2026-10-31T10:53:35Z
$ (cd packages/connectors && timeout 20s tsx --conditions=source --test src/github-api.test.ts)  # never-resolving fetchImpl
  ✖ rejects within the timeout when fetch never resolves, naming the endpoint and not the token (2999.085162ms)
  ✖ passes an abort signal to fetch on every request (3.723437ms)
✖ GithubApiConnector request timeout (3002.990685ms)
✖ src/github-api.test.ts (19752.668575ms)
ℹ tests 37
ℹ pass 34
ℹ fail 1
ℹ cancelled 2
✖ failing tests:
✖ rejects within the timeout when fetch never resolves, naming the endpoint and not the token (2999.085162ms)
  'test timed out after 3000ms'
✖ passes an abort signal to fetch on every request (3.723437ms)
✖ src/github-api.test.ts (19752.668575ms)
  'Promise resolution is still pending but the event loop has already resolved'
exit=124
$ grep -n "fetch(\|catch" packages/connectors/src/github-api.ts apps/worker/src/handlers.ts
packages/connectors/src/github-api.ts:200: * `fetch(since)` yields nothing. The worker calls `fetchByIds` / `resolveNames` directly.
packages/connectors/src/github-api.ts:226:    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
packages/connectors/src/github-api.ts:233:  async *fetch(_since: Date): AsyncIterable<GithubRepoNode> {
packages/connectors/src/github-api.ts:395:    } catch (err) {
apps/worker/src/handlers.ts:84:        for await (const item of c.fetch(new Date(now.getTime() - DAY_MS))) {
apps/worker/src/handlers.ts:94:      } catch (err) {
apps/worker/src/handlers.ts:95:        await client.query("ROLLBACK").catch(() => {});
```

Reading: with a `fetchImpl` that never resolves, `sampleStargazers` never settles. The test times out at 3000 ms and the run is killed by `timeout 20s` (exit 124). The grep shows the default `fetchImpl` (line 226) and `post` (line 395 catch) carry no timeout, and the `ROLLBACK` failure at `handlers.ts:95` is swallowed by `.catch(() => {})`.

**AFTER** (same command, after the R1 implementation commits):

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
exit 
```

**DELTA**: Every GitHub API request now carries a 30 s timeout (`AbortSignal.timeout`, plus a race for a `fetchImpl` that ignores the signal). The never-resolving `fetchImpl` test went from timing out at 3000 ms and a killed run (exit 124) to a rejection after 50 ms naming the endpoint, with no token in the message. The `ROLLBACK` failure at `handlers.ts` is now logged at warn level (`level: "warn"`) before the original error is rethrown, and `packages/core/src/index.ts` and `packages/db/src/index.ts` have sibling `index.test.ts` files that call the T011 exports.
