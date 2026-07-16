import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  normalizeProcessContainmentOptions,
  preparePlatformProcessContainment,
} from "./process-containment.mjs";

export const DEFAULT_CONTAINMENT_SETUP_TIMEOUT_MS = 75_000;
export const MAX_CONTAINMENT_SETUP_TIMEOUT_MS = 90_000;

const TRUSTED_TOOLCHAIN_MODULE_URL = new URL("../quality/trusted-toolchains.mjs", import.meta.url).href;
const PROCESS_TREE_MODULE_URL = import.meta.url;

export class ProcessTreeError extends Error {
  constructor(classification, message = classification, containmentState = null) {
    super(message);
    this.name = "ProcessTreeError";
    this.code = "PROCESS_TREE_ERROR";
    this.classification = classification;
    this.containment_state = containmentState;
  }
}

export class ProcessTreeTeardownError extends ProcessTreeError {
  constructor(containmentState = null) {
    super("process_tree_teardown_unverified", "process tree teardown could not be verified", containmentState);
    this.name = "ProcessTreeTeardownError";
    this.code = "PROCESS_TREE_TEARDOWN_UNVERIFIED";
  }
}

const COMMAND_WORKER_SOURCE = String.raw`
import { spawn } from "node:child_process";
import {
  assertTrustedToolchainCommandBinding,
  assertTrustedToolchainInvocationCurrent,
} from ${JSON.stringify(TRUSTED_TOOLCHAIN_MODULE_URL)};
import { assertInheritedManagedCommandWorkingDirectoryIdentityCurrent } from ${JSON.stringify(PROCESS_TREE_MODULE_URL)};

let initialized = false;
let commandChild = null;
let terminalSent = false;
const keepAlive = setInterval(() => {}, 60_000);

function send(message) {
  if (!process.connected) return;
  try { process.send(message); } catch { /* parent settlement is authoritative */ }
}

function terminateLocalChild() {
  try { commandChild?.kill(); } catch { /* best effort after parent disconnect */ }
}

process.once("disconnect", () => {
  terminateLocalChild();
  clearInterval(keepAlive);
  process.exit(1);
});

process.on("message", (message) => {
  if (message?.type !== "initialize" || initialized) return;
  initialized = true;
  const input = message.input;
  let stdoutChars = 0;
  let stderrChars = 0;
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let outputExceeded = false;
  const finish = (result) => {
    if (terminalSent) return;
    terminalSent = true;
    send({ type: "result", result });
  };
  try {
    if (input.expected_invocation !== null) {
      // These assertions deliberately remain in the already-contained process.
      // Parent/coordinator checks are not accepted as the final executable
      // identity boundary.
      assertTrustedToolchainInvocationCurrent(input.expected_invocation);
      assertTrustedToolchainCommandBinding(input.expected_invocation, input.file, input.args);
    }
    if (input.expected_working_directory_identity !== null) {
      // The worker was created with the verified cwd. Revalidate that inherited
      // directory object last, then let the command inherit it without resolving
      // the attacker-mutable path again.
      assertInheritedManagedCommandWorkingDirectoryIdentityCurrent(
        input.expected_working_directory_identity,
      );
    }
    commandChild = spawn(input.file, input.args, {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: input.env,
    });
    send({ type: "spawned", command_pid: commandChild.pid });
  } catch (error) {
    finish({
      exit_code: null,
      signal: null,
      stdout_chars: 0,
      stderr_chars: 0,
      stdout_bytes: 0,
      stderr_bytes: 0,
      error_code: typeof error?.code === "string" ? error.code : "PROCESS_SPAWN_FAILED",
    });
    return;
  }
  const count = (kind, chunk) => {
    const chars = String(chunk).length;
    const bytes = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk), "utf8");
    if (kind === "stdout") {
      stdoutChars += chars;
      stdoutBytes += bytes;
    } else {
      stderrChars += chars;
      stderrBytes += bytes;
    }
    if (!outputExceeded && stdoutBytes + stderrBytes > input.max_output_chars) {
      outputExceeded = true;
      terminateLocalChild();
    }
  };
  commandChild.stdout?.on("data", (chunk) => count("stdout", chunk));
  commandChild.stderr?.on("data", (chunk) => count("stderr", chunk));
  commandChild.once("error", () => finish({
    exit_code: null,
    signal: null,
    stdout_chars: stdoutChars,
    stderr_chars: stderrChars,
    stdout_bytes: stdoutBytes,
    stderr_bytes: stderrBytes,
    error_code: "PROCESS_EXECUTION_FAILED",
  }));
  commandChild.once("close", (code, signal) => finish({
    exit_code: Number.isInteger(code) ? code : null,
    signal: typeof signal === "string" ? signal : null,
    stdout_chars: stdoutChars,
    stderr_chars: stderrChars,
    stdout_bytes: stdoutBytes,
    stderr_bytes: stderrBytes,
    error_code: outputExceeded ? "PROCESS_OUTPUT_LIMIT" : null,
  }));
});
`;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function waitForProcessClose(child, state, timeoutMs) {
  if (state.closed) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    const onClose = () => {
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("close", onClose);
    };
    child.on("close", onClose);
    if (state.closed) onClose();
  });
}

export function sanitizedNodeBootstrapEnvironment(source = process.env) {
  const environment = {};
  for (const [key, value] of Object.entries(source)) {
    if (/^NODE_/iu.test(key) || key.toUpperCase() === "ELECTRON_RUN_AS_NODE") continue;
    environment[key] = value;
  }
  return environment;
}

const MANAGED_COMMAND_WORKING_DIRECTORY_IDENTITY_KEYS = Object.freeze([
  "canonical_path", "device", "inode", "mode", "links", "modified_ns", "changed_ns",
]);

function comparableWorkingDirectoryPath(value) {
  let normalized = path.normalize(value);
  if (process.platform === "win32" && normalized.startsWith("\\\\?\\UNC\\")) {
    normalized = `\\\\${normalized.slice(8)}`;
  } else if (process.platform === "win32" && normalized.startsWith("\\\\?\\")) {
    normalized = normalized.slice(4);
  }
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function captureManagedCommandWorkingDirectoryIdentity(candidate) {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate)
    || path.normalize(candidate) !== candidate || path.resolve(candidate) !== candidate) {
    throw new TypeError("managed command working directory must be a canonical absolute path");
  }
  const stat = fs.lstatSync(candidate, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("managed command working directory must be an ordinary directory");
  }
  const canonical = fs.realpathSync.native(candidate);
  if (comparableWorkingDirectoryPath(canonical) !== comparableWorkingDirectoryPath(candidate)) {
    throw new Error("managed command working directory cannot be a filesystem alias");
  }
  return Object.freeze({
    canonical_path: comparableWorkingDirectoryPath(canonical),
    device: stat.dev.toString(10),
    inode: stat.ino.toString(10),
    mode: stat.mode.toString(10),
    links: stat.nlink.toString(10),
    modified_ns: stat.mtimeNs.toString(10),
    changed_ns: stat.ctimeNs.toString(10),
  });
}

function validManagedCommandWorkingDirectoryIdentity(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === MANAGED_COMMAND_WORKING_DIRECTORY_IDENTITY_KEYS.length
    && MANAGED_COMMAND_WORKING_DIRECTORY_IDENTITY_KEYS.every((key) => (
      typeof value[key] === "string" && value[key].length > 0
    ));
}

export function assertManagedCommandWorkingDirectoryIdentityCurrent(candidate, expected) {
  try {
    const current = captureManagedCommandWorkingDirectoryIdentity(candidate);
    if (!validManagedCommandWorkingDirectoryIdentity(expected)
      || MANAGED_COMMAND_WORKING_DIRECTORY_IDENTITY_KEYS.some((key) => current[key] !== expected[key])) {
      throw new Error("managed command working directory identity changed");
    }
  } catch {
    throw Object.assign(
      new Error("PROCESS_WORKING_DIRECTORY_CHANGED"),
      { code: "PROCESS_WORKING_DIRECTORY_CHANGED" },
    );
  }
}

export function captureInheritedManagedCommandWorkingDirectoryIdentity() {
  const stat = fs.lstatSync(".", { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("inherited managed command working directory must be an ordinary directory");
  }
  const canonical = fs.realpathSync.native(".");
  return Object.freeze({
    canonical_path: comparableWorkingDirectoryPath(canonical),
    device: stat.dev.toString(10),
    inode: stat.ino.toString(10),
    mode: stat.mode.toString(10),
    links: stat.nlink.toString(10),
    modified_ns: stat.mtimeNs.toString(10),
    changed_ns: stat.ctimeNs.toString(10),
  });
}

export function assertInheritedManagedCommandWorkingDirectoryIdentityCurrent(expected) {
  try {
    const current = captureInheritedManagedCommandWorkingDirectoryIdentity();
    if (!validManagedCommandWorkingDirectoryIdentity(expected)
      || ["device", "inode", "mode"].some((key) => current[key] !== expected[key])) {
      throw new Error("inherited managed command working directory identity changed");
    }
  } catch {
    throw Object.assign(
      new Error("PROCESS_WORKING_DIRECTORY_CHANGED"),
      { code: "PROCESS_WORKING_DIRECTORY_CHANGED" },
    );
  }
}

export function prepareProcessContainment(worker, timeoutMs = 2000, options = {}) {
  return preparePlatformProcessContainment(worker, timeoutMs, options);
}

export function observeLateProcessContainment(rawContainmentPromise, abortSignal, confirmationMs) {
  void Promise.resolve(rawContainmentPromise).then(async (lateContainment) => {
    if (!abortSignal.aborted || typeof lateContainment?.close !== "function") return;
    try {
      await lateContainment.close(confirmationMs);
    } catch {
      // The operation has already failed closed. This observer exists only to
      // prevent a setup result that ignored cancellation from leaking its
      // controller or delegated boundary.
    }
  }, () => {
    // The setup rejection is consumed by the authoritative race below.
  });
}

async function runTaskkill(pid, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let killer;
    let timer;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    let taskkill;
    try {
      const candidate = path.join(path.parse(process.execPath).root, "Windows", "System32", "taskkill.exe");
      taskkill = fs.realpathSync(candidate);
      if (!fs.statSync(taskkill).isFile()) throw new Error("taskkill is not a regular file");
    } catch {
      resolve(false);
      return;
    }
    try {
      killer = spawn(taskkill, ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch {
      resolve(false);
      return;
    }
    timer = setTimeout(() => {
      try { killer.kill(); } catch { /* best effort */ }
      finish(false);
    }, timeoutMs);
    killer.once("error", () => finish(false));
    killer.once("exit", (code) => finish(code === 0));
  });
}

function processGroupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

export async function terminateProcessTree(child, state, {
  graceMs = 50,
  confirmationMs = 2000,
  containment = null,
} = {}) {
  const pid = child?.pid;
  if (!Number.isInteger(pid) || pid <= 0) return state?.spawnFailed === true;
  if (containment !== null) {
    let closed = false;
    try {
      const terminateAndVerify = containment.terminateAndVerify ?? containment.close;
      closed = containment.support_state === "verified"
        && typeof terminateAndVerify === "function"
        && await terminateAndVerify(confirmationMs);
    } catch {
      closed = false;
    }
    const processClosed = await waitForProcessClose(child, state, confirmationMs);
    if (!closed || !processClosed || containment.status?.().teardown_verified !== true) {
      state.containmentFailure = containment.status?.() ?? null;
      return false;
    }
    return true;
  }
  if (process.platform === "win32") {
    // This is cleanup-only. Taskkill cannot establish the Job Object identity
    // required for verified containment and therefore never upgrades evidence.
    if (state?.exited) return false;
    await runTaskkill(pid, confirmationMs);
    await waitForProcessClose(child, state, confirmationMs);
    return false;
  }

  // Process groups cannot contain reparented or double-forked descendants.
  // Keep this path only as bounded cleanup after containment setup failed.
  try {
    process.kill(-pid, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") return false;
  }
  await delay(graceMs);
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") return false;
  }
  await waitForProcessClose(child, state, confirmationMs);
  const deadline = Date.now() + confirmationMs;
  while (processGroupExists(pid) && Date.now() < deadline) await delay(10);
  return false;
}

export function releaseUnverifiedChild(child) {
  // This is only a bounded handle-release fallback. It never upgrades an
  // unverified tree into verified evidence and callers must still fail closed.
  try { child?.disconnect?.(); } catch { /* best effort */ }
  try { child?.kill?.(); } catch { /* best effort */ }
  try { child?.channel?.unref?.(); } catch { /* best effort */ }
  try { child?.unref?.(); } catch { /* best effort */ }
}

function defaultCommandProcessFactory(input) {
  if (input.expectedWorkingDirectoryIdentity !== null) {
    assertManagedCommandWorkingDirectoryIdentityCurrent(
      input.cwd,
      input.expectedWorkingDirectoryIdentity,
    );
  }
  return spawn(process.execPath, ["--input-type=module", "--eval", COMMAND_WORKER_SOURCE], {
    cwd: input.cwd,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    detached: process.platform !== "win32",
    windowsHide: true,
    serialization: "advanced",
    env: sanitizedNodeBootstrapEnvironment(process.env),
  });
}

export function runManagedCommand({
  file,
  args = [],
  cwd,
  env = process.env,
  timeout,
  maxOutputChars = 1024 * 1024,
  teardownGraceMs = 50,
  teardownConfirmationMs = 2000,
  containmentSetupTimeoutMs = DEFAULT_CONTAINMENT_SETUP_TIMEOUT_MS,
  processFactory = defaultCommandProcessFactory,
  processContainmentFactory = null,
  containmentOptions = {},
  treeTeardown = terminateProcessTree,
  beforeCommandStart = null,
  expectedInvocation = null,
  expectedWorkingDirectoryIdentity = null,
} = {}) {
  if (typeof file !== "string" || file.length === 0) throw new TypeError("file must be a non-empty string");
  if (!Array.isArray(args) || args.some((entry) => typeof entry !== "string")) throw new TypeError("args must be an array of strings");
  if (env === null || typeof env !== "object" || Array.isArray(env)
    || Object.values(env).some((entry) => typeof entry !== "string")) {
    throw new TypeError("env must be an object containing only string values");
  }
  const timeoutMs = Math.max(1, Number(timeout) || 1);
  if (!Number.isSafeInteger(maxOutputChars) || maxOutputChars < 1) throw new TypeError("maxOutputChars must be a positive safe integer");
  if (!Number.isSafeInteger(containmentSetupTimeoutMs)
    || containmentSetupTimeoutMs < 1 || containmentSetupTimeoutMs > MAX_CONTAINMENT_SETUP_TIMEOUT_MS) {
    throw new TypeError(`containmentSetupTimeoutMs must be between 1 and ${MAX_CONTAINMENT_SETUP_TIMEOUT_MS}`);
  }
  if (beforeCommandStart !== null && typeof beforeCommandStart !== "function") {
    throw new TypeError("beforeCommandStart must be a function or null");
  }
  if (expectedInvocation !== null && (typeof expectedInvocation !== "object" || Array.isArray(expectedInvocation))) {
    throw new TypeError("expectedInvocation must be an object or null");
  }
  if (expectedWorkingDirectoryIdentity !== null
    && !validManagedCommandWorkingDirectoryIdentity(expectedWorkingDirectoryIdentity)) {
    throw new TypeError("expectedWorkingDirectoryIdentity must be a working-directory identity or null");
  }
  const normalizedContainmentOptions = normalizeProcessContainmentOptions(containmentOptions);

  return new Promise((resolve, reject) => {
    let child;
    try {
      if (expectedWorkingDirectoryIdentity !== null) {
        assertManagedCommandWorkingDirectoryIdentityCurrent(cwd, expectedWorkingDirectoryIdentity);
      }
      child = processFactory({
        file,
        args,
        cwd,
        env,
        expectedWorkingDirectoryIdentity,
      });
    } catch (error) {
      reject(new ProcessTreeError(
        error?.code === "PROCESS_WORKING_DIRECTORY_CHANGED"
          ? "process_working_directory_changed"
          : "process_spawn_failed",
      ));
      return;
    }
    const state = { exited: false, closed: false, spawnFailed: false };
    const containmentFactory = processContainmentFactory
      ?? (processFactory === defaultCommandProcessFactory
        ? prepareProcessContainment
        : () => Promise.resolve(null));
    let containment = null;
    let containmentFailed = false;
    let containmentError = null;
    let settlementStarted = false;
    let timer;
    const containmentAbortController = new AbortController();
    const rawContainmentPromise = Promise.resolve().then(() => containmentFactory(
      child,
      teardownConfirmationMs,
      { ...normalizedContainmentOptions, signal: containmentAbortController.signal },
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
          rejectSetup(new ProcessTreeError("process_containment_setup_timeout"));
        }, containmentSetupTimeoutMs);
      }),
    ]).finally(() => clearTimeout(containmentSetupTimer));
    const settle = async (result) => {
      if (settlementStarted) return;
      settlementStarted = true;
      clearTimeout(timer);
      clearTimeout(containmentSetupTimer);
      if (result.timed_out === true) containmentAbortController.abort();
      try {
        containment = await containmentPromise;
      } catch (error) {
        containmentFailed = error?.classification !== "process_containment_aborted";
        containmentError = error;
      }
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
          try { await containment.close(teardownConfirmationMs); } catch { /* failure remains fail-closed */ }
        }
        releaseUnverifiedChild(child);
        await waitForProcessClose(child, state, teardownConfirmationMs);
        reject((containmentFailed ? containmentError : null) ?? (state.containmentFailure
          ? new ProcessTreeError("process_containment_failed", JSON.stringify(state.containmentFailure), state.containmentFailure)
          : new ProcessTreeTeardownError(containment?.status?.() ?? null)));
        return;
      }
      const containmentState = containment?.status?.() ?? null;
      resolve({
        ...result,
        teardown_verified: true,
        containment_identity: containment?.identity ?? null,
        containment_fingerprint: containment?.fingerprint ?? null,
        containment_state: containmentState,
      });
    };

    child.on("message", (message) => {
      if (message?.type === "spawned") return;
      if (message?.type !== "result") return;
      void settle({
        status: Number.isInteger(message.result?.exit_code) ? message.result.exit_code : null,
        signal: typeof message.result?.signal === "string" ? message.result.signal : null,
        stdout_chars: Number.isSafeInteger(message.result?.stdout_chars) ? message.result.stdout_chars : 0,
        stderr_chars: Number.isSafeInteger(message.result?.stderr_chars) ? message.result.stderr_chars : 0,
        stdout_bytes: Number.isSafeInteger(message.result?.stdout_bytes) ? message.result.stdout_bytes : 0,
        stderr_bytes: Number.isSafeInteger(message.result?.stderr_bytes) ? message.result.stderr_bytes : 0,
        error: message.result?.error_code
          ? Object.assign(new Error(message.result.error_code), { code: message.result.error_code })
          : undefined,
        timed_out: false,
      });
    });
    child.once("error", () => {
      state.spawnFailed = !Number.isInteger(child.pid);
      void settle({
        status: null,
        signal: null,
        stdout_chars: 0,
        stderr_chars: 0,
        stdout_bytes: 0,
        stderr_bytes: 0,
        error: Object.assign(new Error("PROCESS_WORKER_FAILED"), { code: "PROCESS_WORKER_FAILED" }),
        timed_out: false,
      });
    });
    child.once("exit", () => {
      state.exited = true;
      if (!settlementStarted) void settle({
        status: null,
        signal: null,
        stdout_chars: 0,
        stderr_chars: 0,
        stdout_bytes: 0,
        stderr_bytes: 0,
        error: Object.assign(new Error("PROCESS_WORKER_EXITED"), { code: "PROCESS_WORKER_EXITED" }),
        timed_out: false,
      });
    });
    child.once("close", () => { state.closed = true; });
    void containmentPromise.then((preparedContainment) => {
      containment = preparedContainment;
      if (settlementStarted) return;
      try {
        beforeCommandStart?.();
        // The default worker already opened the parent-validated directory.
        // Re-resolving its pathname here would reject a safe rename/swap and
        // discard the stronger child-side check of the inherited directory
        // object immediately before command spawn.
        timer = setTimeout(() => {
          void settle({
            status: null,
            signal: null,
            stdout_chars: 0,
            stderr_chars: 0,
            stdout_bytes: 0,
            stderr_bytes: 0,
            error: Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }),
            timed_out: true,
          });
        }, timeoutMs);
        child.send({
          type: "initialize",
          input: {
            file,
            args,
            cwd,
            env,
            max_output_chars: maxOutputChars,
            expected_invocation: expectedInvocation,
            expected_working_directory_identity: expectedWorkingDirectoryIdentity,
          },
        });
      } catch (error) {
        void settle({
          status: null,
          signal: null,
          stdout_chars: 0,
          stderr_chars: 0,
          stdout_bytes: 0,
          stderr_bytes: 0,
          error: Object.assign(
            new Error(error?.code ?? "PROCESS_WORKER_INITIALIZATION_FAILED"),
            { code: error?.code ?? "PROCESS_WORKER_INITIALIZATION_FAILED" },
          ),
          timed_out: false,
        });
      }
    }, (error) => {
      containmentFailed = true;
      containmentError = error;
      void settle({
        status: null,
        signal: null,
        stdout_chars: 0,
        stderr_chars: 0,
        stdout_bytes: 0,
        stderr_bytes: 0,
        error: Object.assign(new Error("PROCESS_CONTAINMENT_FAILED"), { code: "PROCESS_CONTAINMENT_FAILED" }),
        timed_out: false,
      });
    });
  });
}
