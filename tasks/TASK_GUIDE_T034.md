# TASK_GUIDE — T034: MCP `submit_ideas` write tool + read tools on Postgres
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

Also read `PRD.md` (v2.1), `apps/mcp/src/*.ts` and `packages/db` (T033).

---

## Requirement (Pillar 1 — Adapt the requirement)

User (2026-11-10): "claude scan and push to the app mcp, the app will execute and save data".

**Restated intent** (Supervisor's interpretation, in the project's domain language):
> The routine calls one MCP tool, `submit_ideas`, with a day's ideas; the server validates them against the schema and saves them in Postgres. Readers keep the same three read tools, now backed by Postgres. A read token can never write.

**Out of scope** (what this task explicitly does NOT do):
- Dashboard pages (T035); removing git file loading, CI `ideas:check`, routine prompt and docs (T036)

**Requirement Refs** (FR/NFR/US IDs from `PRD.md` this task satisfies):
- FR-003: reject an invalid submission with field errors, write nothing (log a rejected run)
- FR-004: valid submission saved, visible at once
- FR-006: read tools on Postgres
- FR-007: `MCP_TOKEN` → read tools only; `MCP_WRITE_TOKEN` → read + `submit_ideas`
- NFR-001, NFR-002, NFR-003

### Requirement Fidelity Gate (sign off BEFORE implementation)

- [x] Restated intent confirmed to match the user's request — Supervisor, 2026-11-10
- [x] Domain terms align with `PROJECT_SPEC.md` glossary — Supervisor
- [x] Every Acceptance Criterion below traces to a line in the Requirement — Supervisor
- [x] All Requirement Refs exist in `PRD.md` and are fully covered by the Acceptance Criteria — Supervisor

---

## Dependencies & Reachability

**Depends on**: T033 — `@idea-radar/db` (`migrate`, `saveSubmission`, `logRejected`, queries)

**Entry point**: `submit_ideas` (MCP tool on `POST /mcp`)

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | Boot: refuse to start (exit 1, clear message, no secret echoed) unless `DATABASE_URL`, `MCP_TOKEN`, `MCP_WRITE_TOKEN`, `DASHBOARD_TOKEN` are set, each token ≥32 chars and all three different; then run `migrate` before listening | FR-007, NFR-002 |
| 2 | Auth decides the tool set per request: `MCP_WRITE_TOKEN` → 4 tools; `MCP_TOKEN` → the 3 read tools only (`submit_ideas` not listed, and a call to it → tool error, nothing written); anything else → 401 | FR-007 |
| 3 | `submit_ideas` input is one idea file (`schema_version`, `date`, `routine`, `ideas[]`); it runs `validateIdeaFile` (same schema); invalid → tool error listing each field error, a `rejected` run row, no idea rows; valid → `saveSubmission`, result `{saved: N, date}` | FR-003, FR-004 |
| 4 | `list_ideas` / `search_ideas` / `get_idea` keep their names, inputs, compact list shape and descriptions (idea text is external, untrusted) but read from Postgres | FR-006 |
| 5 | `/health` -> `{ok:true}` 200 after a DB probe; `{ok:false}` 503 when the DB does not answer or times out; no counts, no idea text, no error text | FR-004 |
| 6 | The old file loader path (`IDEAS_DIR`, `loadIdeas` at boot) is no longer used by the server | FR-004 |
| 7 | A `submit_ideas` body over 1 MB → 413 (existing cap); tool descriptions for `submit_ideas` say it is for the routine only | NFR-001 |

---

## Evaluation & Acceptance (How we know the agent worked correctly)

### Success Criteria (observable, pass/fail)

| # | Given (input/state) | Expect (output/behavior) | How it's checked |
|---|---------------------|--------------------------|------------------|
| 1 | write token, valid file | `{saved: 1}`; `get_idea` returns it at once | integration test (SDK client over HTTP + test DB) |
| 2 | read token calls `submit_ideas` | tool error; idea count unchanged | integration test |
| 3 | write token, file with a bad url | tool error naming `/ideas/0/signals/0/url`; a `rejected` run; no idea rows | integration test |
| 4 | read token `listTools` | 3 tools | integration test |
| 5 | missing `MCP_WRITE_TOKEN` | exit 1 | spawn test |
| 6 | DB stopped | `/health` 503 | integration test |
| 7 | real run with a local Postgres | curl `submit_ideas` then `list_ideas` shows it | app run |

### Verification Command (exact, runnable)

```bash
TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres pnpm --filter @idea-radar/mcp test && pnpm lint && pnpm typecheck
```

### Evidence (filled by reviewer at Stage 4/5)

> **Moved.** Filled by the reviewer at Stage 4/5 in `tasks/TASK_REVIEW_T034.md`.

---

## Demonstration

> **Moved.** See `tasks/TASK_REVIEW_T034.md`.

---

## Approach

**Pattern reference**: `apps/mcp/src/server.ts` (per-request McpServer, auth before body), `apps/mcp/src/tools.ts` (handlers return tool errors, never throw), `apps/mcp/src/auth.ts` (`bearerMatches`).

**Vital slice**: write-token `submit_ideas` → Postgres → read tool sees it.
**Cut list**: per-reader tokens; rate limiting; deleting ideas.

Resolve the caller's role once in `createHttpServer` (`"write" | "read" | undefined`) and pass it to `registerTools(mcp, store, role)`; register `submit_ideas` only for `"write"`, and guard inside the handler too. Replace the in-memory `IdeaStore` with a Postgres-backed one keeping the same interface so the tool handlers barely change. Tests skip DB parts cleanly without `TEST_DATABASE_URL`, and CI has the Postgres service from T033.

---

## Edge Case Checklist

- [ ] Same token value for read and write → refuse to start
- [ ] Token never logged; `submit_ideas` errors never echo the token
- [ ] Rejected submission logged without the full payload (only the error list, truncated)
- [ ] DB error during `saveSubmission` → tool error, nothing written, run marked rejected
- [ ] Migrations run before `listen`; a failing migration → exit 1
- [ ] Pin-test pre-flight: the `Pre-existing pin tests` row below is filled before work starts
- [ ] Stale references: `.env.example`, README env section (T036 owns docs, but `.env.example` here)

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `apps/mcp/src/{index,server,tools,auth,index-store}.ts` + tests | roles, write tool, Postgres store, boot checks, health |
| `apps/mcp/package.json` | depend on `@idea-radar/db` |
| `.env.example` | `DATABASE_URL`, `MCP_WRITE_TOKEN`, `DASHBOARD_TOKEN`; drop `IDEAS_DIR` |
| `pnpm-lock.yaml` | workspace link |
| Pre-existing pin tests | `apps/mcp/src/*.test.ts` that start the server with `IDEAS_DIR` fixtures — repoint to the DB store |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/db/**` | T033 — report needed changes |
| `ideas/schema.json`, `packages/ideas/**` | contract |
| `.claude/`, `skills/`, `templates/`, `docs/claude-md/`, `AGENTS.md`, `CLAUDE.md` | kit |

---

## Test Plan

Integration tests per Success Criteria (SDK client over HTTP against a test DB); spawn tests for boot checks; then the real run (Success Criterion 7).

---

## Completion Checklist

- [ ] Implementation done
- [ ] Self-review: `Skill({ skill: "code-review" })` run
- [ ] Security review: `Skill({ skill: "security-review" })` run (if Medium/High risk)
- [ ] Lint passes
- [ ] Tests written AND pass — output pasted into `tasks/TASK_REVIEW_T034.md`'s Evidence table (Hard-Stop Gate 5)
- [ ] `Skill({ skill: "verify" })` run — feature confirmed working in running app
- [ ] Supervisor notified: task ready for Stage 4 review
