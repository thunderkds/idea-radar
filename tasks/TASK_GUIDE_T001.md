# TASK_GUIDE — T001: Test runner + workspace install
**Date**: 2026-10-31
**Complexity Level**: C1
**Risk Level**: Low
**Priority**: P0
**Assigned agent**: common-infrastructure
**Agent guide**: `agents/common-infrastructure.md`

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, then the top of `AGENTS.md` (`# Working in this repo`) — its Rules bind you.
2. Read the memory slice in your spawn prompt.
3. Read this file completely, then `agents/common-infrastructure.md`.

---

## Requirement (Pillar 1)

User (2026-10-31): "start the jobs parallel" over the Linear/`docs/ISSUES.md` task list. Every task's done-rule is "`pnpm typecheck` and `pnpm test` pass" (`AGENTS.md` § Workflow), but the scaffold has no test runner, and the dev scripts (`node --experimental-strip-types src/index.ts`) cannot resolve the `./x.js` relative imports used in `src/*.ts`.

**Restated intent**
> From a clean checkout, `pnpm install && pnpm typecheck && pnpm test` works in every package, and `*.test.ts` files next to the code run. Postgres for integration tests can be started with `docker compose up -d postgres`.

**Out of scope**
- Any feature code, schema change, or data-access function (T002+).
- CI changes beyond adding `pnpm test` if `.github/workflows` already runs typecheck.

**Requirement Refs**: `AGENTS.md` § Commands, § Rules ("Tests: unit tests next to the code…"), § Workflow.

### Requirement Fidelity Gate
- [x] Restated intent confirmed — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: None
**Entry point**: `pnpm test`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `pnpm install` succeeds and `pnpm-lock.yaml` is committed | AGENTS.md § Commands "Commit pnpm-lock.yaml" |
| 2 | Every package/app with TS source has a `test` script; `pnpm test` at root exits 0 | done-rule |
| 3 | A `*.test.ts` next to code runs from source (no prior `pnpm build`), including imports of other workspace packages (e.g. connectors importing `@idea-radar/core`) | "unit tests next to the code" |
| 4 | A deliberately failing test makes `pnpm test` exit non-zero (prove it, then remove it) | negative |
| 5 | `pnpm typecheck` exits 0 | done-rule |
| 6 | `pnpm worker -- --once` and `pnpm api` start without module-resolution errors (dev scripts fixed the same way as tests) | AGENTS.md § Commands |
| 7 | `docker compose up -d postgres` works; `.env.example` documents `TEST_DATABASE_URL` that integration tests will use (if the default port clashes with another local Postgres, say so in the report — do not change other containers) | integration tests skip cleanly |

---

## Evaluation & Acceptance

### Success Criteria

| # | Given | Expect | How it's checked |
|---|-------|--------|------------------|
| 1 | clean worktree | `pnpm install && pnpm typecheck && pnpm test` exit 0 | command run |
| 2 | one sample test in `packages/core/src/scoring.test.ts` covering `lowkeyScore` + `classifyTier` happy path | passes | `pnpm test` |
| 3 | injected `assert.fail` | non-zero exit | command run |

### Verification Command

```bash
pnpm install --frozen-lockfile && pnpm typecheck && pnpm test
```

---

## Approach

**Pattern reference**: `package.json` root scripts (`pnpm -r <script>`) — keep that shape.
**Vital slice**: one test runner wired into every package + one real test in `packages/core`.
**Cut list**: coverage reporting; watch mode; lint config.

Supervisor decision (Risk Low): use `tsx` as the single root devDependency and `node:test` + `node:assert` as the framework (no Jest/Vitest) — `tsx` resolves `./x.js` → `./x.ts`. Make workspace packages resolvable from source in tests and dev (e.g. a `"exports"` entry with a source condition, or tsx + tsconfig paths) — pick the smallest working option and explain it in the report. Keep `pnpm build` output in `dist/` working.

---

## Edge Case Checklist
- [ ] `node --test` glob: package with zero test files must not fail `pnpm test`
- [ ] Dashboard (Next.js) package: typecheck must still pass; give it a no-op or real `test` script
- [ ] Node 20 engines field: don't use features that need Node 22+ in scripts unless `engines` is updated (AGENTS.md says Node 22+ — updating `engines` to `>=22` is allowed)

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `package.json` | devDeps (`tsx`), `test` script |
| `packages/*/package.json`, `apps/*/package.json` | `test`/`dev` scripts, exports if needed |
| `packages/core/src/scoring.test.ts` | new sample test |
| `pnpm-lock.yaml` | new |
| `.env.example` | `TEST_DATABASE_URL` |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/db/migrations/*` | T002 owns schema |
| `packages/connectors/src/*.ts` (non-test) | T003–T005 own connector code |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/`, `agents/`, `skills/` | Supervisor-owned |

---

## Test Plan
Run the Verification Command; paste output. Show the failing-test run (AC 4).

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output pasted in report
- [ ] Supervisor notified: ready for Stage 4 review
