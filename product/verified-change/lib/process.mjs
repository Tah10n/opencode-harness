import { spawn } from "node:child_process";

// This bounds transport only. Descendant containment belongs to Docker, not
// process groups (a child can escape a process group with setsid()).
export function command(argv, { cwd, env, signal, timeoutMs = 60_000, maxBytes = 65_536 } = {}) {
  if (!Array.isArray(argv) || !argv.length || argv.some((v) => typeof v !== "string" || v.includes("\0"))) {
    throw new Error("COMMAND_ARGV_INVALID");
  }
  return new Promise((resolve) => {
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), truncated = false;
    let timedOut = false, cancelled = Boolean(signal?.aborted), spawnError = null;
    const child = spawn(argv[0], argv.slice(1), { cwd, env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const append = (previous, chunk) => {
      if (previous.length + chunk.length > maxBytes) truncated = true;
      return Buffer.concat([previous, chunk]).subarray(0, maxBytes);
    };
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => { spawnError = error.message; });
    const cancel = () => { cancelled = true; child.kill("SIGKILL"); };
    signal?.addEventListener("abort", cancel, { once: true });
    if (cancelled) cancel();
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.on("close", (exitCode, exitSignal) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      resolve({ argv, exitCode, exitSignal, timedOut, cancelled, spawnError, truncated,
        stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8") });
    });
  });
}
