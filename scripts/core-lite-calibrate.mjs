#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpusPath = path.join(root, "benchmarks/core-lite/corpus.json");
const checkerPath = path.join(root, "benchmarks/core-lite/check-task.mjs");
const materializerPath = path.join(root, "scripts/materialize-core-lite.mjs");
const MODEL = "openai/gpt-5.6-luna";
const VARIANT = "low";
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const MAX_STDERR_BYTES = 8 * 1024;

function hash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return hash(Buffer.from(JSON.stringify(canonical(value)), "utf8"));
}

function writeJson(target, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
  fs.renameSync(temporary, target);
}

function readJson(target) {
  return JSON.parse(fs.readFileSync(target, "utf8"));
}

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

function appendBounded(current, chunk, maximum) {
  if (current.length >= maximum) return current;
  return Buffer.concat([current, chunk]).subarray(0, maximum);
}

function killTree(child) {
  try {
    if (process.platform === "win32") child.kill("SIGKILL");
    else process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function runProcess(file, args, { cwd, env, timeoutMs, receipt = false }) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const child = spawn(file, args, { cwd, env, shell: false, windowsHide: true,
      detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe", receipt ? "pipe" : "ignore"] });
    let stdout = Buffer.alloc(0); let stderr = Buffer.alloc(0); let receiptBytes = Buffer.alloc(0);
    let spawnError = null; let timedOut = false;
    child.stdout.on("data", (chunk) => { stdout = appendBounded(stdout, chunk, MAX_OUTPUT_BYTES); });
    child.stderr.on("data", (chunk) => { stderr = appendBounded(stderr, chunk, MAX_STDERR_BYTES); });
    if (receipt) child.stdio[3].on("data", (chunk) => { receiptBytes = appendBounded(receiptBytes, chunk, MAX_OUTPUT_BYTES); });
    child.once("error", (error) => { spawnError = error; });
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
    child.once("close", (status, signal) => {
      clearTimeout(timer);
      if (process.platform !== "win32") killTree(child);
      resolve({ status: Number.isInteger(status) ? status : null, signal: signal ?? null,
        error_code: spawnError?.code ?? null, timed_out: timedOut,
        duration_ms: Number(process.hrtime.bigint() - started) / 1e6,
        stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"), receipt: receiptBytes.toString("utf8") });
    });
  });
}

export function eventMetrics(stdout) {
  let json_event_count = 0; let turns = 0; let finishes = 0; const tools = new Set(); const sessions = new Set();
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") continue;
    let event; try { event = JSON.parse(line); } catch { continue; }
    json_event_count += 1;
    if (event.type === "step_start") turns += 1;
    if (event.type === "step_finish") finishes += 1;
    if (event.type === "tool_use" && typeof event.part?.id === "string") tools.add(event.part.id);
    for (const key of ["sessionID", "sessionId", "session_id"]) {
      if (typeof event[key] === "string") sessions.add(event[key]);
    }
  }
  return { json_event_count, turns, completed_turns: finishes, tool_calls: tools.size,
    session_count: sessions.size, protocol_valid: json_event_count > 0 && finishes > 0 && sessions.size === 1 };
}

function classifyProcess(result) {
  const text = `${result.stderr}\n${result.stdout}`.toLowerCase();
  if (result.timed_out) return "timeout";
  if (result.error_code !== null || result.signal !== null) return "host_failure";
  if (/unauthorized|forbidden|oauth|credential|token.{0,24}expired|status 401|status 403|model.{0,30}(?:not found|unavailable|access)/u.test(text)) {
    return "model_access_failure";
  }
  if (/rate.?limit|status 429|provider.{0,30}(?:error|unavailable)|service unavailable|status 5\d\d/u.test(text)) {
    return "provider_failure";
  }
  return result.status === 0 ? "completed" : "model_protocol_failure";
}

function runCheck(task, workspace, suite) {
  const result = spawnSync(process.execPath, [checkerPath, "--corpus", corpusPath, "--task", task.id,
    "--workspace", workspace, "--suite", suite], { cwd: workspace, encoding: "utf8", timeout: 10_000 });
  return { passed: result.status === 0 && result.signal === null && result.error === undefined,
    exit_code: result.status, signal: result.signal, timed_out: result.error?.code === "ETIMEDOUT",
    stderr_sha256: hash(Buffer.from(result.stderr ?? "", "utf8")) };
}

function materialize(workspace, files) {
  fs.mkdirSync(workspace, { recursive: true });
  for (const file of files) {
    const target = path.resolve(workspace, file.path);
    assert(target.startsWith(`${workspace}${path.sep}`));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, "utf8");
  }
}

function snapshot(workspace) {
  const files = new Map(); let links = false;
  function visit(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const target = path.join(directory, name); const listed = fs.lstatSync(target);
      if (listed.isSymbolicLink()) { links = true; continue; }
      if (listed.isDirectory()) visit(target);
      else if (listed.isFile()) files.set(path.relative(workspace, target), hash(fs.readFileSync(target)));
      else links = true;
    }
  }
  visit(workspace);
  return { files, links };
}

export function scopeResult(before, after, allowed) {
  const paths = new Set([...before.files.keys(), ...after.files.keys()]);
  const changed = [...paths].filter((entry) => before.files.get(entry) !== after.files.get(entry)).sort();
  return { valid: !after.links && changed.every((entry) => allowed.includes(entry)), changed_paths: changed,
    unexpected_file_type: after.links };
}

function isolatedEnvironment(attempt, configDirectory, authContent) {
  const environment = { ...process.env, HOME: path.join(attempt, "home"),
    XDG_CONFIG_HOME: path.dirname(configDirectory), XDG_DATA_HOME: path.join(attempt, "data"),
    XDG_CACHE_HOME: path.join(attempt, "cache"), XDG_STATE_HOME: path.join(attempt, "state"),
    OPENCODE_CONFIG_DIR: configDirectory, OPENCODE_AUTH_CONTENT: authContent,
    LANG: "C", LC_ALL: "C", TZ: "UTC" };
  for (const directory of [environment.HOME, environment.XDG_DATA_HOME, environment.XDG_CACHE_HOME, environment.XDG_STATE_HOME]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  return environment;
}

function plainConfig(coreConfig) {
  return { ...coreConfig, default_agent: "build" };
}

function parseCoreReceipt(result) {
  try { return JSON.parse(result.receipt.trim()); } catch { return null; }
}

export async function executeAttempt({ task, arm, campaignRoot, opencode, timeoutMs, authContent, bundle }) {
  const attempt = path.join(campaignRoot, "attempts", task.id, arm);
  const workspace = path.join(attempt, "workspace");
  const host = path.join(attempt, "host");
  fs.mkdirSync(host, { recursive: true });
  materialize(workspace, task.files);
  const before = snapshot(workspace);
  const coreConfig = readJson(path.join(bundle, "opencode.json"));
  let configDirectory;
  if (arm === "core-lite") configDirectory = bundle;
  else {
    configDirectory = path.join(attempt, "config", "opencode");
    fs.mkdirSync(configDirectory, { recursive: true });
    writeJson(path.join(configDirectory, "opencode.json"), plainConfig(coreConfig), 0o644);
  }
  const environment = isolatedEnvironment(attempt, configDirectory, authContent);
  const descriptor = path.join(host, "check.json");
  writeJson(descriptor, { schema_version: 1, check_id: task.id, executable_path: process.execPath,
    argv: [checkerPath, "--corpus", corpusPath, "--task", task.id, "--workspace", workspace, "--suite", "public"],
    cwd: workspace, timeout_ms: 10_000, immutable_input_paths: [checkerPath, corpusPath] }, 0o444);

  const message = task.visible_requirement;
  const command = arm === "core-lite" ? process.execPath : opencode;
  const args = arm === "core-lite"
    ? [path.join(bundle, "runtime/core-lite.mjs"), "--workspace", workspace, "--check", descriptor,
      "--opencode", opencode, "--model", MODEL, "--variant", VARIANT, "--agent", "core-lite",
      "--auto", "--attempt-timeout-ms", String(timeoutMs), "--receipt-fd", "3", "--", message]
    : ["run", "--pure", "--auto", "--format", "json", "--model", MODEL, "--variant", VARIANT,
      "--agent", "build", "--dir", workspace, message];
  const result = await runProcess(command, args, { cwd: workspace, env: environment,
    timeoutMs: arm === "core-lite" ? timeoutMs * 2 + 30_000 : timeoutMs, receipt: arm === "core-lite" });
  const coreReceipt = arm === "core-lite" ? parseCoreReceipt(result) : null;
  const after = snapshot(workspace);
  const scope = scopeResult(before, after, task.allowed_mutation_paths);
  const coreTimedOut = coreReceipt?.initial_process?.timed_out === true
    || coreReceipt?.remediation_process?.timed_out === true;
  const coreProcessesCompleted = coreReceipt !== null && coreReceipt.initial_process.status === 0
    && !coreReceipt.initial_process.timed_out && (coreReceipt.remediation_process === null
      || (coreReceipt.remediation_process.status === 0 && !coreReceipt.remediation_process.timed_out));
  const processCategory = arm === "core-lite" && coreProcessesCompleted ? "completed" : classifyProcess(result);
  const publicCheck = arm === "core-lite" && coreReceipt !== null
    ? coreReceipt.final_check : runCheck(task, workspace, "public");
  const hiddenCheck = runCheck(task, workspace, "hidden");
  const metrics = eventMetrics(result.stdout);
  const modelCompleted = arm === "core-lite" && coreReceipt !== null
    ? coreProcessesCompleted
    : result.status === 0 && !result.timed_out && result.signal === null && result.error_code === null;
  const infrastructureFailure = ["host_failure", "model_access_failure", "provider_failure"].includes(processCategory);
  const taskSuccess = !infrastructureFailure && hiddenCheck.passed && scope.valid && modelCompleted
    && !result.timed_out && !coreTimedOut && (arm !== "core-lite" || coreReceipt?.verification_passed === true);
  const body = { schema_version: 1, dataset: "development", task_id: task.id, stratum: task.stratum, arm,
    model: MODEL, variant: VARIANT, timeout_ms: timeoutMs, scored_outcome: !infrastructureFailure,
    task_success: taskSuccess, process_category: processCategory, model_process_completed: modelCompleted,
    process_exit_code: result.status, process_signal: result.signal,
    process_timed_out: result.timed_out || coreTimedOut,
    duration_ms: result.duration_ms, event_metrics: metrics, stdout_sha256: hash(Buffer.from(result.stdout, "utf8")),
    stderr_sha256: hash(Buffer.from(result.stderr, "utf8")), mutation_scope: scope,
    hidden_oracle_model_visible: false, hidden_check: hiddenCheck,
    first_public_check_pass: arm === "core-lite" ? coreReceipt?.first_check?.passed ?? false : publicCheck.passed,
    final_public_check_pass: publicCheck?.passed === true,
    verification_activated: arm === "core-lite" ? coreReceipt?.first_check !== undefined : null,
    remediation_invoked: arm === "core-lite" ? coreReceipt?.remediation_invoked ?? false : null,
    remediation_recovered: arm === "core-lite" ? coreReceipt?.remediation_recovered ?? false : null,
    core_receipt_fingerprint: coreReceipt?.receipt_fingerprint ?? null };
  return { ...body, receipt_fingerprint: fingerprint(body) };
}

export function calibrationSummary(receipts) {
  const arms = Object.fromEntries(["plain", "core-lite"].map((arm) => {
    const rows = receipts.filter((entry) => entry.arm === arm);
    return [arm, { attempts: rows.length, scored: rows.filter((entry) => entry.scored_outcome).length,
      successes: rows.filter((entry) => entry.task_success).length,
      timeouts: rows.filter((entry) => entry.process_timed_out).length,
      scope_violations: rows.filter((entry) => !entry.mutation_scope.valid).length,
      duration_ms: rows.reduce((sum, entry) => sum + entry.duration_ms, 0),
      turns: rows.reduce((sum, entry) => sum + entry.event_metrics.turns, 0),
      tool_calls: rows.reduce((sum, entry) => sum + entry.event_metrics.tool_calls, 0) }];
  }));
  const core = receipts.filter((entry) => entry.arm === "core-lite");
  const summary = { schema_version: 1, dataset: "development", task_count: 10, arms,
    verification_activation_count: core.filter((entry) => entry.verification_activated).length,
    remediation_invocation_count: core.filter((entry) => entry.remediation_invoked).length,
    remediation_recovery_count: core.filter((entry) => entry.remediation_recovered).length };
  summary.calibration_acceptable = receipts.length === 20 && arms.plain.scored === 10 && arms["core-lite"].scored === 10
    && arms.plain.successes >= 2 && arms.plain.successes <= 8
    && summary.verification_activation_count >= 9 && summary.remediation_recovery_count >= 1;
  return { ...summary, summary_fingerprint: fingerprint(summary) };
}

async function main() {
  const campaignRoot = path.resolve(option("--campaign-root") ?? "");
  const opencode = fs.realpathSync.native(path.resolve(option("--opencode", "/Users/tahion/.opencode/bin/opencode")));
  const authPath = path.resolve(option("--auth", path.join(os.homedir(), ".local/share/opencode/auth.json")));
  const timeoutMs = Number(option("--timeout-ms", "300000"));
  if (option("--campaign-root") === null) throw new Error("--campaign-root is required");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 60_000 || timeoutMs > 900_000) throw new Error("invalid timeout");
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (status.status !== 0 || status.stdout !== "") throw new Error("calibration requires a clean source worktree");
  const productSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  const corpus = readJson(corpusPath); const tasks = corpus.tasks.filter((task) => task.split === "development");
  assert.equal(tasks.length, 10);
  const authContent = fs.readFileSync(authPath, "utf8");
  JSON.parse(authContent);
  fs.mkdirSync(campaignRoot, { recursive: true });
  const bundle = path.join(campaignRoot, "bundle");
  if (!fs.existsSync(bundle)) {
    const materialized = spawnSync(process.execPath, [materializerPath, "--output", bundle], { cwd: root, encoding: "utf8" });
    if (materialized.status !== 0) throw new Error(`materialization failed: ${materialized.stderr}`);
  }
  const bundleManifest = readJson(path.join(bundle, ".opencode-profile-manifest.json"));
  const coreConfig = readJson(path.join(bundle, "opencode.json"));
  for (const denied of ["external_directory", "question", "task", "webfetch", "websearch", "oc_learning_*"]) {
    assert.equal(coreConfig.permission?.[denied], "deny", `core-lite must deny ${denied}`);
  }
  const preflightRoot = path.join(campaignRoot, "preflight");
  const preflightEnvironment = isolatedEnvironment(preflightRoot, bundle, authContent);
  const version = spawnSync(opencode, ["--version"], { cwd: preflightRoot,
    env: preflightEnvironment, encoding: "utf8" });
  if (version.status !== 0) throw new Error("OpenCode version probe failed");
  const catalog = spawnSync(opencode, ["models", "openai", "--verbose"], { cwd: preflightRoot,
    env: preflightEnvironment, encoding: "utf8", timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  if (catalog.status !== 0) throw new Error("OpenCode model catalog probe failed");
  const label = `${MODEL}\n`;
  const section = catalog.stdout.trim().split(/\n(?=openai\/)/u).find((entry) => entry.startsWith(label));
  if (section === undefined) throw new Error("exact OpenCode model binding is unavailable");
  const modelEntry = JSON.parse(section.slice(label.length).trim());
  assert.equal(modelEntry.id, "gpt-5.6-luna");
  assert.equal(modelEntry.providerID, "openai");
  assert.equal(modelEntry.status, "active");
  assert.equal(modelEntry.variants?.low?.reasoningEffort, "low");
  const metadataBody = { schema_version: 1, dataset: "development", product_sha: productSha,
    corpus_sha256: hash(fs.readFileSync(corpusPath)), bundle_fingerprint: bundleManifest.bundle_fingerprint,
    bundle_file_count: bundleManifest.file_count, bundle_total_bytes: bundleManifest.total_bytes_without_manifest
      + Buffer.byteLength(`${JSON.stringify(bundleManifest, null, 2)}\n`),
    model: MODEL, variant: VARIANT, timeout_ms: timeoutMs, opencode_path: opencode,
    opencode_version: version.stdout.trim(), opencode_sha256: hash(fs.readFileSync(opencode)),
    model_catalog_entry_sha256: hash(Buffer.from(JSON.stringify(canonical(modelEntry)), "utf8")),
    auth_sha256: hash(Buffer.from(authContent, "utf8")), schedule: tasks.flatMap((task, index) =>
      (index % 2 === 0 ? ["plain", "core-lite"] : ["core-lite", "plain"]).map((arm) => ({ task_id: task.id, arm }))) };
  const metadata = { ...metadataBody, metadata_fingerprint: fingerprint(metadataBody) };
  const metadataPath = path.join(campaignRoot, "calibration-metadata.json");
  if (fs.existsSync(metadataPath)) assert.deepEqual(readJson(metadataPath), metadata, "calibration metadata drifted");
  else writeJson(metadataPath, metadata);

  const receipts = [];
  for (const scheduled of metadata.schedule) {
    const task = tasks.find((entry) => entry.id === scheduled.task_id);
    const receiptPath = path.join(campaignRoot, "receipts", task.id, `${scheduled.arm}.json`);
    const startedPath = path.join(campaignRoot, "started", task.id, `${scheduled.arm}.json`);
    if (fs.existsSync(receiptPath)) { receipts.push(readJson(receiptPath)); continue; }
    if (fs.existsSync(startedPath)) throw new Error(`${task.id}/${scheduled.arm} is ambiguous after process start; refusing a retry`);
    writeJson(startedPath, { schema_version: 1, task_id: task.id, arm: scheduled.arm,
      metadata_fingerprint: metadata.metadata_fingerprint, started_at: new Date().toISOString() });
    process.stdout.write(`${JSON.stringify({ event: "attempt_started", task_id: task.id, arm: scheduled.arm })}\n`);
    const receipt = await executeAttempt({ task, arm: scheduled.arm, campaignRoot, opencode, timeoutMs,
      authContent, bundle });
    writeJson(receiptPath, receipt); receipts.push(receipt);
    process.stdout.write(`${JSON.stringify({ event: "attempt_completed", task_id: task.id, arm: scheduled.arm,
      scored_outcome: receipt.scored_outcome, task_success: receipt.task_success,
      remediation_invoked: receipt.remediation_invoked, remediation_recovered: receipt.remediation_recovered })}\n`);
    if (!receipt.scored_outcome) throw new Error(`${task.id}/${scheduled.arm} ended without a scored outcome; no retry was attempted`);
  }
  const summary = calibrationSummary(receipts);
  writeJson(path.join(campaignRoot, "calibration-summary.json"), summary);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
