import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { createNormalSessionQualityPlugin } from "../lib/quality/normal-session-plugin.mjs";
import { classifyNormalSessionRuntimeHooks } from "../lib/quality/runtime-hook-verification.mjs";

function command(file, args) {
  if (process.platform === "win32" && file === "opencode") {
    const appDataCommand = process.env.APPDATA
      ? path.join(process.env.APPDATA, "npm", "opencode.cmd")
      : null;
    const executable = appDataCommand && fs.existsSync(appDataCommand) ? appDataCommand : "opencode";
    return spawnSync("cmd.exe", ["/d", "/s", "/c", [executable, ...args].join(" ")], {
      encoding: "utf8",
      windowsHide: true,
    });
  }
  return spawnSync(file, args, { encoding: "utf8", windowsHide: true });
}

function runtimeVersion() {
  const result = command("opencode", ["--version"]);
  if (result.status !== 0) return null;
  return String(result.stdout || result.stderr || "").trim().split(/\r?\n/u)[0]?.slice(0, 128) || null;
}

function globalNpmRoot() {
  if (process.platform === "win32" && process.env.APPDATA) {
    const fallback = path.join(process.env.APPDATA, "npm", "node_modules");
    if (fs.existsSync(fallback)) return fallback;
  }
  const executable = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = command(executable, ["root", "-g"]);
  return result.status === 0 ? String(result.stdout).trim() : null;
}

function packageEntry(directory, packageJson) {
  const exported = packageJson.exports?.["."] ?? packageJson.exports;
  const relative = typeof exported === "string"
    ? exported
    : exported?.import ?? exported?.default ?? packageJson.module ?? packageJson.main;
  return typeof relative === "string" ? path.resolve(directory, relative) : null;
}

async function loadInstalledPluginApi() {
  const candidates = [];
  if (process.env.OPENCODE_PLUGIN_API_PATH) candidates.push(path.resolve(process.env.OPENCODE_PLUGIN_API_PATH));
  candidates.push(path.join(process.cwd(), ".opencode", "node_modules", "@opencode-ai", "plugin"));
  const home = process.env.USERPROFILE ?? process.env.HOME;
  if (home) candidates.push(path.join(home, ".config", "opencode", "node_modules", "@opencode-ai", "plugin"));
  const npmRoot = globalNpmRoot();
  if (npmRoot) {
    candidates.push(path.join(npmRoot, "@opencode-ai", "plugin"));
    candidates.push(path.join(npmRoot, "opencode-ai", "node_modules", "@opencode-ai", "plugin"));
  }
  for (const candidate of candidates) {
    try {
      const directory = fs.statSync(candidate).isDirectory() ? candidate : path.dirname(candidate);
      const packagePath = path.join(directory, "package.json");
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8").replace(/^\uFEFF/u, ""));
      const entry = fs.statSync(candidate).isDirectory() ? packageEntry(directory, packageJson) : candidate;
      if (!entry || !fs.existsSync(entry)) continue;
      const api = await import(pathToFileURL(entry).href);
      return { api, version: packageJson.version ?? null };
    } catch {
      // Try the next installation layout without persisting private paths or raw loader errors.
    }
  }
  return null;
}

function emptyProbe(runtime, pluginApiVersion = null) {
  return {
    runtime_version: runtime,
    plugin_api_version: pluginApiVersion,
    api_loaded: false,
    api_parseable: false,
    hook_surface: {
      tool: false,
      permission_ask: false,
      tool_execute_before: false,
      tool_execute_after: false,
      event: false,
    },
    tool_ids: [],
    pre_gate_edit_denied: false,
    pre_gate_writable_task_denied: false,
    host_plugin_discovered: false,
    host_hooks_invoked: false,
    effective_permissions_verified: false,
    permission_hook_host_wired: false,
    task_child_causal_binding_verified: false,
    session_risk_classification_verified: false,
    shell_mutation_boundary: "unavailable",
  };
}

function createProbeWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-runtime-hook-"));
  fs.writeFileSync(path.join(root, "README.md"), "runtime hook probe\n", "utf8");
  for (const [file, args] of [
    ["git", ["init", "-q"]],
    ["git", ["add", "README.md"]],
    ["git", ["-c", "user.name=OpenCode Harness", "-c", "user.email=harness@example.invalid", "commit", "-qm", "probe"]],
  ]) {
    const result = spawnSync(file, args, { cwd: root, encoding: "utf8", windowsHide: true, shell: false });
    if (result.error || result.status !== 0) throw new Error("runtime probe Git workspace is unavailable");
  }
  return root;
}

async function probe() {
  const runtime = runtimeVersion();
  const loaded = await loadInstalledPluginApi();
  if (!loaded) return classifyNormalSessionRuntimeHooks(emptyProbe(runtime));

  const input = emptyProbe(runtime, loaded.version);
  input.api_loaded = true;
  if (typeof loaded.api.tool !== "function" || typeof loaded.api.tool.schema?.string !== "function") {
    return classifyNormalSessionRuntimeHooks(input);
  }

  try {
    const probeRoot = createProbeWorkspace();
    let plugin;
    try {
      plugin = createNormalSessionQualityPlugin({ toolFactory: loaded.api.tool, workspaceRoot: probeRoot });
    input.api_parseable = true;
    input.hook_surface = {
      tool: plugin.tool !== null && typeof plugin.tool === "object",
      permission_ask: typeof plugin["permission.ask"] === "function",
      tool_execute_before: typeof plugin["tool.execute.before"] === "function",
      tool_execute_after: typeof plugin["tool.execute.after"] === "function",
      event: typeof plugin.event === "function",
    };
    input.tool_ids = Object.keys(plugin.tool ?? {});

      await plugin.tool.quality_dossier_create.execute({
        request: JSON.stringify({
          risk_class: "high",
          mode: "full",
          task_type: "maintenance",
          user_visible_goal: "Verify installed pre-tool quality enforcement.",
          verification_boundary: { check_ids: [], mechanism_ids: [], ownership_paths: ["README.md"], integration_check_ids: [] },
        }),
      }, { sessionID: "runtime-hook-probe", agent: "orchestrator" });

      try {
        await plugin["tool.execute.before"]({
          tool: "edit",
          sessionID: "runtime-hook-probe",
          callID: "call-runtime-edit",
        }, { args: { filePath: "README.md", oldString: "probe", newString: "changed", replaceAll: false } });
      } catch {
        input.pre_gate_edit_denied = true;
      }

      try {
        await plugin["tool.execute.before"]({
          tool: "task",
          sessionID: "runtime-hook-probe",
          callID: "call-runtime-task",
        }, { args: { description: "runtime task", prompt: "probe", subagent_type: "general" } });
      } catch {
        input.pre_gate_writable_task_denied = true;
      }
    } finally {
      fs.rmSync(probeRoot, { recursive: true, force: true });
    }

    // The callback factory is exercised above. Actual host discovery and callback
    // invocation remain separate evidence and are deliberately not inferred here.
    input.permission_hook_host_wired = false;
    input.task_child_causal_binding_verified = false;
    input.session_risk_classification_verified = false;
    input.shell_mutation_boundary = "permission_only_unclassified";
  } catch {
    input.api_parseable = false;
  }
  return classifyNormalSessionRuntimeHooks(input);
}

const receipt = await probe();
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
if (receipt.status === "failed") process.exitCode = 1;
else if (receipt.status === "incomplete") process.exitCode = 2;
