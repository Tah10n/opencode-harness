import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { materializeProfileBundleV3 } from "../lib/profile-v3.mjs";
import { createInjectedTestContainmentFactory } from "./injected-test-containment.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testTrustRoot = process.env.GITHUB_ACTIONS === "true" && process.platform !== "win32" ? os.homedir() : root;
const temporaryRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(testTrustRoot, ".core-installed-runtime-")));
const materializedRoot = path.join(temporaryRoot, "config", "opencode-harness");
const repositoryRoot = path.join(temporaryRoot, "repository");
const workspace = path.join(temporaryRoot, "workspace");
const trustedCheckExecutable = fs.realpathSync.native(process.platform === "win32" ? process.env.ComSpec : "/bin/sh");
const checkArguments = (command) => process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-c", command];

function fail(message) {
  throw new Error(message);
}

function executable(name) {
  const lookup = spawnSync(process.platform === "win32" ? "where.exe" : "which", [name], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (lookup.status !== 0) fail(`${name} is unavailable`);
  return fs.realpathSync.native(lookup.stdout.split(/\r?\n/u)[0].trim());
}

function sse(response, chunks) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  for (const chunk of chunks) response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  response.end("data: [DONE]\n\n");
}

function toolChunks(model, toolName, args, sequence) {
  const base = { id: `chatcmpl-core-${sequence}`, object: "chat.completion.chunk", created: 1, model };
  return [
    { ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] },
    { ...base, choices: [{ index: 0, delta: { tool_calls: [{
      index: 0,
      id: `call-core-${sequence}`,
      type: "function",
      function: { name: toolName, arguments: JSON.stringify(args) },
    }] }, finish_reason: null }] },
    { ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
  ];
}

function finalChunks(model, sequence) {
  const base = { id: `chatcmpl-core-${sequence}`, object: "chat.completion.chunk", created: 1, model };
  return [
    { ...base, choices: [{ index: 0, delta: { role: "assistant", content: "fixture complete" }, finish_reason: null }] },
    { ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
  ];
}

async function fixtureProvider(content, operation) {
  const model = "core-installed-fixture";
  let sequence = 0;
  const server = http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/v1/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ object: "list", data: [{ id: model, object: "model", owned_by: "fixture" }] }));
      return;
    }
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404).end();
      return;
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    const parsed = JSON.parse(body);
    const toolResults = (parsed.messages ?? []).filter((entry) => entry.role === "tool");
    if (toolResults.length === 0) {
      const offered = (parsed.tools ?? []).map((entry) => entry.function?.name);
      const toolName = operation === "write" ? "write" : "bash";
      if (!offered.includes(toolName)) {
        response.writeHead(500).end(`${toolName} tool unavailable: ${offered.join(",")}`);
        return;
      }
      sequence += 1;
      const args = operation === "write" ? {
        filePath: path.join(workspace, "src", "fixture.txt"), content,
      } : {
        command: operation === "delete" ? "rm src/fixture.txt" : "mv src/fixture.txt src/renamed.txt",
        description: operation === "delete" ? "Delete the requested fixture file" : "Rename the requested fixture file",
      };
      sse(response, toolChunks(model, toolName, args, sequence));
      return;
    }
    sequence += 1;
    sse(response, finalChunks(model, sequence));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    model,
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function writeCatalog(command) {
  const gitPath = spawnSync("git", ["rev-parse", "--git-path", "opencode-harness/core/checks.json"], {
    cwd: workspace, encoding: "utf8", shell: false, windowsHide: true,
  });
  assert.equal(gitPath.status, 0, gitPath.stderr);
  const catalogPath = path.resolve(workspace, gitPath.stdout.trim());
  const directory = path.dirname(catalogPath);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(catalogPath, `${JSON.stringify({
    schema_version: 2,
    catalog_id: "real-opencode-installed-fixture",
    checks: [{
      check_id: "fixture-check",
      scope_prefixes: ["src"],
      cost_rank: 1,
      executable_path: fs.realpathSync.native(trustedCheckExecutable),
      argv: checkArguments(command),
      immutable_input_paths: [],
      subject_paths: ["src/fixture.txt"],
      cwd: ".",
      timeout_ms: 10_000,
    }],
  }, null, 2)}\n`, "utf8");
}

function runtimeEnvironment(overlayPath) {
  const directories = Object.fromEntries(["data", "state", "cache", "tmp"].map((name) => {
    const directory = path.join(temporaryRoot, "xdg", name);
    fs.mkdirSync(directory, { recursive: true });
    return [name, directory];
  }));
  const allowed = new Set(["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "TZ",
    "SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "USERPROFILE"]);
  return {
    ...Object.fromEntries(Object.entries(process.env)
      .filter(([key, value]) => allowed.has(key) && typeof value === "string")),
    XDG_CONFIG_HOME: path.dirname(materializedRoot),
    XDG_DATA_HOME: directories.data,
    XDG_STATE_HOME: directories.state,
    XDG_CACHE_HOME: directories.cache,
    TMPDIR: directories.tmp,
    OPENCODE_CONFIG: overlayPath,
    OPENCODE_CONFIG_DIR: materializedRoot,
    OPENCODE_DISABLE_AUTOUPDATE: "true",
    OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
    OPENCODE_DISABLE_MODELS_FETCH: "true",
  };
}

async function installedRun({ content, operation = "write", checkCommand, expectedStatus, expectedReason }) {
  fs.rmSync(path.join(workspace, "src", "renamed.txt"), { force: true });
  fs.writeFileSync(path.join(workspace, "src", "fixture.txt"), "before\n", "utf8");
  const stage = spawnSync("git", ["add", "-A", "src"], { cwd: workspace, encoding: "utf8", shell: false, windowsHide: true });
  assert.equal(stage.status, 0, stage.stderr);
  writeCatalog(checkCommand);
  const provider = await fixtureProvider(content, operation);
  try {
    const sourceConfig = JSON.parse(fs.readFileSync(path.join(materializedRoot, "opencode.json"), "utf8"));
    const overlayPath = path.join(temporaryRoot, `opencode-fixture-${content.trim()}.json`);
    const fixtureConfig = `${JSON.stringify({
      ...sourceConfig,
      permission: { ...sourceConfig.permission, edit: "allow", bash: { "*": "allow" }, external_directory: "allow" },
      provider: {
        fixture: {
          npm: "@ai-sdk/openai-compatible",
          name: "Core installed runtime fixture",
          options: { baseURL: provider.baseUrl, apiKey: "fixture-key" },
          models: { [provider.model]: { name: "Core installed runtime fixture" } },
        },
      },
    }, null, 2)}\n`;
    fs.writeFileSync(overlayPath, fixtureConfig, "utf8");
    // The installed fixture must grant its deterministic model write permission
    // non-interactively. Runtime bytes remain the materialized product bytes.
    fs.writeFileSync(path.join(materializedRoot, "opencode.json"), fixtureConfig, "utf8");
    const installedLauncher = await import(`${pathToFileURL(path.join(materializedRoot, "runtime", "opencode-core.mjs")).href}?fixture=${Date.now()}`);
    const fixtureEnvironment = runtimeEnvironment(overlayPath);
    for (const forbidden of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GITHUB_TOKEN", "GH_TOKEN", "NPM_TOKEN",
      "NODE_OPTIONS", "BASH_ENV", "ENV", "BENCHMARK_V3_CREDENTIAL_FILE"]) {
      assert.equal(Object.hasOwn(fixtureEnvironment, forbidden), false,
        `installed-runtime fixture inherited forbidden host environment variable ${forbidden}`);
    }
    const result = await installedLauncher.runCoreLauncher({
      workspace,
      catalog: ".git/opencode-harness/core/checks.json",
      opencode: executable("opencode"),
      opencodeArgs: [
      "run", "--format", "json", "--model", `fixture/${provider.model}`,
      "--agent", "core", "--dir", workspace,
      "Replace src/fixture.txt with the requested fixture content.",
      ],
      env: fixtureEnvironment,
    }, {
      processContainmentFactory: createInjectedTestContainmentFactory("injected-core-installed-test-containment-v1"),
    });
    assert.equal(result.exit_code, expectedStatus, "launcher status mismatch");
    const receipt = result.receipt;
    assert(receipt, "launcher receipt missing");
    assert.equal(receipt.decision.reason, expectedReason, "launcher reason mismatch");
    assert.equal(receipt.activation.post_last_mutation_verification, expectedReason !== "verification_not_started");
    return receipt;
  } finally {
    await provider.close();
  }
}

try {
  const sentinelEnvironment = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    NODE_OPTIONS: process.env.NODE_OPTIONS };
  process.env.OPENAI_API_KEY = "installed-runtime-forbidden-openai-sentinel";
  process.env.GITHUB_TOKEN = "installed-runtime-forbidden-github-sentinel";
  process.env.NODE_OPTIONS = "--no-warnings";
  const sentinelOverlay = path.join(temporaryRoot, "sentinel-opencode.json");
  const scrubbedSentinelEnvironment = runtimeEnvironment(sentinelOverlay);
  for (const key of Object.keys(sentinelEnvironment)) assert.equal(Object.hasOwn(scrubbedSentinelEnvironment, key), false);
  for (const [key, value] of Object.entries(sentinelEnvironment)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  materializeProfileBundleV3({
    repositoryRoot: root,
    bundleId: "core",
    outputDirectory: materializedRoot,
    allowDirty: true,
  });
  // The deterministic fixture must exercise delete/rename non-interactively.
  // Only fixture permissions are relaxed; runtime bytes under test stay exact.
  const fixtureAgentPath = path.join(materializedRoot, "agents", "core.md");
  fs.writeFileSync(fixtureAgentPath, fs.readFileSync(fixtureAgentPath, "utf8").replaceAll(": ask", ": allow"), "utf8");
  fs.mkdirSync(path.join(repositoryRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(repositoryRoot, "src", "fixture.txt"), "before\n", "utf8");
  const gitInit = spawnSync("git", ["init", "--quiet"], { cwd: repositoryRoot, encoding: "utf8", shell: false });
  assert.equal(gitInit.status, 0, gitInit.stderr);
  for (const [key, value] of [["user.email", "fixture@example.test"], ["user.name", "Fixture"]]) {
    const configured = spawnSync("git", ["config", key, value], { cwd: repositoryRoot, encoding: "utf8", shell: false });
    assert.equal(configured.status, 0, configured.stderr);
  }
  const gitAdd = spawnSync("git", ["add", "src/fixture.txt"], { cwd: repositoryRoot, encoding: "utf8", shell: false });
  assert.equal(gitAdd.status, 0, gitAdd.stderr);
  const committed = spawnSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: repositoryRoot, encoding: "utf8", shell: false });
  assert.equal(committed.status, 0, committed.stderr);
  const worktree = spawnSync("git", ["worktree", "add", "--quiet", "--detach", workspace, "HEAD"], {
    cwd: repositoryRoot, encoding: "utf8", shell: false,
  });
  assert.equal(worktree.status, 0, worktree.stderr);

  const failed = await installedRun({
    content: "failed-check\n",
    checkCommand: "exit 1",
    expectedStatus: 20,
    expectedReason: "verification_failed",
  });
  assert.equal(failed.decision.allowed, false);

  const passed = await installedRun({
    content: "passed-check\n",
    checkCommand: "exit 0",
    expectedStatus: 0,
    expectedReason: "post_last_mutation_verification_passed",
  });
  assert.equal(passed.decision.allowed, true);

  const stale = await installedRun({
    content: "stale-check\n",
    checkCommand: process.platform === "win32" ? "echo mutated-by-check>src\\fixture.txt" : "printf 'mutated-by-check\\n' > src/fixture.txt",
    expectedStatus: 20,
    expectedReason: "verification_not_started",
  });
  assert.equal(stale.activation.mutation_revision, 2);
  assert.equal(fs.existsSync(path.join(workspace, ".oc_harness")), false);

  const deleted = await installedRun({
    content: "delete-check\n",
    operation: "delete",
    checkCommand: "exit 0",
    expectedStatus: 0,
    expectedReason: "post_last_mutation_verification_passed",
  });
  assert.equal(deleted.decision.allowed, true);
  assert.equal(fs.existsSync(path.join(workspace, "src", "fixture.txt")), false);

  const renamed = await installedRun({
    content: "rename-check\n",
    operation: "rename",
    checkCommand: "exit 0",
    expectedStatus: 0,
    expectedReason: "post_last_mutation_verification_passed",
  });
  assert.equal(renamed.decision.allowed, true);
  assert.equal(fs.existsSync(path.join(workspace, "src", "fixture.txt")), false);
  assert.equal(fs.existsSync(path.join(workspace, "src", "renamed.txt")), true);

  process.stdout.write(`${JSON.stringify({
    status: "passed",
    evidence_class: "installed-materialized-core-runtime",
    model_execution: false,
    opencode_version: spawnSync(executable("opencode"), ["--version"], { encoding: "utf8", shell: false }).stdout.trim(),
    cases: ["failed-blocked", "passed-allowed", "post-check-mutation-stale", "tracked-deletion-allowed", "tracked-rename-allowed"],
  }, null, 2)}\n`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
