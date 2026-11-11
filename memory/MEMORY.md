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
- [CI dry run via draft PR; v2.1 green on Postgres 16](learnings.md#2026-11-11--first-real-ci-run-of-v21-dry-run-through-a-draft-pr-t033-t036) — ci.yml triggers only on main push and PRs; PR #1 131/131 on a real Postgres 16, 0 skipped
- [Routine writes only via connector](decisions.md#2026-11-11--routine-writes-only-through-the-connector-the-write-token-stays-out-of-the-models-context-t036) — one `submit_ideas` call, no repo access; write token in connector header, not env; git ingest removed
- [T036 docs/prompt gotchas, v2.1 close-out](learnings.md#2026-11-11--routine-ingest-over-mcp-docs-and-prompt-gotchas-v21-close-out-t036) — watchPatterns needs /packages/db/**; `.env.example` denied even to git grep; user merges when the hook verify row is missing
- [Dashboard: stateless HMAC cookie, CSP style hash](decisions.md#2026-11-11--dashboard-stateless-hmac-session-cookie-one-inline-style-under-a-csp-hash-filters-after-search-t035) — cookie = expiry.HMAC(DASHBOARD_TOKEN), CSRF via Origin/Sec-Fetch-Site; filters apply to first 100 search hits
- [Routine prompt cost/depth, GitHub pages, merge gate (T037-T038)](learnings.md#2026-11-11--routine-prompt-cost-and-depth-github-pages-as-the-source-merge-gate-behaviour-t037-t038) — rows in search-page script JSON; repo page ≈5k tokens; `raw/` 302s to another host; gate reads main's board; shared main checkout
- [Dashboard CSP/CSRF/verify gotchas](learnings.md#2026-11-11--dashboard-on-the-mcp-server-csp-csrf-and-verification-gotchas-t035) — CSP hash covers exact style text; no-referrer gives Origin null; check pages live in a real browser
- [v2.1: Postgres store behind the MCP](decisions.md#2026-11-10--v21-postgres-store-behind-the-mcp-v2-files-are-the-database-superseded-t033t036) — routine → `submit_ideas` → Railway Postgres; merge rule newer-date-wins; tests refuse non-loopback DB; supersedes v2 files-as-DB
- [`/health` is {ok} only](decisions.md#2026-11-10--health-is-ok-only-no-counts-on-the-public-route-t034) — public route returns {ok} after SELECT 1 (2 s); counts not public; 3-Advocate Debate; amends T034 AC5
- [MCP write tool gotchas](learnings.md#2026-11-10--mcp-write-tool-on-postgres-sdk-validator-and-agent-gotchas-t034) — SDK isError for unregistered tool; loose zod for submit_ideas; pool has no connect timeout; resume stalled agent; .env.example blocked
- [Auto-mode gates (Gate 5, Debate, [admin] merge)](learnings.md#2026-11-10--auto-mode-gates-that-bit-t033-gate-5-debate-admin-merge) — `pnpm test` only counts; High risk needs a 3-Advocate Debate; name the task + commit the verify row; `main` push stays the user's
- [Railway + routine facts](learnings.md#2026-11-10--railway-watch-patterns-routines-are-now-scheduled-tasks-t031) — leading-slash watchPatterns, start with node dist, routines push where the prompt says (toggle not in docs)
- [v2 pivot: routine → idea files → MCP](decisions.md#2026-11-10--v2-pivot-claude-routine--idea-files-in-git--hosted-read-only-mcp-scraping-retired-t028t031) — files are the DB, CI checks, Railway redeploys apps/mcp; v1 in tag v1-scraper
- [Tracking strategy: snapshots, idea groups, leaders](decisions.md#2026-10-31--tracking-strategy-github-api-snapshots-idea-groups-leaders-t024t027) — GH Archive shrank ~55×; star velocity from daily GitHub API snapshots; 1–2 leaders per idea group daily, rest weekly, parked on request (v1, retired)
- [Re-scrape via ADMIN_TOKEN; keep dashboard private](decisions.md#2026-10-31--re-scrape-on-request-via-admin_token-dashboard-must-stay-private-until-auth-t027) — only write route `POST /rescrape`; the dashboard server action is public, so no public launch before login/rate limit (v1, retired)
- [Job queue: Postgres + run token, BullMQ deferred](decisions.md#2026-10-31--job-queue-stays-on-postgres-bullmq-deferred-t023) — T023 fencing by `attempts` + heartbeat; revisit BullMQ only on multi-host lost runs (v1, retired)

<!-- Format: - [Title](cold-file.md#section) — one-line summary.
     Target ≤150 chars/entry. Advisory: reported by the size test, never enforced.
     The enforced gate is the 42,000-character whole-file budget above. -->
- [GH Archive day-at-a-time](decisions.md#2026-10-31--gh-archive-ingests-whole-utc-days-not-hours) — T004 writes repo_daily once per completed UTC day (exact distinct_actors) (v1, retired)
- [Requirements + merged AGENTS.md](decisions.md#2026-10-31--requirements-live-in-docsspecmd--docsissuesmd-agentsmd-is-merged) — docs/SPEC.md + docs/ISSUES.md are the PRD; Txxx↔HUN map on the board
- [Codebase Map](codebase-map.md) — structural snapshot: directory tree, entry points, blast-radius hotspots. Refresh via /map-codebase.
- [Kit gotchas, parallel wave](learnings.md#2026-10-31--kit-gotchas-found-running-wave-1-in-parallel) — own worktrees from a base branch; bare test cmd for Gate 5; unscoped review skill names; no `<x>` in reports
- [Worker job queue](decisions.md#2026-10-31--worker-job-queue-is-an-in-repo-jobs-table-t007) — jobs table + SKIP LOCKED; score(D) after all D jobs ok; add jobs in buildHandlers/buildCaps (v1, retired)
- [OSS Insight empty](learnings.md#2026-10-31--oss-insight-api-returns-no-data) — API returns rows [] / unavailable since 2026-03; connector silently ok (T012 must fail loudly) (v1, retired)
