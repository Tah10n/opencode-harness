import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  cleanupSyntheticProfile,
  materializeVnextSyntheticProfile,
} from "../lib/benchmark/profiles.mjs";
import { inspectSyntheticQualityControlState } from "../lib/benchmark/fixture-control.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "opencode-vnext-runtime-")));

function fail(message) {
  throw new Error(message);
}

function runtimeEnvironment(profile, runtimeId) {
  const runtimeRoot = path.join(temporaryRoot, "runtime", runtimeId);
  const values = Object.fromEntries(["config", "data", "state", "cache", "tmp"].map((name) => {
    const directory = path.join(runtimeRoot, name);
    fs.mkdirSync(directory, { recursive: true });
    return [name, directory];
  }));
  return {
    ...process.env,
    XDG_CONFIG_HOME: values.config,
    XDG_DATA_HOME: values.data,
    XDG_STATE_HOME: values.state,
    XDG_CACHE_HOME: values.cache,
    TMPDIR: values.tmp,
    OPENCODE_CONFIG: profile.configPath,
    OPENCODE_CONFIG_DIR: profile.configDirectory,
    OPENCODE_DISABLE_AUTOUPDATE: "true",
    OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
    OPENCODE_DISABLE_MODELS_FETCH: "true",
  };
}

function installPluginApi(configDirectory) {
  const paths = spawnSync("opencode", ["debug", "paths"], {
    encoding: "utf8", shell: false, windowsHide: true,
  });
  const configMatch = paths.status === 0 ? paths.stdout.match(/^config\s+(.+)$/mu) : null;
  if (configMatch === null) fail("installed OpenCode config path is unavailable");
  const source = path.join(configMatch[1].trim(), "node_modules", "@opencode-ai", "plugin");
  if (!fs.existsSync(source)) fail("installed @opencode-ai/plugin API is unavailable");
  const destination = path.join(configDirectory, "node_modules", "@opencode-ai", "plugin");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, errorOnExist: true });
  const zodSource = path.join(configMatch[1].trim(), "node_modules", "zod");
  const zodDestination = path.join(configDirectory, "node_modules", "zod");
  fs.cpSync(zodSource, zodDestination, { recursive: true, errorOnExist: true });
}

function installHostConfiguration(configDirectory) {
  const sourceNodeExecutable = fs.realpathSync.native(process.execPath);
  const sourceNpmCli = fs.realpathSync.native(process.env.npm_execpath);
  const gitLookup = spawnSync(process.platform === "win32" ? "where.exe" : "which", ["git"], {
    encoding: "utf8", shell: false, windowsHide: true,
  });
  if (gitLookup.status !== 0) fail("Git executable is unavailable for P5 runtime probe");
  const sourceGitExecutable = fs.realpathSync.native(gitLookup.stdout.split(/\r?\n/u)[0].trim());
  const trustedBin = path.join(temporaryRoot, "host-toolchains");
  fs.mkdirSync(trustedBin, { recursive: true, mode: 0o700 });
  const copyTrustedExecutable = (source, name) => {
    const target = path.join(trustedBin, name);
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    if (process.platform !== "win32") fs.chmodSync(target, fs.statSync(source).mode & 0o777);
    return fs.realpathSync.native(target);
  };
  const nodeExecutable = copyTrustedExecutable(sourceNodeExecutable, process.platform === "win32" ? "node.exe" : "node");
  const npmCli = copyTrustedExecutable(sourceNpmCli, "npm-cli.js");
  const gitExecutable = copyTrustedExecutable(sourceGitExecutable, process.platform === "win32" ? "git.exe" : "git");
  const npmState = path.join(temporaryRoot, "host-state", "npm");
  fs.mkdirSync(npmState, { recursive: true, mode: 0o700 });
  const target = path.join(configDirectory, "quality-toolchains.host.v1.json");
  fs.writeFileSync(target, `${JSON.stringify({
    schema_version: 1,
    configuration_id: "vnext-installed-runtime-probe",
    trusted_roots: [...new Set([
      fs.realpathSync.native(path.dirname(nodeExecutable)),
      fs.realpathSync.native(path.dirname(npmCli)),
      fs.realpathSync.native(path.dirname(gitExecutable)),
    ])],
    state_roots: { npm: fs.realpathSync.native(npmState) },
    candidates: {
      node: [{ kind: "direct", executable_path: nodeExecutable }],
      npm: [{ kind: "npm_cli", node_executable_path: nodeExecutable, npm_cli_path: npmCli, state_root: "npm" }],
    },
    auxiliary: { git: { kind: "direct", executable_path: gitExecutable } },
  })}\n`, { encoding: "utf8", mode: 0o600 });
  if (process.platform !== "win32") fs.chmodSync(target, 0o600);
}

function installWorkspaceCatalog(workspaceRoot) {
  const destination = path.join(workspaceRoot, ".git", "opencode-harness", "quality");
  fs.mkdirSync(destination, { recursive: true });
  for (const name of ["checks.json", "toolchains.json"]) {
    fs.copyFileSync(path.join(root, ".opencode", "quality", name), path.join(destination, name));
  }
}

function initializeFixtureRepository(workspaceRoot) {
  const environment = {
    ...process.env,
    GIT_AUTHOR_NAME: "OpenCode vNext runtime probe",
    GIT_AUTHOR_EMAIL: "runtime-probe@invalid.example",
    GIT_COMMITTER_NAME: "OpenCode vNext runtime probe",
    GIT_COMMITTER_EMAIL: "runtime-probe@invalid.example",
  };
  for (const args of [["init", "--quiet"], ["add", "fixture.txt"], ["commit", "--quiet", "-m", "runtime fixture"]]) {
    const result = spawnSync("git", args, { cwd: workspaceRoot, env: environment, encoding: "utf8", shell: false });
    if (result.status !== 0) fail(`fixture Git setup failed: git ${args.join(" ")}\n${result.stderr}`);
  }
}

async function startOpenCode(profile, workspaceRoot, runtimeId) {
  const child = spawn("opencode", [
    "serve", "--port", "0", "--hostname", "127.0.0.1", "--print-logs", "--log-level", "ERROR",
  ], {
    cwd: workspaceRoot,
    env: runtimeEnvironment(profile, runtimeId),
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const serverUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`OpenCode startup timeout: ${stderr.slice(-2000)}`)), 120_000);
    const inspect = () => {
      const match = stdout.match(/http:\/\/127\.0\.0\.1:\d+/u);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    };
    child.stdout.on("data", inspect);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`OpenCode exited ${code}: ${stderr.slice(-3000)}`));
    });
    inspect();
  });
  return { child, serverUrl, diagnostics: () => `${stdout}\n${stderr}` };
}

async function stopChild(child) {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
    setTimeout(() => child.exitCode === null && child.kill("SIGKILL"), 5_000);
  });
}

async function installedToolIds(profile, workspaceRoot, runtimeId) {
  const server = await startOpenCode(profile, workspaceRoot, runtimeId);
  try {
    const url = new URL("/experimental/tool/ids", server.serverUrl);
    url.searchParams.set("directory", workspaceRoot);
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) fail(`tool inventory HTTP ${response.status}: ${(await response.text()).slice(-2000)}`);
    const ids = await response.json();
    if (!Array.isArray(ids)) fail("installed tool inventory is invalid");
    return { ids, diagnostics: server.diagnostics() };
  } catch (error) {
    fail(`${error.message}\n${server.diagnostics().slice(-4000)}`);
  } finally {
    await stopChild(server.child);
  }
}

function sse(res, chunks) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  res.end("data: [DONE]\n\n");
}

function toolChunks(model, toolName, args, sequence) {
  const id = `chatcmpl-vnext-${sequence}`;
  const callId = `call-vnext-${sequence}`;
  const base = { id, object: "chat.completion.chunk", created: 1, model };
  return [
    { ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] },
    { ...base, choices: [{ index: 0, delta: { tool_calls: [{
      index: 0,
      id: callId,
      type: "function",
      function: { name: toolName, arguments: JSON.stringify(args) },
    }] }, finish_reason: null }] },
    { ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
  ];
}

function finalChunks(model, sequence) {
  const base = { id: `chatcmpl-vnext-${sequence}`, object: "chat.completion.chunk", created: 1, model };
  return [
    { ...base, choices: [{ index: 0, delta: { role: "assistant", content: "installed runtime probe complete" }, finish_reason: null }] },
    { ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
  ];
}

async function createToolCallingServer(profileId) {
  const model = "vnext-tool-caller";
  const calls = profileId === "P5" ? [
    ["quality_assurance_start", { request: JSON.stringify({
      risk_class: "high",
      task_type: "maintenance",
      user_visible_goal: "Exercise the installed P5 context surface.",
      ownership_paths: ["fixture.txt"],
      classification_rationale: "installed runtime receipt regression",
      behavior_expectation: "all four bounded context tools return installed runtime evidence",
      expected_preserved_behavior: ["fixture bytes remain unchanged"],
      known_local_edge_cases: ["repeated reads do not duplicate one call receipt"],
      scope_facts: {
        parallel_writable_delegation: false,
        migration: false,
        public_compatibility_change: false,
        architecture_policy_change: false,
        security_sensitive: false,
        persistence_sensitive: false,
        concurrency_sensitive: false,
        unresolved_unknowns: false,
      },
    }) }],
    ["context_outline", {}],
    ["context_files", { path: ".", limit: 32 }],
    ["context_search", { query: "fixture", path: ".", maxMatches: 16 }],
    ["context_read", { path: "fixture.txt", startLine: 1, maxLines: 32, maxBytes: 65536, format: "json" }],
  ] : [
    ["context_outline", {}],
    ["context_files", { path: ".", limit: 32 }],
    ["context_search", { query: "fixture", path: ".", maxMatches: 16 }],
    ["context_read", { path: "fixture.txt", startLine: 1, maxLines: 32, maxBytes: 65536, format: "json" }],
  ];
  let sequence = 0;
  const observed = [];
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ id: model, object: "model", owned_by: "fixture" }] }));
      return;
    }
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    const offeredTools = Array.isArray(request.tools) ? request.tools : [];
    if (offeredTools.length === 0) {
      sse(res, finalChunks(model, 0));
      return;
    }
    const toolResults = (request.messages ?? []).filter((entry) => entry.role === "tool");
    for (const entry of toolResults) {
      if (!observed.some((candidate) => candidate.tool_call_id === entry.tool_call_id)) observed.push(entry);
    }
    const next = calls[sequence];
    sequence += 1;
    sse(res, next === undefined ? finalChunks(model, sequence) : toolChunks(model, next[0], next[1], sequence));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    model,
    baseURL: `http://127.0.0.1:${server.address().port}/v1`,
    expectedCalls: calls.map(([name]) => name),
    observed,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function configureFixtureProvider(profile, baseURL, model) {
  const config = JSON.parse(fs.readFileSync(profile.configPath, "utf8"));
  config.provider = {
    fixture: {
      npm: "@ai-sdk/openai-compatible",
      name: "Installed runtime fixture",
      options: { baseURL, apiKey: "fixture-key" },
      models: { [model]: { name: "Installed runtime fixture model" } },
    },
  };
  fs.writeFileSync(profile.configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function runOpenCode(profile, workspaceRoot, profileId, server) {
  configureFixtureProvider(profile, server.baseURL, server.model);
  const child = spawn("opencode", [
    "run", "--print-logs", "--log-level", "DEBUG", "--format", "json", "--model", `fixture/${server.model}`,
    "--dir", workspaceRoot,
    "--agent", profileId === "P5" ? "assurance" : "deep",
    "Execute the installed runtime probe exactly through the requested tools.",
  ], {
    cwd: workspaceRoot,
    env: runtimeEnvironment(profile, `${profileId}-calls`),
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${profileId} installed tool invocation timed out`));
    }, 180_000);
    child.once("exit", (code) => { clearTimeout(timeout); resolve(code); });
    child.once("error", reject);
  });
  if (exitCode !== 0) fail(`${profileId} installed tool invocation exited ${exitCode}\n${stdout.slice(-3000)}\n${stderr.slice(-5000)}`);
  return { stdout, stderr };
}

try {
  const evidence = [];
  for (const profileId of ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12", "P13", "P14", "P15", "P16", "P17", "P18", "P19", "P20", "P21", "P22", "P23", "P24", "P25", "P26", "P27", "P28", "P29", "P30"]) {
    const profile = materializeVnextSyntheticProfile({ sourceRoot: root, profileId });
    try {
      const workspaceRoot = path.join(temporaryRoot, "workspaces", profileId);
      fs.mkdirSync(workspaceRoot, { recursive: true });
      fs.writeFileSync(path.join(workspaceRoot, "fixture.txt"), `fixture ${profileId}\n`, "utf8");
      if (profileId === "P5") {
        initializeFixtureRepository(workspaceRoot);
        installWorkspaceCatalog(workspaceRoot);
        installHostConfiguration(profile.configDirectory);
      }
      if (profileId === "P5") installPluginApi(profile.configDirectory);
      const inventoryProbe = await installedToolIds(profile, workspaceRoot, `${profileId}-inventory`);
      const ids = inventoryProbe.ids;
      const contextIds = ids.filter((entry) => entry.startsWith("context_")).sort();
      const qualityIds = ids.filter((entry) => entry.startsWith("quality_")).sort();
      if (["P0", "P1", "P2", "P3", "P4", "P6", "P7", "P8", "P9", "P10", "P11", "P12", "P13", "P14", "P15", "P16", "P17", "P18", "P19", "P20", "P21", "P22", "P23", "P24", "P25", "P26", "P27", "P28", "P29", "P30"].includes(profileId)
        && (contextIds.length !== 0 || qualityIds.length !== 0)) {
        fail(`${profileId} unexpectedly exposes context or quality tools`);
      }
      if (profileId === "P5") {
        const expectedContext = ["context_files", "context_outline", "context_read", "context_search"];
        if (JSON.stringify(contextIds) !== JSON.stringify(expectedContext)) {
          fail(`${profileId} context tool inventory mismatch: ${contextIds.join(",")}\n${inventoryProbe.diagnostics.slice(-5000)}`);
        }
        const server = await createToolCallingServer(profileId);
        let invocation;
        try {
          invocation = await runOpenCode(profile, workspaceRoot, profileId, server);
        } finally {
          await server.close();
        }
        const installedCalls = invocation.stdout.split(/\r?\n/u).filter(Boolean).flatMap((line) => {
          try {
            const event = JSON.parse(line);
            return event.type === "tool_use" && event.part?.type === "tool" ? [event.part] : [];
          } catch {
            return [];
          }
        });
        const expectedInstalledCalls = server.expectedCalls;
        if (JSON.stringify(installedCalls.map((entry) => entry.tool)) !== JSON.stringify(expectedInstalledCalls)
          || installedCalls.some((entry) => entry.state?.status !== "completed")) {
          fail(`${profileId} installed tool calls did not complete exactly once: ${JSON.stringify(installedCalls)}\nSTDOUT:\n${invocation?.stdout.slice(-8000)}\nSTDERR:\n${invocation?.stderr.slice(-4000)}`);
        }
        const qualityState = inspectSyntheticQualityControlState(workspaceRoot);
        if (qualityState.context_receipt_count !== 4) {
          fail(`P5 expected exactly four context receipts, observed ${qualityState.context_receipt_count}`);
        }
      }
      evidence.push({ profile_id: profileId, context_tool_ids: contextIds, quality_tool_ids: qualityIds });
    } finally {
      cleanupSyntheticProfile(profile);
    }
  }
  process.stdout.write(`${JSON.stringify({
    status: "passed",
    evidence_class: "installed-runtime-tool-invocation",
    model_execution: false,
    opencode_version: spawnSync("opencode", ["--version"], { encoding: "utf8", shell: false }).stdout.trim(),
    profiles: evidence,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`VNEXT_RUNTIME_PROBE: ${error.stack ?? error.message}\n`);
  process.exitCode = 1;
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
