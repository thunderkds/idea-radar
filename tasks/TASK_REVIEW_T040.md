# TASK_REVIEW — T040: Cleanup: PORT wording, stale idea-file wording

> Sibling of `tasks/TASK_GUIDE_T040.md`. Everything here is **filled by the reviewer at Stage
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
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `scripts/repo-hygiene.test.ts`: "docs/deploy.md states the same default PORT as apps/mcp/src/index.ts and does not forbid setting PORT" (AC 1, 2) and "ideas/schema.json describes a submission, not an idea file" (AC 3, 5). Both were red on the prior content (`deploy.md does not say the server uses 8080 when PORT is unset`; `schema wording is stale: Idea Radar idea file`), green after the edits. AC 3 validation behaviour: `git diff ideas/schema.json` shows only the `title` and `description` lines, and the 13 `packages/ideas` tests plus the 107 `apps/mcp` tests (valid and invalid submissions) pass |
| Verification command run | ☑ pass | 2026-11-11T19:17:56+07:00, `TEST_DATABASE_URL=postgres://postgres:pg@localhost:55434/postgres` (PGlite on 55434, stopped afterwards). `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` exit 0. `packages/ideas`: tests 13, pass 13, fail 0, skipped 0. `packages/db`: tests 23, pass 23, fail 0, skipped 0. `apps/mcp`: tests 107, pass 107, fail 0, skipped 0. `scripts`: tests 15, pass 15, fail 0, skipped 0 (13 before, +2 new). `All matched files use Prettier code style!` |
| Negative cases hold | ☑ pass | Mutation 1: the sentence "Do not set PORT." put back in `docs/deploy.md` step 5 (`git diff --stat -- docs/deploy.md`: 1 file changed, 7 insertions, 5 deletions, non-empty) -> `ℹ pass 14 / fail 1`, `AssertionError: deploy.md must not forbid setting PORT`; restored, re-run `pass 15 / fail 0`. Mutation 2: `"title": "Idea Radar idea file"` put back in `ideas/schema.json` (`git diff --stat -- ideas/schema.json`: 1 file changed, 1 insertion, 1 deletion) -> `ℹ pass 14 / fail 1`, `AssertionError: schema wording is stale: Idea Radar idea file`; restored, re-run `pass 15 / fail 0` |
| verify | ☑ pass | Run by the Supervisor on 2026-11-11 on `f266000` (the user asked the Supervisor to do the cleanup end to end; not a `/verify` the user typed); cold start, no verifier skill. Real build, `node apps/mcp/dist/index.js` on port 18090 against PGlite on 55435 (55432 belongs to another session and was left alone): `/health` `{"ok":true}`; log line `listening on port 18090` matches the doc wording. The schema still behaves the same through the real server: a valid 13-idea submission `{"saved":13,"date":"2026-11-11"}`, again on resend, `list_ideas` count 13; a 2,001-character summary rejected naming `/ideas/0/summary` (count stays 13); kind `github` gave 12 lines with the allowed values named and `... and 3 more errors`; a `javascript:` signal url rejected; the read token got `Tool submit_ideas not found`; the dashboard list returned 200 with the ideas. PORT probe for the new doc text: with PORT unset the server printed `listening on port 8080` and `/health` answered `{"ok":true}`. Both processes stopped by PID; ports free. Not run: a Railway deploy (the doc's Generate Domain step is the user's to follow). |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | Reviewed: the two schema strings (no code or test prints or compares them: grep for the old title/description finds only `ideas/schema.json`, `BRAINSTORMING_LOG.md` and the guide), `docs/deploy.md`, the new tests, and the tests that read `docs/deploy.md` or `ideas/schema.json` (only `scripts/repo-hygiene.test.ts`). Skipped: `dist/` (build output), `apps/mcp/src/**` comments (out of scope) |
| Full smoke suite still green (no regression) | ☑ pass | the full `pnpm test` above: 158 tests, 0 failed, 0 skipped |
| **Companion score (easy-verifier)** | ☐ pass / ☐ fail / ☐ N/A | [`overall` and `change_risk` as the tool returned them, the scope, the ref, and the absolute path of the verifier report after a literal `report:` label — e.g. "overall 86 (>= 80), change_risk pass, scope changes, ref `main...HEAD`, report: `/home/me/.easy-verifier-reports/kit/score_changes_20261028T0530Z.html`". The gate reads the path that follows `report:` and nothing else, so with no label, or a path that is absent, the row is unscored — write ☑ N/A instead. ☑ N/A with a reason when neither companion tool was run: the merge gate blocks on ☑ fail only, never on an absent or N/A row] |
| **UI: Visual regression (diff or verdict pasted)** | ☐ pass / ☐ fail / ☐ N/A | [screenshot path or LLM verdict — required for UI tasks, Hard-Stop Gate 6] |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☐ pass / ☐ fail / ☐ N/A | [method used + output] |
| **UI: Responsiveness at target viewports** | ☐ pass / ☐ fail / ☐ N/A | [viewports tested, any overflow findings] |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE** (2026-11-11, verbatim prior content; no executable code changes):

`docs/deploy.md:50` (step 5):

```
   characters, or two tokens are the same. Do not set `PORT` (Railway injects it and uses it for the health
```

`docs/deploy.md:277` (troubleshooting row):

```
| Health check fails and the deploy never goes live | server crashed at boot (see the deploy log) or the service listens on a fixed port | do not set `PORT`; read the log |
```

`ideas/schema.json:4-5`:

```
  "title": "Idea Radar idea file",
  "description": "One routine run's output: ideas/<YYYY-MM-DD>[-<suffix>].json",
```

Pre-flight: no code or test prints or compares the schema `title` or `description` (grep over the repo for `Idea Radar idea file` and `One routine run` finds only `ideas/schema.json`, `BRAINSTORMING_LOG.md` and the guide).

**AFTER** (verbatim new content):

`docs/deploy.md:50-52` (step 5):

```
   characters, or two tokens are the same. `PORT` is optional: Railway injects it, the server reads it and
   uses 8080 when it is unset, and you may set it yourself (for example `8080`). The server creates and
   updates its tables itself at boot; there is no migration command to run.
```

`docs/deploy.md` step 6:

```
6. Open **Settings** -> **Networking** -> **Generate Domain**. If it asks which port the app listens on,
   enter the number in the deploy log line `listening on port N` (8080 when you set `PORT=8080`). Your server
   is `https://<domain>/mcp`, and the dashboard is `https://<domain>/login`.
```

`docs/deploy.md` troubleshooting row:

```
| Health check fails and the deploy never goes live | server crashed at boot (see the deploy log) | read the deploy log for the error |
```

`ideas/schema.json:4-5`:

```
  "title": "Idea Radar submission",
  "description": "One routine run's output: the argument of the submit_ideas MCP tool",
```

**DELTA**: A reader of the deploy guide can set `PORT=8080` and enter 8080 in Railway's domain dialog without being told it is wrong, and the schema no longer describes a file in `ideas/`, with two tests that keep both wordings from coming back.

**WITNESS**: [who ran it and when — derived from `memory/event-trace/Txxx.jsonl`, never the
implementing agent alone]

---

## Stage 4 review (Supervisor, 2026-11-11, on `f266000`)

- **Code review**: no P0, P1 or P2. Two P3 notes: the PORT test reads the default with a regex over `index.ts` (fails loudly if the line is reformatted), and the `submit_ideas` tool description in `apps/mcp/src/tools.ts:16` still says "one idea file ... send the whole file again" (runtime-visible, out of T040 scope, follow-up). Report: `reports/code-review_t040-cleanup-wording_20261111T192044.html`.
- **Security review**: nothing at confidence 8 or higher. Report: `reports/security-review_t040-cleanup-wording_20261111T192044.html`.
- **Independent checks**: lane_check "C1, 3 files, 34 lines, FITS"; schema compared key by key with `main`: only `title` and `description` differ; real-server probes and the PORT-unset probe are in the `verify` row.
- **Not run**: easy-verifier (not connected); a Railway deploy.
