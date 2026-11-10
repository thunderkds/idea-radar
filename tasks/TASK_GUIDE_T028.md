# TASK_GUIDE — T028: Idea-file contract, validator and routine prompt
**Date**: 2026-11-10
**Complexity Level**: C2
**Risk Level**: Medium
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
6. Read `memory/codebase-map.md` for layout (v1 snapshot — `packages/core` shows the package conventions to copy)

Also read `PRD.md` and `BRAINSTORMING_LOG.md` (Option C).

---

## Requirement (Pillar 1 — Adapt the requirement)

User (2026-11-10): "the idea data will comes from the claude schedule"; chose "Commit files to git", "commit to main", "MCP only first".

**Restated intent** (Supervisor's interpretation, in the project's domain language):
> Define the one idea-file format the routine writes, a validator that names the file and field of any error, a deterministic loader that merges all idea files into one set of ideas, and the routine's prompt file, so later tasks (MCP server, deploy) build on a fixed contract.

**Out of scope** (what this task explicitly does NOT do):
- The MCP server (T029), deleting v1 code (T030), Railway config (T031)
- Creating the routine on claude.ai (the user does this; T031 documents it)

**Requirement Refs** (FR/NFR/US IDs from `PRD.md` this task satisfies):
- FR-001: one JSON Schema at `ideas/schema.json`; one file per run under `ideas/`
- FR-002: the routine's prompt as a file, telling it to write a schema-valid file and commit to `main`
- FR-003: validator rejects a bad file, naming file and field
- FR-004 (CI half): CI validates every idea file on push
- FR-005: deterministic load; latest `date` wins, same date → file name that sorts last

### Requirement Fidelity Gate (sign off BEFORE implementation)

- [x] Restated intent confirmed to match the user's request — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary — auto (Supervisor)
- [x] Every Acceptance Criterion below traces to a line in the Requirement — auto (Supervisor)
- [x] All Requirement Refs exist in `PRD.md` and are fully covered by the Acceptance Criteria — auto (Supervisor)

---

## Dependencies & Reachability

**Depends on**: None

**Entry point**: `ideas:check` (root `package.json` script, run by `.github/workflows/ci.yml`); `loadIdeas` (consumed by T029's `apps/mcp`)

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `ideas/schema.json` is a JSON Schema (draft 2020-12) for an idea file: `schema_version` (const 1), `date` (YYYY-MM-DD), `routine` (string), `ideas[]` (max 100) each with `id` (kebab slug, ≤80), `title` (1–200), `summary` (1–2000), `tags` (kebab slugs, ≤20), `signals[]` (≤20; `kind` ∈ repo/article/post/discussion/other, `url` http(s), `note` ≤500), `related_repos[]` (`owner/name`), optional `why_now` (≤1000); `additionalProperties: false` everywhere | FR-001 |
| 2 | `packages/ideas` exports `validateIdeaFile(json, fileName)` returning `{ ok: true, file } \| { ok: false, errors: string[] }`; each error names the file and the JSON path of the field (e.g. `ideas/2026-11-10.json: /ideas/0/url must match format "uri"`) | FR-003 |
| 3 | `loadIdeas(dir)` reads every `*.json` directly under `dir` (not `examples/`), skips invalid files and unknown `schema_version` with a reason, rejects files over 1 MB, and returns `{ ideas, skipped }`. Merging by `id`: latest `date` wins; same date → file name that sorts last. Each merged idea carries `first_seen`, `last_seen` (dates) and `files` (names). Same input files in any order → identical output | FR-005, FR-004 |
| 4 | `pnpm ideas:check` validates every file in `ideas/` (and `ideas/examples/`), prints each error, exits 1 on any invalid file, 0 otherwise; an empty `ideas/` passes | FR-003, FR-004 |
| 5 | `.github/workflows/ci.yml` runs `pnpm ideas:check`; any new `uses:` stays SHA-pinned | FR-004 |
| 6 | `routines/daily-ideas.md` is a ready-to-paste routine prompt: research steps, the exact file path pattern, the schema link, "run `pnpm ideas:check` before committing", "commit only `ideas/<date>.json` and push to `main`", and "never edit other files" | FR-002 |
| 7 | `ideas/README.md` documents the format and the merge rule; `ideas/examples/2026-11-10.example.json` is a valid example that passes `ideas:check` | FR-001 |
| 8 | Negative: a file with an extra property, a bad `id`, a non-http URL, `schema_version: 2`, or broken JSON is rejected with file + field; the loader still returns the valid files | FR-003, FR-005 |

---

## Evaluation & Acceptance (How we know the agent worked correctly)

### Success Criteria (observable, pass/fail)

| # | Given (input/state) | Expect (output/behavior) | How it's checked |
|---|---------------------|--------------------------|------------------|
| 1 | valid example file | `validateIdeaFile` ok; `ideas:check` exit 0 | automated test + command |
| 2 | file with `ideas[0].url = "ftp://x"` | error string contains file name and `/ideas/0/signals/0/url` | automated test |
| 3 | two files, same `id`, dates 2026-11-09 and 2026-11-10 | merged idea is the 11-10 version; `first_seen` 2026-11-09 | automated test |
| 4 | same files passed in reverse order | identical `loadIdeas` output | automated test |
| 5 | one broken JSON file + one valid | `skipped` has 1 entry with reason; `ideas` from the valid file | automated test |

### Verification Command (exact, runnable)

```bash
pnpm install --frozen-lockfile && pnpm --filter @idea-radar/ideas test && pnpm ideas:check && pnpm lint && pnpm typecheck
```

### Evidence (filled by reviewer at Stage 4/5)

> **Moved.** Filled by the reviewer at Stage 4/5 in `tasks/TASK_REVIEW_T028.md`.

---

## Demonstration

> **Moved.** See `tasks/TASK_REVIEW_T028.md`.

---

## Approach

**Pattern reference**: `packages/core/package.json` + `packages/core/tsconfig.json` — package layout (`exports` with `source` condition, `tsc` build, `tsx --test` tests next to code).

**Vital slice**: `validateIdeaFile` + `loadIdeas` merge rule — everything else (CLI, CI step, prompt) wraps them.
**Cut list**:
- Generating TS types from the schema (hand-write `types.ts` to match; a test checks the example against both)
- Postgres loader (deferred, PRD Out of Scope)
- `claude/*` branch fallback (BRAINSTORMING_LOG cut list)

Use `ajv` (2020 draft, `ajv-formats` for `uri`/`date`) so the routine and the code share the one schema file — RULE: `PROJECT_SPEC.md § Critical Constraints` "Every idea file must pass `ideas/schema.json`". Put the CLI at `packages/ideas/src/cli.ts`; root script `"ideas:check": "pnpm --filter @idea-radar/ideas check"` (or a direct `tsx` call). Keep `packages/core` and others untouched — T030 deletes them.

---

## Edge Case Checklist

- [ ] Duplicate `id` within one file → validation error (file + both indexes)
- [ ] Empty day (`ideas: []`) is valid
- [ ] Unknown `schema_version` → skipped with a clear reason, not misread
- [ ] File over 1 MB → skipped, never parsed
- [ ] Non-`.json` files and sub-directories in `ideas/` are ignored by the loader
- [ ] Merge is deterministic regardless of `readdir` order
- [ ] Idea text is untrusted: the loader never evaluates it
- [ ] Pin-test pre-flight: the `Pre-existing pin tests` row below is filled before work starts
- [ ] Stale references: grep for any old wording this task changes (none expected; new files only plus CI/package.json)

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `ideas/schema.json` | new — the contract |
| `ideas/README.md`, `ideas/examples/2026-11-10.example.json` | new — docs + example |
| `packages/ideas/{package.json,tsconfig.json,src/*.ts}` | new — types, validate, load, cli, tests |
| `routines/daily-ideas.md` | new — routine prompt |
| `package.json` | add `ideas:check` script |
| `.github/workflows/ci.yml` | add `pnpm ideas:check` step |
| `pnpm-lock.yaml` | `ajv`, `ajv-formats` |
| Pre-existing pin tests | `scripts/repo-hygiene.test.ts` pins `ci.yml` (`uses:` SHA-pinned, `--frozen-lockfile`, permissions): keep those properties; no repoint needed |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `apps/*`, `packages/core`, `packages/connectors`, `packages/db` | v1 — deleted in T030, not edited here |
| `.claude/`, `skills/`, `templates/`, `docs/claude-md/`, `AGENTS.md`, `CLAUDE.md` | kit |

---

## Test Plan

Unit tests in `packages/ideas/src/*.test.ts` covering Success Criteria 1–5 and AC 8 negatives, with temp directories for loader tests. Then run the Verification Command.

---

## Completion Checklist

- [ ] Implementation done
- [ ] Self-review: `Skill({ skill: "code-review" })` run
- [ ] Security review: `Skill({ skill: "security-review" })` run (if Medium/High risk)
- [ ] Lint passes
- [ ] Tests written AND pass — output pasted into `tasks/TASK_REVIEW_T028.md`'s Evidence table (Hard-Stop Gate 5)
- [ ] `Skill({ skill: "verify" })` run — feature confirmed working in running app
- [ ] `memory/MEMORY.md` updated (if new patterns or feedback learned)
- [ ] Supervisor notified: task ready for Stage 4 review
