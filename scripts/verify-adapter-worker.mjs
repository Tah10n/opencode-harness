import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  AdapterExecutionError,
  AdapterTimeoutError,
  runAdapterModule,
} from "../lib/feedback/adapter-worker.mjs";
import {
  ProcessTreeTeardownError,
  runManagedCommand,
} from "../lib/feedback/process-tree.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-adapter-worker-"));
const adapterUrl = (file) => pathToFileURL(file).href;
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

try {
  const adapter = path.join(tmp, "adapter.mjs");
  fs.writeFileSync(adapter, `export async function runScenario(context) {
  await context.trace.emit({ summary: "safe" });
  return { passed: true };
}
`, "utf8");
  const operations = [];
  const result = await runAdapterModule({
    adapterUrl: adapterUrl(adapter),
    context: { scenario: { id: "runner-self-test" }, repo: tmp },
    timeout: 2000,
    onTrace: (operation, payload) => { operations.push({ operation, payload }); return { accepted: true }; },
  });
  assert.equal(result.passed, true);
  assert.deepEqual(operations, [{ operation: "emit", payload: { summary: "safe" } }]);

  const commandResult = await runManagedCommand({
    file: process.execPath,
    args: ["-e", "process.stdout.write('managed')"],
    cwd: tmp,
    timeout: 2000,
  });
  assert.equal(commandResult.status, 0);
  assert.equal(commandResult.stdout_chars, 7);
  assert.equal(commandResult.teardown_verified, true);

  const commandDescendantMarker = path.join(tmp, "command-descendant-late-marker.txt");
  const commandDescendantScript = `const {spawn}=require("node:child_process"); const child=${JSON.stringify(`setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(commandDescendantMarker)}, "late"), 700); setInterval(() => {}, 60000);`)}; spawn(process.execPath,["-e",child],{stdio:"ignore",windowsHide:true}); setInterval(() => {}, 60000);`;
  const timedCommand = await runManagedCommand({
    file: process.execPath,
    args: ["-e", commandDescendantScript],
    cwd: tmp,
    timeout: 50,
  });
  assert.equal(timedCommand.timed_out, true);
  assert.equal(timedCommand.teardown_verified, true);
  await pause(800);
  assert.equal(fs.existsSync(commandDescendantMarker), false, "ordinary command descendant survived timeout teardown");

  const hanging = path.join(tmp, "hanging.mjs");
  const marker = path.join(tmp, "late-marker.txt");
  fs.writeFileSync(hanging, `import fs from "node:fs";
export async function runScenario() {
  setTimeout(() => fs.writeFileSync(${JSON.stringify(marker)}, "late"), 500);
  await new Promise(() => {});
}
`, "utf8");
  await assert.rejects(
    runAdapterModule({ adapterUrl: adapterUrl(hanging), context: {}, timeout: 20 }),
    (error) => error instanceof AdapterTimeoutError,
  );
  await pause(600);
  assert.equal(fs.existsSync(marker), false);

  const descendantMarker = path.join(tmp, "descendant-late-marker.txt");
  const descendantScript = `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(descendantMarker)}, "late"), 800); setInterval(() => {}, 60000);`;
  const descendant = path.join(tmp, "descendant.mjs");
  fs.writeFileSync(descendant, `import { spawn } from "node:child_process";
export async function runScenario() {
  spawn(process.execPath, ["-e", ${JSON.stringify(descendantScript)}], { stdio: "ignore", windowsHide: true });
  await new Promise(() => {});
}
`, "utf8");
  await assert.rejects(
    runAdapterModule({ adapterUrl: adapterUrl(descendant), context: {}, timeout: 50 }),
    (error) => error instanceof AdapterTimeoutError,
  );
  await pause(900);
  assert.equal(fs.existsSync(descendantMarker), false, "ordinary descendant survived timeout teardown");

  const normalDescendantMarker = path.join(tmp, "normal-descendant-late-marker.txt");
  const normalDescendantScript = `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(normalDescendantMarker)}, "late"), 800); setInterval(() => {}, 60000);`;
  const normalDescendant = path.join(tmp, "normal-descendant.mjs");
  fs.writeFileSync(normalDescendant, `import { spawn } from "node:child_process";
export async function runScenario() {
  spawn(process.execPath, ["-e", ${JSON.stringify(normalDescendantScript)}], { stdio: "ignore", windowsHide: true });
  return { passed: true, cleanup: "confirmed" };
}
`, "utf8");
  const normalDescendantResult = await runAdapterModule({ adapterUrl: adapterUrl(normalDescendant), context: {}, timeout: 2000 });
  assert.equal(normalDescendantResult.cleanup, "confirmed");
  await pause(900);
  assert.equal(fs.existsSync(normalDescendantMarker), false, "ordinary descendant survived normal-result teardown");

  const stalledTrace = path.join(tmp, "stalled-trace.mjs");
  fs.writeFileSync(stalledTrace, `export async function runScenario(context) {
  await context.trace.emit({ sequence: 1 });
  return { passed: true };
}
`, "utf8");
  const stalledStartedAt = Date.now();
  await assert.rejects(
    runAdapterModule({
      adapterUrl: adapterUrl(stalledTrace),
      context: {},
      timeout: 100,
      onTrace: () => new Promise(() => {}),
    }),
    (error) => error instanceof AdapterTimeoutError,
  );
  assert(Date.now() - stalledStartedAt < 2500, "stalled trace callback exceeded the bounded deadline");

  const queuedTrace = path.join(tmp, "queued-trace.mjs");
  fs.writeFileSync(queuedTrace, `export async function runScenario(context) {
  const first = context.trace.emit({ sequence: 1 });
  const second = context.trace.emit({ sequence: 2 });
  await Promise.all([first, second]);
  return { passed: true };
}
`, "utf8");
  const startedOperations = [];
  let releaseFirst;
  await assert.rejects(
    runAdapterModule({
      adapterUrl: adapterUrl(queuedTrace),
      context: {},
      timeout: 100,
      onTrace: (_operation, payload) => {
        startedOperations.push(payload.sequence);
        if (payload.sequence === 1) return new Promise((resolve) => { releaseFirst = resolve; });
        return { accepted: true };
      },
    }),
    (error) => error instanceof AdapterTimeoutError,
  );
  assert.deepEqual(startedOperations, [1], "queued trace work started before the stalled callback completed");
  releaseFirst?.({ accepted: true });
  await pause(25);
  assert.deepEqual(startedOperations, [1], "queued trace work started after timeout settlement");

  const earlyResult = path.join(tmp, "early-result.mjs");
  fs.writeFileSync(earlyResult, `export async function runScenario(context) {
  void context.trace.emit({ sequence: 1 });
  return { passed: true };
}
`, "utf8");
  await assert.rejects(
    runAdapterModule({ adapterUrl: adapterUrl(earlyResult), context: {}, timeout: 100, onTrace: () => new Promise(() => {}) }),
    (error) => error instanceof AdapterTimeoutError,
  );

  const quotaBoundaryAdapter = path.join(tmp, "quota-boundary.mjs");
  fs.writeFileSync(quotaBoundaryAdapter, `export async function runScenario(context) {
  await context.trace.emit({ sequence: 1 });
  await context.trace.emit({ sequence: 2 });
  return { passed: true };
}
`, "utf8");
  const quotaBoundary = await runAdapterModule({
    adapterUrl: adapterUrl(quotaBoundaryAdapter),
    context: {},
    timeout: 2000,
    traceLimits: { requests: 2, queuedRequests: 2 },
    onTrace: () => ({ accepted: true }),
  });
  assert.equal(quotaBoundary.passed, true);

  const quotaOverflowAdapter = path.join(tmp, "quota-overflow.mjs");
  fs.writeFileSync(quotaOverflowAdapter, `export async function runScenario(context) {
  await context.trace.emit({ sequence: 1 });
  await context.trace.emit({ sequence: 2 });
  await context.trace.emit({ sequence: 3 });
  return { passed: true };
}
`, "utf8");
  await assert.rejects(runAdapterModule({
    adapterUrl: adapterUrl(quotaOverflowAdapter),
    context: {},
    timeout: 2000,
    traceLimits: { requests: 2 },
    onTrace: () => ({ accepted: true }),
  }), (error) => error instanceof AdapterExecutionError && error.classification === "adapter_trace_quota_exceeded");

  const oversizedResultAdapter = path.join(tmp, "quota-result.mjs");
  fs.writeFileSync(oversizedResultAdapter, `export async function runScenario() {
  return { passed: true, ignored: "${"x".repeat(1024)}" };
}
`, "utf8");
  await assert.rejects(runAdapterModule({
    adapterUrl: adapterUrl(oversizedResultAdapter),
    context: {},
    timeout: 2000,
    traceLimits: { resultBytes: 64 },
  }), (error) => error instanceof AdapterExecutionError && error.classification === "adapter_result_quota_exceeded");

  const mapResultAdapter = path.join(tmp, "non-plain-map-result.mjs");
  fs.writeFileSync(mapResultAdapter, `export async function runScenario() {
  return { passed: true, ignored: new Map([["large", "x".repeat(1024 * 1024)]]) };
}
`, "utf8");
  await assert.rejects(runAdapterModule({
    adapterUrl: adapterUrl(mapResultAdapter),
    context: {},
    timeout: 2000,
    traceLimits: { resultBytes: 64 },
  }), (error) => error instanceof AdapterExecutionError && error.classification === "adapter_result_not_cloneable");

  const arrayBufferResultAdapter = path.join(tmp, "non-plain-array-buffer-result.mjs");
  fs.writeFileSync(arrayBufferResultAdapter, `export async function runScenario() {
  return { passed: true, ignored: new ArrayBuffer(1024 * 1024) };
}
`, "utf8");
  await assert.rejects(runAdapterModule({
    adapterUrl: adapterUrl(arrayBufferResultAdapter),
    context: {},
    timeout: 2000,
  }), (error) => error instanceof AdapterExecutionError && error.classification === "adapter_result_not_cloneable");

  const setTraceAdapter = path.join(tmp, "non-plain-set-trace.mjs");
  fs.writeFileSync(setTraceAdapter, `export async function runScenario(context) {
  await context.trace.emit({ values: new Set(["hidden-allocation"]) });
  return { passed: true };
}
`, "utf8");
  await assert.rejects(runAdapterModule({
    adapterUrl: adapterUrl(setTraceAdapter),
    context: {},
    timeout: 2000,
    onTrace: () => ({ accepted: true }),
  }), (error) => error instanceof AdapterExecutionError && error.classification === "adapter_trace_quota_exceeded");

  const floodAdapter = path.join(tmp, "quota-flood.mjs");
  fs.writeFileSync(floodAdapter, `export async function runScenario(context) {
  await Promise.all(Array.from({ length: 50 }, (_, sequence) => context.trace.emit({ sequence })));
  return { passed: true };
}
`, "utf8");
  await assert.rejects(runAdapterModule({
    adapterUrl: adapterUrl(floodAdapter),
    context: {},
    timeout: 2000,
    traceLimits: { requests: 100, queuedRequests: 3 },
    onTrace: () => new Promise(() => {}),
  }), (error) => error instanceof AdapterExecutionError && error.classification === "adapter_trace_quota_exceeded");

  const payloadAdapter = path.join(tmp, "quota-payload.mjs");
  fs.writeFileSync(payloadAdapter, `export async function runScenario(context) {
  await context.trace.emit({ summary: "${"x".repeat(200)}" });
  return { passed: true };
}
`, "utf8");
  await assert.rejects(runAdapterModule({
    adapterUrl: adapterUrl(payloadAdapter),
    context: {},
    timeout: 2000,
    traceLimits: { payloadBytes: 64 },
    onTrace: () => ({ accepted: true }),
  }), (error) => error instanceof AdapterExecutionError && error.classification === "adapter_trace_quota_exceeded");
  await assert.rejects(runAdapterModule({
    adapterUrl: adapterUrl(quotaBoundaryAdapter),
    context: {},
    timeout: 2000,
    traceLimits: { totalBytes: 70 },
    onTrace: () => ({ accepted: true }),
  }), (error) => error instanceof AdapterExecutionError && error.classification === "adapter_trace_quota_exceeded");

  const unverifiedAdapter = path.join(tmp, "unverified-teardown.mjs");
  const unverifiedMarker = path.join(tmp, "unverified-teardown-marker.txt");
  fs.writeFileSync(unverifiedAdapter, `import fs from "node:fs";
export async function runScenario() {
  setTimeout(() => fs.writeFileSync(${JSON.stringify(unverifiedMarker)}, "late"), 500);
  await new Promise(() => {});
}
`, "utf8");
  const unverifiedStartedAt = Date.now();
  await assert.rejects(runAdapterModule({
    adapterUrl: adapterUrl(unverifiedAdapter),
    context: {},
    timeout: 20,
    onTrace: () => ({ accepted: true }),
    treeTeardown: async () => false,
  }), (error) => error instanceof AdapterExecutionError && error.classification === "adapter_teardown_unverified");
  assert(Date.now() - unverifiedStartedAt < 1000, "unverified adapter teardown did not reject within the bounded deadline");
  await pause(600);
  assert.equal(fs.existsSync(unverifiedMarker), false, "parent-owned IPC release left the unverified adapter worker running");

  await assert.rejects(runManagedCommand({
    file: process.execPath,
    args: ["-e", ""],
    cwd: tmp,
    timeout: 2000,
    treeTeardown: async () => false,
  }), (error) => error instanceof ProcessTreeTeardownError);

  console.log("Adapter process self-tests passed (managed commands, tree teardown, timeout, trace quotas, queued trace, and teardown failure)." );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
