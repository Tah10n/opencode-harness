import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { ContractError, canonicalJson, fingerprint } from "../feedback/contracts.mjs";

const MAX_STATE_BYTES = 256 * 1024;
const MAX_STATE_RECORDS = 4096;
const FP = /^sha256:[0-9a-f]{64}$/u;
const ROTATION_LOCK_WAIT_ATTEMPTS = 200;
const ROTATION_LOCK_WAIT_MS = 50;

function fail(message) { throw new ContractError("BENCHMARK_V3_PROVIDER_CREDENTIAL", message); }
function expect(condition, message) { if (!condition) fail(message); }
function exact(value, keys, label) {
  expect(value && typeof value === "object" && !Array.isArray(value)
    && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()), `${label} shape is invalid`);
}

export function validateBenchmarkV3OpenAIOAuth(auth) {
  exact(auth, ["type", "refresh", "access", "expires", "accountId"], "OpenAI OAuth credential");
  expect(auth.type === "oauth" && typeof auth.refresh === "string" && auth.refresh.length >= 16
    && auth.refresh.length <= 16 * 1024 && typeof auth.access === "string" && auth.access.length >= 16
    && auth.access.length <= 32 * 1024 && Number.isSafeInteger(auth.expires) && auth.expires > 0
    && typeof auth.accountId === "string" && auth.accountId.length >= 1 && auth.accountId.length <= 1024
    && !/[\u0000-\u001f\u007f]/u.test(auth.accountId),
  "OpenAI OAuth credential is invalid");
  return Object.freeze({ type: "oauth", refresh: auth.refresh, access: auth.access,
    expires: auth.expires, accountId: auth.accountId });
}

function recordBody({ sequence, auth, previousStateFingerprint }) {
  return Object.freeze({ schema_version: 1, sequence, provider: "openai", auth,
    previous_state_fingerprint: previousStateFingerprint });
}

function validateRecord(value, previous) {
  exact(value, ["schema_version", "sequence", "provider", "auth", "previous_state_fingerprint", "state_fingerprint"],
    "OAuth state record");
  const auth = validateBenchmarkV3OpenAIOAuth(value.auth);
  const expectedPrevious = previous?.state_fingerprint ?? null;
  const body = recordBody({ sequence: value.sequence, auth, previousStateFingerprint: value.previous_state_fingerprint });
  expect(value.schema_version === 1 && value.provider === "openai" && Number.isSafeInteger(value.sequence)
    && value.sequence === (previous?.sequence ?? 0) + 1 && value.previous_state_fingerprint === expectedPrevious
    && FP.test(value.state_fingerprint) && value.state_fingerprint === fingerprint(body), "OAuth state chain is invalid");
  return Object.freeze({ ...body, state_fingerprint: value.state_fingerprint });
}

function openStableState(target, flags) {
  const descriptor = fs.openSync(target, flags | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    expect(before.isFile() && before.nlink === 1n && before.size >= 1n && before.size <= BigInt(MAX_STATE_BYTES)
      && (Number(before.mode) & 0o777) === 0o600
      && (typeof process.getuid !== "function" || Number(before.uid) === process.getuid()),
    "OAuth state file is not a private bounded ordinary file");
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    const pathAfter = fs.lstatSync(target, { bigint: true });
    for (const key of ["dev", "ino", "mode", "nlink", "size", "mtimeNs", "ctimeNs", "uid"]) {
      expect(before[key] === after[key] && after[key] === pathAfter[key], "OAuth state file changed while it was read");
    }
    expect(pathAfter.isFile() && !pathAfter.isSymbolicLink(), "OAuth state path is not an ordinary file");
    return Object.freeze({ descriptor, bytes, stat: after });
  } catch (error) {
    fs.closeSync(descriptor);
    throw error;
  }
}

function assertPrivateStateParent(statePath) {
  const parentPath = path.dirname(statePath);
  expect(fs.realpathSync.native(parentPath) === parentPath, "OAuth state parent path must be canonical");
  const parent = fs.lstatSync(parentPath);
  expect(parent.isDirectory() && !parent.isSymbolicLink() && (parent.mode & 0o077) === 0
    && (typeof process.getuid !== "function" || parent.uid === process.getuid()),
  "OAuth state parent must be private and owner-controlled");
  return parentPath;
}

export async function withBenchmarkV3OpenAIOAuthRotationLock(statePath, operation) {
  expect(typeof statePath === "string" && path.isAbsolute(statePath) && typeof operation === "function",
    "OAuth rotation lock arguments are invalid");
  const parent = assertPrivateStateParent(statePath);
  const target = `${statePath}.rotation-lock`;
  const nonce = fingerprint({ pid: process.pid, state_path_fingerprint: fingerprint(statePath),
    random: randomBytes(16).toString("hex") });
  let acquired = false;
  for (let attempt = 0; attempt < ROTATION_LOCK_WAIT_ATTEMPTS; attempt += 1) {
    try {
      const descriptor = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
        | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
      try { fs.writeFileSync(descriptor, `${JSON.stringify({ schema_version: 1, nonce })}\n`); fs.fsyncSync(descriptor); }
      finally { fs.closeSync(descriptor); }
      const directory = fs.openSync(parent, fs.constants.O_RDONLY);
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
      acquired = true;
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await delay(ROTATION_LOCK_WAIT_MS);
    }
  }
  expect(acquired, "OAuth rotation lock is held or requires manual audited recovery");
  try { return await operation(); }
  finally {
    let current = null;
    try { current = JSON.parse(fs.readFileSync(target, "utf8")); } catch {}
    expect(current?.schema_version === 1 && current.nonce === nonce, "OAuth rotation lock ownership changed");
    fs.unlinkSync(target);
    const directory = fs.openSync(parent, fs.constants.O_RDONLY);
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  }
}

function parseState(bytes) {
  const text = bytes.toString("utf8");
  expect(text.endsWith("\n"), "OAuth state journal has a torn tail");
  const lines = text.trimEnd().split("\n");
  expect(lines.length >= 1 && lines.length <= MAX_STATE_RECORDS, "OAuth state journal length is invalid");
  let current = null;
  for (const line of lines) {
    expect(line.length >= 1 && line.length <= 64 * 1024, "OAuth state record is not bounded");
    let value;
    try { value = JSON.parse(line); } catch { fail("OAuth state record is not valid JSON"); }
    current = validateRecord(value, current);
  }
  return current;
}

export function loadBenchmarkV3OpenAIOAuthState(statePath) {
  expect(typeof statePath === "string" && path.isAbsolute(statePath), "OAuth state path must be absolute");
  assertPrivateStateParent(statePath);
  const opened = openStableState(statePath, fs.constants.O_RDONLY);
  try { return parseState(opened.bytes); } finally { fs.closeSync(opened.descriptor); }
}

export function appendBenchmarkV3OpenAIOAuthState(statePath, authValue, expectedStateFingerprint) {
  const auth = validateBenchmarkV3OpenAIOAuth(authValue);
  expect(FP.test(expectedStateFingerprint), "expected OAuth state fingerprint is invalid");
  const opened = openStableState(statePath, fs.constants.O_RDWR | fs.constants.O_APPEND);
  try {
    const current = parseState(opened.bytes);
    expect(current.state_fingerprint === expectedStateFingerprint, "OAuth state changed before refresh rotation");
    const body = recordBody({ sequence: current.sequence + 1, auth,
      previousStateFingerprint: current.state_fingerprint });
    const record = Object.freeze({ ...body, state_fingerprint: fingerprint(body) });
    const bytes = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
    expect(Number(opened.stat.size) + bytes.length <= MAX_STATE_BYTES, "OAuth state journal is full");
    fs.writeSync(opened.descriptor, bytes);
    fs.fsyncSync(opened.descriptor);
    return record;
  } finally { fs.closeSync(opened.descriptor); }
}

function readStableAuthInput(inputPath) {
  const descriptor = fs.openSync(inputPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    expect(before.isFile() && before.nlink === 1n && before.size >= 1n && before.size <= 64n * 1024n
      && (Number(before.mode) & 0o077) === 0
      && (typeof process.getuid !== "function" || Number(before.uid) === process.getuid()),
    "OpenCode auth input is not a private bounded ordinary file");
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    const pathAfter = fs.lstatSync(inputPath, { bigint: true });
    for (const key of ["dev", "ino", "mode", "nlink", "size", "mtimeNs", "ctimeNs", "uid"]) {
      expect(before[key] === after[key] && after[key] === pathAfter[key], "OpenCode auth input changed while it was read");
    }
    expect(pathAfter.isFile() && !pathAfter.isSymbolicLink(), "OpenCode auth input path is not an ordinary file");
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); } finally { bytes.fill(0); }
    expect(value && typeof value === "object" && !Array.isArray(value), "OpenCode auth input is invalid");
    return validateBenchmarkV3OpenAIOAuth(value.openai);
  } finally { fs.closeSync(descriptor); }
}

export function initializeBenchmarkV3OpenAIOAuthState({ inputPath, outputPath }) {
  expect(typeof inputPath === "string" && path.isAbsolute(inputPath)
    && typeof outputPath === "string" && path.isAbsolute(outputPath) && inputPath !== outputPath,
  "OAuth initialization paths must be distinct absolute paths");
  expect(fs.realpathSync.native(inputPath) === inputPath, "OpenCode auth input path must be canonical");
  const canonicalInputParent = assertPrivateStateParent(inputPath);
  const canonicalParent = fs.realpathSync.native(path.dirname(outputPath));
  expect(path.join(canonicalParent, path.basename(outputPath)) === outputPath, "OAuth state output path must be canonical");
  assertPrivateStateParent(outputPath);
  expect(canonicalInputParent !== canonicalParent || path.basename(inputPath) !== path.basename(outputPath),
    "OAuth initialization paths must remain distinct");
  const auth = readStableAuthInput(inputPath);
  const body = recordBody({ sequence: 1, auth, previousStateFingerprint: null });
  const record = Object.freeze({ ...body, state_fingerprint: fingerprint(body) });
  const descriptor = fs.openSync(outputPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
    | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
  try { fs.writeFileSync(descriptor, `${JSON.stringify(record)}\n`); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  const directory = fs.openSync(canonicalParent, fs.constants.O_RDONLY);
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  return Object.freeze({ provider: "openai", auth_mode: "oauth", state_fingerprint: record.state_fingerprint });
}
