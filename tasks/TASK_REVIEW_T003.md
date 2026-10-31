# TASK_REVIEW — T003: HUN-145 GitHub API connector

> Sibling of `tasks/TASK_GUIDE_T003.md`. Everything here is **filled by the reviewer at Stage
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
Paused: auto-mode check failed — tasks/TASK_REVIEW_T003.md has no `## Auto decisions` section starting with `Mode: auto`; no `Memory:` line in the report — run the memory pass before you stop and record it there (each entry written, or `Memory: nothing new`); no test run in memory/event-trace/T003.jsonl — write /home/hungnguyenhuu/workspace/pets/hungnguyen111/idea-radar/.claude/hooks/.state/active_task.d/$CLAUDE_CODE_SESSION_ID with the task ID (minimal-track step 1): `mkdir -p /home/hungnguyenhuu/workspace/pets/hungnguyen111/idea-radar/.claude/hooks/.state/active_task.d && printf '%s\n%s\n' "T003" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /home/hungnguyenhuu/workspace/pets/hungnguyen111/idea-radar/.claude/hooks/.state/active_task.d/$CLAUDE_CODE_SESSION_ID`, then rerun the task's tests so the trace records them under the task, then stop; extended track, but the trace has no `code-review` Skill call (Stage 4 runs in auto mode); Risk Medium, but the trace has no `security-review` Skill call

## Auto decisions

Mode: auto
1. `normalize()` returns `[]` and metadata goes to `repos` via `toRepo()`, overriding AC 4's "returns the expected Signal" — RULE: `tasks/TASK_GUIDE_T003.md` § Acceptance Criteria AC 9 (later, gap-driven criterion wins over the scaffold behaviour)
2. No Octokit; global `fetch` with injectable `fetchImpl` — RULE: `tasks/TASK_GUIDE_T003.md` § Approach ("no Octokit dependency")
3. Retry-After / secondary-limit backoff and a cross-process budget left out — RULE: `tasks/TASK_GUIDE_T003.md` § Approach cut list ("persistent / cross-process rate-limit budget (T007, gap A6)")
4. Approved the agent's tdd plan as matching the guide — RULE: `docs/claude-md/tracks.md` `## Auto mode` row 15
Checks: tests `pnpm --filter @idea-radar/connectors test` — 21/21 pass, integration test skipped (no `GITHUB_TOKEN`); reviews code-review — P0 0, P1 0, P2 3 (legacy node-id encoding `base64("010:Repository<id>")` unverified against the real API — run the guarded integration test once with a token before T007; one failed batch rejects the whole `fetchByIds` call; a 403 secondary-limit throws without honouring `Retry-After`), security-review — no findings ≥ 8/10 (names passed as GraphQL variables, aliases from batch index only, token only in the Authorization header and redacted from errors, endpoint fixed in production); real run: none possible without a token (auto-checked, not /verify)
Memory: nothing new
Not done: merge (yours); auto verify: running (T182); one real-API run with `GITHUB_TOKEN` (yours)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/connectors/src/github-api.test.ts` (21 unit tests, AC 1–6, 8–11; AC 7 integration test present, skipped without `GITHUB_TOKEN`). Output: `ℹ tests 21 ℹ pass 21 ℹ fail 0` |
| Verification command run | ☑ pass | `pnpm --filter @idea-radar/connectors test` → 21/21; agent: `pnpm typecheck` 6/6 workspaces Done |
| Negative cases hold | ☑ pass | 401/403/500/502, GraphQL `errors[]` and network errors throw without the token; no-token call throws before any request; invalid names go to `notFound` |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `github-api.ts`, its test and fixture, caller `packages/connectors/src/index.ts:24` (constructor unchanged). `lane: C2, 3 files, 595 lines, EXCEEDS (lines 595 > 500)` — tests are ~300 of those lines; label kept at C2 |
| Full smoke suite still green (no regression) | ☑ pass | connectors suite 21/21; no other package touched |
| **Companion score (easy-verifier)** | ☑ N/A | not run in this session; offered for the merge decision |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: connector only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: connector only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: connector only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**: captured 2026-10-31 05:37:18 UTC, before any implementation commit:

```
$ date -u; pnpm --filter @idea-radar/connectors test; grep -n TODO packages/connectors/src/github-api.ts
Sat Oct 31 05:37:18 AM UTC 2026
> tsx --conditions=source --test "src/**/*.test.ts"
ℹ tests 0
ℹ suites 0
ℹ pass 0
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
36:    // TODO(HUN-145): batch repo IDs from the candidate shortlist into GraphQL
```

**AFTER**: Supervisor rerun, 2026-10-31 05:39:24 UTC and again after review:

```
$ pnpm --filter @idea-radar/connectors test
﹣ integration (real GitHub) # SKIP        <- GITHUB_TOKEN not set
ℹ tests 21
ℹ pass 21
ℹ fail 0
```

**DELTA**: The worker can now fetch canonical repo metadata by numeric id or `owner/name` in batches of 100, within the GitHub rate budget, without leaking the token.

**WITNESS**: Supervisor session, 2026-10-31 05:39 UTC, T003 worktree (trace `memory/event-trace/T003.jsonl`).
