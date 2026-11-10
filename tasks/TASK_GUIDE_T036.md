# TASK_GUIDE — T036: Replace git ingest with MCP ingest (routine prompt, CI, deploy docs)
**Date**: 2026-11-10
**Complexity Level**: C2
**Risk Level**: Medium
**Priority**: P1
**Assigned agent**: common-infrastructure
**Agent guide**: `agents/common-infrastructure.md`

---

## Mandatory Startup (Do Not Skip)

Before writing any code:
1. Read `PROJECT_SPEC.md`
2. Read the memory slice in your spawn prompt (`<!-- memory-slice -->`). Read `memory/MEMORY.md` in full only if your work reaches a file, hook, skill or decision the slice does not cover
3. Read this file completely
4. Read `agents/common-infrastructure.md`
5. Note the **Complexity Level** above and apply the matching process from the Complexity matrix in `agents/common-infrastructure.md`
6. Read `memory/codebase-map.md` for layout

Also read `PRD.md` (v2.1), `routines/daily-ideas.md`, `docs/deploy.md`, `railway.json`, `README.md`.

---

## Requirement (Pillar 1 — Adapt the requirement)

User (2026-11-10): git idea files → "Replace with MCP ingest"; "claude scan and push to the app mcp".

**Restated intent** (Supervisor's interpretation, in the project's domain language):
> The routine never touches the repository: its prompt tells it to call `submit_ideas`. Git idea-file ingest (loading `ideas/*.json`, the `ideas:check` CI step, commit instructions) is gone, and one setup document covers Postgres, the three tokens, the routine's connector and the clients.

**Out of scope** (what this task explicitly does NOT do):
- Server code (T033–T035)

**Requirement Refs** (FR/NFR/US IDs from `PRD.md` this task satisfies):
- FR-002: routine prompt uses `submit_ideas`, never edits the repo
- FR-009: Railway deploy with Postgres, documented
- NFR-002: tokens only in Railway variables and the routine environment

### Requirement Fidelity Gate (sign off BEFORE implementation)

- [x] Restated intent confirmed to match the user's request — Supervisor, 2026-11-10
- [x] Domain terms align with `PROJECT_SPEC.md` glossary — Supervisor
- [x] Every Acceptance Criterion below traces to a line in the Requirement — Supervisor
- [x] All Requirement Refs exist in `PRD.md` and are fully covered by the Acceptance Criteria — Supervisor

---

## Dependencies & Reachability

**Depends on**: T034 — `submit_ideas` and the boot env vars; T035 — dashboard routes for the docs

**Entry point**: `routines/daily-ideas.md` (pasted into the routine); `docs/deploy.md`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `routines/daily-ideas.md`: research steps kept; "send one `submit_ideas` call with today's ideas (schema below); on a tool error fix the fields and resend; never clone, edit, commit or push"; no git or `pnpm` steps | FR-002 |
| 2 | `ideas:check` script, the `check`/`cli` code in `packages/ideas`, the CI `pnpm ideas:check` step and file loading (`readIdeaDir`/`loadIdeas`) are removed if nothing uses them; `ideas/schema.json`, `ideas/README.md` (rewritten as the submission contract) and `ideas/examples/` stay | FR-002 |
| 3 | `railway.json` watch patterns drop `/ideas/**` (no data in git) but keep `/ideas/schema.json`; build/start unchanged | FR-009 |
| 4 | `docs/deploy.md`: add the Railway Postgres plugin (`DATABASE_URL` reference variable); variables `MCP_TOKEN`, `MCP_WRITE_TOKEN`, `DASHBOARD_TOKEN`; dashboard login URL; routine setup via a claude.ai custom connector with `Authorization: Bearer <MCP_WRITE_TOKEN>` request header (or a repo `.mcp.json` whose header reads `${IDEA_RADAR_WRITE_TOKEN}` from the routine environment — the token is never committed); remove the git-push sections; token rotation for all three | FR-009, NFR-002 |
| 5 | `README.md` flow diagram and env list match v2.1 | FR-009 |
| 6 | `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test` pass | FR-002 |

---

## Evaluation & Acceptance (How we know the agent worked correctly)

### Success Criteria (observable, pass/fail)

| # | Given (input/state) | Expect (output/behavior) | How it's checked |
|---|---------------------|--------------------------|------------------|
| 1 | `grep -rn "git push\|commit\|ideas:check" routines/ README.md docs/deploy.md .github/` | no instruction to commit/push idea files | command |
| 2 | full suite | green | command |
| 3 | `docs/deploy.md` | each AC 4 item present | review |

### Verification Command (exact, runnable)

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test
```

### Evidence (filled by reviewer at Stage 4/5)

> **Moved.** Filled by the reviewer at Stage 4/5 in `tasks/TASK_REVIEW_T036.md`.

---

## Demonstration

> **Moved.** See `tasks/TASK_REVIEW_T036.md`.

---

## Approach

**Pattern reference**: `docs/deploy.md` and `routines/daily-ideas.md` as they are (keep tone and structure).

**Vital slice**: the routine prompt + deploy doc; code removal is the remainder.
**Cut list**: a script that seeds Postgres from old idea files (there are none on `main`).

---

## Edge Case Checklist

- [ ] The routine must handle a tool error (validation) by fixing and resending once, then stop and report
- [ ] Docs never show a real token; examples use placeholders
- [ ] Pin-test pre-flight: the `Pre-existing pin tests` row below is filled before work starts
- [ ] Stale references: grep README, PROJECT_SPEC, PRD, `ideas/README.md` for `ideas:check`, `commit`, `IDEAS_DIR`

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `routines/daily-ideas.md`, `docs/deploy.md`, `README.md`, `ideas/README.md` | v2.1 |
| `railway.json`, `.github/workflows/ci.yml`, `package.json` | drop git-ingest bits |
| `packages/ideas/src/{check,cli,load}.ts` + tests | remove if unused |
| Pre-existing pin tests | `scripts/repo-hygiene.test.ts` (ci.yml) — keep passing |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `apps/mcp/src/**`, `packages/db/**` | T033–T035 |
| `ideas/schema.json` | contract |
| `.claude/`, `skills/`, `templates/`, `docs/claude-md/`, `AGENTS.md`, `CLAUDE.md` | kit |

---

## Test Plan

Run the Verification Command and the Success Criterion 1 grep; review `docs/deploy.md` against AC 4.

---

## Completion Checklist

- [ ] Implementation done
- [ ] Self-review: `Skill({ skill: "code-review" })` run
- [ ] Security review: `Skill({ skill: "security-review" })` run (if Medium/High risk)
- [ ] Lint passes
- [ ] Tests written AND pass — output pasted into `tasks/TASK_REVIEW_T036.md`'s Evidence table (Hard-Stop Gate 5)
- [ ] `Skill({ skill: "verify" })` run — feature confirmed working in running app
- [ ] Supervisor notified: task ready for Stage 4 review
