# TASK_REVIEW — T022: Repo hygiene for wave-4 scores

> Sibling of `tasks/TASK_GUIDE_T022.md`. Everything here is **filled by the reviewer at Stage
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
1. LICENSE is MIT with copyright holder `thunderkds` (the repo's git author name) — RULE: user decision 2026-10-31 "approve all, MIT"; the holder name ⚠ decided for you — please review
2. Lint rules that existing code trips (no-explicit-any 12 hits, require-yield 4, preserve-caught-error 1, no-unused-expressions 1) are switched off in `eslint.config.js` with their hit counts, and no-unused-vars ignores args (10 hits), instead of editing other tasks' source — RULE: `tasks/TASK_GUIDE_T022.md` § Approach ("turn that rule off in the config with a one-line comment giving the hit count")
3. Root `package.json` gains `"type": "module"` so Node loads `eslint.config.js` as ESM without a MODULE_TYPELESS warning in every package — SAFER OPTION: matches every workspace package, which is already ESM ⚠ decided for you — please review
4. CI replaces the per-package build and dashboard typecheck steps with the root `pnpm typecheck`, which builds the packages and typechecks every workspace — FACT: package.json:11 "build && pnpm -r typecheck"
5. The easy-verifier score row stays fail at overall 61: the verifier redacts the pinned SHAs before its pin check, so pinning reads as unpinned; the run is binding and not rerun — RULE: `skills/score/SKILL.md` ("A run that happened is binding") ⚠ decided for you — please review
Checks: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` — core 18/18, connectors 80/81 (1 pre-existing skip), db 70/70, api 15/15, worker 24/24, root hygiene 5/5, exit 0; `pnpm lint` and `pnpm typecheck` exit 0; reviews code-review — P0 0, P1 0, P2 2 (root `package.json` `type` and `test` lines will conflict with T010's root changes on merge; dashboard `eslint .` is unproven on T017's 41 files), P3 0; lane check `EXCEEDS (files 13 > 6)`, mostly one-line `lint` scripts, label kept at C1; action SHAs checked with `git ls-remote` against `refs/tags/v4` (auto-checked, not /verify); easy-verifier score — overall 61, floor 80 missed (Companion score row)
Memory: memory/learnings.md — easy-verifier masks pinned action SHAs; pnpm -r skips the root (T022)
Not done: merge (yours); auto verify: ☑ pass (session 2d983b96-1833-47a2-bdce-aa3e524b4cfa, commit 87af0b2b4d7b70dca34bb2fd94159964d836758f, log .claude/verify-runs/T022-87af0b2b4d7b.log)
Closed: row moved to Done 2026-10-31 — auto verify pass (session 2d983b96-1833-47a2-bdce-aa3e524b4cfa, commit 87af0b2b4d7b70dca34bb2fd94159964d836758f); Gates 5 and 6 checked

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `scripts/repo-hygiene.test.ts` — LICENSE is MIT, `license` field, every `uses:` pinned to a 40-hex SHA, `--frozen-lockfile` + `permissions: contents: read` + `timeout-minutes`, CI runs lint/typecheck/test; `ℹ tests 5 ℹ pass 5 ℹ fail 0` under the root `pnpm test`; failed first against the old `ci.yml` (agent) |
| Verification command run | ☑ pass | `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && TEST_DATABASE_URL=… pnpm test` exit 0 (agent); Supervisor rerun under T022: `pnpm test` exit 0, `pnpm typecheck` exit 0 |
| Negative cases hold | ☑ pass | the hygiene tests fail on an unpinned `uses:` line, a missing `permissions:` block or a missing CI step (red run against the old `ci.yml`, agent) |
| verify | ☑ pass | auto-run by hook, session 2d983b96-1833-47a2-bdce-aa3e524b4cfa, commit 87af0b2b4d7b70dca34bb2fd94159964d836758f, log .claude/verify-runs/T022-87af0b2b4d7b.log — pass |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | 14 files of `4d7cd4c...HEAD`: config, manifests, lockfile, CI, one test; no `src` file changed |
| Full smoke suite still green (no regression) | ☑ pass | all package suites unchanged in count and green: core 18, connectors 80 + 1 skip, db 70, api 15, worker 24 |
| **Companion score (easy-verifier)** | ☑ fail | overall 61 (floor 80 missed), change_risk abstained (chore, confirmed: all metrics abstained, chore has no test expectation), scope changes, ref `4d7cd4c...HEAD`, abstentions: solution-fit, requirement-fidelity, code-quality, reliability, api, data, operations, infrastructure, gates: none offered, divergence: no findings sent, drags: supply-chain 55 (`ci_actions_unpinned_share` 1 although all three actions are pinned to full SHAs — the excerpt shows the SHAs redacted by `high_entropy_hex`, so the pin rule reads masked text; `ci_provenance_step_missing` 1), security 30 (`redaction_hits_observed` 137, including the three SHAs and lockfile hashes), blast-radius 46 (manifest churn), report: `/home/hungnguyenhuu/.easy-verifier-reports/T022/evidence-report-changes-20261031T104454-605068Z.html` |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI in this task |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI in this task |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI in this task |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**: captured 2026-10-31T10:39:30Z in the T022 worktree at commit 4d7cd4c, before any implementation commit:

```
$ ls LICENSE
ls: cannot access 'LICENSE': No such file or directory      (exit 2)
$ pnpm lint
> idea-radar@0.1.0 lint ... > pnpm -r lint
Scope: 6 of 7 workspace projects
None of the selected packages has a "lint" script          (exit 0: lint is a silent no-op)
$ grep -n "uses:\|pnpm install" .github/workflows/ci.yml
12:      - uses: actions/checkout@v4
13:      - uses: pnpm/action-setup@v4
14:      - uses: actions/setup-node@v4
19:      - run: pnpm install
```

**AFTER**: captured 2026-10-31T10:42:12Z (agent): `LICENSE` exists and starts `MIT License`; `pnpm lint` runs `eslint .` in all 6 packages plus the root `scripts/`, exit 0; `ci.yml` lines 16–18 read `uses: actions/checkout@11d5960a… # v4`, `pnpm/action-setup@b906affc… # v4`, `actions/setup-node@49933ea5… # v4`, line 22 `run: pnpm install --frozen-lockfile`

**DELTA**: no LICENSE → MIT LICENSE; `pnpm lint` from a silent no-op (no package had a `lint` script) to a real ESLint run, exit 0; CI actions from `@v4` tags to full commit SHAs, `pnpm install` to `--frozen-lockfile`, plus `permissions: contents: read`, `timeout-minutes: 15` and lint/typecheck/test steps

**WITNESS**: Supervisor session, 2026-10-31T10:44Z: reran `TEST_DATABASE_URL=… pnpm test` and `pnpm typecheck` under T022 (exit 0, recorded in `memory/event-trace/T022.jsonl`), read `.github/workflows/ci.yml`, `eslint.config.js`, `scripts/repo-hygiene.test.ts`, and checked the three SHAs with `git ls-remote`.
