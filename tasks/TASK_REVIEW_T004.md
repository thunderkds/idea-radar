# TASK_REVIEW — T004: HUN-146 GH Archive streaming + repo_daily rollup

> Sibling of `tasks/TASK_GUIDE_T004.md`. Everything here is **filled by the reviewer at Stage
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
Paused: auto-mode check failed — tasks/TASK_REVIEW_T004.md has no `## Auto decisions` section starting with `Mode: auto`; no `Memory:` line in the report — run the memory pass before you stop and record it there (each entry written, or `Memory: nothing new`); no test run in memory/event-trace/T004.jsonl — write /home/hungnguyenhuu/workspace/pets/hungnguyen111/idea-radar/.claude/hooks/.state/active_task.d/$CLAUDE_CODE_SESSION_ID with the task ID (minimal-track step 1): `mkdir -p /home/hungnguyenhuu/workspace/pets/hungnguyen111/idea-radar/.claude/hooks/.state/active_task.d && printf '%s\n%s\n' "T004" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /home/hungnguyenhuu/workspace/pets/hungnguyen111/idea-radar/.claude/hooks/.state/active_task.d/$CLAUDE_CODE_SESSION_ID`, then rerun the task's tests so the trace records them under the task, then stop; extended track, but the trace has no `code-review` Skill call (Stage 4 runs in auto mode)

## Auto decisions

Mode: auto
1. Unit of work is a completed UTC day with replace semantics — RULE: `memory/decisions.md` § "2026-10-31 — GH Archive ingests whole UTC days, not hours"
2. Backfill depth defaults to 1 day (`GHARCHIVE_BACKFILL_DAYS`) until the owner decides U2 — SAFER OPTION: smallest download; owner question U2 in `docs/analysis/2026-10-31-gaps.md` ⚠ decided for you — please review
3. Accepted the agent's choice to drop events whose `created_at` falls outside the ingested day (counted as `outOfDay`), so a late arrival cannot overwrite a neighbouring day's complete row — RULE: replace semantics in `tasks/TASK_GUIDE_T004.md` AC 6
4. Left the permanent-404 risk (a GH Archive hour that never appears stops ingestion at that day forever) for T007 to handle with a give-up rule — SAFER OPTION: AC 8 requires stopping on 404; changing it is a scheduler-policy choice ⚠ decided for you — please review
Checks: tests `pnpm --filter @idea-radar/connectors test` — 17/17 pass, 1 live smoke skipped; reviews code-review — P0 0, P1 0, P2 2 (permanent-404 hour stalls the cursor; a full day is CPU-heavy, ~23 s per 9.6M synthetic lines, so T007 must not run it under a short timeout), P3 1 (`.env.example` lacks `GHARCHIVE_BACKFILL_DAYS`); real run: none (live smoke needs `GHARCHIVE_LIVE=1` and a ~100 MB download) (auto-checked, not /verify)
Memory: nothing new
Not done: merge (yours); auto verify: ☑ pass (session 5c645216-38c8-4491-b0ee-ff3d637a43ef, commit ec6a85bda5e69eabd242c1ef3d12d1893ed75f29, log .claude/verify-runs/T004-ec6a85bda5e6.log)
Closed: row moved to Done 2026-10-31 — auto verify pass (session 5c645216-38c8-4491-b0ee-ff3d637a43ef, commit ec6a85bda5e69eabd242c1ef3d12d1893ed75f29); Gates 5 and 6 checked

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/connectors/src/gh-archive.test.ts` (17 unit tests, AC 1–10; 1 live smoke skipped without `GHARCHIVE_LIVE=1`) + fixture `packages/connectors/src/fixtures/gh-archive/events.ndjson`. Output: `ℹ tests 18 ℹ pass 17 ℹ fail 0 ℹ skipped 1` |
| Verification command run | ☑ pass | `pnpm --filter @idea-radar/connectors test` (see AFTER); agent: `pnpm typecheck` all workspaces pass |
| Negative cases hold | ☑ pass | corrupt gzip rejects; malformed lines counted, not thrown; 404 stops without advancing cursor; 500 throws |
| verify | ☑ pass | auto-run by hook, session 5c645216-38c8-4491-b0ee-ff3d637a43ef, commit ec6a85bda5e69eabd242c1ef3d12d1893ed75f29, log .claude/verify-runs/T004-ec6a85bda5e6.log — pass |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `gh-archive.ts`, its test and fixture, caller `packages/connectors/src/index.ts` (constructor unchanged). `lane: C2, 3 files, 656 lines, EXCEEDS (lines 656 > 500)` — 348 are tests; label kept at C2 |
| Full smoke suite still green (no regression) | ☑ pass | connectors suite 17/17 (+1 skip); agent memory check: synthetic 24 h × 300k lines (~2.4 GB) under `--max-old-space-size=48` finished OK |
| **Companion score (easy-verifier)** | ☑ N/A | not run: Risk Low |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: ingestion only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: ingestion only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: ingestion only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**: captured Sat Oct 31 05:37:45 AM UTC 2026, before any implementation commit.

```
$ date -u; pnpm --filter @idea-radar/connectors test; grep -n TODO packages/connectors/src/gh-archive.ts
Sat Oct 31 05:37:45 AM UTC 2026
> tsx --conditions=source --test "src/**/*.test.ts"
ℹ tests 0
ℹ suites 0
ℹ pass 0
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5.97834
40:    // TODO(HUN-146): for each hour since `since`, download
```

**AFTER**: Supervisor rerun, 2026-10-31 05:44 UTC:

```
$ pnpm --filter @idea-radar/connectors test
✔ rollup: fixture yields exact RepoDaily rows (split at UTC midnight, contributors, starsMaxHour)
✔ ingestDays: backfills each completed day after the cursor in order, then a rerun is a no-op
✔ ingestDays: 404 for an hour stops the run; that day is not written and the cursor does not advance past it
﹣ live: stream one real past hour # SKIP
ℹ tests 18
ℹ pass 17
ℹ fail 0
ℹ skipped 1
```

**DELTA**: The worker can now turn GH Archive hourly dumps into exact per-day `repo_daily` rows (including contributors and the busiest star hour) with bounded memory and idempotent reruns.

**WITNESS**: Supervisor session, 2026-10-31 05:44 UTC, T004 worktree (trace `memory/event-trace/T004.jsonl`).
