import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  ContractError,
  assertExactKeys,
  assertPlainObject,
  assertSafeId,
  canonicalJson,
} from "../feedback/contracts.mjs";

export const SYNTHETIC_TRUSTED_CHECK_BROKER_VERSION = 1;
export const SYNTHETIC_TRUSTED_CHECK_BROKER_OPERATION = "quality_run_trusted_project_check";
export const SYNTHETIC_TRUSTED_CHECK_BROKER_ENVIRONMENT_KEYS = Object.freeze({
  directory: "OPENCODE_QUALITY_BROKER_DIRECTORY",
  secret: "OPENCODE_QUALITY_BROKER_SECRET",
  timeout: "OPENCODE_QUALITY_BROKER_TIMEOUT_MS",
});

const PROTOCOL_ID = "synthetic-trusted-project-check-broker-v1";
const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const MAX_REQUESTS = 64;
const MAX_PATHS = 512;
const MAX_PATH_BYTES = 1_000;
const MAX_TIMEOUT_MS = 60 * 60 * 1_000;
const REQUEST_ID = /^[0-9a-f]{32}$/u;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
const SECRET = /^[0-9a-f]{64}$/u;
const MAC = /^hmac-sha256:[0-9a-f]{64}$/u;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{2,127}$/u;
const PHASES = new Set(["preimplementation", "slice", "integration", "live"]);
const WAIT_CELL = new Int32Array(new SharedArrayBuffer(4));

function fail(code, message) {
  throw new ContractError(code, message);
}

function boundedString(value, label, maxBytes) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")
    || Buffer.byteLength(value, "utf8") > maxBytes) {
    fail("QUALITY_CHECK_BROKER_PROTOCOL", `${label} is invalid`);
  }
  return value;
}

function assertFingerprint(value, label) {
  if (typeof value !== "string" || !FINGERPRINT.test(value)) {
    fail("QUALITY_CHECK_BROKER_PROTOCOL", `${label} is invalid`);
  }
  return value;
}

function normalizePaths(values, label) {
  if (!Array.isArray(values) || values.length > MAX_PATHS) {
    fail("QUALITY_CHECK_BROKER_PROTOCOL", `${label} is invalid`);
  }
  let previous = null;
  return Object.freeze(values.map((entry, index) => {
    boundedString(entry, `${label}[${index}]`, MAX_PATH_BYTES);
    if (path.posix.isAbsolute(entry) || path.win32.isAbsolute(entry)
      || entry.includes("\\") || entry.split("/").some((part) => part === "" || part === "." || part === "..")) {
      fail("QUALITY_CHECK_BROKER_PROTOCOL", `${label}[${index}] is not a portable relative path`);
    }
    if (previous !== null && previous >= entry) {
      fail("QUALITY_CHECK_BROKER_PROTOCOL", `${label} must be unique and sorted`);
    }
    previous = entry;
    return entry;
  }));
}

export function validateSyntheticTrustedCheckBrokerPayload(value) {
  assertExactKeys(value, {
    allowed: [
      "check_id",
      "phase",
      "catalog_fingerprint",
      "toolchain_map_fingerprint",
      "expected_source_workspace_fingerprint",
      "workspace_observation_salt",
      "workspace_ownership_paths",
      "workspace_generated_output_paths",
    ],
    required: [
      "check_id",
      "phase",
      "catalog_fingerprint",
      "toolchain_map_fingerprint",
      "expected_source_workspace_fingerprint",
      "workspace_observation_salt",
      "workspace_ownership_paths",
      "workspace_generated_output_paths",
    ],
  }, "trusted-check broker payload");
  try {
    assertSafeId(value.check_id, "trusted-check broker payload.check_id");
  } catch {
    fail("QUALITY_CHECK_BROKER_PROTOCOL", "trusted-check broker check_id is invalid");
  }
  if (!PHASES.has(value.phase)) fail("QUALITY_CHECK_BROKER_PROTOCOL", "trusted-check broker phase is invalid");
  return Object.freeze({
    check_id: value.check_id,
    phase: value.phase,
    catalog_fingerprint: assertFingerprint(value.catalog_fingerprint, "catalog_fingerprint"),
    toolchain_map_fingerprint: assertFingerprint(value.toolchain_map_fingerprint, "toolchain_map_fingerprint"),
    expected_source_workspace_fingerprint: assertFingerprint(
      value.expected_source_workspace_fingerprint,
      "expected_source_workspace_fingerprint",
    ),
    workspace_observation_salt: boundedString(
      value.workspace_observation_salt,
      "workspace_observation_salt",
      256,
    ),
    workspace_ownership_paths: normalizePaths(value.workspace_ownership_paths, "workspace_ownership_paths"),
    workspace_generated_output_paths: normalizePaths(
      value.workspace_generated_output_paths,
      "workspace_generated_output_paths",
    ),
  });
}

export function validateSyntheticTrustedCheckBrokerInvocation(value) {
  assertExactKeys(value, {
    allowed: ["request", "timeout_ms"],
    required: ["request", "timeout_ms"],
  }, "trusted-check broker invocation");
  if (!Number.isSafeInteger(value.timeout_ms) || value.timeout_ms < 1 || value.timeout_ms > MAX_TIMEOUT_MS) {
    fail("QUALITY_CHECK_BROKER_PROTOCOL", "trusted-check broker invocation timeout is invalid");
  }
  return Object.freeze({
    request: validateSyntheticTrustedCheckBrokerPayload(value.request),
    timeout_ms: value.timeout_ms,
  });
}

function validateSecret(secret) {
  if (typeof secret !== "string" || !SECRET.test(secret)) {
    fail("QUALITY_CHECK_BROKER_UNAVAILABLE", "trusted-check broker capability is invalid");
  }
  return secret;
}

function messageMac(body, secret) {
  return `hmac-sha256:${createHmac("sha256", secret).update(canonicalJson(body)).digest("hex")}`;
}

function macMatches(actual, expected) {
  if (typeof actual !== "string" || !MAC.test(actual)) return false;
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function requestBody(requestId, payload) {
  return {
    schema_version: SYNTHETIC_TRUSTED_CHECK_BROKER_VERSION,
    protocol_id: PROTOCOL_ID,
    request_id: requestId,
    payload: validateSyntheticTrustedCheckBrokerPayload(payload),
  };
}

export function createSyntheticTrustedCheckBrokerRequest(payload, { requestId, secret }) {
  if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) {
    fail("QUALITY_CHECK_BROKER_PROTOCOL", "trusted-check broker request ID is invalid");
  }
  const body = requestBody(requestId, payload);
  const request = Object.freeze({ ...body, hmac: messageMac(body, validateSecret(secret)) });
  if (Buffer.byteLength(canonicalJson(request), "utf8") > MAX_MESSAGE_BYTES) {
    fail("QUALITY_CHECK_BROKER_PROTOCOL", "trusted-check broker request exceeds its byte limit");
  }
  return request;
}

export function validateSyntheticTrustedCheckBrokerRequest(value, { secret }) {
  assertExactKeys(value, {
    allowed: ["schema_version", "protocol_id", "request_id", "payload", "hmac"],
    required: ["schema_version", "protocol_id", "request_id", "payload", "hmac"],
  }, "trusted-check broker request");
  if (value.schema_version !== SYNTHETIC_TRUSTED_CHECK_BROKER_VERSION
    || value.protocol_id !== PROTOCOL_ID || typeof value.request_id !== "string"
    || !REQUEST_ID.test(value.request_id)) {
    fail("QUALITY_CHECK_BROKER_PROTOCOL", "trusted-check broker request metadata is invalid");
  }
  const body = requestBody(value.request_id, value.payload);
  if (!macMatches(value.hmac, messageMac(body, validateSecret(secret)))) {
    fail("QUALITY_CHECK_BROKER_AUTH", "trusted-check broker request authentication failed");
  }
  return Object.freeze({ ...body, hmac: value.hmac });
}

function responseBody(requestId, result, errorCode) {
  if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) {
    fail("QUALITY_CHECK_BROKER_PROTOCOL", "trusted-check broker response ID is invalid");
  }
  if ((result === null) === (errorCode === null)) {
    fail("QUALITY_CHECK_BROKER_PROTOCOL", "trusted-check broker response outcome is ambiguous");
  }
  if (errorCode !== null && (typeof errorCode !== "string" || !ERROR_CODE.test(errorCode))) {
    fail("QUALITY_CHECK_BROKER_PROTOCOL", "trusted-check broker error code is invalid");
  }
  if (result !== null) assertPlainObject(result, "trusted-check broker result");
  return {
    schema_version: SYNTHETIC_TRUSTED_CHECK_BROKER_VERSION,
    protocol_id: PROTOCOL_ID,
    request_id: requestId,
    ok: errorCode === null,
    ...(errorCode === null ? { result } : { error_code: errorCode }),
  };
}

export function createSyntheticTrustedCheckBrokerResponse({ requestId, result = null, errorCode = null, secret }) {
  const body = responseBody(requestId, result, errorCode);
  const response = Object.freeze({ ...body, hmac: messageMac(body, validateSecret(secret)) });
  if (Buffer.byteLength(canonicalJson(response), "utf8") > MAX_MESSAGE_BYTES) {
    fail("QUALITY_CHECK_BROKER_PROTOCOL", "trusted-check broker response exceeds its byte limit");
  }
  return response;
}

export function validateSyntheticTrustedCheckBrokerResponse(value, { requestId, secret }) {
  if (value?.ok !== true && value?.ok !== false) {
    fail("QUALITY_CHECK_BROKER_PROTOCOL", "trusted-check broker response status is invalid");
  }
  const expectedKeys = value?.ok === true
    ? ["schema_version", "protocol_id", "request_id", "ok", "result", "hmac"]
    : ["schema_version", "protocol_id", "request_id", "ok", "error_code", "hmac"];
  assertExactKeys(value, { allowed: expectedKeys, required: expectedKeys }, "trusted-check broker response");
  const body = responseBody(
    value.request_id,
    value.ok === true ? value.result : null,
    value.ok === true ? null : value.error_code,
  );
  if (body.schema_version !== value.schema_version || body.protocol_id !== value.protocol_id
    || value.request_id !== requestId || !macMatches(value.hmac, messageMac(body, validateSecret(secret)))) {
    fail("QUALITY_CHECK_BROKER_AUTH", "trusted-check broker response authentication failed");
  }
  return Object.freeze({ ...body, hmac: value.hmac });
}

function canonicalPrivateDirectory(candidate, label) {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate) || candidate.includes("\0")) {
    fail("QUALITY_CHECK_BROKER_UNAVAILABLE", `${label} is invalid`);
  }
  let canonical;
  let identity;
  try {
    canonical = fs.realpathSync.native(path.resolve(candidate));
    identity = fs.lstatSync(canonical);
  } catch {
    fail("QUALITY_CHECK_BROKER_UNAVAILABLE", `${label} is unavailable`);
  }
  if (canonical !== path.resolve(candidate) || !identity.isDirectory() || identity.isSymbolicLink()
    || (process.platform !== "win32" && (identity.mode & 0o077) !== 0)) {
    fail("QUALITY_CHECK_BROKER_UNAVAILABLE", `${label} is not a private canonical directory`);
  }
  return canonical;
}

function parseTimeout(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,6}$/u.test(value)) {
    fail("QUALITY_CHECK_BROKER_UNAVAILABLE", "trusted-check broker timeout is invalid");
  }
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    fail("QUALITY_CHECK_BROKER_UNAVAILABLE", "trusted-check broker timeout is invalid");
  }
  return timeoutMs;
}

function brokerConfiguration(environment) {
  const values = Object.values(SYNTHETIC_TRUSTED_CHECK_BROKER_ENVIRONMENT_KEYS).map((key) => environment?.[key]);
  if (values.every((entry) => entry === undefined)) return null;
  if (values.some((entry) => entry === undefined)) {
    fail("QUALITY_CHECK_BROKER_UNAVAILABLE", "trusted-check broker configuration is incomplete");
  }
  return Object.freeze({
    directory: canonicalPrivateDirectory(values[0], "trusted-check broker directory"),
    secret: validateSecret(values[1]),
    timeout_ms: parseTimeout(values[2]),
  });
}

function readBoundedJson(file, label) {
  let descriptor = null;
  try {
    const pathIdentity = fs.lstatSync(file, { bigint: true });
    descriptor = fs.openSync(
      file,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    );
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!pathIdentity.isFile() || pathIdentity.isSymbolicLink()
      || pathIdentity.dev !== before.dev || pathIdentity.ino !== before.ino
      || !before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size < 1n || before.size > BigInt(MAX_MESSAGE_BYTES)) {
      fail("QUALITY_CHECK_BROKER_PROTOCOL", `${label} is invalid`);
    }
    const bytes = Buffer.allocUnsafe(MAX_MESSAGE_BYTES + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (count === 0) break;
      offset += count;
    }
    const after = fs.fstatSync(descriptor, { bigint: true });
    if (offset !== Number(before.size) || offset > MAX_MESSAGE_BYTES
      || before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs || before.nlink !== after.nlink) {
      fail("QUALITY_CHECK_BROKER_PROTOCOL", `${label} changed while it was read`);
    }
    return JSON.parse(bytes.subarray(0, offset).toString("utf8"));
  } catch {
    fail("QUALITY_CHECK_BROKER_PROTOCOL", `${label} is malformed`);
  } finally {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch { /* the operation already fails closed */ }
    }
  }
}

function atomicWrite(directory, filename, value) {
  const nonce = randomBytes(8).toString("hex");
  const temporary = path.join(directory, `.${filename}.${nonce}.tmp`);
  const target = path.join(directory, filename);
  try {
    fs.writeFileSync(temporary, `${canonicalJson(value)}\n`, { flag: "wx", mode: 0o600 });
    fs.linkSync(temporary, target);
    fs.unlinkSync(temporary);
  } catch {
    try { fs.unlinkSync(temporary); } catch { /* bounded fail-closed cleanup */ }
    fail("QUALITY_CHECK_BROKER_UNAVAILABLE", "trusted-check broker message could not be published");
  }
}

export function createTrustedProjectCheckBrokerClient({
  environment = process.env,
  catalogFingerprint,
  toolchainMapFingerprint,
} = {}) {
  const configuration = brokerConfiguration(environment);
  if (configuration === null) return null;
  assertFingerprint(catalogFingerprint, "broker catalog fingerprint");
  assertFingerprint(toolchainMapFingerprint, "broker toolchain-map fingerprint");
  let active = false;
  return (input) => {
    if (active) fail("QUALITY_CHECK_BROKER_SERIALIZATION", "trusted-check broker calls must be serialized");
    active = true;
    const requestId = randomBytes(16).toString("hex");
    const requestFile = path.join(configuration.directory, `request-${requestId}.json`);
    const responseFile = path.join(configuration.directory, `response-${requestId}.json`);
    try {
      assertPlainObject(input, "trusted-check broker runner input");
      const request = createSyntheticTrustedCheckBrokerRequest({
        check_id: input.targetId,
        phase: input.phase,
        catalog_fingerprint: catalogFingerprint,
        toolchain_map_fingerprint: toolchainMapFingerprint,
        expected_source_workspace_fingerprint: input.expectedSourceWorkspaceFingerprint,
        workspace_observation_salt: input.workspaceObservationSalt,
        workspace_ownership_paths: input.workspaceOwnershipPaths,
        workspace_generated_output_paths: input.workspaceGeneratedOutputPaths,
      }, { requestId, secret: configuration.secret });
      atomicWrite(configuration.directory, path.basename(requestFile), request);
      const deadline = Date.now() + configuration.timeout_ms;
      while (!fs.existsSync(responseFile)) {
        if (Date.now() >= deadline) fail("QUALITY_CHECK_BROKER_TIMEOUT", "trusted-check broker response timed out");
        Atomics.wait(WAIT_CELL, 0, 0, 10);
      }
      const response = validateSyntheticTrustedCheckBrokerResponse(
        readBoundedJson(responseFile, "trusted-check broker response"),
        { requestId, secret: configuration.secret },
      );
      if (!response.ok) throw new ContractError(response.error_code, "runner-owned trusted project check failed");
      return response.result;
    } finally {
      for (const file of [requestFile, responseFile]) {
        try { fs.unlinkSync(file); } catch { /* server teardown verifies the owned directory */ }
      }
      active = false;
    }
  };
}

function safeErrorCode(error) {
  return typeof error?.code === "string" && ERROR_CODE.test(error.code)
    ? error.code
    : "QUALITY_CHECK_BROKER_FAILED";
}

export function createSyntheticTrustedCheckBrokerServer({ baseDirectory, timeoutMs, handler }) {
  const base = canonicalPrivateDirectory(baseDirectory, "trusted-check broker base directory");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS || typeof handler !== "function") {
    fail("QUALITY_CHECK_BROKER_UNAVAILABLE", "trusted-check broker server configuration is invalid");
  }
  const directory = fs.mkdtempSync(path.join(base, "trusted-check-broker-"));
  fs.chmodSync(directory, 0o700);
  const canonicalDirectory = canonicalPrivateDirectory(directory, "trusted-check broker directory");
  const secret = randomBytes(32).toString("hex");
  const seen = new Set();
  let requestCount = 0;
  let totalBytes = 0;
  let firstErrorCode = null;
  let timer = null;
  let chain = Promise.resolve();

  const recordError = (code) => {
    if (firstErrorCode === null) firstErrorCode = code;
  };
  const publishError = (requestId, errorCode) => {
    recordError(errorCode);
    try {
      atomicWrite(canonicalDirectory, `response-${requestId}.json`, createSyntheticTrustedCheckBrokerResponse({
        requestId,
        errorCode,
        secret,
      }));
    } catch {
      recordError("QUALITY_CHECK_BROKER_UNAVAILABLE");
    }
  };
  const handleFile = async (filename) => {
    const match = filename.match(/^request-([0-9a-f]{32})\.json$/u);
    if (match === null || seen.has(filename)) return;
    seen.add(filename);
    const requestId = match[1];
    const requestFile = path.join(canonicalDirectory, filename);
    try {
      const identity = fs.lstatSync(requestFile);
      requestCount += 1;
      totalBytes += identity.size;
      if (requestCount > MAX_REQUESTS || totalBytes > MAX_TOTAL_BYTES) {
        fail("QUALITY_CHECK_BROKER_QUOTA", "trusted-check broker request quota exceeded");
      }
      const request = validateSyntheticTrustedCheckBrokerRequest(
        readBoundedJson(requestFile, "trusted-check broker request"),
        { secret },
      );
      if (request.request_id !== requestId) fail("QUALITY_CHECK_BROKER_PROTOCOL", "trusted-check broker filename binding is invalid");
      const result = await handler(request.payload);
      const response = createSyntheticTrustedCheckBrokerResponse({ requestId, result, secret });
      totalBytes += Buffer.byteLength(canonicalJson(response), "utf8");
      if (totalBytes > MAX_TOTAL_BYTES) fail("QUALITY_CHECK_BROKER_QUOTA", "trusted-check broker response quota exceeded");
      atomicWrite(canonicalDirectory, `response-${requestId}.json`, response);
    } catch (error) {
      publishError(requestId, safeErrorCode(error));
    }
  };
  const scan = () => {
    let entries;
    try {
      entries = fs.readdirSync(canonicalDirectory).sort();
    } catch {
      recordError("QUALITY_CHECK_BROKER_UNAVAILABLE");
      return;
    }
    for (const filename of entries) {
      if (!/^request-[0-9a-f]{32}\.json$/u.test(filename) || seen.has(filename)) continue;
      chain = chain.then(() => handleFile(filename));
    }
  };

  return Object.freeze({
    environment: Object.freeze({
      [SYNTHETIC_TRUSTED_CHECK_BROKER_ENVIRONMENT_KEYS.directory]: canonicalDirectory,
      [SYNTHETIC_TRUSTED_CHECK_BROKER_ENVIRONMENT_KEYS.secret]: secret,
      [SYNTHETIC_TRUSTED_CHECK_BROKER_ENVIRONMENT_KEYS.timeout]: String(timeoutMs),
    }),
    start() {
      if (timer !== null) fail("QUALITY_CHECK_BROKER_SERIALIZATION", "trusted-check broker server is already started");
      timer = setInterval(scan, 5);
      scan();
    },
    async close() {
      if (timer !== null) clearInterval(timer);
      timer = null;
      scan();
      await chain;
      try {
        fs.rmSync(canonicalDirectory, { recursive: true, force: true });
        if (fs.existsSync(canonicalDirectory)) throw new Error("broker directory survived cleanup");
      } catch {
        recordError("QUALITY_CHECK_BROKER_CLEANUP");
      }
      return firstErrorCode;
    },
  });
}
