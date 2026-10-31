# TASK_REVIEW — T008: Shortlist enrichment

> Sibling of `tasks/TASK_GUIDE_T008.md`. Everything here is **filled by the reviewer at Stage
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
1. Folded the missing wiring (select candidates → fetch metadata → fetch content) into one daily `shortlist` job, because no job called `selectCandidates` or `fetchByIds` — RULE: `docs/ISSUES.md` § HUN-148 ("Shortlist = repos with any tier candidate signal in the last 7 days") plus gap A1 in `docs/analysis/2026-10-31-gaps.md`
2. Raised T008 from P2 to P1, because T009 can only score repos that have a `repos` row — FACT: `packages/db/src/scores.ts` doc comment "Only repos with a `repos` row … are scored" (T009 branch)
3. The shortlist reads the GH Archive cursor as its day (usually D−2 when it runs at 00:00 UTC), and T009 now ends score windows at the same cursor — SAFER OPTION: both jobs work on the last ingested day, not on a day with no data ⚠ decided for you — please review
4. Work is written every 200 repos, and `shortlist` gets a 6 h stuck-job timeout like `gh_archive` (a rate-limit pause can last an hour) — SAFER OPTION: a retry redoes only what is not fresh, and a live job is not reclaimed mid-pause ⚠ decided for you — please review
5. README = first present of 6 root names; files over the cap (README 100 KB, manifest 50 KB) are truncated, not dropped; NUL characters stripped — RULE: `tasks/TASK_GUIDE_T008.md` § Acceptance Criteria (AC 1 caps)
Checks: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` — core 6/6, connectors 66/67 (1 pre-existing live-GitHub skip), db 57/57, worker 24/24, exit 0; reviews code-review — P0 0, P1 0, P2 2 (live GraphQL content path unverified without a token, including a repo with no HEAD; repos GitHub cannot return are retried every day with no give-up mark), P3 1 (`FetchedRepoContent` duplicates db `RepoContent`; move it to core later); real run: none — needs a GitHub token (auto-checked, not /verify)
Memory: nothing new
Not done: merge (yours); auto verify: running (T182)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/connectors/src/github-api.test.ts` (8 new `fetchContent` tests: batching, caps, absent manifests, missing repo), `packages/connectors/src/stack-tags.test.ts`, `packages/db/src/content.test.ts`, `apps/worker/src/worker.test.ts` (6 shortlist tests incl. score waits for shortlist). connectors `ℹ tests 67 ℹ fail 0`, worker `ℹ tests 24 ℹ fail 0` |
| Verification command run | ☑ pass | `TEST_DATABASE_URL=… pnpm test` exit 0 (Supervisor rerun under T008); `pnpm typecheck` clean (agent) |
| Negative cases hold | ☑ pass | no cursor → skip; no token → select only, no `github_api` health row; invalid JSON/TOML manifests give no tags, never throw; missing repo listed in `missing` |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `github-api.ts`, `stack-tags.ts`, `content.ts`, `scoring.ts` (`contentMaxAgeDays`), worker handlers/index + tests. `lane: C2, 12 files, 894 lines, EXCEEDS (lines 894 > 500); unpredicted: apps/worker/src/index.ts, apps/worker/src/worker.test.ts, packages/connectors/src/github-api.test.ts, packages/connectors/src/stack-tags.test.ts, packages/db/src/content.test.ts, packages/db/src/index.ts` — about half is tests |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 |
| **Companion score (easy-verifier)** | ☑ N/A | not run in this session |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: worker job only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: worker job only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: worker job only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE** (captured 2026-10-31T07:43:32Z, branch `hun-148-shortlist`, before any implementation commit):

```
$ TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test    # per-package totals
packages/core:       tests 6   pass 6   fail 0 skipped 0
packages/connectors: tests 50  pass 49  fail 0 skipped 1
packages/db:         tests 54  pass 54  fail 0 skipped 0
apps/worker:         tests 18  pass 18  fail 0 skipped 0
$ grep -rniE "shortlist|fetchContent|stack-tags|deriveStackTags|contentMaxAgeDays" packages/*/src apps/worker/src
packages/db/src/repository.ts:13:/** README + manifests for a shortlisted repo (`repo_content`). */
```

No `shortlist` job, no `fetchContent`, no `deriveStackTags`, no `contentMaxAgeDays` exist: the only hit is a comment. `buildHandlers` registers only `resolve_pending`, the fetch connectors, `gh_archive` and the `score` placeholder.

**AFTER** (2026-10-31T07:46:55Z, same command, after the change):

```
packages/core:       tests 6   pass 6   fail 0 skipped 0
packages/connectors: tests 67  pass 66  fail 0 skipped 1   (+17: fetchContent 8, deriveStackTags 9)
packages/db:         tests 57  pass 57  fail 0 skipped 0   (+3: listCandidatesNeedingContent)
apps/worker:         tests 24  pass 24  fail 0 skipped 0   (+6: shortlist job)
pnpm typecheck: all 6 workspace projects Done
```

`buildHandlers` now registers `shortlist` (`SHORTLIST_JOB`); `GithubApiConnector.fetchContent` and `deriveStackTags` exist.

**DELTA**: The daily job now selects the day's candidates, fetches their metadata and README, manifests and file tree, and stores stack tags, so every candidate has a `repos` row and `repo_content` row before scoring.

**WITNESS**: Supervisor session, 2026-10-31T07:52:25Z: reran `TEST_DATABASE_URL=… pnpm test` under T008 (exit 0, recorded in `memory/event-trace/T008.jsonl`) and read the handler and query diff.
