import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const enabled = process.env.VERIFIED_CHANGE_OPENCODE_TEST === "1";
test("installed CLI uses actual OpenCode to repair a missed requirement with a local provider", { skip: !enabled, timeout: 180_000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "verified-change-opencode-"));
  const root = fileURLToPath(new URL("..", import.meta.url));
  const pack = spawnSync("npm", ["pack", "--json", "--ignore-scripts", "--cache", path.join(temp, "cache"), "--pack-destination", temp], { cwd: root, encoding: "utf8" });
  assert.equal(pack.status, 0, pack.stderr);
  const packed = JSON.parse(pack.stdout);
  const archive = (Array.isArray(packed) ? packed[0] : packed["@opencode-harness/verified-change"]).filename;
  const install = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", path.join(temp, "installed"), path.join(temp, archive)], { encoding: "utf8" });
  assert.equal(install.status, 0, install.stderr);
  const repo = path.join(temp, "repo"); fs.mkdirSync(repo); fs.mkdirSync(path.join(repo, "src"));
  fs.writeFileSync(path.join(repo, "src/api.mjs"), "export const value = 0;\n");
  fs.writeFileSync(path.join(repo, "regression.test.mjs"), "import test from 'node:test';import assert from 'node:assert/strict';import {value} from './src/api.mjs';test('public type',()=>assert.equal(typeof value,'number'));\n");
  fs.writeFileSync(path.join(repo, ".opencode-harness.json"), JSON.stringify({ version: 1, image: "node:24.19.0-bookworm-slim", sourcePaths: ["src"], protectedPaths: ["regression.test.mjs", ".opencode-harness.json"], checks: [{ id: "public", kind: "node-test", files: ["regression.test.mjs"] }], sessionTimeoutMs: 40_000 }));
  for (const args of [["init"], ["add", "."], ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"]]) {
    const r = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: repo, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  }
  const task = "The exported value must equal 2. Preserve the public numeric API.";
  const testBytes = "import test from 'node:test';import assert from 'node:assert/strict';import {value} from '/workspace/src/api.mjs';test('new requirement',()=>assert.equal(value,2));\n";
  const manifest = [{ id: "value", kind: "node-test", files: ["value.test.mjs"], confidence: "unambiguous", basis: { source: "task", quote: "The exported value must equal 2." } }];
  const commands = [
    `node -e ${shellQuote(`const fs=require('fs');fs.writeFileSync('/acceptance/value.test.mjs',${JSON.stringify(testBytes)});fs.writeFileSync('/acceptance/manifest.json',${JSON.stringify(JSON.stringify(manifest))});`)}`,
    `node -e ${shellQuote("require('fs').writeFileSync('/workspace/src/api.mjs','export const value = 1;\\n')")}`,
    `node -e ${shellQuote("require('fs').writeFileSync('/workspace/src/api.mjs','export const value = 2;\\n')")}`,
  ];
  let requests = 0;
  const requestSummary = [];
  const server = http.createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    if (!req.url?.endsWith("/chat/completions")) { res.writeHead(404).end(); return; }
    const body = JSON.parse(raw);
    requestSummary.push({ tools: body.tools?.map((tool) => tool.function?.name), stream: body.stream, messages: body.messages?.map((m) => m.role) });
    if (!body.tools?.length) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ id: "fixture-title", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: { role: "assistant", content: "Fixture task" }, finish_reason: "stop" }] })}\n\n`);
      res.end("data: [DONE]\n\n");
      return;
    }
    const index = Math.floor(requests / 2), toolTurn = requests % 2 === 0;
    requests += 1;
    if (toolTurn && !body.tools?.some((tool) => tool.function?.name === "repository_shell")) {
      res.writeHead(500).end("isolated tools missing"); return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const base = { id: `fixture-${requests}`, object: "chat.completion.chunk", created: 1, model: "fixture" };
    const deltas = toolTurn ? [
      { role: "assistant", tool_calls: [{ index: 0, id: `call-${requests}`, type: "function", function: { name: "repository_shell", arguments: JSON.stringify({ command: commands[index] }) } }] },
    ] : [{ role: "assistant", content: "Completed. oauth credential permission." }];
    for (const delta of deltas) res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: toolTurn ? "tool_calls" : "stop" }] })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const configFile = path.join(temp, "opencode.json");
  fs.writeFileSync(configFile, JSON.stringify({ provider: { "verified-fixture": { npm: "@ai-sdk/openai-compatible", name: "Local fixture", options: { baseURL: `http://127.0.0.1:${server.address().port}/v1`, apiKey: "fixture-local-only" }, models: { fixture: { name: "fixture", limit: { context: 100000, output: 10000 } } } } } }));
  try {
    const cli = path.join(temp, "installed/node_modules/.bin/opencode-harness");
    const result = await new Promise((resolve) => {
      const child = spawn(cli, ["run", "--workspace", repo, "--model", "verified-fixture/fixture", "--", task], { env: { ...process.env, OPENCODE_CONFIG: configFile }, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      child.stdout.on("data", (c) => { stdout += c; }); child.stderr.on("data", (c) => { stderr += c; });
      child.on("error", (error) => resolve({ code: -1, stdout, stderr: error.message }));
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
    assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}\n${JSON.stringify(requestSummary)}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.stopReason, "checks_passed");
    assert.equal(report.repairs, 1);
    assert.equal(report.selected.name, "D1");
    assert.equal(report.application.applied, true);
    assert.equal(requests, 6);
    assert.match(fs.readFileSync(path.join(repo, "src/api.mjs"), "utf8"), /value = 2/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
function shellQuote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }
