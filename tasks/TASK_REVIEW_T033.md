# TASK_REVIEW — T033: [Short Title]

> Sibling of `tasks/TASK_GUIDE_T033.md`. Everything here is **filled by the reviewer at Stage
> 4/5** — it is deliberately NOT in the guide, because the implementing agent re-reads the guide on
> every turn and never fills these two sections.
>
> Consumers resolve each section **guide first, this file second** (`.claude/hooks/lib/guide_sections.py`):
> a legacy guide that still carries these sections inline keeps working unchanged, and a stray
> review file can never override an inline section.

---

## Auto decisions

Mode: auto
1. Fixed the P2 (integration tests `DROP TABLE` with no host guard) by adding a loopback-host guard that throws, instead of leaving it as a suggestion — DEBATED: throwing loopback-host guard, no escape hatch (Advocate 1: guard with a throwing hostname allowlist plus a `host=` rejection and an optional opt-in env var; Advocate 2: guard on the parsed hostname, reject `host=`/`hostaddr=`, throw rather than skip; Advocate 3: the smallest safe thing, a ~5-line throwing hostname check in `db.test.ts`) ⚠ decided for you — please review. Applied by backend-developer in commit `9922af3`; the escape hatch and the temp-schema variant were left out as the larger change.
2. Ran the test, lint and typecheck steps through their binaries (`tsx`, `eslint`, `tsc`) because `pnpm` is not on this shell's PATH — FACT: `packages/db/package.json:19` "tsx --conditions=source --test"
3. Moved the T033 board row to Ready for Review on `main` only, because the branch carries a stale board copy that still shows T033 in Todo — FACT: `PROJECT_KANBAN.md:14` "- [ ] **T033** — Postgres store for ideas (packages/db) | backend-developer | C2 | Risk: High | P0" (in this worktree)
4. Marked the Companion score row N/A because the easy-verifier connection timed out — RULE: `templates/TASK_REVIEW_template.md:56` "the merge gate blocks on ☑ fail only, never on an absent or N/A row"
5. Did not run `/verify` (user-only); left it to the auto verify step — RULE: `docs/claude-md/tracks.md` `### Auto close-out`
Checks: tests `TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres pnpm test` — 89 pass, 0 fail (ideas 25, mcp 36, db 23, scripts 5); lint `eslint .` exit 0; typecheck `tsc -p tsconfig.json --noEmit` exit 0; reviews code-review — no P0/P1 (P2 x1 fixed in 9922af3, P3 x2), security-review — no findings; real run `tsx --test` with `TEST_DATABASE_URL=postgres://u:secret@prod.example.com/db` — db suite threw `host "prod.example.com" is not loopback` before any connection, password not printed (auto-checked, not /verify)
Memory: nothing new
Not done: merge (admin: after the auto verify pass); auto verify: ☑ pass (session 478e4108-2047-4082-9b8d-febdabc09b42, commit 850ac13968d6bced4174efe967a5ee5d66ba144f, log .claude/verify-runs/T033-850ac13968d6.log)
Paused: auto-mode check failed — no test run in memory/event-trace/T033.jsonl — write /home/thunderkds/workspace/pets/idea-radar/.claude/hooks/.state/active_task.d/$CLAUDE_CODE_SESSION_ID with the task ID (minimal-track step 1): `mkdir -p /home/thunderkds/workspace/pets/idea-radar/.claude/hooks/.state/active_task.d && printf '%s\n%s\n' "T033" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /home/thunderkds/workspace/pets/idea-radar/.claude/hooks/.state/active_task.d/$CLAUDE_CODE_SESSION_ID`, then rerun the task's tests so the trace records them under the task, then stop; Risk High: decision 2 (`FACT`) is a choice — its FACT has no Citation (`path:line "quoted text"`) — so it must be `DEBATED` with exactly 3 Advocates named; Risk High: decision 3 (`SAFER OPTION`) is a choice — it is flagged ⚠ — so it must be `DEBATED` with exactly 3 Advocates named; Risk High: decision 4 (`SAFER OPTION`) is a choice — it is flagged ⚠ — so it must be `DEBATED` with exactly 3 Advocates named; Risk High, but no decision was DEBATED with 3 Advocates [report 79ca84830d24]
Paused: done not moved — Gate 5: no test run in memory/event-trace/T033.jsonl

## Notes for T034 (from the auto verify run, `.claude/verify-runs/T033-850ac13968d6.log`)

- `searchIdeas` with a NUL byte in the query throws the raw Postgres error `invalid byte sequence ... 0x00`; the MCP search tool must strip or catch it.
- An invalid `since`/`until` date makes `listIdeas` raise a raw Postgres `invalid input syntax for type date` error; validate dates before calling.
- `listIdeas` matches tags lowercased only, which is safe through `validateIdeaFile` (it rejects uppercase tags) but not for a caller that skips validation.
- Not exercised: the CI `postgres:16` service and a real Railway Postgres (PGlite only).

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/db/src/db.test.ts` (AC 1–6, 8: migrate, merge rule, idempotence, rollback, concurrency, logRejected, reads, 10k timings), `packages/db/src/util.test.ts` (escapeLike, clampLimit, validDateOrNull). AC 7 (parameters only) is by code reading plus the `'; DROP TABLE ideas; --` search test. |
| Verification command run | ☑ pass | Re-run 2026-11-10T14:40Z by the Supervisor, PGlite server on :55432: `tsx --test` 20 tests, pass 20, fail 0 (then 23/23 after the loopback guard in `9922af3`, re-run by the Supervisor 2026-11-10T14:5xZ); `eslint .` exit 0; `tsc --noEmit` exit 0; `scripts/**/*.test.ts` 5/5 (ci.yml pins intact). 10k timings: list 9.9 ms, tag 3.9 ms, search 7.5 ms and 2.1 ms, get 0.8 ms. (pnpm is not installed here, so the binaries behind the scripts were called directly.) |
| Negative cases hold | ☑ pass | Mutation: `git diff --stat` showed `packages/db/src/save.ts | 16 ++++++++--------` after changing the merge rule `>=` to `>`; tests: pass 19, fail 1, `✖ the same date replaces: the later submission wins`. File restored with `git checkout`; tree clean. |
| verify | ☑ pass | auto-run by hook, session 478e4108-2047-4082-9b8d-febdabc09b42, commit 850ac13968d6bced4174efe967a5ee5d66ba144f, log .claude/verify-runs/T033-850ac13968d6.log — pass; done not moved: Gate 5: no test run in memory/event-trace/T033.jsonl |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | Reviewed the 12 changed files of the new `packages/db` plus the ci.yml service and the repo-hygiene pin tests. No existing callers (T034 is the first consumer), so nothing else was read. code-review: no P0/P1, P2 ×1 (test `DROP TABLE` has no host guard; fixed in `9922af3` after a 3-Advocate Debate), P3 ×2; lane_check warn-only `EXCEEDS (lines 688 > 500)`, 312 lines are tests. security-review: no findings. Reports: `reports/code-review_t033-postgres-store_20261110T214038.html`, `reports/security-review_t033-postgres-store_20261110T214038.html`. |
| Full smoke suite still green (no regression) | ☑ pass | `pnpm test` at the repo root, 2026-11-10T15:05Z, PGlite on :55432: packages/ideas 25/25, apps/mcp 36/36, packages/db 23/23, scripts 5/5 = 89 pass, 0 fail; `pnpm lint` and `pnpm typecheck` finished with no errors. |
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
