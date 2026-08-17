import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  ASSURANCE_FACADE_TOOL_IDS as PROFILE_FACADE_TOOL_IDS,
  MATERIALIZED_MANIFEST_NAME,
  ProfileV3Error,
  V3_BUNDLE_IDS,
  buildProfileBundleManifest,
  fingerprintProfileValue,
  loadProfileInventoryV3,
  loadProfileV3Pointers,
  materializeProfileBundleV3,
  normalizePortablePath,
} from "../lib/profile-v3.mjs";
import {
  loadVnextContracts,
  selfTestVnextContracts,
} from "../lib/benchmark/vnext-contracts.mjs";
import {
  renderVnextInstance,
  validateRenderedVnextInstance,
} from "../lib/benchmark/vnext-fixtures.mjs";
import {
  blockedVnextRunReport,
  buildVnextComparisonReport,
  buildVnextExecutionPlan,
  buildVnextPromotionDecisionFromRun,
  executeVnextPlanModelFreeTest,
  validateVnextFullRunEnvelope,
  validateVnextStandardGate,
  validateVnextArmSurfaceDelta,
  validateVnextRunReport,
} from "../lib/benchmark/vnext-runner.mjs";
import { createBoundedContextToolSurface } from "../lib/benchmark/opencode-context-bridge-plugin.mjs";
import { loadSyntheticContracts } from "../lib/benchmark/contracts.mjs";
import {
  loadSyntheticTemplateSet,
  renderSyntheticInstance,
} from "../lib/benchmark/renderer.mjs";
import {
  ASSURANCE_FACADE_TOOL_IDS,
  createAssuranceFacadePlugin,
  createAssuranceFacadeToolSurface,
  rewriteRoleAssignmentForFacade,
} from "../lib/quality/assurance-facade.mjs";
import { NORMAL_SESSION_QUALITY_TOOL_IDS } from "../lib/quality/normal-session-bridge.mjs";
import { legacyQualityPluginEnabled } from "../lib/quality/normal-session-plugin.mjs";
import { PRIMARY_DEVELOPMENT_AGENTS } from "../lib/quality/session-classification.mjs";
import { ContractError } from "../lib/quality/validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scopeIndex = process.argv.indexOf("--scope");
const scope = scopeIndex === -1 ? "all" : process.argv[scopeIndex + 1];
const validScopes = new Set(["core", "deep", "assurance", "profiles", "adoption", "lab", "all"]);
const V2_INVENTORY_SHA256 = "7e86432871d000d72f60cc562e09f866ba9e9fa7bbc241cd58752791f26f4471";
const LEGACY_TOOL_IDS = Object.freeze([
  "quality_session_start",
  "quality_dossier_create",
  "quality_dossier_update",
  "quality_dossier_inspect",
  "quality_context_strategy_escalate",
  "quality_context_report_create",
  "quality_context_report_update",
  "quality_context_report_finalize",
  "quality_architecture_evaluate",
  "quality_dossier_finalize",
  "quality_action_authorize",
  "quality_project_catalog_rotate",
  "quality_command_authorize",
  "quality_verification_record",
  "quality_context_reviewer_record",
  "quality_context_reconcile",
  "quality_session_finalize",
]);

function fail(code, message) {
  throw new ProfileV3Error(code, message);
}

function assert(condition, code, message) {
  if (!condition) fail(code, message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/^\uFEFF/u, "");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function codePoints(value) {
  return [...value].length;
}

function agentBody(value) {
  return value.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, "");
}

function assertPermissionOrder(source, wildcard, exactIds, label) {
  const wildcardIndex = source.indexOf(wildcard);
  assert(wildcardIndex !== -1, "V04_PERMISSION_ORDER", `${label} is missing ${wildcard}`);
  for (const exactId of exactIds) {
    const exactIndex = source.indexOf(exactId);
    assert(exactIndex > wildcardIndex, "V04_PERMISSION_ORDER",
      `${label} must place ${exactId} after ${wildcard} because the last match wins`);
  }
}

function pathPresent(manifest, prefix) {
  return manifest.files.some((entry) => entry.path === prefix || entry.path.startsWith(`${prefix}/`));
}

function assertMaterializedEsmClosure(bundleRoot, entryPaths) {
  const entries = [...new Set(entryPaths.map((entry) => normalizePortablePath(entry)))].sort();
  for (const relativePath of entries) {
    const absolutePath = path.join(bundleRoot, ...relativePath.split("/"));
    assert(fs.existsSync(absolutePath) && fs.lstatSync(absolutePath).isFile(),
      "V04_LAB_CLOSURE", `materialized command entry is missing: ${relativePath}`);
  }
  return entries;
}

function fakeToolFactory() {
  const chain = () => ({
    describe() { return this; },
    optional() { return this; },
    int() { return this; },
    min() { return this; },
    max() { return this; },
  });
  const toolFactory = (definition) => definition;
  toolFactory.schema = {
    string: chain,
    number: chain,
    boolean: chain,
    enum: chain,
    array: chain,
  };
  return toolFactory;
}

async function verifyBoundedContextSurface() {
  const temporaryRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "opencode-vnext-context-contract-")));
  const execute = async (surface, toolId, args = {}) => JSON.parse(await surface[toolId].execute(args));
  try {
    const sensitivePaths = [
      ".npmrc", ".netrc", ".pypirc", ".git-credentials", "id_rsa", "secrets/prod.json",
      "credentials/cloud.json", ".ssh/id_ed25519", ".kube/config", ".aws/credentials",
      "auth.json", "certificates/client.jks", "mobile/signing.p8", "vault/account.kdbx",
    ];
    for (const relativePath of sensitivePaths) {
      const target = path.join(temporaryRoot, ...relativePath.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "review-secret-token\n", "utf8");
    }
    fs.writeFileSync(path.join(temporaryRoot, "public.txt"), "public needle\n", "utf8");
    let surface = createBoundedContextToolSurface({ toolFactory: fakeToolFactory(), workspaceRoot: temporaryRoot });
    const outline = await execute(surface, "context_outline");
    const files = await execute(surface, "context_files");
    const search = await execute(surface, "context_search", { query: "review-secret-token" });
    assert(outline.filesSample.every((entry) => !sensitivePaths.includes(entry.path))
      && files.files.every((entry) => !sensitivePaths.includes(entry.path))
      && search.matches.length === 0,
    "V04_CONTEXT_SECRET", "context inventory or search exposed a sensitive path");
    for (const relativePath of sensitivePaths) {
      let rejected = false;
      try {
        await execute(surface, "context_read", { path: relativePath });
      } catch {
        rejected = true;
      }
      assert(rejected, "V04_CONTEXT_SECRET", `context_read exposed ${relativePath}`);
    }

    const fileLimitRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "opencode-vnext-context-files-")));
    try {
      for (let index = 0; index < 256; index += 1) {
        fs.writeFileSync(path.join(fileLimitRoot, `f-${String(index).padStart(3, "0")}.txt`), "x", "utf8");
      }
      surface = createBoundedContextToolSurface({ toolFactory: fakeToolFactory(), workspaceRoot: fileLimitRoot });
      const exact = await execute(surface, "context_outline");
      assert(exact.filesSample.length === 256 && exact.coverage.partial === false,
        "V04_CONTEXT_LIMIT", "exact context inventory file boundary was truncated");
      fs.writeFileSync(path.join(fileLimitRoot, "z-overflow.txt"), "x", "utf8");
      surface = createBoundedContextToolSurface({ toolFactory: fakeToolFactory(), workspaceRoot: fileLimitRoot });
      for (const [toolId, args] of [["context_outline", {}], ["context_files", {}], ["context_search", { query: "x" }]]) {
        const partial = await execute(surface, toolId, args);
        assert(partial.coverage.partial === true
          && partial.coverage.truncation.inventoryLimitReached === true,
        "V04_CONTEXT_LIMIT", `${toolId} did not return bounded partial evidence at file limit +1`);
      }
      const direct = await execute(surface, "context_read", { path: "z-overflow.txt" });
      assert(direct.text.includes("x"), "V04_CONTEXT_LIMIT",
        "explicit context_read incorrectly depended on whole-workspace inventory");
    } finally {
      fs.rmSync(fileLimitRoot, { recursive: true, force: true });
    }

    const byteLimitRoot = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "opencode-vnext-context-bytes-")));
    try {
      const chunk = Buffer.alloc(256 * 1024, 0x61);
      for (let index = 0; index < 8; index += 1) fs.writeFileSync(path.join(byteLimitRoot, `${index}.txt`), chunk);
      surface = createBoundedContextToolSurface({ toolFactory: fakeToolFactory(), workspaceRoot: byteLimitRoot });
      const exact = await execute(surface, "context_outline");
      assert(exact.coverage.bytesScanned === 2 * 1024 * 1024 && exact.coverage.partial === false,
        "V04_CONTEXT_LIMIT", "exact context inventory byte boundary was truncated");
      fs.writeFileSync(path.join(byteLimitRoot, "z-overflow.txt"), "x", "utf8");
      surface = createBoundedContextToolSurface({ toolFactory: fakeToolFactory(), workspaceRoot: byteLimitRoot });
      const partial = await execute(surface, "context_outline");
      assert(partial.coverage.partial === true && partial.coverage.truncation.byteLimitReached === true,
        "V04_CONTEXT_LIMIT", "context outline did not return partial evidence at byte limit +1");
    } finally {
      fs.rmSync(byteLimitRoot, { recursive: true, force: true });
    }
    return { status: "passed", sensitive_path_count: sensitivePaths.length };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function runLegacyModelFree(relativeScript, label) {
  const result = spawnSync(process.execPath, [path.join(root, relativeScript)], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 10 * 60 * 1000,
  });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().slice(-5000);
    fail("V04_LEGACY_CHECK", `${label} failed with status ${result.status}: ${output}`);
  }
  return { id: label, status: "passed" };
}

function verifyHighKernelOracles(instances) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-vnext-high-kernels-"));
  try {
    for (const instance of instances) {
      const targetRoot = path.join(fixtureRoot, instance.vnext_family_id);
      for (const file of [...instance.public_files, ...instance.hidden_files]) {
        const target = path.join(targetRoot, ...file.path.split("/"));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.content, "utf8");
      }
      const before = spawnSync(process.execPath, ["--test", "test/hidden.test.mjs"], {
        cwd: targetRoot,
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 10_000,
      });
      assert(before.status !== 0, "V04_LAB_HIGH_ORACLE",
        `${instance.vnext_family_id} hidden oracle does not expose the seeded defect`);
      for (const file of instance.solution_files) {
        const target = path.join(targetRoot, ...file.path.split("/"));
        fs.writeFileSync(target, file.content, "utf8");
      }
      const after = spawnSync(process.execPath, ["--test", "test/public.test.mjs", "test/hidden.test.mjs"], {
        cwd: targetRoot,
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 10_000,
      });
      assert(after.status === 0, "V04_LAB_HIGH_ORACLE",
        `${instance.vnext_family_id} solution does not satisfy both oracles: ${`${after.stdout}\n${after.stderr}`.slice(-2000)}`);
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function verifyMediumTopologyChecks(instances) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-vnext-medium-topology-"));
  try {
    for (const instance of instances) {
      const targetRoot = path.join(fixtureRoot, instance.vnext_family_id);
      for (const file of instance.public_files) {
        const target = path.join(targetRoot, ...file.path.split("/"));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.content, "utf8");
      }
      for (const file of instance.solution_files) {
        const target = path.join(targetRoot, ...file.path.split("/"));
        fs.writeFileSync(target, file.content, "utf8");
      }
      const [command, ...args] = instance.visible_check.argv;
      assert(command === "node", "V04_LAB_MEDIUM_TOPOLOGY",
        `${instance.vnext_family_id} has an unsupported visible-check executable`);
      const result = spawnSync(process.execPath, args, {
        cwd: targetRoot,
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 10_000,
      });
      assert(result.status === 0, "V04_LAB_MEDIUM_TOPOLOGY",
        `${instance.vnext_family_id} has a non-executable consumer graph: ${`${result.stdout}\n${result.stderr}`.slice(-2000)}`);
      const consumerFile = instance.hidden_files.find((entry) => entry.path === "test/hidden-consumer.test.mjs");
      assert(consumerFile !== undefined, "V04_LAB_MEDIUM_TOPOLOGY",
        `${instance.vnext_family_id} has no hidden consumer oracle`);
      const consumerTarget = path.join(targetRoot, ...consumerFile.path.split("/"));
      fs.mkdirSync(path.dirname(consumerTarget), { recursive: true });
      fs.writeFileSync(consumerTarget, consumerFile.content, "utf8");
      const runConsumer = () => spawnSync(process.execPath, instance.consumer_check.argv.slice(1), {
        cwd: targetRoot,
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 10_000,
      });
      const consumerPass = runConsumer();
      assert(consumerPass.status === 0, "V04_LAB_MEDIUM_TOPOLOGY",
        `${instance.vnext_family_id} consumer oracle rejects its reference repair`);
      for (const [relativePath, broken] of [
        ["src/public-api.mjs", "export const family = 'broken';\n"],
        ["src/consumers/worker.mjs", "export const workerContract = [];\n"],
        ["config/feature.json", "{\"family\":\"broken\",\"entry\":\"broken\"}\n"],
        ["docs/contract.md", "# broken\n"],
      ]) {
        const target = path.join(targetRoot, ...relativePath.split("/"));
        const original = fs.readFileSync(target, "utf8");
        fs.writeFileSync(target, broken, "utf8");
        const rejected = runConsumer();
        fs.writeFileSync(target, original, "utf8");
        assert(rejected.status !== 0, "V04_LAB_MEDIUM_TOPOLOGY",
          `${instance.vnext_family_id} consumer oracle ignored broken ${relativePath}`);
      }
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function verifyCore() {
  const loaded = loadProfileInventoryV3(root);
  const agents = read("AGENTS.md");
  const core = read("agents/core.md");
  const coreBody = agentBody(core);
  const combined = codePoints(agents) + codePoints(coreBody);
  assert(combined <= loaded.inventory.prompt_budget.hard_cap_characters,
    "V04_PROMPT_BUDGET", `core prompt budget ${combined} exceeds the hard cap`);
  assert(combined < loaded.inventory.prompt_budget.target_characters,
    "V04_PROMPT_TARGET", `core prompt budget ${combined} misses the target`);
  const rootConfig = readJson("opencode.json");
  const coreConfig = readJson("profiles/config/core.opencode.json");
  assert(rootConfig.default_agent === "core" && coreConfig.default_agent === "core",
    "V04_CORE_DEFAULT", "source and materialized core configs must default to core");
  assert(legacyQualityPluginEnabled(root) === false,
    "V04_CORE_LEGACY_PLUGIN", "source core must disable the auto-discovered legacy quality plugin");
  const legacyActivationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-v04-legacy-"));
  try {
    assert(legacyQualityPluginEnabled(legacyActivationRoot) === true,
      "V04_CORE_LEGACY_PLUGIN", "missing legacy configuration must fail closed");
    fs.writeFileSync(path.join(legacyActivationRoot, "opencode.json"), "{invalid\n", "utf8");
    assert(legacyQualityPluginEnabled(legacyActivationRoot) === true,
      "V04_CORE_LEGACY_PLUGIN", "invalid legacy configuration must fail closed");
  } finally {
    fs.rmSync(legacyActivationRoot, { recursive: true, force: true });
  }
  assert(coreConfig.permission["quality_*"] === "deny"
    && coreConfig.permission["context_*"] === "deny"
    && coreConfig.permission["oc_learning_*"] === "deny",
  "V04_CORE_PERMISSIONS", "core must deny quality, context, and learning surfaces");
  assert(!core.includes("quality_assurance_start: allow")
    && !core.includes("context_outline: allow")
    && coreBody.includes("Stay single-agent for small local work"),
  "V04_CORE_AGENT", "core agent contains a heavy lifecycle or mandatory delegation");
  const manifest = buildProfileBundleManifest(root, "core").manifest;
  for (const forbidden of ["lib/quality", "quality", "native", "lib/benchmark", "benchmarks", "evals", ".opencode/plugins"]) {
    assert(!pathPresent(manifest, forbidden), "V04_CORE_BUNDLE", `core contains forbidden path ${forbidden}`);
  }
  assert(!pathPresent(manifest, "package.json"), "V04_CORE_NODE", "core bundle must not require Node.js at runtime");
  return {
    status: "passed",
    prompt_characters: combined,
    prompt_hard_cap: loaded.inventory.prompt_budget.hard_cap_characters,
    prompt_target: loaded.inventory.prompt_budget.target_characters,
    bundle_file_count: manifest.file_count,
    bundle_total_bytes: manifest.total_bytes,
    bundle_fingerprint: manifest.bundle_fingerprint,
  };
}

function verifyDeep() {
  const deep = read("agents/deep.md");
  const config = readJson("profiles/config/deep.opencode.json");
  assert(config.default_agent === "deep" && config.permission["quality_*"] === "deny"
    && config.permission["context_*"] === "deny",
  "V04_DEEP_CONFIG", "deep effective config is invalid");
  assertPermissionOrder(deep, '"context_*": deny', [
    "context_outline: allow",
    "context_files: allow",
    "context_search: allow",
    "context_read: allow",
  ], "deep agent");
  assert(deep.includes("at most three active") && deep.includes("Do not delegate writes")
    && deep.includes("absence\nnever blocks an ordinary task"),
  "V04_DEEP_AGENT", "deep limits, integrator ownership, or fallback are missing");
  const manifest = buildProfileBundleManifest(root, "deep").manifest;
  for (const forbidden of ["lib/quality", "quality", "native", "lib/benchmark", "benchmarks", "evals", ".opencode/plugins"]) {
    assert(!pathPresent(manifest, forbidden), "V04_DEEP_BUNDLE", `deep contains forbidden path ${forbidden}`);
  }
  assert(pathPresent(manifest, "agents/deep.md") && pathPresent(manifest, "commands/deep.md"),
    "V04_DEEP_BUNDLE", "deep bundle is missing its explicit entry points");
  return {
    status: "passed",
    bundle_file_count: manifest.file_count,
    bundle_total_bytes: manifest.total_bytes,
    bundle_fingerprint: manifest.bundle_fingerprint,
  };
}

function verifyProfiles() {
  const loaded = loadProfileV3Pointers(root);
  const v2Bytes = fs.readFileSync(path.join(root, "profiles/inventory.v2.json"));
  assert(sha256(v2Bytes) === V2_INVENTORY_SHA256,
    "V04_V2_DRIFT", "profiles/inventory.v2.json changed from the frozen baseline");
  assert(readJson("opencode.json").default_agent === loaded.inventory.default_runtime_profile_id,
    "V04_PROFILE_DEFAULT", "source config and v3 default profile drifted");
  assert(JSON.stringify(NORMAL_SESSION_QUALITY_TOOL_IDS) === JSON.stringify(LEGACY_TOOL_IDS),
    "V04_LEGACY_TOOL_DRIFT", "legacy 17-tool order or membership changed");
  assert(PRIMARY_DEVELOPMENT_AGENTS.includes("assurance"),
    "V04_ASSURANCE_IDENTITY", "assurance is not a recognized primary runner identity");
  const vnext = loadVnextContracts(root).validation;
  return {
    status: "passed",
    inventory_fingerprint: loaded.fingerprint,
    v2_sha256: V2_INVENTORY_SHA256,
    profile_ids: loaded.inventory.profiles.map((entry) => entry.id),
    bundle_ids: Object.keys(loaded.pointers),
    vnext,
  };
}

function verifyAssurance() {
  assert(JSON.stringify(ASSURANCE_FACADE_TOOL_IDS) === JSON.stringify(PROFILE_FACADE_TOOL_IDS),
    "V04_FACADE_DRIFT", "runtime and profile facade tool IDs differ");
  assert(ASSURANCE_FACADE_TOOL_IDS.length >= 3 && ASSURANCE_FACADE_TOOL_IDS.length <= 5,
    "V04_FACADE_SIZE", "assurance facade must expose three to five operations");
  assert(ASSURANCE_FACADE_TOOL_IDS.every((entry) => !LEGACY_TOOL_IDS.includes(entry)),
    "V04_FACADE_COLLISION", "facade collides with a legacy tool ID");
  const surface = createAssuranceFacadeToolSurface({
    toolFactory: fakeToolFactory(),
    bridge: Object.freeze({}),
  });
  assert(JSON.stringify(Object.keys(surface)) === JSON.stringify(ASSURANCE_FACADE_TOOL_IDS),
    "V04_FACADE_SURFACE", "model-visible facade surface is not exact");
  const assignmentOutput = { args: { prompt: [
    "[runner quality assignment]",
    "MANDATORY QUALITY BOUNDARY",
    "Use assignment.request as the typed tool arguments when present.",
    JSON.stringify({
      schema_version: 1,
      target_agent: "architect",
      assignment: {
        tool_id: "quality_architecture_evaluate",
        request: { expected_revision: 7, blocker_summaries: [] },
        instruction: "Call quality_architecture_evaluate once.",
      },
    }),
    "[end runner quality assignment]",
    "",
    "[caller task context]",
    "fixed",
  ].join("\n") } };
  rewriteRoleAssignmentForFacade({ tool: "task" }, assignmentOutput);
  const rewrittenEnvelope = JSON.parse(assignmentOutput.args.prompt.split("\n")[3]);
  assert(rewrittenEnvelope.assignment.tool_id === "quality_assurance_advance"
    && rewrittenEnvelope.assignment.request.transition === "architecture-evaluate"
    && rewrittenEnvelope.assignment.request.request === '{"blocker_summaries":[]}'
    && !rewrittenEnvelope.assignment.request.request.includes("expected_revision"),
  "V04_FACADE_ASSIGNMENT", "architect child assignment was not structurally rebound to facade arguments");
  const facadeSource = read("lib/quality/assurance-facade.mjs");
  for (const deadTransition of ["dossier-create", "context-report-create", "project-catalog-rotate"]) {
    assert(!facadeSource.includes(`\"${deadTransition}\": Object.freeze`), "V04_FACADE_TRANSITION",
      `unreachable facade transition remains advertised: ${deadTransition}`);
  }
  for (const bridgeOptions of [null, [], { hostToolchainAnchorUrl: import.meta.url }, {
    hostToolchainConfigurationLease: {},
  }]) {
    let rejected = false;
    try {
      createAssuranceFacadePlugin({
        toolFactory: fakeToolFactory(),
        workspaceRoot: root,
        bridgeOptions,
      });
    } catch (error) {
      if (!(error instanceof ContractError)) throw error;
      rejected = ["QUALITY_PLUGIN_API", "QUALITY_TOOLCHAIN_HOST_CONFIG_BOUNDARY"].includes(error.code);
    }
    assert(rejected, "V04_FACADE_HOST_BOUNDARY", "facade accepted invalid or smuggled host configuration");
  }
  const config = readJson("profiles/config/assurance.opencode.json");
  assert(config.default_agent === "assurance" && config.permission["quality_*"] === "deny"
    && config.permission["context_*"] === "deny",
    "V04_ASSURANCE_CONFIG", "assurance config must default to the facade and deny legacy wildcard");
  for (const toolId of ASSURANCE_FACADE_TOOL_IDS) {
    assert(config.permission[toolId] === undefined, "V04_ASSURANCE_CONFIG",
      `${toolId} must not be granted globally to unrelated roles`);
  }
  assertPermissionOrder(read("agents/assurance.md"), '"quality_*": deny', ASSURANCE_FACADE_TOOL_IDS,
    "assurance agent");
  assertPermissionOrder(read("agents/assurance.md"), '"context_*": deny', [
    "context_outline: allow",
    "context_files: allow",
    "context_search: allow",
    "context_read: allow",
  ], "assurance context tools");
  assertPermissionOrder(read("agents/assurance-reviewer.md"), '"context_*": deny', [
    "context_outline: allow",
    "context_files: allow",
    "context_search: allow",
    "context_read: allow",
  ], "assurance reviewer context tools");
  for (const role of ["architect", "reviewer", "verifier"]) {
    assertPermissionOrder(read(`agents/assurance-${role}.md`), '"quality_*": deny',
      ["quality_assurance_advance: allow"], `assurance ${role}`);
  }
  const manifest = buildProfileBundleManifest(root, "assurance").manifest;
  assert(pathPresent(manifest, "plugins/assurance.mjs"),
    "V04_ASSURANCE_BUNDLE", "assurance facade plugin is missing");
  assert(!pathPresent(manifest, ".opencode/plugins/engineering-dossier.mjs"),
    "V04_ASSURANCE_BUNDLE", "legacy 17-tool plugin leaked into the assurance model surface");
  for (const forbidden of ["benchmarks", "evals", "lib/benchmark"]) {
    assert(!pathPresent(manifest, forbidden), "V04_ASSURANCE_BUNDLE", `assurance contains lab path ${forbidden}`);
  }
  const legacy_checks = [
    runLegacyModelFree("scripts/verify-normal-session-quality-bridge.mjs", "assurance-facade-lifecycle"),
    runLegacyModelFree("scripts/verify-quality-contracts.mjs", "quality-contracts"),
    runLegacyModelFree("scripts/verify-quality-architecture.mjs", "quality-architecture"),
    runLegacyModelFree("scripts/verify-process-containment.mjs", "process-containment"),
  ];
  return {
    status: "passed",
    facade_tool_ids: ASSURANCE_FACADE_TOOL_IDS,
    legacy_tool_count: LEGACY_TOOL_IDS.length,
    bundle_file_count: manifest.file_count,
    bundle_total_bytes: manifest.total_bytes,
    bundle_fingerprint: manifest.bundle_fingerprint,
    legacy_checks,
  };
}

function verifyMaterializedConfig(output, expectedAgent) {
  const config = JSON.parse(fs.readFileSync(path.join(output, "opencode.json"), "utf8"));
  assert(config.default_agent === expectedAgent,
    "V04_MATERIALIZED_CONFIG", `${expectedAgent} output has the wrong default agent`);
  assert(fs.existsSync(path.join(output, MATERIALIZED_MANIFEST_NAME)),
    "V04_MATERIALIZED_MANIFEST", `${expectedAgent} output is missing its manifest`);
}

function verifyAdoption() {
  loadProfileV3Pointers(root);
  const manifests = Object.fromEntries(V3_BUNDLE_IDS.map((bundleId) => {
    const first = buildProfileBundleManifest(root, bundleId).manifest;
    const second = buildProfileBundleManifest(root, bundleId).manifest;
    assert(first.bundle_fingerprint === second.bundle_fingerprint,
      "V04_BUNDLE_STABILITY", `${bundleId} fingerprint is unstable`);
    return [bundleId, first];
  }));
  for (const invalid of ["../escape", "/absolute", "C:/drive", "a\\b", "a/CON", "a/trailing."]) {
    let rejected = false;
    try {
      normalizePortablePath(invalid);
    } catch (error) {
      if (!(error instanceof ProfileV3Error)) throw error;
      rejected = true;
    }
    assert(rejected, "V04_PORTABLE_PATH", `unsafe path was accepted: ${invalid}`);
  }

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-v04-adoption-"));
  try {
    const dryParent = path.join(temporaryRoot, "absent-parent");
    materializeProfileBundleV3({
      repositoryRoot: root,
      bundleId: "core",
      outputDirectory: path.join(dryParent, "core"),
      dryRun: true,
      allowDirty: true,
    });
    assert(!fs.existsSync(dryParent), "V04_DRY_RUN_WRITE", "dry-run created an output parent");
    for (const profile of ["core", "deep", "assurance"]) {
      const output = path.join(temporaryRoot, profile);
      materializeProfileBundleV3({
        repositoryRoot: root,
        bundleId: profile,
        outputDirectory: output,
        allowDirty: true,
      });
      verifyMaterializedConfig(output, profile);
      let refused = false;
      try {
        materializeProfileBundleV3({
          repositoryRoot: root,
          bundleId: profile,
          outputDirectory: output,
          allowDirty: true,
        });
      } catch (error) {
        if (!(error instanceof ProfileV3Error) || error.code !== "PROFILE_V3_OVERWRITE") throw error;
        refused = true;
      }
      assert(refused, "V04_OVERWRITE", `${profile} overwrote output without --force`);
    }
    const forced = materializeProfileBundleV3({
      repositoryRoot: root,
      bundleId: "core",
      outputDirectory: path.join(temporaryRoot, "core"),
      overwrite: true,
      allowDirty: true,
    });
    assert(forced.backup_directory !== null && fs.existsSync(forced.backup_directory),
      "V04_OVERWRITE_BACKUP", "managed overwrite did not preserve a backup");

    const assuranceOutput = path.join(temporaryRoot, "assurance");
    const hostConfiguration = path.join(assuranceOutput, "plugins", "quality-toolchains.host.v1.json");
    const hostConfigurationBytes = Buffer.from('{"fixture":"host-owned"}\n', "utf8");
    fs.writeFileSync(hostConfiguration, hostConfigurationBytes, { mode: 0o600 });
    if (process.platform !== "win32") fs.chmodSync(hostConfiguration, 0o600);
    materializeProfileBundleV3({
      repositoryRoot: root,
      bundleId: "assurance",
      outputDirectory: assuranceOutput,
      overwrite: true,
      allowDirty: true,
    });
    assert(fs.readFileSync(hostConfiguration).equals(hostConfigurationBytes),
      "V04_HOST_CONFIG_PRESERVATION", "managed replacement did not preserve host-owned configuration");
    const updatedHostConfigurationBytes = Buffer.from('{"fixture":"host-updated"}\n', "utf8");
    let inPlaceConflict = false;
    try {
      materializeProfileBundleV3({
        repositoryRoot: root,
        bundleId: "assurance",
        outputDirectory: assuranceOutput,
        overwrite: true,
        allowDirty: true,
        testBeforeDestinationCommit: () => {
          fs.writeFileSync(hostConfiguration, updatedHostConfigurationBytes, { mode: 0o600 });
        },
      });
    } catch (error) {
      if (!(error instanceof ProfileV3Error)) throw error;
      inPlaceConflict = error.code === "PROFILE_V3_HOST_CONFIG_CONFLICT";
    }
    assert(inPlaceConflict && fs.readFileSync(hostConfiguration).equals(updatedHostConfigurationBytes),
      "V04_HOST_CONFIG_CONFLICT", "in-place host configuration update was rolled back");

    const replacedHostConfigurationBytes = Buffer.from('{"fixture":"host-replaced"}\n', "utf8");
    let replacementConflict = false;
    try {
      materializeProfileBundleV3({
        repositoryRoot: root,
        bundleId: "assurance",
        outputDirectory: assuranceOutput,
        overwrite: true,
        allowDirty: true,
        testBeforeDestinationCommit: () => {
          const replacement = path.join(path.dirname(hostConfiguration), `.host-replacement-${crypto.randomUUID()}`);
          fs.writeFileSync(replacement, replacedHostConfigurationBytes, { mode: 0o600 });
          fs.renameSync(replacement, hostConfiguration);
        },
      });
    } catch (error) {
      if (!(error instanceof ProfileV3Error)) throw error;
      replacementConflict = error.code === "PROFILE_V3_HOST_CONFIG_CONFLICT";
    }
    assert(replacementConflict && fs.readFileSync(hostConfiguration).equals(replacedHostConfigurationBytes),
      "V04_HOST_CONFIG_REPLACEMENT", "atomic host configuration replacement was rolled back");

    const recoveryOutput = path.join(temporaryRoot, "recovery-core");
    materializeProfileBundleV3({
      repositoryRoot: root,
      bundleId: "core",
      outputDirectory: recoveryOutput,
      allowDirty: true,
    });
    const recoveryId = crypto.randomUUID();
    const recoveryBackup = path.join(temporaryRoot, `.recovery-core.backup-${recoveryId}`);
    const recoveryStaging = path.join(temporaryRoot, `.recovery-core.staging-${recoveryId}`);
    const recoveryLock = path.join(temporaryRoot, ".recovery-core.materialize.lock");
    fs.renameSync(recoveryOutput, recoveryBackup);
    fs.mkdirSync(recoveryStaging, { mode: 0o700 });
    fs.writeFileSync(path.join(recoveryStaging, "partial"), "interrupted\n", "utf8");
    fs.writeFileSync(recoveryLock, `${JSON.stringify({
      schema_version: 2,
      transaction_id: recoveryId,
      owner_pid: 2147483647,
      created_at_ms: Date.now(),
      bundle_id: "core",
      destination_name: "recovery-core",
      destination_was_present: true,
      staging_name: path.basename(recoveryStaging),
      backup_name: path.basename(recoveryBackup),
    })}\n`, { encoding: "utf8", mode: 0o600 });
    materializeProfileBundleV3({
      repositoryRoot: root,
      bundleId: "core",
      outputDirectory: recoveryOutput,
      overwrite: true,
      allowDirty: true,
    });
    verifyMaterializedConfig(recoveryOutput, "core");
    assert(!fs.existsSync(recoveryLock) && !fs.existsSync(recoveryStaging),
      "V04_RECOVERY", "fresh materializer invocation did not recover stale transaction state");

    const liveOutput = path.join(temporaryRoot, "live-core");
    materializeProfileBundleV3({
      repositoryRoot: root,
      bundleId: "core",
      outputDirectory: liveOutput,
      allowDirty: true,
    });
    const liveId = crypto.randomUUID();
    const liveStaging = path.join(temporaryRoot, `.live-core.staging-${liveId}`);
    const liveBackup = path.join(temporaryRoot, `.live-core.backup-${liveId}`);
    const liveLock = path.join(temporaryRoot, ".live-core.materialize.lock");
    fs.mkdirSync(liveStaging, { mode: 0o700 });
    fs.writeFileSync(liveLock, `${JSON.stringify({
      schema_version: 2,
      transaction_id: liveId,
      owner_pid: process.pid,
      created_at_ms: Date.now(),
      bundle_id: "core",
      destination_name: "live-core",
      destination_was_present: true,
      staging_name: path.basename(liveStaging),
      backup_name: path.basename(liveBackup),
    })}\n`, { encoding: "utf8", mode: 0o600 });
    let liveRefused = false;
    try {
      materializeProfileBundleV3({
        repositoryRoot: root,
        bundleId: "core",
        outputDirectory: liveOutput,
        overwrite: true,
        allowDirty: true,
      });
    } catch (error) {
      if (!(error instanceof ProfileV3Error)) throw error;
      liveRefused = error.code === "PROFILE_V3_BUSY";
    }
    assert(liveRefused && fs.existsSync(liveLock) && fs.existsSync(liveStaging),
      "V04_LIVE_TRANSACTION", "a live materializer transaction was disturbed");
    fs.unlinkSync(liveLock);
    fs.rmSync(liveStaging, { recursive: true });

    const forgedOutput = path.join(temporaryRoot, "forged-core");
    materializeProfileBundleV3({
      repositoryRoot: root,
      bundleId: "core",
      outputDirectory: forgedOutput,
      allowDirty: true,
    });
    const forgedId = crypto.randomUUID();
    const unrelatedStaging = path.join(temporaryRoot, `.forged-core.staging-${forgedId}-unrelated`);
    const forgedLock = path.join(temporaryRoot, ".forged-core.materialize.lock");
    fs.mkdirSync(unrelatedStaging, { mode: 0o700 });
    fs.writeFileSync(forgedLock, `${JSON.stringify({
      schema_version: 2,
      transaction_id: forgedId,
      owner_pid: 2147483647,
      created_at_ms: Date.now(),
      bundle_id: "core",
      destination_name: "forged-core",
      destination_was_present: true,
      staging_name: path.basename(unrelatedStaging),
      backup_name: null,
    })}\n`, { encoding: "utf8", mode: 0o600 });
    let forgedRefused = false;
    try {
      materializeProfileBundleV3({
        repositoryRoot: root,
        bundleId: "core",
        outputDirectory: forgedOutput,
        overwrite: true,
        allowDirty: true,
      });
    } catch (error) {
      if (!(error instanceof ProfileV3Error)) throw error;
      forgedRefused = error.code === "PROFILE_V3_RECOVERY";
    }
    assert(forgedRefused && fs.existsSync(unrelatedStaging),
      "V04_FORGED_TRANSACTION", "a forged transaction removed an unrelated directory");
    fs.unlinkSync(forgedLock);
    fs.rmSync(unrelatedStaging, { recursive: true });

    const linkTarget = path.join(temporaryRoot, "link-target");
    const linkOutput = path.join(temporaryRoot, "link-output");
    fs.mkdirSync(linkTarget);
    fs.symlinkSync(linkTarget, linkOutput, process.platform === "win32" ? "junction" : "dir");
    let linkRejected = false;
    try {
      materializeProfileBundleV3({
        repositoryRoot: root,
        bundleId: "core",
        outputDirectory: linkOutput,
        overwrite: true,
        allowDirty: true,
      });
    } catch (error) {
      if (!(error instanceof ProfileV3Error)) throw error;
      linkRejected = ["PROFILE_V3_DESTINATION", "PROFILE_V3_OVERWRITE_LINK"].includes(error.code);
    }
    assert(linkRejected, "V04_DESTINATION_LINK", "destination link was not rejected");
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
  return {
    status: "passed",
    bundles: Object.fromEntries(Object.entries(manifests).map(([id, manifest]) => [
      id,
      {
        file_count: manifest.file_count,
        total_bytes: manifest.total_bytes,
        fingerprint: manifest.bundle_fingerprint,
      },
    ])),
  };
}

async function verifyLab() {
  const context_surface = await verifyBoundedContextSurface();
  const runnerExports = await import("../lib/benchmark/vnext-runner.mjs");
  assert(!Object.hasOwn(runnerExports, "applyVnextPromotionPolicy"),
    "V04_LAB_PROMOTION", "standalone comparison promotion API remains publicly callable");
  const vnextRunCliSource = read("scripts/benchmark-vnext-run.mjs");
  assert(vnextRunCliSource.includes("completedEnvelope = executed;")
    && vnextRunCliSource.includes("JSON.stringify(completedEnvelope"),
  "V04_LAB_FULL_CLI", "full CLI no longer emits the exact trusted full envelope");
  const loaded = loadVnextContracts(root);
  const validation = loaded.validation;
  const self_test = selfTestVnextContracts(root);
  const plans = loaded.contract.estimands.map((estimand) => buildVnextExecutionPlan({
    repositoryRoot: root,
    suiteId: "smoke",
    estimandId: estimand.id,
    model: "fixture/model",
    provider: "fixture-provider",
    variant: "fixture-variant",
    seed: "vnext-model-free-plan",
    timeoutMs: 300_000,
    executableIdentity: "fixture-opencode-identity",
    allowDirty: true,
  }));
  assert(plans.every((plan) => plan.family_ids.length === plan.eligible_strata.length
    && Object.keys(plan.bindings).length === loaded.policy.required_bindings.length),
  "V04_LAB_PLAN", "smoke plan family or evidence binding coverage drifted");
  const unrelatedSurface = structuredClone(plans[0].arms.candidate);
  unrelatedSurface.runtime_surface.effective_config.unrelated_permission = "allow";
  const compoundDelta = validateVnextArmSurfaceDelta(
    plans[0].arms.baseline,
    unrelatedSurface,
    plans[0].transition_anchor_component_id,
    loaded.inventory.vnext_transition_surface_anchors[plans[0].transition_anchor_component_id],
  );
  assert(compoundDelta.estimand_kind === "compound-profile-transition"
    && compoundDelta.changed_leaf_paths.includes("/effective_config/unrelated_permission"),
  "V04_LAB_ARM_DELTA", "compound transition did not bind its complete observed surface delta");
  const gateFixturePromotion = {
    source_run_fingerprint: `sha256:${"1".repeat(64)}`,
    comparison_fingerprint: `sha256:${"2".repeat(64)}`,
    decision_fingerprint: `sha256:${"3".repeat(64)}`,
  };
  const gateFixture = {
    standard_run_fingerprint: gateFixturePromotion.source_run_fingerprint,
    standard_comparison_fingerprint: gateFixturePromotion.comparison_fingerprint,
    standard_promotion_decision_fingerprint: gateFixturePromotion.decision_fingerprint,
  };
  validateVnextStandardGate(gateFixture, gateFixturePromotion);
  for (const key of Object.keys(gateFixture)) {
    let rejected = false;
    try {
      validateVnextStandardGate({ ...gateFixture, [key]: `sha256:${"0".repeat(64)}` }, gateFixturePromotion);
    } catch (error) {
      if (!(error instanceof ProfileV3Error)) throw error;
      rejected = error.code === "VNEXT_FULL_GATE";
    }
    assert(rejected, "V04_LAB_FULL_GATE", `substituted ${key} was accepted`);
  }
  let forgedFullDecisionRejected = false;
  try {
    buildVnextExecutionPlan({
      repositoryRoot: root,
      suiteId: "full",
      estimandId: loaded.contract.estimands[0].id,
      model: "fixture/model",
      provider: "fixture-provider",
      variant: "fixture-variant",
      seed: "vnext-model-free-plan",
      timeoutMs: 300_000,
      executableIdentity: "fixture-opencode-identity",
      standardRun: {
        report_kind: "vnext-compound-profile-transition-comparison",
        suite_id: "standard",
        estimand_id: loaded.contract.estimands[0].id,
        status: "complete",
        verdict: "promote",
        decision_fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      },
      allowDirty: true,
    });
  } catch (error) {
    if (!(error instanceof ProfileV3Error)) throw error;
    forgedFullDecisionRejected = error.code === "VNEXT_FULL_GATE";
  }
  assert(forgedFullDecisionRejected, "V04_LAB_FULL_GATE",
    "a caller-fabricated standard decision unlocked a full vNext plan");
  for (const plan of plans) {
    const blocked = blockedVnextRunReport(plan, "fixture_external_state_unavailable");
    validateVnextRunReport(plan, blocked);
    const stale = structuredClone(blocked);
    stale.bindings.seed = "stale-seed";
    let rejected = false;
    try {
      validateVnextRunReport(plan, stale);
    } catch (error) {
      if (!(error instanceof ProfileV3Error)) throw error;
      rejected = error.code === "VNEXT_ADAPTER_REPORT";
    }
    assert(rejected, "V04_LAB_REPORT_BINDING", "stale vnext run report was accepted");
    if (plan === plans[0]) {
      const fullEnvelopePlan = structuredClone(plan);
      fullEnvelopePlan.suite_id = "full";
      fullEnvelopePlan.standard_gate = gateFixture;
      const { plan_fingerprint: _smokeFingerprint, ...fullEnvelopePlanSource } = fullEnvelopePlan;
      fullEnvelopePlan.plan_fingerprint = fingerprintProfileValue(fullEnvelopePlanSource);
      const fullEnvelopeReport = blockedVnextRunReport(fullEnvelopePlan, "fixture_full_blocked");
      const fullEnvelopeSource = {
        schema_version: 1,
        run_kind: "vnext-full-run-envelope",
        plan: fullEnvelopePlan,
        report: fullEnvelopeReport,
        standard_gate: gateFixture,
      };
      const fullEnvelope = {
        ...fullEnvelopeSource,
        envelope_fingerprint: fingerprintProfileValue(fullEnvelopeSource),
      };
      validateVnextFullRunEnvelope(fullEnvelope);
      const mismatchedFullEnvelopeSource = {
        ...fullEnvelopeSource,
        standard_gate: { ...gateFixture, standard_run_fingerprint: `sha256:${"9".repeat(64)}` },
      };
      let mismatchedFullEnvelopeRejected = false;
      try {
        validateVnextFullRunEnvelope({
          ...mismatchedFullEnvelopeSource,
          envelope_fingerprint: fingerprintProfileValue(mismatchedFullEnvelopeSource),
        });
      } catch (error) {
        if (!(error instanceof ProfileV3Error)) throw error;
        mismatchedFullEnvelopeRejected = error.code === "VNEXT_FULL_ENVELOPE";
      }
      assert(mismatchedFullEnvelopeRejected, "V04_LAB_FULL_GATE",
        "full envelope standard gate drifted from its plan without rejection");
      for (const [id, mutate] of [
        ["stale-source", (candidate) => { candidate.bindings.source_sha = "0".repeat(40); }],
        ["stale-policy", (candidate) => { candidate.bindings.policy_fingerprint = `sha256:${"0".repeat(64)}`; }],
        ["stale-evaluator", (candidate) => { candidate.bindings.evaluator_fingerprint = `sha256:${"0".repeat(64)}`; }],
        ["noncanonical-schedule", (candidate) => { candidate.pair_schedule.reverse(); }],
      ]) {
        const noncanonicalPlan = structuredClone(plan);
        mutate(noncanonicalPlan);
        const { plan_fingerprint: _priorPlanFingerprint, ...noncanonicalSource } = noncanonicalPlan;
        noncanonicalPlan.plan_fingerprint = fingerprintProfileValue(noncanonicalSource);
        let noncanonicalRejected = false;
        try {
          buildVnextComparisonReport({ repositoryRoot: root, plan: noncanonicalPlan, report: blocked });
        } catch (error) {
          if (!(error instanceof ProfileV3Error)) throw error;
          noncanonicalRejected = error.code === "VNEXT_PLAN_NONCANONICAL";
        }
        assert(noncanonicalRejected, "V04_LAB_CANONICAL_PLAN",
          `${id} plan was accepted by compare against current source and contracts`);
      }
      const fakeProducer = structuredClone(blocked);
      fakeProducer.trusted_producer.producer_id = "untrusted-fixture";
      fakeProducer.evidence_fingerprint = fingerprintProfileValue({
        plan_fingerprint: plan.plan_fingerprint,
        evidence_class: fakeProducer.evidence_class,
        trusted_producer: fakeProducer.trusted_producer,
        pair_results: fakeProducer.pair_results,
        incomplete_outcomes: fakeProducer.incomplete_outcomes,
      });
      let fakeProducerRejected = false;
      try {
        validateVnextRunReport(plan, fakeProducer);
      } catch (error) {
        if (!(error instanceof ProfileV3Error)) throw error;
        fakeProducerRejected = error.code === "VNEXT_TRUSTED_PRODUCER";
      }
      assert(fakeProducerRejected, "V04_LAB_TRUSTED_PRODUCER",
        "a fake run producer was accepted as trusted evidence");
    }

    const sharedBinding = Object.freeze(Object.fromEntries([
      "public_fixture_fingerprint", "hidden_fixture_fingerprint", "task_scope_fingerprint",
      "effective_public_input_fingerprint", "initial_public_manifest_fingerprint", "model_fingerprint",
      "executable_fingerprint", "executable_version", "executable_basename", "executable_platform",
      "executable_identity_policy_version", "timeout_ms", "limits_fingerprint", "adapter_protocol_version",
    ].map((key) => [key, key === "timeout_ms" ? 300_000 : `fixture-${key}`])));
    const fakeAttemptRunner = async ({ profileId, operationalRunId, instance }) => ({
      binding: sharedBinding,
      result: {
        profile_id: profileId,
        profile_fingerprint: profileId === plan.baseline_arm_id
          ? plan.arms.baseline.profile_fingerprint : plan.arms.candidate.profile_fingerprint,
        operational_run_id: operationalRunId,
        execution_status: "completed",
        termination_reason: "verified",
        reason: null,
        hidden_check: { passed: true },
        workspace_policy: { passed: true },
        task_correct: true,
        whole_task_success: true,
        defect_escape_v2: false,
        trace_policy: { passed: true, violations: [] },
        treatment_compliance: { passed: true, violations: [] },
        evidence_complete: true,
        audit_evidence: {
          scope: {
            changed_path_count: 1,
            changed_allowed_paths: ["src/task.mjs"],
            unexpected_path_count: 0,
          },
          control: { attested_owner_count: profileId === "P5" ? 1 : 0 },
        },
        metrics: {
          duration_ms: 10,
          model_turn_count: 1,
          total_tool_call_count: 2,
          subagent_call_count: profileId === "P0" ? 0 : 1,
        },
        operational_trace_id: `trace-${operationalRunId}`,
        vnext_consumer_observation: {
          required_consumer_ids: instance.required_consumer_ids ?? [],
          preserved_consumer_count: instance.required_consumer_ids?.length ?? 0,
          check_status: instance.required_consumer_ids === undefined ? "not_applicable" : "passed",
          passed: true,
        },
        fingerprints: { adapter: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      },
    });
    const complete = await executeVnextPlanModelFreeTest({
      repositoryRoot: root,
      plan,
      attemptRunner: fakeAttemptRunner,
      executableIdentity: "fixture-opencode-identity",
    });
    assert(complete.status === "complete" && complete.pair_results.length === plan.pair_schedule.length,
      "V04_LAB_TRUSTED_RUNNER", "runner-owned fixture attempt execution did not produce complete pair evidence");
    validateVnextRunReport(plan, complete);
    const comparison = buildVnextComparisonReport({ repositoryRoot: root, plan, report: complete });
    const envelopeSource = {
      schema_version: 1,
      run_kind: "vnext-run-envelope",
      plan,
      report: complete,
    };
    const envelope = {
      ...envelopeSource,
      envelope_fingerprint: fingerprintProfileValue(envelopeSource),
    };
    let modelFreePromotionRejected = false;
    try {
      buildVnextPromotionDecisionFromRun({ repositoryRoot: root, envelope });
    } catch (error) {
      if (!(error instanceof ProfileV3Error)) throw error;
      modelFreePromotionRejected = error.code === "VNEXT_PROMOTION_PROVENANCE";
    }
    assert(comparison.verdict === "inconclusive" && modelFreePromotionRejected,
      "V04_LAB_PROMOTION", "model-free smoke evidence was accepted as promotion evidence");
    const relabelledReport = structuredClone(complete);
    relabelledReport.evidence_class = "model-backed-contained-run";
    relabelledReport.trusted_producer = {
      producer_id: "opencode-harness-vnext-contained-runner",
      schema_version: 1,
      engine_fingerprint: plan.bindings.adapter_fingerprint,
      executable_identity: plan.bindings.executable_identity,
    };
    relabelledReport.evidence_fingerprint = fingerprintProfileValue({
      plan_fingerprint: plan.plan_fingerprint,
      evidence_class: relabelledReport.evidence_class,
      trusted_producer: relabelledReport.trusted_producer,
      pair_results: relabelledReport.pair_results,
      incomplete_outcomes: relabelledReport.incomplete_outcomes,
    });
    const relabelledEnvelopeSource = {
      schema_version: 1,
      run_kind: "vnext-run-envelope",
      plan,
      report: relabelledReport,
    };
    const relabelledEnvelope = {
      ...relabelledEnvelopeSource,
      envelope_fingerprint: fingerprintProfileValue(relabelledEnvelopeSource),
    };
    let relabelledRejected = false;
    try {
      buildVnextPromotionDecisionFromRun({ repositoryRoot: root, envelope: relabelledEnvelope });
    } catch (error) {
      if (!(error instanceof ProfileV3Error)) throw error;
      relabelledRejected = error.code === "VNEXT_PROMOTION_PROVENANCE";
    }
    assert(relabelledRejected, "V04_LAB_PROMOTION",
      "a relabelled model-free report was accepted as model-backed promotion evidence");
    if (plan === plans[0]) {
      const standardPlan = buildVnextExecutionPlan({
        repositoryRoot: root,
        suiteId: "standard",
        estimandId: plan.estimand_id,
        model: "fixture/model",
        provider: "fixture-provider",
        variant: "fixture-variant",
        seed: "vnext-model-free-plan",
        timeoutMs: 300_000,
        executableIdentity: "fixture-opencode-identity",
        allowDirty: true,
      });
      const forgedAttemptRunner = async (input) => {
        const attempt = structuredClone(await fakeAttemptRunner(input));
        const candidate = input.profileId === standardPlan.candidate_arm_id;
        attempt.result.hidden_check.passed = candidate;
        attempt.result.task_correct = candidate;
        attempt.result.whole_task_success = candidate;
        return attempt;
      };
      const forgedStandard = await executeVnextPlanModelFreeTest({
        repositoryRoot: root,
        plan: standardPlan,
        attemptRunner: forgedAttemptRunner,
        executableIdentity: "fixture-opencode-identity",
      });
      const forgedEnvelopeSource = {
        schema_version: 1,
        run_kind: "vnext-run-envelope",
        plan: standardPlan,
        report: forgedStandard,
      };
      const forgedEnvelope = {
        ...forgedEnvelopeSource,
        envelope_fingerprint: fingerprintProfileValue(forgedEnvelopeSource),
      };
      let forgedDecisionRejected = false;
      try {
        buildVnextPromotionDecisionFromRun({ repositoryRoot: root, envelope: forgedEnvelope });
      } catch (error) {
        if (!(error instanceof ProfileV3Error)) throw error;
        forgedDecisionRejected = error.code === "VNEXT_PROMOTION_PROVENANCE";
      }
      assert(forgedDecisionRejected,
        "V04_LAB_FULL_GATE", "model-free fabricated standard run was accepted as promotion evidence");
      let forgedEnvelopeRejected = false;
      try {
        buildVnextExecutionPlan({
          repositoryRoot: root,
          suiteId: "full",
          estimandId: plan.estimand_id,
          model: "fixture/model",
          provider: "fixture-provider",
          variant: "fixture-variant",
          seed: "vnext-model-free-plan",
          timeoutMs: 300_000,
          executableIdentity: "fixture-opencode-identity",
          standardRun: forgedEnvelope,
          allowDirty: true,
        });
      } catch (error) {
        if (!(error instanceof ProfileV3Error)) throw error;
        forgedEnvelopeRejected = error.code === "VNEXT_FULL_GATE";
      }
      assert(forgedEnvelopeRejected, "V04_LAB_FULL_GATE",
        "a self-consistent fabricated standard run unlocked full outside the in-process trusted runner");
    }
    if (plan.estimand_id === "core-reviewed-to-deep") {
      const guardrailPlan = buildVnextExecutionPlan({
        repositoryRoot: root,
        suiteId: "standard",
        estimandId: plan.estimand_id,
        model: "fixture/model",
        provider: "fixture-provider",
        variant: "fixture-variant",
        seed: "vnext-small-negative-control",
        timeoutMs: 300_000,
        executableIdentity: "fixture-opencode-identity",
        allowDirty: true,
      });
      const familyStrata = new Map(loaded.contract.families.map((entry) => [entry.id, entry.stratum]));
      const harmfulSmallRunner = async (input) => {
        const attempt = structuredClone(await fakeAttemptRunner(input));
        const stratum = familyStrata.get(input.instance.family_id);
        const candidate = input.profileId === guardrailPlan.candidate_arm_id;
        if (stratum === "medium") {
          attempt.result.vnext_consumer_observation.preserved_consumer_count = candidate
            ? attempt.result.vnext_consumer_observation.required_consumer_ids.length : 0;
        }
        if (stratum === "small" && candidate) {
          attempt.result.hidden_check.passed = false;
          attempt.result.task_correct = false;
          attempt.result.whole_task_success = false;
        }
        return attempt;
      };
      const harmfulSmallReport = await executeVnextPlanModelFreeTest({
        repositoryRoot: root,
        plan: guardrailPlan,
        attemptRunner: harmfulSmallRunner,
        executableIdentity: "fixture-opencode-identity",
      });
      const harmfulSmallComparison = buildVnextComparisonReport({
        repositoryRoot: root,
        plan: guardrailPlan,
        report: harmfulSmallReport,
      });
      const smallGuardrail = harmfulSmallComparison.guardrail_results.find(
        (entry) => entry.id === "small-negative-control-delta-minimum",
      );
      assert(harmfulSmallComparison.verdict === "reject" && smallGuardrail?.passed === false,
        "V04_LAB_SMALL_NEGATIVE_CONTROL",
        "medium improvement with a harmful small-task control did not force rejection");
    }
    const invalidReports = [];
    const emptyComplete = structuredClone(complete);
    emptyComplete.product_metrics = {};
    invalidReports.push(emptyComplete);
    const missingFamily = structuredClone(complete);
    missingFamily.family_results.pop();
    invalidReports.push(missingFamily);
    const duplicateFamily = structuredClone(complete);
    duplicateFamily.family_results.push(structuredClone(duplicateFamily.family_results[0]));
    invalidReports.push(duplicateFamily);
    const outOfRange = structuredClone(complete);
    outOfRange.product_metrics.functional_hidden_check_success.candidate = 2;
    invalidReports.push(outOfRange);
    const contradictory = structuredClone(complete);
    contradictory.product_metrics.functional_hidden_check_success.candidate = 0;
    contradictory.product_metrics.functional_hidden_check_success.paired_delta = 0;
    invalidReports.push(contradictory);
    const fabricatedPair = structuredClone(complete);
    fabricatedPair.pair_results[0].candidate.observations.functional_hidden_check_success = 0;
    invalidReports.push(fabricatedPair);
    const scoredBlocked = structuredClone(blocked);
    scoredBlocked.incomplete_outcomes[0].scored = true;
    invalidReports.push(scoredBlocked);
    for (const invalid of invalidReports) {
      let invalidRejected = false;
      try {
        validateVnextRunReport(plan, invalid);
      } catch (error) {
        if (!(error instanceof ProfileV3Error)) throw error;
        invalidRejected = error.code === "VNEXT_ADAPTER_REPORT";
      }
      assert(invalidRejected, "V04_LAB_REPORT_SCHEMA", "invalid vnext run report was accepted");
    }
  }

  const rendered = loaded.contract.families.map((family) => validateRenderedVnextInstance(
    renderVnextInstance({ repositoryRoot: root, family, seed: `vnext-${family.id}`, repetition: 1 }),
    family,
  ));
  assert(new Set(rendered.map((entry) => entry.instance_fingerprint)).size === rendered.length,
    "V04_LAB_FIXTURE", "vnext families do not render to distinct fixture identities");
  assert(rendered.every((entry) => (entry.hidden_files.length > 0 || entry.hidden_check.kind === "structured-review")
    && entry.hidden_files.every((hidden) => !JSON.stringify({
      prompt: entry.prompt,
      public_files: entry.public_files,
      visible_check: entry.visible_check,
    }).includes(hidden.path))),
  "V04_LAB_HIDDEN", "vnext fixture rendering exposed a hidden path");
  const highKernels = rendered.filter((entry) => entry.high_risk_contract !== undefined)
    .map((entry) => entry.high_risk_contract.kernel_id);
  assert(highKernels.length === 11 && new Set(highKernels).size === highKernels.length,
    "V04_LAB_HIGH_KERNEL", "high-risk strata do not have distinct executable contracts");
  verifyMediumTopologyChecks(rendered.filter((entry) => entry.risk === "medium"));
  verifyHighKernelOracles(rendered.filter((entry) => entry.high_risk_contract !== undefined));
  const lab = buildProfileBundleManifest(root, "lab").manifest;
  assert(pathPresent(lab, "lib/profile-v3.mjs"),
    "V04_LAB_CLOSURE", "lab bundle is missing the vnext profile dependency");
  assert(!pathPresent(lab, "evals/reports") && !pathPresent(lab, "evals/decisions"),
    "V04_LAB_STATE", "lab bundle contains generated reports or decisions");
  const legacy_checks = [
    runLegacyModelFree("scripts/benchmark-synthetic-validate.mjs", "synthetic-v2-contracts"),
    runLegacyModelFree("scripts/verify-report-history.mjs", "historical-report-readers"),
    runLegacyModelFree("scripts/verify-trace-store.mjs", "trace-store"),
  ];
  const materializedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-v04-lab-"));
  let materialized_checks;
  try {
    const output = path.join(materializedRoot, "lab");
    materializeProfileBundleV3({
      repositoryRoot: root,
      bundleId: "lab",
      outputDirectory: output,
      allowDirty: true,
    });
    const materializedManifest = JSON.parse(fs.readFileSync(
      path.join(output, MATERIALIZED_MANIFEST_NAME),
      "utf8",
    ));
    const labPackage = JSON.parse(fs.readFileSync(path.join(output, "package.json"), "utf8"));
    const declaredCommands = Object.values(labPackage.scripts ?? {}).map((command) => {
      const match = /^node ([A-Za-z0-9._/-]+)$/u.exec(command);
      assert(match !== null, "V04_LAB_PACKAGE", `unsupported materialized lab command: ${command}`);
      return match[1];
    });
    assert(JSON.stringify(Object.keys(labPackage.scripts ?? {}).sort()) === JSON.stringify([
      "bench:vnext:compare", "bench:vnext:promote", "bench:vnext:run", "bench:vnext:self-test", "bench:vnext:validate",
    ]), "V04_LAB_PACKAGE", "materialized lab package exposes commands outside its supported closure");
    const closure = assertMaterializedEsmClosure(output, declaredCommands);
    const run = (args, expectedStatus = 0) => {
      const result = spawnSync(process.execPath, args, {
        cwd: output,
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 10 * 60 * 1000,
      });
      assert(result.status === expectedStatus, "V04_LAB_MATERIALIZED",
        `${args.join(" ")} failed with status ${result.status}: ${`${result.stdout}\n${result.stderr}`.trim().slice(-3000)}`);
      return JSON.parse(result.stdout);
    };
    const validate = run(["scripts/benchmark-vnext-validate.mjs"]);
    const selfTest = run(["scripts/benchmark-vnext-self-test.mjs"]);
    for (const [script, expectedCode] of [
      ["scripts/benchmark-vnext-compare.mjs", "VNEXT_COMPARISON_ARGUMENT"],
      ["scripts/benchmark-vnext-promote.mjs", "VNEXT_PROMOTION_ARGUMENT"],
    ]) {
      const probe = spawnSync(process.execPath, [script], {
        cwd: output,
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 30_000,
      });
      assert(probe.status === 1 && probe.stderr.includes(expectedCode), "V04_LAB_MATERIALIZED",
        `${script} did not expose its bounded argument contract`);
    }
    const blockedArgs = [
      "scripts/benchmark-vnext-run.mjs", "--suite", "smoke", "--estimand", "plain-to-core-rules",
      "--model", "fixture/model", "--provider", "fixture-provider", "--seed", "fixture-seed",
      "--timeout-ms", "300000", "--plan-only",
    ];
    if (materializedManifest.source_git_clean) {
      const dryPlan = spawnSync(process.execPath, blockedArgs, {
        cwd: output,
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 10 * 60 * 1000,
      });
      if (dryPlan.status === 0) {
        const parsedPlan = JSON.parse(dryPlan.stdout);
        assert(parsedPlan.plan_kind === "vnext-compound-profile-transition-plan" && parsedPlan.pair_schedule.length > 0,
          "V04_LAB_MATERIALIZED", "materialized plan-only command did not bind executable pairs");
        materialized_checks = { validate: validate.status, self_test: selfTest.status, plan_only: "passed", esm_closure_files: closure.length };
      } else {
        assert(dryPlan.status === 1 && dryPlan.stderr.includes("VNEXT_EXECUTABLE_UNAVAILABLE"),
          "V04_LAB_MATERIALIZED", `materialized plan-only command failed outside its executable-availability contract: ${dryPlan.stderr}`);
        materialized_checks = {
          validate: validate.status,
          self_test: selfTest.status,
          plan_only: "blocked-executable-unavailable",
          esm_closure_files: closure.length,
        };
      }
    } else {
      const dirtyPlan = spawnSync(process.execPath, blockedArgs, {
        cwd: output,
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 10 * 60 * 1000,
      });
      assert(dirtyPlan.status === 1 && dirtyPlan.stderr.includes("VNEXT_SOURCE_DIRTY"),
        "V04_LAB_MATERIALIZED", "dirty materialized source was accepted for model-backed planning");
      materialized_checks = { validate: validate.status, self_test: selfTest.status, plan_only: "rejected-dirty-source", esm_closure_files: closure.length };
    }
  } finally {
    fs.rmSync(materializedRoot, { recursive: true, force: true });
  }
  return {
    status: "passed",
    validation,
    self_test,
    smoke_plan_count: plans.length,
    rendered_fixture_count: rendered.length,
    rendered_fixture_fingerprint: fingerprintProfileValue(rendered.map((entry) => ({
      family_id: entry.family_id,
      instance_fingerprint: entry.instance_fingerprint,
    }))),
    bundle_file_count: lab.file_count,
    bundle_total_bytes: lab.total_bytes,
    bundle_fingerprint: lab.bundle_fingerprint,
    legacy_checks,
    materialized_checks,
    context_surface,
  };
}

async function runScope(selected) {
  if (selected === "core") return { core: verifyCore() };
  if (selected === "deep") return { deep: verifyDeep() };
  if (selected === "assurance") return { assurance: verifyAssurance() };
  if (selected === "profiles") return { profiles: verifyProfiles() };
  if (selected === "adoption") return { adoption: verifyAdoption() };
  if (selected === "lab") return { lab: await verifyLab() };
  return {
    core: verifyCore(),
    deep: verifyDeep(),
    profiles: verifyProfiles(),
    adoption: verifyAdoption(),
    assurance: verifyAssurance(),
    lab: await verifyLab(),
  };
}

try {
  if (!validScopes.has(scope)) fail("V04_SCOPE", `unknown verification scope ${scope}`);
  const checks = await runScope(scope);
  process.stdout.write(`${JSON.stringify({
    status: "passed",
    evidence_class: "model-free-validation",
    model_execution: false,
    scope,
    checks,
  }, null, 2)}\n`);
} catch (error) {
  const code = error instanceof ProfileV3Error ? error.code : "V04_UNEXPECTED";
  process.stderr.write(`${code}: ${error.message}\n`);
  process.exitCode = 1;
}
