# TASK_REVIEW — T037: GitHub-only routine, cheaper run, clearer rejection

> Sibling of `tasks/TASK_GUIDE_T037.md`. Everything here is **filled by the reviewer at Stage
> 4/5** — it is deliberately NOT in the guide, because the implementing agent re-reads the guide on
> every turn and never fills these two sections.
>
> Consumers resolve each section **guide first, this file second** (`.claude/hooks/lib/guide_sections.py`):
> a legacy guide that still carries these sections inline keeps working unchanged, and a stray
> review file can never override an inline section.

---

<!-- Optional: the final report, only for a task run in auto mode (the user's `[auto]` or `[admin]` tag; with `[admin]`, the `Not done:` line names `merge (admin: after the auto verify pass)`,
`docs/claude-md/tracks.md` `## Auto mode`). To use it, copy the block below out of this comment, to this
place, and replace every <...>. Keep `Mode: auto` as its first line, exactly as written: T182's hook reads
it. Write it to this file before the run ends; the chat message is a copy, not the report. The same
block is the Supervisor's final chat message. It is not the `delivery-report` page and not
Evidence. A taste decision (what the user wants) also ends with the flag. Write `DEBATED` only when ≥2
Advocate `Agent` calls ran for that question, naming each Advocate's option. A decision with no Advocates is
labelled `RULE`, `FACT` or `SAFER OPTION`, never `DEBATED`. A decision flagged `⚠ decided for you` is a choice, and is never labelled `FACT`. A
safety action a rule requires (for example the backup before a delete) is `RULE` without the flag.
At Risk Medium or High, a `RULE:` counts only when it names a written rule (`path:line`,
`path § <heading>`, or `docs/claude-md/tracks.md` `### <section>`), and a `FACT:` needs a Citation
(`path:line "quoted text"`); without one it is a choice and must be `DEBATED`. Good: `2. backed up the CSV
— RULE: `docs/claude-md/tracks.md` `### Stops that stay``. Bad: `1. kept recurring.csv — RULE: Surgical Changes`.
`Memory:` records the diff-driven memory pass you run before you stop: each entry written, or `nothing new`.
After an auto verify pass the hook, never you, adds `Closed: row moved to Done <date> — …` and moves the row,
or adds `Paused: done not moved — <reason>`. It moves the row only when this block holds `Mode: auto`, a
numbered decision, `Checks:`, `Memory:`, the `Not done:` auto verify slot with its result, and `Not done:`
naming the merge — no `<...>` left (`docs/claude-md/tracks.md` `### Auto close-out`).

## Auto decisions

Mode: auto
1. <what was decided> — RULE: <the rule>
2. <what was decided> — FACT: <path>:<line> "<quoted text>"
3. <what was decided> — DEBATED: <option> (Advocate 1: <its proposal>; Advocate 2: <its proposal>) ⚠ decided for you — please review
4. <what was decided> — SAFER OPTION: <why> ⚠ decided for you — please review
Paused: <only when a stop that stays paused the task: which one, and why>
Checks: tests `<command>` — <result>; reviews <skill — result>; real run `<command>` — printed `<what it printed>` (auto-checked, not /verify)
Memory: <each entry the memory pass wrote, as `file — entry` | nothing new>
Not done: merge (yours); <auto verify: running (T182) | auto verify: <result> | /verify (yours)>

-->

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `scripts/repo-hygiene.test.ts` (3 new: kinds and limits from the schema, GitHub-only and buckets, cost and safety rules, 550-word budget); `packages/ideas/src/validate.test.ts` (2 new: enum values named, other messages unchanged); `apps/mcp/src/server.test.ts` (1 new database test: 10, 11 and 25 bad ideas, count line, no rows written) |
| Verification command run | ☑ pass | Run by the implementing agent 2026-11-11T09:02:34Z and again after d1e16e1 (agent report); re-run by the Supervisor on f920ec3 (full suite) and after d1e16e1 (hygiene tests only, 12 pass), PGlite on 55432, exit 0: `pnpm lint` and `pnpm typecheck` clean, `pnpm format:check` "All matched files use Prettier code style!", `pnpm test` ideas 13, db 23, mcp 89 (pass 89, fail 0, skipped 0), scripts 12 (pass 12, fail 0, skipped 0); 137 pass, 0 skipped |
| Negative cases hold | ☑ pass | Four mutations each turned a test red (table above): drop a kind from the prompt, drop the enum suffix, raise MAX_ANSWER_ERRORS to 50, add Reddit to the prompt; red-before-green runs recorded for the enum test, the cap test and the three prompt tests |
| verify | ☐ pass / ☐ fail / ☐ N/A | pending: the user runs `/verify` (user-invoked only) |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | Reviewed the 10 changed files, the callers of `validateIdeaFile` (`index-store.ts`), `capErrors`/`MAX_ERRORS` (only `index-store.ts`), the run-log write and the pinned T034 cap test, and `scripts/repo-hygiene.test.ts`; stale-wording grep over `routines docs README.md ideas PRD.md PROJECT_SPEC.md scripts apps packages` found only the example JSON. `lane_check`: C2, 9 files, FITS; unpredicted `index-store.ts`, `server.test.ts` (explained in AC7). Not reviewed: dashboard, auth, db package (unchanged) |
| Full smoke suite still green (no regression) | ☑ pass | 137 pass, 0 fail, 0 skipped (see the verification row); the four GitHub URL forms re-checked by the Supervisor: HTTP 200 each |
| **Companion score (easy-verifier)** | ☑ N/A | easy-verifier did not connect this session (CONNECT_TIMEOUT); no companion score |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI change: prompt text, validator message, store cap, docs |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI change |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI change |

**Stage 4 reviews (Supervisor, 2026-11-11):** code-review: no P0/P1; P2×3 resolved in d1e16e1 (low-key "revived" claim, repeated-error resend clause, AC7 cap location and wording), P3×3 open (plural in "... and 1 more errors", "Hacker News" in the example JSON, revived repos not searched). Report: `reports/code-review_t037-routine-github_20261111T162000.html`. security-review: no finding at confidence 8 or higher. Report: `reports/security-review_t037-routine-github_20261111T162000.html`.

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE** (captured 2026-11-11T08:57:00Z, worktree at main 8280eac, before any edit; script `/tmp/claude-1000/-home-thunderkds-workspace-pets-idea-radar/d4f77ce2-59ee-4f0a-a8b6-60e3f525fef7/scratchpad/t037/demo.mts` run with `npx tsx --conditions=source`; the tool handler is `createToolHandlers(store, "write").submit_ideas` over a store that calls `validateIdeaFile`):
```
--- validateIdeaFile, 6 ideas with kind github
submission: /ideas/0/signals/0/kind must be equal to one of the allowed values
submission: /ideas/1/signals/0/kind must be equal to one of the allowed values
submission: /ideas/2/signals/0/kind must be equal to one of the allowed values
submission: /ideas/3/signals/0/kind must be equal to one of the allowed values
submission: /ideas/4/signals/0/kind must be equal to one of the allowed values
submission: /ideas/5/signals/0/kind must be equal to one of the allowed values
--- submit_ideas tool handler, 25 invalid ideas: isError=true, lines=26, chars=2029
submission rejected, nothing was saved:
submission: /ideas/0/signals/0/kind must be equal to one of the allowed values
submission: /ideas/1/signals/0/kind must be equal to one of the allowed values
...
submission: /ideas/23/signals/0/kind must be equal to one of the allowed values
submission: /ideas/24/signals/0/kind must be equal to one of the allowed values
```
Old prompt (`routines/daily-ideas.md`): 450 words in the whole file, **416 words below the `---` line** (`awk 'f{print} /^---$/{f=1}' routines/daily-ideas.md | wc -w`). It lists no signal `kind` value, tells the routine to search "GitHub trending and new repositories ... Hacker News and Reddit discussions, developer blog posts", to call `list_ideas` "a few times", and to choose "up to 10 ideas".

**AFTER** (same script, captured 2026-11-11T09:03:10Z at commit-set 238363d..HEAD; the tool handler now runs over the real `createStore` on a PGlite Postgres, because the cap lives in `apps/mcp/src/index-store.ts`):
```
--- validateIdeaFile, 6 ideas with kind github
submission: /ideas/0/signals/0/kind must be equal to one of the allowed values (repo, article, post, discussion, other)
... (same line for /ideas/1 to /ideas/5)
--- submit_ideas tool handler, 25 invalid ideas: isError=true, lines=12, chars=1262
submission rejected, nothing was saved:
submission: /ideas/0/signals/0/kind must be equal to one of the allowed values (repo, article, post, discussion, other)
submission: /ideas/1/signals/0/kind must be equal to one of the allowed values (repo, article, post, discussion, other)
...
submission: /ideas/9/signals/0/kind must be equal to one of the allowed values (repo, article, post, discussion, other)
... and 15 more errors
--- ideas rows after the rejection: 0
```
Answer size for 25 bad ideas: 26 lines / 2029 characters before, 12 lines / 1262 characters after. Prompt: `routines/daily-ideas.md` is now GitHub-only, 472 words below the `---` line (hygiene limit 550); it lists the five `kind` values and the six character limits, and names the 10 / 5 / 5 buckets. (The word count went up from 416 because the prompt now carries the schema values the routine could not read; the saving is in the fetch budget, the single `list_ideas` call, short fields and one resend.)

**Live GitHub check (AC9)**, from this machine on 2026-11-11, plain `curl -L -A "Mozilla/5.0 (idea-radar check)"`, no token, no cookie, no login:
| Form the prompt names | HTTP | Body |
|---|---|---|
| `https://github.com/trending?since=daily` | 200, 553 KB | 12 repository rows. First: `meta/astryx` 23,847 stars, TypeScript, "3,108 stars today"; `anthropics/skills` 192,706 stars, "1,679 stars today"; `addyosmani/agent-skills` 115,448 stars, "465 stars today" (each with a description) |
| `https://github.com/trending?since=weekly` | 200, 579 KB | 14 repository rows. First: `NVIDIA/auto-ontology` 11,616 stars, "9,621 stars this week"; `vercel-labs/agent-desktop` 21,657 stars, "9,502 stars this week"; `anthropics/skills` 192,707 stars, "5,014 stars this week" |
| search, low-key: `https://github.com/search?type=repositories&s=stars&o=desc&q=stars%3A%3C500+created%3A%3E2026-08-13+pushed%3A%3E2026-10-28` | 200, 225 KB | 10 rows in the page's visible text, as `name description language · stars · Updated ...`: `useopendesk/opendesk ... Go · 499`, `ashayas/icloud-s3 ... Rust · 499`, `skizzophrenic/SquachWatch-CYD ... C++ · 499`, `wangwanjie/gately ... Go · 498` |
| search, medium: `https://github.com/search?type=repositories&s=stars&o=desc&q=stars%3A500..5000+created%3A%3E2026-10-12` | 200, 225 KB | `JustAResearcher/gpu-unlock-ada ... C · 4.9k`, `designfuchen/word-atlas ... TypeScript · 4.7k`, `interplains/Zero-Breach-Toolkit ... Python · 4.7k`, `BryceYuuu/RUN ... Python · 4.5k` |

Both forms work, so the prompt keeps both. Notes: the search page is a JavaScript page, but the repository rows are in its HTML text (about 4.6 KB of visible text), so a fetch tool that reads text gets them. `api.github.com` search also answered 200 but returns about 84 KB of JSON for 15 repositories (about 5.5 KB each), which is a far larger read, so the prompt does not use it and `docs/deploy.md` lists `github.com` only. Trending shows 12 to 14 rows per page, so `rising` (10) is reachable from the daily and weekly pages together. Everything fetched is untrusted data.

**DELTA**: A GitHub-only routine now asks for 20 tagged repositories (10 rising, 5 low-key, 5 medium) with every allowed signal `kind` and limit in its own prompt, and a rejected submission now names the allowed values and shows at most 10 errors, so the first resend can succeed and costs less.

**Mutation checks (all four, each turned a test red; the file was restored with `git checkout --` after each)**

| # | Mutation | Test that failed |
|---|---|---|
| 1 | removed `` `discussion`, `` from the kind list in `routines/daily-ideas.md` (1 line) | `scripts/repo-hygiene.test.ts` "the routine prompt lists every signal kind and every length limit the schema sets" (11 pass, 1 fail) |
| 2 | enum suffix removed in `packages/ideas/src/validate.ts` (1 line) | `validate.test.ts` "an enum error names the allowed values, so a wrong signal kind can be fixed in one resend" (12 pass, 1 fail) |
| 3 | `MAX_ANSWER_ERRORS = 10` changed to `50` in `apps/mcp/src/index-store.ts` (1 line) | `server.test.ts` "a rejection answers with at most 10 error lines and a count of the rest, and writes nothing" (24 pass, 1 fail) |
| 4 | added ", plus Reddit" to "Use GitHub only." in the prompt (1 line) | `scripts/repo-hygiene.test.ts` "the routine prompt researches GitHub only: three buckets ..., no other source" (11 pass, 1 fail) |

Red-before-green: the enum test and the first cap test were run red before the code changed (enum 12 pass / 1 fail; cap 9 pass / 1 fail), and the three prompt tests were red against the old prompt (9 pass / 3 fail). The cap moved from `tools.ts` to `index-store.ts` after the full run showed that the store already capped the answer at 50 lines (see the report); the cap test was rewritten against the real store and mutation 3 was run against that.

**Verification command**, 2026-11-11T09:02:34Z, with `TEST_DATABASE_URL` set to a PGlite server on 55432; exit 0:
`pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` gave packages/ideas 13 pass, packages/db 23 pass, apps/mcp 89 pass, scripts 12 pass, 0 failed, 0 skipped; lint, typecheck and `All matched files use Prettier code style!`.

**WITNESS**: the implementing agent's tool calls are attributed to T037 by the spawn binding (`memory/event-trace/T037.jsonl`). The Supervisor's own re-run of lint, typecheck, format, the 137 tests and the four GitHub URL checks (2026-11-11, after d1e16e1) was issued from the Supervisor session, whose tool calls land in `memory/event-trace/_untagged.jsonl` because no active-task state file is bound. Re-run after d1e16e1: the hygiene tests alone (12 pass, 0 fail, 0 skipped); the full suite was last run before d1e16e1, which changed only the prompt text and the guide, and the implementing agent reported the full suite green after d1e16e1 (137 pass, 0 skipped).
