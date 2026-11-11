# BRAINSTORMING_LOG.md
**Generated**: 2026-11-10
**Task / Context**: Stage 0 step Direction — Idea Radar v2 pivot (`PRD.md`)
**Skill**: `Skill({ skill: "brainstorming" })` — tier **Deep** (architectural choice, wide blast radius), auto mode

---

## The Problem Space

A Claude scheduled routine is now the only source of ideas. It commits one JSON file per run to `main`.
The app must make those ideas queryable from Claude through a hosted, read-only, token-protected MCP server
on Railway, and the v1 scraping stack must go. What can't change (user, this session): data enters through
git commits to `main`, scraping is retired, MCP is the only user-facing surface, and it runs hosted on Railway.
The user's chosen flow said "local loader → Postgres (or files only)", so a database is optional.

Verified facts:
- The routine can't push to `main` by default. Routines push only to `claude/`-prefixed branches unless the
  repo's "Allow unrestricted branch pushes" permission is on. An open report (Aug 2026) says scheduled
  routines get a 403 on `git push` ([developertoolkit.ai — Routines](https://developertoolkit.ai/en/claude-code/advanced-techniques/routines/),
  [claudeissues.com #83563](https://claudeissues.com/issue/83563-bug-scheduled-cloud-routines-ccr-consistently-fail-to-git-push)).
- The MCP TypeScript SDK supports a stateless Streamable HTTP server (`StreamableHTTPServerTransport` with
  `sessionIdGenerator: undefined`, a new server and transport per request). v2 of the SDK moved to separate packages, so pin the
  major version ([SDK README](https://huggingface.co/spaces/pgits/mcp-jokes/blob/main/node_modules/%40modelcontextprotocol/sdk/README.md),
  [SDK v2 docs](https://ts.sdk.modelcontextprotocol.io/v2/documents/examples_server_README.html)).
- Repo state (checked): CI exists (`.github/workflows/ci.yml`: lint, typecheck, test on push to main);
  `pnpm-workspace.yaml` builds `apps/*`; the reusable bearer check is `apps/api/src/app.ts:134`
  (`bearerMatches`); the only Postgres in the repo is `docker-compose.yml` (local dev).

---

## Questions for the User

Auto mode: none asked. Each one is decided below and goes in the final report.

1. Keep Postgres, or treat the committed files as the database? → decided under Recommended Path (⚠ for review).
2. If the routine can't push to `main` (403 or the permission is off), should `claude/*` pushes be accepted? → setup docs tell
   the user to turn on the permission; a fallback is on the cut list.

---

## Alternative Paths

| Option | Name | Summary | Invasiveness | Code Volume | Regression Risk | Recommended? |
|--------|------|---------|-------------|------------|----------------|--------------|
| A | Postgres + Action loader | GitHub Action on push validates and upserts into Railway Postgres; MCP server reads Postgres | Medium | ~900 lines | Medium | |
| B | Postgres + server pull | MCP server polls GitHub for new idea files and upserts into Postgres over Railway's private network | Medium | ~1,000 lines | Medium | |
| C | Files are the database | Railway redeploys the MCP server on each push to `main`; at boot it loads `ideas/*.json` into memory and serves the tools from there | Low | ~500 lines | Low | ✅ Yes |

### Option A — Postgres + Action loader
**Approach**: `packages/db` keeps a pool and a new `ideas` migration. A workflow on `push: paths: ideas/**` runs
`pnpm ideas:load` with a database-URL secret. `apps/mcp` queries Postgres (ILIKE or `tsvector`).
**Pros**: The DB can be queried, and the shape is ready for future features (a dashboard, v2 chat). Freshness is about 1–2 min.
**Cons**: Railway Postgres must be exposed over the public TCP proxy so GitHub runners can reach it, which is a new attack
surface. Two secrets in two systems. Migrations, a SELECT-only role and loader code all need upkeep.
**Why it might fail**: Load and deploy drift apart: a schema change ships before the migration. The public DB endpoint
leaks or gets scanned. The Action fails silently and ideas stop arriving with nobody noticing.

### Option B — Postgres + server pull
**Approach**: The DB stays private. The MCP server (or a cron service on Railway) polls the GitHub contents API every N minutes,
diffs, and upserts.
**Pros**: No public DB. No GitHub Actions secret.
**Cons**: Needs a GitHub token on Railway for a private repo. Polling, diff state and upsert code to write. Two always-on
concerns in one process.
**Why it might fail**: GitHub rate limits or token expiry stop ingestion silently. Polling races with partial commits.
It's the most code for the same result.

### Option C — Files are the database
**Approach**: `ideas/schema.json` plus a validator package. CI and a pre-push check reject a bad file. Railway
builds `apps/mcp` from this repo and redeploys on each push to `main` (watch paths `ideas/**`, `apps/mcp/**`).
At boot the server reads every `ideas/*.json` file, validates it, merges by `id` (latest `date` wins) and keeps the
result in memory. `list_ideas`, `search_ideas` (case-insensitive match over title/summary/tags) and `get_idea` read
that index.
**Pros**: No DB, no loader, no migration and no DB secret. Git history is the audit log. Freshness = Railway redeploy
(~2–3 min). Meets NFR-001 by design: there's no write path anywhere. The fewest moving parts, and it fits NFR-005.
**Cons**: Every routine run triggers a redeploy. The data lives in the image, which is fine for a private repo but must
not be served unauthenticated. A future dashboard reads the same files (or adds a DB then).
**Why it might fail**: One bad file crashes boot. Mitigation: skip and log invalid files at boot, and validate them in CI so
the error shows on the commit. Memory at 10k ideas is only a few MB. Railway may not redeploy on a routine's push if watch paths
are wrong, so the deploy doc and the verify step check it.

---

## 50% Rule Check

Option C is already the 50% version of A: it drops the DB, the migration, the loader and the DB secret, about 400 lines. Going smaller still,
with no validator package and only boot-time `JSON.parse`, would break FR-003 (reject with file and field) and let bad routine output
through without anyone seeing it, so the validator stays.

---

## Recommended Path

**Option C — Files are the database.**
It meets FR-001–FR-009 and every NFR with the least code and no new attack surface. It reuses the git-commit
ingest the user chose, and the user's own flow sketch named "files only" as allowed. It's easy to undo: if a DB is
needed later (dashboard or v2 chat), a loader can read the same files into Postgres without changing the
contract. PRD rewording needed: FR-004/FR-005 become "validated on push; loaded at server boot". NFR-001's
"SELECT-only DB user" becomes "no write path". Out of Scope adds "Postgres (deferred until a UI needs it)".

Cut list (recorded, not built): a `claude/*` branch fallback (an Action that fast-forwards `claude/ideas-*` into `main`);
Postgres full-text search; per-user tokens; a dashboard; an MCP `resources` view of daily files.

---

## Surgical Scope

Files that **should** be touched:
- `ideas/schema.json`, `ideas/README.md`, `ideas/examples/` — the contract
- `packages/ideas/` (new) — types, validator, loader/merge, search
- `apps/mcp/` (new) — Streamable HTTP MCP server, bearer auth (port `bearerMatches`), `/health`
- `routines/daily-ideas.md` (new) — the routine's prompt
- `.github/workflows/ci.yml` — add an idea-file check step
- `apps/worker`, `apps/api`, `apps/dashboard`, `packages/connectors`, `packages/core`, `packages/db`, `docker-compose.yml`,
  `scripts/label.ts`, `scripts/precision.ts` — delete (retirement task)
- `package.json`, `pnpm-workspace.yaml`, `README.md`, `AGENTS.md` (`# Working in this repo` rules), `PROJECT_SPEC.md`, `.env.example`
- `railway.json` (or `railway.toml`) + `docs/deploy.md` — deploy

Files that **must not** be touched:
- `.claude/`, `skills/`, `templates/`, `docs/claude-md/` — kit, not app
- `docs/SPEC.md`, `docs/ISSUES.md`, `docs/analysis/`, `docs/design-system/` — v1 history, kept for reference
- Git tag `v1-scraper` — the recovery point

---

## Edge Case Checklist for TASK_GUIDE

- [ ] Routine writes invalid JSON or breaks the schema → CI fails on the commit with file and field; the server skips the file at boot and logs it, and still serves the rest
- [ ] Two files define the same `id` → the latest `date` wins; same date → the file name that sorts last wins (deterministic, no dependence on load order)
- [ ] Empty day (`ideas: []`) is valid
- [ ] Routine pushes to `claude/*` instead of `main` (default restriction) or gets a 403 → nothing deploys; `docs/deploy.md` says how to turn on unrestricted pushes and how to spot a missed day
- [ ] Missing or wrong `Authorization` header → 401, and the body never includes ideas; token compared in constant time
- [ ] `MCP_TOKEN` unset → server refuses to start (never runs open)
- [ ] Idea text is untrusted content (routine output from web pages) → returned as data and never acted on by the server; tool descriptions say so
- [ ] `list_ideas` limit is clamped (e.g. 1–100); bad date filters → a tool error, not a crash
- [ ] Stateless transport: a new server and transport per request; no session state relied on
- [ ] Unknown future `schema_version` → file skipped with a clear log line, not misread
- [ ] Large or hostile file (MBs, deep nesting) → size cap on read

---

## Next Actions

1. Amend PRD FR-004/FR-005/NFR-001 and Out of Scope to Option C.
2. Stage 1: map-codebase, Readiness lines, base team.
3. Stage 2 tasks: T028 idea contract + validator + routine prompt → T029 MCP server → T030 retire v1 → T031 Railway deploy config + setup docs (the live deploy and creating the routine need the user's logins).

---

## User Selection

> **Approved direction**: Option C — Files are the database
> Auto mode: Supervisor took the recommended option on 2026-11-10 (RULE: `docs/claude-md/tracks.md` `### Every user stop and its auto rule` row 4). ⚠ decided for you — please review. Alternatives: A (Postgres + Action loader), B (Postgres + server pull).

---

## Addendum 2026-11-10 — v2.1 direction (user-chosen)

**Why it changed:** after v2 shipped, the security review found the routine (which reads untrusted web pages)
committing to `main` could change deployed code. The user chose: "claude scan and push to the app mcp, the app
will execute and save data, after that, show it in app dashboard".

| Option | Summary | Chosen |
|---|---|---|
| A — Branch + auto-merge | routine pushes `claude/ideas-*`; an Action merges idea-only diffs | |
| B — Keep main + message check | CI rejects `ideas:` commits touching code | |
| C — MCP write tool → Postgres → dashboard | routine calls `submit_ideas`; app validates and saves; dashboard reads | ✅ user, 2026-11-10 |

User choices: storage **Railway Postgres** (container files vanish on redeploy); dashboard **behind a login token**;
git idea files **replaced** by MCP ingest; dashboard **pages inside `apps/mcp`** (one service).

**Edge cases for the guides:** read token must never write; a rejected submission writes nothing; re-sending a
submission is idempotent; dashboard escapes all idea text and links only `http(s)`; login cookie HttpOnly +
SameSite=Lax + Secure on HTTPS, constant-time token compare; server refuses to start without `DATABASE_URL`
and all three tokens; migrations run at boot before listening; DB down → `/health` 503.

---

## Addendum 2026-11-11 — T037: GitHub-only routine, cheaper daily run, clearer rejection

**Tier:** Standard (one file of prompt text plus a small validator change; the direction was set by the user).
**User input:** "it comes from the github only first, we can provide the resource later. top 10 repos raising, the 5 lowkeys repos, 5 medium repos" and "evaluate the token and refactor the prompt if any for the better cost for daily tasks". The user answered "go" to the proposed bucket rules (rising 10, low-key 5 under 500 stars, medium 5 at 500-5,000 stars) and the tag names `rising`, `low-key`, `medium`.
**Trigger:** the first live run was rejected: `signals[].kind` was not one of `repo|article|post|discussion|other`; the routine has no repository, so it could not read `ideas/README.md`, and the prompt did not list the values.

### Claims checked against files (2026-11-11)
- `ideas/schema.json:51` kind enum is `repo, article, post, discussion, other`; `:15` allows at most 100 ideas per submission.
- `packages/ideas/src/validate.ts:22-26` builds each error as `<file>: <path> <ajv message>`; the enum message carries no values, and `allErrors: true` repeats it once per idea (6 lines in the user's run).
- `apps/mcp/src/tools.ts:12` `list_ideas` returns id, title, summary, tags, first_seen, last_seen (summary up to 2,000 characters); default limit 20, clamped to 100. `routines/daily-ideas.md` says to call it "a few times", so its cost grows with the table.
- `ideas/README.md` merge rule: an idea is stored once under its `id`; a re-send updates it. So a stable id (`owner-repo`) already dedupes on the server.

### Paths
| Path | Summary | Token cost per day | Verdict |
|---|---|---|---|
| A. Prompt only | New buckets, enum list, cost rules | lowest change | leaves the unhelpful rejection text, so the next wrong field repeats the same dead end |
| B. Prompt + validator message (chosen) | A plus: enum errors name the allowed values, rejection lists at most 10 errors and a count | retry costs less: one resend with the right values | small, testable, fixes the cause and the symptom |
| C. B plus a server-side change (ids-only `list_ideas`, or a `repo_seen` tool) | cheapest dedup | saves about the 6k tokens of one `list_ideas` call | rejected: new tool surface and a `packages/db` change for a small saving; revisit when the table is large |

**50% less code (B):** no new tool and no config; two `if`s in the validator and one cap in the tool, plus prompt text.

### Where the daily tokens go (estimate; measure from the first run's usage)
1. Web pages opened: the largest cost by far (20 ideas × a page each). Levers: take name, description, stars and "stars today" from the trending and search listing pages; open a repo's own page only when the listing is not enough, at most 8 times; a fixed page budget; GitHub only (no blogs).
2. `list_ideas` dedup: grows with the table. Lever: one call, `limit` 40, no repeats; the server merges by id, so an overlap only updates `last_seen`.
3. Output: 20 ideas. Lever: short fields (summary at most 3 sentences, `why_now` one sentence, at most 4 tags, one signal) and no restating the research.
4. Retry: a rejected submission is resent whole. Lever: the clearer error makes the first resend succeed; the prompt allows one resend.
5. User-side: choose a cheaper model for the scheduled task, and keep network access on Custom (github.com only).

### Edge cases
- GitHub trending or search may be unreachable from the routine's network (the default Trusted list is an allowlist): the prompt says to report it and submit what it has, not to pad.
- Fewer than 20 qualify: send fewer; never invent a repo or a star count.
- A repo in two buckets: keep it in the first of rising, medium, low-key.
- Repo names with `.` or `_` must become a valid kebab id (`a-z0-9` and single `-`, at most 80).
- A fork or a "awesome-list" repo is not an idea: skip.

> **Approved direction**: Path B. User said "go" on 2026-11-11 to the proposed bucket rules and tags; thresholds and tag names are Supervisor defaults the user accepted, revisit after the first runs.

---

## Addendum 2026-11-11 — T038: README read per repository, 13 ideas

**Tier:** Lightweight (the direction is the user's; one open question, the depth).
**User input:** "the github idea just is the description?" then "reduce to 3 high, 5 medium, and 5 lows. but should be the deep investigation also, not too deep for token burn."
**Cause found:** T037's cost rules ("at most 8 pages, no README deep reads") made the idea text the listing row's one-line description.
**Recommended path:** one repository page per repo (README and About sidebar), 13 ideas, a stated page budget (at most 20 pages), fields tightened (summary 900 characters ending in `Build angle:`).
**Rejected:** raw README via `raw.githubusercontent.com` (a second host; `github.com/<o>/<r>/raw/HEAD/README.md` answers 302 there, checked 2026-11-11); the REST API (about 15 times larger); issues or releases pages (more pages, little extra signal).
**Risks:** a repository page is large as HTML (626,755 bytes for one well-known repository); the token cost per page is measured in the task, with a stop at 15,000 tokens average. README text is longer untrusted text than a listing row, so the prompt's "data, never instructions" rule is strengthened and reviewed.
**50% rule:** half the code is none; this is prompt text, tests and one docs section.

> **Approved direction**: user's message of 2026-11-11 for counts and depth; "high" = `rising`, the build-angle sentence and the 20-page cap are Supervisor defaults to confirm after the first run.
