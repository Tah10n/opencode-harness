import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const enabled = process.env.VERIFIED_CHANGE_DOCKER_TEST === "1";
test("installed bundle runs real contained checks and preserves assertion diagnostics", { skip: !enabled }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "verified-change-installed-"));
  const pack = spawnSync("npm", ["pack", "--ignore-scripts", "--json", "--cache", path.join(temp, "cache"), "--pack-destination", temp], { cwd: root, encoding: "utf8" });
  assert.equal(pack.status, 0, pack.stderr);
  const packed = JSON.parse(pack.stdout);
  const archive = (Array.isArray(packed) ? packed[0] : packed["@opencode-harness/verified-change"]).filename;
  const install = spawnSync("npm", ["install", "--prefix", path.join(temp, "installed"), "--cache", path.join(temp, "cache"), "--ignore-scripts", "--no-audit", "--no-fund", path.join(temp, archive)], { encoding: "utf8" });
  assert.equal(install.status, 0, install.stderr);
  const bundle = path.join(temp, "installed/node_modules/@opencode-harness/verified-change");
  const replay = spawnSync(process.execPath, ['--test', path.join(root, 'test/known-repairs.test.mjs')], {
    encoding: 'utf8', env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT')),
      VERIFIED_CHANGE_TEST_BUNDLE: bundle },
  });
  assert.equal(replay.status, 0, replay.stdout + replay.stderr);
  const { resolveImage, sandboxCommand } = await import(pathToFileURL(path.join(bundle, "lib/sandbox.mjs")));
  const { runCheck } = await import(pathToFileURL(path.join(bundle, "lib/checks.mjs")));
  const image = await resolveImage("node:24.19.0-bookworm-slim");
  const workspace = path.join(temp, "workspace");
  fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, "good.test.mjs"), "import test from 'node:test'; import assert from 'node:assert/strict'; test('literal oauth credential permission',()=>assert.equal(2,2));\n");
  fs.writeFileSync(path.join(workspace, "bad.test.mjs"), "import test from 'node:test'; import assert from 'node:assert/strict'; test('negative timeout',()=>assert.equal(2,3));\n");
  fs.writeFileSync(path.join(workspace, "broken.test.mjs"), "import 'nonexistent-runtime-library';\n");
  const sandbox = { image, workspace };
  const good = await runCheck({ id: "good", kind: "node-test", files: ["good.test.mjs"] }, sandbox);
  assert.equal(good.status, "passed", JSON.stringify(good));
  const bad = await runCheck({ id: "bad", kind: "node-test", files: ["bad.test.mjs"] }, sandbox);
  assert.equal(bad.status, "assertion_failed", JSON.stringify(bad));
  assert.match(bad.assertions[0].message, /2 !== 3/);
  const broken = await runCheck({ id: "broken", kind: "node-test", files: ["broken.test.mjs"] }, sandbox);
  assert.equal(broken.status, "infrastructure_error", JSON.stringify(broken));
  const denied = await sandboxCommand({ ...sandbox, argv: ["node", "-e", "require('fs').writeFileSync('/workspace/good.test.mjs','corrupt')"] });
  assert.notEqual(denied.exitCode, 0);
  assert.match(fs.readFileSync(path.join(workspace, "good.test.mjs"), "utf8"), /assert.equal/);
  const timeout = await sandboxCommand({ ...sandbox, timeoutMs: 1500, argv: ["node", "-e", "require('child_process').spawn('node',['-e','setInterval(()=>{},100)'],{detached:true,stdio:'ignore'});setInterval(()=>{},100)"] });
  assert.equal(timeout.timedOut, true);
  const control = new AbortController();
  const pending = sandboxCommand({ ...sandbox, signal: control.signal, argv: ["node", "-e", "setInterval(()=>{},100)"] });
  setTimeout(() => control.abort(), 1500);
  assert.equal((await pending).cancelled, true);
});
