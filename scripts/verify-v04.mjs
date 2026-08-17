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
  blockedVnextRunReport,
  buildVnextExecutionPlan,
  loadVnextAdapterModule,
  resolveVnextAdapterPath,
  validateVnextAdapterReport,
} from "../lib/benchmark/vnext-runner.mjs";
import { loadSyntheticContracts } from "../lib/benchmark/contracts.mjs";
import {
  loadSyntheticTemplateSet,
  renderSyntheticInstance,
} from "../lib/benchmark/renderer.mjs";
import {
  ASSURANCE_FACADE_TOOL_IDS,
  createAssuranceFacadePlugin,
  createAssuranceFacadeToolSurface,
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

function fakeToolFactory() {
  const chain = () => ({
    describe() { return this; },
    optional() { return this; },
  });
  const toolFactory = (definition) => definition;
  toolFactory.schema = {
    string: chain,
    enum: chain,
    array: chain,
  };
  return toolFactory;
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
    && config.permission["context_*"] === "allow",
  "V04_DEEP_CONFIG", "deep effective config is invalid");
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
  assert(config.default_agent === "assurance" && config.permission["quality_*"] === "deny",
    "V04_ASSURANCE_CONFIG", "assurance config must default to the facade and deny legacy wildcard");
  for (const toolId of ASSURANCE_FACADE_TOOL_IDS) {
    assert(config.permission[toolId] === undefined, "V04_ASSURANCE_CONFIG",
      `${toolId} must not be granted globally to unrelated roles`);
  }
  assertPermissionOrder(read("agents/assurance.md"), '"quality_*": deny', ASSURANCE_FACADE_TOOL_IDS,
    "assurance agent");
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
  for (const plan of plans) {
    const blocked = blockedVnextRunReport(plan, "fixture_external_state_unavailable");
    validateVnextAdapterReport(plan, blocked);
    const stale = structuredClone(blocked);
    stale.bindings.seed = "stale-seed";
    let rejected = false;
    try {
      validateVnextAdapterReport(plan, stale);
    } catch (error) {
      if (!(error instanceof ProfileV3Error)) throw error;
      rejected = error.code === "VNEXT_ADAPTER_REPORT";
    }
    assert(rejected, "V04_LAB_REPORT_BINDING", "stale vnext adapter report was accepted");

    const summary = Object.freeze({
      baseline: 0,
      candidate: 0,
      paired_delta: 0,
      confidence_interval: Object.freeze([0, 0]),
    });
    const metricGroup = (ids) => Object.fromEntries(ids.map((id) => [id, summary]));
    const complete = {
      schema_version: 1,
      run_id: `fixture-${plan.estimand_id}`,
      estimand_id: plan.estimand_id,
      suite_id: plan.suite_id,
      bindings: plan.bindings,
      status: "complete",
      family_results: plan.family_ids.map((familyId) => ({
        family_id: familyId,
        baseline_arm_id: plan.baseline_arm_id,
        candidate_arm_id: plan.candidate_arm_id,
        repetition_count: plan.bindings.runner_limits.trajectory_repetitions,
        status: "complete",
      })),
      product_metrics: metricGroup(plan.metric_ids.product),
      operational_metrics: metricGroup(plan.metric_ids.operational),
      diagnostic_metrics: metricGroup(plan.metric_ids.diagnostic),
      incomplete_outcomes: [],
    };
    validateVnextAdapterReport(plan, complete);
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
    contradictory.product_metrics.functional_hidden_check_success.candidate = 1;
    contradictory.product_metrics.functional_hidden_check_success.paired_delta = 0;
    invalidReports.push(contradictory);
    const scoredBlocked = structuredClone(blocked);
    scoredBlocked.incomplete_outcomes[0].scored = true;
    invalidReports.push(scoredBlocked);
    for (const invalid of invalidReports) {
      let invalidRejected = false;
      try {
        validateVnextAdapterReport(plan, invalid);
      } catch (error) {
        if (!(error instanceof ProfileV3Error)) throw error;
        invalidRejected = error.code === "VNEXT_ADAPTER_REPORT";
      }
      assert(invalidRejected, "V04_LAB_REPORT_SCHEMA", "invalid vnext adapter report was accepted");
    }
  }

  const adapterProbeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-v04-adapter-"));
  try {
    const repository = path.join(adapterProbeRoot, "repository");
    const external = path.join(adapterProbeRoot, "external-adapter.mjs");
    fs.mkdirSync(repository);
    fs.writeFileSync(external, "throw new Error('must not execute');\n", "utf8");
    const linked = path.join(repository, "linked-adapter.mjs");
    fs.symlinkSync(external, linked, "file");
    let linkRejected = false;
    try {
      resolveVnextAdapterPath(repository, linked);
    } catch (error) {
      if (!(error instanceof ProfileV3Error)) throw error;
      linkRejected = error.code === "VNEXT_ADAPTER_PATH";
    }
    assert(linkRejected, "V04_ADAPTER_LINK", "linked external adapter was accepted");
    const hardlinked = path.join(repository, "hardlinked-adapter.mjs");
    fs.linkSync(external, hardlinked);
    let hardlinkRejected = false;
    try {
      resolveVnextAdapterPath(repository, hardlinked);
    } catch (error) {
      if (!(error instanceof ProfileV3Error)) throw error;
      hardlinkRejected = error.code === "VNEXT_ADAPTER_PATH";
    }
    assert(hardlinkRejected, "V04_ADAPTER_HARDLINK", "hardlinked external adapter was accepted");
    const internal = path.join(repository, "adapter.mjs");
    fs.writeFileSync(internal, "export async function runVnextPlan() { return null; }\n", "utf8");
    const loadedAdapter = await loadVnextAdapterModule(repository, internal);
    assert(typeof loadedAdapter.module.runVnextPlan === "function"
      && /^sha256:[0-9a-f]{64}$/u.test(loadedAdapter.fingerprint),
    "V04_ADAPTER_BYTES", "verified adapter bytes were not bound to the loaded module");
    if (process.platform !== "win32") {
      const repositoryAlias = path.join(adapterProbeRoot, "repository-alias");
      fs.symlinkSync(repository, repositoryAlias, "dir");
      assert(resolveVnextAdapterPath(repositoryAlias, path.join(repositoryAlias, "adapter.mjs"))
        === fs.realpathSync.native(internal),
        "V04_ADAPTER_ALIAS", "a valid adapter under a symlinked repository alias was rejected");
    }
  } finally {
    fs.rmSync(adapterProbeRoot, { recursive: true, force: true });
  }
  const legacyContracts = loadSyntheticContracts(root);
  const templateSet = loadSyntheticTemplateSet(root, legacyContracts);
  const rendered = loaded.contract.families.map((family) => renderSyntheticInstance({
    contracts: legacyContracts,
    templateSet,
    familyId: family.source_family_id,
    seed: `vnext-${family.id}`,
    semanticVariantIndex: family.source_semantic_variant,
    repetition: 1,
  }));
  assert(new Set(rendered.map((entry) => entry.instance_fingerprint)).size === rendered.length,
    "V04_LAB_FIXTURE", "vnext families do not render to distinct fixture identities");
  assert(rendered.every((entry) => (entry.hidden_files.length > 0 || entry.hidden_check.kind === "structured-review")
    && entry.hidden_files.every((hidden) => !JSON.stringify({
      prompt: entry.prompt,
      public_files: entry.public_files,
      visible_check: entry.visible_check,
    }).includes(hidden.path))),
  "V04_LAB_HIDDEN", "vnext fixture rendering exposed a hidden path");
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
    const blockedArgs = [
      "scripts/benchmark-vnext-run.mjs", "--suite", "smoke", "--estimand", "plain-to-core-rules",
      "--model", "fixture/model", "--provider", "fixture-provider", "--seed", "fixture-seed",
      "--timeout-ms", "300000", "--executable-identity", "fixture-opencode",
    ];
    if (materializedManifest.source_git_clean) {
      const blockedPlan = run(blockedArgs, 2);
      assert(blockedPlan.status === "blocked-unproven",
        "V04_LAB_MATERIALIZED", "materialized blocked plan was not explicit");
      materialized_checks = { validate: validate.status, self_test: selfTest.status, blocked: blockedPlan.status };
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
      materialized_checks = { validate: validate.status, self_test: selfTest.status, blocked: "rejected-dirty-source" };
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
