import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { diffContentBoundWorkspaces, observeContentBoundWorkspace } from "../lib/quality/normal-session-workspace.mjs";
import {
  blockedNormalSessionHostReceipt,
  normalSessionRuntimeSourceFingerprint,
  parseNormalSessionHostEvidence,
} from "../lib/quality/runtime-hook-verification.mjs";
import { ContractError, fingerprint } from "../lib/quality/validation.mjs";

const root = fs.realpathSync(new URL("..", import.meta.url));
const sourceFingerprint = normalSessionRuntimeSourceFingerprint(root);

function parseArgs(argv) {
  const options = { adapter: process.env.OPENCODE_QUALITY_HOOK_E2E_ADAPTER ?? null, evidence: null };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!["--adapter", "--evidence"].includes(key) || index + 1 >= argv.length) {
      throw new ContractError("QUALITY_HOST_ARGUMENT", `unsupported or incomplete host verification argument: ${key}`);
    }
    const value = argv[++index];
    if (key === "--adapter") options.adapter = value;
    if (key === "--evidence") options.evidence = value;
  }
  if (options.adapter && options.evidence) throw new ContractError("QUALITY_HOST_ARGUMENT", "adapter and evidence modes are mutually exclusive");
  return options;
}

function sha256(contents) {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

function sealFailure(reasonCode) {
  const body = {
    schema_version: 1,
    producer: "opencode-harness/normal-session-host-e2e-v1",
    status: "verification_failed",
    reason_codes: [reasonCode],
    source_fingerprint: sourceFingerprint,
  };
  return { ...body, evidence_fingerprint: fingerprint(body) };
}

function opencodeAvailable() {
  const result = spawnSync("opencode", ["--version"], { shell: false, windowsHide: true, timeout: 10000, encoding: "utf8" });
  return !result.error && result.status === 0;
}

function git(rootPath, args) {
  const result = spawnSync("git", args, { cwd: rootPath, shell: false, windowsHide: true, timeout: 10000 });
  if (result.error || result.status !== 0) throw new ContractError("QUALITY_HOST_PROBE_GIT", "temporary host probe Git workspace is unavailable");
}

function createProbeWorkspace() {
  const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-host-e2e-"));
  fs.mkdirSync(path.join(probeRoot, ".opencode", "plugins"), { recursive: true });
  fs.mkdirSync(path.join(probeRoot, ".opencode", "quality"), { recursive: true });
  fs.mkdirSync(path.join(probeRoot, "scripts"));
  fs.writeFileSync(path.join(probeRoot, "probe.txt"), "unchanged host probe\n", "utf8");
  fs.writeFileSync(path.join(probeRoot, "allowed.txt"), "before authorized mutation\n", "utf8");
  fs.writeFileSync(path.join(probeRoot, ".gitignore"), ".oc_harness/\n", "utf8");
  fs.writeFileSync(path.join(probeRoot, "scripts", "probe-pass.mjs"), "process.exitCode = 0;\n", "utf8");
  fs.writeFileSync(path.join(probeRoot, "scripts", "authorized-change.mjs"), [
    'import fs from "node:fs";',
    'import path from "node:path";',
    'fs.writeFileSync(path.resolve("allowed.txt"), "authorized host mutation\\n", "utf8");',
    "",
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(probeRoot, "package.json"), `${JSON.stringify({
    name: "opencode-harness-host-probe",
    private: true,
    type: "module",
    scripts: { "probe-pass": "node scripts/probe-pass.mjs" },
  }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(probeRoot, ".opencode", "quality", "checks.json"), `${JSON.stringify({
    schema_version: 1,
    catalog_id: "host-e2e-checks-v1",
    checks: [{
      check_id: "probe-pass",
      argv: ["npm", "run", "probe-pass"],
      cwd: ".",
      phases: ["preimplementation", "integration"],
      timeout_ms: 30000,
      max_output_chars: 65536,
    }],
  }, null, 2)}\n`, "utf8");
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

function runAdapter(adapter, request) {
  const target = fs.realpathSync(path.resolve(adapter));
  if (!fs.statSync(target).isFile()) throw new ContractError("QUALITY_HOST_ADAPTER", "host adapter must be a local regular file");
  const result = spawnSync(process.execPath, [target], {
    input: `${JSON.stringify(request)}\n`,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 64 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) throw new ContractError("QUALITY_HOST_ADAPTER_FAILED", "host adapter did not produce successful bounded evidence");
  return { serialized: String(result.stdout), adapterFingerprint: sha256(fs.readFileSync(target)) };
}

function sealAdapterReceipt(parsed, adapterFingerprint) {
  const body = {
    schema_version: 1,
    producer: "opencode-harness/normal-session-host-e2e-v1",
    status: parsed.status === "evidence_valid" ? "passed" : "verification_failed",
    reason_codes: parsed.reason_codes,
    verification_mode: "trusted_adapter",
    adapter_fingerprint: adapterFingerprint,
    source_fingerprint: parsed.plugin_source_fingerprint,
    probe_workspace_fingerprint: parsed.probe_workspace_fingerprint,
    final_workspace_fingerprint: parsed.final_workspace_fingerprint,
    run_nonce: parsed.run_nonce,
    host_evidence_fingerprint: parsed.host_evidence_fingerprint,
  };
  return { ...body, evidence_fingerprint: fingerprint(body) };
}

let receipt;
let temporaryProbe = null;
try {
  const options = parseArgs(process.argv.slice(2));
  if (options.evidence) {
    receipt = blockedNormalSessionHostReceipt("QUALITY_HOST_EVIDENCE_TRUST_REQUIRED", sourceFingerprint);
  } else if (options.adapter) {
    temporaryProbe = createProbeWorkspace();
    const before = observeContentBoundWorkspace(temporaryProbe);
    const runNonce = `host-e2e-${randomBytes(16).toString("hex")}`;
    const adapterResult = runAdapter(options.adapter, {
      schema_version: 1,
      probe_workspace: temporaryProbe,
      plugin_source_fingerprint: sourceFingerprint,
      probe_workspace_fingerprint: before.fingerprint,
      run_nonce: runNonce,
      required_scenarios: [
        "unclassified-edit-blocked",
        "pre-gate-edit-task-bash-blocked",
        "standard-lite-session-started",
        "one-shot-authorized-mutation",
        "after-hook-workspace-reconciled",
        "trusted-project-check-passed",
        "final-attestation-created",
      ],
      authorized_command: "node scripts/authorized-change.mjs",
      authorized_changed_path: "allowed.txt",
      expected_authorized_content: "authorized host mutation\n",
      forbidden_probe_path: "probe.txt",
    });
    const after = observeContentBoundWorkspace(temporaryProbe);
    const changedPaths = diffContentBoundWorkspaces(before, after);
    const finalSourceFingerprint = normalSessionRuntimeSourceFingerprint(root);
    if (finalSourceFingerprint !== sourceFingerprint) receipt = sealFailure("QUALITY_HOST_SOURCE_CHANGED_DURING_RUN");
    else if (after.head_sha !== before.head_sha || changedPaths.length !== 1 || changedPaths[0] !== "allowed.txt") {
      receipt = sealFailure("QUALITY_HOST_UNEXPECTED_WORKSPACE_EFFECT");
    }
    else if (fs.readFileSync(path.join(temporaryProbe, "probe.txt"), "utf8") !== "unchanged host probe\n") {
      receipt = sealFailure("QUALITY_HOST_PROBE_FILE_CHANGED");
    } else if (fs.readFileSync(path.join(temporaryProbe, "allowed.txt"), "utf8") !== "authorized host mutation\n") {
      receipt = sealFailure("QUALITY_HOST_AUTHORIZED_MUTATION_MISSING");
    } else {
      const parsed = parseNormalSessionHostEvidence(adapterResult.serialized, {
        expectedSourceFingerprint: sourceFingerprint,
        expectedWorkspaceFingerprint: before.fingerprint,
        expectedFinalWorkspaceFingerprint: after.fingerprint,
        expectedRunNonce: runNonce,
      });
      receipt = sealAdapterReceipt(parsed, adapterResult.adapterFingerprint);
    }
  } else {
    receipt = blockedNormalSessionHostReceipt(
      opencodeAvailable() ? "QUALITY_HOST_ADAPTER_REQUIRED" : "QUALITY_HOST_RUNTIME_UNAVAILABLE",
      sourceFingerprint,
    );
  }
} catch (error) {
  receipt = sealFailure(error instanceof ContractError ? error.code : "QUALITY_HOST_E2E_UNEXPECTED");
} finally {
  if (temporaryProbe) fs.rmSync(temporaryProbe, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
if (receipt.status === "failed" || receipt.status === "verification_failed") process.exitCode = 1;
else if (receipt.status === "blocked_external_state") process.exitCode = 2;
