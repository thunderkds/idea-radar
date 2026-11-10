# PRD — Idea Radar v2 (Claude-researched ideas, MCP access)
**Last updated**: 2026-11-10
**Status**: In Review
**Owner**: thunderkds

> **Scope of this document**: *What* to build and *why*. Technical decisions live in `PROJECT_SPEC.md`.
> This PRD replaces the v1 scraping spec (`docs/SPEC.md`, kept as history; code tagged `v1-scraper`).

---

## Overview

Idea Radar v1 scraped GitHub and third-party sources and scored repos into tiers. Keeping those scrapers
alive costs more than they return: GH Archive thinned ~55× and OSS Insight returns no data. v2 lets a
**Claude scheduled routine** do the research. Each day it commits an idea file to this repo; the committed
files are the database (`BRAINSTORMING_LOG.md` Option C), the deployed server loads them at boot, and the owner and a few people query the ideas from Claude
(Code/Desktop) through a hosted **MCP server**. The app does not decide what an idea is about; the
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
| US-001 | As P1, I want a daily Claude routine to research ideas and commit them to the repo, so new ideas appear with no scraper to maintain. | P1 |
| US-002 | As P1, I want each committed idea file checked and served automatically, so a bad file never corrupts the data and a good one is queryable within minutes. | P1 |
| US-003 | As P1 or P2, I want to list, search and open ideas from Claude through an MCP server, so I can explore ideas in conversation. | P1, P2 |
| US-004 | As P1, I want the old scraping code removed, so the repo only holds what v2 runs. | P1 |
| US-005 | As P1, I want the app deployed on Railway, so it runs without my machine. | P1 |

---

## Functional Requirements

| ID | Requirement | Traces to |
|----|-------------|-----------|
| FR-001 | The repo must define one idea-file format (JSON Schema) at `ideas/schema.json`; one file per routine run under `ideas/`. | US-001, US-002 |
| FR-002 | The repo must hold the routine's prompt as a file, and it must tell the routine to write a file that passes the schema and commit it to `main`. | US-001 |
| FR-003 | A validator must reject an idea file that breaks the schema, with a message naming the file and the field. | US-002 |
| FR-004 | On a push to `main` that changes `ideas/**`, CI must validate every idea file, and the deployed MCP server must redeploy and load all valid idea files at boot (an invalid file is skipped and logged, never fatal). | US-002 |
| FR-005 | Loading must be deterministic: the same files always give the same ideas. An idea keeps its `id` across files; the version from the file with the latest `date` wins (same `date`: the file name that sorts last). | US-002 |
| FR-006 | The MCP server must expose read-only tools `list_ideas` (newest first, filter by tag and date range, limit), `search_ideas` (text query over title/summary/tags) and `get_idea` (one idea by id, with its signals and sources). | US-003 |
| FR-007 | The MCP server must reject a request without a valid bearer token. | US-003 |
| FR-008 | The worker, connectors, scoring, tiering, the v1 API and the v1 dashboard must be removed from `main`; the v1 code stays reachable through the `v1-scraper` tag. | US-004 |
| FR-009 | The MCP server must deploy to Railway from this repo, with a documented setup. | US-005 |

---

## Non-Functional Requirements

| ID | Requirement | Category |
|----|-------------|----------|
| NFR-001 | No write path is exposed over HTTP: the MCP tools are read-only and the server never writes the idea files. | Security |
| NFR-002 | Secrets (the MCP token) live only in Railway variables, never in the repo. | Security |
| NFR-003 | A file committed to `main` is queryable through MCP within 10 minutes. <!-- ASSUMPTION (Supervisor default, revisit): no freshness target was stated; 10 min fits a push-triggered load. --> | Freshness |
| NFR-004 | Tool calls return in under 1 s at p95 for up to 10,000 ideas. <!-- ASSUMPTION (Supervisor default, revisit): ~20 ideas/day → ~7k/year. --> | Performance |
| NFR-005 | The pipeline has no always-on process except the MCP server. | Simplicity / cost |

---

## Success Metrics / KPIs

| Metric | Baseline | Target | How measured |
|--------|----------|--------|--------------|
| Routine runs that land as queryable ideas | 0 | ≥ 90 % of runs over 14 days | `ideas/` commits on `main` vs. days, and `/health` idea count |
| Manual fixes needed to keep data flowing | v1: scrapers broke weekly | 0 per week | Commits touching ingest code |

---

## Out of Scope

- The dashboard (deferred: MCP only first). A later task may point a new read-only UI at the ideas table.
- Any scraping, scoring, tiering or star-velocity tracking.
- Postgres (deferred until a UI or v2 chat needs it; a loader can read the same files later).
- Multiple routines writing to one file, or users writing ideas through MCP.
- Per-user accounts; one shared token for the owner and invited readers.

---

## Open Questions / Assumptions

| # | Question / Assumption | Owner | Due |
|---|----------------------|-------|-----|
| 1 | Fact (web, 2026-11-10): routines push only to `claude/*` branches unless the repo's "Allow unrestricted branch pushes" permission is on; an open report says scheduled routines can get a 403 on push. The user turns the permission on when creating the routine (`docs/deploy.md`). | thunderkds | 2026-11-17 |
| 2 | Assumption: one shared bearer token is enough for "me and some people" (drives FR-007). Revisit if the readers grow past a few people. | thunderkds | 2026-12-10 |
| 3 | Assumption: ideas are never deleted by the routine; removal is a manual DB operation. | thunderkds | 2026-12-10 |
