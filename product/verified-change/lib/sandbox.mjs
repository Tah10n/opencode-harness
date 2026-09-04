import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { command } from "./process.mjs";

export async function resolveImage(image) {
  if (typeof image !== "string" || !image || image.startsWith("-")) throw new Error("IMAGE_REQUIRED");
  const result = await command(["docker", "image", "inspect", "--format", "{{.Id}}", image]);
  const id = result.stdout.trim();
  if (result.exitCode !== 0 || !/^sha256:[a-f0-9]{64}$/.test(id)) {
    throw new Error(`SANDBOX_IMAGE_UNAVAILABLE: install the configured runtime image first: ${image}`);
  }
  return id;
}

function mount(source, target, readonly) {
  const real = fs.realpathSync(source);
  if (real.includes(",") || target.includes(",")) throw new Error("MOUNT_PATH_UNSUPPORTED");
  return ["--mount", `type=bind,src=${real},dst=${target}${readonly ? ",readonly" : ""}`];
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
  try {
    result = await command(args, { timeoutMs, signal });
  } finally {
    // Removing the container kills *all* descendants, including detached ones.
    // This is deliberately independent of the cancelled signal.
    const cleanup = await command(["docker", "rm", "--force", container], { timeoutMs: 10_000 });
    if (cleanup.exitCode !== 0) {
      const inspect = await command(["docker", "container", "ls", "--all", "--filter", `name=^/${container}$`, "--format", "{{.ID}}"], { timeoutMs: 10_000 });
      if (inspect.exitCode !== 0 || inspect.stdout.trim()) throw new Error("SANDBOX_CLEANUP_UNVERIFIED");
    }
  }
  return result;
}
