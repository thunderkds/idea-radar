# TASK_REVIEW — T017: Dashboard tier tabs and repo detail

> Sibling of `tasks/TASK_GUIDE_T017.md`. Everything here is **filled by the reviewer at Stage
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
1. Graphite Mint applied from the repo snapshot: one generated `tokens.css`, IBM Plex via `@fontsource`, 56px top bar and 232px sidebar, "no data" in `--text-dim` — RULE: `PROJECT_SPEC.md` § Dashboard Design System
2. UI evidence recorded with the easy-ui container through `scripts/easy_ui.py` (its MCP tools are not loaded in this session); responsiveness measured in same-origin iframes at 375, 768 and 1280px because the browser viewport is fixed — SAFER OPTION: same container and same report files the MCP tools would produce ⚠ decided for you — please review
3. The visual evidence ran against T015's API (branch hun-155-consensus), so the consensus badge, fake-star warning and timeline render with real fields; on T017's own API they show "no data" — SAFER OPTION: T015 merges in the same wave; the optional fields degrade to "no data" ⚠ decided for you — please review
4. The consensus badge is hidden when the count is 0 or missing, instead of a "no data" chip on every row — SAFER OPTION: less noise; the detail page still shows "no data" ⚠ decided for you — please review
5. Rework R1: `hun-155-consensus` (with T022) is merged into this branch, so the dashboard runs on T015's API fields; the demo seed writes signals 1 to 3 days back so they fall inside the consensus window, which ends at 00:00Z of the score date — FACT: tasks/TASK_GUIDE_T017.md:31 "Fields marked `?` arrive with T015"
Checks: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` — dashboard 54/54 (was none), core 18/18, connectors 80/81 (1 pre-existing skip), db 70/70, api 15/15, worker 24/24, exit 0; `pnpm --filter @idea-radar/dashboard build` exit 0; reviews code-review — P0 0, P1 0, P2 2 (41 files and 2906 lines exceed the C2 lane, so the task was under-labelled; nine page components and two scripts have no unit test and are covered only by the easy-ui sessions), P3 0; easy-ui sessions visual, design-system, responsiveness, interaction and API-down all `passed` ; easy-verifier score — overall 75, floor 80 missed (Companion score row) (auto-checked, not /verify); Rework R1: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` — dashboard 140/140 (was 54), core 18/18, connectors 80/81 (1 pre-existing skip), db 78/78, api 23/23, worker 24/24, root hygiene 5/5, exit 0; `pnpm --filter @idea-radar/dashboard lint` and build exit 0 (agent); code-review — P0 0, P1 0, P2 2 (lane `EXCEEDS (files 30 > 14; lines 1178 > 500)`, mostly tests; root `pnpm lint` fails on this branch only on T015's pre-rework `packages/db/src/api.ts`, fixed on T015's branch), P3 0; easy-ui sessions after-count, visual, design-system, responsiveness, interaction, API-down, API 400 and API 5xx all `passed` (agent); easy-verifier rescore — overall 77, floor 80 missed (Companion score row)
Memory: memory/learnings.md — easy-verifier masks pinned action SHAs (T022); score crash and reopened-task reset (Rework R1) — cited for the remaining drags
Not done: merge (yours); auto verify: running (T182)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `apps/dashboard/lib/{format,query,chart,api}.test.ts`, `apps/dashboard/app/_components/{repo-row,detail}.test.tsx`, `apps/dashboard/test/design-system.test.ts` (tokens.css in sync, no colour literals, no remote fonts, no raw HTML). dashboard `ℹ tests 54 ℹ fail 0`; Rework R1: a sibling test for every page component under `apps/dashboard/app` (`_components/{filter-form,no-data,notice,repo-detail,shell,tier-page,tier-tabs,star-chart,score-breakdown,timeline}.test.tsx`, `layout`, `not-found`, `page`, `tiers/[tier]/page`, `repos/[id]/page`), API 500/502/400/down cases in `tier-page.test.tsx` and `repo-detail.test.tsx`, `scripts/gen-tokens.test.ts`, `scripts/seed-demo.test.ts`; dashboard `ℹ tests 140 ℹ fail 0` |
| Verification command run | ☑ pass | `TEST_DATABASE_URL=… pnpm test` exit 0, `pnpm typecheck` exit 0, `pnpm --filter @idea-radar/dashboard build` exit 0 (Supervisor rerun under T017) |
| Negative cases hold | ☑ pass | API 400 message shown; API down shows "API unreachable" (easy-ui session `…084909-t017-robustness…` passed); unknown tier and repo show not-found; a temporary `#abc` in app CSS made the colour test fail (agent) |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `apps/dashboard/**` and `pnpm-lock.yaml` only. `lane: C2, 41 files, 2906 lines, EXCEEDS (files 41 > 14; lines 2906 > 500)` — under-labelled; a C3 UI task |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 |
| **Companion score (easy-verifier)** | ☑ fail | Rework R1 rescore: overall 77 (floor 80 missed; was 75), change_risk abstained (feature, confirmed; `below_coverage_floor`: the diff passed the 200000-character ceiling after the T015 and T022 merges, so no rule failed), scope changes, ref `b0dfcf3...HEAD`, abstentions: solution-fit, requirement-fidelity, api, operations, infrastructure, gates: code-quality offered (borderline CCN) and left abstained — no kit-held evidence, divergence: no findings sent, ratings: architecture, blast-radius and code-quality 100, test-strategy 90 (was 75), data 62 and reliability 50 (both from the pre-rework T015 code merged in: no 005 rollback, swallowed error in `apps/worker/src/handlers.ts`; fixed on T015's and T011's branches), security 59, supply-chain 55 (pinned SHAs read as unpinned after redaction), report: `/home/hungnguyenhuu/.easy-verifier-reports/T017/evidence-report-changes-20261031T110425-912609Z.html` |
| **UI: Visual regression (diff or verdict pasted)** | ☑ pass | R1 re-record, 2026-10-31T11:01Z: easy-ui session verdict `passed` (production build via `next start -p 3448`, API on 4418 with the merged T015 fields, seeded database `dash_t017` reseeded by the fixed `seed-demo.ts`). Asserts: `/` is Lowkey with 50 rows, active tab and sidebar item Lowkey, tabs link to the 3 tier paths; row 1 has the name link `/repos/1001`, description, language, stars, `7d stars +43`, score `0.812` and the badge `consensus 2`; row `quiet-owl/star-farm` shows `suspicious stars`; row `nobody/undocumented` shows 2 `no data`; `/tiers/trending` has 2 rows; `/repos/1001` has 90 chart bars (1 neon current, 89 neon-bar), 5 score components, timeline `ossinsight,github_trending`, README as inert text, stack chips; `trendshift` text appears nowhere. Report: `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/session-20261031-110113-t017-visual-regression-tier-lists-and-re-e985167c.html`. Screenshots: `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444473343.png` (/), `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444473426.png` (/tiers/trending), `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444473509.png` (/repos/1001), `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444473570.png` (/repos/1002 fake-star notice), `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444473636.png` (/repos/1003 no data). Step file: `apps/dashboard/test/ui/visual-regression.json`. Same build, extra sessions, all `passed`: interaction (filters, topic, collection, next page by cursor, API 400 message, not-found) `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/session-20261031-110103-t017-interaction-filters-round-trip-to-t-195f62f0.html`; API unreachable (dashboard on 3449 with a dead API_URL) `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/session-20261031-110104-t017-robustness-api-unreachable-shows-a-0b51873f.html`; **R1.4 API 400** (`/tiers/lowkey?window=90d` shows `The API rejected these filters` and the API's own `window: must be 7d or 30d`; `/repos/abc` shows `id: must be a numeric repo id`) `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/session-20261031-110104-t017-r1-robustness-api-400-shows-the-api-50664ebd.html`, screenshots `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444464639.png`, `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444464697.png`; **R1.4 API 5xx** (dashboard on 3450 against a stub that answers 500 `{"error":"database is down"}`: tier list and repo detail show an alert `The API returned an error` with the message, tabs and sidebar still render, no crash) `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/session-20261031-110104-t017-r1-robustness-api-5xx-shows-a-visib-f7482ef8.html`, screenshots `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444464973.png`, `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444465044.png`. Step files `interaction.json`, `api-down.json`, `api-400.json`, `api-5xx.json`. |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ pass | R1 re-record, 2026-10-31T11:01Z: easy-ui session verdict `passed`, report `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/session-20261031-110100-t017-design-system-compliance-graphite-m-492f15ec.html`, screenshots `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444461106.png`, `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444461186.png`. Same computed-style asserts as before (each token compared to a probe using `var(--token)`): body background = `bg`, text = `text`, active sidebar item = `neon`, repo link = `accent`, no-data = `text-dim`, warning = `warn`, list border = `line`, current chart bar = `neon`, other bars = `neon-bar`; body font `"IBM Plex Sans"`, stats and repo names `"IBM Plex Mono"`, both families `loaded`, every request same-origin with a `.woff2`; top bar 56px, sidebar 232px; dark colour scheme; no box-shadow on list, filters, ordinary tabs; at most 6 neon elements. Hex-colour check: `apps/dashboard/test/design-system.test.ts` finds no colour literal in `apps/dashboard/app` (the new `*.test.tsx` files there included) and `tokens.css` equals the generator output; `scripts/gen-tokens.test.ts` repeats the equality. `pnpm --filter @idea-radar/dashboard test`: 140 pass, 0 fail. Step file: `apps/dashboard/test/ui/design-system.json`. |
| **UI: Responsiveness at target viewports** | ☑ pass | R1 re-record, 2026-10-31T11:01Z: easy-ui session verdict `passed`, report `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/session-20261031-110101-t017-responsiveness-375-768-and-1280px-v-eab4a77f.html`. Same-origin iframes of width 375, 768 and 1280 load `/`, `/tiers/trending` and `/repos/1004` (very long name): `documentElement.scrollWidth <= width` for all 9 combinations. Below 1024 the sidebar is hidden off-screen, the Menu button shows `aria-expanded=false`; Menu opens a 232px full-height drawer (`aria-expanded=true`), Escape closes it. At 1280: no Menu button, sidebar 232px, top bar 56px, 2 shell columns. At 375: one column, stat strip 2 columns, controls at least 44px high; at 768 rows keep 2 columns. Screenshots: `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444461597.png`, `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444461845.png`, `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444462112.png`, `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444462253.png`, `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444462496.png`, `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444462768.png`, `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793444462913.png`. Step file: `apps/dashboard/test/ui/responsiveness.json`. |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**: [pasted timestamped command output showing the thing absent/failing, captured before the
first implementation commit] OR [verbatim excerpt of the prior content, for non-executable changes]

**AFTER**: captured 2026-10-31T08:49Z to 08:50Z on branch `hun-157-dashboard-tiers`.
- `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test`: exit 0; `apps/dashboard test: tests 54, pass 54, fail 0` (was `no tests yet`); core 18, connectors 80 pass and 1 skipped, db 70, api 15, worker 24, all pass.
- `pnpm typecheck`: exit 0. `pnpm --filter @idea-radar/dashboard build` (08:50:03Z): exit 0; routes `/`, `/repos/[id]`, `/tiers/[tier]`, all dynamic (server-rendered on demand), First Load JS 106 kB.
- easy-ui sessions on `/`, `/tiers/trending`, `/repos/:id` with the seeded database: see the three UI rows above (all `passed`); first screenshot of the new `/`: `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793436538676.png`.

**DELTA**: A developer can open the dashboard on the Lowkey tab, switch to Medium or Trending, filter by language, topic, collection and window, page through results, and open a repo to see its star history, score breakdown, source timeline, README excerpt and stack in Graphite Mint at phone, tablet and desktop widths.

**WITNESS**: Supervisor session, 2026-10-31T08:52:38Z: reran `TEST_DATABASE_URL=… pnpm test` and the dashboard build under T017 (exit 0, recorded in `memory/event-trace/T017.jsonl`), confirmed the five easy-ui session reports say `passed`, and viewed screenshot `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793436538676.png`.

### Rework R1

**BEFORE** (captured 2026-10-31T10:55Z, HEAD `7a73f18` = T017 + merged T015 API fields + T022, before any R1 change; API `API_PORT=4418`, `next start -p 3448`, database `dash_t017` on 5436 seeded by the unchanged `seed-demo.ts`; step file generated from the expectations below). The `ui_assert`s state the target: exactly 2 consensus badges (`consensus 1`, `consensus 2`) and 1 fake-star warning on the Lowkey list, 2 timeline rows on `/repos/1001`. The badge assert fails: the seed writes its signals at `now()`, outside the API's consensus window (it ends at 00:00Z of the score date), so `consensus 2` never shows (the API says `consensusCount: 1` for repo 1001). The other two hold.

```
BEFORE captured 2026-10-31T10:55:55Z (HEAD 7a73f18, no R1 change yet; dashboard :3448, API :4418, DB dash_t017)
[ui_start_session] Session 22870c3d-e060-4874-a99d-76539822c6f9 started for target "T017 R1 BEFORE: consensus badges, fake-star warnings and timeline rows"
[ui_navigate] Navigated to http://localhost:3448/ (title: "Idea Radar")
[ui_wait_for] Condition held after 11ms
[ui_step] Step: Count consensus badges, fake-star warnings on the Lowkey list
[ui_check] Check evaluated false (session not failed)
[ui_assert] Assertion failed
[ui_assert] Assertion passed
[ui_navigate] Navigated to http://localhost:3448/repos/1001 (title: "Idea Radar")
[ui_wait_for] Condition held after 1ms
[ui_step] Step: Count timeline rows on /repos/1001
[ui_assert] Assertion passed
[ui_end_session] Session 22870c3d-e060-4874-a99d-76539822c6f9 ended (failed). Reports: /app/reports/session-20261031-105555-t017-r1-before-consensus-badges-fake-sta-22870c3d.json, /app/reports/session-20261031-105555-t017-r1-before-consensus-badges-fake-sta-22870c3d.html

dashboard lint (2026-10-31T10:55:56Z):

> @idea-radar/dashboard@0.1.0 lint /home/hungnguyenhuu/workspace/pets/hungnguyen111/idea-radar/.claude/worktrees/T017/apps/dashboard
> eslint .

lint exit 0
```

**AFTER** (captured 2026-10-31T11:00Z, HEAD `7de13ec` plus the step-file port edits; same command (`python3 -I scripts/easy_ui.py batch`), same ports, database `dash_t017` reseeded with the fixed seed). Session passed; the badge assert, the warning assert and the timeline assert all pass; the `ui_check` that failed in BEFORE now passes. Report: `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/session-20261031-110059-t017-r1-after-consensus-badges-fake-star-c382fc32.html`.

```
AFTER captured 2026-10-31T11:00:59Z (HEAD 7de13ec + uncommitted step-file port edits; dashboard :3448, API :4418, DB dash_t017 reseeded)
[ui_start_session] Session c382fc32-ffee-4c8a-84d5-f0c8f44978c3 started for target "T017 R1 AFTER: consensus badges, fake-star warnings and timeline rows"
[ui_navigate] Navigated to http://localhost:3448/ (title: "Idea Radar")
[ui_wait_for] Condition held after 12ms
[ui_step] Step: Count consensus badges, fake-star warnings on the Lowkey list
[ui_check] Check passed
[ui_assert] Assertion passed
[ui_assert] Assertion passed
[ui_navigate] Navigated to http://localhost:3448/repos/1001 (title: "Idea Radar")
[ui_wait_for] Condition held after 2ms
[ui_step] Step: Count timeline rows on /repos/1001
[ui_assert] Assertion passed
[ui_end_session] Session c382fc32-ffee-4c8a-84d5-f0c8f44978c3 ended (passed). Reports: /app/reports/session-20261031-110059-t017-r1-after-consensus-badges-fake-star-c382fc32.json, /app/reports/session-20261031-110059-t017-r1-after-consensus-badges-fake-star-c382fc32.html
```

`pnpm --filter @idea-radar/dashboard lint` (2026-10-31T11:01:22Z): exit 0, no findings. Verification (same run): `pnpm typecheck` exit 0 (dashboard, api, worker, db, connectors, core); `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` exit 0 (dashboard 140 pass, 0 fail, 0 skipped, was 54; core 18, connectors 80 pass and 1 skipped, db 78, api 23, worker 24, repo hygiene 5); `pnpm --filter @idea-radar/dashboard build` (11:01:58Z) exit 0, First Load JS 106 kB.

**DELTA**: dashboard tests 54 to 140; all 16 files under `apps/dashboard/app`, both scripts and `lib/tokens-css.ts` and `lib/types.ts` now have a same-name sibling test. The seeded demo database now yields `consensus 2` for repo 1001 (the BEFORE failure: seed signals sat outside the API's consensus window). The API 5xx and API 400 paths each have unit tests and an easy-ui session. Lint is unchanged at exit 0.
