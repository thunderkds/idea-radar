# TASK_GUIDE — T041: `submit_ideas` tool text says "submission", not "idea file"
**Date**: 2026-11-11
**Complexity Level**: C1
**Risk Level**: Low
**Priority**: P2
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

Also read `apps/mcp/src/tools.ts`, `apps/mcp/src/index-store.ts`, `apps/mcp/src/tools.test.ts`, `apps/mcp/src/server.test.ts` and `scripts/repo-hygiene.test.ts` (the T040 schema-wording test).

> Read relevant files from `docs/legacy/` before making any code changes.

---

## Requirement (Pillar 1 — Adapt the requirement)

User (2026-11-11): "do T041 now", after the Supervisor named it as the open P3 of T040.

**Restated intent**: The description of the MCP tool `submit_ideas` (`apps/mcp/src/tools.ts:16`) is shown to the routine's model. It still calls the input "one idea file" and says "send the whole file again", the v1/v2 file design. A submission is now the argument of the tool, not a file; the routine prompt says "submission". Reword the tool description (and the one doc comment at `apps/mcp/src/index-store.ts:39`) to say "submission", and pin it with a test. No behaviour change.

**Out of scope**: any tool name, input schema, error text, limit or validation; `PROJECT_SPEC.md` glossary entry `idea file` (it is a defined term that points to `ideas/schema.json`, so it stays); `.env.example`; `routines/daily-ideas.md`; T039 files.

**Requirement Refs**: FR-001 (the contract), FR-002 (routine prompt and tool agree).

### Requirement Fidelity Gate

- [x] Restated intent matches the user's request — Supervisor, 2026-11-11
- [x] Domain terms align with `PROJECT_SPEC.md` — Supervisor
- [x] Every Acceptance Criterion traces to the Requirement — Supervisor

---

## Dependencies & Reachability

**Depends on**: T040 (merged); **Entry point**: `TOOL_DESCRIPTIONS.submit_ideas` in `apps/mcp/src/tools.ts` (served in `tools/list` to a write token)

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to |
|---|----------------------|-----------|
| 1 | `TOOL_DESCRIPTIONS.submit_ideas` says the input is one submission and to send the whole submission again; it no longer contains `idea file`, `whole file` or `idea schema` ("idea schema" becomes "the submission schema" or equivalent). It keeps: "For the daily research routine only: readers must not call this", the fields `schema_version 1, date YYYY-MM-DD, routine, ideas[]`, "nothing is saved" on a wrong field, the update-by-id rule, and `Returns { saved, date }` | FR-001 |
| 2 | The doc comment at `apps/mcp/src/index-store.ts:39` says "submission" instead of "idea file". Comment only | FR-001 |
| 3 | A test in `apps/mcp/src/tools.test.ts` fails if the `submit_ideas` description contains `idea file` or `whole file` again, and still asserts `routine only` | FR-001 |
| 4 | Nothing else in `apps/mcp/src` changes: `git diff --stat` shows `tools.ts`, `index-store.ts`, `tools.test.ts` only (plus `tasks/TASK_REVIEW_T041.md`) | Surgical Changes |
| 5 | Mutation recorded in `tasks/TASK_REVIEW_T041.md`: put "idea file" back in the description (test red), restore, re-run green | Gate 5 |
| 6 | `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` pass, 0 skipped (database tests need `TEST_DATABASE_URL`, see `memory/learnings.md`) | all |

---

## Evaluation & Acceptance

### Verification Command

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check
```

### Evidence

> **Moved.** Filled in `tasks/TASK_REVIEW_T041.md`.

---

## Demonstration

> **Moved.** See `tasks/TASK_REVIEW_T041.md`.

BEFORE capture to take first: quote verbatim the current `submit_ideas` description (`apps/mcp/src/tools.ts:16`) and the comment at `index-store.ts:39`.

---

## Approach

**Vital slice**: reword the string, reword the comment, add the test. **Cut list**: renaming the glossary term; rewording any other tool description; changing error text.

**Check before editing**: `grep -rn "idea file\|whole file\|idea schema" apps packages scripts` (excluding `node_modules` and `dist/`) and list every hit in the report. The existing tests at `tools.test.ts:127` and `server.test.ts:111` match `routine only`; keep that phrase.

---

## Edge Case Checklist

- [ ] The routine prompt hygiene tests still pass (they read the prompt, not the tool text)
- [ ] `dist/` is build output, not edited by hand
- [ ] No token, real domain or project id in any text

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `apps/mcp/src/tools.ts` | `submit_ideas` description wording |
| `apps/mcp/src/index-store.ts` | one doc comment |
| `apps/mcp/src/tools.test.ts` | one small test (or an added assertion) |
| `tasks/TASK_REVIEW_T041.md` | evidence |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| any tool name, input schema, limit, error message | contract |
| `ideas/schema.json`, `packages/**` | unchanged |
| `.env.example` | permission rule |
| `.claude/`, `skills/`, `templates/`, `docs/claude-md/`, `AGENTS.md`, `CLAUDE.md`, `AGENTS.md.bak-*` | kit |

---

## Test Plan

Test-first: write the test, see it red on the current text, then reword and see it green. Record the mutation. Run the Verification Command.

---

## Completion Checklist

- [ ] Implementation done
- [ ] Lint passes
- [ ] Tests written AND pass — output in `tasks/TASK_REVIEW_T041.md`
- [ ] Supervisor notified: task ready for Stage 4 review (the Supervisor runs code-review, security-review and verify)
