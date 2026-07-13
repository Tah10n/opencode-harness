import { spawn } from "node:child_process";

export class ProcessTreeError extends Error {
  constructor(classification, message = classification) {
    super(message);
    this.name = "ProcessTreeError";
    this.code = "PROCESS_TREE_ERROR";
    this.classification = classification;
  }
}

export class ProcessTreeTeardownError extends ProcessTreeError {
  constructor() {
    super("process_tree_teardown_unverified", "process tree teardown could not be verified");
    this.name = "ProcessTreeTeardownError";
    this.code = "PROCESS_TREE_TEARDOWN_UNVERIFIED";
  }
}

const COMMAND_WORKER_SOURCE = String.raw`
import { spawn } from "node:child_process";

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
  let outputExceeded = false;
  const finish = (result) => {
    if (terminalSent) return;
    terminalSent = true;
    send({ type: "result", result });
  };
  try {
    commandChild = spawn(input.file, input.args, {
      cwd: input.cwd,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
  } catch {
    finish({ exit_code: null, signal: null, stdout_chars: 0, stderr_chars: 0, error_code: "PROCESS_SPAWN_FAILED" });
    return;
  }
  const count = (kind, chunk) => {
    const length = String(chunk).length;
    if (kind === "stdout") stdoutChars += length;
    else stderrChars += length;
    if (!outputExceeded && stdoutChars + stderrChars > input.max_output_chars) {
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
    error_code: "PROCESS_EXECUTION_FAILED",
  }));
  commandChild.once("close", (code, signal) => finish({
    exit_code: Number.isInteger(code) ? code : null,
    signal: typeof signal === "string" ? signal : null,
    stdout_chars: stdoutChars,
    stderr_chars: stderrChars,
    error_code: outputExceeded ? "PROCESS_OUTPUT_LIMIT" : null,
  }));
});
`;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function waitForExit(child, state, timeoutMs) {
  if (state.exited) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
    };
    child.on("exit", onExit);
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
    try {
      killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
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

export async function terminateProcessTree(child, state, { graceMs = 50, confirmationMs = 2000 } = {}) {
  const pid = child?.pid;
  if (!Number.isInteger(pid) || pid <= 0) return state?.spawnFailed === true;
  if (process.platform === "win32") {
    // Managed workers deliberately remain alive after their command completes,
    // so taskkill can still discover and terminate ordinary descendants.
    if (state?.exited) return false;
    const killed = await runTaskkill(pid, confirmationMs);
    const exited = await waitForExit(child, state, confirmationMs);
    return killed && exited;
  }

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
  const exited = await waitForExit(child, state, confirmationMs);
  const deadline = Date.now() + confirmationMs;
  while (processGroupExists(pid) && Date.now() < deadline) await delay(10);
  return exited && !processGroupExists(pid);
}

export function releaseUnverifiedChild(child) {
  // This is only a bounded handle-release fallback. It never upgrades an
  // unverified tree into verified evidence and callers must still fail closed.
  try { child?.disconnect?.(); } catch { /* best effort */ }
  try { child?.kill?.(); } catch { /* best effort */ }
  try { child?.channel?.unref?.(); } catch { /* best effort */ }
  try { child?.unref?.(); } catch { /* best effort */ }
}

function defaultCommandProcessFactory() {
  return spawn(process.execPath, ["--input-type=module", "--eval", COMMAND_WORKER_SOURCE], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    detached: process.platform !== "win32",
    windowsHide: true,
    serialization: "advanced",
    env: process.env,
  });
}

export function runManagedCommand({
  file,
  args = [],
  cwd,
  timeout,
  maxOutputChars = 1024 * 1024,
  teardownGraceMs = 50,
  teardownConfirmationMs = 2000,
  processFactory = defaultCommandProcessFactory,
  treeTeardown = terminateProcessTree,
} = {}) {
  if (typeof file !== "string" || file.length === 0) throw new TypeError("file must be a non-empty string");
  if (!Array.isArray(args) || args.some((entry) => typeof entry !== "string")) throw new TypeError("args must be an array of strings");
  const timeoutMs = Math.max(1, Number(timeout) || 1);
  if (!Number.isSafeInteger(maxOutputChars) || maxOutputChars < 1) throw new TypeError("maxOutputChars must be a positive safe integer");

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = processFactory({ file, args, cwd });
    } catch {
      reject(new ProcessTreeError("process_spawn_failed"));
      return;
    }
    const state = { exited: false, spawnFailed: false };
    let settlementStarted = false;
    let timer;
    const settle = async (result) => {
      if (settlementStarted) return;
      settlementStarted = true;
      clearTimeout(timer);
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
        reject(new ProcessTreeTeardownError());
        return;
      }
      resolve({ ...result, teardown_verified: true });
    };

    child.on("message", (message) => {
      if (message?.type !== "result") return;
      void settle({
        status: Number.isInteger(message.result?.exit_code) ? message.result.exit_code : null,
        signal: typeof message.result?.signal === "string" ? message.result.signal : null,
        stdout_chars: Number.isSafeInteger(message.result?.stdout_chars) ? message.result.stdout_chars : 0,
        stderr_chars: Number.isSafeInteger(message.result?.stderr_chars) ? message.result.stderr_chars : 0,
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
        error: Object.assign(new Error("PROCESS_WORKER_EXITED"), { code: "PROCESS_WORKER_EXITED" }),
        timed_out: false,
      });
    });
    timer = setTimeout(() => {
      void settle({
        status: null,
        signal: null,
        stdout_chars: 0,
        stderr_chars: 0,
        error: Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }),
        timed_out: true,
      });
    }, timeoutMs);
    try {
      child.send({ type: "initialize", input: { file, args, cwd, max_output_chars: maxOutputChars } });
    } catch {
      void settle({
        status: null,
        signal: null,
        stdout_chars: 0,
        stderr_chars: 0,
        error: Object.assign(new Error("PROCESS_WORKER_INITIALIZATION_FAILED"), { code: "PROCESS_WORKER_INITIALIZATION_FAILED" }),
        timed_out: false,
      });
    }
  });
}
