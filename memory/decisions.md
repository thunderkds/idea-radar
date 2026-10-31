# decisions.md — Cold Tier: Architectural & Infrastructure Decisions

> **Rules**: Supervisor-only writes. Each entry: `### YYYY-MM-DD — Title`, then **Decision**, **Why**, and **Files** (cite paths — the diff-driven pass greps this file by changed file path).

## Architecture

### 2026-10-31 — GH Archive ingests whole UTC days, not hours
**Decision**: T004 (HUN-146) processes each completed UTC day (hours 0..23) in one pass and writes `repo_daily` once per day, replace semantics. An hourly scheduler call with no new completed day is a no-op.
**Why**: `distinct_actors` (unique actor ids per repo per day) cannot be summed across hourly runs; replace-upsert per day keeps it exact.
**Files**: `packages/connectors/src/gh-archive.ts`, `packages/db/src/`, `tasks/TASK_GUIDE_T004.md`

## Infrastructure

### 2026-10-31 — Requirements live in docs/SPEC.md + docs/ISSUES.md; AGENTS.md is merged
**Decision**: `docs/SPEC.md` and `docs/ISSUES.md` (from origin `b21072b`) are the requirements and stand in for `PRD.md`. `AGENTS.md` = repo project rules (top) + kit doctrine (below). Kit-only copy: `memory/backups/AGENTS.kit.md`. Board `Txxx` ↔ Linear `HUN-1xx` mapping is on `PROJECT_KANBAN.md`.
**Why**: the user asked to pull the latest and use it as the requirements; the remote AGENTS.md would otherwise have replaced the kit doctrine.
**Files**: `AGENTS.md`, `docs/SPEC.md`, `docs/ISSUES.md`, `PROJECT_SPEC.md`, `PROJECT_KANBAN.md`
