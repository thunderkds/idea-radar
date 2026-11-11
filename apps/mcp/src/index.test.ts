import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const appDir = fileURLToPath(new URL("..", import.meta.url));

const READ = "r".repeat(40);
const WRITE = "w".repeat(40);
const DASH = "d".repeat(40);
// The config checks fail before any connection is made, so this URL is never dialled in those tests.
const GOOD = {
  DATABASE_URL: "postgres://nobody:hunter2-secret@127.0.0.1:5/none",
  MCP_TOKEN: READ,
  MCP_WRITE_TOKEN: WRITE,
  DASHBOARD_TOKEN: DASH,
};

/** Run the real entry point under tsx; resolves when it exits, or after `stopAfter` matches stdout (then kills it). */
function run(
  env: Record<string, string>,
  stopAfter?: RegExp,
): Promise<{ code: number | null; out: string; err: string }> {
  const rest = { ...process.env };
  for (const key of ["DATABASE_URL", "MCP_TOKEN", "MCP_WRITE_TOKEN", "DASHBOARD_TOKEN", "PORT", "IDEAS_DIR"])
    delete rest[key];
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--conditions=source", "src/index.ts"], {
      cwd: appDir,
      env: { ...rest, ...env },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d;
      if (stopAfter?.test(out)) child.kill();
    });
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => resolveRun({ code, out, err }));
  });
}

const noSecrets = (text: string) => assert.doesNotMatch(text, /hunter2-secret|r{40}|w{40}|d{40}/);

test("exits 1 with a message naming each variable that is unset, without echoing any secret", async () => {
  for (const name of Object.keys(GOOD)) {
    const env = Object.fromEntries(Object.entries(GOOD).filter(([key]) => key !== name));
    const r = await run(env);
    assert.equal(r.code, 1, name);
    assert.match(r.err, new RegExp(`${name} is not set`));
    noSecrets(r.err + r.out);
  }
});

test("exits 1 when a token is shorter than 32 characters, without echoing it", async () => {
  for (const name of ["MCP_TOKEN", "MCP_WRITE_TOKEN", "DASHBOARD_TOKEN"]) {
    const r = await run({ ...GOOD, [name]: "short-secret-value" });
    assert.equal(r.code, 1, name);
    assert.match(r.err, /at least 32/);
    assert.doesNotMatch(r.err + r.out, /short-secret-value/);
    noSecrets(r.err + r.out);
  }
});

test("exits 1 when the read and write tokens are the same value (and for any two of the three)", async () => {
  for (const env of [{ MCP_WRITE_TOKEN: READ }, { DASHBOARD_TOKEN: READ }, { DASHBOARD_TOKEN: WRITE }]) {
    const r = await run({ ...GOOD, ...env });
    assert.equal(r.code, 1);
    assert.match(r.err, /must all be different/);
    noSecrets(r.err + r.out);
  }
});

test("exits 1 on an unusable PORT", async () => {
  const r = await run({ ...GOOD, PORT: "abc" });
  assert.equal(r.code, 1);
  assert.match(r.err, /PORT/);
});

test("exits 1 when the migrations cannot run (database unreachable), before listening and without echoing the URL", async () => {
  // A port that was just freed: the connection is refused at once.
  const probe = createNetServer();
  await new Promise<void>((resolveListen) => probe.listen(0, "127.0.0.1", () => resolveListen()));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolveClose) => probe.close(() => resolveClose()));
  const r = await run({ ...GOOD, DATABASE_URL: `postgres://nobody:hunter2-secret@127.0.0.1:${port}/none`, PORT: "0" });
  assert.equal(r.code, 1);
  assert.match(r.err, /database setup failed/);
  assert.doesNotMatch(r.out, /listening/);
  noSecrets(r.err + r.out);
});

const testDb = process.env.TEST_DATABASE_URL;
if (testDb) {
  const parsed = new URL(testDb);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    parsed.searchParams.has("host") ||
    parsed.searchParams.has("hostaddr")
  )
    throw new Error(
      `TEST_DATABASE_URL host "${parsed.hostname}" is not loopback (localhost, 127.0.0.1, [::1]); refusing to run`,
    );
}

test(
  "starts with a valid config: migrates, then listens, and never prints a token or the database URL",
  { skip: testDb ? false : "TEST_DATABASE_URL is not set" },
  async () => {
    const r = await run({ ...GOOD, DATABASE_URL: testDb!, PORT: "0" }, /listening/);
    assert.match(r.out, /migrations applied: \d+/);
    assert.match(r.out, /listening on port \d+/);
    assert.ok(r.out.indexOf("migrations applied") < r.out.indexOf("listening"));
    noSecrets(r.out + r.err);
    assert.doesNotMatch(r.out + r.err, new RegExp(testDb!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  },
);
