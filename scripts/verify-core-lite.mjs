import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "core-lite-test-"));

function write(target, content, mode = 0o644) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, { mode });
}

function runScenario(name, { recover, firstPass = false }) {
  const scenario = path.join(temporary, name);
  const workspace = path.join(scenario, "workspace");
  const host = path.join(scenario, "host");
  fs.mkdirSync(workspace, { recursive: true }); fs.mkdirSync(host, { recursive: true });
  write(path.join(workspace, "answer.txt"), "original\n");
  const log = path.join(host, "calls.jsonl");
  const fake = path.join(host, "fake-opencode.mjs");
  write(fake, `#!/usr/bin/env node\nimport fs from "node:fs";\nconst a=process.argv.slice(2);const session=a.includes("--session");\nfs.appendFileSync(${JSON.stringify(log)},JSON.stringify({session,args:a})+"\\n");\nconst message=a.at(-1);\nif(session&&!message.includes("Check ID: fixture-check"))process.exit(8);\nif(session&&!message.includes("expected ready"))process.exit(9);\nfs.writeFileSync("answer.txt",session&&${JSON.stringify(recover)}?"ready\\n":${JSON.stringify(firstPass)}?"ready\\n":"wrong\\n");\nconsole.log(JSON.stringify({type:"step_start",sessionID:"ses_core_lite_fixture"}));\nconsole.log(JSON.stringify({type:"text",sessionID:"ses_core_lite_fixture",part:{text:"done"}}));\nconsole.log(JSON.stringify({type:"step_finish",sessionID:"ses_core_lite_fixture"}));\n`, 0o755);
  const checkScript = path.join(host, "check.sh");
  write(checkScript, `#!/bin/sh\nif [ "$(cat answer.txt)" = ready ]; then exit 0; fi\necho "expected ready" >&2\nexit 7\n`, 0o755);
  const descriptor = path.join(host, "check.json");
  write(descriptor, `${JSON.stringify({ schema_version: 1, check_id: "fixture-check", executable_path: "/bin/sh",
    argv: [checkScript], cwd: workspace, timeout_ms: 5_000, immutable_input_paths: [checkScript] }, null, 2)}\n`, 0o444);
  const result = spawnSync(process.execPath, [path.join(root, "runtime/core-lite.mjs"),
    "--workspace", workspace, "--check", descriptor, "--opencode", fake,
    "--model", "openai/gpt-5.6-luna", "--variant", "low", "--receipt-fd", "3", "--", "Make answer.txt ready."],
  { cwd: workspace, encoding: "utf8", stdio: ["ignore", "pipe", "pipe", "pipe"] });
  assert(result.output[3]?.trim(), `core-lite produced no receipt: status=${result.status} stderr=${result.stderr}`);
  const receipt = JSON.parse(result.output[3]);
  return { result, receipt, calls: fs.readFileSync(log, "utf8").trim().split("\n").map(JSON.parse) };
}

try {
  const recovered = runScenario("recovered", { recover: true });
  assert.equal(recovered.result.status, 0);
  assert.equal(recovered.receipt.remediation_invoked, true);
  assert.equal(recovered.receipt.remediation_recovered, true);
  assert.equal(recovered.receipt.verification_passed, true);
  assert.equal(recovered.calls.length, 2);
  assert.equal(recovered.calls[1].session, true);
  assert(recovered.calls[1].args.includes("ses_core_lite_fixture"));

  const passed = runScenario("passed", { recover: false, firstPass: true });
  assert.equal(passed.result.status, 0);
  assert.equal(passed.receipt.remediation_invoked, false);
  assert.equal(passed.calls.length, 1);

  const failed = runScenario("failed", { recover: false });
  assert.equal(failed.result.status, 20);
  assert.equal(failed.receipt.remediation_invoked, true);
  assert.equal(failed.receipt.remediation_recovered, false);
  assert.equal(failed.calls.length, 2, "core-lite must permit exactly one remediation continuation");

  const prompt = fs.readFileSync(path.join(root, "agents/core-lite.md"), "utf8");
  assert(Buffer.byteLength(prompt) <= 4_000, "core-lite prompt exceeds 4000 UTF-8 bytes");
  for (const forbidden of ["dossier", "receipt", "assurance", "architect", "reviewer", "learning guard", "risk classification"]) {
    assert(!prompt.toLowerCase().includes(forbidden), `core-lite prompt includes forbidden concept: ${forbidden}`);
  }

  const bundle = path.join(temporary, "bundle");
  const materialized = spawnSync(process.execPath, [path.join(root, "scripts/materialize-core-lite.mjs"), "--output", bundle],
    { cwd: root, encoding: "utf8" });
  assert.equal(materialized.status, 0, materialized.stderr);
  const inventory = JSON.parse(materialized.stdout);
  assert(inventory.file_count <= 20);
  assert(inventory.total_bytes <= 300 * 1024);
  assert.equal(inventory.main_runtime_entrypoint, "runtime/core-lite.mjs");
  assert.deepEqual(fs.readdirSync(bundle).sort(), [".opencode-profile-manifest.json", "agents", "opencode.json", "runtime"]);
  process.stdout.write(`${JSON.stringify({ status: "passed", scenarios: 3,
    prompt_bytes: Buffer.byteLength(prompt), bundle_file_count: inventory.file_count,
    bundle_total_bytes: inventory.total_bytes, bundle_fingerprint: inventory.bundle_fingerprint })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
