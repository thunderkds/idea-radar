# Deploy and set up Idea Radar

One document, from zero to: the MCP server live on Railway, the daily routine creating idea files on `main`,
and the server added to Claude Code and Claude Desktop. About 20 minutes.

You need: a GitHub account that owns this repo, a Railway account, a claude.ai plan with scheduled
tasks (Pro, Max, Ultra, Team or Enterprise), and `openssl` and the `claude` CLI on your machine.

The repo already carries the Railway settings in [`railway.json`](../railway.json). You do not set a build
or start command by hand.

## 1. Railway: deploy the MCP server

1. Generate the token the server will require (at least 32 characters). Keep it out of git and chat logs:

   ```bash
   openssl rand -hex 32
   ```

2. In Railway: **New Project** -> **Deploy from GitHub repo** -> pick this repo. Deploy from the **repo root**.
   Do not set a Root Directory (the server reads `ideas/` at the repo root, and the build needs the whole workspace).
3. Railway may stage one service per workspace package when it imports a pnpm monorepo. Keep one service,
   the one for `apps/mcp`, and delete any other (for example `packages/ideas`, which has nothing to run).
   Whatever it staged, `railway.json` wins for build, start, health check and watch paths.
4. In the service, open **Variables** and add:

   | Variable | Value |
   |---|---|
   | `MCP_TOKEN` | the token from step 1 (required; the server exits at boot without it) |
   | `RAILPACK_NODE_VERSION` | `22` (the project targets Node 22; the root `engines` only says `>=20`) |

   Do not set `PORT` (Railway injects it and uses it for the health check). Leave `IDEAS_DIR` unset.
   `MCP_TOKEN` lives only here and in your own client config, never in a commit.
5. Open **Settings** -> **Networking** -> **Generate Domain**. Your server is `https://<domain>/mcp`.
6. Check it once the deploy is green:

   ```bash
   curl -fsS https://<domain>/health
   # {"ok":true,"ideas":0,"files":0,"skipped":0}   (the counts grow as idea files land)
   ```

What `railway.json` does:

- Builds with Railpack: `pnpm install --frozen-lockfile && pnpm --filter @idea-radar/mcp... build`
  (the server and the `packages/ideas` it depends on, nothing else).
- Starts with `node apps/mcp/dist/index.js` from the repo root (no pnpm needed at runtime; the default `IDEAS_DIR` is the repo's `ideas/`).
- Gates each deploy on `GET /health` (no token needed) and restarts on a crash, at most 10 times.
- Redeploys only when a push to `main` changes one of the `watchPatterns`: `ideas/**`, `apps/mcp/**`,
  `packages/ideas/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `railway.json`.
  A routine commit to `ideas/` therefore redeploys, and the new ideas are queryable after the build (a few minutes).

Optional: in the service settings turn on **Wait for CI**, so Railway deploys a commit only after the GitHub
Actions workflow (`.github/workflows/ci.yml`, which runs `pnpm ideas:check`) passes. A commit that fails CI is then not deployed.

## 2. The daily routine

Anthropic's current docs call these "scheduled tasks (formerly routines)"; the page is still
`claude.ai/code/routines`, and some accounts still say "routine". Both names mean the same thing.

1. Open <https://claude.ai/code/routines> and create a new task (**New task**, or **New routine**).
2. Name it `idea-radar daily`. For the prompt, paste everything below the line in
   [`routines/daily-ideas.md`](../routines/daily-ideas.md).
3. Trigger: **Schedule**, **Daily**, a time that suits you.
4. Under **Repository** (Advanced settings), select this GitHub repo. If GitHub is not connected yet,
   connect it when asked; a missing or expired connection makes the task skip runs and, after 72 hours, turn off.
5. Let it push to `main`. By default a run pushes only to `claude/*` branches. Our prompt tells the routine to
   push to `main`, and earlier versions of the product had a repository setting called **Allow unrestricted
   branch pushes** that had to be on. The current docs no longer list that setting and say a run pushes to
   another branch when the prompt directs it, with GitHub branch protection as the control. So:
   - If you see **Allow unrestricted branch pushes** next to the repository, turn it on.
   - If you do not see it, do nothing here; step 7 tells you whether the push worked.
   - If `main` has branch protection or a ruleset that blocks direct pushes, the routine cannot push. Allow
     your GitHub identity to bypass it, or accept that this routine is not a fit for that rule.
6. Environment: the default **Trusted** network access allows package registries and an allowlist only. The
   routine opens source URLs, so if its report says it could not reach a site, edit the environment and
   set network access to **Full** (or add the domains under **Custom**).
7. Run it once to test: **Run now** on the task page. Then confirm all of these:
   - a commit `ideas: <date>` by you appears on `main` and touches only `ideas/<date>.json`;
   - the GitHub Actions run for that commit is green;
   - Railway shows a new deploy, and `curl https://<domain>/health` shows a higher `ideas` count.

### Known problem: 403 on `git push`

There is a report (August 2026) that scheduled runs can get an HTTP 403 on `git push` to `main` even when a
manual run works. The prompt handles it safely: on a rejected push the routine stops, reports the exact
error, and does not push to any other branch. If it happens: open the failed run in the task's History, read
the error, re-check step 5, and run it manually again. Nothing is lost; the idea file only exists in that
run's session.

### Spot a missed day

A missed day shows as no new `ideas/<date>.json` commit on `main`, and an unchanged `ideas` count in `/health`:

```bash
git log -1 --format='%cd %s' --date=short -- ideas/        # latest idea commit
curl -fsS https://<domain>/health                          # {"ok":true,"ideas":N,...}
```

Also open the task's **History** on claude.ai for the run's status and error. Nothing alerts you by itself;
checking weekly is enough for a daily feed.

## 3. Add the server to Claude

Use your `MCP_TOKEN` from step 1. Replace `<domain>` with the Railway domain.

### Claude Code

```bash
claude mcp add --transport http --scope user idea-radar https://<domain>/mcp \
  --header "Authorization: Bearer <token>"
claude mcp list        # idea-radar should show as connected
```

Without `--scope user` the server is local to the folder you ran the command in. The token lands in
`~/.claude.json`, so keep that file private. To share a config in a repo, use a project `.mcp.json` with
`"type": "http"` and `"headers": { "Authorization": "Bearer ${MCP_TOKEN}" }` so no secret is committed.

The tools are `list_ideas`, `search_ideas` and `get_idea`.

### Claude Desktop

Option A (simplest if your plan has it): **Settings** -> **Connectors** -> add a custom connector with the
URL `https://<domain>/mcp`, choose "No sign in", and put `Authorization: Bearer <token>` under
**Request headers**. The menu names change between releases; see Anthropic's guide
[Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

Option B (works with the local config file): bridge with `mcp-remote`. Edit `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`), then restart Desktop:

```json
{
  "mcpServers": {
    "idea-radar": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://<domain>/mcp",
        "--header",
        "Authorization:${IDEA_RADAR_AUTH}"
      ],
      "env": {
        "IDEA_RADAR_AUTH": "Bearer <token>"
      }
    }
  }
}
```

There is no space after `Authorization:` on purpose: Claude Desktop on Windows mangles spaces inside `args`,
and the space sits safely inside the `env` value.

## 4. Rotate the token

1. Generate a new one: `openssl rand -hex 32`.
2. Railway -> the service -> **Variables** -> change `MCP_TOKEN`. Railway redeploys; the old token stops
   working as soon as the new deploy is live.
3. Update every client: `claude mcp remove idea-radar`, run the `claude mcp add` command from step 3 again, and
   edit the Desktop config or connector.
4. Rotate whenever the token appears in a screenshot, chat or log, or when someone who knew it leaves.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Deploy fails, logs say `MCP_TOKEN` must be at least 32 characters | variable missing or short | set it again with `openssl rand -hex 32` |
| Health check fails and the deploy never goes live | server crashed at boot (see the deploy log) or the service listens on a fixed port | do not set `PORT`; read the log |
| `/health` shows `skipped` above 0 | an idea file failed validation or has an unknown `schema_version`; the loader logs which | fix or remove that file in a normal commit |
| New idea file on `main` but `/health` count is the same | the commit did not match `watchPatterns`, the deploy is still building, or CI blocked it (Wait for CI) | check the Railway deploy list; the file must sit in `ideas/` |
| `401 unauthorized` from `/mcp` | wrong or missing bearer token in the client | re-add the server with the current token |
| Routine run ends with a push error | see "Known problem: 403 on `git push`" | step 2.5, then run once more |
