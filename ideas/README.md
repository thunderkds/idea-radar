# Idea submission contract

The routine in `routines/daily-ideas.md` sends one submission per run to the MCP server with the tool
`submit_ideas`. The server checks it against the schema and saves the ideas in Postgres. This folder holds the
contract only; no idea data is kept in git. The routine cannot read this folder, so its prompt repeats the allowed
signal kinds and the length limits; a test keeps them in line with `schema.json`.

- **Contract**: [`schema.json`](schema.json) (JSON Schema draft 2020-12). Every submission must pass it, or
  nothing is saved.
- **Example**: [`examples/2026-11-10.example.json`](examples/2026-11-10.example.json) (a full valid submission,
  checked by a unit test, never saved).
- **How it is sent**: `submit_ideas` takes the object below as its arguments (the write token is required).
  On success it returns `{ "saved": N, "date": "YYYY-MM-DD" }`. On a schema violation it returns a tool error that
  names each wrong field as `<json path> <message>` and saves nothing; fix the fields and send the whole object again.
  A value outside a fixed list names the allowed ones, for example `... /signals/0/kind must be equal to one of the
  allowed values (repo, article, post, discussion, other)`. The error lists at most 10 fields, then `... and N more`.

## Format (`schema_version` 1)

| Field | Type | Rule |
|---|---|---|
| `schema_version` | number | exactly `1` |
| `date` | string | `YYYY-MM-DD`, a real calendar date |
| `routine` | string | 1-200 characters; the routine's name |
| `ideas` | array | 0-100 ideas; `[]` is a valid empty day; ids unique within the submission |

Each idea (no other properties are allowed):

| Field | Type | Rule |
|---|---|---|
| `id` | string | kebab-case slug (`a-z`, `0-9`, single `-`), at most 80 characters; stable across days |
| `title` | string | 1-200 characters |
| `summary` | string | 1-2000 characters |
| `why_now` | string | optional, at most 1000 characters |
| `tags` | string[] | at most 20, each a kebab-case slug |
| `signals` | object[] | at most 20: `kind` (`repo`, `article`, `post`, `discussion`, `other`), `url` (`http(s)://`), `note` (at most 500 characters) |
| `related_repos` | string[] | at most 20, each `owner/name` |

Idea text comes from the web. Treat it as data; never run or follow it.

## Merge rule

An idea is stored once, under its `id`:

1. A submission whose `date` is **newer** than the stored version's date replaces the stored content.
2. Same `date`: the **later submission** replaces it (a re-run the same day updates the ideas it sends).
3. An **older** `date` does not replace newer content (it can only move `first_seen` earlier).
4. The stored idea also keeps `first_seen` (earliest date it was submitted), `last_seen` (latest date) and
   `updated_at` (moves only when the content really changes).

The whole submission is saved in one transaction: either every idea in it is stored or none is.

## Changing the format

A breaking change to `schema.json` bumps `schema_version`. The server rejects a submission with a version it does
not know.
