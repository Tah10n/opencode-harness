import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { diffContentBoundWorkspaces, observeContentBoundWorkspace } from "../lib/quality/normal-session-workspace.mjs";
import {
  NORMAL_SESSION_HOST_EVIDENCE_PRODUCER,
  NORMAL_SESSION_HOST_EVIDENCE_SCHEMA_VERSION,
  NORMAL_SESSION_HOST_ADAPTER_TIMEOUT_MS,
  blockedNormalSessionHostReceipt,
  createNormalSessionHostScenarioContract,
  normalSessionHostScenarioContractFingerprint,
  normalSessionRuntimeSourceFingerprint,
  parseNormalSessionHostEvidence,
  removeNormalSessionHostProbeWorkspace,
} from "../lib/quality/runtime-hook-verification.mjs";
import { ContractError, fingerprint } from "../lib/quality/validation.mjs";
import {
  MILESTONE_DOD_HOST_SCENARIO_IDS,
  sealMilestone2ReceiptBundle,
  sealOperationalVerificationReceipt,
} from "../lib/quality/milestone-dod.mjs";
import {
  assertMilestone2RunContextStable,
  captureMilestone2RunContext,
} from "../lib/quality/milestone-run-context.mjs";

const root = fs.realpathSync(new URL("..", import.meta.url));
const sourceFingerprint = normalSessionRuntimeSourceFingerprint(root);
const CHANGED_PATH = "allowed.txt";
const EXPECTED_CONTENT = "authorized host mutation\n";
const PROTECTED_PROBE_PATH = "probe.txt";
const PROTECTED_PROBE_CONTENT = "unchanged host probe\n";

function parseArgs(argv) {
  const options = {
    adapter: process.env.OPENCODE_QUALITY_HOOK_E2E_ADAPTER ?? null,
    evidence: null,
    fixtureContract: false,
    milestoneOut: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--fixture-contract") {
      if (options.fixtureContract) throw new ContractError("QUALITY_HOST_ARGUMENT", "fixture contract mode may be selected only once");
      options.fixtureContract = true;
      continue;
    }
    if (!["--adapter", "--evidence", "--milestone-out"].includes(key) || index + 1 >= argv.length) {
      throw new ContractError("QUALITY_HOST_ARGUMENT", `unsupported or incomplete host verification argument: ${key}`);
    }
    const value = argv[++index];
    if (key === "--adapter") options.adapter = value;
    if (key === "--evidence") options.evidence = value;
    if (key === "--milestone-out") options.milestoneOut = value;
  }
  if (options.adapter && options.evidence) {
    throw new ContractError("QUALITY_HOST_ARGUMENT", "adapter and evidence modes are mutually exclusive");
  }
  if (options.fixtureContract && !options.adapter) {
    throw new ContractError("QUALITY_HOST_ARGUMENT", "fixture contract mode requires an adapter");
  }
  if (options.milestoneOut !== null && (typeof options.milestoneOut !== "string"
    || !path.isAbsolute(options.milestoneOut) || path.resolve(options.milestoneOut) !== options.milestoneOut
    || path.normalize(options.milestoneOut) !== options.milestoneOut || options.milestoneOut.includes("\0")
    || Buffer.byteLength(options.milestoneOut, "utf8") > 4096)) {
    throw new ContractError("QUALITY_HOST_ARGUMENT", "milestone output must be a canonical absolute path");
  }
  return options;
}

function sha256(contents) {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertUnaliasedAdapter(candidate) {
  const absolute = path.resolve(candidate);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const component of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (fs.lstatSync(current).isSymbolicLink()) {
      throw new ContractError("QUALITY_HOST_ADAPTER_ALIAS", "host adapter path cannot traverse a symlink or junction");
    }
  }
  const canonical = fs.realpathSync.native(absolute);
  const comparableCanonical = process.platform === "win32" ? canonical.toLowerCase() : canonical;
  const comparableAbsolute = process.platform === "win32" ? absolute.toLowerCase() : absolute;
  if (comparableCanonical !== comparableAbsolute) {
    throw new ContractError("QUALITY_HOST_ADAPTER_ALIAS", "host adapter path must be physically canonical");
  }
  return canonical;
}

function adapterIdentity(target) {
  const stat = fs.statSync(target, { bigint: true });
  if (!stat.isFile() || stat.nlink !== 1n) {
    throw new ContractError("QUALITY_HOST_ADAPTER", "host adapter must be a singly-linked regular file");
  }
  return {
    canonical_path: target,
    device: stat.dev.toString(10),
    inode: stat.ino.toString(10),
    mode: stat.mode.toString(10),
    size: stat.size.toString(10),
    modified_ns: stat.mtimeNs.toString(10),
    changed_ns: stat.ctimeNs.toString(10),
    content_fingerprint: sha256(fs.readFileSync(target)),
  };
}

function sealFailure(reasonCode) {
  const body = {
    schema_version: NORMAL_SESSION_HOST_EVIDENCE_SCHEMA_VERSION,
    producer: NORMAL_SESSION_HOST_EVIDENCE_PRODUCER,
    status: "verification_failed",
    reason_codes: [reasonCode],
    source_fingerprint: sourceFingerprint,
  };
  return { ...body, evidence_fingerprint: fingerprint(body) };
}

function opencodeRuntimeVersion() {
  const result = spawnSync("opencode", ["--version"], {
    shell: false,
    windowsHide: true,
    timeout: 10000,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) return null;
  const version = String(result.stdout).trim();
  return version.length > 0 && Buffer.byteLength(version, "utf8") <= 128 ? version : null;
}

function git(rootPath, args) {
  const result = spawnSync("git", args, {
    cwd: rootPath,
    shell: false,
    windowsHide: true,
    timeout: 10000,
  });
  if (result.error || result.status !== 0) {
    throw new ContractError("QUALITY_HOST_PROBE_GIT", "temporary host probe Git workspace is unavailable");
  }
}

function writeJson(target, value) {
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createProbeWorkspace() {
  const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-host-e2e-"));
  fs.mkdirSync(path.join(probeRoot, ".opencode", "plugins"), { recursive: true });
  fs.mkdirSync(path.join(probeRoot, ".opencode", "quality"), { recursive: true });
  fs.mkdirSync(path.join(probeRoot, "scripts"));
  fs.writeFileSync(path.join(probeRoot, PROTECTED_PROBE_PATH), PROTECTED_PROBE_CONTENT, "utf8");
  fs.writeFileSync(path.join(probeRoot, CHANGED_PATH), "before authorized mutation\n", "utf8");
  fs.writeFileSync(path.join(probeRoot, ".gitignore"), ".oc_harness/\n", "utf8");
  fs.writeFileSync(path.join(probeRoot, "scripts", "probe-pass.mjs"), "process.exitCode = 0;\n", "utf8");
  writeJson(path.join(probeRoot, "package.json"), {
    name: "opencode-harness-host-probe",
    private: true,
    type: "module",
  });
  writeJson(path.join(probeRoot, ".opencode", "quality", "checks.json"), {
    schema_version: 2,
    catalog_id: "host-e2e-checks-v2",
    standard_lite_policy: {
      allowed_ownership_prefixes: [CHANGED_PATH],
      protected_paths: [PROTECTED_PROBE_PATH],
    },
    checks: [{
      check_id: "probe-pass",
      executable_id: "node",
      argv: ["scripts/probe-pass.mjs"],
      cwd: ".",
      phases: ["preimplementation", "integration"],
      purpose: "verification",
      generated_output_paths: [],
      timeout_ms: 30000,
      max_output_chars: 65536,
    }],
  });
  writeJson(path.join(probeRoot, ".opencode", "quality", "toolchains.json"), {
    schema_version: 1,
    map_id: "host-e2e-toolchains-v1",
    toolchains: [{ executable_id: "node", resolver: "node" }],
  });
  const qualityPluginUrl = pathToFileURL(path.join(root, "lib", "quality", "quality-plugin.mjs")).href;
  fs.writeFileSync(path.join(probeRoot, ".opencode", "plugins", "engineering-dossier.mjs"), [
    'import { tool } from "@opencode-ai/plugin";',
    `import { createNormalSessionQualityPlugin } from ${JSON.stringify(qualityPluginUrl)};`,
    "export const EngineeringDossierPlugin = async ({ directory, worktree }) => createNormalSessionQualityPlugin({",
    "  toolFactory: tool,",
    "  workspaceRoot: worktree ?? directory,",
    "});",
    "",
  ].join("\n"), "utf8");
  git(probeRoot, ["init", "-q"]);
  git(probeRoot, ["add", "."]);
  git(probeRoot, ["-c", "user.name=OpenCode Harness", "-c", "user.email=harness@example.invalid", "commit", "-qm", "host probe"]);
  return probeRoot;
}

function validateAdapterTarget(adapter, verificationContext) {
  const target = assertUnaliasedAdapter(adapter);
  if (verificationContext === "installed_host" && isInside(root, target)) {
    throw new ContractError(
      "QUALITY_HOST_ADAPTER_NOT_HOST_OWNED",
      "installed-host verification requires an adapter outside the harness source workspace",
    );
  }
  return target;
}

function runAdapter(target, request) {
  const beforeIdentity = adapterIdentity(target);
  const result = spawnSync(process.execPath, [target], {
    input: `${JSON.stringify(request)}\n`,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: NORMAL_SESSION_HOST_ADAPTER_TIMEOUT_MS,
    maxBuffer: 64 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    throw new ContractError("QUALITY_HOST_ADAPTER_FAILED", "host adapter did not produce successful bounded evidence");
  }
  const afterIdentity = adapterIdentity(target);
  if (fingerprint(beforeIdentity) !== fingerprint(afterIdentity)) {
    throw new ContractError("QUALITY_HOST_ADAPTER_CHANGED", "host adapter identity changed during verification");
  }
  return { serialized: String(result.stdout), adapterFingerprint: fingerprint(beforeIdentity) };
}

function sealAdapterReceipt(parsed, adapterFingerprint, verificationContext) {
  const valid = parsed.status === "evidence_valid";
  const body = {
    schema_version: NORMAL_SESSION_HOST_EVIDENCE_SCHEMA_VERSION,
    producer: NORMAL_SESSION_HOST_EVIDENCE_PRODUCER,
    status: valid
      ? verificationContext === "installed_host" ? "passed" : "fixture_contract_passed"
      : "verification_failed",
    reason_codes: parsed.reason_codes,
    verification_mode: verificationContext === "installed_host" ? "trusted_adapter" : "deterministic_fixture",
    adapter_fingerprint: adapterFingerprint,
    source_fingerprint: parsed.plugin_source_fingerprint,
    probe_workspace_fingerprint: parsed.probe_workspace_fingerprint,
    final_workspace_fingerprint: parsed.final_workspace_fingerprint,
    runtime_version: parsed.runtime_version,
    run_nonce: parsed.run_nonce,
    scenario_contract_fingerprint: parsed.scenario_contract_fingerprint,
    run_binding_fingerprint: parsed.run_binding_fingerprint,
    scenario_receipt_fingerprints: parsed.scenario_receipt_fingerprints,
    trusted_check_receipt_fingerprint: parsed.trusted_check_receipt_fingerprint,
    verification_fingerprint: parsed.verification_fingerprint,
    attestation_fingerprint: parsed.attestation_fingerprint,
    host_evidence_fingerprint: parsed.host_evidence_fingerprint,
  };
  return { ...body, evidence_fingerprint: fingerprint(body) };
}

let receipt;
let options;
let milestoneContext = null;
let temporaryProbe = null;
try {
  options = parseArgs(process.argv.slice(2));
  if (options.milestoneOut !== null) {
    milestoneContext = captureMilestone2RunContext({ workspaceRoot: root, localJobId: "host-hook-e2e" });
  }
  if (options.evidence) {
    receipt = blockedNormalSessionHostReceipt("QUALITY_HOST_EVIDENCE_TRUST_REQUIRED", sourceFingerprint);
  } else if (options.adapter) {
    const verificationContext = options.fixtureContract ? "deterministic_fixture" : "installed_host";
    const adapterTarget = validateAdapterTarget(options.adapter, verificationContext);
    const runtimeVersion = options.fixtureContract ? process.version : opencodeRuntimeVersion();
    if (runtimeVersion === null) {
      receipt = blockedNormalSessionHostReceipt("QUALITY_HOST_RUNTIME_UNAVAILABLE", sourceFingerprint);
    } else {
      temporaryProbe = createProbeWorkspace();
      const before = observeContentBoundWorkspace(temporaryProbe);
      const runNonce = `host-e2e-${randomBytes(16).toString("hex")}`;
      const scenarioContract = createNormalSessionHostScenarioContract(CHANGED_PATH);
      const adapterResult = runAdapter(adapterTarget, {
        schema_version: NORMAL_SESSION_HOST_EVIDENCE_SCHEMA_VERSION,
        verification_context: verificationContext,
        runtime_version: runtimeVersion,
        probe_workspace: temporaryProbe,
        plugin_source_fingerprint: sourceFingerprint,
        probe_workspace_fingerprint: before.source_fingerprint,
        run_nonce: runNonce,
        scenario_contract: scenarioContract,
        scenario_contract_fingerprint: normalSessionHostScenarioContractFingerprint(CHANGED_PATH),
        changed_path: CHANGED_PATH,
        expected_content: EXPECTED_CONTENT,
        protected_probe_path: PROTECTED_PROBE_PATH,
        protected_probe_content: PROTECTED_PROBE_CONTENT,
      });
      const after = observeContentBoundWorkspace(temporaryProbe);
      const changedPaths = diffContentBoundWorkspaces(before, after);
      const finalSourceFingerprint = normalSessionRuntimeSourceFingerprint(root);
      if (finalSourceFingerprint !== sourceFingerprint) {
        receipt = sealFailure("QUALITY_HOST_SOURCE_CHANGED_DURING_RUN");
      } else if (changedPaths.length !== 1 || changedPaths[0] !== CHANGED_PATH) {
        receipt = sealFailure("QUALITY_HOST_UNEXPECTED_WORKSPACE_EFFECT");
      } else if (fs.readFileSync(path.join(temporaryProbe, PROTECTED_PROBE_PATH), "utf8") !== PROTECTED_PROBE_CONTENT) {
        receipt = sealFailure("QUALITY_HOST_PROBE_FILE_CHANGED");
      } else if (fs.readFileSync(path.join(temporaryProbe, CHANGED_PATH), "utf8") !== EXPECTED_CONTENT) {
        receipt = sealFailure("QUALITY_HOST_AUTHORIZED_MUTATION_MISSING");
      } else {
        const parsed = parseNormalSessionHostEvidence(adapterResult.serialized, {
          expectedSourceFingerprint: sourceFingerprint,
          expectedWorkspaceFingerprint: before.source_fingerprint,
          expectedFinalWorkspaceFingerprint: after.source_fingerprint,
          expectedRunNonce: runNonce,
          expectedRuntimeVersion: runtimeVersion,
          expectedVerificationContext: verificationContext,
          expectedChangedPath: CHANGED_PATH,
        });
        receipt = sealAdapterReceipt(parsed, adapterResult.adapterFingerprint, verificationContext);
      }
    }
  } else {
    receipt = blockedNormalSessionHostReceipt(
      opencodeRuntimeVersion() === null ? "QUALITY_HOST_RUNTIME_UNAVAILABLE" : "QUALITY_HOST_ADAPTER_REQUIRED",
      sourceFingerprint,
    );
  }
} catch (error) {
  receipt = sealFailure(error instanceof ContractError ? error.code : "QUALITY_HOST_E2E_UNEXPECTED");
} finally {
  if (temporaryProbe) {
    try {
      removeNormalSessionHostProbeWorkspace(temporaryProbe);
    } catch {
      receipt = sealFailure("QUALITY_HOST_PROBE_CLEANUP");
    }
  }
}

if (milestoneContext !== null) {
  assertMilestone2RunContextStable(milestoneContext, {
    workspaceRoot: root,
    localJobId: "host-hook-e2e",
  });
}

if (options?.milestoneOut !== null && ["passed", "fixture_contract_passed"].includes(receipt.status)) {
  if (receipt.verification_mode !== "trusted_adapter") {
    receipt = sealFailure("QUALITY_HOST_MILESTONE_REQUIRES_INSTALLED_ADAPTER");
  } else {
    const operationalReceipt = sealOperationalVerificationReceipt({
    check_id: "normal-session-host-hook-e2e",
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    status: "passed",
    evidence_scope: {
      kind: "milestone_operational",
      dimension_id: "host_hook_e2e",
      platform: process.platform,
      head_sha: milestoneContext.head_sha,
      workspace_fingerprint: milestoneContext.workspace_fingerprint,
      run_binding: milestoneContext.run_binding,
      result: {
        kind: "installed_host",
        verification_mode: receipt.verification_mode,
        report_fingerprint: receipt.evidence_fingerprint,
        containment_kind: null,
        containment_identity_fingerprints: [],
        teardown_verified: null,
        scenario_ids: [...MILESTONE_DOD_HOST_SCENARIO_IDS],
        trusted_check_receipt_fingerprints: [receipt.trusted_check_receipt_fingerprint],
        scenario_contract_fingerprint: receipt.scenario_contract_fingerprint,
        attestation_fingerprint: receipt.attestation_fingerprint,
        host_evidence_fingerprint: receipt.host_evidence_fingerprint,
      },
    },
  });
    const bundle = sealMilestone2ReceiptBundle({
      dimension_id: "host_hook_e2e",
      head_sha: milestoneContext.head_sha,
      workspace_fingerprint: milestoneContext.workspace_fingerprint,
      run_binding: milestoneContext.run_binding,
      receipts: [operationalReceipt],
    });
    const parent = path.dirname(options.milestoneOut);
    fs.mkdirSync(parent, { recursive: true });
    const canonicalParent = fs.realpathSync.native(parent);
    const comparable = process.platform === "win32"
      ? (value) => value.toLowerCase()
      : (value) => value;
    if (fs.existsSync(options.milestoneOut)
      || comparable(canonicalParent) !== comparable(parent)) {
      throw new Error("milestone host receipt output is not a new file in a canonical directory");
    }
    fs.writeFileSync(options.milestoneOut, `${JSON.stringify(bundle, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  }
}

process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
if (receipt.status === "verification_failed") process.exitCode = 1;
else if (receipt.status === "blocked_external_state") process.exitCode = 2;
