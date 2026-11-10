# TASK_REVIEW — T029: [Short Title]

> Sibling of `tasks/TASK_GUIDE_T029.md`. Everything here is **filled by the reviewer at Stage
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

## Auto decisions

Mode: auto
1. Track extended, Risk High for T029 (auth is the only guard in front of the data) — RULE: docs/claude-md/tracks.md § Track rule
2. Port the v1 constant-time bearer check rather than write a new one — RULE: PROJECT_SPEC.md § Critical Constraints
3. Spawn on Claude Code with the session model — FACT: PROJECT_SPEC.md:104 "| Claude Code | `claude` | (session model) | (session model) | (session model) | (session model) |"
4. Fixed the unparseable-request-target crash (security scan's excluded DoS lead, raised to P1 correctness) — RULE: skills/code-review/SKILL.md § Phase 4 — Apply Safe Fixes
5. list/search keep compact summaries; descriptions now say so and point to get_idea — DEBATED: compact + descriptions only (Advocate 1: compact, add why_now + descriptions; Advocate 2: compact, add why_now + descriptions; Advocate 3: compact, descriptions only) — decided by rule 2 (smaller change; no cited line makes why_now in summaries necessary: tasks/TASK_GUIDE_T029.md:68 "`get_idea({ id })` returns the full idea with signals, related_repos, first_seen, last_seen, files") ⚠ decided for you — please review
Checks: tests `pnpm test` — exit 0 (mcp 36/36); reviews code-review — P0 0 P1 0 P2 0 P3 3, security-review — no findings (1 excluded DoS lead fixed as P1, 3abb92c); real run `node apps/mcp/dist/index.js` + curl — printed `no-token: 401`, search result, `{"ok":true,"ideas":1,"files":1,"skipped":0}`, `HTTP/1.1 400 Bad Request` (auto-checked, not /verify)
Memory: learnings.md — a sync throw before `run().catch` in a node http handler leaves the socket open (tests hang): parse inside the async wrapper; `pkill -f PATTERN` kills the calling shell when PATTERN is in its own command line
Not done: merge (admin: after the auto verify pass); auto verify: ☑ pass (session 61b8d274-6e05-4378-a6e4-9130d85256bd, commit b4ce424d03e748c27366198fe609bb8b97fffe5e, log .claude/verify-runs/T029-b4ce424d03e7.log)
Closed: row moved to Done 2026-11-10 — auto verify pass (session 61b8d274-6e05-4378-a6e4-9130d85256bd, commit b4ce424d03e748c27366198fe609bb8b97fffe5e); Gates 5 and 6 checked

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `apps/mcp/src/{auth,index-store,tools,server,index}.test.ts` — mcp: ℹ tests 36 ℹ pass 36 ℹ fail 0 (incl. 10k-idea timing, spawn tests for missing/short token) |
| Verification command run | ☑ pass | `pnpm install --frozen-lockfile && pnpm --filter @idea-radar/mcp test && pnpm lint && pnpm typecheck` — exit 0; prettier clean |
| Negative cases hold | ☑ pass | Mutation: `bearerMatches` forced to `true` → 3 auth tests fail (pass 32 fail 3), restored. Bad request target: new raw-socket test red on 76866c7 (`✖ a request target that is not a valid URL gets 400…`, fail 1), green after 3abb92c (36/36). Real run: no token → 401. |
| verify | ☑ pass | auto-run by hook, session 61b8d274-6e05-4378-a6e4-9130d85256bd, commit b4ce424d03e748c27366198fe609bb8b97fffe5e, log .claude/verify-runs/T029-b4ce424d03e7.log — pass |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | Reviewed `apps/mcp/**` and the `.env.example` v2 section, plus their use of `packages/ideas` (`loadIdeas`); v1 apps and kit not reviewed (untouched) |
| Full smoke suite still green (no regression) | ☑ pass | root `pnpm test` exit=0: core 65/65, ideas 25/25, dashboard 150 pass 0 fail, db 9/9, connectors 98 pass 0 fail, mcp 35/35 (36 after fix), worker 4/4, scripts 21/21; lint + typecheck ok |
| **Companion score (easy-verifier)** | ☑ N/A | easy-verifier MCP server failed to connect this session (CONNECT_TIMEOUT); not run |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI in this task |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI in this task |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI in this task |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE** (captured 2026-11-10T11:19:42Z, before any T029 implementation commit; `apps/mcp` does not exist):

```
2026-11-10T11:19:42Z
$ MCP_TOKEN=x IDEAS_DIR=ideas/examples pnpm --filter @idea-radar/mcp start
No projects matched the filters in "/home/thunderkds/workspace/pets/idea-radar/.claude/worktrees/T029"
exit=0
$ curl -sS -m 3 -X POST http://localhost:8080/mcp -H "content-type: application/json" -d {}
curl: (28) Connection timed out after 3002 milliseconds
exit=28
api
dashboard
worker
```

**AFTER** (2026-11-10T11:25:06Z, `pnpm build` then `pnpm --filter @idea-radar/mcp start` with `IDEAS_DIR=<repo>/ideas/examples`, `PORT=18080`, a random 64-hex `MCP_TOKEN`):

```
loaded 1 ideas from 1 files, 0 skipped (.../ideas/examples)
listening on port 18080
$ curl -i -X POST /mcp (no token)      -> HTTP/1.1 401 Unauthorized  {"error":"unauthorized"}
$ curl -X POST /mcp initialize         -> {"result":{"protocolVersion":"2025-03-26","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"idea-radar","version":"0.1.0"}},"jsonrpc":"2.0","id":1}
$ curl -X POST /mcp tools/call list_ideas -> {"result":{"content":[{"type":"text","text":"{\"count\":1,\"ideas\":[{\"id\":\"offline-first-markdown-notes-sync\",\"title\":\"Offline-first Markdown notes with git-free sync\", ... \"first_seen\":\"2026-11-10\",\"last_seen\":\"2026-11-10\"}]}"}]},"jsonrpc":"2.0","id":2}
$ curl /health                          -> {"ok":true,"ideas":1,"files":1,"skipped":0}
```

**DELTA**: A Claude client with the token can list, search and open ideas over `POST /mcp`; callers without it get 401 and no data.

**WITNESS**: Supervisor session, 2026-11-10T11:38:09Z at 6204cbf (trace `memory/event-trace/T029.jsonl`), separate from the implementing agent:

```
loaded 1 ideas from 1 files, 0 skipped (…/T029/ideas/examples)
listening on port 18181
no-token: 401
{"result":{"content":[{"type":"text","text":"{\"count\":1,\"ideas\":[{\"id\":\"offline-first-markdown-notes-sync\",…
{"ok":true,"ideas":1,"files":1,"skipped":0}
HTTP/1.1 400 Bad Request          (GET //[ — server keeps serving)
{"ok":true,"ideas":1,"files":1,"skipped":0}
```
