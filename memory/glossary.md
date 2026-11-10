# glossary.md — Cold Tier: Domain Terms & Domain Models

> **Rules**: Supervisor-only writes. One canonical definition per term — update in place, never duplicate. Domain Models section is populated at Stage 1 step 7 (Core Domain Models scan) and confirmed by the user.

## Domain Terms

- **Idea** — one researched project idea from the Claude routine: `id` (stable slug), `title`, `summary`, `tags`, `signals`, `related_repos`, `why_now`. The latest `date` wins across files.
- **Idea file** — one routine run's output, `ideas/<YYYY-MM-DD>[-<suffix>].json`, checked against `ideas/schema.json`.
- **Routine** — the Claude scheduled cloud agent whose prompt is `routines/daily-ideas.md`; it commits idea files to `main`.
- **Signal (v2)** — a piece of evidence attached to an idea: `{ kind, url, note }`. Not the v1 `signals` table.

## Domain Models

- 2026-11-10 (Stage 1 scan, auto mode — flagged for review): v1 models in `packages/core/src/types.ts` (repo_id, Signal, Tier) are being retired (T030). The v2 models `Idea`, `IdeaFile` and `IdeaSignal` will live in `packages/ideas/src/types.ts` (T028), generated from `ideas/schema.json`.
