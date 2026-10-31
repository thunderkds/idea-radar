# TASK_REVIEW — T005: HUN-147 GitHub Trending page scraper

> Sibling of `tasks/TASK_GUIDE_T005.md`. Everything here is **filled by the reviewer at Stage
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
1. Wave 1 runs T002–T005 in parallel from `wave1-base` (T001 + updated guides), in Supervisor-made worktrees — RULE: `docs/claude-md/tracks.md` `## Auto mode` row 12 (Supervisor's own breakdown)
2. No HTML parser dependency; regex parsing accepted because it parses the real fixture (15 rows) — RULE: `tasks/TASK_GUIDE_T005.md` § Approach cut list ("HTML parser library unless regex/string parsing proves unreliable")
3. Approved the agent's tdd plan as matching the guide — RULE: `docs/claude-md/tracks.md` `## Auto mode` row 15
4. Left the two P2 review findings (rank counts parsed rows only; one non-200 page aborts the rest of the run) for T007's retry design rather than fixing now — SAFER OPTION: both are behaviour choices the scheduler task owns ⚠ decided for you — please review
Checks: tests `pnpm --filter @idea-radar/connectors test` — 7/7 pass (Supervisor rerun 05:38 UTC); reviews code-review — P0 0, P1 0, P2 2 (rank = parsed-row position, so a skipped row shifts later ranks; one non-200 aborts all remaining language × period pages), P3 0; real run: fixture saved from one live `curl` of github.com/trending (HTTP 200, 15 rows) (auto-checked, not /verify)
Memory: nothing new
Not done: merge (yours); auto verify: ☑ pass (session 69e6caea-9bd0-4d38-b6fd-bf91bb849567, commit 905b237dfff5c4fd32bd3064667ad65a0513a083, log .claude/verify-runs/T005-905b237dfff5.log)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/connectors/src/github-trending.test.ts` (7 tests, AC 1–5). Supervisor rerun 05:38:29 UTC: `ℹ tests 7 ℹ pass 7 ℹ fail 0` |
| Verification command run | ☑ pass | `pnpm --filter @idea-radar/connectors test` → 7/7 pass; agent: `pnpm typecheck` 0 errors |
| Negative cases hold | ☑ pass | `✔ throws TrendingParseError on a page with no repo rows`; `✔ fetch throws with URL and status on a non-200 response` |
| verify | ☑ pass | auto-run by hook, session 69e6caea-9bd0-4d38-b6fd-bf91bb849567, commit 905b237dfff5c4fd32bd3064667ad65a0513a083, log .claude/verify-runs/T005-905b237dfff5.log — pass |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `github-trending.ts`, its test, fixture, caller `packages/connectors/src/index.ts` (constructor still compatible). `lane: C1, 3 files, 3912 lines, EXCEEDS (lines 3912 > 250)` — 3,751 of those lines are the saved HTML fixture; label kept at C1 |
| Full smoke suite still green (no regression) | ☑ pass | connectors suite 7/7; no other package touched |
| **Companion score (easy-verifier)** | ☑ N/A | not run: Risk Low, single-connector change |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: scraper only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: scraper only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: scraper only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**:
```
$ date -u; pnpm --filter @idea-radar/connectors test; grep -n TODO packages/connectors/src/github-trending.ts
Sat Oct 31 05:37:18 AM UTC 2026
> @idea-radar/connectors@0.1.0 test /home/hungnguyenhuu/workspace/pets/hungnguyen111/idea-radar/.claude/worktrees/T005/packages/connectors
> tsx --conditions=source --test "src/**/*.test.ts"
ℹ tests 0
ℹ suites 0
ℹ pass 0
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6.415124
31:    // TODO(HUN-147): GET https://github.com/trending/{language}?since={period},
```

**AFTER**:
```
$ pnpm --filter @idea-radar/connectors test   (7 tests, 7 pass, 0 fail; TODO(HUN-147) removed from github-trending.ts)
✔ parses the saved daily fixture
✔ throws TrendingParseError on a page with no repo rows
✔ fetch iterates languages x periods in order and yields all entries
✔ fetch throws with URL and status on a non-200 response
```

**DELTA**: The Trending connector now fetches every language x period page and yields ranked entries, and fails loudly when nothing parses.

**WITNESS**: Supervisor session reran `pnpm --filter @idea-radar/connectors test` in the T005 worktree at 2026-10-31 05:38:29 UTC (7/7 pass; trace `memory/event-trace/T005.jsonl`).
