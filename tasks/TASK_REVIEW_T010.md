# TASK_REVIEW — T010: Lowkey score components

> Sibling of `tasks/TASK_GUIDE_T010.md`. Everything here is **filled by the reviewer at Stage
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
1. `issueResponsiveness` is stored as 0 with `issueResponsivenessKnown: 0`, because no source has issue-reply data yet — RULE: `tasks/TASK_GUIDE_T010.md` § Requirement (Out of scope: "store `0` plus `issueResponsivenessKnown: 0`")
2. Starting normalisation constants (full lift 5x baseline, 30 events, 5 contributors, README 1500 chars and 5 headings; no prior history = 0.5), untuned until the owner labels — SAFER OPTION: every constant lives in `lowkeyNormalisation` for tuning ⚠ decided for you — please review
3. The contributors component is stored as `contributorsScore`, because T009 already stores the raw count under `contributors` — SAFER OPTION: keeps T009's key meaning stable for the API and dashboard ⚠ decided for you — please review
4. Root `package.json` gets `"type": "module"` so `pnpm label` / `pnpm precision` can use top-level await — SAFER OPTION: no root JS config files exist, so nothing else changes ⚠ decided for you — please review
5. Rework R1 moves the script logic of `scripts/label.ts` and `scripts/precision.ts` into exported functions behind an entry-point guard, so they can be unit-tested; behaviour unchanged — RULE: `tasks/TASK_GUIDE_T010.md` § Rework R1 (R1.2: "move logic out of the `main` body into exported functions if needed, behaviour unchanged")
Checks: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` — core 37/37, connectors 80/81 (1 pre-existing skip), db 79/79, api 15/15, worker 24/24, exit 0; reviews code-review — P0 0, P1 0, P2 1 (constants untuned; precision@50 needs the owner's labels), P3 1 (scripts sit outside `pnpm typecheck`; checked by hand); real run `pnpm label` then `pnpm precision` on a seeded temp schema — printed a CSV and a precision@50 line (agent run, output in AFTER) (auto-checked, not /verify); easy-verifier score — overall 63, floor 80 missed (Companion score row); Rework R1: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` — core 38/38, connectors 80/81 (1 pre-existing skip), db 80/80, api 15/15, worker 24/24, root scripts 21/21, exit 0; `pnpm lint` exit 0; code-review — P0 0, P1 0, P2 0, P3 0 (lane FITS; unpredicted files are the R1 tests); easy-verifier rescore — not scored: the tool errored twice (Companion score row)
Memory: memory/learnings.md — easy-verifier score crash on top_level_import_cycles (Rework R1)
Not done: merge (yours); auto verify: running (T182)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/core/src/lowkey.test.ts` (each component at 0, its full point, above, missing input; README fixtures good, bare, headings only), `packages/db/src/scores.test.ts` (lowkey score = weighted sum, trending/medium unchanged), `packages/db/src/tuning.test.ts` (spawns `pnpm label` and `pnpm precision` on a temp schema). core `ℹ tests 37 ℹ fail 0`, db `ℹ tests 79 ℹ fail 0`; Rework R1: `scripts/cli-args.test.ts`, `scripts/label.test.ts`, `scripts/precision.test.ts`, `packages/core/src/index.test.ts`, `packages/db/src/index.test.ts` (root scripts `ℹ tests 21 ℹ fail 0`) |
| Verification command run | ☑ pass | `TEST_DATABASE_URL=… pnpm test` exit 0 (Supervisor rerun under T010); `pnpm typecheck` clean (agent) |
| Negative cases hold | ☑ pass | empty README → 0; flat velocity → 0; values clamp at 1; an unknown label value throws; no labels → precision prints n/a |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | core `lowkey.ts` + config, db `scores.ts` lowkey branch and `tuning.ts`, two scripts, root `package.json`. `lane: C2, 13 files, 861 lines, EXCEEDS (lines 861 > 500)` — mostly tests |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 |
| **Companion score (easy-verifier)** | ☑ N/A | Rework R1 rescore not scored: MCP `score` (scope changes, ref `b0dfcf3...HEAD`) failed twice with the tool error `metric 'top_level_import_cycles' (code-quality) reports a value but cites no evidence`; CLI rung: `easy_verifier` not importable; stopped at rung 3. Last binding run before R1: overall 63 (floor 80 missed), `new_code_without_test_share` 0.56 failed, report: `/home/hungnguyenhuu/.easy-verifier-reports/T010/evidence-report-changes-20261031T084800-425955Z.html` |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: scoring only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: scoring only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: scoring only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**: captured 2026-10-31T08:31:31Z..08:32:01Z, before any implementation commit (HEAD b0dfcf3).

```
$ TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test
packages/core test: ℹ tests 18 / pass 18 / fail 0
packages/connectors test: ℹ tests 81 / pass 80 / fail 0 / skipped 1
packages/db test: ℹ tests 70 / pass 70 / fail 0
apps/api test: ℹ tests 15 / pass 15 / fail 0
apps/worker test: ℹ tests 24 / pass 24 / fail 0

$ grep -n "interim" packages/db/src/scores.ts packages/db/src/scores.test.ts
packages/db/src/scores.ts:41: * interim until T010 (`components.interim = 1`). ...
packages/db/src/scores.ts:118:  if (tier === "lowkey") components.interim = 1;
packages/db/src/scores.ts:131:/** ... lowkey is the interim formula until T010. */
packages/db/src/scores.test.ts:151:    it("lowkey: interim score = 7-day stars / (prior daily rate * 7 + 1), flagged interim (AC 4, 6)", ...
packages/db/src/scores.test.ts:161:        daysSincePush: 0, interim: 1,

$ ls packages/core/src/lowkey.ts scripts/label.ts
ls: cannot access 'packages/core/src/lowkey.ts': No such file or directory
ls: cannot access 'scripts/label.ts': No such file or directory
$ grep -n '"label"\|"precision"' package.json    (no output)
```

**AFTER**: captured 2026-10-31T08:35:54Z..08:36:01Z on the implementation.

```
$ TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test
packages/core test: tests 37 / pass 37 / fail 0
packages/connectors test: tests 81 / pass 80 / fail 0 / skipped 1
packages/db test: tests 79 / pass 79 / fail 0
apps/api test: tests 15 / pass 15 / fail 0
apps/worker test: tests 24 / pass 24 / fail 0
$ pnpm typecheck    -> all packages "Done", no errors

# temp schema with 6 demo repos, scoreDay for 2026-10-31 (lowkey row, repo 5):
score 0.6906, components: velocityLift 1, activity 0.566667, contributorsScore 0.6, readmeQuality 0.7264,
  issueResponsiveness 0, issueResponsivenessKnown 0, pushes30d 15, prsOpened30d 1, issuesOpened30d 1   (no "interim")

$ pnpm label -- --date 2026-10-31 --out labels.csv --limit 4 --top 2
wrote 4 lowkey rows of 2026-10-31 to labels.csv
repo_id,full_name,score,url,label
5,demo/repo5,0.6906,https://github.com/demo/repo5,
...
$ pnpm precision -- --date 2026-10-31 --labels labels.csv --k 3     (3 of 4 rows hand-filled)
precision@3 = 0.667 (2 good of 3 labelled)
labelled 3 of the 3 top-scored lowkey rows of 2026-10-31
```

**DELTA**: lowkey rows now carry the SPEC's weighted score with its five 0..1 components stored, and the owner can run `pnpm label` to export a sheet to label and `pnpm precision` to get precision@50 of the ranking.

**WITNESS**: Supervisor session, 2026-10-31T08:38:05Z: reran `TEST_DATABASE_URL=… pnpm test` under T010 (exit 0, recorded in `memory/event-trace/T010.jsonl`) and read `packages/core/src/lowkey.ts`.

### Rework R1

**BEFORE**: captured 2026-10-31T10:52:47Z, before any R1 implementation commit (HEAD 6ae4919).

```
$ ls scripts/*.test.ts packages/core/src/index.test.ts packages/db/src/index.test.ts
ls: cannot access 'packages/core/src/index.test.ts': No such file or directory
ls: cannot access 'packages/db/src/index.test.ts': No such file or directory
scripts/repo-hygiene.test.ts
$ grep '"test"' package.json
    "test": "pnpm -r test && tsx --test scripts/repo-hygiene.test.ts",
```

**AFTER**: captured 2026-10-31T10:54:45Z on the R1 change.

```
$ ls scripts/*.test.ts packages/core/src/index.test.ts packages/db/src/index.test.ts
packages/core/src/index.test.ts
packages/db/src/index.test.ts
scripts/cli-args.test.ts
scripts/label.test.ts
scripts/precision.test.ts
scripts/repo-hygiene.test.ts
$ grep '"test"' package.json
    "test": "pnpm -r test && tsx --conditions=source --test \"scripts/**/*.test.ts\"",
$ TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test
packages/core test: tests 38 / pass 38 / fail 0
packages/connectors test: tests 81 / pass 80 / fail 0 / skipped 1
packages/db test: tests 80 / pass 80 / fail 0
apps/api test: tests 15 / pass 15 / fail 0
apps/worker test: tests 24 / pass 24 / fail 0
scripts (root run): tests 21 / pass 21 / fail 0   (cli-args 6, label 4, precision 6, repo-hygiene 5)
```

**DELTA**: the five files the easy-verifier listed as unpaired now each have a sibling test, and the root `pnpm test` runs every `scripts/*.test.ts` file (21 tests, was 5).

