#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const MAX_DESCRIPTOR_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 8 * 1024;
const MAX_EVENT_BYTES = 32 * 1024 * 1024;
const SESSION_KEYS = new Set(["sessionID", "sessionId", "session_id"]);

export class CoreLiteError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "CoreLiteError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new CoreLiteError(code, message);
}

function hash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
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

function exactObject(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    fail("CORE_LITE_SCHEMA", `${label} must contain exactly ${keys.join(", ")}`);
  }
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function fileIdentity(target, label, { executable = false } = {}) {
  const resolved = path.resolve(target);
  let descriptor;
  try {
    const listed = fs.lstatSync(resolved);
    if (!listed.isFile() || listed.isSymbolicLink() || listed.nlink !== 1) {
      fail("CORE_LITE_UNTRUSTED_INPUT", `${label} must be a singly-linked ordinary file`);
    }
    const real = fs.realpathSync.native(resolved);
    descriptor = fs.openSync(real, "r");
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (executable && process.platform !== "win32" && (before.mode & 0o111n) === 0n) {
      fail("CORE_LITE_UNTRUSTED_INPUT", `${label} is not executable`);
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    for (const key of ["dev", "ino", "mode", "nlink", "size", "mtimeNs", "ctimeNs"]) {
      if (before[key] !== after[key]) fail("CORE_LITE_INPUT_DRIFT", `${label} changed while it was read`);
    }
    return Object.freeze({ path: real, size: Number(after.size), mode: Number(after.mode),
      device: after.dev.toString(), inode: after.ino.toString(), mtime_ns: after.mtimeNs.toString(),
      ctime_ns: after.ctimeNs.toString(), sha256: hash(bytes) });
  } catch (error) {
    if (error instanceof CoreLiteError) throw error;
    fail("CORE_LITE_INPUT_UNAVAILABLE", `${label} is unavailable`);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function assertIdentity(expected, label, options) {
  const current = fileIdentity(expected.path, label, options);
  if (JSON.stringify(current) !== JSON.stringify(expected)) fail("CORE_LITE_INPUT_DRIFT", `${label} changed after freeze`);
}

function absoluteStrings(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > 64
    || value.some((entry) => typeof entry !== "string" || entry.length === 0 || entry.length > 4096
      || entry.includes("\0") || !path.isAbsolute(entry))) {
    fail("CORE_LITE_SCHEMA", `${label} must be a bounded array of absolute paths`);
  }
  if (new Set(value).size !== value.length) fail("CORE_LITE_SCHEMA", `${label} contains duplicates`);
  return Object.freeze([...value]);
}

export function loadFrozenCheck(descriptorPath, workspace) {
  const root = fs.realpathSync.native(path.resolve(workspace));
  const descriptorIdentity = fileIdentity(path.resolve(descriptorPath), "check descriptor");
  if (descriptorIdentity.size > MAX_DESCRIPTOR_BYTES) fail("CORE_LITE_SCHEMA", "check descriptor is too large");
  if (inside(root, descriptorIdentity.path)) fail("CORE_LITE_OWNERSHIP", "check descriptor must be outside the model workspace");
  let value;
  try { value = JSON.parse(fs.readFileSync(descriptorIdentity.path, "utf8")); }
  catch { fail("CORE_LITE_SCHEMA", "check descriptor is not valid JSON"); }
  exactObject(value, ["schema_version", "check_id", "executable_path", "argv", "cwd", "timeout_ms", "immutable_input_paths"], "check descriptor");
  if (value.schema_version !== 1 || typeof value.check_id !== "string"
    || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value.check_id)) fail("CORE_LITE_SCHEMA", "check identity is invalid");
  if (typeof value.executable_path !== "string" || !path.isAbsolute(value.executable_path)) {
    fail("CORE_LITE_SCHEMA", "check executable must be absolute");
  }
  if (!Array.isArray(value.argv) || value.argv.length > 64
    || value.argv.some((entry) => typeof entry !== "string" || entry.length > 4096 || entry.includes("\0"))) {
    fail("CORE_LITE_SCHEMA", "check argv is invalid");
  }
  if (typeof value.cwd !== "string" || !path.isAbsolute(value.cwd)) fail("CORE_LITE_SCHEMA", "check cwd must be absolute");
  const cwd = fs.realpathSync.native(path.resolve(value.cwd));
  if (!inside(root, cwd) || !fs.statSync(cwd).isDirectory()) fail("CORE_LITE_SCHEMA", "check cwd must be inside the workspace");
  if (!Number.isSafeInteger(value.timeout_ms) || value.timeout_ms < 1 || value.timeout_ms > 60_000) {
    fail("CORE_LITE_SCHEMA", "check timeout must be between 1 and 60000 ms");
  }
  const immutablePaths = absoluteStrings(value.immutable_input_paths, "immutable_input_paths", { allowEmpty: true });
  if (immutablePaths.some((entry) => inside(root, path.resolve(entry)))) {
    fail("CORE_LITE_OWNERSHIP", "immutable check inputs must be outside the model workspace");
  }
  const executable = fileIdentity(value.executable_path, "check executable", { executable: true });
  const immutableInputs = immutablePaths.map((entry, index) => fileIdentity(entry, `immutable input ${index}`));
  const source = { schema_version: 1, check_id: value.check_id, executable_path: executable.path,
    executable_sha256: executable.sha256, argv: value.argv, cwd, timeout_ms: value.timeout_ms,
    immutable_inputs: immutableInputs.map((entry) => ({ path: entry.path, sha256: entry.sha256 })) };
  return Object.freeze({ ...source, descriptor_identity: descriptorIdentity, executable_identity: executable,
    immutable_input_identities: Object.freeze(immutableInputs), check_fingerprint: fingerprint(source) });
}

function assertFrozenCheck(check) {
  assertIdentity(check.descriptor_identity, "check descriptor");
  assertIdentity(check.executable_identity, "check executable", { executable: true });
  check.immutable_input_identities.forEach((entry, index) => assertIdentity(entry, `immutable input ${index}`));
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

function runProcess(file, args, { cwd, env, timeoutMs, passthrough = false } = {}) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const child = spawn(file, args, { cwd, env, shell: false, windowsHide: true,
      detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let stdout = Buffer.alloc(0); let stderr = Buffer.alloc(0); let spawnError = null; let timedOut = false;
    child.stdout.on("data", (chunk) => { stdout = appendBounded(stdout, chunk, MAX_EVENT_BYTES); if (passthrough) process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { stderr = appendBounded(stderr, chunk, MAX_STDERR_BYTES); if (passthrough) process.stderr.write(chunk); });
    child.once("error", (error) => { spawnError = error; });
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
    child.once("close", (status, signal) => {
      clearTimeout(timer);
      if (process.platform !== "win32") killTree(child);
      resolve(Object.freeze({ status: Number.isInteger(status) ? status : null, signal: signal ?? null,
        error_code: spawnError?.code ?? null, timed_out: timedOut,
        duration_ms: Number(process.hrtime.bigint() - started) / 1e6,
        stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8") }));
    });
  });
}

function sessionIds(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((entry) => sessionIds(entry, found));
  else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (SESSION_KEYS.has(key) && typeof entry === "string" && entry.length > 0 && entry.length <= 256) found.add(entry);
      sessionIds(entry, found);
    }
  }
  return found;
}

export function inspectOpenCodeEvents(stdout) {
  const ids = new Set(); let json_event_count = 0; let turn_count = 0; const tools = new Set();
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") continue;
    let value; try { value = JSON.parse(line); } catch { continue; }
    json_event_count += 1; sessionIds(value, ids);
    if (value.type === "step_start") turn_count += 1;
    if (value.type === "tool_use" && typeof value.part?.id === "string") tools.add(value.part.id);
  }
  return Object.freeze({ json_event_count, turn_count, tool_call_count: tools.size,
    session_id: ids.size === 1 ? [...ids][0] : null, session_id_count: ids.size });
}

async function executeCheck(check) {
  assertFrozenCheck(check);
  const result = await runProcess(check.executable_path, check.argv, {
    cwd: check.cwd, env: process.env, timeoutMs: check.timeout_ms,
  });
  assertFrozenCheck(check);
  return Object.freeze({ check_id: check.check_id, check_fingerprint: check.check_fingerprint,
    passed: result.status === 0 && result.signal === null && result.error_code === null && !result.timed_out,
    exit_code: result.status, signal: result.signal, error_code: result.error_code,
    timed_out: result.timed_out, duration_ms: result.duration_ms,
    stderr: result.stderr, stderr_truncated: Buffer.byteLength(result.stderr) >= MAX_STDERR_BYTES });
}

function remediationMessage(checkResult) {
  const stderr = checkResult.stderr.trim() || "(empty stderr)";
  return [
    "The host-owned public check failed after your first attempt.",
    `Check ID: ${checkResult.check_id}`,
    `Exit code: ${checkResult.exit_code === null ? "null" : checkResult.exit_code}`,
    `Signal: ${checkResult.signal ?? "none"}`,
    "Bounded stderr:",
    stderr,
    "You have exactly one remediation pass. Fix the current patch, keep the change minimal, and do not claim success without the check.",
  ].join("\n");
}

function openCodeArgs(options, message, sessionId = null) {
  return ["run", "--pure", "--format", "json", ...(options.auto ? ["--auto"] : []),
    ...(options.model === null ? [] : ["--model", options.model]),
    ...(options.variant === null ? [] : ["--variant", options.variant]),
    "--agent", options.agent, "--dir", options.workspace,
    ...(sessionId === null ? [] : ["--session", sessionId]), message];
}

export async function runCoreLite(options) {
  const check = loadFrozenCheck(options.check, options.workspace);
  const initial = await runProcess(options.opencode, openCodeArgs(options, options.message), {
    cwd: options.workspace, env: process.env, timeoutMs: options.attempt_timeout_ms, passthrough: true,
  });
  const initialEvents = inspectOpenCodeEvents(initial.stdout);
  const firstCheck = await executeCheck(check);
  let remediation = null; let finalCheck = firstCheck;
  if (!firstCheck.passed && initialEvents.session_id !== null) {
    remediation = await runProcess(options.opencode,
      openCodeArgs(options, remediationMessage(firstCheck), initialEvents.session_id), {
        cwd: options.workspace, env: process.env, timeoutMs: options.attempt_timeout_ms, passthrough: true,
      });
    finalCheck = await executeCheck(check);
  }
  const processSuccess = initial.status === 0 && initial.signal === null && initial.error_code === null && !initial.timed_out
    && (remediation === null || (remediation.status === 0 && remediation.signal === null
      && remediation.error_code === null && !remediation.timed_out));
  const receiptBody = { schema_version: 1, profile: "core-lite", check_id: check.check_id,
    check_fingerprint: check.check_fingerprint, first_check: firstCheck,
    remediation_invoked: remediation !== null, remediation_session_observed: initialEvents.session_id !== null,
    remediation_process: remediation === null ? null : { status: remediation.status, signal: remediation.signal,
      error_code: remediation.error_code, timed_out: remediation.timed_out, duration_ms: remediation.duration_ms,
      events: inspectOpenCodeEvents(remediation.stdout) },
    initial_process: { status: initial.status, signal: initial.signal, error_code: initial.error_code,
      timed_out: initial.timed_out, duration_ms: initial.duration_ms, events: initialEvents },
    final_check: finalCheck, verification_passed: finalCheck.passed,
    remediation_recovered: !firstCheck.passed && finalCheck.passed,
    success: processSuccess && finalCheck.passed };
  return Object.freeze({ ...receiptBody, receipt_fingerprint: fingerprint(receiptBody) });
}

function parseArguments(values) {
  const separator = values.indexOf("--");
  if (separator < 0 || separator === values.length - 1) fail("CORE_LITE_ARGUMENT", "a task message is required after --");
  const options = { workspace: null, check: null, opencode: "opencode", model: null, variant: null,
    agent: "core-lite", attempt_timeout_ms: 900_000, receipt_fd: null, auto: false,
    message: values.slice(separator + 1).join(" ") };
  for (let index = 0; index < separator; index += 1) {
    const name = values[index];
    if (name === "--auto") { options.auto = true; continue; }
    if (!["--workspace", "--check", "--opencode", "--model", "--variant", "--agent", "--attempt-timeout-ms", "--receipt-fd"].includes(name)
      || index + 1 >= separator) fail("CORE_LITE_ARGUMENT", `invalid option ${name}`);
    const value = values[index + 1]; index += 1;
    if (name === "--attempt-timeout-ms") options.attempt_timeout_ms = Number(value);
    else if (name === "--receipt-fd") options.receipt_fd = Number(value);
    else options[name.slice(2).replaceAll("-", "_")] = value;
  }
  if (options.workspace === null || options.check === null) fail("CORE_LITE_ARGUMENT", "--workspace and --check are required");
  options.workspace = fs.realpathSync.native(path.resolve(options.workspace));
  options.opencode = fs.realpathSync.native(path.resolve(options.opencode));
  if (!Number.isSafeInteger(options.attempt_timeout_ms) || options.attempt_timeout_ms < 1) fail("CORE_LITE_ARGUMENT", "attempt timeout is invalid");
  if (options.receipt_fd !== null && options.receipt_fd !== 3) fail("CORE_LITE_ARGUMENT", "receipt fd must be 3");
  return Object.freeze(options);
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const receipt = await runCoreLite(options);
    const encoded = `${JSON.stringify(receipt)}\n`;
    if (options.receipt_fd === 3) fs.writeSync(3, encoded, null, "utf8");
    else process.stderr.write(`[opencode-harness-core-lite] ${encoded}`);
    process.exitCode = receipt.success ? 0 : 20;
  } catch (error) {
    process.stderr.write(`[opencode-harness-core-lite] ${error.message}\n`);
    process.exitCode = 21;
  }
}

if (process.argv[1] !== undefined
  && pathToFileURL(fs.realpathSync.native(path.resolve(process.argv[1]))).href === import.meta.url) await main();
