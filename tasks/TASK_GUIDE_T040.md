# TASK_GUIDE — T040: Cleanup — PORT wording in deploy.md, stale "idea file" wording in the schema and PRD
**Date**: 2026-11-11
**Complexity Level**: C1
**Risk Level**: Medium
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

Also read `docs/deploy.md` (step 5 variables and step 6 Networking, and the troubleshooting row about the health check), `apps/mcp/src/index.ts`, `ideas/schema.json`, `PRD.md` and `scripts/repo-hygiene.test.ts`.

> Read relevant files from `docs/legacy/` before making any code changes.

---

## Requirement (Pillar 1 — Adapt the requirement)

User (2026-11-11): "just care about if you clean the pending tasks or not", then "yes, let go" to the Supervisor's cleanup proposal (T040: the `PORT` note, the schema wording and the merged worktrees).

**Restated intent**: Two leftovers from earlier tasks stay wrong in the repo: (1) `docs/deploy.md` says "Do not set `PORT`", while the server defaults to 8080 when `PORT` is unset (`apps/mcp/src/index.ts:3`), Railway injects its own `PORT`, and Railway's domain dialog asks which port the app listens on, so a reader who sets `PORT=8080` and enters 8080 is correct; (2) `ideas/schema.json` (and the PRD) still describe the contract as an "idea file" in `ideas/<date>.json`, the v1/v2 design, although a submission is now the argument of `submit_ideas`. Fix the wording and pin it with a test. No behaviour changes.

**Out of scope**: any change to a schema keyword that affects validation (`required`, `properties`, `pattern`, limits); code comments in `apps/mcp/src/tools.ts` and `apps/mcp/src/index-store.ts` that say "idea file" (list them in the report, do not edit); `.env.example` (permission rule, the user edits it); removing worktrees (the Supervisor does that); T039.

**Requirement Refs**: FR-001 (the schema is the contract), NFR-002 (docs hold no real secrets); `docs/deploy.md` accuracy.

### Requirement Fidelity Gate

- [x] Restated intent matches the user's request — Supervisor, 2026-11-11
- [x] Domain terms align with `PROJECT_SPEC.md` — Supervisor
- [x] Every Acceptance Criterion traces to the Requirement — Supervisor

---

## Dependencies & Reachability

**Depends on**: T038 (merged); **Entry point**: Standalone — N/A (documentation and annotation text)

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to |
|---|----------------------|-----------|
| 1 | `docs/deploy.md` no longer says "Do not set `PORT`" (step 5 and the troubleshooting row). It says: Railway injects `PORT`; the server reads `PORT` and uses 8080 when it is unset; setting `PORT` yourself (for example `8080`) is allowed; if **Generate Domain** asks which port the app listens on, enter the number in the deploy log line `listening on port N` (8080 when you set `PORT=8080`). The health-check troubleshooting row keeps its advice to read the deploy log and drops "do not set `PORT`" | docs accuracy |
| 2 | The 8080 in `docs/deploy.md` agrees with the code: a hygiene test reads `apps/mcp/src/index.ts`, extracts the default port, and asserts `docs/deploy.md` states that number as the default and no longer contains "Do not set `PORT`" | docs accuracy |
| 3 | `ideas/schema.json` `title` and `description` describe a submission, not an idea file, for example title `Idea Radar submission` and description `One routine run's output: the argument of the submit_ideas MCP tool`. No validation keyword changes: `git diff` of the file shows only those two string values; a test (or the existing `packages/ideas` tests) proves a valid and an invalid submission still behave as before | FR-001 |
| 4 | `PRD.md` and `ideas/README.md`: every remaining "idea file" and `ideas/<YYYY-MM-DD>` file-path phrase that describes the current contract is reworded to "submission"; where the text is history (a decision log, a superseded v2 note), it stays. A grep for `idea file` over `PRD.md ideas/ docs/deploy.md README.md PROJECT_SPEC.md` is listed in the report with each hit marked reworded or kept-as-history | FR-001 |
| 5 | A hygiene test fails if `ideas/schema.json` `title` or `description` contains `idea file` or `ideas/<` again | FR-001 |
| 6 | Mutation checks recorded in `tasks/TASK_REVIEW_T040.md`: put "Do not set `PORT`" back (test red), put "idea file" back in the schema title (test red), each restored and re-run green | Gate 5 |
| 7 | `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` pass, 0 skipped (database tests need `TEST_DATABASE_URL`, see `memory/learnings.md`) | all |

---

## Evaluation & Acceptance

### Verification Command

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check
```

### Evidence

> **Moved.** Filled in `tasks/TASK_REVIEW_T040.md`.

---

## Demonstration

> **Moved.** See `tasks/TASK_REVIEW_T040.md`.

BEFORE capture to take first: quote verbatim the two "Do not set `PORT`" lines in `docs/deploy.md` and the schema's current `title` and `description`.

---

## Approach

**Vital slice**: (1) the two doc edits, (2) the schema's two strings, (3) the two small tests, (4) the grep sweep. **Cut list**: renaming "idea file" in code comments; a schema `$id` or version change; anything that changes validation.

**Check before editing the schema**: `grep` for the schema's `title` and `description` in `packages/ideas/src`, `apps/mcp/src` and the tests; if any code or test prints or compares them, list it in the report and stop before editing.

---

## Edge Case Checklist

- [ ] The prompt `routines/daily-ideas.md` and its hygiene tests stay green (they derive limits from `ideas/schema.json`)
- [ ] The built copies under `dist/` are not edited by hand (they are build output)
- [ ] No real domain, token or project id appears in the docs
- [ ] Pin-test pre-flight: list the existing tests that read `docs/deploy.md` or `ideas/schema.json` before editing

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `docs/deploy.md` | PORT wording (step 5, step 6 note, troubleshooting row) |
| `ideas/schema.json` | `title` and `description` strings only |
| `PRD.md`, `ideas/README.md` | "idea file" wording where it describes the current contract |
| `scripts/repo-hygiene.test.ts` | two small tests (PORT default agrees with the code; schema wording) |
| `tasks/TASK_REVIEW_T040.md` | evidence |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| any schema keyword other than `title` and `description` | contract |
| `apps/mcp/src/**`, `packages/**/src/**` | no code change (comments listed, not edited) |
| `.env.example` | permission rule |
| `railway.json`, `.github/workflows/ci.yml`, `routines/daily-ideas.md` | unchanged |
| `.claude/`, `skills/`, `templates/`, `docs/claude-md/`, `AGENTS.md`, `CLAUDE.md`, `AGENTS.md.bak-*` | kit |

---

## Test Plan

Test-first: write the two tests, see them red on the current files, then edit and see them green. Record the two mutations. Run the Verification Command.

---

## Completion Checklist

- [ ] Implementation done
- [ ] Self-review: `Skill({ skill: "code-review" })` run
- [ ] Security review (Medium): `Skill({ skill: "security-review" })` run
- [ ] Lint passes
- [ ] Tests written AND pass — output in `tasks/TASK_REVIEW_T040.md`
- [ ] `Skill({ skill: "verify" })` run — the schema still validates through the real server
- [ ] Supervisor notified: task ready for Stage 4 review
