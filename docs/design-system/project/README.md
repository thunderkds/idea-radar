# Graphite Mint

Graphite Mint is the shared look of the Easy Kit family: Easy Kit, Easy Memory, Easy Verifier and the Easy Personal dashboard. It is a dark theme made for long reading and debugging sessions: a soft graphite background, light gray text, and one neon mint used only for the few things that need attention.

## Who reads these pages

Developers who run Claude Code agents. They read docs, copy commands and scan numbers, often for hours, often at night. Every rule below exists so the page is comfortable to look at for a long time.

## Principles

1. **No pure black, no pure white.** The page is `bg` (#121413) and body copy is `text` (#DCE0DD), about 14:1. High enough to read, low enough not to glare.
2. **Two mints, two jobs.** `accent` (soft mint) is for ordinary links. `neon` (#3CF5A8) is for highlights only. If everything is neon, nothing is.
3. **Structure from hairlines.** Sections are separated by 1px `line` borders. Cards are outlined, not filled. No drop shadows.
4. **Glow only on neon.** The three `glow-*` shadows and the `glow-line` filter belong to neon elements and nowhere else. Static, never animated.
5. **One family, one theme.** All four products use the same tokens, the same header, the same sidebar. Only the name, the tag and the glyph change.

## Colour

| Role | Tokens |
| --- | --- |
| Surfaces | `bg`, `bg-sunken` (code, inputs, table headers), `bg-raised` (hover, inner panels) |
| Lines | `line-subtle`, `line`, `line-strong`, `line-header` |
| Text | `text-strong` (headings), `text` (body), `text-2` (lede), `text-nav`, `text-muted` (labels), `text-dim` (hints only) |
| Links | `accent`, `accent-hover` |
| Highlight | `neon`, `neon-soft`, `neon-line`, `neon-bar`, `on-neon` |
| Status | `warn` (+ `warn-soft`, `warn-line`), `danger` |
| Easy Kit roles | `role-backend`, `role-infra`, `role-frontend`, `role-qa` (8px dots only) |

### What gets neon

Keep to about six neon elements on one screen.

| Element | Treatment |
| --- | --- |
| Active sidebar item | text `neon` + `glow-text`, background `neon-soft`, inset 1px ring `neon-line` |
| Current-site / current-page dot | `neon` + `glow-dot`; other dots `dot-idle` |
| Eyebrow above h1, step numbers | `neon` + `glow-text` |
| Primary button | fill `neon`, text `on-neon`, `glow-box` |
| The key number in a strip | `neon` + `glow-text`; other numbers `text-strong` |
| One highlighted card per section | border `neon-line` + `glow-box` |
| Progress fills, current chart bar | `neon` + `glow-dot` / `glow-box`; other bars `neon-bar` |
| Sparklines, rings | stroke `neon`, filter `glow-line` |
| `$` prompt in code boxes | `neon`, no glow |

Never neon: headings, body text, ordinary links, borders of ordinary cards, backgrounds.

### Status

`warn` amber is the only warning colour; `danger` soft rose is for errors and limits at 90% or more. Always pair them with an icon or a word ("stale", "failed"), because `neon` and `warn` are close in lightness. Trends (↑ 12.4%) are `text-2`, not green or red: more tokens is not good or bad by itself. Status in tables is a plain mono word, never a coloured pill.

## Typography

IBM Plex Sans for UI and prose; IBM Plex Mono for code, numbers, file names, rule IDs, model and project names, and the small structural labels. Weights 400, 500 and 600 only. No all-caps headings.

Structural labels are lowercase mono and say what they are:

- Eyebrow: `> multi-agent supervisor framework`
- Sidebar group: `// getting started`
- Step numbers: `00`, `01`, `02` (only for a real sequence)

Websites load Plex from Google Fonts. The Easy Personal dashboard makes no network calls, so it bundles `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono` instead.

## Layout

Every site uses the same shell: a `header-h` header (glyph, product name, mono version tag, family nav, GitHub), a `sidebar-w` sidebar of grouped links, and a main column up to `content-max`. Sections are `space-8` apart. The dashboard uses the same parts at app density: 56px top bar, 232px sidebar, a right summary rail.

Below 1024px the sidebar becomes a drawer behind a Menu button; below 720px the family nav moves into the drawer, grids collapse to one column and stat strips to two.

## Components

Button, CodeBox, SidebarNav, FamilyNav, StatStrip, StepGrid, Card, DataTable, ProgressBar, Chip and Notice. Styles live in `components/bundle.css` as plain classes (`gm-…`); there is no JavaScript bundle. Each component's README says which markup it expects.

Add class `no-glow` on `<html>` to switch every glow off for people who find it too strong.

## Accessibility

- Every text token passes 4.5:1 on `bg` except `text-dim` (4.1:1), which is only for large text or non-essential hints.
- Focus ring: 2px solid `neon`, 2px offset, on every link and button.
- Real `<a>`, `<button>`, `<label>` + `<input>`; `aria-current="page"` on the active nav item and the current family link.
- Touch targets at least 44px below 720px.

## Do and don't

| Do | Don't |
| --- | --- |
| Use `neon` for the few highlighted things | Use neon for headings, text or large areas |
| Outline cards with `line` | Fill cards, add drop shadows or gradients |
| Keep text in the defined grays | Use `#000`, `#FFF`, saturated red or green |
| Say "no data" in `text-dim` when a source is empty | Show 0 for missing data |
| Keep one shared `tokens.css` across all sites | Copy hex values into components |
