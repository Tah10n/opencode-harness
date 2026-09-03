#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpusPath = path.join(root, "benchmarks/core-lite/corpus.json");
const checkerPath = path.join(root, "benchmarks/core-lite/check-task.mjs");
const runtimePath = path.join(root, "runtime/core-lite.mjs");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "core-lite-corpus-"));

function write(target, content, mode = 0o644) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, { mode });
}

function materialize(workspace, files) {
  fs.mkdirSync(workspace, { recursive: true });
  for (const file of files) {
    assert.equal(typeof file.path, "string");
    const target = path.resolve(workspace, file.path);
    assert(target.startsWith(`${workspace}${path.sep}`), `task file escaped workspace: ${file.path}`);
    write(target, file.content);
  }
}

function runCheck(task, workspace, suite) {
  return spawnSync(process.execPath, [checkerPath, "--corpus", corpusPath, "--task", task.id,
    "--workspace", workspace, "--suite", suite], { cwd: workspace, encoding: "utf8", timeout: 10_000 });
}

function assertPass(task, label, result) {
  assert.equal(result.error, undefined, `${task.id}/${label} did not start: ${result.error?.message}`);
  assert.equal(result.signal, null, `${task.id}/${label} terminated by ${result.signal}`);
  assert.equal(result.status, 0, `${task.id}/${label} failed: ${result.stderr}`);
}

function assertFail(task, label, result) {
  assert.equal(result.error, undefined, `${task.id}/${label} did not start: ${result.error?.message}`);
  assert.equal(result.signal, null, `${task.id}/${label} terminated by ${result.signal}`);
  assert.notEqual(result.status, 0, `${task.id}/${label} unexpectedly passed`);
}

function verifyRuntime(task, workspace, host) {
  const callLog = path.join(host, "calls.jsonl");
  const fakeOpenCode = path.join(host, "fake-opencode.mjs");
  const reference = task.reference_files.find((file) => file.path === task.entry_path);
  assert(reference, `${task.id} has no reference entry file`);
  write(fakeOpenCode, `#!/usr/bin/env node\nimport fs from "node:fs";\n`
    + `fs.appendFileSync(${JSON.stringify(callLog)}, JSON.stringify(process.argv.slice(2))+"\\n");\n`
    + `fs.mkdirSync(${JSON.stringify(path.dirname(task.entry_path))},{recursive:true});\n`
    + `fs.writeFileSync(${JSON.stringify(task.entry_path)},${JSON.stringify(reference.content)},"utf8");\n`
    + `console.log(JSON.stringify({type:"step_start",sessionID:"ses_core_lite_model_free"}));\n`
    + `console.log(JSON.stringify({type:"step_finish",sessionID:"ses_core_lite_model_free"}));\n`, 0o755);

  const descriptor = path.join(host, "check.json");
  write(descriptor, `${JSON.stringify({ schema_version: 1, check_id: task.id,
    executable_path: process.execPath,
    argv: [checkerPath, "--corpus", corpusPath, "--task", task.id, "--workspace", workspace, "--suite", "public"],
    cwd: workspace, timeout_ms: 10_000, immutable_input_paths: [checkerPath, corpusPath] }, null, 2)}\n`, 0o444);

  const result = spawnSync(process.execPath, [runtimePath, "--workspace", workspace, "--check", descriptor,
    "--opencode", fakeOpenCode, "--receipt-fd", "3", "--", task.visible_requirement],
  { cwd: workspace, encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "pipe", "pipe"] });
  assert.equal(result.error, undefined, `${task.id}/runtime did not start: ${result.error?.message}`);
  assert.equal(result.signal, null, `${task.id}/runtime terminated by ${result.signal}`);
  assert.equal(result.status, 0, `${task.id}/runtime failed: ${result.stderr}`);
  assert(result.output[3]?.trim(), `${task.id}/runtime emitted no receipt`);
  const receipt = JSON.parse(result.output[3]);
  assert.equal(receipt.profile, "core-lite");
  assert.equal(receipt.check_id, task.id);
  assert.equal(receipt.verification_passed, true);
  assert.equal(receipt.remediation_invoked, false);
  assert.equal(receipt.success, true);
  assert.equal(receipt.initial_process.events.session_id, "ses_core_lite_model_free");
  const calls = fs.readFileSync(callLog, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(calls.length, 1, `${task.id}/runtime made an unexpected continuation`);
  assert(!calls[0].includes("--model"), `${task.id}/runtime model-free gate selected a model`);
  assertPass(task, "runtime-hidden", runCheck(task, workspace, "hidden"));
}

try {
  const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
  assert.equal(corpus.schema_version, 1);
  assert.equal(corpus.corpus_id, "core-lite-ab-v1");
  assert.equal(corpus.tasks.length, 40);
  assert.equal(new Set(corpus.tasks.map((task) => task.id)).size, 40);
  const development = corpus.tasks.filter((task) => task.split === "development");
  const evaluation = corpus.tasks.filter((task) => task.split === "evaluation");
  assert.equal(development.length, 10);
  assert.equal(evaluation.length, 30);
  for (const stratum of ["small", "medium", "high"]) {
    assert.equal(evaluation.filter((task) => task.stratum === stratum).length, 10);
  }

  for (const task of corpus.tasks) {
    assert.equal(task.schema_version, 1);
    assert(["development", "evaluation"].includes(task.split));
    assert(["small", "medium", "high"].includes(task.stratum));
    assert.equal(typeof task.visible_requirement, "string");
    assert(task.visible_requirement.length > 0);
    assert(!task.visible_requirement.toLowerCase().includes("hidden"));
    assert(Array.isArray(task.allowed_mutation_paths));
    assert(task.allowed_mutation_paths.length >= 1 && task.allowed_mutation_paths.length <= 3);
    assert.equal(new Set(task.allowed_mutation_paths).size, task.allowed_mutation_paths.length);
    assert(task.allowed_mutation_paths.includes(task.entry_path));
    assert(task.public_cases.length > 0);
    assert(task.hidden_cases.length > 0);
    assert(task.files.some((file) => file.path === task.entry_path));
    assert(task.reference_files.some((file) => file.path === task.entry_path));
    assert(task.alternative_files.some((file) => file.path === task.entry_path));
    assert.notDeepEqual(task.reference_files, task.alternative_files,
      `${task.id} reference and alternative patches must be structurally distinct`);
    for (const [label, files] of [["broken", task.files], ["reference", task.reference_files],
      ["alternative", task.alternative_files]]) {
      assert(Array.isArray(files) && files.length >= 1 && files.length <= 3,
        `${task.id}/${label} must contain 1-3 files`);
      const paths = files.map((file) => file.path);
      assert.equal(new Set(paths).size, paths.length, `${task.id}/${label} contains duplicate paths`);
      assert.deepEqual([...paths].sort(), [...task.allowed_mutation_paths].sort(),
        `${task.id}/${label} does not match the allowed mutation scope`);
    }

    for (const [label, files, expected] of [
      ["broken", task.files, "fail"],
      ["reference", task.reference_files, "pass"],
      ["alternative", task.alternative_files, "pass"],
    ]) {
      const workspace = path.join(temporary, task.id, label);
      materialize(workspace, files);
      for (const suite of ["public", "hidden"]) {
        const result = runCheck(task, workspace, suite);
        if (expected === "pass") assertPass(task, `${label}-${suite}`, result);
        else assertFail(task, `${label}-${suite}`, result);
      }
    }

    const runtimeWorkspace = path.join(temporary, task.id, "runtime-workspace");
    const runtimeHost = path.join(temporary, task.id, "runtime-host");
    materialize(runtimeWorkspace, task.files);
    fs.mkdirSync(runtimeHost, { recursive: true });
    verifyRuntime(task, runtimeWorkspace, runtimeHost);
  }

  process.stdout.write(`${JSON.stringify({ status: "passed", corpus_id: corpus.corpus_id,
    task_count: corpus.tasks.length, development_count: development.length, evaluation_count: evaluation.length,
    evaluation_strata: { small: 10, medium: 10, high: 10 }, broken_gates: 80,
    reference_gates: 80, alternative_gates: 80, core_lite_runtime_gates: 40 })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
