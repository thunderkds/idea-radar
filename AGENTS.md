# Working in this repo

Idea Radar discovers public GitHub repos in trending, medium and lowkey tiers. Read these before changing code:

- `docs/SPEC.md` — requirements, data model, scoring rules, architecture.
- `docs/ISSUES.md` — the v1 task list with acceptance criteria (mirrors Linear, IDs `HUN-1xx`).

## Commands

```bash
cp .env.example .env              # set GITHUB_TOKEN
docker compose up -d postgres
pnpm install
pnpm build                        # builds packages in dependency order
pnpm db:migrate
pnpm typecheck
pnpm test
pnpm worker -- --once             # one ingestion pass
pnpm api                          # http://localhost:4000
pnpm dashboard                    # http://localhost:3000
```

Node 22+, pnpm 9. Commit `pnpm-lock.yaml`.

## Layout

| Path | What lives there |
| --- | --- |
| `packages/core` | Shared types, `SourceConnector` interface, tier rules and lowkey score |
| `packages/connectors` | One file per source + `buildRegistry()` |
| `packages/db` | SQL migrations, pool, data-access functions |
| `apps/worker` | Scheduler / job runner (connectors + scoring) |
| `apps/api` | Read-only HTTP API for the dashboard |
| `apps/dashboard` | Next.js dashboard |

## Rules

- **Key everything on GitHub's numeric `repo_id`.** `full_name` changes on rename; never use it as a key.
- **Only the GitHub API connector writes `repos`.** Every other source writes `signals`.
- **`displayable: false` sources (Trendshift) never reach API responses or the UI.** They may only influence scores.
- **New schema changes are new migration files** (`002_*.sql`, …); never edit an applied migration.
- **Scoring thresholds and weights live in `packages/core/src/scoring.ts`**, not scattered in queries.
- **Respect rate limits** declared on each connector; GitHub allows at most 100 concurrent requests across REST + GraphQL.
- **No secrets in code or commits.** Config comes from env (see `.env.example`).
- Tests: unit tests next to the code (`*.test.ts`); integration tests needing Postgres or tokens must skip cleanly when unavailable.

## Workflow

- One task per branch: `hun-<id>-<short-slug>`. Reference the ID in commits (`HUN-146: stream GH Archive hours`).
- Work tasks in `docs/ISSUES.md` milestone order. A task is done when its acceptance criteria are met and `pnpm typecheck` and `pnpm test` pass.
- If a change contradicts `docs/SPEC.md`, update the spec in the same PR and say why.
- `TODO(HUN-xxx)` comments in the scaffold mark where each task plugs in.
