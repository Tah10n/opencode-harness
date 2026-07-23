import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import {
  createDefaultNormalSessionCheckCatalog,
  createNormalSessionQualityBridge,
  executeNormalSessionQualityTool,
  handleNormalSessionChatMessage,
  handleNormalSessionToolAfter,
  handleNormalSessionToolBefore,
  inspectNormalSessionQualityState,
  inspectNormalSessionRegistration,
} from "../lib/quality/normal-session-bridge.mjs";
import { ContractError, fingerprint } from "../lib/quality/validation.mjs";
import { contextReadToolOutput } from "./context-test-fixtures.mjs";

function expectCode(callback, code) {
  assert.throws(callback, (error) => error instanceof ContractError && error.code === code);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-classification-"));
fs.mkdirSync(path.join(tempRoot, "src"));
fs.mkdirSync(path.join(tempRoot, "src", "security"));
fs.writeFileSync(path.join(tempRoot, "src", "file.mjs"), "export const value = 1;\n", "utf8");

const checkCatalog = createDefaultNormalSessionCheckCatalog();
const standardLitePolicy = {
  allowed_ownership_prefixes: ["src"],
  protected_paths: ["src/auth", "src/security", "src/security.mjs"],
};
let catalogBinding = {
  catalog: {
    catalog_id: checkCatalog.catalog_id,
    standard_lite_policy: standardLitePolicy,
    checks: [
      ...checkCatalog.checks.map((entry) => ({ check_id: entry.check_id, phases: [...entry.phases], purpose: "verification" })),
      {
        check_id: "normal-bug-reproducer",
        phases: ["preimplementation", "integration"],
        purpose: "bug_reproducer",
      },
      {
        check_id: "normal-integration-only",
        phases: ["integration"],
        purpose: "verification",
      },
    ],
  },
  fingerprint: checkCatalog.fingerprint,
};
let catalogLoaderFails = false;
let workspaceEntries = [];
let affectedFiles = ["src/file.mjs"];
let id = 0;
let time = 0;
const headSha = "b".repeat(40);
const indexFingerprint = fingerprint({ index: "fixture-index" });
function workspaceSnapshot(entries) {
  const source = {
    schema_version: 3,
    head_sha: headSha,
    index_entry_count: 1,
    index_fingerprint: indexFingerprint,
    entries: entries.map((entry) => ({ ...entry })),
    dirty: entries.length > 0,
  };
  const sourceFingerprint = fingerprint(source);
  const declaredOutputEntries = [];
  const declaredOutputsFingerprint = fingerprint({ schema_version: 3, entries: declaredOutputEntries });
  return {
    ...source,
    declared_output_entries: declaredOutputEntries,
    source_fingerprint: sourceFingerprint,
    declared_outputs_fingerprint: declaredOutputsFingerprint,
    fingerprint: fingerprint({
      schema_version: 3,
      source_fingerprint: sourceFingerprint,
      declared_outputs_fingerprint: declaredOutputsFingerprint,
    }),
  };
}
const observeWorkspace = () => {
  const entries = workspaceEntries.map((entry) => ({ ...entry }));
  return workspaceSnapshot(entries);
};
const bridge = createNormalSessionQualityBridge({
  workspaceRoot: tempRoot,
  checkCatalog,
  standardLitePolicy,
  projectCatalogLoader: () => {
    if (catalogLoaderFails) throw new ContractError("QUALITY_CHECK_CATALOG_MISSING", "fixture catalog is missing");
    return catalogBinding;
  },
  observeWorkspace,
  affectedFileInspector: () => [...affectedFiles],
  runTrustedTarget: () => ({ status: "passed", command_id: "fixture", exit_code: 0 }),
  clock: () => new Date(Date.UTC(2026, 6, 15, 10, 0, time++)).toISOString(),
  idFactory: (prefix) => `${prefix}-${++id}`,
});

function call(sessionID, agent, toolId, request) {
  return executeNormalSessionQualityTool(
    bridge,
    toolId,
    { request: JSON.stringify(request) },
    { sessionID, agent },
  );
}

let contextCallSequence = 0;
function recordLocalContext(targetBridge, sessionID, relativePath = "src/file.mjs") {
  const callID = `classification-context-read-${++contextCallSequence}`;
  handleNormalSessionToolBefore(targetBridge, {
    tool: "context_read",
    sessionID,
    callID,
  }, { args: { path: relativePath, startLine: 1, maxLines: 1, maxBytes: 4096, format: "text" } });
  handleNormalSessionToolAfter(targetBridge, {
    tool: "context_read",
    sessionID,
    callID,
  }, {
    output: contextReadToolOutput(relativePath, callID),
    title: "classification context read",
    metadata: {},
  });
}

function reconcileForAttestation(targetBridge, sessionID) {
  const facts = {
    changed_paths: [],
    unexpected_public_contracts: [],
    unexpected_dependency_directions: [],
    unexpected_side_effect_edges: [],
    unrelated_paths: [],
    unplanned_items: [],
  };
  const checks = Object.fromEntries([
    "changed_path_ownership",
    "public_contracts",
    "dependency_directions",
    "side_effect_edges",
    "critical_path_tests",
    "unrelated_changes",
  ].map((key) => [key, { status: "passed", finding_ids: [] }]));
  executeNormalSessionQualityTool(targetBridge, "quality_context_reviewer_record", {
    request: JSON.stringify({ ...facts, checks }),
  }, { sessionID, agent: "reviewer" });
  return executeNormalSessionQualityTool(targetBridge, "quality_context_reconcile", {
    request: JSON.stringify({ evidence_mode: "reviewer_grounded", ...facts }),
  }, { sessionID, agent: "orchestrator" });
}

function standardStart(overrides = {}) {
  return {
    risk_class: "standard-lite",
    task_type: "maintenance",
    user_visible_goal: "Exercise compact classified quality control.",
    ownership_paths: ["src"],
    required_check_ids: ["normal-harness-static"],
    classification_rationale: "bounded local maintenance fixture",
    behavior_expectation: "preserve behavior while enforcing the lifecycle",
    expected_preserved_behavior: ["read-only exploration remains available"],
    known_local_edge_cases: ["stale or replayed authority is rejected"],
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
    ...overrides,
  };
}

function bugStart(overrides = {}) {
  return standardStart({
    task_type: "bug_fix",
    required_check_ids: ["normal-bug-reproducer"],
    reproduction_contract: {
      check_id: "normal-bug-reproducer",
      expected_pre_fix: "failing_reproducer",
      expected_post_fix: "passing_regression",
      unavailable_reason: null,
      uncertainty_material: false,
    },
    ...overrides,
  });
}

expectCode(
  () => call("session/missing", "orchestrator", "quality_session_start", standardStart()),
  "QUALITY_SESSION_UNCLASSIFIED",
);
expectCode(
  () => handleNormalSessionToolBefore(bridge, { tool: "edit", sessionID: "session/missing", callID: "missing-edit" }, {
    args: { filePath: "src/file.mjs", oldString: "1", newString: "2", replaceAll: false },
  }),
  "QUALITY_SESSION_UNCLASSIFIED",
);

const session = "session/standard";
const firstRegistration = handleNormalSessionChatMessage(bridge, { sessionID: session, agent: "orchestrator" });
assert.equal(firstRegistration.lifecycle, "unclassified");
assert.equal(firstRegistration.primary_development_agent, true);
assert.equal(handleNormalSessionChatMessage(bridge, { sessionID: session, agent: "orchestrator" }).state_revision, firstRegistration.state_revision);
expectCode(() => handleNormalSessionChatMessage(bridge, { sessionID: session, agent: "orchestrator-deep" }), "QUALITY_SESSION_AGENT_MISMATCH");

const unknownRegistration = handleNormalSessionChatMessage(bridge, { sessionID: "session/agent-late" });
assert.equal(unknownRegistration.agent_name, "unknown");
const upgradedRegistration = handleNormalSessionChatMessage(bridge, { sessionID: "session/agent-late", agent: "orchestrator-deep" });
assert.equal(upgradedRegistration.agent_name, "orchestrator-deep");
assert.equal(upgradedRegistration.primary_development_agent, true);
assert.equal(handleNormalSessionChatMessage(bridge, { sessionID: "session/agent-late" }).agent_name, "orchestrator-deep");

expectCode(() => handleNormalSessionToolBefore(
  bridge,
  { tool: "bash", sessionID: session, callID: "readonly-status" },
  { args: { command: "git rev-parse HEAD" } },
), "QUALITY_SESSION_UNCLASSIFIED");
expectCode(() => handleNormalSessionToolBefore(
  bridge,
  { tool: "bash", sessionID: session, callID: "compound-status" },
  { args: { command: "git status --short && echo bypass" } },
), "QUALITY_SESSION_UNCLASSIFIED");
expectCode(() => handleNormalSessionToolBefore(
  bridge,
  { tool: "task", sessionID: session, callID: "pregate-general" },
  { args: { description: "write", prompt: "write", subagent_type: "general" } },
), "QUALITY_SESSION_UNCLASSIFIED");

const started = call(session, "orchestrator", "quality_session_start", standardStart());
assert.equal(started.lifecycle, "dossier_draft");
const standardRegistration = inspectNormalSessionRegistration(bridge, session);
assert.equal(standardRegistration.lifecycle, "standard_lite");
assert.equal(standardRegistration.risk_class, "standard-lite");
assert.deepEqual(standardRegistration.ownership_paths, ["src"]);
assert.deepEqual(standardRegistration.required_check_ids, ["normal-harness-static"]);
const standardState = inspectNormalSessionQualityState(bridge, session);
assert.equal(standardState.dossier.impact_graph, null, "standard-lite must not require a fabricated full impact graph");
assert.equal(standardState.dossier.task_shape.worktree_state, "clean");
assert.deepEqual(
  call(session, "orchestrator", "quality_session_start", standardStart()),
  started,
  "an exact standard-lite classification retry must return the existing runner-owned result",
);
recordLocalContext(bridge, session);
expectCode(
  () => call(session, "orchestrator", "quality_session_start", standardStart({ user_visible_goal: "conflicting replay" })),
  "QUALITY_SESSION_REPLAY",
);
expectCode(() => handleNormalSessionToolBefore(
  bridge,
  { tool: "edit", sessionID: session, callID: "classified-pregate" },
  { args: { filePath: "src/file.mjs", oldString: "1", newString: "2", replaceAll: false } },
), "QUALITY_PRE_GATE_VIOLATION");

const enabled = call(session, "orchestrator", "quality_dossier_finalize", { expected_revision: 1 });
assert.equal(enabled.lifecycle, "implementation_enabled");
assert.equal(inspectNormalSessionRegistration(bridge, session).lifecycle, "implementation_enabled");
const verification = call(session, "verifier", "quality_verification_record", { expected_revision: 1 });
assert.equal(verification.complete, true);
assert.equal(inspectNormalSessionQualityState(bridge, session).lifecycle, "verified");
assert.equal(inspectNormalSessionRegistration(bridge, session).lifecycle, "verified");
assert.equal(reconcileForAttestation(bridge, session).status, "passed");
const attestation = call(session, "orchestrator", "quality_session_finalize", { expected_revision: 1 });
assert.match(attestation.fingerprint, /^sha256:[a-f0-9]{64}$/u);
assert.equal(inspectNormalSessionRegistration(bridge, session).lifecycle, "attested");
expectCode(() => handleNormalSessionToolBefore(
  bridge,
  { tool: "bash", sessionID: session, callID: "after-attestation" },
  { args: { command: "git status --short" } },
), "QUALITY_SESSION_INCOMPLETE");

const registryFiles = fs.readdirSync(path.join(tempRoot, ".oc_harness", "quality", "session-registry"));
assert(registryFiles.every((entry) => !entry.includes("session")), "registration filenames must use opaque session hashes");
assert(registryFiles.some((entry) => entry.endsWith(".json")));

handleNormalSessionChatMessage(bridge, { sessionID: "session/read-only", agent: "reviewer" });
expectCode(() => call("session/read-only", "reviewer", "quality_session_start", standardStart()), "QUALITY_TOOL_ROLE");

handleNormalSessionChatMessage(bridge, { sessionID: "session/agent-context-late" });
call("session/agent-context-late", "orchestrator-deep", "quality_session_start", standardStart());
assert.equal(inspectNormalSessionRegistration(bridge, "session/agent-context-late").agent_name, "orchestrator-deep");

for (const [suffix, request, code] of [
  ["missing-compact", { ...standardStart(), behavior_expectation: undefined }, "QUALITY_STANDARD_LITE_SCOPE_EXCEEDED"],
  ["risk-fact", standardStart({ scope_facts: { ...standardStart().scope_facts, security_sensitive: true } }), "QUALITY_RISK_ESCALATION_REQUIRED"],
  ["ownership", standardStart({ ownership_paths: ["src", "docs", "lib", "quality"] }), "QUALITY_STANDARD_LITE_SCOPE_EXCEEDED"],
  ["unknown-check", standardStart({ required_check_ids: ["missing-check"] }), "QUALITY_STANDARD_LITE_CHECK_MISSING"],
]) {
  const candidate = `session/${suffix}`;
  handleNormalSessionChatMessage(bridge, { sessionID: candidate, agent: "orchestrator" });
  const normalized = JSON.parse(JSON.stringify(request));
  expectCode(() => call(candidate, "orchestrator", "quality_session_start", normalized), code);
  assert.equal(inspectNormalSessionRegistration(bridge, candidate).lifecycle, "unclassified");
}

const bugSession = "session/standard-bug-reproduction";
handleNormalSessionChatMessage(bridge, { sessionID: bugSession, agent: "orchestrator" });
const bugStarted = call(bugSession, "orchestrator", "quality_session_start", bugStart());
const bugRegistration = inspectNormalSessionRegistration(bridge, bugSession);
assert.deepEqual(bugRegistration.reproduction_contract, bugStart().reproduction_contract);
assert.deepEqual(
  call(bugSession, "orchestrator", "quality_session_start", bugStart()),
  bugStarted,
  "an exact standard-lite bug-fix retry must preserve the reproduction contract",
);
assert.deepEqual(
  inspectNormalSessionQualityState(bridge, bugSession).dossier.test_obligations.map(({ check_id, kind, phase }) => ({ check_id, kind, phase })),
  [
    { check_id: "normal-bug-reproducer", kind: "reproducer", phase: "preimplementation" },
    { check_id: "normal-bug-reproducer", kind: "unit", phase: "integration" },
  ],
);

for (const [suffix, request, code] of [
  ["bug-missing-contract", standardStart({ task_type: "bug_fix" }), "QUALITY_REPRODUCTION_CONTRACT"],
  ["bug-integration-only", bugStart({
    required_check_ids: ["normal-integration-only"],
    reproduction_contract: { ...bugStart().reproduction_contract, check_id: "normal-integration-only" },
  }), "QUALITY_REPRODUCTION_CHECK_MISSING"],
  ["bug-unavailable-no-reason", bugStart({
    reproduction_contract: {
      ...bugStart().reproduction_contract,
      expected_pre_fix: "unavailable",
      unavailable_reason: "",
    },
  }), "QUALITY_STRING_BOUNDS"],
  ["bug-material-uncertainty", bugStart({
    reproduction_contract: {
      ...bugStart().reproduction_contract,
      expected_pre_fix: "unavailable",
      unavailable_reason: "requires an unavailable external service",
      uncertainty_material: true,
    },
  }), "QUALITY_RISK_ESCALATION_REQUIRED"],
]) {
  const candidate = `session/${suffix}`;
  handleNormalSessionChatMessage(bridge, { sessionID: candidate, agent: "orchestrator" });
  expectCode(() => call(candidate, "orchestrator", "quality_session_start", request), code);
}

const unavailableBugSession = "session/bug-unavailable-bounded";
handleNormalSessionChatMessage(bridge, { sessionID: unavailableBugSession, agent: "orchestrator" });
call(unavailableBugSession, "orchestrator", "quality_session_start", bugStart({
  reproduction_contract: {
    ...bugStart().reproduction_contract,
    expected_pre_fix: "unavailable",
    unavailable_reason: "the bounded fixture dependency is unavailable on this host",
  },
}));
assert.equal(
  inspectNormalSessionRegistration(bridge, unavailableBugSession).reproduction_contract.expected_pre_fix,
  "unavailable",
);

handleNormalSessionChatMessage(bridge, { sessionID: "session/project-protected", agent: "orchestrator" });
expectCode(
  () => call("session/project-protected", "orchestrator", "quality_session_start", standardStart({ ownership_paths: ["src/security.mjs"] })),
  "QUALITY_RISK_ESCALATION_REQUIRED",
);
if (process.platform === "win32") {
  handleNormalSessionChatMessage(bridge, { sessionID: "session/project-protected-case", agent: "orchestrator" });
  expectCode(
    () => call(
      "session/project-protected-case",
      "orchestrator",
      "quality_session_start",
      standardStart({ ownership_paths: ["src/SECURITY/new.mjs"] }),
    ),
    "QUALITY_RISK_ESCALATION_REQUIRED",
  );
}
const noPolicyBridge = createNormalSessionQualityBridge({
  workspaceRoot: tempRoot,
  checkCatalog,
  observeWorkspace,
  affectedFileInspector: () => ["src/file.mjs"],
  runTrustedTarget: () => ({ status: "passed", command_id: "fixture", exit_code: 0 }),
});
handleNormalSessionChatMessage(noPolicyBridge, { sessionID: "session/no-project-policy", agent: "orchestrator" });
expectCode(() => executeNormalSessionQualityTool(
  noPolicyBridge,
  "quality_session_start",
  { request: JSON.stringify(standardStart()) },
  { sessionID: "session/no-project-policy", agent: "orchestrator" },
), "QUALITY_RISK_ESCALATION_REQUIRED");

affectedFiles = Array.from({ length: 13 }, (_, index) => `src/file-${index}.mjs`);
handleNormalSessionChatMessage(bridge, { sessionID: "session/too-many-files", agent: "orchestrator" });
expectCode(() => call("session/too-many-files", "orchestrator", "quality_session_start", standardStart()), "QUALITY_STANDARD_LITE_SCOPE_EXCEEDED");
affectedFiles = ["src/file.mjs"];

workspaceEntries = [{ path: "outside.txt", fingerprint: fingerprint({ baseline: true }) }];
handleNormalSessionChatMessage(bridge, { sessionID: "session/dirty-preserved", agent: "orchestrator" });
expectCode(() => call("session/dirty-preserved", "orchestrator", "quality_session_start", standardStart()), "QUALITY_RISK_ESCALATION_REQUIRED");
assert.equal(inspectNormalSessionRegistration(bridge, "session/dirty-preserved").lifecycle, "unclassified");
workspaceEntries = [];

let injectedFailure = "after_registry_classification";
const faultOptions = {
  workspaceRoot: tempRoot,
  checkCatalog,
  projectCatalogLoader: () => catalogBinding,
  standardLitePolicy,
  observeWorkspace,
  affectedFileInspector: () => ["src/file.mjs"],
  runTrustedTarget: () => ({ status: "passed", command_id: "fixture", exit_code: 0 }),
  lockStaleMs: 0,
  failureInjector: (stage) => {
    if (stage === injectedFailure) throw new Error(`injected:${stage}`);
  },
};

function hardExitRiskEscalation(sessionID, stage) {
  const bridgeModuleUrl = new URL("../lib/quality/normal-session-bridge.mjs", import.meta.url).href;
  const childSource = String.raw`
const [bridgeModuleUrl, workspaceRoot, sessionID, failureStage] = process.argv.slice(1);
const api = await import(bridgeModuleUrl);
const checkCatalog = api.createDefaultNormalSessionCheckCatalog();
const standardLitePolicy = {
  allowed_ownership_prefixes: ["src"],
  protected_paths: ["src/auth", "src/security", "src/security.mjs"],
};
const catalogBinding = {
  catalog: {
    catalog_id: checkCatalog.catalog_id,
    standard_lite_policy: standardLitePolicy,
    checks: [
      ...checkCatalog.checks.map((entry) => ({ check_id: entry.check_id, phases: [...entry.phases], purpose: "verification" })),
      { check_id: "normal-bug-reproducer", phases: ["preimplementation", "integration"], purpose: "bug_reproducer" },
      { check_id: "normal-integration-only", phases: ["integration"], purpose: "verification" },
    ],
  },
  fingerprint: checkCatalog.fingerprint,
};
const bridge = api.createNormalSessionQualityBridge({
  workspaceRoot,
  checkCatalog,
  projectCatalogLoader: () => catalogBinding,
  standardLitePolicy,
  observeWorkspace: () => { throw new Error("hard-exit recovery must not re-observe the workspace"); },
  affectedFileInspector: () => ["src/file.mjs"],
  runTrustedTarget: () => ({ status: "passed", command_id: "fixture", exit_code: 0 }),
  lockStaleMs: 0,
  failureInjector: (stage) => {
    if (stage === failureStage) process.exit(73);
  },
});
api.executeNormalSessionQualityTool(bridge, "quality_context_strategy_escalate", {
  request: JSON.stringify({ requested_strategy_id: "high-wide-deep-v1" }),
}, { sessionID, agent: "orchestrator" });
process.exit(74);
`;
  return spawnSync(process.execPath, [
    "--input-type=module",
    "--eval",
    childSource,
    bridgeModuleUrl,
    tempRoot,
    sessionID,
    stage,
  ], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 30_000,
  });
}
let faultBridge = createNormalSessionQualityBridge(faultOptions);
const faultSession = "session/lifecycle-fault-recovery";
handleNormalSessionChatMessage(faultBridge, { sessionID: faultSession, agent: "orchestrator" });
assert.throws(() => executeNormalSessionQualityTool(
  faultBridge,
  "quality_session_start",
  { request: JSON.stringify(standardStart()) },
  { sessionID: faultSession, agent: "orchestrator" },
), /injected:after_registry_classification/u);
injectedFailure = null;
faultBridge = createNormalSessionQualityBridge(faultOptions);
const recoveredStart = executeNormalSessionQualityTool(faultBridge, "quality_session_start", {
  request: JSON.stringify(standardStart()),
}, { sessionID: faultSession, agent: "orchestrator" });
assert.equal(recoveredStart.lifecycle, "dossier_draft");
recordLocalContext(faultBridge, faultSession);

injectedFailure = "after_registry_classification";
let bugFaultBridge = createNormalSessionQualityBridge(faultOptions);
const bugFaultSession = "session/bug-lifecycle-fault-recovery";
handleNormalSessionChatMessage(bugFaultBridge, { sessionID: bugFaultSession, agent: "orchestrator" });
assert.throws(() => executeNormalSessionQualityTool(
  bugFaultBridge,
  "quality_session_start",
  { request: JSON.stringify(bugStart()) },
  { sessionID: bugFaultSession, agent: "orchestrator" },
), /injected:after_registry_classification/u);
injectedFailure = null;
bugFaultBridge = createNormalSessionQualityBridge(faultOptions);
const recoveredBugStart = executeNormalSessionQualityTool(bugFaultBridge, "quality_session_start", {
  request: JSON.stringify(bugStart()),
}, { sessionID: bugFaultSession, agent: "orchestrator" });
assert.equal(recoveredBugStart.lifecycle, "dossier_draft");
assert.deepEqual(
  inspectNormalSessionRegistration(bugFaultBridge, bugFaultSession).reproduction_contract,
  bugStart().reproduction_contract,
);

for (const stage of [
  "after_owner_risk_escalation",
  "after_registry_risk_escalation",
  "after_strategy_binding_publish",
]) {
  injectedFailure = null;
  let transactionBridge = createNormalSessionQualityBridge(faultOptions);
  const transactionSession = `session/risk-escalation-${stage}`;
  const transactionContext = { sessionID: transactionSession, agent: "orchestrator" };
  handleNormalSessionChatMessage(transactionBridge, transactionContext);
  executeNormalSessionQualityTool(transactionBridge, "quality_session_start", {
    request: JSON.stringify(standardStart()),
  }, transactionContext);
  recordLocalContext(transactionBridge, transactionSession);
  const ownerBeforeFailure = inspectNormalSessionQualityState(transactionBridge, transactionSession);
  const registrationBeforeFailure = inspectNormalSessionRegistration(transactionBridge, transactionSession);

  injectedFailure = stage;
  assert.throws(() => executeNormalSessionQualityTool(transactionBridge, "quality_context_strategy_escalate", {
    request: JSON.stringify({ requested_strategy_id: "high-wide-deep-v1" }),
  }, transactionContext), new RegExp(`injected:${stage}`, "u"));
  injectedFailure = null;
  assert.deepEqual(inspectNormalSessionQualityState(transactionBridge, transactionSession), ownerBeforeFailure,
    `${stage} must restore the exact owner state`);
  assert.deepEqual(inspectNormalSessionRegistration(transactionBridge, transactionSession), registrationBeforeFailure,
    `${stage} must restore the exact registry state`);

  transactionBridge = createNormalSessionQualityBridge(faultOptions);
  assert.deepEqual(inspectNormalSessionQualityState(transactionBridge, transactionSession), ownerBeforeFailure,
    `${stage} restoration must survive restart`);
  assert.deepEqual(inspectNormalSessionRegistration(transactionBridge, transactionSession), registrationBeforeFailure,
    `${stage} registry restoration must survive restart`);
  executeNormalSessionQualityTool(transactionBridge, "quality_context_strategy_escalate", {
    request: JSON.stringify({ requested_strategy_id: "high-wide-deep-v1" }),
  }, transactionContext);
  const escalatedOwner = inspectNormalSessionQualityState(transactionBridge, transactionSession);
  const escalatedRegistration = inspectNormalSessionRegistration(transactionBridge, transactionSession);
  assert.equal(escalatedOwner.dossier.risk_class, "high");
  assert.equal(escalatedOwner.context_strategy.strategy_id, "high-wide-deep-v1");
  assert.equal(escalatedOwner.context_report, null, "risk promotion must require a newly planned impact graph");
  assert.equal(escalatedOwner.standard_lite_policy, null);
  assert.deepEqual(escalatedOwner.cumulative_affected_paths, ownerBeforeFailure.cumulative_affected_paths,
    "escalation must retain prior path facts only as re-observation obligations");
  assert.equal(escalatedRegistration.risk_class, "high");
  assert.equal(escalatedRegistration.standard_lite_policy, null);
}

for (const stage of ["after_owner_risk_escalation", "after_registry_risk_escalation"]) {
  injectedFailure = null;
  let crashBridge = createNormalSessionQualityBridge(faultOptions);
  const crashSession = `session/risk-escalation-hard-exit-${stage}`;
  const crashContext = { sessionID: crashSession, agent: "orchestrator" };
  handleNormalSessionChatMessage(crashBridge, crashContext);
  executeNormalSessionQualityTool(crashBridge, "quality_session_start", {
    request: JSON.stringify(standardStart()),
  }, crashContext);
  recordLocalContext(crashBridge, crashSession);
  const ownerBeforeCrash = inspectNormalSessionQualityState(crashBridge, crashSession);
  assert(ownerBeforeCrash.context_receipt_ids.length > 0, `${stage} fixture must retain context receipts`);
  assert(ownerBeforeCrash.cumulative_affected_paths.length > 0, `${stage} fixture must retain affected path facts`);

  const child = hardExitRiskEscalation(crashSession, stage);
  assert.equal(child.status, 73, `${stage} child must terminate at the durable crash window: ${child.stderr}`);

  crashBridge = createNormalSessionQualityBridge(faultOptions);
  let expectedContextReceiptIds = ownerBeforeCrash.context_receipt_ids;
  if (stage === "after_owner_risk_escalation") {
    assert.equal(inspectNormalSessionRegistration(crashBridge, crashSession).risk_class, "standard-lite",
      "owner-only crash window must begin restart with the lower registry authority");
    const postCrashCallID = `classification-context-read-${++contextCallSequence}`;
    handleNormalSessionToolBefore(crashBridge, {
      tool: "context_read",
      sessionID: crashSession,
      callID: postCrashCallID,
    }, { args: { path: "src/file.mjs", startLine: 1, maxLines: 1, maxBytes: 4096, format: "text" } });
    assert.equal(inspectNormalSessionRegistration(crashBridge, crashSession).risk_class, "high",
      "context authority must reconcile the registry before starting post-crash discovery");
    handleNormalSessionToolAfter(crashBridge, {
      tool: "context_read",
      sessionID: crashSession,
      callID: postCrashCallID,
    }, {
      output: contextReadToolOutput("src/file.mjs", postCrashCallID),
      title: "post-crash classification context read",
      metadata: {},
    });
    expectedContextReceiptIds = inspectNormalSessionQualityState(crashBridge, crashSession).context_receipt_ids;
    assert.equal(expectedContextReceiptIds.length, ownerBeforeCrash.context_receipt_ids.length + 1,
      "reconciled post-crash context settlement must append exactly one active-strategy receipt");
  }
  const recovered = executeNormalSessionQualityTool(crashBridge, "quality_dossier_inspect", {
    request: "{}",
  }, crashContext);
  assert.equal(recovered.context_strategy_id, "high-wide-deep-v1");
  const recoveredOwner = inspectNormalSessionQualityState(crashBridge, crashSession);
  const recoveredRegistration = inspectNormalSessionRegistration(crashBridge, crashSession);
  assert.equal(recoveredOwner.dossier.risk_class, "high", `${stage} owner authority must survive restart`);
  assert.equal(recoveredRegistration.risk_class, "high", `${stage} registry projection must roll forward on restart`);
  assert.equal(recoveredOwner.standard_lite_policy, null);
  assert.equal(recoveredOwner.reproduction_contract, null);
  assert.equal(recoveredOwner.context_report, null);
  assert.equal(recoveredOwner.context_task_profile_evidence, null);
  assert.equal(recoveredOwner.context_decision, null);
  assert.deepEqual(recoveredOwner.contributions, []);
  assert.equal(recoveredOwner.reviewer_reconciliation_evidence, null);
  assert.equal(recoveredOwner.context_reconciliation, null);
  assert.equal(recoveredOwner.gate, null);
  assert.equal(recoveredOwner.preimplementation_evidence, null);
  assert.deepEqual(recoveredOwner.preimplementation_check_receipts, []);
  assert.equal(recoveredOwner.architecture_evaluation, null);
  assert.equal(recoveredOwner.post_architecture_evidence, null);
  assert.deepEqual(recoveredOwner.capabilities, []);
  assert.deepEqual(recoveredOwner.pending_context_calls, []);
  assert.deepEqual(recoveredOwner.pending_mutations, []);
  assert.equal(recoveredOwner.active_task_launch, null);
  assert.equal(recoveredOwner.verification, null);
  assert.equal(recoveredOwner.attestation, null);
  assert.equal(recoveredOwner.first_mutation_sequence, null);
  assert.deepEqual(recoveredOwner.context_receipt_ids, expectedContextReceiptIds,
    `${stage} restart repair must preserve the exact reconciled context receipt history`);
  assert.deepEqual(recoveredOwner.context_read_only_subagent_ids, ownerBeforeCrash.context_read_only_subagent_ids,
    `${stage} restart repair must preserve pre-promotion context subagent facts`);
  assert.deepEqual(recoveredOwner.cumulative_affected_paths, ownerBeforeCrash.cumulative_affected_paths,
    `${stage} restart repair must preserve pre-promotion affected path facts`);
  assert.equal(recoveredOwner.dossier.mode, "full");
  assert.equal(recoveredOwner.dossier.revision, 1);
  assert.equal(recoveredOwner.dossier.created_at, recoveredOwner.dossier.updated_at);
  assert.equal(recoveredOwner.dossier.finalized_at, null);
  assert.deepEqual(recoveredOwner.dossier.plan_challenge, {
    architect_result_id: null,
    reviewer_result_id: null,
    blockers: [],
    evidence_refs: [],
  });
  assert.deepEqual(recoveredOwner.dossier.gate_state, {
    status: "not_evaluated",
    gate_id: null,
    reason_codes: [],
  });

  const ownerRevision = recoveredOwner.state_revision;
  const registrationRevision = recoveredRegistration.state_revision;
  executeNormalSessionQualityTool(crashBridge, "quality_context_strategy_escalate", {
    request: JSON.stringify({ requested_strategy_id: "high-wide-deep-v1" }),
  }, crashContext);
  assert.equal(inspectNormalSessionQualityState(crashBridge, crashSession).state_revision, ownerRevision,
    `${stage} same-target retry must not rewrite owner state`);
  assert.equal(inspectNormalSessionRegistration(crashBridge, crashSession).state_revision, registrationRevision,
    `${stage} same-target retry must not rewrite registry state`);
}

injectedFailure = null;
let laterDraftBridge = createNormalSessionQualityBridge(faultOptions);
const laterDraftSession = "session/risk-escalation-later-draft-lower-registry";
const laterDraftContext = { sessionID: laterDraftSession, agent: "orchestrator" };
handleNormalSessionChatMessage(laterDraftBridge, laterDraftContext);
executeNormalSessionQualityTool(laterDraftBridge, "quality_session_start", {
  request: JSON.stringify(standardStart()),
}, laterDraftContext);
const lowerRegistration = inspectNormalSessionRegistration(laterDraftBridge, laterDraftSession);
executeNormalSessionQualityTool(laterDraftBridge, "quality_context_strategy_escalate", {
  request: JSON.stringify({ requested_strategy_id: "high-wide-deep-v1" }),
}, laterDraftContext);
expectCode(() => executeNormalSessionQualityTool(laterDraftBridge, "quality_architecture_evaluate", {
  request: JSON.stringify({ expected_revision: 1, blockers: [] }),
}, { sessionID: laterDraftSession, agent: "architect" }), "QUALITY_PLAN_CHALLENGE_BEFORE_CONTEXT_SUFFICIENCY");
const laterDraftOwner = inspectNormalSessionQualityState(laterDraftBridge, laterDraftSession);
assert.equal(laterDraftOwner.lifecycle, "dossier_draft");
assert.equal(laterDraftOwner.dossier.revision, 1);
assert.equal(laterDraftOwner.dossier.impact_graph, null);
assert.equal(laterDraftOwner.context_report, null);
assert.equal(laterDraftOwner.contributions.length, 0);
const laterDraftSessionKey = createHash("sha256").update(laterDraftSession).digest("hex");
const lowerRegistrationPath = path.join(
  tempRoot,
  ".oc_harness",
  "quality",
  "session-registry",
  `${laterDraftSessionKey}.json`,
);
fs.writeFileSync(lowerRegistrationPath, `${JSON.stringify(lowerRegistration)}\n`, "utf8");
laterDraftBridge = createNormalSessionQualityBridge(faultOptions);
assert.doesNotThrow(() => executeNormalSessionQualityTool(laterDraftBridge, "quality_dossier_inspect", {
  request: "{}",
}, laterDraftContext));
const repairedLaterDraftOwner = inspectNormalSessionQualityState(laterDraftBridge, laterDraftSession);
const repairedLaterDraftRegistration = inspectNormalSessionRegistration(laterDraftBridge, laterDraftSession);
assert.equal(repairedLaterDraftOwner.dossier.risk_class, repairedLaterDraftRegistration.risk_class);
assert.equal(repairedLaterDraftOwner.lifecycle, repairedLaterDraftRegistration.lifecycle);

injectedFailure = null;
let progressedReceiptBridge = createNormalSessionQualityBridge(faultOptions);
const progressedReceiptSession = "session/risk-escalation-progressed-receipt-lower-registry";
const progressedReceiptContext = { sessionID: progressedReceiptSession, agent: "orchestrator" };
handleNormalSessionChatMessage(progressedReceiptBridge, progressedReceiptContext);
executeNormalSessionQualityTool(progressedReceiptBridge, "quality_session_start", {
  request: JSON.stringify(standardStart()),
}, progressedReceiptContext);
const progressedLowerRegistration = inspectNormalSessionRegistration(progressedReceiptBridge, progressedReceiptSession);
executeNormalSessionQualityTool(progressedReceiptBridge, "quality_context_strategy_escalate", {
  request: JSON.stringify({ requested_strategy_id: "high-wide-deep-v1" }),
}, progressedReceiptContext);
recordLocalContext(progressedReceiptBridge, progressedReceiptSession);
const progressedReceiptOwner = inspectNormalSessionQualityState(progressedReceiptBridge, progressedReceiptSession);
assert.equal(progressedReceiptOwner.dossier.revision, 1);
assert.equal(progressedReceiptOwner.context_report, null);
assert.equal(progressedReceiptOwner.pending_context_calls.length, 0);
assert.equal(progressedReceiptOwner.context_receipt_ids.length > 0, true);
const progressedReceiptSessionKey = createHash("sha256").update(progressedReceiptSession).digest("hex");
const progressedLowerRegistrationPath = path.join(
  tempRoot,
  ".oc_harness",
  "quality",
  "session-registry",
  `${progressedReceiptSessionKey}.json`,
);
fs.writeFileSync(progressedLowerRegistrationPath, `${JSON.stringify(progressedLowerRegistration)}\n`, "utf8");
progressedReceiptBridge = createNormalSessionQualityBridge(faultOptions);
expectCode(() => executeNormalSessionQualityTool(progressedReceiptBridge, "quality_dossier_inspect", {
  request: "{}",
}, progressedReceiptContext), "QUALITY_LIFECYCLE_RECONCILIATION");

injectedFailure = null;
let reverseMismatchBridge = createNormalSessionQualityBridge(faultOptions);
const reverseMismatchSession = "session/risk-escalation-reverse-mismatch";
const reverseMismatchContext = { sessionID: reverseMismatchSession, agent: "orchestrator" };
handleNormalSessionChatMessage(reverseMismatchBridge, reverseMismatchContext);
executeNormalSessionQualityTool(reverseMismatchBridge, "quality_session_start", {
  request: JSON.stringify(standardStart()),
}, reverseMismatchContext);
const reverseRegistration = structuredClone(inspectNormalSessionRegistration(reverseMismatchBridge, reverseMismatchSession));
reverseRegistration.risk_class = "high";
reverseRegistration.lifecycle = "dossier_draft";
reverseRegistration.lifecycle_history.push({
  lifecycle: "dossier_draft",
  at: "2026-07-18T12:00:00.000Z",
  reason_code: "TEST_REVERSE_RISK_MISMATCH",
});
reverseRegistration.classification_revision += 1;
reverseRegistration.reproduction_contract = null;
reverseRegistration.standard_lite_policy = null;
reverseRegistration.scope_facts = null;
delete reverseRegistration.fingerprint;
reverseRegistration.fingerprint = fingerprint(reverseRegistration);
const reverseSessionKey = createHash("sha256").update(reverseMismatchSession).digest("hex");
const reverseRegistrationPath = path.join(
  tempRoot,
  ".oc_harness",
  "quality",
  "session-registry",
  `${reverseSessionKey}.json`,
);
fs.writeFileSync(reverseRegistrationPath, `${JSON.stringify(reverseRegistration)}\n`, "utf8");
reverseMismatchBridge = createNormalSessionQualityBridge(faultOptions);
expectCode(() => executeNormalSessionQualityTool(reverseMismatchBridge, "quality_dossier_inspect", {
  request: "{}",
}, reverseMismatchContext), "QUALITY_LIFECYCLE_RECONCILIATION");

for (const [stage, toolId, agent] of [
  ["after_owner_gate", "quality_dossier_finalize", "orchestrator"],
  ["after_owner_verification", "quality_verification_record", "verifier"],
  ["after_owner_attestation", "quality_session_finalize", "orchestrator"],
]) {
  if (stage === "after_owner_attestation") reconcileForAttestation(faultBridge, faultSession);
  injectedFailure = stage;
  assert.throws(() => executeNormalSessionQualityTool(faultBridge, toolId, {
    request: JSON.stringify({ expected_revision: 1 }),
  }, { sessionID: faultSession, agent }), new RegExp(`injected:${stage}`, "u"));
  injectedFailure = null;
  faultBridge = createNormalSessionQualityBridge(faultOptions);
  assert.doesNotThrow(() => executeNormalSessionQualityTool(faultBridge, toolId, {
    request: JSON.stringify({ expected_revision: 1 }),
  }, { sessionID: faultSession, agent }));
}
assert.equal(inspectNormalSessionRegistration(faultBridge, faultSession).lifecycle, "attested");

const escalationSession = "session/classification-escalation";
handleNormalSessionChatMessage(bridge, { sessionID: escalationSession, agent: "orchestrator" });
call(escalationSession, "orchestrator", "quality_session_start", standardStart());
const escalationBefore = inspectNormalSessionRegistration(bridge, escalationSession);
assert.notEqual(escalationBefore.standard_lite_policy, null);
assert.equal(escalationBefore.initial_affected_paths.includes("src/file.mjs"), true);
call(escalationSession, "orchestrator", "quality_context_strategy_escalate", {
  requested_strategy_id: "high-wide-deep-v1",
});
const escalationAfter = inspectNormalSessionRegistration(bridge, escalationSession);
assert.equal(escalationAfter.risk_class, "high");
assert.equal(escalationAfter.lifecycle, "dossier_draft");
assert.equal(escalationAfter.standard_lite_policy, null, "escalation must remove standard-lite policy authority");
assert.equal(escalationAfter.scope_facts, null, "escalation must remove standard-lite classification authority");
assert.equal(escalationAfter.reproduction_contract, null);
assert.deepEqual(escalationAfter.initial_affected_paths, escalationBefore.initial_affected_paths,
  "pre-escalation affected paths must remain durable re-observation facts");
const escalationRevision = escalationAfter.state_revision;
call(escalationSession, "orchestrator", "quality_context_strategy_escalate", {
  requested_strategy_id: "high-wide-deep-v1",
});
assert.equal(inspectNormalSessionRegistration(bridge, escalationSession).state_revision, escalationRevision,
  "same-target escalation must be idempotent");

handleNormalSessionChatMessage(bridge, { sessionID: "session/high", agent: "orchestrator-deep" });
const high = call("session/high", "orchestrator-deep", "quality_session_start", {
  risk_class: "high",
  task_type: "maintenance",
  user_visible_goal: "Require a full Engineering Dossier.",
  ownership_paths: ["src"],
  required_check_ids: ["normal-harness-static"],
  classification_rationale: "public or architectural risk requires independent challenge",
});
assert.equal(high.lifecycle, "dossier_draft");
assert.equal(inspectNormalSessionRegistration(bridge, "session/high").risk_class, "high");
expectCode(() => handleNormalSessionToolBefore(
  bridge,
  { tool: "edit", sessionID: "session/high", callID: "high-pregate" },
  { args: { filePath: "src/file.mjs", oldString: "1", newString: "2", replaceAll: false } },
), "QUALITY_PRE_GATE_VIOLATION");

handleNormalSessionChatMessage(bridge, { sessionID: "session/critical", agent: "orchestrator" });
call("session/critical", "orchestrator", "quality_session_start", {
  risk_class: "critical",
  task_type: "maintenance",
  user_visible_goal: "Require the full critical Engineering Dossier path.",
  ownership_paths: ["src"],
  required_check_ids: ["normal-harness-static"],
  classification_rationale: "critical risk requires independent challenge and a runner-owned gate",
});
expectCode(() => handleNormalSessionToolBefore(
  bridge,
  { tool: "task", sessionID: "session/critical", callID: "critical-pregate" },
  { args: { description: "write", prompt: "write", subagent_type: "general" } },
), "QUALITY_PRE_GATE_VIOLATION");

handleNormalSessionChatMessage(bridge, { sessionID: "session/workspace-drift", agent: "orchestrator" });
workspaceEntries = [{ path: "src/file.mjs", fingerprint: fingerprint({ version: 2 }) }];
expectCode(() => call("session/workspace-drift", "orchestrator", "quality_session_start", standardStart()), "QUALITY_WORKSPACE_UNTRACED");
workspaceEntries = [];

let raceObservation = 0;
const raceBridge = createNormalSessionQualityBridge({
  workspaceRoot: tempRoot,
  checkCatalog,
  standardLitePolicy,
  observeWorkspace: () => {
    raceObservation += 1;
    const raceEntries = raceObservation >= 3
      ? [{ path: "src/file.mjs", fingerprint: fingerprint({ raced: true }) }]
      : [];
    return workspaceSnapshot(raceEntries);
  },
  affectedFileInspector: () => ["src/file.mjs"],
  runTrustedTarget: () => ({ status: "passed", command_id: "fixture", exit_code: 0 }),
});
handleNormalSessionChatMessage(raceBridge, { sessionID: "session/classification-race", agent: "orchestrator" });
expectCode(() => executeNormalSessionQualityTool(
  raceBridge,
  "quality_session_start",
  { request: JSON.stringify(standardStart()) },
  { sessionID: "session/classification-race", agent: "orchestrator" },
), "QUALITY_WORKSPACE_UNTRACED");

let dossierRaceObservation = 0;
const dossierRaceBridge = createNormalSessionQualityBridge({
  workspaceRoot: tempRoot,
  checkCatalog,
  standardLitePolicy,
  observeWorkspace: () => {
    dossierRaceObservation += 1;
    const raceEntries = dossierRaceObservation >= 6
      ? [{ path: "src/file.mjs", fingerprint: fingerprint({ dossier_raced: true }) }]
      : [];
    return workspaceSnapshot(raceEntries);
  },
  affectedFileInspector: () => ["src/file.mjs"],
  runTrustedTarget: () => ({ status: "passed", command_id: "fixture", exit_code: 0 }),
});
handleNormalSessionChatMessage(dossierRaceBridge, { sessionID: "session/dossier-race", agent: "orchestrator" });
expectCode(() => executeNormalSessionQualityTool(
  dossierRaceBridge,
  "quality_session_start",
  { request: JSON.stringify(standardStart()) },
  { sessionID: "session/dossier-race", agent: "orchestrator" },
), "QUALITY_WORKSPACE_UNTRACED");

handleNormalSessionChatMessage(bridge, { sessionID: "session/catalog-drift", agent: "orchestrator" });
call("session/catalog-drift", "orchestrator", "quality_session_start", standardStart());
catalogBinding = { ...catalogBinding, fingerprint: fingerprint({ catalog: "changed" }) };
expectCode(() => call("session/catalog-drift", "orchestrator", "quality_dossier_inspect", {}), "QUALITY_CHECK_CATALOG_DRIFT");
assert.equal(inspectNormalSessionRegistration(bridge, "session/catalog-drift").lifecycle, "failed");

catalogBinding = {
  catalog: {
    catalog_id: checkCatalog.catalog_id,
    standard_lite_policy: standardLitePolicy,
    checks: checkCatalog.checks.map((entry) => ({ check_id: entry.check_id, phases: [...entry.phases] })),
  },
  fingerprint: checkCatalog.fingerprint,
};
handleNormalSessionChatMessage(bridge, { sessionID: "session/catalog-missing", agent: "orchestrator" });
call("session/catalog-missing", "orchestrator", "quality_session_start", standardStart());
catalogLoaderFails = true;
expectCode(() => call("session/catalog-missing", "orchestrator", "quality_dossier_inspect", {}), "QUALITY_CHECK_CATALOG_DRIFT");
assert.equal(inspectNormalSessionRegistration(bridge, "session/catalog-missing").lifecycle, "failed");

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("Session classification checks passed.");
