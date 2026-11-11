# TASK_REVIEW — T039: Dashboard UX redesign (search-first list with bucket sections, readable idea page)

> Sibling of `tasks/TASK_GUIDE_T039.md`. Filled by the implementing agent (frontend-developer) for Stage 3; the Supervisor/reviewer adds Stage 4/5 rows (code-review, security-review, verify, delivery report).

---

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | pass | New: `apps/mcp/src/html.test.ts` (+17 tests, 20 in the file: AC1 toolbar, AC2 chips, AC3 sections, AC4 card, AC5-7 idea page, AC8 login/skip link, AC9 one `<style>`/no script/no `style=`, AC10 escaping in chips/inputs, AC12 empty states and notices). Changed: `apps/mcp/src/dashboard.test.ts` (+1 route test: `?tag=cli&since=2026-11-01` gives `<details open>` and the chip `/?since=2026-11-01`; 1 pin test repointed, see below). |
| Red before green | pass | Run before any `html.ts` edit: all 17 new `html.test.ts` tests failed (`✖` on every new test in the 4 new `describe` blocks). After the implementation: 20/20. |
| Verification command run (mcp, no DB) | pass | `cd apps/mcp && tsx --conditions=source --test "src/**/*.test.ts"`: tests 95, pass 94, fail 0, skipped 1 (baseline 77 / 76 / 1). |
| Verification command run (mcp, with loopback PGlite `:55432`) | pass | `TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres ... --test "src/**/*.test.ts"`: tests 107, pass 107, fail 0, **skipped 0** (baseline 89/89). |
| Lint / typecheck / format | pass | `pnpm lint` and `pnpm typecheck` (packages/ideas, packages/db, apps/mcp): no errors; `prettier --check packages apps scripts eslint.config.js`: "All matched files use Prettier code style!". |
| Existing escaping, CSP-hash and auth tests untouched | pass | `dashboard.test.ts` AC7 CSP-hash test (4 page kinds), no-raw-colour test, escaping tests, CSRF tests all pass unmodified. One mid-run failure was real and fixed in the CSS, not the test: `white-space:nowrap` in a new `.vh` rule matched the test's `\b(white|black)\b` raw-colour regex; the declaration was dropped. |
| Real-server check with the CSP header applied | pass | `apps/mcp` on `:18039` against loopback PGlite, 5 ideas seeded through the real `submit_ideas`; headless Chromium (playwright-core): login by real form (autofocus on `#token`), list, search `q=changelog` + Enter (chip "remove search: changelog"), Filters open for `?tag=cli&since=2026-11-01` (`since` input value `2026-11-01`), chip hrefs `["/?since=2026-11-01","/?tag=cli"]`, removing the first chip lands on `/?since=2026-11-01`, a click on the card body (not the title) opens `/ideas/t039-rising`, a chip click stays on the chip target `/?tag=cli`, signal links `rel`/`target=_blank` and `title`. Computed body background `rgb(18, 20, 19)` and the token font stack on every page (proves the hashed `<style>` was applied). Console: only the expected 401 (wrong token) and 404 (`/ideas/nope`), **0 CSP violations**. Tab order: skip link, brand, Log out, search, Search, Filters, one stop for the first card, then its chips. |
| **UI: Visual regression** | pass | Before: `tasks/evidence/T039/before/{list,idea,login}-{m,d}.png`. After (live server, CSP applied): `tasks/evidence/T039/after/{list,idea,login}-{m,d}.png` plus `list-filtered`, `login-error`, `message`, `list-focus` (-m/-d), `list-long-m.png`, `list-empty-m.png`. m = 375px, d = 1280px. |
| **UI: Design-system compliance** | pass | Every colour is `var(--token)`; no new token, `tokens-css.ts` untouched. Neon: eyebrow, primary Apply (when Filters is open), focus ring, the one why-now card (idea page), and the login button/focus on login: at most 4 per screen. Glow only on those neon elements. No coloured pills (status is mono text). IBM Plex stack with system fallback, no network. Chips are outlined, no fills. |
| **UI: Responsiveness** | pass | 375px and 1280px: `scrollWidth == clientWidth` on list, list-filtered, list-empty, list-long (200-char `q`, 100-char `tag`), idea, login, login-error, message. Tap probe (`skills/ux-evaluate/scripts/tap_probe.py`) at 375: "under 44px:" empty on list, list-filtered, list-long, idea, login, message. |
| Review scope bounded to blast radius | pass | `git diff -- apps`: `html.ts`, `html.test.ts`, `dashboard.test.ts` only. `dashboard.ts` unchanged (no `ListView` field needed). Consumers of `html.ts`: `dashboard.ts` (page functions, `PAGE_CSP`), `dashboard.test.ts`, `server.test.ts` (all green). |
| code-review / security-review / verify | not run (Supervisor, Stage 4/5) | The implementing agent has no `Skill` tool; the changed surface for review: `safeHttpUrl` use unchanged, new `linkText` (`new URL` on an already-safe href), new `repoItem` (strict segment regex, `rest.length === 0`, dot-only segments rejected), `raw()` used only for the two constant strings `<details open>` / `<details>` and `STYLE_TAG`. |

---

## Acceptance criteria status

| # | Status | Evidence |
|---|--------|----------|
| 1 | pass | html.test "one GET form ..." and "details is closed ... open when tag, since or until is set"; live: details open for `?tag=cli&since=...`, dates are `type="date"`. Beyond the AC: a visible plain "Search" button sits next to the search input (the primary `Apply` stays inside the details), so Enter and a tap both submit when Filters is closed. |
| 2 | pass | html.test "an active filter is a removable chip ..." (hrefs, URL encoding, Reset) and "filter values are escaped"; live chip hrefs. |
| 3 | pass | html.test "ideas are grouped rising, medium, low-key, other, with counts ..."; screenshots `after/list-*.png` (`rising 1`, `medium 1`, `low-key 1`, `other 2`). |
| 4 | pass | html.test card tests (one `<a href="/ideas/..">`, `.clamp`, 3 chips + `+N`, bucket tag omitted); live: card-body click opens the idea, chip click goes to its own target; hover and a card-wide neon focus ring (`after/list-focus-*.png`). |
| 5 | pass | html.test idea page; `after/idea-*.png`: eyebrow, `h2` headings with counts, why-now card with `--neon-line` + `--glow-box`, every tag chip, `class="back"`. |
| 6 | pass | html.test signal tests: `host/path` text cut at 60 chars + `…`, `href`/`title` full URL, `rel`/`target`; `javascript:` stays a muted `<span>`. |
| 7 | pass | html.test repo test: `owner/name` and `o/r.js-x_1` linked; `../x`, `a/..`, `./b`, `a/b/c`, `<s>/x` plain. |
| 8 | pass | html.test login (autofocus, `aria-describedby` hint, `role="alert"`) and skip link + `<main id="main">` on login, message, list and idea pages. |
| 9 | pass | Still one `<style>`; CSP-hash test passes on login, list, message, idea; no `<script>`, no `style=`; no raw colour (existing test). |
| 10 | pass | All existing escaping tests pass unmodified; new html tests cover chips and inputs. |
| 11 | pass | See Responsiveness row and the `ux-evaluate` verdict below. |
| 12 | pass | html.test "empty states, the count line ... and notices still show"; unchanged strings `No ideas yet.`, `No ideas match.`, `N ideas, the newest N: use the filters or search to find others`. |

---

## Pin-test decisions (guide edge case "Pin-test pre-flight")

| Pinned assertion | Decision | Why |
|------------------|----------|-----|
| `dashboard.test.ts` "tag chips on the list link ..." `<a class="chip" href="/?tag=notes">notes</a>` | **Markup kept**, test untouched | The stub idea's tags are `["notes", "ai"]`; first tag `notes` is not a bucket, so the idea is in `other` and all tags show. The chip markup is unchanged. |
| `dashboard.test.ts` idea page `<a class="back" href="/">` | **Markup kept**, test untouched | |
| `dashboard.test.ts` "shows why_now, signals as safe links ..." pinned `<a href="https://github.com/o/r" rel=... target="_blank">https://github.com/o/r</a>` | **Test repointed** | AC6 requires link text `host/path` and a `title` attribute, so the old text and attribute set cannot stay. New pin: `<a href="https://github.com/o/r" title="https://github.com/o/r" rel="noopener noreferrer nofollow" target="_blank">github.com/o/r</a>` (whitespace before `>` tolerated because Prettier reflows `html` templates). The security assertion is kept and stronger: exactly one `target="_blank"` in the escaping test, `href` still `https://example.com/?a=%22b%22&amp;c=%27d%27%3Ce%3E`. |
| `html.test.ts`/`dashboard.test.ts` link `href="/ideas/..."` `[^>]*>Markdown notes</a>` | Markup kept | Title link is a plain `<a href="/ideas/id">`. |

No escaping, CSP-hash or auth test was weakened.

---

## ux-evaluate (Stage 3, run by the implementing agent)

Rows from the guide `### 4. UX Acceptance Criteria`; screenshots in `tasks/evidence/T039/after/` (live server, CSP applied) at 375 / 1280; every PNG listed was opened with Read.

| # | User story | Flow / state | Width | Verdict | Screenshot | Reason |
|---|------------|--------------|-------|---------|------------|--------|
| 1 | find an idea | type in search, Enter | 375 / 1280 | pass | `after/list-filtered-m.png`, `-d.png` | Query stays in the box and shows as the chip "search: changelog x" (live run printed chip text `remove search: changelog` for the screen-reader text). |
| 2 | narrow by date | open Filters, pick a date | 375 / 1280 | pass | `after/list-filtered-m.png`, `-d.png` | Native `mm/dd/yyyy` date controls, chip `since: 2026-11-01 x`, the `since` chip's href is `/?tag=cli` (the other filter kept; clicking the `tag` chip was run live and landed on `/?since=2026-11-01`). Picking a date in the native widget itself was not driven (value set by URL). |
| 3 | scan today's ideas | open `/` | 375 / 1280 | pass | `after/list-m.png`, `-d.png` | Sections `rising / medium / low-key / other` with counts, each card is title, 2-line summary, 3 chips, date. The first idea is visible above the fold at 375. |
| 4 | open an idea | click anywhere on a card | 375 / 1280 | pass | live run | Click at the right edge of the card body opened `/ideas/t039-rising`; the Back link is present on the idea page. |
| 5 | keyboard | Tab through the list | 375 / 1280 | pass | `after/list-focus-m.png`, `-d.png` | Tab order: skip link, brand, Log out, search, Search, Filters, one stop per card, then its chips; the card shows a neon ring. |
| 6 | check evidence | idea page | 375 / 1280 | pass | `after/idea-m.png`, `-d.png` | Signal links read `github.com/example/repo`, the long URL ends with `...`, repos `example/repo` are links, `../x` is plain text. |
| B-a | baseline | default | 375 / 1280 | pass | `after/list-m.png`, `login-m.png` | List: the search box and Search button are the first control, in view. Login: the neon Log in button is the primary action in view. |
| B-b | baseline | default | 375 / 1280 | pass | `after/idea-m.png`, `-d.png` | Back link, eyebrow, title, summary, why-now card, then Signals and Related repos as h2 sections. |
| B-c | baseline | default | 375 / 1280 | pass | `after/list-m.png`, `-d.png` | Consistent 12px card gaps and section gaps; chips and date on one grid row. |
| B-d | baseline | default | 375 | pass | tap probe on list, list-filtered, list-long, idea, login, message | Probe prints "under 44px:" with nothing after it on all six pages. The probe was run on the static render of the same HTML; the live run found no `<44px` target at 375 for list and idea either. |
| B-e | baseline | default | 375 | pass | `after/list-m.png` | Body 16px at 375; secondary mono labels stay 12px as the design system defines (labels, chips); text colours are `text`, `text-2`, `text-muted`. |
| B-f | baseline | empty / error | 375 / 1280 | pass | `after/list-empty-m.png`, `login-error-m.png`, `message-m.png` | "No ideas match.", "Wrong token" (alert) and "Idea not found" each say what happened; "Back to the list" button on the message page. |
| B-g | baseline | after action | 375 / 1280 | pass | `after/list-filtered-m.png`, `login-error-m.png` | Filter chips appear after submit; the wrong-token page shows the alert and keeps the field focused. |
| B-h | baseline | default | 375 | pass | all `-m` images | One column, no horizontal scroll (`scrollWidth == clientWidth` = 375 on 8 pages, including 200-character `q` and 100-character `tag` chips). |
| B-i | baseline | default | 375 / 1280 | pass | all | One accent for links, one neon primary button per screen, one radius family (4px chips, 6px cards and buttons). |

ux-evaluate: 15 pass, 0 fail, 0 not checked, 0 not checkable. Overall: pass.

Limits: the native date picker pop-up and iOS Safari rendering were not exercised (Chromium only); the hover state was seen only incidentally on the first card in `after/list-m.png`; the stretched-link title anchor is the 44px-high link row at 375 (the card padding-top is 0 on phones so the title row is the tap target).

---

## Demonstration

**BEFORE**: `tasks/evidence/T039/before/{list,idea,login}-{m,d}.png` (filter form first, identical cards with the full summary and a bold underlined link, raw URL link text).

**AFTER**: `tasks/evidence/T039/after/` (see Evidence).

## Notes for the Supervisor

- Deviation (small, inside the guide's intent): a visible plain `Search` button next to the search input, in addition to `Apply` inside the Filters details. Reason: `Apply` is hidden while Filters is closed and many mobile keyboards need a visible submit. Say if you want it cut.
- `Skip to content` link is also `min-height:44px` (it was 43px in the tap probe while off-screen).
- Eyebrow on the idea page is `> rising|medium|low-key`, or `> idea` for the `other` bucket (the word `other` would read oddly there).
- Learning for `memory/learnings.md`: (1) the existing no-raw-colour test also bans the word `white`, so `white-space:` cannot appear in `PAGE_CSS`; (2) Prettier reflows `html` templates, so test regexes must tolerate whitespace before `>` and after `</a` (the new tests normalise the page first); (3) a stretched link needs the title anchor itself to be 44px high at 375 for the tap probe, because the probe measures the anchor box, not the `::after` overlay.
- `memory/codebase-map.md` is stale (generated 2026-10-31 for an older layout with `apps/api` etc.), not used for this task.

---

## Stage 4 (Supervisor, 2026-11-11)

| Check | Result | Notes |
|-------|--------|-------|
| Independent rerun of the gates | pass | In the worktree: mcp tests 107 tests, 107 pass, 0 fail, 0 skipped (loopback PGlite on :55432); `pnpm lint`, `pnpm typecheck`, `prettier --check` clean. Before and after screenshots opened and read (list 375/1280, idea 375, filtered list 375). |
| code-review | pass | No P0, P1 or P2. P3 x4 open (repeated filter-key list, no bucket click-through on cards, PRD FR-010 wording, partial startup reads); 2 notes for the owner (`+N` chip count meaning, extra visible Search button). Lane check: C2, FITS. Report: `reports/code-review_t039-dashboard-ux_20261111T185451.html` |
| security-review | pass | Clean, 0 HIGH, 0 MEDIUM (escaping, `raw()` constants only, `safeHttpUrl`, `owner/name` links, relative chip hrefs, CSP hash, no inline style or script). Report: `reports/security-review_t039-dashboard-ux_20261111T185451.html` |
| ux-evaluate | agent-run, not rerun | 15 pass by the implementing agent (self-graded); the Supervisor read the screenshots. Not exercised: native date-picker pop-up, iOS Safari. |
| verify | not run | The user's step (T037 precedent). The agent's own live-server check (real `apps/mcp`, CSP header applied, 0 CSP violations) is evidence, not the verify row. |
