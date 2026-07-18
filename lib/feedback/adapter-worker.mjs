import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_CONTAINMENT_SETUP_TIMEOUT_MS,
  MAX_CONTAINMENT_SETUP_TIMEOUT_MS,
  observeLateProcessContainment,
  prepareProcessContainment,
  releaseUnverifiedChild,
  sanitizedNodeBootstrapEnvironment,
  terminateProcessTree,
  waitForProcessClose,
} from "./process-tree.mjs";

export class AdapterTimeoutError extends Error {
  constructor(timeout) {
    super(`adapter timed out after ${timeout}ms`);
    this.name = "AdapterTimeoutError";
    this.code = "ADAPTER_TIMEOUT";
  }
}

export class AdapterExecutionError extends Error {
  constructor(classification = "adapter_failed") {
    super(classification);
    this.name = "AdapterExecutionError";
    this.code = "ADAPTER_EXECUTION_FAILED";
    this.classification = classification;
  }
}

export const DEFAULT_ADAPTER_TRACE_LIMITS = Object.freeze({
  requests: 500,
  payloadBytes: 64 * 1024,
  totalBytes: 2 * 1024 * 1024,
  queuedRequests: 50,
  responseBytes: 64 * 1024,
  totalResponseBytes: 2 * 1024 * 1024,
  totalBidirectionalBytes: 4 * 1024 * 1024,
  resultBytes: 64 * 1024,
});

const CHILD_SOURCE = String.raw`
import fs from "node:fs";
import path from "node:path";

const pending = new Map();
let nextId = 0;
let terminalSent = false;
let traceDisabled = false;
let containmentChallengeHandled = false;
let traceRequests = 0;
let traceBytes = 0;
let responseBytes = 0;
let traceLimits;
const controller = new AbortController();
const keepAlive = setInterval(() => {}, 60_000);
process.once("disconnect", () => {
  controller.abort();
  clearInterval(keepAlive);
  process.exit(1);
});
let initialize;
const inputReady = new Promise((resolve) => { initialize = resolve; });

function comparableWorkingDirectoryPath(value) {
  let normalized = path.normalize(value);
  if (process.platform === "win32" && normalized.startsWith("\\\\?\\UNC\\")) {
    normalized = "\\\\" + normalized.slice(8);
  } else if (process.platform === "win32" && normalized.startsWith("\\\\?\\")) {
    normalized = normalized.slice(4);
  }
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function currentWorkingDirectoryIdentity() {
  const canonicalPath = fs.realpathSync.native(path.resolve("."));
  const stat = fs.lstatSync(".", { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("working directory is not ordinary");
  return {
    canonical_path: comparableWorkingDirectoryPath(canonicalPath),
    device: stat.dev.toString(10),
    inode: stat.ino.toString(10),
    mode: stat.mode.toString(10),
    links: stat.nlink.toString(10),
    modified_ns: stat.mtimeNs.toString(10),
    changed_ns: stat.ctimeNs.toString(10),
  };
}

function send(message) {
  return new Promise((resolve, reject) => {
    if (!process.connected) return reject(new Error("parent disconnected"));
    process.send(message, (error) => error ? reject(error) : resolve());
  });
}

function encodePlainJson(value, maxBytes) {
  let entries = 0;
  const clone = (current, depth) => {
    if (depth > 16) throw Object.assign(new Error("IPC graph is too deep"), { code: "IPC_GRAPH" });
    if (current === null || typeof current === "string" || typeof current === "boolean") return current;
    if (typeof current === "number" && Number.isFinite(current)) return current;
    if (Array.isArray(current)) {
      if (Object.getPrototypeOf(current) !== Array.prototype) throw Object.assign(new Error("IPC array prototype is unsupported"), { code: "IPC_GRAPH" });
      const keys = Reflect.ownKeys(current);
      if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key)))) {
        throw Object.assign(new Error("IPC array has unsupported properties"), { code: "IPC_GRAPH" });
      }
      const result = [];
      for (let index = 0; index < current.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw Object.assign(new Error("IPC sparse or accessor array is unsupported"), { code: "IPC_GRAPH" });
        entries += 1;
        if (entries > 10_000) throw Object.assign(new Error("IPC graph has too many entries"), { code: "IPC_GRAPH" });
        result.push(clone(descriptor.value, depth + 1));
      }
      return result;
    }
    if (typeof current === "object") {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) throw Object.assign(new Error("IPC object prototype is unsupported"), { code: "IPC_GRAPH" });
      const result = Object.create(null);
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key !== "string") throw Object.assign(new Error("IPC symbol keys are unsupported"), { code: "IPC_GRAPH" });
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw Object.assign(new Error("IPC accessors are unsupported"), { code: "IPC_GRAPH" });
        entries += 1;
        if (entries > 10_000) throw Object.assign(new Error("IPC graph has too many entries"), { code: "IPC_GRAPH" });
        Object.defineProperty(result, key, { value: clone(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true });
      }
      return result;
    }
    throw Object.assign(new Error("IPC value is not plain JSON"), { code: "IPC_GRAPH" });
  };
  const text = JSON.stringify(clone(value, 0));
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > maxBytes) throw Object.assign(new Error("IPC payload exceeds its byte quota"), { code: "IPC_BYTES" });
  return { text, bytes };
}

function requestOperation(operation, payload) {
  return new Promise((resolve, reject) => {
    if (traceDisabled || terminalSent) {
      reject(new Error("adapter trace is closed"));
      return;
    }
    let encoded;
    try {
      encoded = encodePlainJson({ operation, payload }, traceLimits.payloadBytes);
    } catch {
      encoded = null;
    }
    const payloadBytes = encoded?.bytes ?? Number.POSITIVE_INFINITY;
    const nextRequests = traceRequests + 1;
    const nextBytes = traceBytes + payloadBytes;
    const nextQueued = pending.size + 1;
    if (
      nextRequests > traceLimits.requests
      || payloadBytes > traceLimits.payloadBytes
      || nextBytes > traceLimits.totalBytes
      || nextQueued > traceLimits.queuedRequests
      || nextBytes + responseBytes > traceLimits.totalBidirectionalBytes
    ) {
      traceDisabled = true;
      controller.abort();
      terminalSent = true;
      void send({ type: "error", classification: "adapter_trace_quota_exceeded" }).catch(() => {});
      reject(new Error("adapter trace quota exceeded"));
      return;
    }
    traceRequests = nextRequests;
    traceBytes = nextBytes;
    const requestId = "trace-" + (++nextId);
    pending.set(requestId, { resolve, reject });
    void send({ type: "trace_request", request_id: requestId, payload_json: encoded.text }).catch((error) => {
      pending.delete(requestId);
      reject(error);
    });
  });
}

function traceFacade() {
  return Object.freeze({
    emit: (event) => requestOperation("emit", event),
    recordContextReceipt: (receipt) => requestOperation("record_context_receipt", receipt),
    jobs: Object.freeze({
      create: (job) => requestOperation("job_create", job),
      transition: (job) => requestOperation("job_transition", job),
      complete: (job) => requestOperation("job_complete", job),
    }),
  });
}

function qualityFacade() {
  return Object.freeze({
    createDossier: (input) => requestOperation("quality_create_dossier", input),
    updateDossier: (input) => requestOperation("quality_update_dossier", input),
    escalateContextStrategy: (input) => requestOperation("quality_escalate_context_strategy", input),
    evaluateArchitecture: (input) => requestOperation("quality_evaluate_architecture", input),
    createContextReport: (input) => requestOperation("quality_create_context_report", input),
    updateContextReport: (input) => requestOperation("quality_update_context_report", input),
    finalizeDossier: (input) => requestOperation("quality_finalize_dossier", input),
    inspect: (input = {}) => requestOperation("quality_inspect", input),
    observeContext: (input = {}) => requestOperation("quality_observe_context", input),
    challengePlan: (input = {}) => requestOperation("quality_challenge_plan", input),
    authorizeAction: (input) => requestOperation("quality_authorize_action", input),
    reconcileContext: (input) => requestOperation("quality_reconcile_context", input),
  });
}

process.on("message", (message) => {
  if (message?.type === "containment_challenge") {
    const challenge = message.challenge;
    if (initialize === null || containmentChallengeHandled
      || typeof challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
      void send({ type: "containment_challenge_rejected" }).catch(() => {});
      return;
    }
    containmentChallengeHandled = true;
    void send({ type: "containment_challenge_response", challenge }).catch(() => {});
  } else if (message?.type === "trace_result") {
    const request = pending.get(message.request_id);
    if (!request) return;
    pending.delete(message.request_id);
    if (message.ok) {
      try {
        if (typeof message.value_json !== "string") throw new Error("quality operation returned no JSON value");
        const bytes = Buffer.byteLength(message.value_json, "utf8");
        responseBytes += bytes;
        if (
          bytes > traceLimits.responseBytes
          || responseBytes > traceLimits.totalResponseBytes
          || traceBytes + responseBytes > traceLimits.totalBidirectionalBytes
        ) {
          throw Object.assign(new Error("adapter response quota exceeded"), { code: "IPC_BYTES" });
        }
        request.resolve(JSON.parse(message.value_json));
      } catch (error) {
        request.reject(new Error("trace or quality operation returned an invalid IPC value"));
        if (error?.code === "IPC_BYTES") {
          traceDisabled = true;
          controller.abort();
          terminalSent = true;
          void send({ type: "error", classification: "adapter_trace_quota_exceeded" }).catch(() => {});
        }
      }
    }
    else request.reject(new Error("trace operation rejected: " + (message.error_code ?? "TRACE_REJECTED")));
  } else if (message?.type === "abort" || message?.type === "shutdown") {
    controller.abort();
    void send({ type: "teardown_ack" }).catch(() => {});
  } else if (message?.type === "initialize" && initialize !== null) {
    traceLimits = message.input.traceLimits;
    const resolveInitialize = initialize;
    initialize = null;
    resolveInitialize(message.input);
  }
});
process.on("disconnect", () => {
  clearInterval(keepAlive);
  process.exitCode = 1;
});

try {
  const input = await inputReady;
  if (input.workingDirectoryIdentity !== null
    && JSON.stringify(currentWorkingDirectoryIdentity()) !== JSON.stringify(input.workingDirectoryIdentity)) {
    throw Object.assign(new Error("adapter working directory changed"), {
      code: "ADAPTER_WORKING_DIRECTORY_CHANGED",
    });
  }
  for (const key of Object.keys(process.env)) delete process.env[key];
  for (const [key, value] of Object.entries(input.environment)) process.env[key] = value;
  const adapter = await import(input.adapterUrl);
  if (typeof adapter.runScenario !== "function") {
    terminalSent = true;
    await send({ type: "error", classification: "adapter_export_missing" });
  } else {
    const result = await adapter.runScenario({
      ...input.context,
      signal: controller.signal,
      trace: traceFacade(),
      quality: qualityFacade(),
    });
    if (!terminalSent) {
      let encoded;
      try {
        encoded = encodePlainJson(result, traceLimits.resultBytes);
      } catch (error) {
        encoded = { error };
      }
      terminalSent = true;
      if (encoded.error?.code === "IPC_BYTES") {
        await send({ type: "error", classification: "adapter_result_quota_exceeded" }).catch(() => {});
      } else if (encoded.error) {
        await send({ type: "error", classification: "adapter_result_not_cloneable" }).catch(() => {});
      } else {
        await send({ type: "result", result_json: encoded.text }).catch(async () => {
          await send({ type: "error", classification: "adapter_result_not_cloneable" }).catch(() => {});
        });
      }
    }
  }
} catch (error) {
  const classification = error?.code === "ADAPTER_WORKING_DIRECTORY_CHANGED"
    ? "adapter_working_directory_changed"
    : "adapter_failed";
  if (!terminalSent) await send({ type: "error", classification }).catch(() => {});
}
// Deliberately remain alive. The parent must tear down the complete process
// tree before it is allowed to resolve or reject the adapter promise.
`;

function normalizeTraceLimits(overrides = {}) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) throw new TypeError("traceLimits must be an object");
  const result = { ...DEFAULT_ADAPTER_TRACE_LIMITS };
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(result, key)) throw new TypeError(`unsupported adapter trace limit: ${key}`);
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`traceLimits.${key} must be a positive safe integer`);
    result[key] = value;
  }
  return Object.freeze(result);
}

function containedAdapterEnvironment(source = process.env) {
  const environment = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "string") continue;
    const upper = key.toUpperCase();
    if (/^(NODE_|LD_|DYLD_|COMPLUS_|CORECLR_|COR_)/u.test(upper)
      || [
        "ELECTRON_RUN_AS_NODE",
        "DOTNET_STARTUP_HOOKS",
        "OPENCODE_QUALITY_CGROUP_ROOT",
        "OPENCODE_QUALITY_CGROUP_ATTACH_MODE",
        "OPENCODE_QUALITY_CGROUP_ATTACH_HELPER",
        "OPENCODE_QUALITY_MACOS_CONTROLLER",
        "OPENCODE_QUALITY_MACOS_WORKLOAD_UID",
        "OPENCODE_QUALITY_MACOS_UID_MARKER",
      ].includes(upper)) continue;
    environment[key] = value;
  }
  return Object.freeze(environment);
}

function encodeParentIpcValue(value, maxBytes) {
  let entries = 0;
  const clone = (current, depth) => {
    if (depth > 16) throw Object.assign(new Error("IPC graph is too deep"), { code: "IPC_GRAPH" });
    if (current === null || typeof current === "string" || typeof current === "boolean") return current;
    if (typeof current === "number" && Number.isFinite(current)) return current;
    if (Array.isArray(current)) {
      if (Object.getPrototypeOf(current) !== Array.prototype) throw Object.assign(new Error("IPC array prototype is unsupported"), { code: "IPC_GRAPH" });
      const keys = Reflect.ownKeys(current);
      if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key)))) {
        throw Object.assign(new Error("IPC array has unsupported properties"), { code: "IPC_GRAPH" });
      }
      return current.map((entry, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          throw Object.assign(new Error("IPC sparse or accessor array is unsupported"), { code: "IPC_GRAPH" });
        }
        entries += 1;
        if (entries > 10_000) throw Object.assign(new Error("IPC graph has too many entries"), { code: "IPC_GRAPH" });
        return clone(descriptor.value, depth + 1);
      });
    }
    if (typeof current === "object") {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) throw Object.assign(new Error("IPC object prototype is unsupported"), { code: "IPC_GRAPH" });
      const result = Object.create(null);
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key !== "string") throw Object.assign(new Error("IPC symbol keys are unsupported"), { code: "IPC_GRAPH" });
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          throw Object.assign(new Error("IPC accessors are unsupported"), { code: "IPC_GRAPH" });
        }
        entries += 1;
        if (entries > 10_000) throw Object.assign(new Error("IPC graph has too many entries"), { code: "IPC_GRAPH" });
        Object.defineProperty(result, key, {
          value: clone(descriptor.value, depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return result;
    }
    throw Object.assign(new Error("IPC value is not plain JSON"), { code: "IPC_GRAPH" });
  };
  const text = JSON.stringify(clone(value, 0));
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > maxBytes) throw Object.assign(new Error("IPC response exceeds its byte quota"), { code: "IPC_BYTES" });
  return { text, bytes };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function comparablePath(value) {
  let normalized = path.normalize(value);
  if (process.platform === "win32" && normalized.startsWith("\\\\?\\UNC\\")) {
    normalized = `\\\\${normalized.slice(8)}`;
  } else if (process.platform === "win32" && normalized.startsWith("\\\\?\\")) {
    normalized = normalized.slice(4);
  }
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function captureWorkingDirectoryIdentity(value) {
  const stat = fs.lstatSync(value, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("not an ordinary directory");
  const real = fs.realpathSync.native(value);
  if (comparablePath(real) !== comparablePath(value)) throw new Error("realpath alias");
  return Object.freeze({
    canonical_path: comparablePath(real),
    device: stat.dev.toString(10),
    inode: stat.ino.toString(10),
    mode: stat.mode.toString(10),
    links: stat.nlink.toString(10),
    modified_ns: stat.mtimeNs.toString(10),
    changed_ns: stat.ctimeNs.toString(10),
  });
}

function assertWorkingDirectoryIdentityCurrent(value, expected) {
  try {
    if (JSON.stringify(captureWorkingDirectoryIdentity(value)) !== JSON.stringify(expected)) {
      throw new Error("working directory identity mismatch");
    }
  } catch {
    throw new AdapterExecutionError("adapter_working_directory_changed");
  }
}

function validateWorkingDirectory(value) {
  if (value === undefined) return undefined;
  try {
    if (typeof value !== "string" || value.length === 0 || !path.isAbsolute(value)) throw new Error("not absolute");
    if (path.normalize(value) !== value || path.resolve(value) !== value) throw new Error("path alias");
    return Object.freeze({ path: value, identity: captureWorkingDirectoryIdentity(value) });
  } catch {
    throw new AdapterExecutionError("adapter_working_directory_invalid");
  }
}

function defaultProcessFactory(input) {
  if (input.cwd !== undefined) {
    assertWorkingDirectoryIdentityCurrent(input.cwd, input.workingDirectoryIdentity);
  }
  return spawn(process.execPath, ["--input-type=module", "--eval", CHILD_SOURCE], {
    cwd: input.cwd,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    detached: process.platform !== "win32",
    windowsHide: true,
    serialization: "advanced",
    env: sanitizedNodeBootstrapEnvironment(process.env),
  });
}

export function runAdapterModule({
  adapterUrl,
  context,
  timeout,
  onTrace,
  workingDirectory,
  traceLimits: traceLimitOverrides = {},
  abortGraceMs = 5,
  teardownGraceMs = 50,
  teardownConfirmationMs = 2000,
  containmentSetupTimeoutMs = DEFAULT_CONTAINMENT_SETUP_TIMEOUT_MS,
  processFactory = defaultProcessFactory,
  processContainmentFactory = null,
  treeTeardown = terminateProcessTree,
} = {}) {
  const timeoutMs = Math.max(1, Number(timeout) || 1);
  const traceLimits = normalizeTraceLimits(traceLimitOverrides);
  const runtimeEnvironment = containedAdapterEnvironment(process.env);
  let validatedWorkingDirectory;
  try {
    validatedWorkingDirectory = validateWorkingDirectory(workingDirectory);
  } catch (error) {
    return Promise.reject(error);
  }
  for (const [label, value] of Object.entries({ abortGraceMs, teardownGraceMs, teardownConfirmationMs })) {
    if (!Number.isFinite(value) || value < 0 || value > 30_000) throw new TypeError(`${label} must be between 0 and 30000`);
  }
  if (!Number.isSafeInteger(containmentSetupTimeoutMs)
    || containmentSetupTimeoutMs < 1 || containmentSetupTimeoutMs > MAX_CONTAINMENT_SETUP_TIMEOUT_MS) {
    throw new TypeError(`containmentSetupTimeoutMs must be between 1 and ${MAX_CONTAINMENT_SETUP_TIMEOUT_MS}`);
  }

  return new Promise((resolve, reject) => {
    let child;
    let postSpawnWorkingDirectoryError = null;
    try {
      const processInput = validatedWorkingDirectory === undefined
        ? { adapterUrl, context, workingDirectoryIdentity: null }
        : {
          adapterUrl,
          context,
          cwd: validatedWorkingDirectory.path,
          workingDirectoryIdentity: validatedWorkingDirectory.identity,
        };
      child = processFactory(processInput);
      if (validatedWorkingDirectory !== undefined) {
        try {
          assertWorkingDirectoryIdentityCurrent(
            validatedWorkingDirectory.path,
            validatedWorkingDirectory.identity,
          );
        } catch (error) {
          postSpawnWorkingDirectoryError = error;
        }
      }
    } catch (error) {
      reject(error instanceof AdapterExecutionError
        ? error
        : new AdapterExecutionError("adapter_process_spawn_failed"));
      return;
    }
    const state = { exited: false, closed: false, spawnFailed: false };
    const containmentFactory = processContainmentFactory
      ?? (processFactory === defaultProcessFactory
        ? prepareProcessContainment
        : () => Promise.resolve(null));
    let containment = null;
    let containmentFailed = false;
    let containmentError = null;
    const containmentAbortController = new AbortController();
    const rawContainmentPromise = Promise.resolve().then(() => containmentFactory(
      child,
      teardownConfirmationMs,
      { signal: containmentAbortController.signal },
    ));
    observeLateProcessContainment(
      rawContainmentPromise,
      containmentAbortController.signal,
      teardownConfirmationMs,
    );
    let containmentSetupTimer;
    const containmentPromise = Promise.race([
      rawContainmentPromise,
      new Promise((_, rejectSetup) => {
        containmentSetupTimer = setTimeout(() => {
          containmentAbortController.abort();
          rejectSetup(new AdapterExecutionError("adapter_process_containment_timeout"));
        }, containmentSetupTimeoutMs);
      }),
    ]).finally(() => clearTimeout(containmentSetupTimer));
    let finishStarted = false;
    let acceptingTrace = true;
    let terminalQueued = false;
    let traceChain = Promise.resolve();
    let traceRequests = 0;
    let traceBytes = 0;
    let traceResponseBytes = 0;
    let queuedRequests = 0;
    let timer;

    const settleAfterTeardown = async (outcome, { abort = false } = {}) => {
      if (finishStarted) return;
      finishStarted = true;
      acceptingTrace = false;
      clearTimeout(timer);
      clearTimeout(containmentSetupTimer);
      if (abort) containmentAbortController.abort();
      try {
        containment = await containmentPromise;
      } catch (error) {
        containmentFailed = error?.classification !== "process_containment_aborted";
        containmentError = error;
      }
      try {
        child.send?.({ type: abort ? "abort" : "shutdown" });
      } catch {
        // Teardown verification below decides whether settlement is safe.
      }
      if (abort && abortGraceMs > 0) await delay(abortGraceMs);
      let verified = false;
      try {
        verified = await treeTeardown(child, state, {
          graceMs: teardownGraceMs,
          confirmationMs: teardownConfirmationMs,
          containment,
        });
      } catch {
        verified = false;
      }
      if (!verified || containmentFailed) {
        if (containment !== null) {
          try { await containment.close(teardownConfirmationMs); } catch { /* containment failure remains authoritative */ }
        }
        releaseUnverifiedChild(child);
        await waitForProcessClose(child, state, teardownConfirmationMs);
        reject((containmentFailed ? containmentError : null) ?? new AdapterExecutionError("adapter_teardown_unverified"));
      } else if (outcome.ok) {
        resolve(outcome.value);
      } else {
        reject(outcome.error);
      }
    };

    const failTraceQuota = () => {
      void settleAfterTeardown({ ok: false, error: new AdapterExecutionError("adapter_trace_quota_exceeded") }, { abort: true });
    };

    const finishAfterQueuedTrace = (outcome) => {
      if (finishStarted || terminalQueued) return;
      terminalQueued = true;
      acceptingTrace = false;
      void traceChain.then(
        () => settleAfterTeardown(outcome),
        () => settleAfterTeardown({ ok: false, error: new AdapterExecutionError("adapter_trace_failed") }, { abort: true }),
      );
    };

    child.on("message", (message) => {
      if (message?.type === "trace_request") {
        if (!acceptingTrace || finishStarted) return;
        let payloadBytes;
        let envelope;
        try {
          if (typeof message.payload_json !== "string") throw new TypeError("trace payload must be JSON text");
          payloadBytes = Buffer.byteLength(message.payload_json, "utf8");
          if (payloadBytes > traceLimits.payloadBytes) throw new RangeError("trace payload exceeds quota");
          envelope = JSON.parse(message.payload_json);
          if (
            !envelope
            || typeof envelope !== "object"
            || Array.isArray(envelope)
            || typeof envelope.operation !== "string"
            || !Object.hasOwn(envelope, "payload")
            || Object.keys(envelope).length !== 2
          ) throw new TypeError("trace envelope is invalid");
        } catch {
          failTraceQuota();
          return;
        }
        traceRequests += 1;
        traceBytes += payloadBytes;
        queuedRequests += 1;
        if (
          traceRequests > traceLimits.requests
          || payloadBytes > traceLimits.payloadBytes
          || traceBytes > traceLimits.totalBytes
          || traceBytes + traceResponseBytes > traceLimits.totalBidirectionalBytes
          || queuedRequests > traceLimits.queuedRequests
        ) {
          failTraceQuota();
          return;
        }
        traceChain = traceChain.then(async () => {
          if (finishStarted) return;
          try {
            const value = await onTrace?.(envelope.operation, envelope.payload);
            const encoded = encodeParentIpcValue(value ?? null, traceLimits.responseBytes);
            traceResponseBytes += encoded.bytes;
            if (
              traceResponseBytes > traceLimits.totalResponseBytes
              || traceBytes + traceResponseBytes > traceLimits.totalBidirectionalBytes
            ) {
              throw Object.assign(new Error("IPC response aggregate quota exceeded"), { code: "IPC_BYTES" });
            }
            if (!finishStarted && child.connected) child.send({
              type: "trace_result",
              request_id: message.request_id,
              ok: true,
              value_json: encoded.text,
            });
          } catch (error) {
            if (error?.code === "IPC_BYTES" || error?.code === "IPC_GRAPH") {
              failTraceQuota();
              return;
            }
            if (!finishStarted && child.connected) child.send({
              type: "trace_result",
              request_id: message.request_id,
              ok: false,
              error_code: error?.code ?? "TRACE_REJECTED",
            });
          } finally {
            queuedRequests -= 1;
          }
        });
        return;
      }
      if (message?.type === "result") {
        let resultBytes;
        let result;
        try {
          if (typeof message.result_json !== "string") throw new TypeError("adapter result must be JSON text");
          resultBytes = Buffer.byteLength(message.result_json, "utf8");
          if (resultBytes > traceLimits.resultBytes) throw new RangeError("adapter result exceeds quota");
          result = JSON.parse(message.result_json);
        } catch {
          resultBytes = Number.POSITIVE_INFINITY;
        }
        if (resultBytes > traceLimits.resultBytes) {
          finishAfterQueuedTrace({ ok: false, error: new AdapterExecutionError("adapter_result_quota_exceeded") });
        } else {
          finishAfterQueuedTrace({ ok: true, value: result });
        }
      } else if (message?.type === "error") {
        const error = new AdapterExecutionError(message.classification);
        if (message.classification === "adapter_trace_quota_exceeded") {
          void settleAfterTeardown({ ok: false, error }, { abort: true });
        } else {
          finishAfterQueuedTrace({ ok: false, error });
        }
      }
    });
    child.once("error", () => {
      state.spawnFailed = !Number.isInteger(child.pid);
      const classification = state.spawnFailed ? "adapter_process_spawn_failed" : "adapter_process_failed";
      if (!finishStarted) void settleAfterTeardown({ ok: false, error: new AdapterExecutionError(classification) }, { abort: true });
    });
    child.once("exit", () => {
      state.exited = true;
      if (!finishStarted) void settleAfterTeardown({ ok: false, error: new AdapterExecutionError("adapter_process_exited") }, { abort: true });
    });
    child.once("close", () => { state.closed = true; });

    if (postSpawnWorkingDirectoryError !== null) {
      void settleAfterTeardown({ ok: false, error: postSpawnWorkingDirectoryError }, { abort: true });
      return;
    }
    void containmentPromise.then((preparedContainment) => {
      containment = preparedContainment;
      if (finishStarted) return;
      if (validatedWorkingDirectory !== undefined) {
        try {
          assertWorkingDirectoryIdentityCurrent(
            validatedWorkingDirectory.path,
            validatedWorkingDirectory.identity,
          );
        } catch (error) {
          void settleAfterTeardown({ ok: false, error }, { abort: true });
          return;
        }
      }
      timer = setTimeout(() => {
        void settleAfterTeardown({ ok: false, error: new AdapterTimeoutError(timeoutMs) }, { abort: true });
      }, timeoutMs);
      try {
        child.send({
          type: "initialize",
          input: {
            adapterUrl,
            context,
            traceLimits,
            environment: runtimeEnvironment,
            workingDirectoryIdentity: validatedWorkingDirectory?.identity ?? null,
          },
        });
      } catch {
        void settleAfterTeardown({
          ok: false,
          error: new AdapterExecutionError("adapter_process_initialization_failed"),
        }, { abort: true });
      }
    }, (error) => {
      containmentFailed = true;
      containmentError = error;
      void settleAfterTeardown({ ok: false, error: new AdapterExecutionError("adapter_process_containment_failed") }, { abort: true });
    });
  });
}

export function adapterWorkerRequestId() {
  return randomUUID();
}
