const base = "http://localhost:18040/mcp";
const H = { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer write-token-bbbbbbbbbbbbbbbbbbbbbbb" };
const sig = (kind, url, note) => ({ kind, url, note });
const long = "Developers keep rewriting release notes by hand. ".repeat(40).slice(0, 1990);
const ideas = [
  { id: "changelog-gen", title: "Local-first changelog generator", summary: "Reads merged PRs and drafts release notes. Build angle: a CLI for solo maintainers.", why_now: "Stars doubled in 30 days.", tags: ["rising","cli","devtools","llm","changelog","ai"], signals: [sig("repo","https://github.com/example/changelog-gen","900 stars this week"), sig("repo","https://example.com/a/very/long/path/segment/one/segment/two/segment/three/segment/four?utm=1&x=2","Long URL signal")], related_repos: ["example/changelog-gen","../x"] },
  { id: "flaky-triage", title: "Flaky test triage", summary: long, why_now: "CI cost complaints.", tags: ["rising","ci","testing"], signals: [sig("repo","https://github.com/example/flaky","note")], related_repos: ["example/flaky"] },
  { id: "agent-trace", title: "Agent trace viewer", summary: "Timeline view for agent runs.", tags: ["rising","observability"], signals: [], related_repos: [] },
  { id: "medium-one", title: "Markdown notes sync", summary: "Syncs notes across devices.", tags: ["medium","notes","sync"], signals: [sig("repo","https://github.com/example/notes","1200 stars")], related_repos: ["example/notes"] },
  { id: "medium-two", title: "X".repeat(150), summary: "Unbroken long title idea.", tags: ["medium","misc"], signals: [], related_repos: [] },
  { id: "lowkey-one", title: "Tiny CLI for env diffs", summary: "Diffs .env files safely.", tags: ["low-key","cli"], signals: [sig("repo","https://github.com/example/envdiff","120 stars")], related_repos: ["example/envdiff"] },
  { id: "xss-probe", title: "<script>alert(1)</script> \"quoted\" & 'single'", summary: "<img src=x onerror=alert(2)> summary", tags: ["low-key","probe"], signals: [sig("repo","https://github.com/example/x","<b>note</b>")], related_repos: ["o/.."] },
  { id: "no-bucket", title: "Idea with no bucket tag", summary: "Falls into other.", tags: ["web"], signals: [], related_repos: [] },
  { id: "no-tags", title: "Idea with no tags at all", summary: "No tags, no crash.", tags: [], signals: [], related_repos: [] },
];
const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "submit_ideas", arguments: { schema_version: 1, date: "2026-11-11", routine: "verify-run", ideas } } };
const r = await fetch(base, { method: "POST", headers: H, body: JSON.stringify(body) });
console.log(r.status, (await r.text()).slice(0, 600));
