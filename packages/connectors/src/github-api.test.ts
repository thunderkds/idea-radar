import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GithubApiConnector, toNodeId, toRepo, type GithubRepoNode } from "./github-api.js";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/github-api/repo-node.json", import.meta.url), "utf8"),
) as GithubRepoNode;

const TOKEN = "ghp_secretTokenValue123";
const RESET_AT = "2026-10-31T06:00:00Z";
const NOW = Date.parse("2026-10-31T05:00:00Z");

const rl = (remaining = 4000, limit = 5000, resetAt = RESET_AT) => ({
  cost: 1,
  remaining,
  limit,
  resetAt,
});

const nodeFor = (id: number, name = `o/r${id}`): GithubRepoNode => ({
  ...fixture,
  databaseId: id,
  nameWithOwner: name,
});

function idFromNodeId(nodeId: string): number {
  return Number(Buffer.from(nodeId, "base64").toString().replace("010:Repository", ""));
}

interface Call {
  query: string;
  variables: Record<string, any>;
}

/** Stub fetch: `respond` builds the GraphQL JSON body for each call. */
function stub(respond: (call: Call, n: number) => unknown, status = 200) {
  const calls: Call[] = [];
  const fetchImpl = (async (_url: unknown, init: RequestInit) => {
    const call = JSON.parse(String(init.body)) as Call;
    calls.push(call);
    return new Response(JSON.stringify(respond(call, calls.length)), { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function make(fetchImpl: typeof fetch, sleeps: number[] = []) {
  return new GithubApiConnector(TOKEN, true, {
    fetchImpl,
    now: () => NOW,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
}

const byIdsResponse = (call: Call) => ({
  data: {
    nodes: (call.variables.ids as string[]).map((nid) => nodeFor(idFromNodeId(nid))),
    rateLimit: rl(),
  },
});

describe("GithubApiConnector.fetchByIds", () => {
  it("splits 250 ids into 100/100/50 nodes(ids:) calls", async () => {
    const { calls, fetchImpl } = stub(byIdsResponse);
    const ids = Array.from({ length: 250 }, (_, i) => i + 1);
    const out = await make(fetchImpl).fetchByIds(ids);
    assert.deepEqual(
      calls.map((c) => c.variables.ids.length).sort((a, b) => b - a),
      [100, 100, 50],
    );
    assert.ok(calls.every((c) => c.query.includes("nodes(ids: $ids)")));
    assert.ok(calls.every((c) => c.query.includes("rateLimit { cost remaining limit resetAt }")));
    assert.equal(out.repos.length, 250);
    assert.deepEqual(out.missing, []);
  });

  it("encodes numeric ids as GitHub legacy node ids", () => {
    assert.equal(toNodeId(123), Buffer.from("010:Repository123").toString("base64"));
    assert.equal(toNodeId(0), null);
    assert.equal(toNodeId(-5), null);
    assert.equal(toNodeId(1.5), null);
    assert.equal(toNodeId(Number.NaN), null);
  });

  it("reports null nodes and unencodable ids in missing", async () => {
    const { calls, fetchImpl } = stub((call) => ({
      data: {
        nodes: (call.variables.ids as string[]).map((nid) =>
          idFromNodeId(nid) === 2 ? null : nodeFor(idFromNodeId(nid)),
        ),
        rateLimit: rl(),
      },
      errors: [{ type: "NOT_FOUND", message: "Could not resolve to a node" }],
    }));
    const out = await make(fetchImpl).fetchByIds([1, 2, 3, -1]);
    assert.deepEqual(out.repos.map((r) => r.repoId), [1, 3]);
    assert.deepEqual(out.missing.sort(), [-1, 2]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.variables.ids.length, 3);
  });

  it("makes no request for an empty list", async () => {
    const { calls, fetchImpl } = stub(byIdsResponse);
    const out = await make(fetchImpl).fetchByIds([]);
    assert.equal(calls.length, 0);
    assert.deepEqual(out, { repos: [], missing: [] });
  });
});

describe("GithubApiConnector.resolveNames", () => {
  it("uses aliased repository fields, keeps the requested name as key, reports notFound", async () => {
    const { calls, fetchImpl } = stub((call) => {
      const data: Record<string, unknown> = { rateLimit: rl() };
      data.r0 = nodeFor(10, "new-owner/renamed"); // redirect from old name
      data.r1 = null;
      data.r2 = nodeFor(12, "a.b/c-d");
      return { data, errors: [{ type: "NOT_FOUND", path: ["r1"], message: "nope" }] };
    });
    const out = await make(fetchImpl).resolveNames(["Old/Name", "ghost/gone", "a.b/c-d", "not a name"]);
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.query, /r0: repository\(owner: \$o0, name: \$n0\)/);
    assert.equal(calls[0]!.variables.o0, "Old");
    assert.equal(calls[0]!.variables.n0, "Name");
    assert.equal(out.resolved.get("Old/Name")?.fullName, "new-owner/renamed");
    assert.equal(out.resolved.get("Old/Name")?.repoId, 10);
    assert.equal(out.resolved.get("a.b/c-d")?.repoId, 12);
    assert.deepEqual(out.notFound.sort(), ["ghost/gone", "not a name"]);
  });

  it("splits 150 names into 100 + 50", async () => {
    const { calls, fetchImpl } = stub((call) => {
      const data: Record<string, unknown> = { rateLimit: rl() };
      for (const key of Object.keys(call.variables).filter((k) => k.startsWith("o"))) {
        data[`r${key.slice(1)}`] = nodeFor(1);
      }
      return { data };
    });
    const names = Array.from({ length: 150 }, (_, i) => `o/r${i}`);
    const out = await make(fetchImpl).resolveNames(names);
    assert.deepEqual(
      calls.map((c) => Object.keys(c.variables).length / 2).sort((a, b) => b - a),
      [100, 50],
    );
    assert.equal(out.resolved.size, 150);
  });
});

describe("rate limit handling", () => {
  it("sleeps until resetAt once remaining < 10% of limit", async () => {
    const sleeps: number[] = [];
    const { calls, fetchImpl } = stub((call, n) => ({
      data: { nodes: [nodeFor(1)], rateLimit: n === 1 ? rl(400, 5000) : rl(4000, 5000) },
    }));
    const c = make(fetchImpl, sleeps);
    await c.fetchByIds([1]);
    assert.deepEqual(sleeps, []);
    await c.fetchByIds([1]);
    assert.deepEqual(sleeps, [Date.parse(RESET_AT) - NOW]);
    await c.fetchByIds([1]);
    assert.equal(sleeps.length, 1, "budget is trusted again after the pause");
    assert.equal(calls.length, 3);
  });

  it("does not sleep when remaining is exactly 10% or resetAt is in the past", async () => {
    const sleeps: number[] = [];
    let n = 0;
    const { fetchImpl } = stub(() => {
      n++;
      return {
        data: {
          nodes: [nodeFor(1)],
          rateLimit: n === 1 ? rl(500, 5000) : rl(10, 5000, "2026-10-31T04:00:00Z"),
        },
      };
    });
    const c = make(fetchImpl, sleeps);
    await c.fetchByIds([1]);
    await c.fetchByIds([1]);
    await c.fetchByIds([1]);
    assert.deepEqual(sleeps, []);
  });

  it("never exceeds rateLimit.concurrency in-flight requests", async () => {
    let active = 0;
    let peak = 0;
    const fetchImpl = (async (_u: unknown, init: RequestInit) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      const call = JSON.parse(String(init.body)) as Call;
      return new Response(JSON.stringify(byIdsResponse(call)));
    }) as typeof fetch;
    const c = make(fetchImpl);
    const ids = Array.from({ length: 3000 }, (_, i) => i + 1); // 30 batches
    const out = await c.fetchByIds(ids);
    assert.equal(out.repos.length, 3000);
    assert.equal(peak, c.rateLimit.concurrency);
  });
});

describe("errors never leak the token", () => {
  for (const status of [401, 403, 500, 502]) {
    it(`HTTP ${status}`, async () => {
      const { fetchImpl } = stub(() => ({ message: `bad credentials ${TOKEN}` }), status);
      await assert.rejects(make(fetchImpl).fetchByIds([1]), (err: Error) => {
        assert.ok(err.message.includes(String(status)));
        assert.ok(!String(err).includes(TOKEN));
        return true;
      });
    });
  }

  it("GraphQL errors[] are thrown with the token redacted", async () => {
    const { fetchImpl } = stub(() => ({
      data: null,
      errors: [{ type: "FORBIDDEN", message: `token ${TOKEN} lacks scope` }],
    }));
    await assert.rejects(make(fetchImpl).fetchByIds([1]), (err: Error) => {
      assert.match(err.message, /lacks scope/);
      assert.ok(!String(err).includes(TOKEN));
      return true;
    });
  });

  it("network errors are redacted", async () => {
    const fetchImpl = (async () => {
      throw new Error(`socket hang up (auth ${TOKEN})`);
    }) as typeof fetch;
    await assert.rejects(make(fetchImpl).fetchByIds([1]), (err: Error) => {
      assert.ok(!String(err).includes(TOKEN));
      return true;
    });
  });

  it("sends the token only in the Authorization header", async () => {
    let init: RequestInit | undefined;
    const fetchImpl = (async (_u: unknown, i: RequestInit) => {
      init = i;
      return new Response(JSON.stringify({ data: { nodes: [], rateLimit: rl() } }));
    }) as typeof fetch;
    await make(fetchImpl).fetchByIds([1]);
    assert.equal((init!.headers as Record<string, string>).authorization, `bearer ${TOKEN}`);
    assert.ok(!String(init!.body).includes(TOKEN));
  });
});

describe("normalize / toRepo / fetch", () => {
  it("toRepo maps the fixture to a Repo", () => {
    assert.deepEqual(toRepo(fixture), {
      repoId: 27193779,
      fullName: "nodejs/node",
      description: "Node.js JavaScript runtime",
      language: "JavaScript",
      topics: ["javascript", "nodejs"],
      license: "NOASSERTION",
      stars: 108000,
      forks: 29500,
      archived: false,
      createdAt: new Date("2014-11-26T19:57:11Z"),
      pushedAt: new Date("2026-10-30T12:00:00Z"),
    });
    assert.equal(new GithubApiConnector(TOKEN).toRepo(fixture).repoId, 27193779);
  });

  it("toRepo handles null language, license and pushedAt", () => {
    const repo = toRepo({ ...fixture, primaryLanguage: null, licenseInfo: null, pushedAt: null });
    assert.equal(repo.language, null);
    assert.equal(repo.license, null);
    assert.equal(repo.pushedAt, null);
  });

  it("normalize returns [] so metadata never becomes a signal", () => {
    assert.deepEqual(new GithubApiConnector(TOKEN).normalize(fixture), []);
  });

  it("fetch(since) yields nothing, with or without a token", async () => {
    for (const c of [new GithubApiConnector(TOKEN), new GithubApiConnector(undefined, false)]) {
      const items: GithubRepoNode[] = [];
      for await (const item of c.fetch(new Date(0))) items.push(item);
      assert.deepEqual(items, []);
    }
    assert.equal(new GithubApiConnector(undefined).enabled, false);
  });

  it("refuses to call GitHub without a token", async () => {
    const { calls, fetchImpl } = stub(byIdsResponse);
    const c = new GithubApiConnector(undefined, false, { fetchImpl });
    await assert.rejects(c.fetchByIds([1]), /no token/);
    assert.equal(calls.length, 0);
  });
});

const contentFixture = JSON.parse(
  readFileSync(new URL("./fixtures/github-api/content-nodes.json", import.meta.url), "utf8"),
) as Record<"full" | "lowercaseReadmeOnly" | "emptyRepo", Record<string, any>>;

/** A content node for `id`, copied from the fixture node `base`. */
const contentNode = (id: number, base: keyof typeof contentFixture = "full", patch: Record<string, unknown> = {}) => ({
  ...contentFixture[base],
  databaseId: id,
  ...patch,
});

const contentResponse = (call: Call) => ({
  data: {
    nodes: (call.variables.ids as string[]).map((nid) => contentNode(idFromNodeId(nid))),
    rateLimit: rl(),
  },
});

describe("GithubApiConnector.fetchContent", () => {
  it("splits 25 ids into 10/10/5 nodes(ids:) calls and asks for README, all 7 manifests and the tree", async () => {
    const { calls, fetchImpl } = stub(contentResponse);
    const ids = Array.from({ length: 25 }, (_, i) => i + 1);
    const out = await make(fetchImpl).fetchContent(ids);
    assert.deepEqual(
      calls.map((c) => c.variables.ids.length).sort((a, b) => b - a),
      [10, 10, 5],
    );
    const q = calls[0]!.query;
    assert.ok(q.includes("nodes(ids: $ids)"));
    assert.ok(q.includes("rateLimit { cost remaining limit resetAt }"));
    for (const f of ["package.json", "go.mod", "pyproject.toml", "requirements.txt", "Cargo.toml", "pom.xml", "build.gradle"]) {
      assert.ok(q.includes(`HEAD:${f}"`), `query asks for ${f}`);
    }
    assert.ok(q.includes('HEAD:README.md"') && q.includes('HEAD:"'));
    assert.equal(out.contents.length, 25);
    assert.deepEqual(out.missing, []);
  });

  it("maps a node: README, only the manifests present, top-level tree, stack tags", async () => {
    const { fetchImpl } = stub(contentResponse);
    const { contents } = await make(fetchImpl).fetchContent([101]);
    assert.deepEqual(contents[0], {
      repoId: 101,
      readmeMd: "# Hello\n\nA small tool.\n",
      manifests: {
        "package.json": '{"dependencies":{"next":"14.0.0","react":"18.2.0"}}',
        "requirements.txt": "fastapi==0.110\n",
      },
      fileTreeSummary: {
        entries: [
          { name: "README.md", type: "blob" },
          { name: "package.json", type: "blob" },
          { name: "requirements.txt", type: "blob" },
          { name: "src", type: "tree" },
        ],
        total: 4,
      },
      stackTags: ["fastapi", "next", "node", "python", "react"],
    });
  });

  it("falls back to other README names; an empty repo has no README, manifests or tree entries", async () => {
    const { fetchImpl } = stub((call) => ({
      data: {
        nodes: [contentNode(102, "lowercaseReadmeOnly"), contentNode(103, "emptyRepo")].slice(0, call.variables.ids.length),
        rateLimit: rl(),
      },
    }));
    const { contents, missing } = await make(fetchImpl).fetchContent([102, 103]);
    assert.deepEqual(missing, []);
    assert.equal(contents[0]!.readmeMd, "lowercase readme");
    assert.deepEqual(contents[1], {
      repoId: 103,
      readmeMd: null,
      manifests: {},
      fileTreeSummary: { entries: [], total: 0 },
      stackTags: [],
    });
  });

  it("caps README at 100 KB and each manifest at 50 KB (in bytes), and strips NUL characters", async () => {
    const big = "é".repeat(80 * 1024); // 160 KB in UTF-8
    const { fetchImpl } = stub(() => ({
      data: {
        nodes: [contentNode(1, "full", { r0: { text: big }, m0: { text: "x".repeat(60 * 1024) }, m3: { text: "a\u0000b" } })],
        rateLimit: rl(),
      },
    }));
    const { contents } = await make(fetchImpl).fetchContent([1]);
    const c = contents[0]!;
    assert.ok(Buffer.byteLength(c.readmeMd!) <= 100 * 1024);
    assert.ok(Buffer.byteLength(c.readmeMd!) > 100 * 1024 - 4, "kept up to the cap");
    assert.ok(!c.readmeMd!.includes("\uFFFD"), "no half character at the cut");
    assert.equal(Buffer.byteLength(c.manifests["package.json"]!), 50 * 1024);
    assert.equal(c.manifests["requirements.txt"], "ab");
  });

  it("treats binary (text null) and blank files as absent; caps the tree entries but keeps the total", async () => {
    const entries = Array.from({ length: 300 }, (_, i) => ({ name: `f${i}`, type: "blob" }));
    const { fetchImpl } = stub(() => ({
      data: {
        nodes: [contentNode(1, "full", { r0: { text: null }, m0: { text: "  \n" }, tree: { entries } })],
        rateLimit: rl(),
      },
    }));
    const c = (await make(fetchImpl).fetchContent([1])).contents[0]!;
    assert.equal(c.readmeMd, null);
    assert.deepEqual(Object.keys(c.manifests), ["requirements.txt"]);
    assert.equal(c.fileTreeSummary.entries.length, 200);
    assert.equal(c.fileTreeSummary.total, 300);
  });

  it("reports null nodes and unencodable ids in missing", async () => {
    const { fetchImpl } = stub((call) => ({
      data: {
        nodes: (call.variables.ids as string[]).map((nid) => {
          const id = idFromNodeId(nid);
          return id === 2 ? null : contentNode(id);
        }),
        rateLimit: rl(),
      },
      errors: [{ type: "NOT_FOUND", message: "Could not resolve to a node" }],
    }));
    const out = await make(fetchImpl).fetchContent([1, 2, -5, 3]);
    assert.deepEqual(out.contents.map((c) => c.repoId).sort(), [1, 3]);
    assert.deepEqual(out.missing.sort((a, b) => a - b), [-5, 2]);
  });

  it("shares the rate-limit pause with fetchByIds and makes no request for an empty list", async () => {
    const sleeps: number[] = [];
    const { calls, fetchImpl } = stub((call) =>
      call.query.includes("databaseId\n  tree")
        ? { data: { nodes: [contentNode(1)], rateLimit: rl(100, 5000) } }
        : byIdsResponse(call),
    );
    const c = make(fetchImpl, sleeps);
    await c.fetchContent([1]); // leaves 100/5000 remaining
    await c.fetchByIds([1]); // must wait for the reset first
    assert.deepEqual(sleeps, [Date.parse(RESET_AT) - NOW]);
    const before = calls.length;
    assert.deepEqual(await c.fetchContent([]), { contents: [], missing: [] });
    assert.equal(calls.length, before);
  });

  it("redacts the token in errors and refuses to run without one", async () => {
    const { fetchImpl } = stub(() => ({ errors: [{ message: `bad ${TOKEN}` }] }));
    await assert.rejects(make(fetchImpl).fetchContent([1]), (err: Error) => {
      assert.ok(!err.message.includes(TOKEN));
      return true;
    });
    await assert.rejects(new GithubApiConnector(undefined, false).fetchContent([1]), /no token/);
  });
});

describe("integration (real GitHub)", { skip: !process.env.GITHUB_TOKEN }, () => {
  it("resolves nodejs/node and fetches it back by id", async () => {
    const c = new GithubApiConnector(process.env.GITHUB_TOKEN);
    const { resolved, notFound } = await c.resolveNames(["nodejs/node"]);
    assert.deepEqual(notFound, []);
    const repo = resolved.get("nodejs/node")!;
    assert.equal(repo.repoId, 27193779);
    const byId = await c.fetchByIds([repo.repoId]);
    assert.deepEqual(byId.missing, []);
    assert.equal(byId.repos[0]?.fullName, "nodejs/node");
  });
});
