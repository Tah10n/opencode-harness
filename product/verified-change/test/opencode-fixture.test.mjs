import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const enabled = process.env.VERIFIED_CHANGE_OPENCODE_TEST === "1";
const scenarios = [
  { name: "missed requirement repaired", draft: 1, repair: 2, repairs: 1, reason: "checks_passed", applied: true },
  { name: "correct draft unchanged", draft: 2, repairs: 0, reason: "checks_passed", applied: true },
  { name: "missed consumer repaired", draft: 2, repair: 2, consumer: true, repairs: 1, reason: "checks_passed", applied: true },
  { name: "unsupported assertion ignored", draft: 1, ambiguous: true, repairs: 0, reason: "checks_passed", applied: true },
  { name: "broken runtime does not trigger repair", draft: 1, broken: true, repairs: 0, reason: "verification_unavailable", applied: false },
  { name: "regressing repair rejected", draft: 1, repair: -1, repairs: 1, reason: "repair_regression", applied: false },
  { name: "concurrent user changes preserved", draft: 2, concurrent: true, repairs: 0, reason: "checks_passed", applied: false },
  { name: "session timeout terminates descendants", timeout: true, draft: 1, applied: false },
  { name: "cancellation terminates descendants", cancel: true, draft: 1, applied: false },
  { name: "wrapped requirement citation still triggers repair", wrapped: true, draft: 1, repair: 2, repairs: 1, reason: "checks_passed", applied: true },
  { name: "shared ambiguous assertions quarantined", shared: true, draft: 1, repairs: 0, reason: "checks_passed", applied: true },
  { name: "accepted tests visible only during repair", readAcceptance: true, draft: 1, repair: 2, repairs: 1, reason: "checks_passed", applied: true },
];
for (const scenario of scenarios) test(`installed OpenCode CLI: ${scenario.name}`, { skip: !enabled, timeout: 180_000 }, async () => {
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
  if (scenario.consumer) fs.writeFileSync(path.join(repo, "src/consumer.mjs"), "export const value = 0;\n");
  fs.writeFileSync(path.join(repo, "regression.test.mjs"), scenario.broken ? "import 'nonexistent-runtime-library';\n" : "import test from 'node:test';import assert from 'node:assert/strict';import {value} from './src/api.mjs';test('public contract',()=>{assert.equal(typeof value,'number');assert.ok(value>=0)});\n");
  fs.writeFileSync(path.join(repo, ".opencode-harness.json"), JSON.stringify({ version: 1, image: "node:24.19.0-bookworm-slim", sourcePaths: ["src"], protectedPaths: ["regression.test.mjs", ".opencode-harness.json"], checks: [{ id: "public", kind: "node-test", files: ["regression.test.mjs"] }], sessionTimeoutMs: scenario.timeout ? 5000 : 40_000 }));
  for (const args of [["init"], ["add", "."], ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"]]) {
    const r = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: repo, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  }
  const task = scenario.wrapped ? "The exported value\nmust equal 2. Preserve the public numeric API." : "The exported value must equal 2. Preserve the public numeric API.";
  const testBytes = `import test from 'node:test';import assert from 'node:assert/strict';import {value} from '/workspace/src/${scenario.consumer ? "consumer" : "api"}.mjs';test('new requirement',()=>assert.equal(value,${scenario.ambiguous ? 77 : 2}));\n${scenario.shared ? "test('unsupported assertion',()=>assert.equal(value,77));" : ""}`;
  const manifest = [{ id: "value", kind: "node-test", files: ["value.test.mjs"], confidence: scenario.ambiguous ? "ambiguous" : "unambiguous", basis: { source: "task", quote: scenario.ambiguous ? "The value must equal 77." : "The exported value must equal 2." } }];
  if (scenario.shared) manifest.push({ ...manifest[0], id: "uncertain", confidence: "ambiguous", basis: { source: "task", quote: "The value must equal 77." } });
  const commands = [
    `node -e ${shellQuote(`const fs=require('fs');fs.writeFileSync('/acceptance/value.test.mjs',${JSON.stringify(testBytes)});fs.writeFileSync('/acceptance/manifest.json',${JSON.stringify(JSON.stringify(manifest))});`)}`,
    `node -e ${shellQuote(`require('fs').writeFileSync('/workspace/src/api.mjs',${JSON.stringify(`export const value = ${scenario.draft};\n`)});process.stdout.write('oauth credential permission')`)}`,
    `node -e ${shellQuote(`require('fs').writeFileSync('/workspace/src/${scenario.consumer ? "consumer" : "api"}.mjs',${JSON.stringify(`export const value = ${scenario.repair};\n`)})`)}`,
  ];
  if (scenario.timeout || scenario.cancel) commands[1] = `node -e ${shellQuote("require('child_process').spawn('node',['-e','setInterval(()=>{},100)'],{detached:true,stdio:'ignore'});setInterval(()=>{},100)")}`;
  if (scenario.readAcceptance) {
    commands[1] = `node -e ${shellQuote("if(require('fs').existsSync('/acceptance'))throw Error('acceptance leaked into initial draft')")} && ${commands[1]}`;
    commands[2] = `node -e ${shellQuote("const fs=require('fs');fs.readFileSync('/acceptance/value.test.mjs');fs.readFileSync('/harness/node-reporter.mjs');try{fs.writeFileSync('/acceptance/value.test.mjs','weakened');throw Error('test was writable')}catch(e){if(e.message==='test was writable')throw e}")} && ${commands[2]}`;
  }
  let requests = 0;
  let cliProcess;
  const requestSummary = [];
  const server = http.createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    if (!req.url?.endsWith("/chat/completions")) { res.writeHead(404).end(); return; }
    const body = JSON.parse(raw);
    requestSummary.push({ tools: body.tools?.map((tool) => tool.function?.name), stream: body.stream, messages: body.messages?.map((m) => m.role) });
    const audit = JSON.stringify(body.messages?.filter((m) => m.role === "user").at(-1)).includes("Audit your acceptance assertions");
    if (!body.tools?.length || audit) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ id: "fixture-title", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: { role: "assistant", content: "Fixture task" }, finish_reason: "stop" }] })}\n\n`);
      res.end("data: [DONE]\n\n");
      return;
    }
    const index = Math.floor(requests / 2), toolTurn = requests % 2 === 0;
    requests += 1;
    if (scenario.cancel && index === 1 && toolTurn) setTimeout(() => cliProcess.kill("SIGINT"), 1500);
    if (scenario.concurrent && index === 1 && !toolTurn) fs.writeFileSync(path.join(repo, "src/api.mjs"), "export const value = 99; // user change\n");
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
    if (scenario.name === "correct draft unchanged" || scenario.broken) {
      const doctor = spawnSync(cli, ["doctor", "--workspace", repo], { encoding: "utf8" });
      assert.equal(doctor.status, scenario.broken ? 2 : 0, doctor.stderr);
      assert.equal(JSON.parse(doctor.stdout).status, scenario.broken ? "check_infrastructure_unavailable" : "execution_path_checked");
    }
    const result = await new Promise((resolve) => {
      const child = spawn(cli, ["run", "--workspace", repo, "--model", "verified-fixture/fixture", "--", task], { env: { ...process.env, OPENCODE_CONFIG: configFile }, stdio: ["ignore", "pipe", "pipe"] });
      cliProcess = child;
      let stdout = "", stderr = "";
      child.stdout.on("data", (c) => { stdout += c; }); child.stderr.on("data", (c) => { stderr += c; });
      child.on("error", (error) => resolve({ code: -1, stdout, stderr: error.message }));
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
    assert.equal(result.code, scenario.applied ? 0 : 2, `${result.stderr}\n${result.stdout}\n${JSON.stringify(requestSummary)}`);
    if (scenario.timeout || scenario.cancel) {
      if (scenario.timeout) assert.match(result.stderr, /OPENCODE_SESSION_TIMEOUT/);
      else assert.equal(JSON.parse(result.stdout).stopReason, "cancelled");
      const output = result.stderr.split("\n").find((line) => line.startsWith("Private run artifacts: ")).slice("Private run artifacts: ".length);
      const session = JSON.parse(fs.readFileSync(path.join(output, "primary-control/session.json"), "utf8"));
      const remaining = spawnSync("docker", ["ps", "-aq", "--filter", `label=verified-change.session=${session.sandbox.sessionLabel}`], { encoding: "utf8" });
      assert.equal(remaining.status, 0, remaining.stderr);
      assert.equal(remaining.stdout.trim(), "", "all session containers and detached descendants must be gone");
      assert.match(fs.readFileSync(path.join(repo, "src/api.mjs"), "utf8"), /value = 0/);
      return;
    }
    const report = JSON.parse(result.stdout);
    assert.equal(report.stopReason, scenario.reason);
    assert.equal(report.repairs, scenario.repairs);
    assert.equal(report.selected.name, scenario.repairs && scenario.applied ? "D1" : "D0");
    assert.equal(report.application.applied, scenario.applied);
    assert.equal(requests, 4 + 2 * scenario.repairs);
    if (scenario.ambiguous) assert.equal(report.unverified.length, 1);
    if (scenario.shared) assert.equal(report.unverified.length, 2);
    const expectedValue = scenario.concurrent ? 99 : scenario.applied ? scenario.consumer ? scenario.draft : scenario.repair ?? scenario.draft : 0;
    assert.match(fs.readFileSync(path.join(repo, "src/api.mjs"), "utf8"), new RegExp(`value = ${expectedValue}`));
    if (scenario.consumer) assert.match(fs.readFileSync(path.join(repo, "src/consumer.mjs"), "utf8"), /value = 2/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
function shellQuote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }
