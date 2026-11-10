# Idea Radar

A Claude scheduled routine researches one batch of project ideas each day and commits it to this repo as a JSON
file. A small read-only MCP server serves those files to Claude Code and Claude Desktop. The files are the database.

```
Claude routine -> ideas/YYYY-MM-DD.json -> CI check -> Railway redeploy -> apps/mcp -> MCP tools
```

1. The routine (prompt: [`routines/daily-ideas.md`](routines/daily-ideas.md)) writes one idea file per run and pushes it to `main`.
2. CI validates every idea file against [`ideas/schema.json`](ideas/schema.json) (`pnpm ideas:check`).
3. Railway redeploys `apps/mcp` on each push to `main`.
4. At boot the server loads every valid idea file into memory and serves three read-only tools over Streamable HTTP
   (`POST /mcp`, `Authorization: Bearer <MCP_TOKEN>`): `list_ideas`, `search_ideas`, `get_idea`.

## Layout

```
ideas/             idea files + schema.json (the contract); see ideas/README.md
packages/ideas/    types, validator, loader/merge, search
apps/mcp/          MCP server: HTTP, bearer auth, tools, /health
routines/          the routine prompt
```

## Develop

Requires Node 22 and pnpm 9.

```bash
pnpm install
pnpm build
pnpm lint && pnpm typecheck && pnpm test && pnpm ideas:check
export MCP_TOKEN=$(openssl rand -hex 32)   # the server refuses to start without it; see .env.example
pnpm --filter @idea-radar/mcp dev
```

## Deploy

Railway deploy, the daily routine and client setup: [`docs/deploy.md`](docs/deploy.md). Settings live in
[`railway.json`](railway.json). To run the server locally:

```bash
pnpm install && pnpm build
MCP_TOKEN=$(openssl rand -hex 32) pnpm --filter @idea-radar/mcp start   # then: curl localhost:8080/health
```

## Docs

- Requirements: [`PRD.md`](PRD.md)
- Idea file format: [`ideas/README.md`](ideas/README.md)
- Routine prompt: [`routines/daily-ideas.md`](routines/daily-ideas.md)
- Agent and contributor guide: [`AGENTS.md`](AGENTS.md)
- v1 history (GitHub scraping, tiers, dashboard): [`docs/SPEC.md`](docs/SPEC.md), [`docs/ISSUES.md`](docs/ISSUES.md);
  the v1 code is in git tag `v1-scraper`.

## License

MIT, see [`LICENSE`](LICENSE).
