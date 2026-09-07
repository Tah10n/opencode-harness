import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { sandboxCommand } from "./sandbox.mjs";

// OpenCode runs in a private control directory, never in the untrusted project.
// All exposed repository tools execute in Docker. No tool can reach the host
// credential store, session database, another candidate, or acceptance snapshots.
export default async function plugin() {
  const configuration = JSON.parse(fs.readFileSync(process.env.VERIFIED_CHANGE_SESSION_CONFIG, "utf8"));
  const cleanupFailure = path.join(path.dirname(process.env.VERIFIED_CHANGE_SESSION_CONFIG), "cleanup-error.json");
  const execute = async (argv, context) => {
    if (fs.existsSync(cleanupFailure)) throw new Error("SANDBOX_CLEANUP_UNVERIFIED");
    let result;
    try {
      result = await sandboxCommand({ ...configuration.sandbox, argv,
        timeoutMs: Math.min(configuration.toolTimeoutMs ?? 60_000, 60_000), signal: context.abort });
    } catch (error) {
      if (error.cleanup && !fs.existsSync(cleanupFailure)) {
        fs.writeFileSync(cleanupFailure, JSON.stringify({ cleanup: error.cleanup, execution: error.execution }), { mode: 0o600, flag: "wx" });
      }
      throw error;
    }
    return JSON.stringify({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr,
      truncated: result.truncated, timedOut: result.timedOut, cancelled: result.cancelled });
  };
  const tools = {
    repository_read: {
      description: "Read a repository file inside the isolated environment. Use /workspace paths. Output is bounded.",
      args: { path: z.string() },
      execute: ({ path }, context) => execute(["node", "-e", "process.stdout.write(require('fs').readFileSync(process.argv[1]))", path], context),
    },
    repository_write: {
      description: "Write a file inside the isolated environment. Only authorized source paths (or the acceptance output directory for its author) are writable.",
      args: { path: z.string(), content: z.string() },
      execute: ({ path, content }, context) => execute(["node", "-e", "const fs=require('fs'),p=process.argv[1];fs.mkdirSync(require('path').dirname(p),{recursive:true});fs.writeFileSync(p,process.argv[2])", path, content], context),
    },
    repository_shell: {
      description: "Run shell, search, tests, or editing commands in the isolated repository. cwd is /workspace. No network or host filesystem access. Output and time are bounded.",
      args: { command: z.string() },
      execute: ({ command }, context) => execute(["/bin/sh", "-c", command], context),
    },
  };
  return {
    tool: tools,
    "tool.execute.before": async (input) => {
      // An executable guard, in addition to permissions: no native host-side
      // shell/read/task/MCP tool may run even if a permission is accidentally added.
      if (!Object.hasOwn(tools, input.tool)) throw new Error("HOST_TOOL_DENIED: use isolated repository tools");
    },
  };
}
