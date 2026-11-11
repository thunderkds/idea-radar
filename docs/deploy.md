# Deploy and set up Idea Radar

One document, from zero to: the MCP server and its Postgres database live on Railway, the daily routine
sending ideas to the server, the dashboard open in your browser, and the server added to Claude Code and
Claude Desktop. About 25 minutes.

You need: a GitHub account that owns this repo, a Railway account, a claude.ai plan with scheduled
tasks (Pro, Max, Ultra, Team or Enterprise), and `openssl` and the `claude` CLI on your machine.

The repo already carries the Railway settings in [`railway.json`](../railway.json). You do not set a build
or start command by hand.

How the parts fit: the routine calls the MCP tool `submit_ideas` (write token). The server saves the ideas in
Postgres. Claude Code and Claude Desktop read them with `list_ideas`, `search_ideas` and `get_idea` (read
token). You read them in a browser on the dashboard (dashboard token). The routine never touches the repo.

## 1. Railway: deploy the MCP server and Postgres

1. Generate three tokens, one for each job. Each must be at least 32 characters and all three must be different,
   or the server will not start. Run the command three times and keep the values out of git and chat logs:

   ```bash
   openssl rand -hex 32
   ```

   | Token | Who uses it | What it allows |
   |---|---|---|
   | `MCP_TOKEN` | Claude Code, Claude Desktop | the read tools `list_ideas`, `search_ideas`, `get_idea` |
   | `MCP_WRITE_TOKEN` | the daily routine only | the read tools and `submit_ideas` |
   | `DASHBOARD_TOKEN` | you, in the browser | the dashboard login only; it never opens `/mcp` |

2. In Railway: **New Project** -> **Deploy from GitHub repo** -> pick this repo. Deploy from the **repo root**.
   Do not set a Root Directory (the build needs the whole workspace).
3. Railway may stage one service per workspace package when it imports a pnpm monorepo. Keep one service,
   the one for `apps/mcp`, and delete any other (for example `packages/ideas`, which has nothing to run).
   Whatever it staged, `railway.json` wins for build, start, health check and watch paths.
4. Add the database in the same project: **New** -> **Database** -> **Add PostgreSQL**. Railway creates a
   service named `Postgres` with its own `DATABASE_URL`.
5. In the MCP service, open **Variables** and add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the reference `${{Postgres.DATABASE_URL}}` (use the name of your Postgres service if you renamed it); do not paste the real URL |
   | `MCP_TOKEN` | the first token from step 1 |
   | `MCP_WRITE_TOKEN` | the second token |
   | `DASHBOARD_TOKEN` | the third token |
   | `RAILPACK_NODE_VERSION` | `22` (the project targets Node 22; the root `engines` only says `>=20`) |

   The server exits at boot if one of the four required variables is missing, a token is shorter than 32
   characters, or two tokens are the same. Do not set `PORT` (Railway injects it and uses it for the health
   check). The server creates and updates its tables itself at boot; there is no migration command to run.
   The tokens and `DATABASE_URL` live only in Railway variables, in the routine's connector and in your own
   client config, never in a commit.
6. Open **Settings** -> **Networking** -> **Generate Domain**. Your server is `https://<domain>/mcp`, and the
   dashboard is `https://<domain>/login`.
7. Check it once the deploy is green:

   ```bash
   curl -fsS https://<domain>/health
   # {"ok":true}     (503 {"ok":false} means the database does not answer)
   ```

What `railway.json` does:

- Builds with Railpack: `pnpm install --frozen-lockfile && pnpm --filter @idea-radar/mcp... build`
  (the server and the `packages/ideas` and `packages/db` it depends on, nothing else).
- Starts with `node apps/mcp/dist/index.js` from the repo root (no pnpm needed at runtime).
- Gates each deploy on `GET /health` (no token needed; it answers `{"ok":true}` only after a `SELECT 1`) and
  restarts on a crash, at most 10 times.
- Redeploys only when a push to `main` changes one of the `watchPatterns`: `ideas/schema.json`, `apps/mcp/**`,
  `packages/ideas/**`, `packages/db/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
  `tsconfig.base.json`, `railway.json`. Ideas are data in Postgres, so a routine run never redeploys anything.

Optional: in the service settings turn on **Wait for CI**, so Railway deploys a commit only after the GitHub
Actions workflow (`.github/workflows/ci.yml`) passes. A commit that fails CI is then not deployed.

## 2. The dashboard

1. Open `https://<domain>/login` and enter `DASHBOARD_TOKEN`.
2. You land on the list of ideas, newest first, with filters and search. Open an idea to see its signals and
   related repositories. **Log out** ends the session.
3. The login lasts 7 days. Wrong tokens show "Wrong token". The page is empty until the first routine run.

## 3. The daily routine

Anthropic's current docs call these "scheduled tasks (formerly routines)"; the page is still
`claude.ai/code/routines`, and some accounts still say "routine". Both names mean the same thing.

A cloud routine cannot use an MCP server you added on your own machine. It can call a public remote server
that is registered as a claude.ai **custom connector**. So the write token goes into a connector, not into git.

1. Add the connector. On claude.ai open **Settings** -> **Connectors** -> add a custom connector:
   - Name: `Idea Radar`
   - URL: `https://<domain>/mcp`
   - Authentication: no sign-in (OAuth off)
   - Request header: `Authorization: Bearer <MCP_WRITE_TOKEN>`

   The menu names change between releases; see Anthropic's guide
   [Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
   If your plan has no request-header field, use the alternative at the end of this step.
2. Open <https://claude.ai/code/routines> and create a new task (**New task**, or **New routine**).
3. Name it `idea-radar daily`. For the prompt, paste everything below the line in
   [`routines/daily-ideas.md`](../routines/daily-ideas.md).
4. Turn on the `Idea Radar` connector for this task. You do not need to select a repository: the routine
   does not read or write one.
5. Trigger: **Schedule**, **Daily**, a time that suits you.
6. Environment: the default **Trusted** network access allows package registries and an allowlist only. The
   routine opens source URLs, so if its report says it could not reach a site, edit the environment and
   set network access to **Full** (or add the domains under **Custom**). The connector call to your
   Railway domain must be allowed too.
7. Run it once to test: **Run now** on the task page. Then confirm all of these:
   - the run report shows a `submit_ideas` call that returned `{"saved":N,"date":"<today>"}`;
   - the dashboard (`/`) lists the new ideas;
   - in Claude Code, `list_ideas` returns them (see step 4 of this document).

Alternative when the connector has no header field: the routine can read a repo `.mcp.json` entry whose header
takes the token from the routine's environment, so the token is never committed. Add this entry to the repo
the routine uses, and set `IDEA_RADAR_WRITE_TOKEN` as an environment variable of the routine:

```json
{
  "mcpServers": {
    "idea-radar": {
      "type": "http",
      "url": "https://<domain>/mcp",
      "headers": { "Authorization": "Bearer ${IDEA_RADAR_WRITE_TOKEN}" }
    }
  }
}
```

This needs the repository selected under **Repository** in the task. Confirm on the first run that the routine
sees `submit_ideas`; if it does not, use the connector.

### If a run fails

Open the failed run in the task's **History** and read the last tool result.

| Result | Meaning | What to do |
|---|---|---|
| `submission rejected, nothing was saved:` and a list of fields | the routine sent ideas that break `ideas/schema.json` | the prompt makes it fix the fields and send once more, then stop; if it still fails, read the field errors and fix the prompt or the schema |
| `submit_ideas needs the write token` or the tool is missing | the connector uses `MCP_TOKEN`, or is off for this task | put `MCP_WRITE_TOKEN` in the connector header and turn it on |
| `401 unauthorized` | wrong or old token in the connector | update the header (see "Rotate the tokens") |
| `the database could not answer; try again` | Postgres is down or unreachable | check the Postgres service in Railway and `/health`; run the task again |

Nothing is lost by a failed run except that day's research: nothing is saved unless the whole submission passes.

### Spot a missed day

A missed day shows as no new "last seen" date on the dashboard list, or as the newest idea in
`list_ideas` being older than yesterday:

```bash
curl -fsS https://<domain>/health        # {"ok":true} only; the dashboard shows the dates
```

Also open the task's **History** on claude.ai for the run's status and error. Nothing alerts you by itself;
checking weekly is enough for a daily feed.

## 4. Add the server to Claude

Use your `MCP_TOKEN` from step 1, not the write token. Replace `<domain>` with the Railway domain.

### Claude Code

```bash
claude mcp add --transport http --scope user idea-radar https://<domain>/mcp \
  --header "Authorization: Bearer <MCP_TOKEN>"
claude mcp list        # idea-radar should show as connected
```

Without `--scope user` the server is local to the folder you ran the command in. The token lands in
`~/.claude.json`, so keep that file private. To share a config in a repo, use a project `.mcp.json` with
`"type": "http"` and `"headers": { "Authorization": "Bearer ${MCP_TOKEN}" }` so no secret is committed.

The tools are `list_ideas`, `search_ideas` and `get_idea`. With `MCP_TOKEN` you do not see `submit_ideas`.

### Claude Desktop

Option A (simplest if your plan has it): **Settings** -> **Connectors** -> add a custom connector with the
URL `https://<domain>/mcp`, choose "No sign in", and put `Authorization: Bearer <MCP_TOKEN>` under
**Request headers**. This is a second connector, separate from the routine's `Idea Radar` one. The menu
names change between releases; see the Anthropic guide linked in step 3.

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
        "IDEA_RADAR_AUTH": "Bearer <MCP_TOKEN>"
      }
    }
  }
}
```

There is no space after `Authorization:` on purpose: Claude Desktop on Windows mangles spaces inside `args`,
and the space sits safely inside the `env` value.

## 5. Rotate the tokens

Rotate one token at a time. For each: generate a new one with `openssl rand -hex 32` (it must differ from the
other two), change the variable in Railway -> the service -> **Variables**, and wait for the redeploy. The old
value stops working as soon as the new deploy is live. Then update where it is used:

| Token | After the redeploy |
|---|---|
| `MCP_TOKEN` | in every client: `claude mcp remove idea-radar`, run the `claude mcp add` command from step 4 again, and edit the Desktop config or connector |
| `MCP_WRITE_TOKEN` | in the routine's `Idea Radar` connector header (or the `IDEA_RADAR_WRITE_TOKEN` environment variable); the next run fails with `401` until you do |
| `DASHBOARD_TOKEN` | log in again at `/login` with the new value; every open browser session ends at once |

Rotate whenever a token appears in a screenshot, chat or log, or when someone who knew it leaves. If
`DATABASE_URL` leaks, change the database password in the Postgres service in Railway and redeploy the MCP service.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Deploy fails, logs say a token "must be at least 32 characters" or "is not set" | variable missing or short | set it again with `openssl rand -hex 32` |
| Deploy fails, logs say the tokens "must all be different" | two of the three tokens are equal | generate a new one for each |
| Deploy fails with a database error | `DATABASE_URL` missing, or the Postgres service is not in the same project | add the reference `${{Postgres.DATABASE_URL}}` (step 1.5) |
| Health check fails and the deploy never goes live | server crashed at boot (see the deploy log) or the service listens on a fixed port | do not set `PORT`; read the log |
| `/health` returns `503` `{"ok":false}` | the database does not answer | check the Postgres service in Railway |
| `401 unauthorized` from `/mcp` | wrong or missing bearer token in the client | re-add the server with the current token |
| `/login` says "Wrong token" | you used `MCP_TOKEN` or `MCP_WRITE_TOKEN`, or an old value | use `DASHBOARD_TOKEN` |
| The routine's run has no `submit_ideas` tool | the connector uses `MCP_TOKEN`, or is not enabled for the task | step 3.1 and 3.4 |
