# TASK_GUIDE — T027: Re-scrape on request (dashboard button + admin write endpoint)
**Date**: 2026-10-31
**Complexity Level**: C2
**Risk Level**: Medium
**Priority**: P1
**Assigned agent**: frontend-developer
**Agent guide**: `agents/frontend.md`
**Linear**: none yet (`docs/SPEC.md` § Tracking strategy)

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md`, `docs/SPEC.md` § Tracking strategy and § Dashboard views, `docs/design-system/project/README.md`.
2. Call easy-memory `memory_search` first (rescrape, admin token, write endpoint, dashboard repo page); then the memory slice in your spawn prompt.
3. Read this file, `agents/frontend.md`, `apps/api/src/app.ts`, `apps/dashboard/app/repos/[id]/page.tsx`, `apps/dashboard/lib/api.ts`, `packages/db/src/tracking.ts`, `packages/db/src/jobs.ts`.

---

## Requirement (Pillar 1)

User 2026-10-31: non-leader repos "will need to rescrape by the request"; re-scrape trigger choice: "Dashboard button".

**Restated intent**
> The repo detail page has a "Refresh now" button, and so does each idea group. Pressing it calls the API's only write endpoint, which marks that repo (or every tracked repo in the group) due now and queues a `snapshot` job for today, then shows when the refresh was queued. The endpoint requires an admin token; without `ADMIN_TOKEN` configured the endpoint returns 404 and the dashboard hides the button.

**Out of scope**: user accounts, login pages, per-user tokens; showing a group page beyond the button and the group's repos list on the repo page.

### Requirement Fidelity Gate
- [x] Restated intent confirmed — user (chat, 2026-10-31)
- [x] Domain terms align with `docs/SPEC.md` § Tracking strategy
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T024 — tracked repos + snapshots; T026 — idea groups
**Entry point**: `POST /rescrape`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | API `POST /rescrape` with JSON `{ "repoId": n }` or `{ "groupKey": "…" }`: requires `Authorization: Bearer <ADMIN_TOKEN>` (constant-time compare); sets `next_due_at = now()` for the repo / group's tracked repos (a `parked` repo included), and re-opens today's `snapshot` job if it already ran (`ok` → `pending`, run token rules from T023). Returns `202 { queued: n }`. Unknown repo/group → 404; bad body → 400; missing/wrong token → 401; `ADMIN_TOKEN` unset → 404 for the route. All other routes stay GET-only | endpoint |
| 2 | `GET /repos/:id` adds `tracking: { priority, groupKey, lastSnapshotAt, nextDueAt } | null` and the group's other repos (id, full name, priority), displayable data only | repo page data |
| 3 | Dashboard repo page: shows priority and last refresh; a "Refresh now" button for the repo and one for its group, rendered only when the dashboard server has `ADMIN_TOKEN`; the call goes through a Next.js server action, so the token never reaches the browser; shows "Refresh queued" / the error text | button |
| 4 | API tests for every status code in AC 1; dashboard tests for the button hidden/shown and the server action; easy-ui sessions: visual, design-system, responsiveness, button flow (queued + error) | tests + UI evidence |
| 5 | `docs/SPEC.md` § Dashboard views and the API description mention the endpoint and `ADMIN_TOKEN`; `.env` handling is the user's (do not edit `.env*`; list the new variable in the report) | spec |

---

## UI / Design Acceptance Criteria

- Uses Graphite Mint tokens (`apps/dashboard/app/tokens.css`) and existing components; the button is a secondary button, not the neon primary.
- Works at 375 px, 768 px and 1280 px with no horizontal page scroll.
- Focus ring visible; the button has a clear label and disabled state while the request runs.

---

## Evaluation & Acceptance

### Verification Command

```bash
pnpm lint && pnpm typecheck && TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test && pnpm --filter @idea-radar/dashboard build
```

### Demonstration
BEFORE/AFTER in `tasks/TASK_REVIEW_T027.md`: `curl -i -X POST http://localhost:4000/rescrape …` BEFORE → 404 (route absent); AFTER with token → 202 and the repo's `next_due_at` moved to now.

---

## Approach

**Pattern reference**: `apps/api/src/app.ts` routing and `BadRequest`; T017's repo page and its tests; easy-ui sessions under `apps/dashboard` from T017.
**Vital slice**: the endpoint + repo-page button.
**Cut list**: a standalone group page, rate limiting the endpoint, audit log.
- Never log the token. Never run `git push`. Never read or write `.env*`. Only `idea-radar-test-pg` on 5436.

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `apps/api/src/app.ts` (+ test) | `POST /rescrape`, repo detail tracking fields |
| `packages/db/src/tracking.ts`, `api.ts` (+ tests) | mark due, reopen job, detail query |
| `apps/dashboard/app/repos/[id]/page.tsx`, a new client button component, a server action (+ tests) | button |
| `docs/SPEC.md` | endpoint + variable |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/db/migrations/**` | applied |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/`, `.claude/**`, `memory/` | Supervisor-owned |

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
