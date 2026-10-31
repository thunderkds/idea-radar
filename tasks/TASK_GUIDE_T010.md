# TASK_GUIDE — T010: HUN-150 Lowkey score components + tuning scripts
**Date**: 2026-10-31
**Complexity Level**: C2
**Risk Level**: Low
**Priority**: P1
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: HUN-150

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`), `docs/SPEC.md` § Tier scoring, `docs/ISSUES.md` § HUN-150, `memory/decisions.md` entry "Tier rule readings for U1 and U8 (T009)".
2. Read the memory slice in your spawn prompt, then `memory/learnings.md`.
3. Read this file completely, then `agents/backend.md`, `packages/db/src/scores.ts` and `packages/core/src/scoring.ts`.

---

## Requirement (Pillar 1)

`docs/ISSUES.md` § HUN-150 (verbatim):
- Implement each component as a 0..1 function: `velocityLift` (7-day vs own 90-day baseline), `activity` (pushes/PRs/issues), `contributors`, `readmeQuality` (length, headings, install/usage sections), `issueResponsiveness`.
- Add `scripts/label.ts` to export a sample of ~200 lowkey candidates to CSV for hand-labelling, and a script reporting precision@50 against the labels.

`docs/SPEC.md` § Tier scoring: `score = 0.35 · velocity_lift + 0.25 · activity + 0.15 · contributors + 0.15 · readme_quality + 0.10 · issue_responsiveness`, "stored per repo in `repo_scores.components` so the dashboard can explain it". Weights already live in `lowkeyWeights` (`packages/core/src/scoring.ts`).

T009 left an interim lowkey score in `tierScore` (`packages/db/src/scores.ts`) with `components.interim = 1`; this task replaces it.

**Restated intent**
> Every lowkey row's `score` is the SPEC's weighted sum of five 0..1 components, each stored in `components` so the dashboard can show why; and the owner can export ~200 candidates to label by hand and measure precision@50 of the ranking against those labels.

**Out of scope**
- Collecting new data. `issueResponsiveness` has no input today (GH Archive rollups count issues opened, not replies): implement the function with its input as optional, and store `0` plus `issueResponsivenessKnown: 0` until a later task adds reply data. Say so in the report.
- Tuning the weights (the owner labels first).

### Requirement Fidelity Gate
- [x] Restated intent confirmed — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T009 — `scoreDay`, interim lowkey score; T008 — `repo_content.readme_md`
**Entry point**: `lowkeyComponents`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `lowkeyComponents(input)` in `packages/core/src/lowkey.ts` returns the five components, each clamped to 0..1, from plain numbers and the README text; every normalisation constant (e.g. the lift that maps to 1, the activity count that maps to 1) lives in `packages/core/src/scoring.ts` as `lowkeyNormalisation` | 0..1 functions; AGENTS.md § Rules |
| 2 | `velocityLift` grows with 7-day daily rate ÷ prior-83-day daily rate (no prior history → a fixed configured value, not 1); `activity` from 30-day pushes + PRs opened + issues opened; `contributors` from the T009 contributors count | components |
| 3 | `readmeQuality` scores length, number of headings, and the presence of install and usage sections (case-insensitive heading match, e.g. "Install", "Installation", "Getting started", "Usage", "Quick start"); empty README → 0 | readmeQuality |
| 4 | `scoreDay` lowkey rows use `lowkeyScore(lowkeyComponents(...))`; `components` keeps T009's keys, adds the five component values, and drops `interim`. Trending and medium scores do not change | replaces interim |
| 5 | `scripts/label.ts` (run with `pnpm label -- --date YYYY-MM-DD --out file.csv`) writes ~200 lowkey rows for a date (random sample with a fixed seed, plus the top 50), with columns `repo_id, full_name, score, url, label` (label empty) | export |
| 6 | `scripts/precision.ts` (`pnpm precision -- --date … --labels file.csv`) prints precision@50 = labelled-good share of the top 50 by score that have a label, and how many of the 50 were labelled | precision@50 |
| 7 | Unit tests for each component (edges: 0, the 1-point, above it, missing input); README fixtures (good, bare, headings only); an integration test that a lowkey row's score equals the weighted sum; script tests on a temp schema with a tiny label file | tests |

---

## Evaluation & Acceptance

### Verification Command

```bash
# ci: skip — needs local Postgres
pnpm test && pnpm typecheck
```

---

## Approach

**Pattern reference**: `packages/core/src/scoring.ts` (`lowkeyScore`, `tierConfig`) and `packages/db/src/scores.ts` (`INPUT_SQL`, `scoreRow`, `tierScore`).
**Vital slice**: the five component functions + their use in `scoreDay`.
**Cut list**: weight tuning; reply-latency data for `issueResponsiveness`; a UI for labelling.

- Add the extra inputs (30-day pushes, PRs, issues; README text or its derived stats) to `INPUT_SQL` only for lowkey candidates if that is cheaper; say what you chose.
- Scripts: root `package.json` scripts `label` and `precision` run `tsx --conditions=source scripts/….ts`; read `DATABASE_URL` from env.

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/core/src/lowkey.ts`, `lowkey.test.ts` | new |
| `packages/core/src/scoring.ts`, `index.ts` | `lowkeyNormalisation`, export |
| `packages/db/src/scores.ts`, `scores.test.ts` | lowkey score + inputs |
| `scripts/label.ts`, `scripts/precision.ts`, tests | new |
| `package.json` | two scripts |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `apps/worker/**`, `packages/db/src/api.ts`, `packages/connectors/**` | T011, T015 in parallel |
| `fakeStarConfig` / `consensusConfig` in `scoring.ts` | T011, T015 add them in parallel — add your block at the end of the file |
| `apps/dashboard/**` | T017 |
| `packages/db/migrations/**` | none needed; if one is, stop and report |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/` | Supervisor-owned |

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
