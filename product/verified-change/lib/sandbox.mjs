import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { command } from "./process.mjs";

export async function resolveImage(image) {
  if (typeof image !== "string" || !image || image.startsWith("-")) throw new Error("IMAGE_REQUIRED");
  const result = await command(["docker", "image", "inspect", "--format", "{{.Id}}", image]);
  const id = result.stdout.trim();
  if (result.exitCode !== 0 || !/^sha256:[a-f0-9]{64}$/.test(id)) {
    throw new Error(`SANDBOX_IMAGE_UNAVAILABLE: ${image}: ${(result.spawnError ?? result.stderr).trim().slice(0, 2048) || "the configured runtime image is not installed"}`);
  }
  return id;
}

function mount(source, target, readonly) {
  const real = fs.realpathSync(source);
  if (real.includes(",") || target.includes(",")) throw new Error("MOUNT_PATH_UNSUPPORTED");
  return ["--mount", `type=bind,src=${real},dst=${target}${readonly ? ",readonly" : ""}`];
}

const healthy = (r) => !r.timedOut && !r.cancelled && !r.spawnError && !r.exitSignal && !r.truncated;
const succeeded = (r) => healthy(r) && r.exitCode === 0;
function missing(result, container) {
  return healthy(result) && result.exitCode === 1 && !result.stdout.trim()
    && [`Error response from daemon: No such container: ${container}`, `Error: No such object: ${container}`,
      `Error response from daemon: No such object: ${container}`].includes(result.stderr.trim());
}

// One cleanup transaction per invocation. Repeated/concurrent callers see the
// same receipt or refusal; a later empty inventory cannot erase an earlier error.
export function createContainerCleanup(container, execute = command) {
  if (!/^verified-change-[a-f0-9-]{36}$/.test(container)) throw new Error("CONTAINER_NAME_INVALID");
  let pending;
  return () => pending ??= (async () => {
    const run = async (argv) => {
      let result;
      try { result = await execute(argv, { timeoutMs: 10_000, maxBytes: 4096 }); }
      catch (error) { result = { exitCode: null, spawnError: String(error.message), stdout: "", stderr: "" }; }
      return { ...result, argv, stdout: String(result.stdout ?? "").slice(0, 4096),
        stderr: String(result.stderr ?? "").slice(0, 4096),
        spawnError: result.spawnError == null ? null : String(result.spawnError).slice(0, 4096),
        truncated: Boolean(result.truncated || String(result.stdout ?? "").length > 4096 || String(result.stderr ?? "").length > 4096) };
    };
    const observe = async () => {
      const inspect = await run(["docker", "container", "inspect", "--format", "{{.Id}} {{.Name}} {{.State.Status}}", container]);
      const list = await run(["docker", "container", "ls", "--all", "--no-trunc", "--filter", `name=^/${container}$`, "--format", "{{.ID}} {{.Names}} {{.State}}"]);
      return { inspect, list, state: missing(inspect, container) && succeeded(list) && !list.stdout.trim() ? "absent"
        : succeeded(inspect) && succeeded(list) ? "present" : "unknown" };
    };
    const before = await observe();
    // Independent of cancellation: force removal kills detached descendants.
    const rm = await run(["docker", "rm", "--force", container]);
    const after = await observe();
    const id = [before, after].map((s) => s.inspect.stdout.match(/^([a-f0-9]{64}) /)?.[1]).find(Boolean) ?? null;
    const receipt = { container: { name: container, id }, before, rm, after,
      verified: before.state !== "unknown" && (succeeded(rm) || missing(rm, container)) && after.state === "absent" };
    if (!receipt.verified) {
      const error = new Error("SANDBOX_CLEANUP_UNVERIFIED");
      error.cleanup = receipt;
      throw error;
    }
    return receipt;
  })();
}

export async function sandboxCommand({ image, workspace, readonly = true, protectedPaths = [], writablePaths = [],
  extraMounts = [], argv, cwd = "/workspace", timeoutMs = 60_000, signal, sessionLabel }) {
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error("SANDBOX_IMAGE_NOT_RESOLVED");
  const container = `verified-change-${randomUUID()}`;
  const args = ["docker", "run", "--name", container, "--rm", "--init", "--network", "none",
    "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--pids-limit", "128", "--memory", "2g", "--cpus", "2",
    "--user", `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    "--tmpfs", "/tmp:rw,nosuid,nodev,size=256m", "--env", "HOME=/tmp",
    "--workdir", cwd, ...mount(workspace, "/workspace", readonly)];
  if (sessionLabel) {
    if (!/^[a-f0-9-]{36}$/.test(sessionLabel)) throw new Error("SESSION_LABEL_INVALID");
    args.push("--label", `verified-change.session=${sessionLabel}`);
  }
  for (const relative of writablePaths) {
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..") || relative === ".git" || relative.startsWith(".git/")) throw new Error("WRITABLE_PATH_INVALID");
    const source = path.join(workspace, relative);
    if (!fs.realpathSync(source).startsWith(`${fs.realpathSync(workspace)}${path.sep}`)) throw new Error("WRITABLE_PATH_ESCAPE");
    args.push(...mount(source, `/workspace/${relative}`, false));
  }
  for (const relative of protectedPaths) {
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) throw new Error("PROTECTED_PATH_INVALID");
    const source = path.join(workspace, relative);
    if (!fs.realpathSync(source).startsWith(`${fs.realpathSync(workspace)}${path.sep}`)) throw new Error("PROTECTED_PATH_ESCAPE");
    args.push(...mount(source, `/workspace/${relative}`, true));
  }
  for (const entry of extraMounts) args.push(...mount(entry.source, entry.target, entry.readonly !== false));
  args.push(image, ...argv);
  let result;
  const cleanup = createContainerCleanup(container);
  try {
    result = await command(args, { timeoutMs, signal });
  } finally {
    try {
      const receipt = await cleanup();
      if (result) result.cleanup = receipt;
    } catch (error) {
      error.execution = result && { exitCode: result.exitCode, exitSignal: result.exitSignal,
        timedOut: result.timedOut, cancelled: result.cancelled, spawnError: result.spawnError,
        stderr: result.stderr.slice(0, 4096) };
      throw error;
    }
  }
  return result;
}
