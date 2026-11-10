# TASK_GUIDE — T031: Railway deploy config and routine/MCP setup docs
**Date**: 2026-11-10
**Complexity Level**: C1
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

---

## Requirement (Pillar 1 — Adapt the requirement)

User (2026-11-10): "Railway, commit to main, MCP only first"; "the database or the app will be deploy somewhere not local for shipping".

**Restated intent** (Supervisor's interpretation, in the project's domain language):
> The repo deploys `apps/mcp` to Railway with no manual build steps, redeploys on each push to `main` that touches ideas or the server, and has one setup document that takes the owner from zero to: Railway service live, routine created and allowed to push to `main`, MCP server added to Claude Code/Desktop.

**Out of scope** (what this task explicitly does NOT do):
- Running the live deploy or creating the routine (needs the user's Railway and claude.ai logins — a stop that stays)
- A database

**Requirement Refs** (FR/NFR/US IDs from `PRD.md` this task satisfies):
- FR-009: deploy to Railway from this repo with a documented setup
- FR-002 (setup half): routine creation and the "Allow unrestricted branch pushes" permission
- NFR-002: `MCP_TOKEN` only in Railway variables
- NFR-003: committed file queryable within 10 minutes (redeploy on push)

### Requirement Fidelity Gate (sign off BEFORE implementation)

- [x] Restated intent confirmed to match the user's request — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary — auto (Supervisor)
- [x] Every Acceptance Criterion below traces to a line in the Requirement — auto (Supervisor)
- [x] All Requirement Refs exist in `PRD.md` and are fully covered by the Acceptance Criteria — auto (Supervisor)

---

## Dependencies & Reachability

**Depends on**: T029 — `apps/mcp` start script; T030 — v1 gone so the build is v2-only

**Entry point**: `railway.json` (read by Railway at deploy); `docs/deploy.md`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `railway.json` (schema `https://railway.com/railway.schema.json`) builds and starts `apps/mcp` from the repo root (build: `pnpm install --frozen-lockfile && pnpm --filter @idea-radar/mcp... build`; start: the mcp start command), sets `healthcheckPath: /health`, and `watchPatterns` cover `ideas/**`, `apps/mcp/**`, `packages/ideas/**`, `package.json`, `pnpm-lock.yaml` | FR-009, NFR-003 |
| 2 | The exact build and start commands from `railway.json` run locally in a clean checkout and the server answers `/health` | FR-009 |
| 3 | `docs/deploy.md`: Railway steps (new project from GitHub repo, set `MCP_TOKEN` with a generator command such as `openssl rand -hex 32`, get the public domain); routine steps (create at claude.ai/code/routines, paste `routines/daily-ideas.md`, attach the repo, turn on "Allow unrestricted branch pushes", daily schedule, run once to test); the known 403-on-push report and how to spot a missed day; client setup (`claude mcp add --transport http idea-radar https://<domain>/mcp --header "Authorization: Bearer <token>"` and a Claude Desktop config example); token rotation | FR-009, FR-002, NFR-002 |
| 4 | `README.md` "Getting started" links `docs/deploy.md` and shows the local run (`MCP_TOKEN=… pnpm --filter @idea-radar/mcp start`) | FR-009 |
| 5 | No secret value appears in any committed file | NFR-002 |

---

## Evaluation & Acceptance (How we know the agent worked correctly)

### Success Criteria (observable, pass/fail)

| # | Given (input/state) | Expect (output/behavior) | How it's checked |
|---|---------------------|--------------------------|------------------|
| 1 | `railway.json` | valid JSON; keys from AC 1 present | command (`node -e` / `jq`) |
| 2 | build + start commands from `railway.json` in a temp clone | `/health` returns `ok: true` | app run |
| 3 | `docs/deploy.md` | contains each AC 3 item | review + grep |

### Verification Command (exact, runnable)

```bash
# ci: skip — starts a server and reads railway.json commands; the live Railway deploy needs the user's login
node -e "const r=require('./railway.json');if(!r.deploy?.healthcheckPath)process.exit(1)" && pnpm install --frozen-lockfile && pnpm --filter @idea-radar/mcp... build && (MCP_TOKEN=$(openssl rand -hex 32) PORT=8787 pnpm --filter @idea-radar/mcp start & sleep 4; curl -fsS localhost:8787/health; kill %1)
```

### Evidence (filled by reviewer at Stage 4/5)

> **Moved.** Filled by the reviewer at Stage 4/5 in `tasks/TASK_REVIEW_T031.md`.

---

## Demonstration

> **Moved.** See `tasks/TASK_REVIEW_T031.md`.

---

## Approach

**Pattern reference**: None — no deploy config exists in this repo yet; follow Railway's config-as-code docs (verify key names against the current schema before writing).

**Vital slice**: `railway.json` whose build/start/healthcheck work; the doc is the rest.
**Cut list**:
- Dockerfile (Railpack/Nixpacks builds a pnpm monorepo; add one only if the native build fails)
- Staging environment, custom domain
- A GitHub Action that alerts on a missed routine day (doc explains how to spot it by hand)

---

## Edge Case Checklist

- [ ] Watch patterns too narrow → a routine commit doesn't redeploy (stale data, no error)
- [ ] Start command needs dev deps (`tsx`) that a production install drops — use the built `dist/`
- [ ] `PORT` comes from Railway; server must read it
- [ ] Health check passes with zero ideas
- [ ] Pin-test pre-flight: the `Pre-existing pin tests` row below is filled before work starts
- [ ] Stale references: README getting-started

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `railway.json` | new |
| `docs/deploy.md` | new |
| `README.md` | getting-started section |
| `apps/mcp/package.json` | only if `start` must change to run from `dist/` |
| Pre-existing pin tests | none expected; grep `scripts/*.test.ts` for `README` |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `apps/mcp/src`, `packages/ideas`, `ideas/schema.json` | T028/T029 — report needed changes |
| `.claude/`, `skills/`, `templates/`, `docs/claude-md/`, `AGENTS.md`, `CLAUDE.md` | kit |

---

## Test Plan

Run the Verification Command locally; review `docs/deploy.md` against AC 3. The live deploy is the user's step after merge.

---

## Completion Checklist

- [ ] Implementation done
- [ ] Self-review: `Skill({ skill: "code-review" })` run
- [ ] Security review: `Skill({ skill: "security-review" })` run (if Medium/High risk)
- [ ] Lint passes
- [ ] Tests written AND pass — output pasted into `tasks/TASK_REVIEW_T031.md`'s Evidence table (Hard-Stop Gate 5)
- [ ] `Skill({ skill: "verify" })` run — feature confirmed working in running app
- [ ] `memory/MEMORY.md` updated (if new patterns or feedback learned)
- [ ] Supervisor notified: task ready for Stage 4 review
