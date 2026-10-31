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
Checks: tests `TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test` — dashboard 54/54 (was none), core 18/18, connectors 80/81 (1 pre-existing skip), db 70/70, api 15/15, worker 24/24, exit 0; `pnpm --filter @idea-radar/dashboard build` exit 0; reviews code-review — P0 0, P1 0, P2 2 (41 files and 2906 lines exceed the C2 lane, so the task was under-labelled; nine page components and two scripts have no unit test and are covered only by the easy-ui sessions), P3 0; easy-ui sessions visual, design-system, responsiveness, interaction and API-down all `passed` ; easy-verifier score — overall 75, floor 80 missed (Companion score row) (auto-checked, not /verify)
Memory: memory/learnings.md — kit gotchas from wave 4 (report helper, verify close-out)
Not done: merge (yours); auto verify: ☑ pass (session 5b78968f-8193-4089-a394-9e0f9c1434a1, commit 474eda2cdea92a0cc14f7a61a5d7def6f6db70b2, log .claude/verify-runs/T017-474eda2cdea9.log)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `apps/dashboard/lib/{format,query,chart,api}.test.ts`, `apps/dashboard/app/_components/{repo-row,detail}.test.tsx`, `apps/dashboard/test/design-system.test.ts` (tokens.css in sync, no colour literals, no remote fonts, no raw HTML). dashboard `ℹ tests 54 ℹ fail 0` |
| Verification command run | ☑ pass | `TEST_DATABASE_URL=… pnpm test` exit 0, `pnpm typecheck` exit 0, `pnpm --filter @idea-radar/dashboard build` exit 0 (Supervisor rerun under T017) |
| Negative cases hold | ☑ pass | API 400 message shown; API down shows "API unreachable" (easy-ui session `…084909-t017-robustness…` passed); unknown tier and repo show not-found; a temporary `#abc` in app CSS made the colour test fail (agent) |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `apps/dashboard/**` and `pnpm-lock.yaml` only. `lane: C2, 41 files, 2906 lines, EXCEEDS (files 41 > 14; lines 2906 > 500)` — under-labelled; a C3 UI task |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 |
| **Companion score (easy-verifier)** | ☑ fail | overall 75 (floor 80 missed), change_risk 0 (feature, confirmed; rule `new_code_without_test_share` failed: 0.46 > 0.2, unpaired: 9 page components and `scripts/gen-tokens.ts`, `scripts/seed-demo.ts`), scope changes, ref `b0dfcf3...HEAD`, abstentions: solution-fit, requirement-fidelity, api, data, operations, infrastructure, gates: none offered, divergence: no findings sent, task-specific: architecture, blast-radius, code-quality and reliability all 100, test-strategy 75; repo-wide drags: supply-chain 20, security 30 (redaction hits across the repo), report: `/home/hungnguyenhuu/.easy-verifier-reports/T017/evidence-report-changes-20261031T085213-702042Z.html` |
| **UI: Visual regression (diff or verdict pasted)** | ☑ pass | easy-ui session verdict `passed` (production build via `next start -p 3417`, API from commit dd94de1 of branch hun-155-consensus on port 4417, seeded database `dash_t017`, 2026-10-31T08:48Z). Asserts: `/` is Lowkey with 50 rows, the active tab and sidebar item are Lowkey, tabs link to the 3 tier paths; row 1 has the name link `/repos/1001`, description, language, stars, `7d stars +43`, score `0.812` and the badge `consensus 2`; row `quiet-owl/star-farm` shows `suspicious stars`; row `nobody/undocumented` shows 2 `no data`; `/tiers/trending` has 2 rows; `/repos/1001` has 90 chart bars (1 neon current, 89 neon-bar), 5 score components, timeline `ossinsight,github_trending`, README as inert text (`window.__pwned` undefined), stack chips; `trendshift` text appears nowhere. Report: `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/session-20261031-084858-t017-visual-regression-tier-lists-and-re-2f5eb778.html`. Screenshots: `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793436538676.png` (/), `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793436538779.png` (/tiers/trending), `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793436538887.png` (/repos/1001), `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793436538962.png` (/repos/1002 fake-star notice), `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793436539029.png` (/repos/1003 no data). Step file: `apps/dashboard/test/ui/visual-regression.json`. Extra sessions, same build: interaction (language and window filters, topic, collection, next page by cursor, API 400 message, not-found) `passed`, report `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/session-20261031-084901-t017-interaction-filters-round-trip-to-t-8cae1e4b.html`; API down shows `API unreachable` `passed`, report `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/session-20261031-084909-t017-robustness-api-unreachable-shows-a-1a47b41f.html` (steps `interaction.json`, `api-down.json`). |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ pass | easy-ui session verdict `passed`, report `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/session-20261031-084859-t017-design-system-compliance-graphite-m-8646e82f.html`, screenshots `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793436539402.png`, `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793436539487.png`. Computed-style asserts (each token compared to a probe element using the `var(--token)`): body background = `bg`, body text = `text`, active sidebar item = `neon`, repo link = `accent`, no-data = `text-dim`, warning = `warn`, list border = `line`, current chart bar fill = `neon`, other bars = `neon-bar`; body font-family starts with `"IBM Plex Sans"`, stats cells and repo names `"IBM Plex Mono"`; both Plex families `loaded` in `document.fonts`; every resource request is same-origin and a `.woff2` is among them (no network font); top bar height 56px, sidebar width 232px; color-scheme dark; no box-shadow on list, filters, ordinary tabs; at most 6 neon elements on the screen. Hex-colour check: unit test `apps/dashboard/test/design-system.test.ts` finds no hex, rgb or hsl literal in `apps/dashboard/app` outside `tokens.css`, and `tokens.css` equals the output of `scripts/gen-tokens.ts` (`pnpm --filter @idea-radar/dashboard test`: 54 pass, 0 fail). Step file: `apps/dashboard/test/ui/design-system.json`. |
| **UI: Responsiveness at target viewports** | ☑ pass | easy-ui session verdict `passed`, report `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/session-20261031-084859-t017-responsiveness-375-768-and-1280px-v-53aedc38.html`. Same-origin iframes of width 375, 768 and 1280 load `/`, `/tiers/trending` and `/repos/1004` (a repo with a very long name): `documentElement.scrollWidth <= width` for all 9 combinations, no horizontal page scroll. Below 1024 (375, 768): sidebar is `visibility: hidden` and off-screen, Menu button visible with `aria-expanded=false`; clicking Menu opens the drawer (232px wide, full height, active item Lowkey, `aria-expanded=true`), Escape closes it. At 1280: no Menu button, sidebar 232px visible, top bar 56px, 2 shell columns. At 375: rows, filters are one column, stat strip 2 columns, tabs, inputs, selects and buttons at least 44px high. At 768: rows keep 2 columns. Screenshots: `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793436539935.png`, `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793436540178.png` (375 before and after opening the drawer), `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793436540429.png`, `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793436540573.png` (768), `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793436540813.png`, `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793436541079.png`, `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports/screenshot-1793436541221.png`. Step file: `apps/dashboard/test/ui/responsiveness.json`. |

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
