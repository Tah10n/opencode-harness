import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { releaseUnverifiedChild, terminateProcessTree } from "./process-tree.mjs";

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
  resultBytes: 64 * 1024,
});

const CHILD_SOURCE = String.raw`
const pending = new Map();
let nextId = 0;
let terminalSent = false;
let traceDisabled = false;
let traceRequests = 0;
let traceBytes = 0;
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

function traceFacade() {
  const request = (operation, payload) => new Promise((resolve, reject) => {
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
  return Object.freeze({
    emit: (event) => request("emit", event),
    recordContextReceipt: (receipt) => request("record_context_receipt", receipt),
    jobs: Object.freeze({
      create: (job) => request("job_create", job),
      transition: (job) => request("job_transition", job),
      complete: (job) => request("job_complete", job),
    }),
  });
}

process.on("message", (message) => {
  if (message?.type === "trace_result") {
    const request = pending.get(message.request_id);
    if (!request) return;
    pending.delete(message.request_id);
    if (message.ok) {
      try {
        request.resolve(JSON.parse(message.value_json));
      } catch {
        request.reject(new Error("trace operation returned an invalid IPC value"));
      }
    }
    else request.reject(new Error("trace operation rejected: " + (message.error_code ?? "TRACE_REJECTED")));
  } else if (message?.type === "abort" || message?.type === "shutdown") {
    controller.abort();
    void send({ type: "teardown_ack" }).catch(() => {});
  } else if (message?.type === "initialize") {
    traceLimits = message.input.traceLimits;
    initialize(message.input);
  }
});
process.on("disconnect", () => {
  clearInterval(keepAlive);
  process.exitCode = 1;
});

try {
  const input = await inputReady;
  const adapter = await import(input.adapterUrl);
  if (typeof adapter.runScenario !== "function") {
    terminalSent = true;
    await send({ type: "error", classification: "adapter_export_missing" });
  } else {
    const result = await adapter.runScenario({ ...input.context, signal: controller.signal, trace: traceFacade() });
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
  if (!terminalSent) await send({ type: "error", classification: "adapter_failed" }).catch(() => {});
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

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function defaultProcessFactory(input) {
  return spawn(process.execPath, ["--input-type=module", "--eval", CHILD_SOURCE], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    detached: process.platform !== "win32",
    windowsHide: true,
    serialization: "advanced",
    env: process.env,
  });
}

export function runAdapterModule({
  adapterUrl,
  context,
  timeout,
  onTrace,
  traceLimits: traceLimitOverrides = {},
  abortGraceMs = 5,
  teardownGraceMs = 50,
  teardownConfirmationMs = 2000,
  processFactory = defaultProcessFactory,
  treeTeardown = terminateProcessTree,
} = {}) {
  const timeoutMs = Math.max(1, Number(timeout) || 1);
  const traceLimits = normalizeTraceLimits(traceLimitOverrides);
  for (const [label, value] of Object.entries({ abortGraceMs, teardownGraceMs, teardownConfirmationMs })) {
    if (!Number.isFinite(value) || value < 0 || value > 30_000) throw new TypeError(`${label} must be between 0 and 30000`);
  }

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = processFactory({ adapterUrl, context });
    } catch {
      reject(new AdapterExecutionError("adapter_process_spawn_failed"));
      return;
    }
    const state = { exited: false, spawnFailed: false };
    let finishStarted = false;
    let acceptingTrace = true;
    let terminalQueued = false;
    let traceChain = Promise.resolve();
    let traceRequests = 0;
    let traceBytes = 0;
    let queuedRequests = 0;
    let timer;

    const settleAfterTeardown = async (outcome, { abort = false } = {}) => {
      if (finishStarted) return;
      finishStarted = true;
      acceptingTrace = false;
      clearTimeout(timer);
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
        });
      } catch {
        verified = false;
      }
      if (!verified) {
        releaseUnverifiedChild(child);
        reject(new AdapterExecutionError("adapter_teardown_unverified"));
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
          || queuedRequests > traceLimits.queuedRequests
        ) {
          failTraceQuota();
          return;
        }
        traceChain = traceChain.then(async () => {
          if (finishStarted) return;
          try {
            const value = await onTrace?.(envelope.operation, envelope.payload);
            if (!finishStarted && child.connected) child.send({
              type: "trace_result",
              request_id: message.request_id,
              ok: true,
              value_json: JSON.stringify(value ?? null),
            });
          } catch (error) {
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
      if (!finishStarted) void settleAfterTeardown({ ok: false, error: new AdapterExecutionError("adapter_process_failed") }, { abort: true });
    });
    child.once("exit", () => {
      state.exited = true;
      if (!finishStarted) void settleAfterTeardown({ ok: false, error: new AdapterExecutionError("adapter_process_exited") }, { abort: true });
    });

    timer = setTimeout(() => {
      void settleAfterTeardown({ ok: false, error: new AdapterTimeoutError(timeoutMs) }, { abort: true });
    }, timeoutMs);
    try {
      child.send({ type: "initialize", input: { adapterUrl, context, traceLimits } });
    } catch {
      void settleAfterTeardown({ ok: false, error: new AdapterExecutionError("adapter_process_initialization_failed") }, { abort: true });
    }
  });
}

export function adapterWorkerRequestId() {
  return randomUUID();
}
