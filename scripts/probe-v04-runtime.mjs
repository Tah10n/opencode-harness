import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { materializeProfileBundleV3, ProfileV3Error } from "../lib/profile-v3.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-v04-runtime-"));

function fail(code, message) {
  throw new ProfileV3Error(code, message);
}

function runtimeEnvironment(profileRoot) {
  const configHome = path.join(temporaryRoot, "config");
  const dataHome = path.join(temporaryRoot, "data");
  const stateHome = path.join(temporaryRoot, "state");
  const cacheHome = path.join(temporaryRoot, "cache");
  const npmCache = path.join(temporaryRoot, "npm-cache");
  for (const directory of [configHome, dataHome, stateHome, cacheHome, npmCache]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  return {
    ...process.env,
    XDG_CONFIG_HOME: configHome,
    XDG_DATA_HOME: dataHome,
    XDG_STATE_HOME: stateHome,
    XDG_CACHE_HOME: cacheHome,
    npm_config_cache: npmCache,
    OPENCODE_CONFIG: path.join(profileRoot, "opencode.json"),
    OPENCODE_CONFIG_DIR: profileRoot,
    OPENCODE_DISABLE_AUTOUPDATE: "true",
    OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
    OPENCODE_DISABLE_MODELS_FETCH: "true",
  };
}

function installFixtureHostConfiguration(profileRoot) {
  const nodeExecutable = fs.realpathSync.native(process.execPath);
  const npmCliInput = process.env.npm_execpath;
  if (typeof npmCliInput !== "string" || !fs.existsSync(npmCliInput)) {
    fail("V04_RUNTIME_HOST_CONFIG", "npm CLI identity is unavailable for the assurance probe");
  }
  const npmCli = fs.realpathSync.native(npmCliInput);
  const gitLookup = spawnSync(process.platform === "win32" ? "where.exe" : "which", [
    ...(process.platform === "win32" ? [] : ["-a"]),
    "git",
  ], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  const gitExecutable = gitLookup.status === 0
    ? gitLookup.stdout.split(/\r?\n/u).map((entry) => entry.trim()).filter(Boolean)
      .map((entry) => fs.existsSync(entry) ? fs.realpathSync.native(entry) : null)
      .find((entry) => entry !== null && fs.lstatSync(entry, { bigint: true }).nlink === 1n)
    : undefined;
  if (gitExecutable === undefined) {
    fail("V04_RUNTIME_HOST_CONFIG", "Git identity is unavailable for the assurance probe");
  }
  const npmState = path.join(temporaryRoot, "host-state", "npm");
  fs.mkdirSync(npmState, { recursive: true, mode: 0o700 });
  const trustedRoots = [...new Set([
    fs.realpathSync.native(path.dirname(nodeExecutable)),
    fs.realpathSync.native(path.dirname(npmCli)),
    fs.realpathSync.native(path.dirname(gitExecutable)),
  ])];
  const target = path.join(profileRoot, "plugins", "quality-toolchains.host.v1.json");
  fs.writeFileSync(target, `${JSON.stringify({
    schema_version: 1,
    configuration_id: "v04-runtime-probe",
    trusted_roots: trustedRoots,
    state_roots: { npm: fs.realpathSync.native(npmState) },
    candidates: {
      node: [{ kind: "direct", executable_path: nodeExecutable }],
      npm: [{
        kind: "npm_cli",
        node_executable_path: nodeExecutable,
        npm_cli_path: npmCli,
        state_root: "npm",
      }],
    },
    auxiliary: { git: { kind: "direct", executable_path: gitExecutable } },
  })}\n`, { encoding: "utf8", mode: 0o600 });
  if (process.platform !== "win32") fs.chmodSync(target, 0o600);
}

function runOpenCode(profileRoot, workspaceRoot, args) {
  const result = spawnSync("opencode", args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 60_000,
    env: runtimeEnvironment(profileRoot),
  });
  if (result.error?.code === "ENOENT") fail("V04_RUNTIME_UNAVAILABLE", "opencode executable is unavailable");
  if (result.status !== 0) {
    fail("V04_RUNTIME_PROBE", `${args.join(" ")} failed: ${`${result.stdout}\n${result.stderr}`.trim().slice(-4000)}`);
  }
  return result.stdout.replace(/\u001b\[[0-9;]*m/gu, "");
}


function permissionMatches(pattern, permissionId) {
  return pattern === "*" || pattern === permissionId
    || (pattern.endsWith("*") && permissionId.startsWith(pattern.slice(0, -1)));
}

function effectivePermission(rules, permissionId) {
  let action = null;
  for (const rule of rules) {
    if (permissionMatches(rule.permission, permissionId) && (rule.pattern ?? "*") === "*") {
      action = rule.action;
    }
  }
  return action;
}

function probeAgentPermissions(profileRoot, workspaceRoot, agent, expectedAllows, expectedContextAllows = []) {
  const details = JSON.parse(runOpenCode(profileRoot, workspaceRoot, ["debug", "agent", agent]));
  const expected = new Set(expectedAllows);
  for (const toolId of [
    "quality_assurance_start",
    "quality_assurance_inspect",
    "quality_assurance_advance",
    "quality_assurance_authorize",
  ]) {
    const action = effectivePermission(details.permission, toolId);
    const required = expected.has(toolId) ? "allow" : "deny";
    if (action !== required) {
      fail("V04_RUNTIME_PERMISSION", `${agent} resolves ${toolId} to ${action}, expected ${required}`);
    }
  }
  const expectedContext = new Set(expectedContextAllows);
  for (const toolId of [
    "context_outline",
    "context_files",
    "context_search",
    "context_read",
    "context_write",
    "context_exec",
  ]) {
    const action = effectivePermission(details.permission, toolId);
    const required = expectedContext.has(toolId) ? "allow" : "deny";
    if (action !== required) {
      fail("V04_RUNTIME_PERMISSION", `${agent} resolves ${toolId} to ${action}, expected ${required}`);
    }
  }
  return Object.freeze({
    agent,
    allowed_facade_tools: [...expected],
    allowed_context_tools: [...expectedContext],
  });
}

async function probeToolIds(profileRoot, workspaceRoot) {
  const child = spawn("opencode", [
    "serve", "--port", "0", "--hostname", "127.0.0.1", "--print-logs", "--log-level", "ERROR",
  ], {
    cwd: workspaceRoot,
    env: runtimeEnvironment(profileRoot),
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
  try {
    const serverUrl = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("server startup timed out")), 120_000);
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
        reject(new Error(`server exited with ${code}: ${stderr.slice(-3000)}`));
      });
      inspect();
    });
    const url = new URL("/experimental/tool/ids", serverUrl);
    url.searchParams.set("directory", workspaceRoot);
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) {
      throw new Error(`tool inventory returned HTTP ${response.status}: ${(await response.text()).slice(-2000)}`);
    }
    const ids = await response.json();
    if (!Array.isArray(ids) || ids.some((entry) => typeof entry !== "string")) {
      throw new Error("tool inventory response is invalid");
    }
    return { ids, diagnostics: `${stdout}\n${stderr}`.slice(-6000) };
  } catch (error) {
    fail("V04_RUNTIME_TOOLS", `${error.message}: ${stderr.slice(-3000)}`);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) resolve();
      else {
        child.once("exit", resolve);
        setTimeout(() => {
          if (child.exitCode === null) child.kill("SIGKILL");
        }, 5000);
      }
    });
  }
}

try {
  const evidence = [];
  const materialized = {};
  for (const profile of ["core", "core-v2", "deep", "assurance"]) {
    const output = path.join(temporaryRoot, profile);
    const workspace = path.join(temporaryRoot, "workspaces", profile);
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(path.join(workspace, "fixture.txt"), `${profile}\n`, "utf8");
    if (profile === "assurance") {
      const qualityDirectory = path.join(workspace, ".opencode", "quality");
      fs.mkdirSync(qualityDirectory, { recursive: true });
      for (const name of ["checks.json", "toolchains.json"]) {
        fs.copyFileSync(path.join(root, ".opencode", "quality", name), path.join(qualityDirectory, name));
      }
    }
    materialized[profile] = { profileRoot: output, workspaceRoot: workspace };
    materializeProfileBundleV3({
      repositoryRoot: root,
      bundleId: profile,
      outputDirectory: output,
      allowDirty: true,
    });
    if (profile === "assurance") installFixtureHostConfiguration(output);
    const config = JSON.parse(runOpenCode(output, workspace, ["debug", "config"]));
    const inventory = runOpenCode(output, workspace, ["agent", "list"]);
    const names = [...inventory.matchAll(/^([A-Za-z0-9._-]+) \((?:primary|subagent|all)\)$/gmu)]
      .map((match) => match[1]);
    const required = {
      core: ["core", "core-reviewer"],
      "core-v2": ["build", "core", "core-reviewer", "contract-auditor"],
      deep: ["core", "core-reviewer", "deep", "explore"],
      assurance: ["core", "core-reviewer", "deep", "explore", "assurance", "architect", "reviewer", "verifier"],
    }[profile];
    const expectedDefaultAgent = profile === "core-v2" ? "build" : profile;
    if (config.default_agent !== expectedDefaultAgent || required.some((name) => !names.includes(name))) {
      fail("V04_RUNTIME_DISCOVERY", `${profile} effective runtime profile is incomplete`);
    }
    if (profile !== "assurance" && names.includes("assurance")) {
      fail("V04_RUNTIME_ISOLATION", `${profile} discovered the assurance agent`);
    }
    evidence.push({ profile, default_agent: config.default_agent, required_agents: required });
  }
  const facadeIds = [
    "quality_assurance_start",
    "quality_assurance_inspect",
    "quality_assurance_advance",
    "quality_assurance_authorize",
  ];
  const contextIds = ["context_outline", "context_files", "context_search", "context_read"];
  const permission_matrix = [
    ...["build", "core"].map((agent) => (
      probeAgentPermissions(
        materialized.assurance.profileRoot,
        materialized.assurance.workspaceRoot,
        agent,
        [],
      )
    )),
    ...["deep", "explore"].map((agent) => (
      probeAgentPermissions(
        materialized.assurance.profileRoot,
        materialized.assurance.workspaceRoot,
        agent,
        [],
        contextIds,
      )
    )),
    probeAgentPermissions(
      materialized.assurance.profileRoot,
      materialized.assurance.workspaceRoot,
      "assurance",
      facadeIds,
      contextIds,
    ),
    ...["architect", "verifier"].map((agent) => (
      probeAgentPermissions(
        materialized.assurance.profileRoot,
        materialized.assurance.workspaceRoot,
        agent,
        ["quality_assurance_advance"],
      )
    )),
    probeAgentPermissions(
      materialized.assurance.profileRoot,
      materialized.assurance.workspaceRoot,
      "reviewer",
      ["quality_assurance_advance"],
      contextIds,
    ),
  ];
  const coreProbe = await probeToolIds(materialized.core.profileRoot, materialized.core.workspaceRoot);
  const sourceCoreProbe = await probeToolIds(root, root);
  const assuranceProbe = await probeToolIds(
    materialized.assurance.profileRoot,
    materialized.assurance.workspaceRoot,
  );
  const coreTools = coreProbe.ids;
  const sourceCoreTools = sourceCoreProbe.ids;
  const assuranceTools = assuranceProbe.ids;
  const coreQualityTools = coreTools.filter((entry) => entry.startsWith("quality_"));
  const sourceCoreQualityTools = sourceCoreTools.filter((entry) => entry.startsWith("quality_"));
  const assuranceQualityTools = assuranceTools.filter((entry) => entry.startsWith("quality_"));
  if (coreQualityTools.length !== 0 || sourceCoreQualityTools.length !== 0
    || JSON.stringify(assuranceQualityTools.sort()) !== JSON.stringify([...facadeIds].sort())) {
    fail("V04_RUNTIME_TOOLS", `quality tool isolation failed: core=${coreQualityTools.join(",")}, source-core=${sourceCoreQualityTools.join(",")}, assurance=${assuranceQualityTools.join(",")}; ${assuranceProbe.diagnostics}`);
  }
  if (fs.existsSync(path.join(materialized.core.workspaceRoot, ".oc_harness"))) {
    fail("V04_RUNTIME_STATE", "core runtime probe created persistent quality state");
  }
  process.stdout.write(`${JSON.stringify({
    status: "passed",
    evidence_class: "installed-runtime-structural-probe",
    model_execution: false,
    opencode_version: runOpenCode(
      materialized.core.profileRoot,
      materialized.core.workspaceRoot,
      ["--version"],
    ).trim(),
    profiles: evidence,
    tool_inventory: {
      core_quality_tools: coreQualityTools,
      source_core_quality_tools: sourceCoreQualityTools,
      assurance_quality_tools: assuranceQualityTools,
    },
    permission_matrix,
  }, null, 2)}\n`);
} catch (error) {
  const code = error instanceof ProfileV3Error ? error.code : "V04_RUNTIME_UNEXPECTED";
  process.stderr.write(`${code}: ${error.stack ?? error.message}\n`);
  process.exitCode = code === "V04_RUNTIME_UNAVAILABLE" ? 2 : 1;
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
