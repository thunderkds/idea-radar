# TASK_GUIDE — T022: Repo hygiene for wave-4 scores (LICENSE, lint + format, CI)
**Date**: 2026-10-31
**Complexity Level**: C1
**Risk Level**: Low
**Priority**: P1
**Assigned agent**: common-infrastructure
**Agent guide**: `agents/common-infrastructure.md`
**Linear**: none (infra)

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`).
2. Call easy-memory `memory_search` first for this task's topics (lint, CI, license); then read the memory slice in your spawn prompt, then `memory/learnings.md`.
3. Read this file completely, then `agents/common-infrastructure.md`, `.github/workflows/ci.yml`, root `package.json` and each workspace `package.json`.

---

## Requirement (Pillar 1)

User decision 2026-10-31 (chat, verbatim): "approve all, MIT" — accepting the Supervisor's fix-up proposal: add a LICENSE, a lint and format config, and harden the CI setup, so the easy-verifier score rows can reach the floor of 80.

easy-verifier repo-wide drags on every wave-4 score (`tasks/TASK_REVIEW_T010.md` Companion score row): supply-chain 20 ("no LICENSE file, CI actions unpinned, no lockfile install or provenance step in `.github/workflows/ci.yml`"), code-quality 73 ("no lint or format config").

**Restated intent**
> The repo carries an MIT LICENSE, a working `pnpm lint` (ESLint flat config) and a Prettier config, and CI installs from the committed lockfile with actions pinned to commit SHAs, least-privilege permissions, and runs lint, typecheck and test.

**Out of scope**
- Reformatting existing code with Prettier (config only; no mass rewrite). Fixing app code beyond what a lint rule you keep needs (see Approach). Release, provenance attestation or publishing workflows.

### Requirement Fidelity Gate
- [x] Restated intent confirmed — user ("approve all, MIT")
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T001 — workspace install and test runner
**Entry point**: `eslint.config.js`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `LICENSE` at the repo root: the standard MIT text, `Copyright (c) 2026 thunderkds`; root `package.json` gains `"license": "MIT"` | LICENSE |
| 2 | Root `eslint.config.js` (flat config, `@eslint/js` recommended + `typescript-eslint` recommended, ignores `dist`, `.next`, `node_modules`, `apps/dashboard/next-env.d.ts`); every workspace package has a `lint` script; `pnpm lint` exits 0 on this branch | lint config |
| 3 | Root `.prettierrc.json` matching the existing style (read a few files: quotes, semicolons, width) and `.prettierignore`; a root `format:check` script exists but is not run in CI (no mass reformat) | format config |
| 4 | `.github/workflows/ci.yml`: every `uses:` pinned to a full 40-char commit SHA with the tag in a trailing comment; top-level `permissions: contents: read`; `pnpm install --frozen-lockfile`; steps run `pnpm lint`, `pnpm typecheck` and `pnpm test` (Postgres integration tests skip without `TEST_DATABASE_URL`, as now); `timeout-minutes` on the job | CI hardening |
| 5 | Dev dependencies added only at the root, with exact versions, and `pnpm-lock.yaml` committed | lockfile |
| 6 | A test `scripts/repo-hygiene.test.ts` (node:test + tsx, wired into `pnpm test` through the root or an existing package) asserts: LICENSE starts with `MIT License`; every `uses:` line in `ci.yml` has a 40-hex SHA; `ci.yml` contains `--frozen-lockfile` and `permissions:` | tests |

---

## Evaluation & Acceptance

### Verification Command

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && TEST_DATABASE_URL=postgres://radar:radar@localhost:5436/radar pnpm test
```

---

## Approach

**Pattern reference**: existing package `test` scripts (`node --import tsx --test`) for the hygiene test.
**Vital slice**: LICENSE + pinned CI with frozen lockfile + a passing `pnpm lint`.
**Cut list**: Prettier reformat of the codebase, pre-commit hooks, Dependabot, SBOM/provenance.

- Look up each action's SHA with `git ls-remote https://github.com/<owner>/<repo> refs/tags/<tag>` (dereference annotated tags with `^{}`); use the current tag of the major already in use (`v4`).
- If a recommended lint rule fires more than a few times on existing code, turn that rule off in the config with a one-line comment giving the hit count, rather than editing other tasks' code. Fix only trivial hits (unused imports) in files on this branch.
- Never run `git push`. Never read or write `.env*`.

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `LICENSE` | new |
| `eslint.config.js`, `.prettierrc.json`, `.prettierignore` | new |
| `package.json`, `*/*/package.json` | `license`, `lint`/`format:check` scripts, dev deps |
| `.github/workflows/ci.yml` | pins, permissions, frozen lockfile, lint/test |
| `scripts/repo-hygiene.test.ts` | new |
| `pnpm-lock.yaml` | new dev deps |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/**/src/**`, `apps/**/src/**`, `apps/dashboard/app/**` beyond trivial lint fixes | wave-4 task branches rework these next |
| `packages/db/migrations/**` | applied |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/`, `.claude/**` | Supervisor-owned |

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
