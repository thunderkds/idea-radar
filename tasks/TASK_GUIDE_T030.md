# TASK_GUIDE — T030: Retire the v1 scraping stack
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

---

## Requirement (Pillar 1 — Adapt the requirement)

User (2026-11-10): "What happens to the current scraping pipeline" → "Retire it (Recommended)". Debate (2026-11-10, 3 Advocates agreed): also delete `apps/api` and `apps/dashboard`.

**Restated intent** (Supervisor's interpretation, in the project's domain language):
> `main` holds only what v2 runs (idea contract, `packages/ideas`, `apps/mcp`, routine prompt, kit). All v1 code, its local Postgres setup and its docs pointers are gone, and the build, lint, typecheck and tests stay green. v1 stays reachable through the `v1-scraper` tag.

**Out of scope** (what this task explicitly does NOT do):
- Editing `docs/SPEC.md`, `docs/ISSUES.md`, `docs/analysis/`, `docs/design-system/` (kept as v1 history)
- Railway config and the README deploy section (T031)

**Requirement Refs** (FR/NFR/US IDs from `PRD.md` this task satisfies):
- FR-008: worker, connectors, scoring, tiering, v1 API and v1 dashboard removed from `main`; v1 reachable via `v1-scraper`
- NFR-005: no always-on process except the MCP server

### Requirement Fidelity Gate (sign off BEFORE implementation)

- [x] Restated intent confirmed to match the user's request — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary — auto (Supervisor)
- [x] Every Acceptance Criterion below traces to a line in the Requirement — auto (Supervisor)
- [x] All Requirement Refs exist in `PRD.md` and are fully covered by the Acceptance Criteria — auto (Supervisor)

---

## Dependencies & Reachability

**Depends on**: T029 — `apps/mcp` must already hold the ported `bearerMatches` before `apps/api` is deleted

**Entry point**: Standalone — N/A: a deletion; reached by `pnpm -r build` / `pnpm test` staying green on the remaining workspace

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | Deleted: `apps/worker`, `apps/api`, `apps/dashboard`, `packages/connectors`, `packages/core`, `packages/db`, `docker-compose.yml`, `scripts/label.ts`, `scripts/precision.ts`, `scripts/cli-args.ts` and their tests | FR-008 |
| 2 | `git ls-tree v1-scraper apps/` still lists `api`, `dashboard`, `worker` (tag untouched) | FR-008 |
| 3 | Root `package.json`: no `db:migrate`, `worker`, `api`, `dashboard`, `label`, `precision` scripts; description updated to v2; `pnpm-lock.yaml` regenerated with no orphan deps | FR-008 |
| 4 | `.env.example` holds only v2 variables (`MCP_TOKEN`, `PORT`, `IDEAS_DIR`) | FR-008, NFR-005 |
| 5 | `grep -rn "@idea-radar/core\|@idea-radar/db\|@idea-radar/connectors\|DATABASE_URL\|GITHUB_TOKEN" --include=*.ts --include=*.json --include=*.yml --include=*.md . ` outside `docs/SPEC.md`, `docs/ISSUES.md`, `docs/analysis/`, `tasks/`, `memory/`, `reports/`, `.claude/`, `node_modules` returns nothing | FR-008 |
| 6 | `README.md` describes v2 (routine → idea files → MCP), with no v1 sources table or v1 getting-started; links v1 history (`docs/SPEC.md`, tag `v1-scraper`) | FR-008 |
| 7 | `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm ideas:check` all pass | FR-008 |
| 8 | `PROJECT_KANBAN.md` v1 Todo cards T013, T014, T018, T019, T020 are closed as "won't do — v1 retired (T030)" (Supervisor does the board edit) | FR-008 |

---

## Evaluation & Acceptance (How we know the agent worked correctly)

### Success Criteria (observable, pass/fail)

| # | Given (input/state) | Expect (output/behavior) | How it's checked |
|---|---------------------|--------------------------|------------------|
| 1 | branch after deletion | `ls apps packages` → `apps/mcp`, `packages/ideas` only | command |
| 2 | full check suite | all green | command |
| 3 | AC 5 grep | no matches | command |
| 4 | tag | `git ls-tree v1-scraper apps/` lists 3 apps | command |

### Verification Command (exact, runnable)

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm ideas:check && ls apps packages
```

### Evidence (filled by reviewer at Stage 4/5)

> **Moved.** Filled by the reviewer at Stage 4/5 in `tasks/TASK_REVIEW_T030.md`.

---

## Demonstration

> **Moved.** See `tasks/TASK_REVIEW_T030.md`.

---

## Approach

**Pattern reference**: None — no comparable prior deletion in this repo; follow `git rm -r` + lockfile regen.

**Vital slice**: the deletions + a green full suite; doc edits are the remainder.
**Cut list**:
- Rewriting `docs/SPEC.md` / `docs/ISSUES.md` (kept as history with a one-line "v1, superseded by PRD.md" note at the top of each)
- Removing `docs/design-system/` (kept for a possible later UI)

Delete in one commit so CI is never red between steps (Advocate 1 risk note). Update `eslint.config.js`, `tsconfig.base.json` and `.github/workflows/ci.yml` only if they reference deleted paths. Keep `scripts/repo-hygiene.test.ts` and the kit Python scripts.

---

## Edge Case Checklist

- [ ] `pnpm test` root script still globs `scripts/**/*.test.ts` — the remaining `repo-hygiene.test.ts` must pass
- [ ] `eslint.config.js` ignores/paths that name deleted dirs
- [ ] CI comment "Postgres integration tests skip cleanly…" removed if no longer true
- [ ] Prettier `format:check` paths still exist
- [ ] Pin-test pre-flight: the `Pre-existing pin tests` row below is filled before work starts
- [ ] Stale references: grep README, `PROJECT_SPEC.md`, `.env.example`, comments for v1 names (AC 5)

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `apps/worker`, `apps/api`, `apps/dashboard`, `packages/core`, `packages/connectors`, `packages/db` | delete |
| `docker-compose.yml`, `scripts/label*.ts`, `scripts/precision*.ts`, `scripts/cli-args*.ts` | delete |
| `package.json`, `pnpm-lock.yaml`, `.env.example`, `README.md` | v2 only |
| `docs/SPEC.md`, `docs/ISSUES.md` | one-line superseded note at top |
| `eslint.config.js`, `.github/workflows/ci.yml` | only if they name deleted paths |
| Pre-existing pin tests | `scripts/repo-hygiene.test.ts` (LICENSE, package.json license, ci.yml pinning) — keep passing; no repoint |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `apps/mcp`, `packages/ideas`, `ideas/`, `routines/` | v2 |
| `.claude/`, `skills/`, `templates/`, `docs/claude-md/`, `AGENTS.md`, `CLAUDE.md`, `scripts/*.py` | kit |
| git tag `v1-scraper` | recovery point |

---

## Test Plan

Run the Verification Command and the AC 5 grep; confirm AC 2 against the tag.

---

## Completion Checklist

- [ ] Implementation done
- [ ] Self-review: `Skill({ skill: "code-review" })` run
- [ ] Security review: `Skill({ skill: "security-review" })` run (if Medium/High risk)
- [ ] Lint passes
- [ ] Tests written AND pass — output pasted into `tasks/TASK_REVIEW_T030.md`'s Evidence table (Hard-Stop Gate 5)
- [ ] `Skill({ skill: "verify" })` run — feature confirmed working in running app
- [ ] `memory/MEMORY.md` updated (if new patterns or feedback learned)
- [ ] Supervisor notified: task ready for Stage 4 review
