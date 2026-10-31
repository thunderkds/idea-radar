import { createServer } from "node:http";
import type { Tier } from "@idea-radar/core";

/**
 * Read-only API for the dashboard (HUN-156). Routes are stubs that return
 * empty data until scoring lands.
 */
const TIERS: Tier[] = ["trending", "medium", "lowkey"];
const port = Number(process.env.API_PORT ?? 4000);

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === "/health") return send(200, { ok: true });

  const tierMatch = url.pathname.match(/^\/tiers\/(\w+)$/);
  if (tierMatch) {
    const tier = tierMatch[1] as Tier;
    if (!TIERS.includes(tier)) return send(404, { error: "unknown tier" });
    // TODO(HUN-156): query repo_scores joined with repos; filters: language, topic, collection, window.
    return send(200, { tier, items: [] });
  }

  if (url.pathname.startsWith("/repos/")) return send(200, { repo: null }); // TODO: repo detail
  if (url.pathname === "/topics/rising") return send(200, { items: [] }); // TODO
  if (url.pathname === "/consensus") return send(200, { items: [] }); // TODO
  if (url.pathname === "/ops/sources") return send(200, { items: [] }); // TODO

  return send(404, { error: "not found" });
});

server.listen(port, () => console.log(`api listening on :${port}`));
