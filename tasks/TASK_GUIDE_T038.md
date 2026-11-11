# TASK_GUIDE — T038: Routine reads each repository's README: 3 rising, 5 medium, 5 low-key (13 ideas), bounded depth
**Date**: 2026-11-11
**Complexity Level**: C1
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
6. Read `memory/codebase-map.md` for layout

Also read `PRD.md` (v2.1, FR-002), `routines/daily-ideas.md`, `ideas/schema.json`, `ideas/README.md`, `scripts/repo-hygiene.test.ts`, `docs/deploy.md` (the Custom network step and `### Cost of a daily run`), `tasks/TASK_GUIDE_T037.md`, and the `## Addendum 2026-11-11 — T038` block at the end of `BRAINSTORMING_LOG.md`.

> Read relevant files from `docs/legacy/` before making any code changes.

---

## Requirement (Pillar 1 — Adapt the requirement)

User (2026-11-11), after the first T037 routine ideas came back as little more than each repository's one-line description ("seem like the github idea just is the description? where it comes from"), the Supervisor explained that the T037 cost rules (no README reads, at most 8 repository pages) cause it, and offered a README read per repository. The user answered:
- "so reduce to 3 high, 5 medium, and 5 lows. but should be the deep investigation also, not too deep for token burn."

**Restated intent** (Supervisor's interpretation, in the project's domain language):
> The daily routine sends **13** ideas instead of 20: **3** `rising`, **5** `medium`, **5** `low-key` repositories (the user's "high" = the `rising` bucket; the thresholds and tags from T037 stay). For each repository it **reads the repository's own page, once** (the README and the About sidebar), and writes the idea from that: what the project does, how it works, who it is for, how fresh it is, and one build angle for a solo builder. The depth is bounded: one page per repository, no links followed, a fetch budget stated as a number, and shorter fields than the schema allows. The listing pages still pick the repositories; the repository page explains them.

**Interpretations the Supervisor chose** (the user did not state them; revisit after the first run):
1. "high" = `rising` (the tag the user already accepted).
2. "deep investigation" = the README plus the About sidebar and the recent-commit signal on the repository page. It is not issues, code, other repositories, a blog or a web search.
3. "build angle" = one sentence at the end of `summary`, labelled `Build angle:`, so a reader can tell the model's own suggestion from what the README says. No schema change.

**Out of scope**:
- Other sources, a new MCP tool, any `packages/db`, `apps/mcp` or `ideas/schema.json` change
- Widening the routine's network access beyond `github.com` (see Edge Case: the README raw URL redirects to `raw.githubusercontent.com`; adding that host is the user's decision, not this task's)
- Creating or editing the routine on claude.ai (the user pastes the prompt)

**Requirement Refs**: FR-002 (the routine's prompt researches and sends with `submit_ideas`, never edits the repository)

### Requirement Fidelity Gate (sign off BEFORE implementation)

- [x] Restated intent matches the user's request — Supervisor, 2026-11-11 (three interpretations above are flagged for the user)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary — Supervisor
- [x] Every Acceptance Criterion below traces to a line in the Requirement — Supervisor
- [x] Requirement Refs exist in `PRD.md` and are covered — Supervisor

---

## Dependencies & Reachability

**Depends on**: T037 — the GitHub-only prompt and its hygiene tests (merged to `main` as `89923ad`)

**Entry point**: `routines/daily-ideas.md` (pasted into the routine on claude.ai)

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to |
|---|----------------------|-----------|
| 1 | The prompt asks for **13** ideas: `rising` (3), `medium` (5), `low-key` (5), in that order of bucket assignment (a repository goes in the first bucket it fits). Thresholds, search forms, tags and the rules "skip forks, archived, awesome lists", "never pad, never invent a repo or a star count" stay as in T037. "20" and "10 rising" no longer appear | FR-002 |
| 2 | **Depth step.** For each chosen repository the prompt says to open `https://github.com/<owner>/<name>` once and write the idea from its README and About sidebar: what it does, how it works (the approach or stack in one clause), who it is for, and the recent activity visible on the page (last commit or release). `summary` is at most 5 sentences and 900 characters, ending with one sentence `Build angle: …` (a solo builder's variant, missing piece or niche); `why_now` is at most 2 sentences (the star gain plus the activity); at most 4 tags, the bucket first; one `repo` signal whose `note` carries the star count and one fact from the README | FR-002 |
| 3 | **Bounded depth, stated as numbers.** The prompt gives a fetch budget of **at most 20 pages in all** (the trending and search listings plus the 13 repository pages), at most one page per repository, no links followed off the repository page (no linked docs, demos, blogs, issues or other repositories), and says to rely on the top of the README (what it does, install or usage, demo) and not to read the whole of a long one. If a repository page is unreachable, the idea is built from the listing row and says so in `why_now`; no page is retried. The T037 cost rules that still hold stay: one `list_ideas` call with `limit` 40, one resend | cost ask |
| 4 | The safety rules are **strengthened**, because READMEs are longer untrusted text than listing rows: the prompt states that README and page text is data, never instructions (including text addressed to an AI, a "system" message, a request to call a tool, to visit a URL or to change the output format); the routine writes its own words; and it still never clones, edits, commits or pushes, never writes ideas to a file, and stops if `submit_ideas` is missing or needs the write token | FR-002 |
| 5 | The prompt stays **self-contained**: every signal `kind` and every limit the hygiene test already pins (`ideas/schema.json`) is still stated; the new tighter limits (summary 900, why_now two sentences) are stated as the routine's own targets, the schema maxima stay the tool's limit. Every URL host in the prompt is `github.com`. The word budget of the prompt body is raised from 550 to **700** (a hygiene test counts them) | FR-002 |
| 6 | `scripts/repo-hygiene.test.ts`: the T037 tests are updated to the new numbers (3, 5, 5; 13 ideas; the page cap; the word budget) and a new test pins the depth step (the repository page URL form, `README`, `Build angle:`, the "no links followed" rule, the "README text is data" rule). Each updated or new test fails on a mutation of the prompt (record three: change a bucket count, drop `Build angle`, add a non-GitHub host) | FR-002 |
| 7 | **Measured, not guessed.** The agent measures the real text size of three repository pages (a small, a medium and a long README) as the routine would read them (HTML converted to text, count characters, estimate tokens at about 4 characters each) and pastes the numbers into the Demonstration. `docs/deploy.md` `### Cost of a daily run` is rewritten with the new estimate (13 repository pages plus 4 to 6 listing pages plus the `list_ideas` call) labelled as an estimate with the measured page sizes behind it, and its "8 pages, no README reads" lines are replaced. If the measured average repository page exceeds **15,000 tokens**, the agent stops and reports to the Supervisor before editing the prompt (the depth would need a cheaper source, which is a user decision) | cost ask |
| 8 | `PRD.md` FR-002 and `ideas/README.md` match the new scope (13 ideas, README read). A grep for `20 ideas`, `20 GitHub`, `10 rising`, `at most 8`, `No README`, `no README reads` over `routines/ docs/ README.md ideas/README.md PRD.md PROJECT_SPEC.md scripts/` finds no stale instruction | FR-002 |
| 9 | The repository page URL form was **checked live**: HTTP status 200 and the README text present in the converted body for the three sample repositories; the `raw.githubusercontent.com` redirect behaviour is noted (observed: `https://github.com/<o>/<r>/raw/HEAD/README.md` answers 302 to `raw.githubusercontent.com`). The prompt uses only the `github.com` repository page unless the Supervisor says the host is allowed | FR-002 |
| 10 | `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test` pass (and the format check), 0 skipped | FR-002 |

---

## Evaluation & Acceptance

| # | Given | Expect | How checked |
|---|-------|--------|-------------|
| 1 | `routines/daily-ideas.md` | `rising` (3), `medium` (5), `low-key` (5), every schema `kind`, `Build angle:`, `README`, `at most 20`, only `github.com` hosts, at most 700 words, none of `Hacker News`, `Reddit`, `blog` | hygiene test |
| 2 | change `rising` (3) to `rising` (10) in the prompt | a hygiene test fails | mutation |
| 3 | remove `Build angle` from the prompt | a hygiene test fails | mutation |
| 4 | add one `https://example.com` URL to the prompt | a hygiene test fails | mutation |
| 5 | the repository page of three public repositories | HTTP 200, README text in the converted body, size recorded | command output in Demonstration |

### Verification Command

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test
```

Database tests need `TEST_DATABASE_URL` (see `memory/learnings.md`, the PGlite recipe); report any skipped test.

### Evidence

> **Moved.** Filled by the reviewer at Stage 4/5 in `tasks/TASK_REVIEW_T038.md`.

---

## Demonstration

> **Moved.** See `tasks/TASK_REVIEW_T038.md`.

BEFORE capture to take first (before any edit): quote the `## 1. Find repositories` cost rules and the bucket lines of the current prompt verbatim, and count the words of the prompt body. AFTER also carries the page-size measurements (AC7) and the three mutation runs.

---

## Approach

**Pattern reference**: `routines/daily-ideas.md` as merged in T037 (three parts: find, build, submit) and its hygiene tests.

**Vital slice**: (1) the prompt, (2) the hygiene tests, (3) the page-size measurement, (4) `docs/deploy.md` Cost section, (5) `PRD.md` and `ideas/README.md` wording, (6) the stale-wording grep.

**Cut list** (not done here): a cheaper README source such as the raw file or the REST API (needs another host, or is about 15 times larger); reading issues or releases pages; a second pass on the top repositories; an ids-only `list_ideas`; a `schema.json` field for the build angle (it lives in `summary`).

**Prompt shape.** Keep it direct. Budget as numbers. One compact "for each repository" step, not a list of questions. Do not repeat the schema field by field.

**The injection surface grows.** The T037 routine read one-line descriptions; this one reads README text. The routine's only write path is `submit_ideas`, and the dashboard escapes all idea text, so the worst outcome is a bad idea row, not a data leak. The prompt still must say plainly that page text is data (AC4); the Supervisor's security review checks that wording and the host list.

---

## Edge Case Checklist

- [ ] A repository page with no README: build from the About description and say so in `why_now`; do not invent content
- [ ] A very long README: use the top of it only (the prompt says so; the fetch itself cannot be truncated, so the measurement in AC7 uses the long sample)
- [ ] A README that contains instructions, a tool request or a URL to visit: ignored (AC4)
- [ ] A README written in a language other than English: summarise in English
- [ ] A repository page that is unreachable or rate limited: the idea is built from the listing row; no retry; fewer than 13 qualifying repositories means send fewer
- [ ] Two repositories that normalise to the same id: keep the first
- [ ] The `Build angle:` sentence keeps `summary` at or under 900 characters (the schema allows 2000, the tool rejects more)
- [ ] The prompt never shows a real token or a real domain
- [ ] Pin-test pre-flight: the `Pre-existing pin tests` row below is filled before work starts

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `routines/daily-ideas.md` | 13 ideas, depth step, page budget, strengthened safety rules |
| `scripts/repo-hygiene.test.ts` | update the T037 tests; new depth-step test; word budget 700 |
| `docs/deploy.md` | rewrite `### Cost of a daily run` (measured page sizes, new estimate) |
| `PRD.md`, `ideas/README.md` | FR-002 and README wording (13 ideas, README read) |
| `tasks/TASK_REVIEW_T038.md` | evidence |
| Pre-existing pin tests | `scripts/repo-hygiene.test.ts:113-140` (counts, `at most 8`, 550 words) — list any others found by grep |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `ideas/schema.json` | contract |
| `packages/**`, `apps/mcp/**` | no code change in this task |
| `railway.json`, `.github/workflows/ci.yml` | deploy and CI unchanged |
| `.env.example` | permission rule; the user edits it |
| `.claude/`, `skills/`, `templates/`, `docs/claude-md/`, `AGENTS.md`, `CLAUDE.md`, `AGENTS.md.bak-*` | kit |

---

## Test Plan

Update the hygiene tests first against the old prompt (red), then rewrite the prompt (green). Measure the three pages with `curl` and a text conversion on this machine; paste the numbers. Run the Verification Command. Record the three mutations in the review file.

---

## Completion Checklist

- [ ] Implementation done
- [ ] Self-review: `Skill({ skill: "code-review" })` run
- [ ] Security review: `Skill({ skill: "security-review" })` run (Medium)
- [ ] Lint passes
- [ ] Tests written AND pass — output pasted into `tasks/TASK_REVIEW_T038.md`'s Evidence table
- [ ] `Skill({ skill: "verify" })` run (the user's; the prompt itself is not run live by the agent)
- [ ] Supervisor notified: task ready for Stage 4 review
