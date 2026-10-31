# MEMORY.md — Hot-Tier Memory Index

> **Rules**: Supervisor-only writes. Max 42,000 characters — a ratchet: `/compact-memory` may lower
> it, never raise it to fit growth. One-line summaries + links to cold files.
> Each spawn prompt carries a slice of these lines (craft-spawn-prompt's memory_slice.py) and this
> path to read in full only when the slice falls short; the whole file is not pasted.
> Updated by the Supervisor — prompted by the PostToolUse hook on `git push` / `git merge` (diff-driven pass), or via the `/compact-memory` skill.

---

## Memory Architecture

- [decisions.md](decisions.md) — code + infra architectural decisions (the "why")
- [glossary.md](glossary.md) — canonical biz domain terms and core domain models
- [learnings.md](learnings.md) — specs/requirement clarifications, patterns, gotchas

---

## Index
- [Job queue: Postgres + run token, BullMQ deferred](decisions.md#2026-10-31--job-queue-stays-on-postgres-bullmq-deferred-t023) — T023 fencing by `attempts` + heartbeat; revisit BullMQ only on multi-host lost runs

<!-- Format: - [Title](cold-file.md#section) — one-line summary.
     Target ≤150 chars/entry. Advisory: reported by the size test, never enforced.
     The enforced gate is the 42,000-character whole-file budget above. -->
- [GH Archive day-at-a-time](decisions.md#2026-10-31--gh-archive-ingests-whole-utc-days-not-hours) — T004 writes repo_daily once per completed UTC day (exact distinct_actors)
- [Requirements + merged AGENTS.md](decisions.md#2026-10-31--requirements-live-in-docsspecmd--docsissuesmd-agentsmd-is-merged) — docs/SPEC.md + docs/ISSUES.md are the PRD; Txxx↔HUN map on the board
- [Codebase Map](codebase-map.md) — structural snapshot: directory tree, entry points, blast-radius hotspots. Refresh via /map-codebase.
- [Kit gotchas, parallel wave](learnings.md#2026-10-31--kit-gotchas-found-running-wave-1-in-parallel) — own worktrees from a base branch; bare test cmd for Gate 5; unscoped review skill names; no `<x>` in reports
- [Worker job queue](decisions.md#2026-10-31--worker-job-queue-is-an-in-repo-jobs-table-t007) — jobs table + SKIP LOCKED; score(D) after all D jobs ok; add jobs in buildHandlers/buildCaps
- [OSS Insight empty](learnings.md#2026-10-31--oss-insight-api-returns-no-data) — API returns rows [] / unavailable since 2026-03; connector silently ok (T012 must fail loudly)
