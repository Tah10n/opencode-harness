import fs from "node:fs";
import path from "node:path";
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
  let stdoutBytes = 0;
  let stderrBytes = 0;
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
      env: input.env,
    });
    send({ type: "spawned", command_pid: commandChild.pid });
  } catch {
    finish({ exit_code: null, signal: null, stdout_chars: 0, stderr_chars: 0, error_code: "PROCESS_SPAWN_FAILED" });
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

const WINDOWS_JOB_CONTROLLER_SOURCE = String.raw`
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
trap {
  [Console]::Out.WriteLine("ERROR:" + $_.Exception.Message)
  [Console]::Out.Flush()
  exit 1
}
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class ManagedCommandJob {
  [StructLayout(LayoutKind.Sequential)]
  public struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
    public long PerProcessUserTimeLimit;
    public long PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize;
    public UIntPtr MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass;
    public uint SchedulingClass;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct IO_COUNTERS {
    public ulong ReadOperationCount;
    public ulong WriteOperationCount;
    public ulong OtherOperationCount;
    public ulong ReadTransferCount;
    public ulong WriteTransferCount;
    public ulong OtherTransferCount;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
    public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
    public IO_COUNTERS IoInfo;
    public UIntPtr ProcessMemoryLimit;
    public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed;
    public UIntPtr PeakJobMemoryUsed;
  }

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr CreateJobObject(IntPtr attributes, string name);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool CloseHandle(IntPtr handle);
}
"@

$job = [ManagedCommandJob]::CreateJobObject([IntPtr]::Zero, $null)
if ($job -eq [IntPtr]::Zero) { throw "CreateJobObject failed" }
try {
  $limits = New-Object ManagedCommandJob+JOBOBJECT_EXTENDED_LIMIT_INFORMATION
  $basicLimits = New-Object ManagedCommandJob+JOBOBJECT_BASIC_LIMIT_INFORMATION
  $basicLimits.LimitFlags = 0x00002000
  $limits.BasicLimitInformation = $basicLimits
  $size = [Runtime.InteropServices.Marshal]::SizeOf($limits)
  $pointer = [Runtime.InteropServices.Marshal]::AllocHGlobal($size)
  try {
    [Runtime.InteropServices.Marshal]::StructureToPtr($limits, $pointer, $false)
    if (-not [ManagedCommandJob]::SetInformationJobObject($job, 9, $pointer, [uint32]$size)) {
      throw "SetInformationJobObject failed"
    }
  } finally {
    [Runtime.InteropServices.Marshal]::FreeHGlobal($pointer)
  }

  $targetPid = [uint32]$env:OC_MANAGED_WORKER_PID
  $target = [ManagedCommandJob]::OpenProcess(0x00001101, $false, $targetPid)
  if ($target -eq [IntPtr]::Zero) { throw "OpenProcess failed" }
  try {
    if (-not [ManagedCommandJob]::AssignProcessToJobObject($job, $target)) {
      throw "AssignProcessToJobObject failed"
    }
  } finally {
    [void][ManagedCommandJob]::CloseHandle($target)
  }

  [Console]::Out.WriteLine("READY")
  [Console]::Out.Flush()
  if ([Console]::In.ReadLine() -ne "CLOSE") { throw "controller input closed" }
  if (-not [ManagedCommandJob]::CloseHandle($job)) { throw "CloseHandle failed" }
  $job = [IntPtr]::Zero
  [Console]::Out.WriteLine("CLOSED")
  [Console]::Out.Flush()
} finally {
  if ($job -ne [IntPtr]::Zero) { [void][ManagedCommandJob]::CloseHandle($job) }
}
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
    if (state.exited) onExit();
  });
}

function canonicalWindowsPowerShell() {
  const candidate = path.join(
    path.parse(process.execPath).root,
    "Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const resolved = fs.realpathSync(candidate);
  if (!fs.statSync(resolved).isFile()) throw new Error("Windows PowerShell is unavailable");
  return resolved;
}

export function sanitizedNodeBootstrapEnvironment(source = process.env) {
  const environment = {};
  for (const [key, value] of Object.entries(source)) {
    if (/^NODE_/iu.test(key) || key.toUpperCase() === "ELECTRON_RUN_AS_NODE") continue;
    environment[key] = value;
  }
  return environment;
}

function createWindowsJobController(worker, timeoutMs, { signal = null } = {}) {
  return new Promise((resolve, reject) => {
    let controller;
    let ready = false;
    let closed = false;
    let exited = false;
    let exitCode = null;
    let buffer = "";
    let stderr = "";
    let settled = false;
    let closeRequested = false;
    let readyTimer;
    let closeTimer;
    let closeResolve;
    let abortHandler;

    const clearReadiness = () => {
      clearTimeout(readyTimer);
      if (abortHandler !== undefined) signal?.removeEventListener("abort", abortHandler);
    };

    const rejectReady = (error = new ProcessTreeTeardownError()) => {
      if (settled) return;
      settled = true;
      clearReadiness();
      try { controller?.stdin?.end(); } catch { /* job handle close is the fail-safe */ }
      try { controller?.kill(); } catch { /* best effort after failed readiness */ }
      reject(error);
    };
    const maybeResolveClose = () => {
      if (!closeRequested || !exited) return;
      clearTimeout(closeTimer);
      closeResolve?.(closed && exitCode === 0);
    };
    const onLine = (line) => {
      if (line === "READY" && !ready) {
        ready = true;
        settled = true;
        clearReadiness();
        resolve(Object.freeze({
          status: () => Object.freeze({ closed, exited, exit_code: exitCode }),
          close: (confirmationMs) => new Promise((resolveClose) => {
            if (closeRequested) {
              resolveClose(false);
              return;
            }
            closeRequested = true;
            closeResolve = resolveClose;
            closeTimer = setTimeout(() => {
              try { controller.stdin.end(); } catch { /* handle close remains authoritative */ }
              try { controller.kill(); } catch { /* best effort */ }
              resolveClose(false);
            }, confirmationMs);
            try {
              controller.stdin.end("CLOSE\n");
            } catch {
              clearTimeout(closeTimer);
              resolveClose(false);
              return;
            }
            maybeResolveClose();
          }),
        }));
      } else if (line === "CLOSED") {
        closed = true;
        maybeResolveClose();
      } else if (line.startsWith("ERROR:")) {
        rejectReady(new ProcessTreeError("process_containment_failed", line.slice("ERROR:".length)));
      } else if (line.length > 0) {
        rejectReady(new ProcessTreeError("process_containment_failed", "unexpected controller output"));
      }
    };

    abortHandler = () => rejectReady(new ProcessTreeError(
      "process_containment_aborted",
      "process containment setup was aborted before readiness",
    ));
    if (signal?.aborted) {
      abortHandler();
      return;
    }
    signal?.addEventListener("abort", abortHandler, { once: true });

    let powershell;
    try {
      powershell = canonicalWindowsPowerShell();
      const encoded = Buffer.from(WINDOWS_JOB_CONTROLLER_SOURCE, "utf16le").toString("base64");
      controller = spawn(powershell, [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-EncodedCommand", encoded,
      ], {
        windowsHide: true,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, OC_MANAGED_WORKER_PID: String(worker.pid) },
      });
    } catch {
      rejectReady();
      return;
    }
    controller.stdout.setEncoding("utf8");
    controller.stderr.setEncoding("utf8");
    controller.stderr.on("data", (chunk) => {
      if (stderr.length < 4096) stderr += chunk.slice(0, 4096 - stderr.length);
    });
    controller.stdout.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > 4096) {
        rejectReady();
        return;
      }
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/u, "");
        buffer = buffer.slice(newline + 1);
        onLine(line);
      }
    });
    controller.once("error", rejectReady);
    controller.once("exit", (code) => {
      exited = true;
      exitCode = code;
      if (!ready) rejectReady(new ProcessTreeError(
        "process_containment_failed",
        stderr.trim().length > 0 ? stderr.trim() : "job controller exited before readiness",
      ));
      maybeResolveClose();
    });
    readyTimer = setTimeout(rejectReady, timeoutMs);
  });
}

function defaultProcessContainmentFactory(worker, timeoutMs, options = {}) {
  if (process.platform !== "win32") return Promise.resolve(null);
  return createWindowsJobController(worker, Math.max(timeoutMs, 10_000), options);
}

export function prepareProcessContainment(worker, timeoutMs = 2000, options = {}) {
  return defaultProcessContainmentFactory(worker, timeoutMs, options);
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
  if (process.platform === "win32") {
    if (containment !== null) {
      let closed = false;
      try { closed = await containment.close(confirmationMs); } catch { closed = false; }
      const exited = await waitForExit(child, state, confirmationMs);
      if (!closed || !exited) state.containmentFailure = containment.status?.() ?? null;
      return closed && exited;
    }
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
  processFactory = defaultCommandProcessFactory,
  processContainmentFactory = null,
  treeTeardown = terminateProcessTree,
} = {}) {
  if (typeof file !== "string" || file.length === 0) throw new TypeError("file must be a non-empty string");
  if (!Array.isArray(args) || args.some((entry) => typeof entry !== "string")) throw new TypeError("args must be an array of strings");
  if (env === null || typeof env !== "object" || Array.isArray(env)
    || Object.values(env).some((entry) => typeof entry !== "string")) {
    throw new TypeError("env must be an object containing only string values");
  }
  const timeoutMs = Math.max(1, Number(timeout) || 1);
  if (!Number.isSafeInteger(maxOutputChars) || maxOutputChars < 1) throw new TypeError("maxOutputChars must be a positive safe integer");

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = processFactory({ file, args, cwd, env });
    } catch {
      reject(new ProcessTreeError("process_spawn_failed"));
      return;
    }
    const state = { exited: false, spawnFailed: false };
    const containmentFactory = processContainmentFactory
      ?? (processFactory === defaultCommandProcessFactory
        ? defaultProcessContainmentFactory
        : () => Promise.resolve(null));
    let containment = null;
    let containmentFailed = false;
    let containmentError = null;
    let settlementStarted = false;
    let timer;
    const containmentAbortController = new AbortController();
    const containmentPromise = Promise.resolve().then(() => containmentFactory(
      child,
      teardownConfirmationMs,
      { signal: containmentAbortController.signal },
    ));
    const settle = async (result) => {
      if (settlementStarted) return;
      settlementStarted = true;
      clearTimeout(timer);
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
        reject((containmentFailed ? containmentError : null) ?? (state.containmentFailure
          ? new ProcessTreeError("process_containment_failed", JSON.stringify(state.containmentFailure))
          : new ProcessTreeTeardownError()));
        return;
      }
      resolve({ ...result, teardown_verified: true });
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
    void containmentPromise.then((preparedContainment) => {
      containment = preparedContainment;
      if (settlementStarted) return;
      try {
        child.send({ type: "initialize", input: { file, args, cwd, env, max_output_chars: maxOutputChars } });
      } catch {
        void settle({
          status: null,
          signal: null,
          stdout_chars: 0,
          stderr_chars: 0,
          stdout_bytes: 0,
          stderr_bytes: 0,
          error: Object.assign(new Error("PROCESS_WORKER_INITIALIZATION_FAILED"), { code: "PROCESS_WORKER_INITIALIZATION_FAILED" }),
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
