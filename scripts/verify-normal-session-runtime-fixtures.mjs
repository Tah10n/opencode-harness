import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { createNormalSessionQualityPlugin } from "../lib/quality/quality-plugin.mjs";
import { validateMilestone2ReceiptBundle } from "../lib/quality/milestone-dod.mjs";
import { NORMAL_SESSION_QUALITY_TOOL_IDS } from "../lib/quality/normal-session-bridge.mjs";
import { observeContentBoundWorkspace } from "../lib/quality/normal-session-workspace.mjs";
import {
  NORMAL_SESSION_HOST_EVIDENCE_PRODUCER,
  NORMAL_SESSION_HOST_EVIDENCE_SCHEMA_VERSION,
  NORMAL_SESSION_HOST_ADAPTER_TIMEOUT_MS,
  blockedNormalSessionHostReceipt,
  classifyQualityPluginApiProbe,
  createNormalSessionHostScenarioContract,
  normalSessionHostRunBindingFingerprint,
  normalSessionHostScenarioContractFingerprint,
  normalSessionRuntimeSourceFingerprint,
  parseNormalSessionHostEvidence,
  removeNormalSessionHostProbeWorkspace,
  sealNormalSessionHostEvidence,
  sealNormalSessionHostScenarioReceipt,
} from "../lib/quality/runtime-hook-verification.mjs";
import {
  ContractError,
  assertFingerprint,
  assertPlain,
  assertString,
  exact,
  fingerprint,
} from "../lib/quality/validation.mjs";

const root = fs.realpathSync(new URL("..", import.meta.url));
const canonicalTemporaryRoot = fs.realpathSync.native(path.resolve(os.tmpdir()));
const hookKeys = ["chat_message", "permission_ask", "tool_execute_before", "tool_execute_after", "event"];
const hookSurfaceCases = [
  ["chat_message", "QUALITY_HOST_HOOK_MISSING_CHAT_MESSAGE"],
  ["permission_ask", "QUALITY_HOST_HOOK_MISSING_PERMISSION_ASK"],
  ["tool_execute_before", "QUALITY_HOST_HOOK_MISSING_TOOL_EXECUTE_BEFORE"],
  ["tool_execute_after", "QUALITY_HOST_HOOK_MISSING_TOOL_EXECUTE_AFTER"],
  ["event", "QUALITY_HOST_HOOK_MISSING_EVENT"],
];
const hostActiveHookCases = [
  ["chat_message", "QUALITY_HOST_HOOK_NOT_INVOKED_CHAT_MESSAGE"],
  ["tool_execute_before", "QUALITY_HOST_HOOK_NOT_INVOKED_TOOL_EXECUTE_BEFORE"],
  ["tool_execute_after", "QUALITY_HOST_HOOK_NOT_INVOKED_TOOL_EXECUTE_AFTER"],
  ["event", "QUALITY_HOST_HOOK_NOT_INVOKED_EVENT"],
];
const adapterRequestKeys = [
  "schema_version",
  "verification_context",
  "runtime_version",
  "probe_workspace",
  "plugin_source_fingerprint",
  "probe_workspace_fingerprint",
  "run_nonce",
  "scenario_contract",
  "scenario_contract_fingerprint",
  "changed_path",
  "expected_content",
  "protected_probe_path",
  "protected_probe_content",
];
const rawStdoutCanary = "RAW_STDOUT_CANARY_NORMAL_SESSION_RUNTIME";
const rawStderrCanary = "RAW_STDERR_CANARY_NORMAL_SESSION_RUNTIME";

function git(workspaceRoot, args) {
  const result = spawnSync("git", args, {
    cwd: workspaceRoot,
    shell: false,
    windowsHide: true,
    timeout: 10000,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    throw new ContractError("QUALITY_HOST_PROBE_GIT", `fixture Git operation failed: ${args[0]}`);
  }
}

function writeJson(target, value) {
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createTemporaryFixtureDirectory(prefix) {
  const temporaryRoot = fs.mkdtempSync(path.join(canonicalTemporaryRoot, prefix));
  assert.equal(fs.realpathSync.native(temporaryRoot), temporaryRoot,
    "runtime fixture temporary root must be physically canonical");
  return temporaryRoot;
}

function createProbeWorkspace(prefix = "quality-runtime-v2-fixture-") {
  const probeRoot = createTemporaryFixtureDirectory(prefix);
  fs.mkdirSync(path.join(probeRoot, ".opencode", "plugins"), { recursive: true });
  fs.mkdirSync(path.join(probeRoot, ".opencode", "quality"), { recursive: true });
  fs.mkdirSync(path.join(probeRoot, "scripts"));
  fs.writeFileSync(path.join(probeRoot, "probe.txt"), "unchanged host probe\n", "utf8");
  fs.writeFileSync(path.join(probeRoot, "allowed.txt"), "before authorized mutation\n", "utf8");
  fs.writeFileSync(path.join(probeRoot, ".gitignore"), ".oc_harness/\n", "utf8");
  fs.writeFileSync(path.join(probeRoot, "scripts", "probe-pass.mjs"), [
    `process.stdout.write(${JSON.stringify(rawStdoutCanary)});`,
    `process.stderr.write(${JSON.stringify(rawStderrCanary)});`,
    "process.exitCode = 0;",
    "",
  ].join("\n"), "utf8");
  writeJson(path.join(probeRoot, "package.json"), {
    name: "opencode-harness-runtime-v2-fixture",
    private: true,
    type: "module",
  });
  writeJson(path.join(probeRoot, ".opencode", "quality", "checks.json"), {
    schema_version: 2,
    catalog_id: "host-e2e-checks-v2",
    standard_lite_policy: {
      allowed_ownership_prefixes: ["allowed.txt"],
      protected_paths: ["probe.txt"],
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
  fs.writeFileSync(path.join(probeRoot, ".opencode", "plugins", "engineering-dossier.mjs"), [
    `import { createNormalSessionQualityPlugin } from ${JSON.stringify(pathToFileURL(path.join(root, "lib", "quality", "quality-plugin.mjs")).href)};`,
    "export const EngineeringDossierPlugin = createNormalSessionQualityPlugin;",
    "",
  ].join("\n"), "utf8");
  git(probeRoot, ["init", "-q"]);
  git(probeRoot, ["add", "."]);
  git(probeRoot, ["-c", "user.name=OpenCode Harness", "-c", "user.email=harness@example.invalid", "commit", "-qm", "runtime v2 fixture"]);
  return probeRoot;
}

function validateAdapterRequest(request) {
  assertPlain(request, "normal-session runtime adapter request");
  exact(request, adapterRequestKeys, adapterRequestKeys, "normal-session runtime adapter request");
  if (request.schema_version !== NORMAL_SESSION_HOST_EVIDENCE_SCHEMA_VERSION) {
    throw new ContractError("QUALITY_HOST_ADAPTER_SCHEMA", "adapter request schema is unsupported");
  }
  if (request.verification_context !== "deterministic_fixture") {
    throw new ContractError(
      "QUALITY_HOST_FIXTURE_CONTEXT",
      "the deterministic direct-plugin adapter cannot provide installed-host evidence",
    );
  }
  for (const [key, maxBytes] of [
    ["runtime_version", 128],
    ["run_nonce", 256],
    ["changed_path", 1000],
    ["expected_content", 4000],
    ["protected_probe_path", 1000],
    ["protected_probe_content", 4000],
  ]) assertString(request[key], `normal-session runtime adapter request.${key}`, { maxBytes });
  if (typeof request.probe_workspace !== "string" || request.probe_workspace.includes("\0")
    || Buffer.byteLength(request.probe_workspace, "utf8") > 4000 || !path.isAbsolute(request.probe_workspace)) {
    throw new ContractError("QUALITY_HOST_ADAPTER_WORKSPACE", "adapter request probe workspace must be a bounded absolute path");
  }
  assertFingerprint(request.plugin_source_fingerprint, "adapter request plugin source fingerprint");
  assertFingerprint(request.probe_workspace_fingerprint, "adapter request probe workspace fingerprint");
  assertFingerprint(request.scenario_contract_fingerprint, "adapter request scenario contract fingerprint");
  const canonicalContract = createNormalSessionHostScenarioContract(request.changed_path);
  if (JSON.stringify(request.scenario_contract) !== JSON.stringify(canonicalContract)
    || request.scenario_contract_fingerprint !== normalSessionHostScenarioContractFingerprint(request.changed_path)) {
    throw new ContractError("QUALITY_HOST_SCENARIO_CONTRACT_MISMATCH", "adapter request scenario contract is not canonical");
  }
  const workspaceRoot = fs.realpathSync(path.resolve(request.probe_workspace));
  if (!fs.statSync(workspaceRoot).isDirectory()) {
    throw new ContractError("QUALITY_HOST_ADAPTER_WORKSPACE", "adapter request workspace must be a directory");
  }
  return workspaceRoot;
}

function fakeToolFactory(definition) {
  return definition;
}
fakeToolFactory.schema = { string: () => ({ describe: () => ({ type: "string" }) }) };

function scopeFacts() {
  return {
    parallel_writable_delegation: false,
    migration: false,
    public_compatibility_change: false,
    architecture_policy_change: false,
    security_sensitive: false,
    persistence_sensitive: false,
    concurrency_sensitive: false,
    unresolved_unknowns: false,
  };
}

function sessionStartRequest(request, riskClass) {
  const common = {
    risk_class: riskClass,
    task_type: "maintenance",
    user_visible_goal: "Verify actual normal-session host hook ordering and evidence binding.",
    ownership_paths: [request.changed_path],
    required_check_ids: ["probe-pass"],
    classification_rationale: "deterministic runtime v2 host scenario fixture",
  };
  if (riskClass !== "standard-lite") return common;
  return {
    ...common,
    behavior_expectation: "one exact authorized edit is reconciled before trusted verification",
    expected_preserved_behavior: ["the protected probe remains unchanged"],
    known_local_edge_cases: ["a consumed edit capability cannot be replayed"],
    scope_facts: scopeFacts(),
  };
}

function captureContractCode(callback) {
  return Promise.resolve().then(callback).then(
    () => { throw new Error("expected a ContractError from the actual plugin path"); },
    (error) => {
      if (!(error instanceof ContractError)) throw error;
      return error.code;
    },
  );
}

function persistedControlText(workspaceRoot) {
  const controlRoot = path.join(workspaceRoot, ".oc_harness");
  if (!fs.existsSync(controlRoot)) return "";
  const pending = [controlRoot];
  const chunks = [];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) {
        const stat = fs.statSync(target);
        if (stat.size > 1024 * 1024) throw new ContractError("QUALITY_HOST_CONTROL_SIZE", "fixture control file is unexpectedly large");
        chunks.push(fs.readFileSync(target, "utf8"));
      }
    }
  }
  return chunks.join("\n");
}

function workspacePair(index, beforeFingerprint, finalFingerprint) {
  if (index <= 4) return [beforeFingerprint, beforeFingerprint];
  if (index === 5 || index === 7) return [beforeFingerprint, finalFingerprint];
  return [finalFingerprint, finalFingerprint];
}

function createScenarioReceipts({
  contract,
  runBindingFingerprint,
  beforeFingerprint,
  finalFingerprint,
  capabilityId,
  bashCallIds,
  editCallId,
  replayCallId,
  actualCodes,
  trustedCheckFingerprint,
  verificationFingerprint,
  attestationFingerprint,
}) {
  const receipts = [];
  let previous = null;
  for (let index = 0; index < contract.length; index += 1) {
    const entry = contract[index];
    const [beforeWorkspace, afterWorkspace] = workspacePair(index, beforeFingerprint, finalFingerprint);
    const capability = index >= 3 && index <= 7 ? capabilityId : null;
    const callId = index <= 2 ? bashCallIds[index]
      : index === 4 || index === 5 || index === 7 ? editCallId
        : index === 6 ? replayCallId : null;
    const receiptFingerprint = index === 8 ? trustedCheckFingerprint
      : index === 9 ? verificationFingerprint : null;
    const binding = {
      code: actualCodes[index],
      status: entry.expected_status,
      path: entry.expected_path,
      capability_id: capability,
      call_id: callId,
      before_workspace_fingerprint: beforeWorkspace,
      after_workspace_fingerprint: afterWorkspace,
      receipt_fingerprint: receiptFingerprint,
      attestation_fingerprint: index === 9 ? attestationFingerprint : null,
    };
    const receipt = sealNormalSessionHostScenarioReceipt({
      sequence: entry.sequence,
      scenario_id: entry.scenario_id,
      run_binding_fingerprint: runBindingFingerprint,
      previous_scenario_fingerprint: previous,
      expected: structuredClone(binding),
      observed: structuredClone(binding),
    });
    receipts.push(receipt);
    previous = receipt.fingerprint;
  }
  return receipts;
}

export async function executeDeterministicFixtureAdapter(request) {
  const workspaceRoot = validateAdapterRequest(request);
  const initialWorkspace = observeContentBoundWorkspace(workspaceRoot);
  if (initialWorkspace.source_fingerprint !== request.probe_workspace_fingerprint) {
    throw new ContractError("QUALITY_HOST_EVIDENCE_WORKSPACE_MISMATCH", "adapter request does not bind the current probe workspace");
  }

  let idTick = 0;
  let clockTick = 0;
  const hookInvocations = Object.fromEntries(hookKeys.map((key) => [key, false]));
  const trustedRuns = [];
  const plugin = createNormalSessionQualityPlugin({
    toolFactory: fakeToolFactory,
    workspaceRoot,
    bridgeOptions: {
      clock: () => new Date(Date.UTC(2026, 6, 15, 12, 0, clockTick++)).toISOString(),
      idFactory: (prefix) => `${prefix}-runtime-v2-${String(++idTick).padStart(4, "0")}`,
      affectedFileInspector: () => [request.changed_path],
      observeWorkspace: (targetRoot) => observeContentBoundWorkspace(targetRoot),
      runTrustedTarget(input) {
        if (input.kind !== "check" || input.targetId !== "probe-pass"
          || !["preimplementation", "integration"].includes(input.phase)) {
          throw new ContractError("QUALITY_HOST_FIXTURE_TARGET", "fixture runner received an unexpected target");
        }
        const before = input.workspaceObserver();
        const expectedWorkspace = input.expectedSourceWorkspaceFingerprint ?? input.expectedWorkspaceFingerprint;
        const observedWorkspace = input.expectedSourceWorkspaceFingerprint === undefined
          ? before.source_fingerprint
          : before.source_fingerprint;
        if (observedWorkspace !== expectedWorkspace) {
          throw new ContractError(
            "QUALITY_CHECK_WORKSPACE_MISMATCH",
            `fixture check workspace ${observedWorkspace} does not match ${expectedWorkspace}`,
          );
        }
        const startedAt = Date.now();
        const result = spawnSync(process.execPath, [path.join(workspaceRoot, "scripts", "probe-pass.mjs")], {
          cwd: workspaceRoot,
          shell: false,
          windowsHide: true,
          timeout: 30000,
          encoding: "utf8",
          maxBuffer: 65536,
        });
        const after = input.workspaceObserver();
        const status = !result.error && result.status === 0
          && after.source_fingerprint === before.source_fingerprint ? "passed" : "failed";
        trustedRuns.push({ target_id: input.targetId, phase: input.phase, status, workspace_fingerprint: after.source_fingerprint });
        return {
          status,
          command_id: "trusted-project-check:probe-pass",
          exit_code: Number.isInteger(result.status) ? result.status : null,
          signal: typeof result.signal === "string" ? result.signal : null,
          duration_ms: Math.max(0, Date.now() - startedAt),
          stdout_bytes: Buffer.byteLength(String(result.stdout), "utf8"),
          stderr_bytes: Buffer.byteLength(String(result.stderr), "utf8"),
          command_fingerprint: fingerprint({ executable_id: "node", argv: ["scripts/probe-pass.mjs"] }),
          post_workspace_fingerprint: after.source_fingerprint,
          stdout: String(result.stdout),
          stderr: String(result.stderr),
        };
      },
    },
  });

  const hookSurface = {
    chat_message: typeof plugin["chat.message"] === "function",
    permission_ask: typeof plugin["permission.ask"] === "function",
    tool_execute_before: typeof plugin["tool.execute.before"] === "function",
    tool_execute_after: typeof plugin["tool.execute.after"] === "function",
    event: typeof plugin.event === "function",
  };
  const discoveredTools = Object.keys(plugin.tool).sort();
  const pluginDiscovered = discoveredTools.length === NORMAL_SESSION_QUALITY_TOOL_IDS.length
    && discoveredTools.every((entry, index) => entry === [...NORMAL_SESSION_QUALITY_TOOL_IDS].sort()[index]);

  async function invokeHook(hookName, evidenceKey, ...args) {
    hookInvocations[evidenceKey] = true;
    return plugin[hookName](...args);
  }

  async function invokeTool(toolId, requestBody, context) {
    const serialized = await plugin.tool[toolId].execute({ request: JSON.stringify(requestBody) }, context);
    return JSON.parse(serialized);
  }

  const unclassified = { sessionID: "runtime-v2/unclassified", agent: "orchestrator" };
  const preGate = { sessionID: "runtime-v2/pre-gate", agent: "orchestrator" };
  const owner = { sessionID: "runtime-v2/owner", agent: "orchestrator" };
  const verifier = { ...owner, agent: "verifier" };
  const bashCallIds = ["runtime-v2-bash-unclassified", "runtime-v2-bash-pre-gate", "runtime-v2-bash-post-gate"];
  const editCallId = "runtime-v2-edit-authorized";
  const replayCallId = "runtime-v2-edit-replay";

  await invokeHook("event", "event", { event: { type: "runtime.fixture.observed", properties: {} } });
  await invokeHook("chat.message", "chat_message", unclassified);
  const unclassifiedCode = await captureContractCode(() => invokeHook(
    "tool.execute.before",
    "tool_execute_before",
    { tool: "bash", sessionID: unclassified.sessionID, callID: bashCallIds[0] },
    { args: { command: "fixture-unclassified-bash" } },
  ));

  await invokeHook("chat.message", "chat_message", preGate);
  await invokeTool("quality_session_start", sessionStartRequest(request, "high"), preGate);
  const preGateCode = await captureContractCode(() => invokeHook(
    "tool.execute.before",
    "tool_execute_before",
    { tool: "bash", sessionID: preGate.sessionID, callID: bashCallIds[1] },
    { args: { command: "fixture-pre-gate-bash" } },
  ));

  await invokeHook("chat.message", "chat_message", owner);
  const started = await invokeTool("quality_session_start", sessionStartRequest(request, "standard-lite"), owner);
  const gated = await invokeTool("quality_dossier_finalize", { expected_revision: started.dossier_revision }, owner);
  if (gated.gate_status !== "passed") throw new ContractError("QUALITY_HOST_FIXTURE_GATE", "fixture quality gate did not pass");
  const postGateCode = await captureContractCode(() => invokeHook(
    "tool.execute.before",
    "tool_execute_before",
    { tool: "bash", sessionID: owner.sessionID, callID: bashCallIds[2] },
    { args: { command: "fixture-post-gate-bash" } },
  ));

  const capability = await invokeTool("quality_action_authorize", {
    expected_revision: started.dossier_revision,
    kind: "edit",
    paths: [request.changed_path],
  }, owner);
  const editOutput = {
    args: {
      filePath: request.changed_path,
      oldString: fs.readFileSync(path.join(workspaceRoot, request.changed_path), "utf8"),
      newString: request.expected_content,
      replaceAll: false,
    },
  };
  await invokeHook(
    "tool.execute.before",
    "tool_execute_before",
    { tool: "edit", sessionID: owner.sessionID, callID: editCallId },
    editOutput,
  );
  // Deterministic fixture mode has no installed permission service, so it models
  // a matching independent permission observation as fixture data. Installed-host
  // adapters must derive it from the adopted host permission surface;
  // permission.ask is not invoked by OpenCode 1.17.20.
  const effectivePermissionsMatch = true;
  fs.writeFileSync(path.join(workspaceRoot, request.changed_path), request.expected_content, "utf8");
  await invokeHook(
    "tool.execute.after",
    "tool_execute_after",
    { tool: "edit", sessionID: owner.sessionID, callID: editCallId },
  );
  const replayCode = await captureContractCode(() => invokeHook(
    "tool.execute.before",
    "tool_execute_before",
    { tool: "edit", sessionID: owner.sessionID, callID: replayCallId },
    { args: { ...editOutput.args } },
  ));
  const reconciled = await invokeTool("quality_dossier_inspect", {}, owner);
  if (reconciled.mutation_pending || reconciled.incomplete_reasons.length > 0) {
    throw new ContractError("QUALITY_HOST_FIXTURE_RECONCILIATION", "actual after hook did not reconcile the authorized edit");
  }

  const finalWorkspace = observeContentBoundWorkspace(workspaceRoot);
  const verification = await invokeTool("quality_verification_record", { expected_revision: started.dossier_revision }, verifier);
  const trustedCheck = verification.receipts.find((entry) => entry.kind === "check" && entry.check_id === "probe-pass");
  if (!verification.complete || !trustedCheck || trustedCheck.status !== "passed") {
    throw new ContractError("QUALITY_HOST_FIXTURE_VERIFICATION", "actual bridge verification lacks a passing trusted check receipt");
  }
  const attestation = await invokeTool("quality_session_finalize", { expected_revision: started.dossier_revision }, owner);
  if (verification.workspace_fingerprint !== finalWorkspace.source_fingerprint
    || attestation.final_workspace_fingerprint !== finalWorkspace.source_fingerprint
    || attestation.verification_fingerprint !== verification.fingerprint) {
    throw new ContractError("QUALITY_HOST_FIXTURE_ATTESTATION", "actual verification or attestation does not bind the final workspace");
  }
  const controlText = persistedControlText(workspaceRoot);
  const rawOutputPersisted = controlText.includes(rawStdoutCanary) || controlText.includes(rawStderrCanary);
  const probeFileUnchanged = fs.readFileSync(path.join(workspaceRoot, request.protected_probe_path), "utf8")
    === request.protected_probe_content;
  if (!trustedRuns.some((entry) => entry.phase === "integration" && entry.status === "passed")) {
    throw new ContractError("QUALITY_HOST_FIXTURE_TARGET", "fixture did not execute its trusted integration check");
  }

  const runBindingFingerprint = normalSessionHostRunBindingFingerprint({
    run_nonce: request.run_nonce,
    runtime_version: request.runtime_version,
    verification_context: request.verification_context,
    plugin_source_fingerprint: request.plugin_source_fingerprint,
    probe_workspace_fingerprint: request.probe_workspace_fingerprint,
    final_workspace_fingerprint: finalWorkspace.source_fingerprint,
    scenario_contract_fingerprint: request.scenario_contract_fingerprint,
  });
  const actualCodes = [
    unclassifiedCode,
    preGateCode,
    postGateCode,
    null,
    null,
    null,
    replayCode,
    null,
    null,
    null,
  ];
  const observedScenarios = createScenarioReceipts({
    contract: request.scenario_contract,
    runBindingFingerprint,
    beforeFingerprint: request.probe_workspace_fingerprint,
    finalFingerprint: finalWorkspace.source_fingerprint,
    capabilityId: capability.capability_id,
    bashCallIds,
    editCallId,
    replayCallId,
    actualCodes,
    trustedCheckFingerprint: trustedCheck.evidence_fingerprint,
    verificationFingerprint: verification.fingerprint,
    attestationFingerprint: attestation.fingerprint,
  });
  return sealNormalSessionHostEvidence({
    schema_version: NORMAL_SESSION_HOST_EVIDENCE_SCHEMA_VERSION,
    producer: NORMAL_SESSION_HOST_EVIDENCE_PRODUCER,
    generated_at: new Date().toISOString(),
    run_nonce: request.run_nonce,
    runtime_version: request.runtime_version,
    verification_context: request.verification_context,
    plugin_source_fingerprint: request.plugin_source_fingerprint,
    probe_workspace_fingerprint: request.probe_workspace_fingerprint,
    final_workspace_fingerprint: finalWorkspace.source_fingerprint,
    scenario_contract: request.scenario_contract,
    scenario_contract_fingerprint: request.scenario_contract_fingerprint,
    run_binding_fingerprint: runBindingFingerprint,
    plugin_discovered: pluginDiscovered,
    hook_surface: hookSurface,
    hook_invocations: hookInvocations,
    effective_permissions_match: effectivePermissionsMatch,
    observed_scenarios: observedScenarios,
    probe_file_unchanged: probeFileUnchanged,
    raw_output_persisted: rawOutputPersisted,
  });
}

async function readBoundedStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 64 * 1024) throw new ContractError("QUALITY_HOST_ADAPTER_SIZE", "adapter request exceeds its input bound");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/u, ""));
}

export async function runDeterministicFixtureAdapterStdio() {
  const request = await readBoundedStdin();
  const evidence = await executeDeterministicFixtureAdapter(request);
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

function parserOptions(request, finalWorkspaceFingerprint, now = () => Date.now()) {
  return {
    expectedSourceFingerprint: request.plugin_source_fingerprint,
    expectedWorkspaceFingerprint: request.probe_workspace_fingerprint,
    expectedFinalWorkspaceFingerprint: finalWorkspaceFingerprint,
    expectedRunNonce: request.run_nonce,
    expectedRuntimeVersion: request.runtime_version,
    expectedVerificationContext: request.verification_context,
    expectedChangedPath: request.changed_path,
    now,
  };
}

function resealEvidence(candidate) {
  delete candidate.evidence_fingerprint;
  candidate.evidence_fingerprint = fingerprint(candidate);
  return candidate;
}

function resealScenarioChain(candidate, { preservePreviousAt = -1 } = {}) {
  let previous = null;
  candidate.observed_scenarios.forEach((scenario, index) => {
    if (index !== preservePreviousAt) scenario.previous_scenario_fingerprint = previous;
    delete scenario.fingerprint;
    scenario.fingerprint = fingerprint(scenario);
    previous = scenario.fingerprint;
  });
  return resealEvidence(candidate);
}

function parseEvidence(evidence, request, finalWorkspaceFingerprint, overrides = {}) {
  return parseNormalSessionHostEvidence(JSON.stringify(evidence), {
    ...parserOptions(request, finalWorkspaceFingerprint),
    ...overrides,
  });
}

function assertSemanticInvalid(validEvidence, request, finalFingerprint, label, mutate, expectedReason) {
  const candidate = structuredClone(validEvidence);
  mutate(candidate);
  resealScenarioChain(candidate);
  const parsed = parseEvidence(candidate, request, finalFingerprint);
  assert.equal(parsed.status, "evidence_invalid", label);
  assert(parsed.reason_codes.includes(expectedReason), `${label}: ${parsed.reason_codes.join(", ")}`);
}

function runVerifier(args, timeout = 180000) {
  return spawnSync(process.execPath, [path.join(root, "scripts", "verify-normal-session-runtime.mjs"), ...args], {
    cwd: root,
    shell: false,
    windowsHide: true,
    timeout,
    encoding: "utf8",
  });
}

async function runFixtureSuite() {
  assert.equal(NORMAL_SESSION_HOST_ADAPTER_TIMEOUT_MS, 300_000);
  const cleanupCalls = [];
  const cleanupTarget = path.resolve(os.tmpdir(), "quality-runtime-cleanup-contract");
  removeNormalSessionHostProbeWorkspace(cleanupTarget, (target, options) => {
    cleanupCalls.push({ target, options });
  });
  assert.deepEqual(cleanupCalls, [{
    target: cleanupTarget,
    options: { recursive: true, force: true, maxRetries: 10, retryDelay: 100 },
  }]);
  assert.throws(
    () => removeNormalSessionHostProbeWorkspace(cleanupTarget, () => {
      throw Object.assign(new Error("busy"), { code: "EPERM" });
    }),
    (error) => error?.code === "EPERM",
  );

  const probeRoot = createProbeWorkspace();
  try {
    const before = observeContentBoundWorkspace(probeRoot);
    const request = {
      schema_version: NORMAL_SESSION_HOST_EVIDENCE_SCHEMA_VERSION,
      verification_context: "deterministic_fixture",
      runtime_version: process.version,
      probe_workspace: probeRoot,
      plugin_source_fingerprint: normalSessionRuntimeSourceFingerprint(root),
      probe_workspace_fingerprint: before.source_fingerprint,
      run_nonce: "runtime-v2-direct-fixture-nonce",
      scenario_contract: createNormalSessionHostScenarioContract("allowed.txt"),
      scenario_contract_fingerprint: normalSessionHostScenarioContractFingerprint("allowed.txt"),
      changed_path: "allowed.txt",
      expected_content: "authorized host mutation\n",
      protected_probe_path: "probe.txt",
      protected_probe_content: "unchanged host probe\n",
    };
    const evidence = await executeDeterministicFixtureAdapter(request);
    await assert.rejects(
      () => executeDeterministicFixtureAdapter({ ...request, verification_context: "installed_host" }),
      (error) => error instanceof ContractError && error.code === "QUALITY_HOST_FIXTURE_CONTEXT",
      "the deterministic adapter must never be promotable to installed-host evidence",
    );
    const after = observeContentBoundWorkspace(probeRoot);
    const passed = parseEvidence(evidence, request, after.source_fingerprint);
    assert.equal(passed.status, "evidence_valid");
    assert.deepEqual(passed.reason_codes, []);
    assert.equal(evidence.hook_surface.permission_ask, true);
    assert.equal(evidence.hook_invocations.permission_ask, false);
    for (const [key] of hostActiveHookCases) assert.equal(evidence.hook_invocations[key], true, key);
    const permissionHookInvoked = structuredClone(evidence);
    permissionHookInvoked.hook_invocations.permission_ask = true;
    resealEvidence(permissionHookInvoked);
    assert.equal(parseEvidence(permissionHookInvoked, request, after.source_fingerprint).status, "evidence_valid");
    assert.equal(evidence.observed_scenarios.length, 10);
    assert.deepEqual(evidence.observed_scenarios.map((entry) => entry.observed.code), [
      "QUALITY_SESSION_UNCLASSIFIED",
      "QUALITY_PRE_GATE_VIOLATION",
      "QUALITY_NATIVE_BASH_DISABLED",
      null,
      null,
      null,
      "QUALITY_CAPABILITY_MISSING",
      null,
      null,
      null,
    ]);
    assert.equal(evidence.observed_scenarios[8].observed.receipt_fingerprint, passed.trusted_check_receipt_fingerprint);
    assert.equal(evidence.observed_scenarios[9].observed.receipt_fingerprint, passed.verification_fingerprint);
    assert.equal(evidence.observed_scenarios[9].observed.attestation_fingerprint, passed.attestation_fingerprint);
    assert.equal(evidence.raw_output_persisted, false);

    for (const [label, mutate, reason] of [
      ["scenario order", (value) => { value.observed_scenarios[0].scenario_id = "pre_gate_bash_blocked"; }, "QUALITY_HOST_SCENARIO_ORDER_MISMATCH"],
      ["scenario code", (value) => { value.observed_scenarios[0].observed.code = "QUALITY_PRE_GATE_VIOLATION"; }, "QUALITY_HOST_SCENARIO_CODE_MISMATCH"],
      ["scenario status", (value) => { value.observed_scenarios[3].observed.status = "blocked"; }, "QUALITY_HOST_SCENARIO_STATUS_MISMATCH"],
      ["scenario path", (value) => { value.observed_scenarios[3].observed.path = null; }, "QUALITY_HOST_SCENARIO_PATH_MISMATCH"],
      ["scenario capability", (value) => { value.observed_scenarios[6].observed.capability_id = "capability-runtime-v2-other"; }, "QUALITY_HOST_SCENARIO_CAPABILITY_MISMATCH"],
      ["scenario call", (value) => { value.observed_scenarios[6].observed.call_id = value.observed_scenarios[4].observed.call_id; }, "QUALITY_HOST_SCENARIO_CALL_MISMATCH"],
      ["scenario workspace", (value) => { value.observed_scenarios[7].observed.after_workspace_fingerprint = fingerprint({ other: "workspace" }); }, "QUALITY_HOST_SCENARIO_WORKSPACE_MISMATCH"],
      ["check receipt", (value) => { value.observed_scenarios[8].observed.receipt_fingerprint = fingerprint({ other: "check" }); }, "QUALITY_HOST_SCENARIO_RECEIPT_MISMATCH"],
      ["attestation", (value) => { value.observed_scenarios[9].observed.attestation_fingerprint = fingerprint({ other: "attestation" }); }, "QUALITY_HOST_SCENARIO_ATTESTATION_MISMATCH"],
      ["run binding", (value) => { value.observed_scenarios[0].run_binding_fingerprint = fingerprint({ other: "run" }); }, "QUALITY_HOST_SCENARIO_RUN_BINDING_MISMATCH"],
    ]) assertSemanticInvalid(evidence, request, after.source_fingerprint, label, mutate, reason);

    const previousMismatch = structuredClone(evidence);
    previousMismatch.observed_scenarios[4].previous_scenario_fingerprint = fingerprint({ other: "previous" });
    resealScenarioChain(previousMismatch, { preservePreviousAt: 4 });
    assert(parseEvidence(previousMismatch, request, after.source_fingerprint).reason_codes.includes("QUALITY_HOST_SCENARIO_PREVIOUS_MISMATCH"));

    for (const [label, mutate, reason] of [
      ["source", (value) => { value.plugin_source_fingerprint = fingerprint({ other: "source" }); }, "QUALITY_HOST_EVIDENCE_SOURCE_MISMATCH"],
      ["before workspace", (value) => { value.probe_workspace_fingerprint = fingerprint({ other: "before" }); }, "QUALITY_HOST_EVIDENCE_WORKSPACE_MISMATCH"],
      ["final workspace", (value) => { value.final_workspace_fingerprint = fingerprint({ other: "final" }); }, "QUALITY_HOST_EVIDENCE_FINAL_WORKSPACE_MISMATCH"],
      ["nonce", (value) => { value.run_nonce = "runtime-v2-other-nonce"; }, "QUALITY_HOST_EVIDENCE_NONCE_MISMATCH"],
      ["runtime", (value) => { value.runtime_version = "runtime-v2-other"; }, "QUALITY_HOST_EVIDENCE_RUNTIME_MISMATCH"],
      ["context", (value) => { value.verification_context = "installed_host"; }, "QUALITY_HOST_EVIDENCE_CONTEXT_MISMATCH"],
      ["plugin", (value) => { value.plugin_discovered = false; }, "QUALITY_HOST_PLUGIN_NOT_DISCOVERED"],
      ["permission", (value) => { value.effective_permissions_match = false; }, "QUALITY_HOST_PERMISSION_MISMATCH"],
      ["probe", (value) => { value.probe_file_unchanged = false; }, "QUALITY_HOST_PROBE_FILE_CHANGED"],
      ["raw output", (value) => { value.raw_output_persisted = true; }, "QUALITY_HOST_RAW_OUTPUT_PERSISTED"],
    ]) {
      const candidate = structuredClone(evidence);
      mutate(candidate);
      resealEvidence(candidate);
      const parsed = parseEvidence(candidate, request, after.source_fingerprint);
      assert.equal(parsed.status, "evidence_invalid", label);
      assert(parsed.reason_codes.includes(reason), label);
    }

    const contractMismatch = structuredClone(evidence);
    contractMismatch.scenario_contract[0].expected_status = "passed";
    contractMismatch.scenario_contract_fingerprint = fingerprint(contractMismatch.scenario_contract);
    resealEvidence(contractMismatch);
    assert(parseEvidence(contractMismatch, request, after.source_fingerprint).reason_codes.includes("QUALITY_HOST_SCENARIO_CONTRACT_MISMATCH"));

    const stale = structuredClone(evidence);
    stale.generated_at = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    resealEvidence(stale);
    assert(parseEvidence(stale, request, after.source_fingerprint).reason_codes.includes("QUALITY_HOST_EVIDENCE_STALE"));

    const forged = structuredClone(evidence);
    forged.plugin_discovered = false;
    assert.throws(
      () => parseEvidence(forged, request, after.source_fingerprint),
      (error) => error instanceof ContractError && error.code === "QUALITY_HOST_EVIDENCE_FINGERPRINT",
    );
    const legacyField = structuredClone(evidence);
    legacyField[["authorized", "exact", "command", "observed"].join("_")] = true;
    resealEvidence(legacyField);
    assert.throws(() => parseEvidence(legacyField, request, after.source_fingerprint), ContractError);
    assert.throws(() => parseEvidence({ schema_version: 1 }, request, after.source_fingerprint), ContractError);

    for (const [key, reason] of hookSurfaceCases) {
      const missingHook = structuredClone(evidence);
      missingHook.hook_surface[key] = false;
      resealEvidence(missingHook);
      assert(parseEvidence(missingHook, request, after.source_fingerprint).reason_codes.includes(reason), key);
    }
    for (const [key, reason] of hostActiveHookCases) {
      const uninvokedHook = structuredClone(evidence);
      uninvokedHook.hook_invocations[key] = false;
      resealEvidence(uninvokedHook);
      assert(parseEvidence(uninvokedHook, request, after.source_fingerprint).reason_codes.includes(reason), key);
    }
  } finally {
    fs.rmSync(probeRoot, { recursive: true, force: true });
  }

  const apiSourceFingerprint = fingerprint({ source: "api-fixture" });
  const apiPassed = classifyQualityPluginApiProbe({
    runtime_version: process.version,
    plugin_api_version: "fixture-api-v1",
    api_loaded: true,
    api_parseable: true,
    hook_surface: Object.fromEntries(hookKeys.map((key) => [key, true])),
    tool_ids: [...NORMAL_SESSION_QUALITY_TOOL_IDS],
    unclassified_edit_denied: true,
    unclassified_mutating_bash_denied: true,
    source_fingerprint: apiSourceFingerprint,
  });
  assert.equal(apiPassed.status, "passed");
  const apiMissing = classifyQualityPluginApiProbe({
    runtime_version: null,
    plugin_api_version: null,
    api_loaded: false,
    api_parseable: false,
    hook_surface: Object.fromEntries(hookKeys.map((key) => [key, false])),
    tool_ids: [],
    unclassified_edit_denied: false,
    unclassified_mutating_bash_denied: false,
    source_fingerprint: apiSourceFingerprint,
  });
  assert.equal(apiMissing.status, "incomplete");
  assert.equal(blockedNormalSessionHostReceipt("QUALITY_HOST_RUNTIME_UNAVAILABLE", apiSourceFingerprint).status, "blocked_external_state");

  const sourceFixture = createTemporaryFixtureDirectory("quality-runtime-source-fixture-");
  try {
    for (const directory of [".opencode/plugins", "lib/quality", "scripts"]) {
      fs.mkdirSync(path.join(sourceFixture, ...directory.split("/")), { recursive: true });
    }
    fs.writeFileSync(path.join(sourceFixture, ".opencode", "plugins", "engineering-dossier.mjs"), "export const plugin = true;\n", "utf8");
    fs.writeFileSync(path.join(sourceFixture, "lib", "quality", "quality-plugin.mjs"), 'export { dependency } from "./dependency.mjs";\n', "utf8");
    fs.writeFileSync(path.join(sourceFixture, "lib", "quality", "dependency.mjs"), "export const dependency = 1;\n", "utf8");
    fs.writeFileSync(path.join(sourceFixture, "lib", "quality", "runtime-hook-verification.mjs"), "export const runtime = true;\n", "utf8");
    fs.writeFileSync(path.join(sourceFixture, "scripts", "verify-normal-session-runtime.mjs"), "export const verifier = true;\n", "utf8");
    fs.writeFileSync(path.join(sourceFixture, "package.json"), "{}\n", "utf8");
    const first = normalSessionRuntimeSourceFingerprint(sourceFixture);
    fs.writeFileSync(path.join(sourceFixture, "lib", "quality", "dependency.mjs"), "export const dependency = 2;\n", "utf8");
    assert.notEqual(normalSessionRuntimeSourceFingerprint(sourceFixture), first);
  } finally {
    fs.rmSync(sourceFixture, { recursive: true, force: true });
  }

  const standalone = runVerifier(["--evidence", "untrusted.json"], 30000);
  assert.equal(standalone.status, 2, standalone.stderr);
  const standaloneReceipt = JSON.parse(standalone.stdout);
  assert.equal(standaloneReceipt.status, "blocked_external_state");
  assert.deepEqual(standaloneReceipt.reason_codes, ["QUALITY_HOST_EVIDENCE_TRUST_REQUIRED"]);

  const adapterFixture = createTemporaryFixtureDirectory("quality-runtime-v2-adapter-");
  try {
    const failedMilestoneOutput = path.join(adapterFixture, "failed-host-milestone-bundle.json");
    const failedMilestoneStartedAt = Date.now();
    const projectLocalHostAttempt = runVerifier([
      "--adapter",
      path.join(root, "scripts", "verify-normal-session-runtime-fixtures.mjs"),
      "--milestone-out",
      failedMilestoneOutput,
    ]);
    const failedMilestoneCompletedAt = Date.now();
    assert.equal(projectLocalHostAttempt.status, 1, projectLocalHostAttempt.stdout);
    const projectLocalFailureReceipt = JSON.parse(projectLocalHostAttempt.stdout);
    assert.deepEqual(
      projectLocalFailureReceipt.reason_codes,
      ["QUALITY_HOST_ADAPTER_NOT_HOST_OWNED"],
      "a project-local deterministic adapter must be rejected before host runtime availability is considered",
    );
    assert.equal(fs.existsSync(failedMilestoneOutput), true,
      "a conclusive installed-host verification failure did not create its milestone bundle");
    const failedMilestoneBundle = validateMilestone2ReceiptBundle(
      JSON.parse(fs.readFileSync(failedMilestoneOutput, "utf8")),
    );
    assert.equal(failedMilestoneBundle.dimension_id, "host_hook_e2e");
    assert.equal(failedMilestoneBundle.receipts.length, 1);
    const failedOperationalReceipt = failedMilestoneBundle.receipts[0];
    assert.equal(failedOperationalReceipt.check_id, "normal-session-host-hook-e2e");
    assert.equal(failedOperationalReceipt.status, "failed");
    assert.equal(failedOperationalReceipt.evidence_scope.result.kind, "installed_host");
    assert.equal(failedOperationalReceipt.evidence_scope.result.verification_mode, null);
    assert.equal(
      failedOperationalReceipt.evidence_scope.result.report_fingerprint,
      projectLocalFailureReceipt.evidence_fingerprint,
    );
    assert.deepEqual(failedOperationalReceipt.evidence_scope.result.scenario_ids, []);
    assert(
      Date.parse(failedOperationalReceipt.started_at) >= failedMilestoneStartedAt
      && Date.parse(failedOperationalReceipt.started_at) <= failedMilestoneCompletedAt,
      "failed host milestone receipt start timestamp does not bracket the verification attempt",
    );
    assert(
      Date.parse(failedOperationalReceipt.completed_at) >= Date.parse(failedOperationalReceipt.started_at)
      && Date.parse(failedOperationalReceipt.completed_at) <= failedMilestoneCompletedAt,
      "failed host milestone receipt completion timestamp does not bracket the verification attempt",
    );

    const blockedMilestoneOutput = path.join(adapterFixture, "blocked-host-milestone-bundle.json");
    const blockedMilestoneRun = runVerifier([
      "--evidence", "untrusted.json",
      "--milestone-out", blockedMilestoneOutput,
    ]);
    assert.equal(blockedMilestoneRun.status, 2, blockedMilestoneRun.stderr);
    assert.equal(JSON.parse(blockedMilestoneRun.stdout).status, "blocked_external_state");
    assert.equal(fs.existsSync(blockedMilestoneOutput), false,
      "genuinely unavailable installed-host evidence created a conclusive milestone bundle");

    const adapterPath = path.join(adapterFixture, "fixture-adapter.mjs");
    const adapterErrorPath = path.join(adapterFixture, "adapter-error.log");
    const fixtureUrl = import.meta.url;
    fs.writeFileSync(adapterPath, [
      'import fs from "node:fs";',
      `import { runDeterministicFixtureAdapterStdio } from ${JSON.stringify(fixtureUrl)};`,
      "try { await runDeterministicFixtureAdapterStdio(); } catch (error) {",
      '  fs.writeFileSync(new URL("./adapter-error.log", import.meta.url), `${error?.stack ?? error}\\n`, "utf8");',
      "  throw error;",
      "}",
      "",
    ].join("\n"), "utf8");
    const adapterRun = runVerifier(["--adapter", adapterPath, "--fixture-contract"]);
    const adapterError = fs.existsSync(adapterErrorPath) ? fs.readFileSync(adapterErrorPath, "utf8") : "";
    assert.equal(adapterRun.status, 0, `${adapterRun.stdout}\n${adapterRun.stderr}\n${adapterError}`);
    const adapterReceipt = JSON.parse(adapterRun.stdout);
    assert.equal(adapterReceipt.status, "fixture_contract_passed");
    assert.equal(adapterReceipt.verification_mode, "deterministic_fixture");
    assert.deepEqual(adapterReceipt.reason_codes, []);
    assert.equal(Object.hasOwn(adapterReceipt, "host_hook_e2e_verified"), false);
    assert.equal(Object.hasOwn(adapterReceipt, ["authorized", "command"].join("_")), false);

    const forbiddenMilestoneOutput = path.join(adapterFixture, "fixture-milestone-bundle.json");
    const forbiddenMilestoneRun = runVerifier([
      "--adapter", adapterPath,
      "--fixture-contract",
      "--milestone-out", forbiddenMilestoneOutput,
    ]);
    assert.equal(forbiddenMilestoneRun.status, 1, forbiddenMilestoneRun.stderr);
    assert.deepEqual(
      JSON.parse(forbiddenMilestoneRun.stdout).reason_codes,
      ["QUALITY_HOST_MILESTONE_REQUIRES_INSTALLED_ADAPTER"],
    );
    assert.equal(fs.existsSync(forbiddenMilestoneOutput), false,
      "deterministic fixture created an installed-host milestone bundle");

    const escapedPath = path.join(adapterFixture, "escaped-effect-adapter.mjs");
    fs.writeFileSync(escapedPath, [
      'import fs from "node:fs";',
      'import path from "node:path";',
      `import { executeDeterministicFixtureAdapter } from ${JSON.stringify(fixtureUrl)};`,
      "const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);",
      'const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));',
      "const evidence = await executeDeterministicFixtureAdapter(request);",
      'fs.writeFileSync(path.join(request.probe_workspace, "UNAUTHORIZED.txt"), "escaped effect\\n", "utf8");',
      'process.stdout.write(`${JSON.stringify(evidence)}\\n`);',
      "",
    ].join("\n"), "utf8");
    const failedFixtureMilestoneOutput = path.join(adapterFixture, "failed-fixture-milestone-bundle.json");
    const escapedRun = runVerifier([
      "--adapter", escapedPath,
      "--fixture-contract",
      "--milestone-out", failedFixtureMilestoneOutput,
    ]);
    assert.equal(escapedRun.status, 1, `${escapedRun.stdout}\n${escapedRun.stderr}`);
    assert.deepEqual(JSON.parse(escapedRun.stdout).reason_codes, ["QUALITY_HOST_UNEXPECTED_WORKSPACE_EFFECT"]);
    assert.equal(fs.existsSync(failedFixtureMilestoneOutput), false,
      "a failed deterministic fixture created an installed-host milestone bundle");
  } finally {
    fs.rmSync(adapterFixture, { recursive: true, force: true });
  }

  console.log("Normal-session runtime v2 fixture contract passed without claiming installed host-hook E2E verification.");
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedUrl === import.meta.url) {
  runFixtureSuite().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
