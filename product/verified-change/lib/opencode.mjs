import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { command } from "./process.mjs";

export function parseSessionEvents(stdout) {
  const events = stdout.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
  const sessions = new Set(events.map((event) => event.sessionID).filter(Boolean));
  if (sessions.size !== 1) throw new Error("OPENCODE_SESSION_ID_INVALID");
  const error = events.find((event) => event.type === "error");
  if (error) throw new Error(`OPENCODE_SESSION_ERROR: ${JSON.stringify(error.error ?? {})}`);
  const finishes = events.filter((event) => event.type === "step_finish");
  if (!finishes.some((event) => event.part?.reason === "stop")) throw new Error("OPENCODE_SESSION_INCOMPLETE");
  return { sessionID: [...sessions][0], steps: finishes.length,
    eventTypes: [...new Set(events.map((event) => event.type))],
    toolCalls: events.filter((event) => event.type === "tool_use").length,
    tools: events.filter((event) => event.type === "tool_use").map((event) => ({ tool: event.part?.tool,
      status: event.part?.state?.status, output: String(event.part?.state?.output ?? "").slice(0, 65_536),
      error: event.part?.state?.error })),
    usage: finishes.map((event) => ({ tokens: event.part?.tokens, cost: event.part?.cost })) };
}

export async function createOpenCodeSession({ controlDirectory, sandbox, model, variant, timeoutMs = 600_000 }) {
  fs.mkdirSync(controlDirectory, { recursive: true, mode: 0o700 });
  const label = randomUUID();
  const configurationPath = path.join(controlDirectory, "session.json");
  fs.writeFileSync(configurationPath, JSON.stringify({ sandbox: { ...sandbox, sessionLabel: label } }), { mode: 0o600, flag: "wx" });
  const pluginPath = fileURLToPath(new URL("./opencode-plugin.mjs", import.meta.url));
  const config = { plugin: [pluginPath], permission: { "*": "deny", repository_read: "allow", repository_write: "allow", repository_shell: "allow" } };
  let sessionID;
  return {
    async prompt(text, signal) {
      const argv = ["opencode", "run", "--format", "json", "--dir", controlDirectory, "--title", "Verified change"];
      if (model) argv.push("--model", model);
      if (variant) argv.push("--variant", variant);
      if (sessionID) argv.push("--session", sessionID);
      argv.push("--", text);
      let execution;
      try {
        execution = await command(argv, { cwd: controlDirectory, timeoutMs, signal, maxBytes: 8 * 1024 * 1024,
          env: { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config), VERIFIED_CHANGE_SESSION_CONFIG: configurationPath } });
      } finally {
        // If OpenCode was killed during a tool call, its plugin's finally block
        // may not run. The host still removes every container owned by this session.
        const listed = await command(["docker", "ps", "-aq", "--filter", `label=verified-change.session=${label}`]);
        if (listed.exitCode !== 0) throw new Error("SESSION_CLEANUP_UNVERIFIED");
        const ids = listed.stdout.split(/\s+/).filter(Boolean);
        if (ids.some((id) => !/^[a-f0-9]{12,64}$/.test(id))) throw new Error("SESSION_CONTAINER_ID_INVALID");
        for (const id of ids) {
          const removed = await command(["docker", "rm", "--force", id]);
          if (removed.exitCode !== 0) throw new Error("SESSION_CLEANUP_UNVERIFIED");
        }
      }
      if (execution.cancelled) throw new DOMException("cancelled", "AbortError");
      if (execution.timedOut) throw new Error("OPENCODE_SESSION_TIMEOUT");
      if (execution.exitCode !== 0 || execution.truncated || execution.spawnError) throw new Error(`OPENCODE_EXECUTION_FAILED: ${execution.stderr.slice(0, 4096)}`);
      const summary = parseSessionEvents(execution.stdout);
      if (sessionID && summary.sessionID !== sessionID) throw new Error("OPENCODE_SESSION_CHANGED");
      sessionID = summary.sessionID;
      return summary;
    },
  };
}
