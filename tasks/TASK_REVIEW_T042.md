# TASK_REVIEW — T042: routine prompt flags suspicious repositories (caution tag, skip bait)

> Sibling of `tasks/TASK_GUIDE_T[NNN].md`. Everything here is **filled by the reviewer at Stage
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
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `scripts/repo-hygiene.test.ts`: new test "the routine prompt skips bait, tags borderline repositories caution, and never runs a repository (T042)" (security or toolkit, re-upload, captcha, cheats, nonexistent, `caution`, skip rule, tags order, skipped count in the reply, run/install); the cap test is now 740. Red first on the 669-word prompt: `AssertionError: the caution sign for a security or toolkit pitch is missing` (15 pass, 1 fail). |
| Verification command run | ☑ pass | `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` exit 0, run with `TEST_DATABASE_URL` on my own PGlite (port 55438, stopped by PID after). Tests: ideas 13/13, db 23/23, mcp 108/108, scripts 16/16; 0 failed, 0 skipped in every package. `Checking formatting... All matched files use Prettier code style!` |
| Negative cases hold | ☑ pass | Mutation 1: removed the `caution` tag rule (the `add the tag` clause and the tags-line tail); `git diff --stat -- routines/daily-ideas.md` non-empty; red: `ℹ pass 15 / ℹ fail 1`, `the caution tag is missing`. Mutation 2: changed `Clearly bait: skip it` to `ignore it`; red: `the skip rule for clearly bait is missing`. Restored: `ℹ pass 16 / ℹ fail 0`, prompt body 739 words. |
| verify | ☑ pass | Run by the Supervisor on commit `e502631`, not a user-typed `/verify` (the user said "let go"): a real production build on a fresh PGlite (port 55439) and a server on port 18092. A 13-idea submission with two ideas tagged `low-key`, `caution` and a `why_now` clause saved 13, and sent again saved 13; a 4-tag idea (`rising`, `caution`, `a`, `b`) saved. `list_ideas` with tag `caution` returned the 3 flagged ideas; the dashboard `?tag=caution` page listed exactly those 3; the low-key section held both flagged ideas with a `caution` chip; the idea page showed the clause. The prompt's word count is 739 and its only host is `github.com`. Both processes stopped by PID — pass. The routine's real choices (does it skip bait and tag borderline repositories) are not tested here; the owner's live run is that check |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | `git diff main...t042-caution-flags`: `routines/daily-ideas.md`, `scripts/repo-hygiene.test.ts` plus this file. Read: the prompt tests from line 111, `apps/mcp/src/html.ts:224` (bucket is `tags[0]`, card shows `tags.slice(1)`), `ideas/schema.json` tags rule; the agent's grep over `docs/deploy.md` and `ideas/README.md` checked (nothing quoted changed). `lane_check`: C1, 2 files, 60 lines, FITS |
| Full smoke suite still green (no regression) | ☑ pass | the full `pnpm test` above, 0 skipped |
| **Companion score (easy-verifier)** | ☒ N/A | The easy-verifier server failed to connect in this session (CONNECT_TIMEOUT), so there is no score |
| **UI: Visual regression (diff or verdict pasted)** | ☒ N/A | No UI change (a prompt file and a text test) |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☒ N/A | No UI change (a prompt file and a text test) |
| **UI: Responsiveness at target viewports** | ☒ N/A | No UI change (a prompt file and a text test) |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE** (captured 2026-11-11T15:04:34Z in the T042 worktree at HEAD 5b41bf3, before any implementation commit):

```
$ awk 'f{print} /^---$/{f=1}' routines/daily-ideas.md | wc -w
669
$ grep -n '^- `tags`' routines/daily-ideas.md
58:- `tags`: at most 4, kebab-case, the bucket first.
```

**AFTER**:

```
$ awk 'f{print} /^---$/{f=1}' routines/daily-ideas.md | wc -w
739
- `tags`: at most 4, kebab-case, the bucket first, `caution` second when flagged.
```

**DELTA**: [one sentence — what a user can now do that they could not before]

**WITNESS**: the Supervisor, 2026-11-11, ran the hygiene file (16 of 16) and drove the real production build with caution-tagged submissions on port 18092 (see the `verify` row). The `memory/event-trace/T042.jsonl` file was not consulted.

## Stage 4 reviews (2026-11-11, by the Supervisor; the agent did not run the review skills)

- **Code review**: no P0, P1 or P2. Three P3 notes: the explicit "Do not call it again" after the `list_ideas` rule was trimmed (the word `once` still says it); the prompt is 739 of 740 words, so the next prompt change must trim or raise the cap; a replacement after a skipped repository can cost a page, covered by the 20-page cap and the "send fewer" rule. Report: `reports/code-review_t042-caution-flags_20261111T150951.html`.
- **Security review**: nothing at confidence 8 or higher. Report: `reports/security-review_t042-caution-flags_20261111T150951.html`.
- **lane_check**: C1, 2 files, 60 lines, FITS.
