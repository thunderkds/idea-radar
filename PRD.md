# PRD — Idea Radar v2.1 (Claude routine → MCP write tool → Postgres → MCP read + dashboard)
**Last updated**: 2026-11-10
**Status**: In Review
**Owner**: thunderkds

> **Scope of this document**: *What* to build and *why*. Technical decisions live in `PROJECT_SPEC.md`.
> v2.1 (2026-11-10, user): the routine pushes ideas into the app through an MCP write tool; the app saves them in Railway Postgres and shows them in a token-gated dashboard. Git idea files are replaced (they let a misled routine run change deployed code).
> This PRD replaces the v1 scraping spec (`docs/SPEC.md`, kept as history; code tagged `v1-scraper`).

---

## Overview

Idea Radar v1 scraped GitHub and third-party sources and scored repos into tiers. Keeping those scrapers
alive costs more than they return: GH Archive thinned ~55× and OSS Insight returns no data. v2 lets a
**Claude scheduled routine** do the research. Each day it sends its ideas to the app with the MCP write tool
`submit_ideas`; the server saves them in Railway Postgres (`BRAINSTORMING_LOG.md`, v2.1 addendum), and the owner and a
few people query the ideas from Claude (Code/Desktop) through the same hosted **MCP server**, or read them in a
token-gated dashboard. The app does not decide what an idea is about; the
routine's prompt does.

---

## Personas

| ID | Name | Role | Pain Point |
|----|------|------|-----------|
| P1 | Owner | Builder who runs the routine and the deployment | Scrapers break and need upkeep; wants fresh ideas without maintaining a data pipeline |
| P2 | Invited reader | One of "some people" given access | Wants to ask Claude about recent ideas without cloning or running anything |

---

## User Stories

| ID | Story | Persona |
|----|-------|---------|
| US-001 | As P1, I want a daily Claude routine to research ideas and send them to the app, so new ideas appear with no scraper to maintain. | P1 |
| US-002 | As P1, I want each submission checked and saved automatically, so a bad file never corrupts the data and a good one is queryable within minutes. | P1 |
| US-003 | As P1 or P2, I want to list, search and open ideas from Claude through an MCP server, so I can explore ideas in conversation. | P1, P2 |
| US-004 | As P1, I want the old scraping code removed, so the repo only holds what v2 runs. | P1 |
| US-005 | As P1, I want the app deployed on Railway, so it runs without my machine. | P1 |
| US-006 | As P1 or P2, I want to browse and search ideas in a web dashboard after logging in, so I can review ideas without Claude. | P1, P2 |

---

## Functional Requirements

| ID | Requirement | Traces to |
|----|-------------|-----------|
| FR-001 | One idea format (JSON Schema) at `ideas/schema.json` is the contract for every submission. | US-001, US-002 |
| FR-002 | The repo holds the routine's prompt as a file; it tells the routine to research ideas and send them with the MCP tool `submit_ideas`, and never to edit the repository. | US-001 |
| FR-003 | `submit_ideas` rejects a submission that breaks the schema with a tool error naming each field; nothing is written for a rejected submission. | US-002 |
| FR-004 | A valid submission is saved in Postgres in one transaction and is visible to the read tools and the dashboard at once. Each call is logged as a run (date, routine, idea count, ok/rejected). | US-002 |
| FR-005 | An idea keeps its `id` across submissions; the version with the latest `date` wins (same date: the later submission). `first_seen` and `last_seen` are kept. Re-sending the same submission changes nothing but the run log. | US-002 |
| FR-006 | Read tools `list_ideas` (newest first, tag and date filters, limit), `search_ideas` (text over title/summary/tags/why_now) and `get_idea` (one idea with signals and sources) read from Postgres. | US-003 |
| FR-007 | Every `/mcp` request needs a bearer token. `MCP_TOKEN` (readers) allows the read tools only; `MCP_WRITE_TOKEN` (the routine) also allows `submit_ideas`. A read token calling `submit_ideas` gets an error and writes nothing. | US-001, US-003 |
| FR-008 | The worker, connectors, scoring, tiering, the v1 API and the v1 dashboard are removed from `main`; v1 stays reachable through the `v1-scraper` tag. (Done, T030.) | US-004 |
| FR-009 | The MCP server and Postgres deploy to Railway from this repo, with a documented setup for the database, the tokens, the routine's connector and the clients. | US-005 |
| FR-010 | The same service serves dashboard pages: a login form (`DASHBOARD_TOKEN` → HttpOnly session cookie), the idea list (newest first, tag/date filters, search), an idea page (signals as links), and logout. Every page but `/login` and `/health` requires the cookie. | US-006 |

---

## Non-Functional Requirements

| ID | Requirement | Category |
|----|-------------|----------|
| NFR-001 | The only write path is `submit_ideas` behind `MCP_WRITE_TOKEN`. Dashboard pages are read-only. Idea text is untrusted: the dashboard escapes all of it and links only `http(s)` URLs. | Security |
| NFR-002 | Secrets (`MCP_TOKEN`, `MCP_WRITE_TOKEN`, `DASHBOARD_TOKEN`, `DATABASE_URL`) live only in Railway variables and the routine's environment, never in the repo. Tokens are compared in constant time. | Security |
| NFR-003 | A submitted idea is queryable and visible on the dashboard immediately after `submit_ideas` returns. | Freshness |
| NFR-004 | Tool calls and dashboard pages answer in under 1 s at p95 for up to 10,000 ideas. <!-- ASSUMPTION (Supervisor default, revisit): ~20 ideas/day → ~7k/year. --> | Performance |
| NFR-005 | Always-on parts: the MCP/dashboard service and Railway Postgres; nothing else. | Simplicity / cost |

---

## Success Metrics / KPIs

| Metric | Baseline | Target | How measured |
|--------|----------|--------|--------------|
| Routine runs that land as queryable ideas | 0 | ≥ 90 % of runs over 14 days | the `runs` table (one ok row per day) |
| Manual fixes needed to keep data flowing | v1: scrapers broke weekly | 0 per week | Commits touching ingest code |

---

## Out of Scope

- Editing or deleting ideas from the dashboard or MCP (read-only for people; delete is a manual DB operation).
- Any scraping, scoring, tiering or star-velocity tracking.
- Multiple routines writing to one file, or users writing ideas through MCP.
- Per-user accounts; one shared token for the owner and invited readers.

---

## Open Questions / Assumptions

| # | Question / Assumption | Owner | Due |
|---|----------------------|-------|-----|
| 1 | Fact (web, 2026-11-10): a cloud routine cannot use MCP servers added locally; it can call a public remote MCP server registered as a claude.ai custom connector (request headers) or listed in the repo's `.mcp.json` with a header that reads a token from the routine environment. Confirm on the first run (`docs/deploy.md`). | thunderkds | 2026-11-17 |
| 2 | Assumption: one shared read token (`MCP_TOKEN`) and one dashboard token are enough for "me and some people"; the routine has its own write token (drives FR-007, FR-010). Revisit if the readers grow past a few people. | thunderkds | 2026-12-10 |
| 3 | Assumption: ideas are never deleted by the routine; removal is a manual DB operation. | thunderkds | 2026-12-10 |
