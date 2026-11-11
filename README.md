# Idea Radar

A Claude scheduled routine researches one batch of project ideas each day and sends it to a small MCP server with
the write tool `submit_ideas`. The server saves the ideas in Postgres and serves them to Claude Code and Claude
Desktop (read tools) and to a browser (dashboard).

```
Claude routine -> MCP submit_ideas -> apps/mcp (Railway) -> Postgres -> MCP read tools + dashboard
```

1. The routine (prompt: [`routines/daily-ideas.md`](routines/daily-ideas.md)) calls `submit_ideas` once per run
   (`Authorization: Bearer <MCP_WRITE_TOKEN>`). It never touches this repository.
2. The server checks the submission against [`ideas/schema.json`](ideas/schema.json) and saves it in Postgres in one
   transaction. A submission that breaks the schema is rejected with each wrong field named; nothing is saved.
3. Claude reads the ideas over Streamable HTTP (`POST /mcp`, `Authorization: Bearer <MCP_TOKEN>`): `list_ideas`,
   `search_ideas`, `get_idea`.
4. A browser reads them on the dashboard (`/login` with `DASHBOARD_TOKEN`, then `/` and `/ideas/:id`).

## Layout

```
ideas/             schema.json (the submission contract), examples/; see ideas/README.md
packages/ideas/    types and the validator for a submission
packages/db/       Postgres pool, migrations, idea upsert and queries
apps/mcp/          MCP server: HTTP, bearer auth, tools, dashboard pages, /health
routines/          the routine prompt
```

## Environment

The server refuses to start unless all four are set (see `.env.example`). The three tokens must each be at
least 32 characters and all different.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection URL; the server creates and updates its tables at boot |
| `MCP_TOKEN` | read role: `list_ideas`, `search_ideas`, `get_idea` |
| `MCP_WRITE_TOKEN` | write role: the read tools and `submit_ideas` (the routine only) |
| `DASHBOARD_TOKEN` | dashboard login only; never opens `/mcp` |
| `PORT` | optional, default 8080 (Railway sets it) |

## Develop

Requires Node 22 and pnpm 9. The tests that touch the database run only when `TEST_DATABASE_URL` points at a
Postgres (CI provides one; `pnpm --filter @idea-radar/db test:server` starts a local one).

```bash
pnpm install
pnpm build
pnpm lint && pnpm typecheck && pnpm test
export DATABASE_URL=postgres://<user>:<password>@localhost:5432/<db>
export MCP_TOKEN=$(openssl rand -hex 32) MCP_WRITE_TOKEN=$(openssl rand -hex 32) DASHBOARD_TOKEN=$(openssl rand -hex 32)
pnpm --filter @idea-radar/mcp dev
```

## Deploy

Railway deploy with Postgres, the daily routine, the dashboard login and client setup:
[`docs/deploy.md`](docs/deploy.md). Settings live in [`railway.json`](railway.json). To run the server locally,
set the variables above, then:

```bash
pnpm install && pnpm build
pnpm --filter @idea-radar/mcp start   # then: curl localhost:8080/health   -> {"ok":true}
```

## Docs

- Requirements: [`PRD.md`](PRD.md)
- Submission format: [`ideas/README.md`](ideas/README.md)
- Routine prompt: [`routines/daily-ideas.md`](routines/daily-ideas.md)
- Agent and contributor guide: [`AGENTS.md`](AGENTS.md)
- v1 history (GitHub scraping, tiers, dashboard): [`docs/SPEC.md`](docs/SPEC.md), [`docs/ISSUES.md`](docs/ISSUES.md);
  the v1 code is in git tag `v1-scraper`.

## License

MIT, see [`LICENSE`](LICENSE).
