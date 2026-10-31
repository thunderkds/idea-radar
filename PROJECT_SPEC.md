# PROJECT_SPEC.md
**Last updated**: 2026-10-31
**Version**: 1.0

> **Scope of this document**: *How* to build it safely — agent config, constraints, risk areas.
> Product intent and requirements live in `docs/SPEC.md` (snapshot of the living spec) and the task
> list with acceptance criteria in `docs/ISSUES.md`. Those two files stand in for `PRD.md`: read them
> first. Repo rules for code live at the top of `AGENTS.md` (`# Working in this repo`).

---

## Project Identity

- **Name**: Idea Radar
- **Repo**: git@github.com:thunderkds/idea-radar.git
- **Primary tech**: TypeScript (Node 22+), pnpm 9 workspaces, Postgres 16, Next.js
- **Type**: ingestion worker + read-only HTTP API + web dashboard
- **Deployment target**: not decided (HUN-159)
- **Tracker**: Linear project "Idea Radar v1" (team HUN). Board task `Txxx` ↔ Linear `HUN-1xx` mapping is on `PROJECT_KANBAN.md`.

---

## Architecture Summary

Every source is a `SourceConnector` (`packages/core/src/connector.ts`) that emits `Signal`s keyed by
GitHub numeric `repo_id`. The worker (`apps/worker`) runs connectors on a schedule and writes to Postgres
via `packages/db`. A daily scoring job writes `repo_scores`; `apps/api` serves them read-only to
`apps/dashboard`. Full detail: `docs/SPEC.md` § Architecture.

---

## Critical Constraints

Copied from `AGENTS.md` § Rules — they bind every agent:
- Key everything on GitHub's numeric `repo_id`; never key on `full_name`.
- Only the GitHub API connector writes `repos`; every other source writes `signals`.
- `displayable: false` sources (Trendshift) never reach API responses or the UI.
- Schema changes are new migration files (`002_*.sql`, …); never edit `001_init.sql`.
- Scoring thresholds and weights live in `packages/core/src/scoring.ts`.
- Respect each connector's `rateLimit`; GitHub allows at most 100 concurrent requests (REST + GraphQL).
- No secrets in code or commits; config comes from env (`.env.example`).
- Unit tests next to code (`*.test.ts`); integration tests needing Postgres or tokens skip cleanly when unavailable.
- Branch per task: `hun-<id>-<short-slug>`; commits reference the Linear ID (`HUN-142: …`).

---

## Known Risk Areas

| Area | Risk Level | Reason | Files |
|------|-----------|--------|-------|
| DB schema / migrations | Med | Applied migrations are immutable; data keyed on repo_id | `packages/db/migrations/` |
| GitHub token + rate limits | Med | Secret handling; secondary rate limits ban tokens | `packages/connectors/src/github-api.ts` |
| Trendshift licensing | Med | Raw data must never be exposed | `packages/connectors/src/trendshift.ts`, `apps/api` |
| GH Archive volume | Low | Millions of events/day; must stream | `packages/connectors/src/gh-archive.ts` |
| Trending HTML scraping | Low | Brittle; must fail loudly | `packages/connectors/src/github-trending.ts` |

---

## Sub-Agent Team

| Agent | Role | CLI Spawn Command |
|---|---|---|
| Common-Infrastructure-Agent | Env setup, test runner, deps, migrations tooling | `Agent({ subagent_type: "common-infrastructure", prompt: "..." })` |
| Backend-Implementer | Worker, connectors, db, api | `Agent({ subagent_type: "backend-developer", prompt: "..." })` |
| Frontend-Implementer | Dashboard | `Agent({ subagent_type: "frontend-developer", prompt: "..." })` |
| QA-Automation-Agent | Independent AC verification | `Agent({ subagent_type: "qa-expert", prompt: "..." })` |

---

## UI Evidence (Hard-Stop Gate 6)

Every task with a UI component (T017, T018) records its three design Evidence rows — visual regression, design-system compliance, responsiveness — with the **easy-ui** MCP server (`.mcp.json`: the local `easy-ui-mcp` container, `http://127.0.0.1:8765/mcp`). Paste the tool's verdict or screenshot path into `tasks/TASK_REVIEW_Txxx.md`. If the container is not running, the row stays unchecked and the task is not done.

---

## CLI Model Table

> No other CLI was named by the user. Per `docs/claude-md/tracks.md` § Auto mode row 14, every spawn
> runs on Claude Code with the model of the Supervisor session (no `model` override).

| CLI | Run command | C0 | C1 | C2 | C3 |
|---|---|---|---|---|---|
| Claude Code | `claude` | (session model) | (session model) | (session model) | (session model) |

---

## Glossary

| Term | Meaning |
|---|---|
| repo_id | GitHub numeric repository ID; the primary key everywhere |
| signal | One append-only observation from one source about one repo (`signals` table) |
| tier | trending / medium / lowkey classification written daily to `repo_scores` |
| shortlist | Repos with a tier-candidate signal in the last 7 days; only these get enrichment |
| displayable | Connector flag; `false` = scoring only, never shown or exposed |
| consensus_count | Distinct sources flagging a repo in the last 7 days |
