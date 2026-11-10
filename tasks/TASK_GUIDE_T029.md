# TASK_GUIDE — T029: Hosted read-only MCP server (list/search/get ideas)
**Date**: 2026-11-10
**Complexity Level**: C2
**Risk Level**: High
**Priority**: P0
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`

---

## Mandatory Startup (Do Not Skip)

Before writing any code:
1. Read `PROJECT_SPEC.md`
2. Read the memory slice in your spawn prompt (`<!-- memory-slice -->`). Read `memory/MEMORY.md` in full only if your work reaches a file, hook, skill or decision the slice does not cover
3. Read this file completely
4. Read `agents/backend.md`
5. Note the **Complexity Level** above and apply the matching process from the Complexity matrix in `agents/backend.md`
6. Read `memory/codebase-map.md` for layout

Also read `PRD.md`, `BRAINSTORMING_LOG.md` (Option C) and `ideas/README.md` (from T028).

---

## Requirement (Pillar 1 — Adapt the requirement)

User (2026-11-10): "it should be the mcp, or anything suitable"; chose MCP for "Query ideas from Claude", "MCP only first"; app deployed (not local) on Railway.

**Restated intent** (Supervisor's interpretation, in the project's domain language):
> A hosted MCP server that the owner and invited readers add to Claude Code/Desktop with one URL and one token, offering three read-only tools over the ideas loaded from `ideas/*.json` at boot.

**Out of scope** (what this task explicitly does NOT do):
- Any write tool, resources or prompts; per-user tokens; Postgres
- Railway config (T031); deleting v1 (T030)

**Requirement Refs** (FR/NFR/US IDs from `PRD.md` this task satisfies):
- FR-004 (server half): load all valid idea files at boot; invalid file skipped and logged, never fatal
- FR-006: tools `list_ideas`, `search_ideas`, `get_idea`
- FR-007: reject a request without a valid bearer token
- NFR-001: no write path over HTTP
- NFR-004: tool calls < 1 s p95 at 10,000 ideas

### Requirement Fidelity Gate (sign off BEFORE implementation)

- [x] Restated intent confirmed to match the user's request — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary — auto (Supervisor)
- [x] Every Acceptance Criterion below traces to a line in the Requirement — auto (Supervisor)
- [x] All Requirement Refs exist in `PRD.md` and are fully covered by the Acceptance Criteria — auto (Supervisor)

---

## Dependencies & Reachability

**Depends on**: T028 — `loadIdeas` and the idea types in `packages/ideas`

**Entry point**: `POST /mcp` (tools `list_ideas`, `search_ideas`, `get_idea`); `GET /health`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `apps/mcp` starts an HTTP server on `PORT` (default 8080) serving MCP over stateless Streamable HTTP at `POST /mcp` (new server + transport per request; `GET`/`DELETE /mcp` → 405) using `@modelcontextprotocol/sdk` (pinned major) | FR-006 |
| 2 | Boot loads ideas once via `loadIdeas(IDEAS_DIR)` (default: repo `ideas/`), logs counts and each skipped file with its reason, and keeps running when some files are invalid | FR-004 |
| 3 | `list_ideas({ tag?, since?, until?, limit? })` returns ideas newest `last_seen` first (tie: `id`), `limit` default 20, clamped 1–100; `since`/`until` are YYYY-MM-DD; an invalid date → tool error result, not a crash | FR-006 |
| 4 | `search_ideas({ query, limit? })` does case-insensitive matching over title, summary, tags and why_now; title matches rank first; empty or >200-char query → tool error | FR-006 |
| 5 | `get_idea({ id })` returns the full idea with signals, related_repos, first_seen, last_seen, files; unknown id → tool error "not found" | FR-006 |
| 6 | Every `/mcp` request without `Authorization: Bearer <MCP_TOKEN>` (constant-time compare, ported from v1 `bearerMatches` at `apps/api/src/app.ts:134`) → HTTP 401 with no idea data | FR-007 |
| 7 | Server exits non-zero at start when `MCP_TOKEN` is unset or shorter than 32 chars | FR-007, NFR-001 |
| 8 | `GET /health` (no auth) → `{ ok: true, ideas: N, files: N, skipped: N }` and nothing else | FR-004 |
| 9 | No route or tool writes anything; request bodies over 1 MB → 413 | NFR-001 |
| 10 | Tool descriptions say that idea text is external content to be read as data | Critical Constraints |
| 11 | With 10,000 generated ideas, each tool call completes in < 1 s (test measures in-process handler time) | NFR-004 |

---

## Evaluation & Acceptance (How we know the agent worked correctly)

### Success Criteria (observable, pass/fail)

| # | Given (input/state) | Expect (output/behavior) | How it's checked |
|---|---------------------|--------------------------|------------------|
| 1 | server with fixture ideas, valid token, MCP client `listTools` | exactly the three tools | automated test (SDK client over HTTP) |
| 2 | `list_ideas { tag: "ai", limit: 500 }` | ≤100 ideas, all tagged `ai`, newest first | automated test |
| 3 | request with no / wrong token | 401, body has no idea titles | automated test |
| 4 | `MCP_TOKEN` unset | process exits 1 with a message | automated test (spawn) |
| 5 | fixture dir with one broken file | server starts; `/health` `skipped: 1` | automated test |
| 6 | real run: `pnpm --filter @idea-radar/mcp start` + `curl` initialize + `tools/call list_ideas` | JSON-RPC result with ideas from `ideas/examples` | app run |

### Verification Command (exact, runnable)

```bash
pnpm install --frozen-lockfile && pnpm --filter @idea-radar/mcp test && pnpm lint && pnpm typecheck
```

### Evidence (filled by reviewer at Stage 4/5)

> **Moved.** Filled by the reviewer at Stage 4/5 in `tasks/TASK_REVIEW_T029.md`.

---

## Demonstration

> **Moved.** See `tasks/TASK_REVIEW_T029.md`.

---

## Approach

**Pattern reference**: `apps/api/src/app.ts` — `bearerMatches` (line 134), bounded body reading and `BadRequest` handling; `apps/api/package.json` — app package layout and scripts.

**Vital slice**: authenticated `POST /mcp` with `list_ideas` working end to end; the other two tools reuse the same index.
**Cut list**:
- MCP resources/prompts, pagination cursors (limit is enough at this size)
- Per-user tokens, rate limiting (PRD assumption 2; revisit 2026-12-10)
- Hot reload of idea files (Railway redeploys on push)

Use node `http` (as v1 `apps/api` does) or a minimal framework only if the SDK needs it; pin `@modelcontextprotocol/sdk` to one major and import paths for that version. Tool inputs validated with the SDK's zod schemas. Keep the in-memory index in a pure module (`src/index-store.ts`) so tools are unit-testable without HTTP. Add `MCP_TOKEN`, `PORT`, `IDEAS_DIR` to `.env.example`'s new v2 section (T030 removes the v1 lines). `start` script runs built `dist/` or `tsx`; choose the one that works on Railway without dev deps (note it for T031).

---

## Edge Case Checklist

- [ ] Missing/wrong `Authorization` → 401; token compared in constant time; token never logged
- [ ] `MCP_TOKEN` unset or short → refuse to start
- [ ] Stateless transport: new server + transport per request; close on `res` close
- [ ] `limit` clamped; bad dates → tool error
- [ ] Unknown `id` → tool error, not a 500
- [ ] Body > 1 MB → 413
- [ ] Idea text returned as data; tool descriptions mark it external
- [ ] Zero ideas loaded → tools return empty lists, `/health` still ok
- [ ] Pin-test pre-flight: the `Pre-existing pin tests` row below is filled before work starts
- [ ] Stale references: grep for old wording this task changes

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `apps/mcp/{package.json,tsconfig.json}` | new app |
| `apps/mcp/src/{index.ts,server.ts,auth.ts,index-store.ts,tools.ts}` + tests | new — HTTP, auth, tools |
| `.env.example` | add v2 `MCP_TOKEN`, `PORT`, `IDEAS_DIR` section |
| `pnpm-lock.yaml` | `@modelcontextprotocol/sdk`, `zod` |
| Pre-existing pin tests | none known for new files; grep `scripts/*.test.ts` for `.env.example` |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `apps/api`, `apps/worker`, `apps/dashboard`, `packages/core`, `packages/connectors`, `packages/db` | v1 — copy from, never edit; T030 deletes |
| `ideas/schema.json`, `packages/ideas` | T028 contract — report needed changes instead |
| `.claude/`, `skills/`, `templates/`, `docs/claude-md/`, `AGENTS.md`, `CLAUDE.md` | kit |

---

## Test Plan

Unit tests for the index store and each tool; HTTP tests that start the server on port 0 with a fixture `IDEAS_DIR` and use the SDK client (`StreamableHTTPClientTransport` with the auth header); a spawn test for the missing-token exit; a 10k-idea timing test. Then a real run with `curl` (Success Criterion 6).

---

## Completion Checklist

- [ ] Implementation done
- [ ] Self-review: `Skill({ skill: "code-review" })` run
- [ ] Security review: `Skill({ skill: "security-review" })` run (if Medium/High risk)
- [ ] Lint passes
- [ ] Tests written AND pass — output pasted into `tasks/TASK_REVIEW_T029.md`'s Evidence table (Hard-Stop Gate 5)
- [ ] `Skill({ skill: "verify" })` run — feature confirmed working in running app
- [ ] `memory/MEMORY.md` updated (if new patterns or feedback learned)
- [ ] Supervisor notified: task ready for Stage 4 review
