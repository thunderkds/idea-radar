# TASK_REVIEW — T033: [Short Title]

> Sibling of `tasks/TASK_GUIDE_T033.md`. Everything here is **filled by the reviewer at Stage
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
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/db/src/db.test.ts` (AC 1–6, 8: migrate, merge rule, idempotence, rollback, concurrency, logRejected, reads, 10k timings), `packages/db/src/util.test.ts` (escapeLike, clampLimit, validDateOrNull). AC 7 (parameters only) is by code reading plus the `'; DROP TABLE ideas; --` search test. |
| Verification command run | ☑ pass | Re-run 2026-11-10T14:40Z by the Supervisor, PGlite server on :55432: `tsx --test` 20 tests, pass 20, fail 0; `eslint .` exit 0; `tsc --noEmit` exit 0; `scripts/**/*.test.ts` 5/5 (ci.yml pins intact). 10k timings: list 9.9 ms, tag 3.9 ms, search 7.5 ms and 2.1 ms, get 0.8 ms. (pnpm is not installed here, so the binaries behind the scripts were called directly.) |
| Negative cases hold | ☑ pass | Mutation: `git diff --stat` showed `packages/db/src/save.ts | 16 ++++++++--------` after changing the merge rule `>=` to `>`; tests: pass 19, fail 1, `✖ the same date replaces: the later submission wins`. File restored with `git checkout`; tree clean. |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | Reviewed the 12 changed files of the new `packages/db` plus the ci.yml service and the repo-hygiene pin tests. No existing callers (T034 is the first consumer), so nothing else was read. code-review: no P0/P1, P2 ×1 (test `DROP TABLE` has no host guard, not applied), P3 ×2; lane_check warn-only `EXCEEDS (lines 688 > 500)`, 312 lines are tests. security-review: no findings. Reports: `reports/code-review_t033-postgres-store_20261110T214038.html`, `reports/security-review_t033-postgres-store_20261110T214038.html`. |
| Full smoke suite still green (no regression) | ☑ pass | Same run as above: db 20/20, `scripts/**` 5/5, lint and typecheck exit 0. |
| **Companion score (easy-verifier)** | ☑ N/A | easy-verifier failed to connect in this session (CONNECT_TIMEOUT), so no score was run. |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | not a UI task (packages/db has no screens) |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | not a UI task (packages/db has no screens) |
| **UI: Responsiveness at target viewports** | ☑ N/A | not a UI task (packages/db has no screens) |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE** (captured 2026-11-10T14:28:07Z, before any implementation commit; `packages/db` does not exist, `ls packages` prints only `ideas`):

```
$ TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres pnpm --filter @idea-radar/db test
No projects matched the filters in "/home/thunderkds/workspace/pets/idea-radar/.claude/worktrees/T033"
```

**AFTER** (2026-11-10T14:33:33Z, PGlite wire server on :55432):

```
$ TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres pnpm --filter @idea-radar/db test && pnpm lint && pnpm typecheck
  ✔ migrate twice: tables exist, the second run applies nothing
  ✔ a newer date replaces content and keeps first_seen
  ✔ an older date only widens first_seen; content stays
  ✔ the same date replaces: the later submission wins
  ✔ sending the same submission twice leaves ideas identical, adds a run row
  ✔ a failure mid-transaction writes no idea rows and no run row
  ... (20 tests, 0 fail; lint and typecheck exit 0)
  [10k] list (limit 50): 7.5 ms   [10k] list (tag t7): 3.3 ms   [10k] search 'quartz': 4.6 ms
  [10k] search 'item 9999': 1.7 ms   [10k] get idea-5000: 0.6 ms
```

**DELTA**: The app can now save a validated submission to Postgres in one transaction (newer date wins, `first_seen`/`last_seen` kept, re-sending changes nothing) and read ideas back by list, search and id in under 10 ms at 10,000 ideas.

**WITNESS**: `memory/event-trace/T033.jsonl` (29 events, 2026-11-10T14:27:50Z onward, hash chain head `94dc20d5247f94c935e620d91f990854ce5bfcc47b4efef583a8eb1a1edb7e53`) records the backend-developer agent's run to its ready-for-review message; the Supervisor session then re-ran the verification command itself at 2026-11-10T14:40Z (20/20, lint and typecheck exit 0) and ran the `>=` to `>` mutation (1 test red).
