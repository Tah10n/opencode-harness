#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { calibrationSummary, eventMetrics, executeAttempt, scopeResult } from "./core-lite-calibrate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "scripts/core-lite-calibrate.mjs"), "utf8");

for (const required of [
  "openai/gpt-5.6-luna", "variant", "low", "--pure", "--auto", "OPENCODE_AUTH_CONTENT",
  "hidden_oracle_model_visible: false", "refusing a retry", "scored_outcome", "remediation_recovered",
  "verification_activation_count", "plain.successes >= 2", "plain.successes <= 8",
]) assert(source.includes(required), `calibration runner lost required contract: ${required}`);

for (const forbidden of ["benchmarks/v3", "severity_oracle", "regression_free", "raw_model_output"]) {
  assert(!source.includes(forbidden), `calibration runner includes forbidden concept: ${forbidden}`);
}

const corpus = JSON.parse(fs.readFileSync(path.join(root, "benchmarks/core-lite/corpus.json"), "utf8"));
assert.equal(corpus.tasks.filter((task) => task.split === "development").length, 10);
assert.equal(source.match(/executeAttempt\(/gu)?.length, 2, "runner must have one attempt implementation and one call site");

const events = eventMetrics([
  JSON.stringify({ type: "step_start", sessionID: "ses_fixture" }),
  JSON.stringify({ type: "tool_use", sessionID: "ses_fixture", part: { id: "tool_1" } }),
  JSON.stringify({ type: "step_finish", sessionID: "ses_fixture" }),
].join("\n"));
assert.deepEqual(events, { json_event_count: 3, turns: 1, completed_turns: 1, tool_calls: 1,
  session_count: 1, protocol_valid: true });

const before = { files: new Map([["src/task.mjs", "old"]]), links: false };
assert.deepEqual(scopeResult(before, { files: new Map([["src/task.mjs", "new"]]), links: false }, ["src/task.mjs"]),
  { valid: true, changed_paths: ["src/task.mjs"], unexpected_file_type: false });
assert.equal(scopeResult(before, { files: new Map([["extra.mjs", "new"]]), links: false }, ["src/task.mjs"]).valid, false);

const receipts = [];
for (const arm of ["plain", "core-lite"]) for (let index = 0; index < 10; index += 1) receipts.push({ arm,
  scored_outcome: true, task_success: index < (arm === "plain" ? 5 : 8), process_timed_out: false,
  mutation_scope: { valid: true }, duration_ms: 100, event_metrics: { turns: 1, tool_calls: 1 },
  verification_activated: arm === "core-lite", remediation_invoked: arm === "core-lite" && index < 2,
  remediation_recovered: arm === "core-lite" && index === 0 });
const summary = calibrationSummary(receipts);
assert.equal(summary.calibration_acceptable, true);
assert.equal(summary.arms.plain.successes, 5);
assert.equal(summary.arms["core-lite"].successes, 8);
assert.equal(summary.verification_activation_count, 10);
assert.equal(summary.remediation_recovery_count, 1);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "core-lite-calibration-runner-"));
try {
  const bundle = path.join(temporary, "bundle");
  const materialized = spawnSync(process.execPath, [path.join(root, "scripts/materialize-core-lite.mjs"),
    "--output", bundle], { cwd: root, encoding: "utf8" });
  assert.equal(materialized.status, 0, materialized.stderr);
  const task = corpus.tasks.find((entry) => entry.split === "development");
  const reference = task.reference_files.find((file) => file.path === task.entry_path).content;

  function fake(name, recover) {
    const target = path.join(temporary, `${name}.mjs`);
    fs.writeFileSync(target, `#!/usr/bin/env node\nimport fs from "node:fs";\n`
      + `const session=process.argv.includes("--session");\n`
      + `fs.mkdirSync("src",{recursive:true});\n`
      + `fs.writeFileSync(${JSON.stringify(task.entry_path)},(!${JSON.stringify(recover)}||session)`
      + `?${JSON.stringify(reference)}:"export function clamp(){ return null; }\\n","utf8");\n`
      + `console.log(JSON.stringify({type:"step_start",sessionID:"ses_calibration_fixture"}));\n`
      + `console.log(JSON.stringify({type:"step_finish",sessionID:"ses_calibration_fixture"}));\n`, { mode: 0o755 });
    return target;
  }

  const plain = await executeAttempt({ task, arm: "plain", campaignRoot: path.join(temporary, "plain"),
    opencode: fake("fake-plain", false), timeoutMs: 60_000, authContent: "{}", bundle });
  assert.equal(plain.task_success, true);
  assert.equal(plain.final_public_check_pass, true);
  assert.equal(plain.hidden_check.passed, true);

  const core = await executeAttempt({ task, arm: "core-lite", campaignRoot: path.join(temporary, "core"),
    opencode: fake("fake-core", false), timeoutMs: 60_000, authContent: "{}", bundle });
  assert.equal(core.task_success, true, JSON.stringify(core));
  assert.equal(core.verification_activated, true);
  assert.equal(core.remediation_invoked, false);

  const recovered = await executeAttempt({ task, arm: "core-lite", campaignRoot: path.join(temporary, "recovered"),
    opencode: fake("fake-recovered", true), timeoutMs: 60_000, authContent: "{}", bundle });
  assert.equal(recovered.task_success, true);
  assert.equal(recovered.process_category, "completed");
  assert.equal(recovered.remediation_invoked, true);
  assert.equal(recovered.remediation_recovered, true);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
process.stdout.write(`${JSON.stringify({ status: "passed", gate: "core-lite-calibration-runner",
  development_tasks: 10, model_free_integration_scenarios: 3, model_calls_during_verification: 0 })}\n`);
