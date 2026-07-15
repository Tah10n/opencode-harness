import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { createNormalSessionQualityPlugin } from "opencode-harness/quality-plugin";
import { createDefaultNormalSessionCheckCatalog } from "../lib/quality/normal-session-bridge.mjs";
import {
  classifyQualityPluginApiProbe,
  normalSessionRuntimeSourceFingerprint,
} from "../lib/quality/runtime-hook-verification.mjs";
import { ContractError } from "../lib/quality/validation.mjs";

const root = fs.realpathSync(new URL("..", import.meta.url));
const UNCLASSIFIED_DENIAL_CODE = "QUALITY_SESSION_UNCLASSIFIED";

export async function isExpectedUnclassifiedDenial(callback) {
  try {
    await callback();
    return false;
  } catch (error) {
    return error instanceof ContractError && error.code === UNCLASSIFIED_DENIAL_CODE;
  }
}

function runtimeVersion() {
  const result = spawnSync("opencode", ["--version"], { encoding: "utf8", shell: false, windowsHide: true, timeout: 10000 });
  if (result.error || result.status !== 0) return null;
  return String(result.stdout || result.stderr || "").trim().split(/\r?\n/u)[0]?.slice(0, 128) || null;
}

function packageEntry(directory, packageJson) {
  const exported = packageJson.exports?.["."] ?? packageJson.exports;
  const relative = typeof exported === "string"
    ? exported
    : exported?.import ?? exported?.default ?? packageJson.module ?? packageJson.main;
  return typeof relative === "string" ? path.resolve(directory, relative) : null;
}

async function loadPluginApi() {
  const home = process.env.USERPROFILE ?? process.env.HOME;
  const candidates = [
    process.env.OPENCODE_PLUGIN_API_PATH,
    path.join(root, ".opencode", "node_modules", "@opencode-ai", "plugin"),
    home ? path.join(home, ".config", "opencode", "node_modules", "@opencode-ai", "plugin") : null,
  ].filter(Boolean);
  for (const rawCandidate of candidates) {
    try {
      const candidate = path.resolve(rawCandidate);
      const directory = fs.statSync(candidate).isDirectory() ? candidate : path.dirname(candidate);
      const packageJson = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8").replace(/^\uFEFF/u, ""));
      const entry = fs.statSync(candidate).isDirectory() ? packageEntry(directory, packageJson) : candidate;
      if (!entry || !fs.statSync(entry).isFile()) continue;
      return { api: await import(pathToFileURL(entry).href), version: packageJson.version ?? null };
    } catch {
      // Try the next bounded local installation layout.
    }
  }
  return null;
}

export async function runQualityPluginApiProbe() {
  const sourceFingerprint = normalSessionRuntimeSourceFingerprint(root);
  const loaded = await loadPluginApi();
  const input = {
    runtime_version: runtimeVersion(),
    plugin_api_version: loaded?.version ?? null,
    api_loaded: loaded !== null,
    api_parseable: false,
    hook_surface: {
      chat_message: false,
      permission_ask: false,
      tool_execute_before: false,
      tool_execute_after: false,
      event: false,
    },
    tool_ids: [],
    unclassified_edit_denied: false,
    unclassified_mutating_bash_denied: false,
    source_fingerprint: sourceFingerprint,
  };

  if (loaded && typeof loaded.api.tool === "function" && typeof loaded.api.tool.schema?.string === "function") {
    const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-api-probe-"));
    try {
      fs.writeFileSync(path.join(probeRoot, "README.md"), "quality plugin API probe\n", "utf8");
      for (const args of [
        ["init", "-q"],
        ["add", "README.md"],
        ["-c", "user.name=OpenCode Harness", "-c", "user.email=harness@example.invalid", "commit", "-qm", "probe"],
      ]) {
        const result = spawnSync("git", args, { cwd: probeRoot, shell: false, windowsHide: true, timeout: 10000 });
        if (result.error || result.status !== 0) throw new Error("probe Git workspace unavailable");
      }
      const plugin = createNormalSessionQualityPlugin({
        toolFactory: loaded.api.tool,
        workspaceRoot: probeRoot,
        bridgeOptions: {
          checkCatalog: createDefaultNormalSessionCheckCatalog(),
          affectedFileInspector: () => ["README.md"],
        },
      });
      input.api_parseable = true;
      input.hook_surface = {
        chat_message: typeof plugin["chat.message"] === "function",
        permission_ask: typeof plugin["permission.ask"] === "function",
        tool_execute_before: typeof plugin["tool.execute.before"] === "function",
        tool_execute_after: typeof plugin["tool.execute.after"] === "function",
        event: typeof plugin.event === "function",
      };
      input.tool_ids = Object.keys(plugin.tool ?? {});
      await plugin["chat.message"]({ sessionID: "api-probe", agent: "orchestrator" });
      input.unclassified_edit_denied = await isExpectedUnclassifiedDenial(() => plugin["tool.execute.before"](
        { tool: "edit", sessionID: "api-probe", callID: "edit-unclassified" },
        { args: { filePath: "README.md", oldString: "probe", newString: "changed", replaceAll: false } },
      ));
      input.unclassified_mutating_bash_denied = await isExpectedUnclassifiedDenial(() => plugin["tool.execute.before"](
        { tool: "bash", sessionID: "api-probe", callID: "bash-unclassified" },
        { args: { command: "npm test" } },
      ));
    } catch {
      input.api_parseable = false;
    } finally {
      fs.rmSync(probeRoot, { recursive: true, force: true });
    }
  }

  return classifyQualityPluginApiProbe(input);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const receipt = await runQualityPluginApiProbe();
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (receipt.status === "failed") process.exitCode = 1;
  else if (receipt.status === "incomplete") process.exitCode = 2;
}
