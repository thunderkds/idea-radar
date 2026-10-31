# TASK_GUIDE — T017: HUN-157 Dashboard: tier tabs + repo detail
**Date**: 2026-10-31
**Complexity Level**: C2
**Risk Level**: Low
**Priority**: P1
**Assigned agent**: frontend-developer
**Agent guide**: `agents/frontend.md`
**Linear**: HUN-157

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md` (in particular § Dashboard Design System and § UI Evidence), the top of `AGENTS.md` (`# Working in this repo`), `docs/SPEC.md` § Dashboard views, `docs/ISSUES.md` § HUN-157.
2. Read `docs/design-system/project/README.md` in full, `docs/design-system/project/tokens.json`, `docs/design-system/project/components/bundle.css`.
3. Read the memory slice in your spawn prompt, then `memory/learnings.md`.
4. Read this file completely, then `agents/frontend.md`, `apps/api/src/app.ts` and `packages/db/src/api.ts` (the response shapes).

---

## Requirement (Pillar 1)

`docs/ISSUES.md` § HUN-157 (verbatim):
- Lowkey is the default tab. List shows name, description, language, stars, 7-day stars, score, consensus badges, fake-star warning.
- Repo detail: star history chart from `repo_daily`, score breakdown, consensus timeline, README excerpt, stack tags.

`docs/SPEC.md` § Dashboard views: "Tier tabs — Trending / Medium / Lowkey lists; filters for language, topic, OSS Insight collection, date window"; "Repo detail — Star history (own data; Star History embed optional), score breakdown, source-consensus timeline, README excerpt, detected stack". "the lowkey tab is the default landing view."

`PROJECT_SPEC.md` § Dashboard Design System: Graphite Mint; one `tokens.css` generated from `tokens.json`; dark only; IBM Plex via `@fontsource`; neon only for the README's listed highlights; "no data" in `--text-dim`, never 0; 56px top bar, 232px sidebar, drawer below 1024px, one column below 720px.

API (merged T016; T015 adds fields in parallel): `GET /tiers/:tier?language&topic&collection&window&limit&cursor` → `{tier, date, items:[{repoId, fullName, description, language, topics, stars, score, starsGained, components, stackTags, consensusCount?, fakeStarFlag?}], nextCursor}`; `GET /repos/:id` → `{repo, score:{date, tier, score, components, consensusCount, fakeStarFlag}|null, starsSeries:[{date, starsNew}], stackTags, readmeExcerpt, signals, timeline?:[{source, firstSeenAt, lastSeenAt}]}`. Fields marked `?` arrive with T015: render them when present, render "no data" when absent.

**Restated intent**
> A developer opens the dashboard on the Lowkey tab, switches tiers, filters, pages, and opens any repo to see its star history, score breakdown, source timeline, README excerpt and stack — all in Graphite Mint, readable at phone, tablet and desktop widths.

**Out of scope**
- Rising topics, consensus and ops pages (T018). Auth. Light theme. Star History embed.

### Requirement Fidelity Gate
- [x] Restated intent confirmed — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T016 — read-only API; T015 (parallel) — `consensusCount`, `fakeStarFlag`, `timeline`
**Entry point**: `TierPage`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `/` shows the Lowkey tier; tabs link to `/tiers/trending`, `/tiers/medium`, `/tiers/lowkey`; the active tab is the sidebar/tab neon item | default tab |
| 2 | Each row shows name (link to `/repos/:id`), description, language, stars, 7-day stars (`starsGained`, `window=7d`), score, a consensus badge (count, when present) and a fake-star warning (`warn` + the word "suspicious stars", when `fakeStarFlag`) | list fields |
| 3 | Filters `language`, `topic`, `collection`, `window` live in the URL query and round-trip to the API; a "next page" link uses `nextCursor`; API 400 errors show the API's message | filters |
| 4 | `/repos/:id`: star history chart (inline SVG from `starsSeries`, current bar neon, others `neon-bar`), score breakdown table of `components`, timeline of sources (or "no data"), README excerpt as plain text (never `dangerouslySetInnerHTML`), stack tags | repo detail |
| 5 | `apps/dashboard/app/tokens.css` is generated from `tokens.json` by `apps/dashboard/scripts/gen-tokens.ts` (checked in, re-runnable); components use only `var(--…)` — a test greps `apps/dashboard/app` for hex colours outside `tokens.css` and fails on any | design system |
| 6 | Fonts from `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`; no network font requests | design system |
| 7 | Shell: 56px top bar, 232px sidebar; sidebar becomes a drawer below 1024px; one column below 720px; no horizontal page scroll at 375, 768 and 1280px | responsiveness |
| 8 | API base from `API_URL` (server side, default `http://localhost:4000`); data fetched in server components; API down → a visible "API unreachable" state, not a crash | robustness |
| 9 | `pnpm --filter @idea-radar/dashboard test` runs real unit tests (node:test + tsx, like other packages): number/date formatting, "no data" rendering, URL query building, the hex-colour check; `pnpm typecheck` and `pnpm --filter @idea-radar/dashboard build` pass | tests |
| 10 | The three UI Evidence rows are recorded with the easy-ui MCP container (see Approach) | Hard-Stop Gate 6 |

---

## Evaluation & Acceptance

### Verification Command

```bash
pnpm test && pnpm typecheck && pnpm --filter @idea-radar/dashboard build
```

### UI evidence (easy-ui)

The easy-ui container serves MCP on `http://127.0.0.1:8765/mcp`, on the host network, so it reaches `localhost` ports. Its MCP tools are not loaded in agent sessions; call it with the repo script `python3 -I scripts/easy_ui.py batch steps.json` (list tools: `python3 -I scripts/easy_ui.py list`). One batch file = one browser session: `ui_start_session`, `ui_navigate`, `ui_wait_for`, `ui_assert` / `ui_check` (JS in the page), `ui_take_screenshot`, `ui_end_session` (prints the JSON + HTML report paths under `/app/reports`, which is `/home/hungnguyenhuu/workspace/pets/hungnguyen111/easy-ui-mcp/reports` on the host).

- **Visual regression:** screenshots of `/`, `/tiers/trending` and one `/repos/:id`, plus `ui_assert`s that the rows, badges, warning and chart render. Paste the report path and verdict.
- **Design-system compliance:** `ui_assert` on computed styles: body background equals token `bg`, body text colour equals `text`, `font-family` starts with IBM Plex Sans, mono cells use IBM Plex Mono, top bar height 56px, sidebar width 232px. Add the hex-colour grep test result.
- **Responsiveness:** the browser viewport is fixed, so measure inside same-origin iframes. One `ui_assert` creates an `iframe` of width 375, 768 and 1280 loading the page, waits for load, and checks `contentDocument.documentElement.scrollWidth <= width`, the sidebar drawer state below 1024 and one column below 720.

Run the API and dashboard on free ports (e.g. API `API_PORT=4417`, dashboard `next dev -p 3417` with `API_URL=http://localhost:4417`) against a temp database seeded by `apps/dashboard/scripts/seed-demo.ts`, which writes a few repos per tier, a hidden `trendshift` source, signals and 90 days of `repo_daily` to a `DATABASE_URL` you pass. Use `postgres://radar:radar@localhost:5436/…`; create your own database `dash_t017` and drop it at the end.

---

## Approach

**Pattern reference**: `apps/dashboard/app/page.tsx` (server component fetch); `docs/design-system/project/components/bundle.css` (`gm-*` classes — reuse them, copied into the app's CSS with tokens as variables).
**Vital slice**: tier list page with real rows in Graphite Mint + repo detail with the star chart.
**Cut list**: client-side charts library, sorting controls, infinite scroll, light theme.

- Keep Next.js app router and server components. Add only `@fontsource/*` deps (commit `pnpm-lock.yaml`).
- Do not copy hex values anywhere except the generated `tokens.css`.
- Missing values ("no data") are `--text-dim`, never `0`.

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `apps/dashboard/app/**` | layout, shell, tier page, repo page, components, `tokens.css`, `globals.css` |
| `apps/dashboard/lib/**` | API client, formatting, query helpers + tests |
| `apps/dashboard/scripts/gen-tokens.ts`, `seed-demo.ts` | new |
| `apps/dashboard/package.json`, `pnpm-lock.yaml` | fonts, test script |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `apps/api/**`, `packages/**`, `apps/worker/**` | T010, T011, T015 in parallel — report needed API changes instead |
| `docs/design-system/**` | owner's design-system snapshot |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration and Evidence UI rows), `agents/`, `skills/` | Supervisor-owned |

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] UI evidence recorded (three rows)
- [ ] Supervisor notified: ready for Stage 4 review

---

## Rework R1 (2026-10-31): easy-verifier score fixes

User decision 2026-10-31 (chat, verbatim): "approve all, MIT" — fix the score gaps and rescore. The Companion score row in `tasks/TASK_REVIEW_T017.md` reads ☑ fail: overall 75, `new_code_without_test_share` 0.46 (unpaired: nine page components, `scripts/gen-tokens.ts`, `scripts/seed-demo.ts`); auto verify fail: the branch lacked T015's API fields, so the timeline always read "no data" and no badge or warning showed. The floor is overall ≥ 80 and no failing `change_risk` rule. The branch already carries T022 (LICENSE, lint, CI) by merge before this rework starts.

Rule `new_code_without_test_share` must be ≤ 0.2: it counts source files changed on this branch (`b0dfcf3...HEAD`) with no paired `*.test.ts` changed beside them. Pair a file by adding or extending its sibling test with real assertions on its behaviour. Never add an empty or trivially true test just to pair a file.

| # | Criterion (testable) |
|---|----------------------|
| R1.1 | The Supervisor merges `hun-155-consensus` into this branch before the rework starts; the list then shows the consensus badge and fake-star warning, and `/repos/:id` shows the timeline, against the seeded demo database; re-record the easy-ui sessions and assert the badge, the warning and at least one timeline row |
| R1.2 | Unit tests (node:test + tsx, `react-dom/server` `renderToStaticMarkup` or the existing test approach) for each page component the verifier lists as unpaired: rendered output for a normal item, a missing value ("no data", never 0) and the empty state |
| R1.3 | `scripts/gen-tokens.test.ts` (output of the generator for a small token object, and the checked-in `tokens.css` equals a fresh run) and `scripts/seed-demo.test.ts` (seed into a temp database, skips without `TEST_DATABASE_URL`; tier rows, a hidden `trendshift` source, 90 days of `repo_daily`) |
| R1.4 | The two paths the verify run could not confirm: an API 5xx shows a visible error state, not a crash; an API 400 shows the API's own message. Cover both with unit tests and one easy-ui session each |

Startup addition: call easy-memory `memory_search` first for this task's topics; the pasted memory slice is the fallback. Keep `pnpm lint`, `pnpm typecheck` and the guide's Verification Command green. Stay inside the guide's Files Must NOT Touch list, except the files this section names.
