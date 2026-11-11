# TASK_GUIDE — T039: Dashboard UX redesign (search-first list with bucket sections, readable idea page)
**Date**: 2026-11-11
**Complexity Level**: C2
**Risk Level**: Medium
**Priority**: P1
**Assigned agent**: frontend-developer
**Agent guide**: `agents/frontend.md`

> Read relevant files from `docs/legacy/` before making any code changes. (This project has no `docs/legacy/`; the equivalents are `PROJECT_SPEC.md`, `memory/codebase-map.md`, `docs/design-system/project/README.md` and the `## Addendum 2026-11-11 — T039` block at the end of `BRAINSTORMING_LOG.md`.)

---

## Mandatory Startup (Do Not Skip)

Before writing any code:
1. Read `PROJECT_SPEC.md`
2. Read the memory slice in your spawn prompt. Read `memory/MEMORY.md` in full only if your work reaches a file, hook, skill or decision the slice does not cover
3. Read this file completely
4. Read `agents/frontend.md`
5. Note the **Complexity Level** above and apply the matching process from the Complexity matrix in `agents/frontend.md`
6. Read `memory/codebase-map.md` for layout

Also read `apps/mcp/src/html.ts`, `apps/mcp/src/dashboard.ts`, `apps/mcp/src/html.test.ts`, `apps/mcp/src/dashboard.test.ts`, `docs/design-system/project/README.md` and `tokens.json`, and the memory entries *Dashboard: stateless HMAC cookie, CSP style hash* and *Dashboard CSP/CSRF/verify gotchas*.

---

## Requirement (Pillar 1 — Adapt the requirement)

User (2026-11-11): "for the UI, should investigate and update for best UX, the current implementation is bad". After an audit with screenshots at 375px and 1280px the user chose the layout **Search-first + bucket sections** (mockup in the addendum).

**Audit findings the redesign must fix** (before-screenshots: `/tmp/claude-1000/-home-thunderkds-workspace-pets-idea-radar/6cf2955e-5d6c-4f86-a37b-36dc6cf61fca/scratchpad/before/*.png`, regenerate with the same method if gone):
1. The filter form (4 fields + button) sits above the content; on mobile it fills most of the first screen.
2. `since`/`until` are free-text boxes expecting `YYYY-MM-DD`.
3. All cards look the same: full summary (up to 2000 characters), bold underlined mint link, four chips, a date; only the title is clickable.
4. Active filters are not shown; clearing one means retyping.
5. Idea page: 12px muted mono section headings, signals are loose lines with a raw URL as link text, related repos are plain text, no hierarchy.

**Restated intent** (Supervisor's interpretation, in the project's domain language):
> The owner opens the dashboard and sees the ideas first: a search box and a Filters toggle on top, the ideas grouped under their bucket (`rising`, `medium`, `low-key`), each card scannable in a second and clickable as a whole. The idea page reads top to bottom by priority: what it is, why now, the evidence, the repos.

**Out of scope** (what this task explicitly does NOT do):
- Any route, query-parameter, auth, cookie, CSP-directive or server-behaviour change (the server contract stays: `q`, `tag`, `since`, `until`)
- A signal count or relative dates on cards (needs an `index-store`/`packages/db` change or a clock)
- Sorting controls, pagination, light theme, any client-side script, web fonts, images
- A new `bucket` field (the bucket is the first tag; no schema change)
- Highlighting the `Build angle:` sentence (T038's prompt output, later)

**Requirement Refs**: FR-010 (list with filters and search, idea page); NFR-001 (escaping, `http(s)` links only)

### Requirement Fidelity Gate (sign off BEFORE implementation)

- [x] Restated intent confirmed to match the user's request — Supervisor, 2026-11-11 (layout chosen by the user)
- [x] Domain terms align with `PROJECT_SPEC.md` — Supervisor
- [x] Every Acceptance Criterion below traces to an audit finding — Supervisor
- [x] Requirement Refs exist in `PRD.md` — Supervisor

---

## Dependencies & Reachability

**Depends on**: T035 (merged). **Parallel**: T038 changes `routines/` and docs only; no file overlap.

**Entry point**: `GET /login`, `GET /`, `GET /ideas/:id` (unchanged).

---

## Acceptance Criteria

| # | Criterion (testable) | Fixes |
|---|----------------------|-------|
| 1 | The list page opens with a toolbar: one search input (`name="q"`, `type="search"`) and a Filters `<details>`/`<summary>` (no script) holding `tag`, `since`, `until` and the submit button, all in one GET form. `since`/`until` are `type="date"`. The `<details>` is open when `tag`, `since` or `until` is set, closed otherwise | 1, 2 |
| 2 | When any filter is active, a row shows one removable chip per active filter (`q`, `tag`, `since`, `until`); each chip's link drops only that parameter and keeps the others; a Reset link clears all. Values are escaped and URL-encoded | 4 |
| 3 | Ideas are grouped in sections by first tag in the order `rising`, `medium`, `low-key`, then `other` (any other first tag, or no tags). Each heading shows the bucket name and its count; empty sections are not rendered; order inside a section is unchanged (newest first) | 3 |
| 4 | Each card: one stretched link on the title makes the whole card clickable (one tab stop for the card; the chips stay separately clickable above it); the summary is clamped to 2 lines; at most 3 tag chips plus a `+N` text when there are more, the bucket tag omitted because the section names it; `last seen` date. Hover and focus show a visible state | 3 |
| 5 | Idea page: eyebrow with the bucket; real `h2` section headings (`Why now`, `Signals (N)`, `Related repos (N)`) at readable size and contrast; why-now in the one highlighted card (`--neon-line` border and `--glow-box`); every tag chip shown; the `class="back"` link kept | 5 |
| 6 | Signals: each shows its `kind` word, the note, and a link whose visible text is `host/path` (cut to 60 characters with `…`), `href` the full safe URL, `title` the full URL, `rel="noopener noreferrer nofollow" target="_blank"`. A non-`http(s)` URL stays plain muted text, never a link | 5 |
| 7 | Related repos: an entry matching `owner/name` (each segment `[A-Za-z0-9._-]+`, not made only of dots) is a link to `https://github.com/owner/name` with the same `rel`/`target`; anything else is plain text | 5 |
| 8 | Login and message pages: the token field has `autofocus` and a short hint; the error stays `role="alert"`. Every page has a skip link to `<main id="main">` | 3 |
| 9 | Still ONE `<style>` element; the CSP hash equals the sha256 of its exact text on every page kind (existing AC7 tests pass untouched); no `<script>`, no `style=""` attribute, no font/image/CDN; every colour is a `var(--token)` (no raw hex outside the generated token block) | constraint |
| 10 | All escaping tests still pass (`<script>`, `"`, `'`, `&` in title, summary, note, url, tag, repo, and in the echoed `q`/`tag`/`since`/`until`) | NFR-001 |
| 11 | At 375px and 1280px: no horizontal scroll, touch targets at least 44px below 720px, long unbroken titles/URLs wrap, a 2000-character summary does not grow the card. `ux-evaluate` passes with before and after screenshots saved to `tasks/evidence/T039/` | 1–5 |
| 12 | Empty states keep their text (`No ideas yet.` / `No ideas match.`); the full-page note (`the newest 50: use the filters or search …`) and the search notices still show | regression |

---

## Evaluation & Acceptance (How we know the agent worked correctly)

### Success Criteria (observable, pass/fail)

| # | Given | Expect | Checked by |
|---|-------|--------|-----------|
| 1 | 3 ideas with first tags `rising`, `low-key`, `zzz` | sections `rising`, `low-key`, `other` in that order, each with a count | automated test |
| 2 | `?tag=cli&since=2026-11-01` | Filters `<details open>`, two removable chips; the `tag` chip link is `/?since=2026-11-01` | automated test |
| 3 | no filters | `<details>` without `open`, no chips, no Reset | automated test |
| 4 | tag `"><script>` and `q` the same | escaped in chips and inputs | automated test |
| 5 | signal url `javascript:alert(1)` (test bypasses the schema) | no `<a href>`, plain text | automated test |
| 6 | related repo `../x` and `owner/name` | `../x` plain, `owner/name` linked to github.com | automated test |
| 7 | idea with 5 tags | 3 chips (bucket tag excluded) and `+2`, or fewer when the bucket tag is among them | automated test |
| 8 | real render at 375px and 1280px | list, idea and login pages readable, no overflow | `ux-evaluate` |

### Verification Command (exact, runnable)

```bash
TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres pnpm --filter @idea-radar/mcp test && pnpm lint && pnpm typecheck && pnpm format:check
```

(If no Postgres is reachable, the suite runs against a loopback PGlite as in T034/T035; the memory slice has the recipe.)

### Evidence

> Filled by the reviewer at Stage 4/5 in `tasks/TASK_REVIEW_T039.md`.

---

## Demonstration

> See `tasks/TASK_REVIEW_T039.md` (before and after screenshots, list at 375px and 1280px).

---

## UI / Design Acceptance Criteria

### 1. Visual Regression

| Screen | Method | Expected |
|--------|--------|----------|
| `/login`, `/`, `/ideas/:id` | `ux-evaluate` screenshots | Graphite Mint: dark, outlined cards, about six neon elements per screen at most (eyebrow, primary button, focus ring, one highlighted card) |

### 2. Design-System Compliance

| Criterion | Method | Expected |
|-----------|--------|----------|
| Colour | CSS audit | only `var(--…)` tokens; ordinary links `--accent`; titles `--text-strong`; neon only where `docs/design-system/project/README.md` allows |
| Type | computed style | IBM Plex stack from tokens with system fallback, no network |
| Status | review | no coloured pills; status is a plain mono word |
| Glow | review | static, only on neon elements |

### 3. Layout / Responsiveness

| Viewport | Method | Expected |
|----------|--------|----------|
| 375px | screenshot | one column, toolbar usable with one hand, first idea visible without scrolling past a form |
| 1280px | screenshot | content column up to `--content-max`, cards scannable |

### 4. UX Acceptance Criteria

| User goal | Flow | Pass condition |
|-----------|------|----------------|
| find an idea | type in search, press Enter | list narrows, query stays in the box and appears as a removable chip |
| narrow by date | open Filters, pick a date | native date picker, chip appears, removing it restores the list |
| scan today's ideas | open `/` | buckets visible as sections, each card readable in about a second |
| open an idea | click anywhere on a card | idea page opens; Back link returns |
| keyboard | Tab through the list | skip link, search, Filters, one stop per card, visible focus ring |
| check evidence | idea page | signal links show where they go; repo names open on GitHub |

---

## Approach

**Pattern reference**: the existing `html`/`raw`/`escape` helpers in `apps/mcp/src/html.ts` (every `${}` is escaped; only `html` and `raw` results are trusted).

**Vital slice**: list toolbar + chips + sections + card, then the idea page, then login polish. Do not commit: leave the changes in the worktree and report; the Supervisor asks the user before any commit.
**Cut list**: signal count, relative dates, sorting, pagination, theme toggle, any script.

Implementation notes:
- Work in `html.ts` (markup and `PAGE_CSS`); `dashboard.ts` only if a `ListView` field is truly needed (`q`, `tag`, `since`, `until` are already there, so chip links can be built from them with `URLSearchParams`).
- Stretched link: `.card{position:relative}` and `h2 a::after{content:"";position:absolute;inset:0}`; chips and other links get `position:relative;z-index:1`.
- Clamp: `-webkit-line-clamp:2` with `display:-webkit-box` and `-webkit-box-orient:vertical`, plus `overflow:hidden`.
- The CSS and the hash come from one string (`CSS`), so editing `PAGE_CSS` keeps the hash right; never add a second style element or an inline `style` attribute.
- `owner/name` link check: test each segment with a regex and reject segments of only dots.

---

## Edge Case Checklist

- [ ] No tags on an idea (section `other`, no chips, no crash)
- [ ] Bucket tag not first (idea lands in `other`; chips show every tag)
- [ ] Filter value with `&`, `"`, `<`, a very long value (maxlength kept)
- [ ] `since` after `until` (the server's existing behaviour is unchanged; no new message)
- [ ] 2000-character summary and an unbroken 200-character title wrap at 375px
- [ ] Signal URL very long, with query string; display text cut, `href` intact
- [ ] Section with exactly 1 idea (count says 1)
- [ ] The limit note and search notices still render with sections
- [ ] `<details>` works with no script and no CSS-only hack
- [ ] Pin-test pre-flight: `html.test.ts` pins `<a class="chip" href="/?tag=notes">` and `class="back"`; decide per test whether the markup stays (keep the chip on the idea page) or the test is repointed, and say which in the review file

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `apps/mcp/src/html.ts` | list toolbar, chips, sections, card, idea page, login/message polish, `PAGE_CSS` |
| `apps/mcp/src/html.test.ts`, `apps/mcp/src/dashboard.test.ts` | new tests for AC 1–10; repoint pin tests that the new markup changes |
| `apps/mcp/src/dashboard.ts` | only if a `ListView` field is needed |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `apps/mcp/src/tokens-css.ts`, `docs/design-system/**` | generated / source of truth, read only |
| `apps/mcp/src/auth.ts`, `session.ts`, `server.ts`, `tools.ts`, `index-store.ts`, `packages/**` | auth, routes, store: out of scope |
| `routines/**`, `ideas/**`, `docs/deploy.md` | T038 / contract |
| `.claude/`, `skills/`, `templates/`, `docs/claude-md/`, `AGENTS.md`, `CLAUDE.md` | kit |

---

## Test Plan

Unit tests on `listPage`, `ideaPage`, `loginPage` for AC 1–10 and the edge cases; the existing HTTP tests (CSP hash on every page, login/logout, escaping) must pass unchanged. Then a real render at 375px and 1280px (`ux-evaluate`), before and after, saved to `tasks/evidence/T039/`.

---

## Completion Checklist

- [ ] Implementation done
- [ ] Self-review: `Skill({ skill: "code-review" })` run
- [ ] Security review: `Skill({ skill: "security-review" })` run (Medium risk: links, escaping, CSP)
- [ ] `Skill({ skill: "ux-evaluate" })` run
- [ ] Lint passes
- [ ] Tests written AND pass — output pasted into `tasks/TASK_REVIEW_T039.md`'s Evidence table (Hard-Stop Gate 5)
- [ ] `Skill({ skill: "verify" })` run — confirmed in the running app
- [ ] Supervisor notified: task ready for Stage 4 review
