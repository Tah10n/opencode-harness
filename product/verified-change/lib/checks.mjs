import { fileURLToPath } from "node:url";
import { sandboxCommand } from "./sandbox.mjs";
import { validateCheck } from "./config.mjs";

const reporter = fileURLToPath(new URL("./node-reporter.mjs", import.meta.url));
export async function runCheck(check, sandbox, signal) {
  validateCheck(check);
  const argv = check.kind === "node-test"
    ? ["node", "--test", "--test-reporter=/harness/node-reporter.mjs", ...check.files]
    : check.argv;
  const execution = await sandboxCommand({ ...sandbox, readonly: true, argv,
    cwd: check.cwd ? `${sandbox.checkRoot ?? "/workspace"}/${check.cwd}` : (sandbox.checkRoot ?? "/workspace"), timeoutMs: check.timeoutMs ?? 60_000, signal,
    extraMounts: [...(sandbox.extraMounts ?? []), { source: reporter, target: "/harness/node-reporter.mjs" }] });
  const result = { id: check.id, command: argv,
    cwd: check.cwd ? `${sandbox.checkRoot ?? "/workspace"}/${check.cwd}` : (sandbox.checkRoot ?? "/workspace"),
    stdout: execution.stdout, stderr: execution.stderr,
    truncated: execution.truncated, exitCode: execution.exitCode, status: "infrastructure_error" };
  if (execution.timedOut) return { ...result, status: "timeout" };
  if (execution.cancelled || execution.spawnError || execution.truncated) return result;
  if (check.kind === "command") {
    // Generic build failures lack assertion evidence; do not guess from prose.
    return { ...result, status: execution.exitCode === 0 ? "passed" : "infrastructure_error" };
  }
  try {
    const parsed = JSON.parse(execution.stdout);
    if (parsed.protocol !== "verified-change/node-test/1"
      || !["passed", "assertion_failed", "infrastructure_error", "not_applicable"].includes(parsed.status)
      || (parsed.status === "passed" && execution.exitCode !== 0)) return result;
    return { ...result, status: parsed.status, assertions: parsed.failures,
      testStdout: parsed.stdout, testStderr: parsed.stderr, testOutputTruncated: parsed.truncated };
  } catch { return result; }
}
