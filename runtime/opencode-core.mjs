#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  CORE_CHECK_CATALOG_PATH,
  loadCoreVerificationCatalog,
  snapshotCoreWorkspace,
  verifyCoreWorkspaceMutation,
} from "./core-verification-runtime.mjs";

const CONTAINED_WORKER_SOURCE = String.raw`
import { spawn } from "node:child_process";
let initialized = false;
let child = null;
let terminal = false;
let challenged = false;
const keepAlive = setInterval(() => {}, 60_000);
const send = (message) => { try { process.send?.(message); } catch {} };
const finish = (result) => { if (!terminal) { terminal = true; send({ type: "result", result }); } };
process.once("disconnect", () => { try { child?.kill(); } catch {} clearInterval(keepAlive); process.exit(1); });
process.on("message", (message) => {
  if (message?.type === "containment_challenge") {
    const challenge = message.challenge;
    if (initialized || challenged || typeof challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
      send({ type: "containment_challenge_rejected" });
      return;
    }
    challenged = true;
    send({ type: "containment_challenge_response", challenge });
    return;
  }
  if (message?.type !== "initialize" || initialized) return;
  initialized = true;
  try {
    child = spawn(message.file, message.args, {
      cwd: ".", env: message.env, shell: false, windowsHide: true, stdio: "inherit",
    });
  } catch (error) {
    finish({ status: null, signal: null, error_code: error?.code ?? "PROCESS_SPAWN_FAILED" });
    return;
  }
  child.once("error", (error) => finish({ status: null, signal: null, error_code: error?.code ?? "PROCESS_SPAWN_FAILED" }));
  child.once("exit", (status, signal) => finish({ status, signal, error_code: null }));
});
`;

function waitForClose(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once("close", () => { clearTimeout(timer); resolve(true); });
  });
}

async function defaultProcessContainmentFactory(worker, timeoutMs) {
  const { preparePlatformProcessContainment } = await import("./process-containment.mjs");
  return preparePlatformProcessContainment(worker, timeoutMs);
}

export async function runContainedOpenCode({
  file,
  args,
  cwd,
  env,
  processContainmentFactory = defaultProcessContainmentFactory,
}) {
  const worker = spawn(process.execPath, ["--input-type=module", "--eval", CONTAINED_WORKER_SOURCE], {
    cwd,
    env,
    shell: false,
    windowsHide: true,
    detached: process.platform !== "win32",
    serialization: "advanced",
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });
  let containment;
  try {
    containment = await processContainmentFactory(worker, 10_000);
    const result = await new Promise((resolve, reject) => {
      worker.once("error", reject);
      worker.once("exit", () => reject(new Error("contained OpenCode worker exited before reporting")));
      worker.on("message", (message) => { if (message?.type === "result") resolve(message.result); });
      worker.send({ type: "initialize", file, args, env });
    });
    const terminateAndVerify = containment.terminateAndVerify ?? containment.close;
    const teardownVerified = containment.support_state === "verified"
      && typeof terminateAndVerify === "function"
      && await terminateAndVerify(10_000);
    const workerClosed = await waitForClose(worker, 10_000);
    if (!teardownVerified || !workerClosed || containment.status?.().teardown_verified !== true) {
      throw new Error("OpenCode process-tree teardown is unverified");
    }
    return result;
  } catch (error) {
    try { await containment?.close?.(10_000); } catch {}
    try { worker.disconnect(); } catch {}
    try { process.platform === "win32" ? worker.kill() : process.kill(-worker.pid, "SIGKILL"); } catch {}
    throw error;
  }
}

function parseArguments(values) {
  const separator = values.indexOf("--");
  if (separator === -1 || separator === values.length - 1) {
    throw new Error("usage: opencode-core --workspace PATH [--catalog PATH] [--opencode PATH] -- OPENCODE_ARGS...");
  }
  const options = { workspace: null, catalog: CORE_CHECK_CATALOG_PATH, opencode: "opencode", receiptFd: null };
  for (let index = 0; index < separator; index += 1) {
    const name = values[index];
    if (!["--workspace", "--catalog", "--opencode", "--receipt-fd"].includes(name) || index + 1 >= separator) {
      throw new Error(`invalid launcher option: ${name}`);
    }
    if (name === "--receipt-fd") {
      const descriptor = Number(values[index + 1]);
      if (descriptor !== 3) throw new Error("--receipt-fd is invalid");
      options.receiptFd = descriptor;
    } else options[name.slice(2)] = values[index + 1];
    index += 1;
  }
  if (options.workspace === null) throw new Error("--workspace is required");
  return { ...options, opencodeArgs: values.slice(separator + 1) };
}

async function main() {
try {
  const options = parseArguments(process.argv.slice(2));
  const result = await runCoreLauncher(options);
  if (result.receipt !== null) {
    const receipt = `${JSON.stringify(result.receipt)}\n`;
    if (options.receiptFd === null) process.stderr.write(`[opencode-harness-core] ${receipt}`);
    else fs.writeSync(options.receiptFd, receipt, null, "utf8");
  }
  process.exitCode = result.exit_code;
} catch (error) {
  process.stderr.write(`[opencode-harness-core] ${error.message}\n`);
  process.exitCode = 21;
}
}

export async function runCoreLauncher(options, { processContainmentFactory } = {}) {
  const workspace = path.resolve(options.workspace);
  const catalog = loadCoreVerificationCatalog(workspace, { catalogPath: options.catalog });
  const before = snapshotCoreWorkspace(workspace);
  const child = await runContainedOpenCode({
    file: options.opencode,
    args: options.opencodeArgs,
    cwd: workspace,
    env: options.env ?? process.env,
    ...(processContainmentFactory === undefined ? {} : { processContainmentFactory }),
  });
  if (child.error_code !== null || child.signal !== null || child.status !== 0) {
    return Object.freeze({ exit_code: Number.isSafeInteger(child.status) && child.status !== 0 ? child.status : 21, receipt: null });
  }
  const after = snapshotCoreWorkspace(workspace);
  const verification = verifyCoreWorkspaceMutation({ catalog, before, after });
  const receipt = Object.freeze({ schema_version: 1, catalog_fingerprint: catalog.catalog_fingerprint,
    catalog_status: catalog.catalog_status, decision: verification.decision,
    activation: verification.observation, check: verification.check });
  return Object.freeze({ exit_code: verification.decision.allowed ? 0 : 20, receipt });
}

if (process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
