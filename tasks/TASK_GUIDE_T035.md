# TASK_GUIDE — T035: Token-gated dashboard pages in apps/mcp
**Date**: 2026-11-10
**Complexity Level**: C2
**Risk Level**: High
**Priority**: P1
**Assigned agent**: frontend-developer
**Agent guide**: `agents/frontend.md`

---

## Mandatory Startup (Do Not Skip)

Before writing any code:
1. Read `PROJECT_SPEC.md`
2. Read the memory slice in your spawn prompt (`<!-- memory-slice -->`). Read `memory/MEMORY.md` in full only if your work reaches a file, hook, skill or decision the slice does not cover
3. Read this file completely
4. Read `agents/frontend.md`
5. Note the **Complexity Level** above and apply the matching process from the Complexity matrix in `agents/frontend.md`
6. Read `memory/codebase-map.md` for layout

Also read `PRD.md` (FR-010, NFR-001), `docs/design-system/project/README.md` and `tokens.json` (Graphite Mint), and `apps/mcp/src/server.ts`.

---

## Requirement (Pillar 1 — Adapt the requirement)

User (2026-11-10): "show it in app dashboard"; "Behind a login token"; "Pages inside apps/mcp".

**Restated intent** (Supervisor's interpretation, in the project's domain language):
> After logging in with the dashboard token, the owner or a reader can browse the newest ideas, filter by tag and date, search, and open one idea with its sources — all served as plain HTML pages by the same Railway service.

**Out of scope** (what this task explicitly does NOT do):
- Editing ideas; client-side JavaScript frameworks; per-user accounts

**Requirement Refs** (FR/NFR/US IDs from `PRD.md` this task satisfies):
- FR-010: login (`DASHBOARD_TOKEN` → HttpOnly cookie), list with filters + search, idea page, logout; every page but `/login` and `/health` needs the cookie
- NFR-001: all idea text HTML-escaped; only `http(s)` links
- NFR-004: pages < 1 s at 10,000 ideas
- US-006

### Requirement Fidelity Gate (sign off BEFORE implementation)

- [x] Restated intent confirmed to match the user's request — Supervisor, 2026-11-10
- [x] Domain terms align with `PROJECT_SPEC.md` glossary — Supervisor
- [x] Every Acceptance Criterion below traces to a line in the Requirement — Supervisor
- [x] All Requirement Refs exist in `PRD.md` and are fully covered by the Acceptance Criteria — Supervisor

---

## Dependencies & Reachability

**Depends on**: T034 — the Postgres-backed `IdeaStore` and the four-token boot in `apps/mcp`

**Entry point**: `GET /login` (form), `GET /` (idea list), `GET /ideas/:id`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `GET /login` shows a form; `POST /login` with the right token (constant-time compare) sets a session cookie (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when the request is HTTPS / `x-forwarded-proto: https`) and redirects to `/`; a wrong token → 401 page, no cookie | FR-010 |
| 2 | The cookie value is an HMAC (keyed by `DASHBOARD_TOKEN`) of an expiry, never the token itself; expired or tampered → redirect to `/login`. `POST /logout` clears it | FR-010, NFR-002 |
| 3 | `GET /` without a valid cookie → 303 to `/login`. With one: newest ideas first (limit 50), tag and date filters and a search box via query params, showing title, summary, tags, last_seen | FR-010 |
| 4 | `GET /ideas/:id` shows the full idea: why_now, signals (`<a rel="noopener noreferrer nofollow" target="_blank">` only for `http(s)` URLs), related repos, first/last seen; unknown id → 404 page | FR-010, NFR-001 |
| 5 | Every idea field is HTML-escaped (test with `<script>`, `"`, `'`, `&` in title/summary/note/url) | NFR-001 |
| 6 | `POST /login` and `POST /logout` reject a cross-site request (check `Origin`/`Sec-Fetch-Site`, or a CSRF token) | NFR-001 |
| 7 | Styling uses one inline `<style>` built from Graphite Mint `tokens.json` (dark theme, `--neon` sparingly); no external fonts, scripts or CDNs; usable at 375px and 1280px | FR-010 |
| 8 | Pages answer < 1 s with 10,000 ideas | NFR-004 |

---

## Evaluation & Acceptance (How we know the agent worked correctly)

### Success Criteria (observable, pass/fail)

| # | Given (input/state) | Expect (output/behavior) | How it's checked |
|---|---------------------|--------------------------|------------------|
| 1 | no cookie, `GET /` | 303 → `/login` | automated test |
| 2 | right token at `/login` | `Set-Cookie` HttpOnly SameSite=Lax; `GET /` 200 with idea titles | automated test |
| 3 | wrong token | 401, no cookie | automated test |
| 4 | idea title `<script>alert(1)</script>` | rendered as `&lt;script&gt;…` | automated test |
| 5 | signal url `javascript:alert(1)` (bypassing the schema in a test) | no `<a href>` | automated test |
| 6 | `POST /login` with `Origin: https://evil.example` | 403 | automated test |
| 7 | real run + screenshots at 375px and 1280px | list, filters, idea page readable | `ux-evaluate` |

### Verification Command (exact, runnable)

```bash
TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres pnpm --filter @idea-radar/mcp test && pnpm lint && pnpm typecheck
```

### Evidence (filled by reviewer at Stage 4/5)

> **Moved.** Filled by the reviewer at Stage 4/5 in `tasks/TASK_REVIEW_T035.md`.

---

## Demonstration

> **Moved.** See `tasks/TASK_REVIEW_T035.md`.

---

## UI / Design Acceptance Criteria

### 1. Visual Regression

| Screen / Component | Verification method | Expected result |
|-------------------|---------------------|-----------------|
| `/login`, `/`, `/ideas/:id` | `ux-evaluate` screenshots (LLM vision) | matches Graphite Mint: dark, outlined cards, few neon highlights |

### 2. Design-System Compliance

| Criterion | Verification method | Expected result |
|-----------|---------------------|-----------------|
| Colors match design tokens | CSS audit: every color is a `var(--…)` from `tokens.json` | no raw hex outside the generated token block |
| Typography matches spec | computed style | system sans/mono stack (no font network calls) |
| Spacing / layout matches spec | visual | app density per `docs/design-system/project/README.md` |

### 3. Layout / Responsiveness

| Viewport | Verification method | Expected result |
|----------|---------------------|-----------------|
| Mobile (375px) | screenshot | one column, no horizontal scroll |
| Desktop (1280px) | screenshot | list with filters visible |

### 4. UX Acceptance Criteria

| User story | User goal | Flow / state | Pass condition (observable) |
|------------|-----------|--------------|-----------------------------|
| US-006 | log in | `/login`, wrong token | "Wrong token" message shows; form stays |
| US-006 | browse | `/` with 0 ideas | "No ideas yet" shows |
| US-006 | find | `/` search "markdown" | matching ideas listed; query kept in the box |
| US-006 | read | `/ideas/:id` | signals are clickable links; back link to list |

---

## Approach

**Pattern reference**: `apps/mcp/src/server.ts` route handling and `sendJson`; v1 `apps/dashboard/lib/tokens-css.ts` in tag `v1-scraper` (`git show v1-scraper:apps/dashboard/lib/tokens-css.ts`) for turning `tokens.json` into CSS variables.

**Vital slice**: login cookie + `/` list with escaping; filters, search and the idea page reuse the same render helpers.
**Cut list**: pagination beyond 50 (search/filters cover it); dark/light toggle; JS enhancements.

Put pages in `apps/mcp/src/dashboard.ts` (routes) and `apps/mcp/src/html.ts` (one `escape()` helper and template functions; never build HTML from unescaped strings). Session: `exp.hmac` with `crypto.createHmac('sha256', DASHBOARD_TOKEN)`, 7-day expiry.

---

## Edge Case Checklist

- [ ] Empty list and no-match search states
- [ ] Very long titles/summaries wrap; no overflow at 375px
- [ ] Query params echoed back escaped
- [ ] `DASHBOARD_TOKEN` rotation invalidates old cookies (HMAC key changes)
- [ ] `/mcp` auth unchanged; dashboard cookie never grants MCP access
- [ ] Pin-test pre-flight: the `Pre-existing pin tests` row below is filled before work starts
- [ ] Stale references: README/deploy docs (T036 owns them)

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `apps/mcp/src/dashboard.ts`, `apps/mcp/src/html.ts`, `apps/mcp/src/session.ts` + tests | new pages, escaping, session cookie |
| `apps/mcp/src/server.ts` | route `/login`, `/logout`, `/`, `/ideas/:id` to the dashboard |
| Pre-existing pin tests | `apps/mcp/src/server.test.ts` "unknown paths are 404" (`/` will now redirect) — repoint |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/db/**`, `apps/mcp/src/tools.ts`, `apps/mcp/src/auth.ts` | T033/T034 |
| `docs/design-system/**` | source of truth — read only |
| `.claude/`, `skills/`, `templates/`, `docs/claude-md/`, `AGENTS.md`, `CLAUDE.md` | kit |

---

## Test Plan

HTTP tests per Success Criteria 1–6 against a test DB; `ux-evaluate` screenshots at 375px and 1280px for the UI rows.

---

## Completion Checklist

- [ ] Implementation done
- [ ] Self-review: `Skill({ skill: "code-review" })` run
- [ ] Security review: `Skill({ skill: "security-review" })` run (if Medium/High risk)
- [ ] `Skill({ skill: "ux-evaluate" })` run
- [ ] Lint passes
- [ ] Tests written AND pass — output pasted into `tasks/TASK_REVIEW_T035.md`'s Evidence table (Hard-Stop Gate 5)
- [ ] `Skill({ skill: "verify" })` run — feature confirmed working in running app
- [ ] Supervisor notified: task ready for Stage 4 review
