# TASK_REVIEW — T035: Token-gated dashboard pages in apps/mcp

> Sibling of `tasks/TASK_GUIDE_T035.md`. Everything here is **filled by the reviewer at Stage
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
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☐ pass / ☐ fail | [test file path(s) — required before Done] |
| Verification command run | ☐ pass / ☐ fail | [paste actual output] |
| Negative cases hold | ☐ pass / ☐ fail | [paste the red run against the prior content, or the mutation diff (`git diff --stat`, non-empty) before each verdict] |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☐ pass / ☐ fail | [what was reviewed vs. skipped, and why] |
| Full smoke suite still green (no regression) | ☐ pass / ☐ fail | |
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

**BEFORE**: captured 2026-11-11T03:09:56Z at base `43e046d` (main `84d0d5b` + the board commit), no T035 implementation commit yet. Server from `apps/mcp` (`tsx --conditions=source src/index.ts`, port 18035) on a throwaway in-memory PGlite (`127.0.0.1:55432`), run by the Supervisor:

```
migrations applied: 1
listening on port 18035
$ curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18035/login -> 404
$ curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18035/ -> 404
$ curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18035/ideas/abc -> 404
$ curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18035/health -> 200
$ curl -s http://127.0.0.1:18035/health -> {"ok":true}
```

The service has no login page, idea list or idea page; only `/mcp` and `/health` exist.

**AFTER**: captured 2026-11-11T03:20:27Z by the implementing agent on branch `t035-dashboard-pages` (working tree after the T035 implementation commits). Same server start as BEFORE (`apps/mcp`, `tsx --conditions=source src/index.ts`, port 18036, throwaway in-memory PGlite `127.0.0.1:55432`, 3 demo ideas submitted through `submit_ideas`). `<hmac>` replaces the cookie signature:

```
$ curl http://127.0.0.1:18036/login -> 200
$ curl http://127.0.0.1:18036/ -> 303
$ curl http://127.0.0.1:18036/ideas/abc -> 303
$ curl http://127.0.0.1:18036/health -> 200
$ curl -X POST -d token=<wrong> /login -> 401
$ curl -X POST -H 'Origin: https://evil.example' -d token=<right> /login -> 403
HTTP/1.1 303 See Other
location: /
set-cookie: ir_session=1794972027.<hmac>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800
$ curl -b cookie / -> 200  titles: Averyvery...|Markdown notes that sync through git|&lt;script&gt;alert(1)&lt;/script&gt; probe &amp; &quot;quotes&quot;|
$ curl -b cookie '/?q=markdown' -> Markdown notes that sync through git
$ curl -b cookie /ideas/markdown-notes -> 200; signal links: 2
$ curl -b cookie POST /mcp -> 401
```

**DELTA**: A reader who holds the dashboard token can now log in at `/login`, browse the newest ideas at `/`, filter by tag and date, search, and open an idea with its signals as safe links at `/ideas/:id`, where before every one of these paths was a 404.

**WITNESS**: [who ran it and when — derived from `memory/event-trace/Txxx.jsonl`, never the
implementing agent alone]
