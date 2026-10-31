# TASK_GUIDE — T008: HUN-148 Shortlist job — candidates, metadata, README/manifests, stack tags
**Date**: 2026-10-31
**Complexity Level**: C2
**Risk Level**: Low
**Priority**: P1
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: HUN-148

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`), `docs/ISSUES.md` § HUN-148, `docs/SPEC.md` § Data model, `docs/analysis/2026-10-31-gaps.md` rows A1, A6, A11.
2. Read the memory slice in your spawn prompt, then `memory/learnings.md` and `memory/decisions.md`.
3. Read this file completely, then `agents/backend.md` and `memory/codebase-map.md`.

---

## Requirement (Pillar 1)

`docs/ISSUES.md` § HUN-148 (verbatim):
- Shortlist = repos with any tier candidate signal in the last 7 days (cap configurable, default 5,000/day).
- Fetch README, manifests (`package.json`, `go.mod`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `pom.xml`, `build.gradle`), top-level file tree into `repo_content`.
- Derive `stack_tags` from manifests (e.g. `next`, `react`, `fastapi`, `tokio`). Skip repos fetched within 7 days.

Gap found at wave-3 planning (Supervisor, 2026-10-31): T021 stores the shortlist (`candidates`) and T003 has `GithubApiConnector.fetchByIds`, but no job calls either. A repo seen only in GH Archive therefore never gets a `repos` row, so T009 cannot classify it. This task wires the whole shortlist path in one daily job.

**Restated intent**
> One daily `shortlist` job picks the day's candidates, fetches GitHub metadata for those with no fresh `repos` row, then fetches README, manifests and the top-level file tree for those with no fresh `repo_content` row, and stores stack tags derived from the manifests — so T009 scoring sees every candidate with metadata and README.

**Out of scope**
- Tier scoring (T009), README quality scoring (T010), embeddings (v2).
- A cross-process GitHub budget (gap A6) beyond the one shared `GithubApiConnector` instance.

### Requirement Fidelity Gate
- [x] Restated intent confirmed — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T003 — `GithubApiConnector.fetchByIds`; T007 — job runner; T021 — `selectCandidates`, `listCandidates`
**Entry point**: `SHORTLIST_JOB`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `GithubApiConnector.fetchContent(repoIds)` fetches, in batched GraphQL queries through the same rate-limit state as `fetchByIds`: README (`readme_md`, capped at 100 KB), each of the 7 manifests named in HUN-148 at the repo root (each capped at 50 KB, absent ones omitted), and the top-level tree entry names and types; returns `{ contents: RepoContent[], missing: number[] }` | fetch README, manifests, tree |
| 2 | `deriveStackTags(manifests)` in `packages/connectors/src/stack-tags.ts` maps dependencies to tags with one table (at least: `next`, `react`, `vue`, `svelte`, `express`, `fastapi`, `django`, `flask`, `tokio`, `axum`, `gin`, `spring`), plus one language tag per manifest kind (`node`, `python`, `go`, `rust`, `java`); invalid JSON/TOML is ignored, never thrown | stack_tags |
| 3 | A new daily job `shortlist` (`SHORTLIST_JOB`, `apps/worker/src/handlers.ts`) for data date D: (a) `selectCandidates(db, day)` where `day` = the GH Archive cursor date (skip the run with a log line if no cursor); (b) when the GitHub API connector is enabled, `listCandidates(day, { needsMetadata: true })` → `fetchByIds` → `upsertRepo`; (c) candidates with no `repo_content` row or `fetched_at` older than 7 days → `fetchContent` → `upsertRepoContent`. Without a GitHub token, (b) and (c) are skipped and logged | wiring |
| 4 | The 7-day content freshness (`contentMaxAgeDays: 7`) lives in `candidateConfig` in `packages/core/src/scoring.ts` | AGENTS.md § Rules |
| 5 | `shortlist` per-name cap is 1; `score` for date D waits for `shortlist` D (it already waits for every other job of its date — add a test that proves it) | score after ingestion |
| 6 | The run records `github_api` health via `recordSourceRun` (as `resolve_pending` does) | sources health |
| 7 | Unit tests with an injected `fetchImpl` and saved GraphQL fixture: batching, size caps, absent manifests, a missing repo; stack-tag table tests; integration test (temp schema, skip without `TEST_DATABASE_URL`) of the handler end to end with a fake connector | tests |

---

## Evaluation & Acceptance

### Verification Command

```bash
# ci: skip — needs local Postgres
pnpm test && pnpm typecheck
```

---

## Approach

**Pattern reference**: `packages/connectors/src/github-api.ts` (`fetchByIds`, GraphQL batching, rate-limit pause, token redaction) and the `resolve_pending` handler in `apps/worker/src/handlers.ts`.
**Vital slice**: the `shortlist` job wired end to end with metadata + README; manifests and stack tags next.
**Cut list**: file-tree summary beyond the top-level entries; per-ecosystem lockfile parsing; nested manifests (monorepos).

- GraphQL: one `object(expression: "HEAD:<path>") { ... on Blob { text byteSize } }` per file and `object(expression: "HEAD:") { ... on Tree { entries { name type } } }`; alias each repo in a batch (start with 10 repos per query; say what you chose).
- The `repo_content` list query goes in a new file `packages/db/src/content.ts` (do not edit `candidates.ts` or `repository.ts`), plus one re-export line in `index.ts`.
- No real token in this environment: tests use fixtures; say in the report that the live API path is unverified.

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/connectors/src/github-api.ts`, `github-api.test.ts` | `fetchContent` |
| `packages/connectors/src/stack-tags.ts`, `stack-tags.test.ts` | new |
| `packages/connectors/src/fixtures/github-api/` | content fixture |
| `packages/db/src/content.ts`, `content.test.ts`, `index.ts` | due-content list |
| `packages/core/src/scoring.ts` | `contentMaxAgeDays` |
| `apps/worker/src/handlers.ts`, `worker.test.ts` | `shortlist` job |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| the `score` handler in `apps/worker/src/handlers.ts`, `tierConfig` in `scoring.ts` | T009 in parallel |
| `packages/connectors/src/ossinsight.ts`, `apps/api/**` | T012, T016 in parallel |
| `packages/db/migrations/00[1-4]*` | applied; if you need a migration use **005** |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/` | Supervisor-owned |

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
