# Idea Radar

Discover public GitHub repos in three tiers — **trending**, **medium** and **lowkey** — and see which ideas and stacks are rising. 

- Spec: [Idea Radar — v1 Spec](https://claude.ai/artifact/3tr3iGY9jjLTiCm21Ejyta)
- Tracker: [Linear project](https://linear.app/thunderkds/project/idea-radar-v1-8d2ecdbf26cf)

## Roadmap

| Version | Scope |
| --- | --- |
| v1 | GitHub + GitHub-derived sources, three tiers, dashboard |
| v2 | Chatbot over stored data: explore ideas, match contributors to good-first-issues |
| v3 | More sources (GitLab, Medium, …) as new connectors |

## Sources (v1)

| Source | Role | Required |
| --- | --- | --- |
| GitHub API | Canonical repo metadata, README, manifests | Yes |
| GH Archive | Star/fork/push velocity for all public repos (lowkey tier) | Yes |
| GitHub Trending page | "Officially trending" flag | Yes |
| OSS Insight | Trending by period/language, collections as categories | Optional |
| Trendshift | Engagement spikes — **scoring only, never displayed** (license) | Optional |
| GitHub Explorer | AI/agent curation signal | Optional |
| Star History | Chart embeds on repo pages only | Optional |

Every source implements `SourceConnector` (`packages/core/src/connector.ts`) and writes **signals** keyed by GitHub repo id. Only the GitHub API connector writes repo metadata.

## Layout

```
apps/
  worker/      scheduler: runs connectors (hourly/daily) and the scoring job
  api/         read-only API for the dashboard
  dashboard/   Next.js dashboard
packages/
  core/        shared types, SourceConnector interface, tier scoring
  connectors/  one file per source + buildRegistry()
  db/          Postgres migrations and pool
```

## Getting started

```bash
cp .env.example .env          # add GITHUB_TOKEN
docker compose up -d postgres
pnpm install
pnpm build
pnpm db:migrate
pnpm worker                   # add -- --once for a single run
pnpm api
pnpm dashboard                # http://localhost:3000
```

Requires Node 22.6+ for the `--experimental-strip-types` dev scripts (or run the built `dist/` output on Node 20).
