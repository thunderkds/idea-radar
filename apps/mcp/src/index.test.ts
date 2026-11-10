import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const examples = fileURLToPath(new URL("../../../ideas/examples", import.meta.url));

/** Run the real entry point under tsx; resolves when it exits, or after `stopAfter` matches stdout (then kills it). */
function run(
  env: Record<string, string>,
  stopAfter?: RegExp,
): Promise<{ code: number | null; out: string; err: string }> {
  const rest = { ...process.env };
  for (const key of ["MCP_TOKEN", "PORT", "IDEAS_DIR"]) delete rest[key];
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

test("exits 1 with a message when MCP_TOKEN is unset", async () => {
  const r = await run({ IDEAS_DIR: examples });
  assert.equal(r.code, 1);
  assert.match(r.err, /MCP_TOKEN is not set/);
});

test("exits 1 when MCP_TOKEN is shorter than 32 characters, without echoing it", async () => {
  const r = await run({ MCP_TOKEN: "short-secret-value", IDEAS_DIR: examples });
  assert.equal(r.code, 1);
  assert.match(r.err, /at least 32/);
  assert.doesNotMatch(r.err + r.out, /short-secret-value/);
});

test("exits 1 on an unusable PORT", async () => {
  const r = await run({ MCP_TOKEN: "x".repeat(32), IDEAS_DIR: examples, PORT: "abc" });
  assert.equal(r.code, 1);
  assert.match(r.err, /PORT/);
});

test("exits 1 when IDEAS_DIR is not a directory (a wrong path must not look like an empty repo)", async () => {
  const r = await run({ MCP_TOKEN: "x".repeat(32), IDEAS_DIR: fileURLToPath(import.meta.url), PORT: "0" });
  assert.equal(r.code, 1);
});

test("starts with a valid token, logs the boot counts and the listening port, and never prints the token", async () => {
  const token = "x".repeat(40);
  const r = await run({ MCP_TOKEN: token, IDEAS_DIR: examples, PORT: "0" }, /listening/);
  assert.match(r.out, /loaded 1 ideas from 1 files, 0 skipped/);
  assert.match(r.out, /listening on port \d+/);
  assert.doesNotMatch(r.out + r.err, new RegExp(token));
});
