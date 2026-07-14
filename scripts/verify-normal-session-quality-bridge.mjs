import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  createDefaultNormalSessionCheckCatalog,
  createNormalSessionQualityBridge,
  executeNormalSessionQualityTool,
  handleNormalSessionEvent,
  handleNormalSessionPermission,
  handleNormalSessionToolAfter,
  handleNormalSessionToolBefore,
  inspectNormalSessionQualityState,
  normalSessionQualityStatePath,
} from "../lib/quality/normal-session-bridge.mjs";
import { createNormalSessionQualityPlugin } from "../lib/quality/normal-session-plugin.mjs";
import { buildEngineeringImpactGraph } from "../lib/quality/impact-graph.mjs";
import {
  diffContentBoundWorkspaces,
  observeContentBoundWorkspace,
} from "../lib/quality/normal-session-workspace.mjs";
import { ContractError, fingerprint } from "../lib/quality/validation.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-normal-quality-"));
fs.mkdirSync(path.join(tempRoot, "src"));
fs.writeFileSync(path.join(tempRoot, "src", "file.mjs"), "export const value = 1;\n", "utf8");

let clockTick = 0;
let idTick = 0;
const currentPathVersions = new Map();
const headSha = "a".repeat(40);
const clock = () => new Date(Date.UTC(2026, 6, 14, 10, 0, clockTick++)).toISOString();
const idFactory = (prefix) => `${prefix}-${String(++idTick).padStart(4, "0")}`;
const observeWorkspace = () => {
  const entries = [...currentPathVersions.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([file, version]) => ({
    path: file,
    fingerprint: fingerprint({ path: file, version }),
  }));
  return { head_sha: headSha, entries, fingerprint: fingerprint({ head_sha: headSha, entries }) };
};

function mapping(classification, overrides = {}) {
  return {
    classification,
    check_ids: [],
    mechanism_ids: [],
    evidence_refs: [],
    rationale: null,
    blocked_reason: null,
    external_dependency: null,
    ...overrides,
  };
}

function dossierRequest({ riskClass = "standard-lite", mode = "standard-lite" } = {}) {
  return {
    risk_class: riskClass,
    mode,
    task_type: "maintenance",
    user_visible_goal: "Verify the bounded normal-session quality bridge.",
    task_shape: {
      summary: "normal-session-bridge",
      starting_commit: headSha,
      worktree_state: "clean",
      instruction_sources: ["AGENTS.md"],
      skill_ids: ["global-quality-gates"],
      constraints: ["runner-owned-gate"],
      non_goals: ["network-access"],
    },
    behavior_contract: {
      status: "defined",
      requested_behavior: "block mutation before the quality gate",
      positive_behavior: ["owned mutation follows a passed gate"],
      negative_behavior: ["pre-gate mutation is denied"],
      boundary_behavior: ["write scope remains inside src"],
      error_behavior: ["invalid requests fail closed"],
      ordering_and_side_effects: ["verification follows the latest mutation"],
      preserved_behavior: ["read-only exploration remains available"],
      compatibility_requirements: ["strict dossier schema"],
      security_requirements: ["runner-owned fingerprints"],
      completion_requirements: ["trusted verification"],
    },
    compatibility_contract: {
      status: "defined",
      default_decision: "preserve",
      rationale: "the normal profile remains usable",
      evidence_refs: [{ kind: "file", value: "src/file.mjs" }],
    },
    public_contracts: [],
    system_boundaries: [],
    affected_areas: [{
      id: "AREA-src",
      path: "src/file.mjs",
      node_kind: "file",
      reason: "owned implementation target",
      confidence: "observed",
      evidence_refs: [{ kind: "file", value: "src/file.mjs" }],
    }],
    entry_points: [{
      id: "ENTRY-src",
      path: "src/file.mjs",
      symbol: "value",
      reason: "test entry",
      evidence_refs: [{ kind: "file", value: "src/file.mjs" }],
    }],
    call_paths: [],
    data_shapes: [],
    invariants: [{
      id: "INV-owned",
      statement: "the owned file remains syntactically valid",
      scope_ids: ["AREA-src"],
      mapping: mapping("applicable_directly_tested", { check_ids: ["normal-harness-static"] }),
    }],
    edge_cases: [{
      id: "EDGE-stale",
      category: "null_absent_empty_malformed_unsupported",
      condition: "stale revision",
      expected_behavior: "reject the update",
      scope_ids: ["ENTRY-src"],
      mapping: mapping("not_applicable", { rationale: "covered by the bridge contract verifier" }),
    }],
    failure_modes: [{
      id: "FAIL-hook",
      category: "partial_success_partial_failure",
      trigger: "missing permission correlation",
      impact: "mutation is denied",
      expected_handling: "fail closed",
      scope_ids: ["AREA-src"],
      mapping: mapping("applicable_verified_by_other_mechanism", { mechanism_ids: ["normal-architect-challenge"] }),
    }],
    premortem_matrix: [
      {
        id: "PREMORTEM-input",
        category: "null_absent_empty_malformed_unsupported",
        subject_ids: ["EDGE-stale"],
        mapping: mapping("applicable_directly_tested", { check_ids: ["normal-harness-static"] }),
      },
      {
        id: "PREMORTEM-partial",
        category: "partial_success_partial_failure",
        subject_ids: ["FAIL-hook"],
        mapping: mapping("applicable_verified_by_other_mechanism", { mechanism_ids: ["normal-architect-challenge"] }),
      },
    ],
    counterexamples: [],
    test_obligations: [{
      id: "TEST-static",
      check_id: "normal-harness-static",
      kind: "command",
      phase: "integration",
      scope_ids: ["AREA-src"],
      command_or_mechanism: "test:static",
      required: true,
      trusted_producer: "opencode-harness-normal-quality-runner",
    }],
    specialized_checks: [],
    assumptions: [],
    unknowns: [],
    subagent_handoffs: [],
    implementation_slices: [{
      id: "SLICE-src",
      owner: "general",
      intent: "implementation",
      write_scope: ["src"],
      concurrent_group: null,
      depends_on_slice_ids: [],
      invariant_ids: ["INV-owned"],
      verification_check_ids: ["normal-harness-static"],
    }],
    impact_graph: null,
    context_coverage: {
      status: "complete",
      affected_area_ids: ["AREA-src"],
      covered_area_ids: ["AREA-src"],
      truncated_area_ids: [],
      accepted_gap_ids: [],
      evidence_refs: [{ kind: "file", value: "src/file.mjs" }],
    },
    verification_plan: {
      baseline_check_ids: [],
      slice_check_ids: ["normal-harness-static"],
      integration_check_ids: ["normal-harness-static"],
      architecture_check_ids: [],
      regression_check_ids: ["normal-harness-static"],
      hidden_check_ids: [],
      truncated_check_ids: [],
      evidence_refs: [{ kind: "check", value: "normal-harness-static" }],
    },
    rollback_recovery: {
      rollback_expectation: "no persistent external state",
      recovery_expectation: "retry from the last durable revision",
      mapping: mapping("not_applicable", { rationale: "test mutation is a local file edit" }),
    },
    verification_boundary: {
      check_ids: ["normal-harness-static"],
      mechanism_ids: ["normal-architect-challenge"],
      ownership_paths: ["src"],
      integration_check_ids: ["normal-harness-static"],
    },
  };
}

function configuredPolicyGraph() {
  const evidence = [{ kind: "file", value: "src/file.mjs" }];
  const excludedBoundary = (category, rationale) => ({
    id: `BOUNDARY-${category}`,
    category,
    classification: "reasoned_excluded",
    node_ids: [],
    edge_ids: [],
    path_ids: [],
    unknown_ids: [],
    excluded_sibling_ids: [],
    rationale,
    evidence_refs: evidence,
  });
  return buildEngineeringImpactGraph({
    graph_id: "GRAPH-normal-policy",
    risk_class: "standard-lite",
    nodes: [{
      id: "NODE-normal-entry",
      kind: "public_api",
      path: "src/file.mjs",
      symbol: "value",
      label: "normal policy entry",
      boundary: "entry_point",
      confidence: "observed",
      coverage: "complete",
      evidence_refs: [...evidence, { kind: "check", value: "normal-architecture-policy-probe" }],
    }],
    edges: [],
    affected_paths: [],
    excluded_siblings: [],
    unknowns: [],
    coverage: {
      completeness: "complete",
      semantic_tool_status: "not_requested",
      semantic_tools: [],
      fallback_tools: [],
      reduced_semantic_coverage: false,
      truncated: false,
      truncation_reason: null,
      available_evaluator_ids: ["dependency-graph-v1", "cycle-v1"],
      unavailable_evaluator_ids: [],
      boundaries: [
        excludedBoundary("direct_affected_paths", "single-file standard-lite change has no multi-node affected path"),
        {
          id: "BOUNDARY-externally_reachable_entry_points",
          category: "externally_reachable_entry_points",
          classification: "represented",
          node_ids: ["NODE-normal-entry"],
          edge_ids: [],
          path_ids: [],
          unknown_ids: [],
          excluded_sibling_ids: [],
          rationale: null,
          evidence_refs: evidence,
        },
        excludedBoundary("downstream_state_or_side_effects", "the fixture has no downstream state or side effect"),
      ],
      evidence_refs: [...evidence, { kind: "check", value: "normal-architecture-policy-probe" }],
    },
  });
}

function passedGate(input) {
  const source = {
    schema_version: 1,
    gate_id: input.gate_id,
    dossier_id: input.dossier.dossier_id,
    dossier_fingerprint: input.dossier.fingerprint,
    task_id: input.dossier.task_id,
    risk_class: input.dossier.risk_class,
    status: "passed",
    reasons: [],
    check_catalog_fingerprint: input.check_catalog.fingerprint,
    preimplementation_evidence_fingerprint: input.preimplementation_evidence?.fingerprint ?? null,
    architecture_evaluation_fingerprint: input.architecture_evaluation?.fingerprint ?? null,
    evaluated_at: input.evaluated_at,
  };
  return { ...source, fingerprint: fingerprint(source) };
}

const runTrustedTarget = ({ targetId }) => ({
  status: targetId === "normal-harness-static" ? "passed" : "blocked",
  command_id: targetId === "normal-harness-static" ? "test:static" : null,
  exit_code: targetId === "normal-harness-static" ? 0 : null,
});

const options = {
  workspaceRoot: tempRoot,
  checkCatalog: createDefaultNormalSessionCheckCatalog(),
  observeWorkspace,
  runTrustedTarget,
  evaluateGate: passedGate,
  clock,
  idFactory,
};
const bridge = createNormalSessionQualityBridge(options);
const orchestrator = { sessionID: "session/root", agent: "orchestrator" };
const architect = { ...orchestrator, agent: "architect" };
const reviewer = { ...orchestrator, agent: "reviewer" };
const verifier = { ...orchestrator, agent: "verifier" };

function invoke(toolId, request, context = orchestrator) {
  return executeNormalSessionQualityTool(bridge, toolId, { request: JSON.stringify(request) }, context);
}

function assertContractError(callback, code) {
  assert.throws(callback, (error) => error instanceof ContractError && error.code === code);
}

function assertPersistedTamperRejected(targetBridge, context, mutate, code = "QUALITY_STATE_BINDING") {
  const statePath = normalSessionQualityStatePath(targetBridge, context.sessionID);
  const original = fs.readFileSync(statePath, "utf8");
  const candidate = JSON.parse(original);
  mutate(candidate);
  fs.writeFileSync(statePath, `${JSON.stringify(candidate)}\n`, "utf8");
  try {
    assertContractError(() => inspectNormalSessionQualityState(targetBridge, context.sessionID), code);
  } finally {
    fs.writeFileSync(statePath, original, "utf8");
  }
}

function nativeEdit(filePath = "src/file.mjs") {
  return { args: { filePath, oldString: "value", newString: "value", replaceAll: false } };
}

function nativeTask(subagentType) {
  return { args: { description: `${subagentType} task`, prompt: "bounded task", subagent_type: subagentType } };
}

function nativePatch(filePath = "src/file.mjs") {
  return { args: { patchText: `*** Begin Patch\n*** Update File: ${filePath}\n@@\n-old\n+new\n*** End Patch` } };
}

const PERMISSION_STATUSES = ["deny", "ask", "allow"];

function assertPermissionMatrix(input, expected, message) {
  for (const originalStatus of PERMISSION_STATUSES) {
    const output = { status: originalStatus };
    handleNormalSessionPermission(bridge, input, output);
    assert.equal(output.status, expected(originalStatus), `${message} (original=${originalStatus})`);
  }
}

assertPermissionMatrix(
  { type: "task", pattern: "explore" },
  (originalStatus) => originalStatus,
  "safe read-only exploration without host correlation must preserve the original permission status",
);
assertPermissionMatrix(
  { type: "edit", pattern: "src/file.mjs", sessionID: "session/unbound", callID: "call-unbound" },
  (originalStatus) => originalStatus,
  "a valid request outside a quality-bound session must preserve the original permission status",
);
assertPermissionMatrix(
  { type: "task", pattern: { malformed: true } },
  () => "deny",
  "malformed permission input must fail closed",
);
assert.doesNotThrow(
  () => handleNormalSessionToolBefore(bridge, { tool: "task", sessionID: "session/standard-lite-uninstrumented", callID: "call-standard-lite" }, nativeTask("general")),
  "an uninstrumented standard-lite session must retain normal implementation delegation",
);

invoke("quality_dossier_create", dossierRequest());
const controlPathRequest = dossierRequest();
controlPathRequest.verification_boundary.ownership_paths = [".oc_harness"];
assertContractError(
  () => executeNormalSessionQualityTool(bridge, "quality_dossier_create", { request: JSON.stringify(controlPathRequest) }, { sessionID: "session/control-path", agent: "orchestrator" }),
  "QUALITY_CONTROL_PATH",
);
for (const [index, controlPath] of [".OC_HARNESS/state.json", "src/.git/config", "src/.GIT/config"].entries()) {
  const request = dossierRequest();
  request.verification_boundary.ownership_paths = [controlPath];
  assertContractError(
    () => executeNormalSessionQualityTool(bridge, "quality_dossier_create", { request: JSON.stringify(request) }, { sessionID: `session/control-path-${index}`, agent: "orchestrator" }),
    "QUALITY_CONTROL_PATH",
  );
}
assertContractError(
  () => executeNormalSessionQualityTool(bridge, "quality_unknown", { request: "{}" }, orchestrator),
  "QUALITY_TOOL_UNKNOWN",
);
assertContractError(
  () => executeNormalSessionQualityTool(bridge, "quality_dossier_create", { request: JSON.stringify({ ...dossierRequest(), gate_status: "passed" }) }, { sessionID: "session/unknown-field", agent: "orchestrator" }),
  "CONTRACT_UNKNOWN_FIELD",
);
assertContractError(
  () => executeNormalSessionQualityTool(bridge, "quality_dossier_inspect", { request: "{}", status: "passed" }, orchestrator),
  "CONTRACT_UNKNOWN_FIELD",
);

assertContractError(
  () => handleNormalSessionToolBefore(bridge, { tool: "edit", sessionID: orchestrator.sessionID, callID: "call-pregate-edit" }, nativeEdit()),
  "QUALITY_PRE_GATE_VIOLATION",
);
assertContractError(
  () => handleNormalSessionToolBefore(bridge, { tool: "task", sessionID: orchestrator.sessionID, callID: "call-pregate-task" }, nativeTask("general")),
  "QUALITY_PRE_GATE_VIOLATION",
);

assertContractError(
  () => invoke("quality_dossier_update", { expected_revision: 99, patch: { user_visible_goal: "stale" } }),
  "QUALITY_DOSSIER_REVISION_CONFLICT",
);
assertContractError(
  () => invoke("quality_dossier_update", { expected_revision: 1, patch: { gate_state: { status: "passed" } } }),
  "QUALITY_RUNNER_FIELD",
);

handleNormalSessionToolBefore(bridge, { tool: "task", sessionID: orchestrator.sessionID, callID: "call-architect" }, nativeTask("architect"));
handleNormalSessionEvent(bridge, { type: "session.created", properties: { info: { id: "session/architect", parentID: orchestrator.sessionID } } });
let receipt = invoke("quality_architecture_evaluate", { expected_revision: 1, blockers: [] }, { sessionID: "session/architect", agent: "architect" });
assert.equal(receipt.role, "architect");
handleNormalSessionToolAfter(bridge, { tool: "task", sessionID: orchestrator.sessionID, callID: "call-architect" });
handleNormalSessionToolBefore(bridge, { tool: "task", sessionID: orchestrator.sessionID, callID: "call-reviewer" }, nativeTask("reviewer"));
handleNormalSessionEvent(bridge, { type: "session.created", properties: { info: { id: "session/reviewer", parentID: orchestrator.sessionID } } });
receipt = invoke("quality_architecture_evaluate", { expected_revision: receipt.dossier_revision, blockers: [] }, { sessionID: "session/reviewer", agent: "reviewer" });
assert.equal(receipt.role, "reviewer");
handleNormalSessionToolAfter(bridge, { tool: "task", sessionID: orchestrator.sessionID, callID: "call-reviewer" });
const dossierRevision = receipt.dossier_revision;
const finalized = invoke("quality_dossier_finalize", { expected_revision: dossierRevision });
assert.equal(finalized.gate_status, "passed");

assertContractError(
  () => handleNormalSessionToolBefore(bridge, { tool: "edit", sessionID: orchestrator.sessionID, callID: "call-no-capability" }, nativeEdit()),
  "QUALITY_CAPABILITY_MISSING",
);

assertContractError(
  () => invoke("quality_action_authorize", { expected_revision: dossierRevision, kind: "edit", paths: ["outside/file.mjs"] }),
  "QUALITY_WRITE_SCOPE_VIOLATION",
);

invoke("quality_action_authorize", {
  expected_revision: dossierRevision,
  kind: "task",
  paths: ["src/file.mjs"],
  target_agent: "general",
});
handleNormalSessionToolBefore(bridge, { tool: "task", sessionID: orchestrator.sessionID, callID: "call-task" }, nativeTask("general"));
assertPermissionMatrix({
  type: "task",
  pattern: "general",
  sessionID: orchestrator.sessionID,
  callID: "call-task",
}, (originalStatus) => originalStatus, "an exactly authorized task must preserve the original permission status");
assertPermissionMatrix({
  type: "task",
  pattern: "explore",
  sessionID: orchestrator.sessionID,
  callID: "call-task",
}, () => "deny", "a task target mismatch must fail closed");
handleNormalSessionEvent(bridge, {
  type: "session.created",
  properties: { info: { id: "session/general", parentID: orchestrator.sessionID } },
});
const generalChildState = inspectNormalSessionQualityState(bridge, "session/general");
assert.equal(generalChildState.record_kind, "child_link");
assert.equal(Object.hasOwn(generalChildState, "capabilities"), false, "child link must not clone parent capabilities");
handleNormalSessionToolAfter(bridge, { tool: "task", sessionID: orchestrator.sessionID, callID: "call-task" });

invoke("quality_action_authorize", { expected_revision: dossierRevision, kind: "edit", paths: ["src/file.mjs"] });
handleNormalSessionToolBefore(bridge, { tool: "edit", sessionID: orchestrator.sessionID, callID: "call-edit-1" }, nativeEdit("src\\file.mjs"));
assertPermissionMatrix({
  type: "edit",
  pattern: "src\\file.mjs",
  sessionID: orchestrator.sessionID,
  callID: "call-edit-1",
}, (originalStatus) => originalStatus, "an exactly authorized edit must preserve the original permission status after path normalization");
assertPermissionMatrix({
  type: "edit",
  pattern: "src/other.mjs",
  sessionID: orchestrator.sessionID,
  callID: "call-edit-1",
}, () => "deny", "an edit path mismatch must fail closed");
assertPermissionMatrix({
  type: "edit",
  pattern: "src/file.mjs",
  sessionID: orchestrator.sessionID,
  callID: "call-not-observed",
}, () => "deny", "an unobserved quality-bound call must fail closed");
assertContractError(
  () => handleNormalSessionToolBefore(bridge, { tool: "edit", sessionID: orchestrator.sessionID, callID: "call-edit-1" }, nativeEdit()),
  "QUALITY_PRE_GATE_VIOLATION",
);
currentPathVersions.set("src/file.mjs", 1);
handleNormalSessionToolAfter(bridge, { tool: "edit", sessionID: orchestrator.sessionID, callID: "call-edit-1" });
assert.equal(inspectNormalSessionQualityState(bridge, orchestrator.sessionID).mutation_revision, 1);
assert.equal(inspectNormalSessionQualityState(bridge, orchestrator.sessionID).capabilities.length, 0, "a settled edit capability must be garbage-collected immediately");

handleNormalSessionToolBefore(bridge, { tool: "task", sessionID: orchestrator.sessionID, callID: "call-verifier-1" }, nativeTask("verifier"));
handleNormalSessionEvent(bridge, { type: "session.created", properties: { info: { id: "session/verifier-1", parentID: orchestrator.sessionID } } });
let verification = invoke("quality_verification_record", { expected_revision: dossierRevision }, { sessionID: "session/verifier-1", agent: "verifier" });
assert.equal(verification.complete, true);
handleNormalSessionToolAfter(bridge, { tool: "task", sessionID: orchestrator.sessionID, callID: "call-verifier-1" });

invoke("quality_action_authorize", { expected_revision: dossierRevision, kind: "edit", paths: ["src/file.mjs"] });
handleNormalSessionToolBefore(bridge, { tool: "apply_patch", sessionID: orchestrator.sessionID, callID: "call-edit-2" }, nativePatch());
const secondEdit = { status: "ask" };
handleNormalSessionPermission(bridge, {
  type: "edit",
  pattern: ["src/file.mjs"],
  sessionID: orchestrator.sessionID,
  callID: "call-edit-2",
}, secondEdit);
assert.equal(secondEdit.status, "ask", "the permission hook must not upgrade ask to allow");
currentPathVersions.set("src/file.mjs", 2);
handleNormalSessionToolAfter(bridge, { tool: "apply_patch", sessionID: orchestrator.sessionID, callID: "call-edit-2" });
assert.equal(inspectNormalSessionQualityState(bridge, orchestrator.sessionID).verification, null, "later edit must invalidate verification");
handleNormalSessionToolBefore(bridge, { tool: "task", sessionID: orchestrator.sessionID, callID: "call-verifier-2" }, nativeTask("verifier"));
handleNormalSessionEvent(bridge, { type: "session.created", properties: { info: { id: "session/verifier-2", parentID: orchestrator.sessionID } } });
verification = invoke("quality_verification_record", { expected_revision: dossierRevision }, { sessionID: "session/verifier-2", agent: "verifier" });
handleNormalSessionToolAfter(bridge, { tool: "task", sessionID: orchestrator.sessionID, callID: "call-verifier-2" });
assert.equal(verification.mutation_revision, 2);
const attestation = invoke("quality_session_finalize", { expected_revision: dossierRevision });
assert.match(attestation.fingerprint, /^sha256:/);
assert.equal(Object.hasOwn(attestation, "model_profile_id"), false, "normal attestation must be model-free");

const restarted = createNormalSessionQualityBridge(options);
assert.equal(inspectNormalSessionQualityState(restarted, orchestrator.sessionID).lifecycle, "attested", "durable state must survive bridge restart");

const longSessionContext = { sessionID: "session/long-lived", agent: "orchestrator" };
executeNormalSessionQualityTool(bridge, "quality_dossier_create", {
  request: JSON.stringify(dossierRequest()),
}, longSessionContext);
const longSessionChallenge = executeNormalSessionQualityTool(bridge, "quality_architecture_evaluate", {
  request: JSON.stringify({ expected_revision: 1, blockers: [] }),
}, { ...longSessionContext, agent: "architect" });
const longSessionRevision = longSessionChallenge.dossier_revision;
executeNormalSessionQualityTool(bridge, "quality_dossier_finalize", {
  request: JSON.stringify({ expected_revision: longSessionRevision }),
}, longSessionContext);
executeNormalSessionQualityTool(bridge, "quality_action_authorize", {
  request: JSON.stringify({ expected_revision: longSessionRevision, kind: "task", paths: ["src/file.mjs"], target_agent: "general" }),
}, longSessionContext);
handleNormalSessionToolBefore(bridge, {
  tool: "task",
  sessionID: longSessionContext.sessionID,
  callID: "call-long-task",
}, nativeTask("general"));
handleNormalSessionEvent(bridge, {
  type: "session.created",
  properties: { info: { id: "session/long-lived-child", parentID: longSessionContext.sessionID } },
});
for (let index = 0; index < 140; index += 1) {
  const callID = `call-long-edit-${index}`;
  handleNormalSessionToolBefore(bridge, {
    tool: "edit",
    sessionID: "session/long-lived-child",
    callID,
  }, nativeEdit());
  const permission = { status: "ask" };
  handleNormalSessionPermission(bridge, {
    type: "edit",
    pattern: "src/file.mjs",
    sessionID: "session/long-lived-child",
    callID,
  }, permission);
  assert.equal(permission.status, "ask", "long-session edit permissions must remain monotonic");
  handleNormalSessionToolAfter(bridge, {
    tool: "edit",
    sessionID: "session/long-lived-child",
    callID,
  });
}
const longSessionActiveState = inspectNormalSessionQualityState(bridge, longSessionContext.sessionID);
assert.equal(longSessionActiveState.observed_calls.length, 128, "long sessions must retain a bounded replay window");
assert.equal(longSessionActiveState.active_task_launch?.parent_call_id, "call-long-task");
assert(
  longSessionActiveState.observed_calls.some((entry) => entry.call_id === "call-long-task"),
  "the active task call must survive replay-history eviction",
);
assertContractError(() => handleNormalSessionToolBefore(bridge, {
  tool: "edit",
  sessionID: "session/long-lived-child",
  callID: "call-long-edit-139",
}, nativeEdit()), "QUALITY_CALL_REPLAY");
handleNormalSessionToolAfter(bridge, {
  tool: "task",
  sessionID: longSessionContext.sessionID,
  callID: "call-long-task",
});
const longSessionState = inspectNormalSessionQualityState(bridge, longSessionContext.sessionID);
assert.equal(longSessionState.active_task_launch, null);
assert.equal(longSessionState.capabilities.length, 0, "a settled one-shot task capability must be garbage-collected immediately");
assert.deepEqual(longSessionState.incomplete_reasons, []);
const longVerification = executeNormalSessionQualityTool(bridge, "quality_verification_record", {
  request: JSON.stringify({ expected_revision: longSessionRevision }),
}, { ...longSessionContext, agent: "verifier" });
assert.equal(longVerification.complete, true, "a valid session must remain verifiable after more than 128 delegated edit cycles");
const longAttestation = executeNormalSessionQualityTool(bridge, "quality_session_finalize", {
  request: JSON.stringify({ expected_revision: longSessionRevision }),
}, longSessionContext);
assert.match(longAttestation.fingerprint, /^sha256:/);

const staleContext = { sessionID: "session/stale-challenge", agent: "orchestrator" };
executeNormalSessionQualityTool(bridge, "quality_dossier_create", { request: JSON.stringify(dossierRequest()) }, staleContext);
let staleContribution = executeNormalSessionQualityTool(bridge, "quality_architecture_evaluate", {
  request: JSON.stringify({ expected_revision: 1, blockers: [] }),
}, { sessionID: staleContext.sessionID, agent: "architect" });
staleContribution = executeNormalSessionQualityTool(bridge, "quality_architecture_evaluate", {
  request: JSON.stringify({ expected_revision: staleContribution.dossier_revision, blockers: [] }),
}, { sessionID: staleContext.sessionID, agent: "reviewer" });
executeNormalSessionQualityTool(bridge, "quality_dossier_update", {
  request: JSON.stringify({ expected_revision: staleContribution.dossier_revision, patch: { user_visible_goal: "Changed after independent review." } }),
}, staleContext);
const staleState = inspectNormalSessionQualityState(bridge, staleContext.sessionID);
assert.equal(staleState.contributions.length, 0, "semantic dossier updates must invalidate prior challenge evidence");
assert.equal(staleState.dossier.plan_challenge.architect_result_id, null);
assert.equal(staleState.dossier.plan_challenge.reviewer_result_id, null);

const staleLockContext = { sessionID: "session/stale-lock", agent: "orchestrator" };
executeNormalSessionQualityTool(bridge, "quality_dossier_create", { request: JSON.stringify(dossierRequest()) }, staleLockContext);
const staleLockPath = normalSessionQualityStatePath(bridge, staleLockContext.sessionID).replace(/\.json$/u, ".lock");
fs.writeFileSync(staleLockPath, JSON.stringify({ schema_version: 1, pid: 999999, created_at_ms: 0, nonce: "stale-fixture" }), "utf8");
const staleLockUpdate = executeNormalSessionQualityTool(bridge, "quality_dossier_update", {
  request: JSON.stringify({ expected_revision: 1, patch: { user_visible_goal: "Recovered after a stale runner lock." } }),
}, staleLockContext);
assert.equal(staleLockUpdate.dossier_revision, 2, "dead-owner stale lock must be safely recovered");

const crossContext = { sessionID: "session/other", agent: "orchestrator" };
executeNormalSessionQualityTool(bridge, "quality_dossier_create", { request: JSON.stringify(dossierRequest()) }, crossContext);
assertContractError(
  () => handleNormalSessionToolBefore(bridge, { tool: "edit", sessionID: crossContext.sessionID, callID: "call-cross" }, nativeEdit()),
  "QUALITY_PRE_GATE_VIOLATION",
);

const failureContext = { sessionID: "session/tool-failure", agent: "orchestrator" };
executeNormalSessionQualityTool(bridge, "quality_dossier_create", { request: JSON.stringify(dossierRequest()) }, failureContext);
executeNormalSessionQualityTool(bridge, "quality_dossier_finalize", { request: JSON.stringify({ expected_revision: 1 }) }, failureContext);
executeNormalSessionQualityTool(bridge, "quality_action_authorize", {
  request: JSON.stringify({ expected_revision: 1, kind: "edit", paths: ["src/file.mjs"] }),
}, failureContext);
handleNormalSessionToolBefore(bridge, { tool: "edit", sessionID: failureContext.sessionID, callID: "call-failed-edit" }, nativeEdit());
handleNormalSessionEvent(bridge, {
  type: "message.part.updated",
  properties: { part: { type: "tool", tool: "edit", sessionID: failureContext.sessionID, callID: "call-failed-edit", state: { status: "error" } } },
});
assert.equal(inspectNormalSessionQualityState(bridge, failureContext.sessionID).pending_mutations.length, 0, "failed native tools must reconcile their durable pending mutation");
executeNormalSessionQualityTool(bridge, "quality_action_authorize", {
  request: JSON.stringify({ expected_revision: 1, kind: "task", paths: ["src/file.mjs"], target_agent: "general" }),
}, failureContext);
handleNormalSessionToolBefore(bridge, { tool: "task", sessionID: failureContext.sessionID, callID: "call-failed-task" }, nativeTask("general"));
handleNormalSessionEvent(bridge, {
  type: "message.part.updated",
  properties: { part: { type: "tool", tool: "task", sessionID: failureContext.sessionID, callID: "call-failed-task", state: { status: "error" } } },
});
const recoveredFailureState = inspectNormalSessionQualityState(bridge, failureContext.sessionID);
assert.equal(recoveredFailureState.active_task_launch, null, "failed task launch must not wedge the session");
assert.deepEqual(recoveredFailureState.incomplete_reasons, []);

const highContext = { sessionID: "session/high", agent: "orchestrator" };
executeNormalSessionQualityTool(bridge, "quality_dossier_create", {
  request: JSON.stringify({
    risk_class: "high",
    mode: "full",
    task_type: "maintenance",
    user_visible_goal: "High risk draft must require independent challenge evidence.",
    verification_boundary: { check_ids: [], mechanism_ids: [], ownership_paths: ["src"], integration_check_ids: [] },
  }),
}, highContext);
assertContractError(
  () => executeNormalSessionQualityTool(bridge, "quality_dossier_finalize", { request: JSON.stringify({ expected_revision: 1 }) }, highContext),
  "QUALITY_PLAN_CHALLENGE_MISSING",
);

const identityTamperContext = { sessionID: "session/identity-tamper", agent: "orchestrator" };
executeNormalSessionQualityTool(bridge, "quality_dossier_create", { request: JSON.stringify(dossierRequest()) }, identityTamperContext);
assertPersistedTamperRejected(bridge, identityTamperContext, (state) => {
  state.run_id = "run-tampered";
});
assertPersistedTamperRejected(bridge, identityTamperContext, (state) => {
  state.task_id = "task-tampered";
});
assertPersistedTamperRejected(bridge, identityTamperContext, (state) => {
  state.lifecycle = "implementation_enabled";
}, "QUALITY_STATE_LIFECYCLE");

const capabilityTamperContext = { sessionID: "session/capability-tamper", agent: "orchestrator" };
executeNormalSessionQualityTool(bridge, "quality_dossier_create", { request: JSON.stringify(dossierRequest()) }, capabilityTamperContext);
executeNormalSessionQualityTool(bridge, "quality_dossier_finalize", { request: JSON.stringify({ expected_revision: 1 }) }, capabilityTamperContext);
executeNormalSessionQualityTool(bridge, "quality_action_authorize", {
  request: JSON.stringify({ expected_revision: 1, kind: "edit", paths: ["src/file.mjs"] }),
}, capabilityTamperContext);
assertPersistedTamperRejected(bridge, capabilityTamperContext, (state) => {
  state.capabilities[0].mutation_revision += 1;
  const source = { ...state.capabilities[0] };
  delete source.fingerprint;
  state.capabilities[0].fingerprint = fingerprint(source);
});

const corruptContext = { sessionID: "session/corrupt", agent: "orchestrator" };
executeNormalSessionQualityTool(bridge, "quality_dossier_create", { request: JSON.stringify(dossierRequest()) }, corruptContext);
const corruptPath = normalSessionQualityStatePath(bridge, corruptContext.sessionID);
fs.writeFileSync(corruptPath, "{partial", "utf8");
const corruptPermission = { status: "ask" };
handleNormalSessionPermission(bridge, {
  type: "edit",
  pattern: "src/file.mjs",
  sessionID: corruptContext.sessionID,
  callID: "call-corrupt",
}, corruptPermission);
assert.equal(corruptPermission.status, "deny", "corrupt durable state must fail closed");

const tamperContext = { sessionID: "session/tamper", agent: "orchestrator" };
executeNormalSessionQualityTool(bridge, "quality_dossier_create", { request: JSON.stringify(dossierRequest()) }, tamperContext);
const tamperPath = normalSessionQualityStatePath(bridge, tamperContext.sessionID);
const tampered = JSON.parse(fs.readFileSync(tamperPath, "utf8"));
tampered.verification = inspectNormalSessionQualityState(bridge, orchestrator.sessionID).verification;
fs.writeFileSync(tamperPath, `${JSON.stringify(tampered)}\n`, "utf8");
assertContractError(() => inspectNormalSessionQualityState(bridge, tamperContext.sessionID), "QUALITY_STATE_BINDING");

const childId = "session/child";
handleNormalSessionEvent(bridge, {
  type: "session.created",
  properties: { info: { id: childId, parentID: orchestrator.sessionID } },
});
const childState = inspectNormalSessionQualityState(bridge, childId);
assert.equal(childState.parent_session_key, inspectNormalSessionQualityState(bridge, orchestrator.sessionID).session_key);
assert.equal(childState.status, "quarantined", "unmatched child event must fail closed");
assert.equal(Object.hasOwn(childState, "capabilities"), false, "child must not inherit one-shot capabilities");

const ambiguousContext = { sessionID: "session/ambiguous-parent", agent: "orchestrator" };
executeNormalSessionQualityTool(bridge, "quality_dossier_create", { request: JSON.stringify(dossierRequest()) }, ambiguousContext);
handleNormalSessionToolBefore(bridge, {
  tool: "task",
  sessionID: ambiguousContext.sessionID,
  callID: "call-ambiguous-task",
}, nativeTask("explore"));
handleNormalSessionEvent(bridge, {
  type: "session.created",
  properties: { info: { id: "session/ambiguous-first", parentID: ambiguousContext.sessionID } },
});
handleNormalSessionEvent(bridge, {
  type: "session.created",
  properties: { info: { id: "session/ambiguous-second", parentID: ambiguousContext.sessionID } },
});
const ambiguousParent = inspectNormalSessionQualityState(bridge, ambiguousContext.sessionID);
assert.equal(ambiguousParent.active_task_launch.phase, "failed", "a second child must durably fail the serialized launch");
assert(ambiguousParent.incomplete_reasons.includes("task_child_ambiguous"), "a second child must persist an ambiguity reason");
assert.equal(inspectNormalSessionQualityState(bridge, "session/ambiguous-second").status, "quarantined", "the second child must be durably quarantined");
assertContractError(
  () => handleNormalSessionToolBefore(bridge, {
    tool: "edit",
    sessionID: "session/ambiguous-second",
    callID: "call-ambiguous-child-edit",
  }, nativeEdit()),
  "QUALITY_CHILD_LINK_STALE",
);
handleNormalSessionEvent(bridge, {
  type: "message.part.updated",
  properties: { part: { type: "tool", tool: "task", sessionID: ambiguousContext.sessionID, callID: "call-ambiguous-task", state: { status: "error" } } },
});

const delegatedContext = { sessionID: "session/delegated", agent: "orchestrator" };
executeNormalSessionQualityTool(bridge, "quality_dossier_create", { request: JSON.stringify(dossierRequest()) }, delegatedContext);
executeNormalSessionQualityTool(bridge, "quality_dossier_finalize", { request: JSON.stringify({ expected_revision: 1 }) }, delegatedContext);
executeNormalSessionQualityTool(bridge, "quality_action_authorize", {
  request: JSON.stringify({ expected_revision: 1, kind: "task", paths: ["src/file.mjs"], target_agent: "general" }),
}, delegatedContext);
handleNormalSessionToolBefore(bridge, { tool: "task", sessionID: delegatedContext.sessionID, callID: "call-delegated-parent" }, nativeTask("general"));
handleNormalSessionEvent(bridge, { type: "session.created", properties: { info: { id: "session/delegated-child", parentID: delegatedContext.sessionID } } });
assertContractError(
  () => handleNormalSessionToolBefore(bridge, { tool: "write", sessionID: "session/delegated-child", callID: "call-delegated-outside" }, { args: { filePath: "outside.txt", content: "blocked" } }),
  "QUALITY_WRITE_SCOPE_VIOLATION",
);
handleNormalSessionToolBefore(bridge, { tool: "edit", sessionID: "session/delegated-child", callID: "call-delegated-reused" }, nativeEdit());
currentPathVersions.set("src/file.mjs", 3);
handleNormalSessionToolAfter(bridge, { tool: "edit", sessionID: "session/delegated-child", callID: "call-delegated-reused" });
handleNormalSessionToolAfter(bridge, { tool: "task", sessionID: delegatedContext.sessionID, callID: "call-delegated-parent" });
const delegatedState = inspectNormalSessionQualityState(bridge, delegatedContext.sessionID);
assert.equal(delegatedState.mutation_revision, 1, "a bound general child mutation must reconcile into the parent owner state");
assert.equal(delegatedState.active_task_launch, null);

executeNormalSessionQualityTool(bridge, "quality_action_authorize", {
  request: JSON.stringify({ expected_revision: 1, kind: "task", paths: ["src/file.mjs"], target_agent: "general" }),
}, delegatedContext);
handleNormalSessionToolBefore(bridge, {
  tool: "task",
  sessionID: delegatedContext.sessionID,
  callID: "call-delegated-reused",
}, nativeTask("general"));
const reverseCollisionPermission = { status: "ask" };
handleNormalSessionPermission(bridge, {
  type: "task",
  pattern: "general",
  sessionID: delegatedContext.sessionID,
  callID: "call-delegated-reused",
}, reverseCollisionPermission);
assert.equal(reverseCollisionPermission.status, "ask");
handleNormalSessionEvent(bridge, {
  type: "session.created",
  properties: { info: { id: "session/delegated-reused-child", parentID: delegatedContext.sessionID } },
});
handleNormalSessionToolBefore(bridge, {
  tool: "edit",
  sessionID: "session/delegated-reused-child",
  callID: "call-delegated-reused",
}, nativeEdit());
const sameIdChildPermission = { status: "ask" };
handleNormalSessionPermission(bridge, {
  type: "edit",
  pattern: "src/file.mjs",
  sessionID: "session/delegated-reused-child",
  callID: "call-delegated-reused",
}, sameIdChildPermission);
assert.equal(sameIdChildPermission.status, "ask");
handleNormalSessionToolAfter(bridge, {
  tool: "edit",
  sessionID: "session/delegated-reused-child",
  callID: "call-delegated-reused",
});
const sameIdActiveState = inspectNormalSessionQualityState(bridge, delegatedContext.sessionID);
assert.equal(sameIdActiveState.active_task_launch?.parent_call_id, "call-delegated-reused");
assert(
  sameIdActiveState.capabilities.some((entry) => entry.kind === "task" && entry.bound_call_id === "call-delegated-reused"),
  "child settlement with the same call ID must retain the active owner task capability",
);
assert.equal(
  sameIdActiveState.observed_calls.filter((entry) => entry.call_id === "call-delegated-reused" && entry.tool_id === "task").length,
  1,
  "the owner task tuple must remain observed while its child edit settles",
);
assert.equal(
  sameIdActiveState.observed_calls.filter((entry) => entry.call_id === "call-delegated-reused" && entry.tool_id === "edit").length,
  2,
  "both historical and active-child edit tuples must coexist with the owner task tuple",
);
handleNormalSessionToolAfter(bridge, {
  tool: "task",
  sessionID: delegatedContext.sessionID,
  callID: "call-delegated-reused",
});
const reverseCollisionState = inspectNormalSessionQualityState(bridge, delegatedContext.sessionID);
assert.equal(reverseCollisionState.active_task_launch, null, "a historical child call ID must not shadow a later owner task call");
assert.equal(reverseCollisionState.capabilities.length, 0);

currentPathVersions.set("outside.txt", 1);
const attributionContext = { sessionID: "session/attribution", agent: "orchestrator" };
executeNormalSessionQualityTool(bridge, "quality_dossier_create", { request: JSON.stringify(dossierRequest()) }, attributionContext);
executeNormalSessionQualityTool(bridge, "quality_dossier_finalize", { request: JSON.stringify({ expected_revision: 1 }) }, attributionContext);
executeNormalSessionQualityTool(bridge, "quality_action_authorize", {
  request: JSON.stringify({ expected_revision: 1, kind: "edit", paths: ["src/file.mjs"] }),
}, attributionContext);
handleNormalSessionToolBefore(bridge, { tool: "edit", sessionID: attributionContext.sessionID, callID: "call-attribution" }, nativeEdit());
currentPathVersions.set("outside.txt", 2);
assertContractError(
  () => handleNormalSessionToolAfter(bridge, { tool: "edit", sessionID: attributionContext.sessionID, callID: "call-attribution" }),
  "QUALITY_WRITE_SCOPE_VIOLATION",
);
assert(inspectNormalSessionQualityState(bridge, attributionContext.sessionID).incomplete_reasons.includes("post_mutation_ownership_mismatch"), "unowned already-dirty changes must persist a fail-closed reason");

const fakeToolFactory = (definition) => definition;
fakeToolFactory.schema = { string: () => ({ describe: () => ({ type: "string" }) }) };
const plugin = createNormalSessionQualityPlugin({ toolFactory: fakeToolFactory, workspaceRoot: tempRoot, bridgeOptions: options });
assert.deepEqual(Object.keys(plugin.tool).sort(), [
  "quality_action_authorize",
  "quality_architecture_evaluate",
  "quality_dossier_create",
  "quality_dossier_finalize",
  "quality_dossier_inspect",
  "quality_dossier_update",
  "quality_session_finalize",
  "quality_verification_record",
]);
assert.equal(typeof plugin["permission.ask"], "function");
assert.equal(typeof plugin["tool.execute.before"], "function");
assert.equal(typeof plugin["tool.execute.after"], "function");

const stateText = fs.readFileSync(normalSessionQualityStatePath(bridge, orchestrator.sessionID), "utf8");
assert.equal(stateText.includes(orchestrator.sessionID), false, "raw host session ID must not be persisted");
assert.equal(stateText.includes(tempRoot), false, "private absolute worktree path must not be persisted");
assert.equal(stateText.includes("stdout"), false);
assert.equal(stateText.includes("stderr"), false);

const policyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-normal-policy-"));
try {
  fs.mkdirSync(path.join(policyRoot, "src"));
  fs.mkdirSync(path.join(policyRoot, "quality"));
  fs.writeFileSync(path.join(policyRoot, "src", "file.mjs"), "export const value = 1;\n", "utf8");
  const policyExample = new URL("../quality/schemas/architecture-policy.example.json", import.meta.url);
  const policyFile = path.join(policyRoot, "quality", "architecture-policy.json");
  fs.copyFileSync(policyExample, policyFile);
  const policyBridge = createNormalSessionQualityBridge({ ...options, workspaceRoot: policyRoot });
  const policyContext = { sessionID: "session/policy", agent: "orchestrator" };
  const configuredPolicyRequest = () => {
    const request = dossierRequest();
    request.impact_graph = configuredPolicyGraph();
    request.verification_boundary.ownership_paths = ["quality", "src"];
    return request;
  };
  const policyRequest = configuredPolicyRequest();
  executeNormalSessionQualityTool(policyBridge, "quality_dossier_create", { request: JSON.stringify(policyRequest) }, policyContext);
  const policyChallenge = executeNormalSessionQualityTool(policyBridge, "quality_architecture_evaluate", {
    request: JSON.stringify({ expected_revision: 1, blockers: [] }),
  }, { ...policyContext, agent: "architect" });
  const policyFinalized = executeNormalSessionQualityTool(policyBridge, "quality_dossier_finalize", {
    request: JSON.stringify({ expected_revision: policyChallenge.dossier_revision }),
  }, policyContext);
  assert.equal(policyFinalized.gate_status, "passed");
  const policyState = inspectNormalSessionQualityState(policyBridge, policyContext.sessionID);
  assert.equal(policyState.architecture_configuration.status, "configured");
  assert.equal(policyState.architecture_evaluation.status, "passed", "configured architecture policy must be evaluated by the runner");
  assert.equal(policyState.dossier.architecture_assessment.evaluation_id, policyState.architecture_evaluation.evaluation_id);
  assertContractError(
    () => executeNormalSessionQualityTool(policyBridge, "quality_action_authorize", {
      request: JSON.stringify({ expected_revision: policyState.dossier.revision, kind: "edit", paths: ["quality/architecture-policy.json"] }),
    }, policyContext),
    "QUALITY_ARCHITECTURE_POLICY_IMMUTABLE",
  );

  const pendingPolicyContext = { sessionID: "session/policy-pending-verification", agent: "orchestrator" };
  executeNormalSessionQualityTool(policyBridge, "quality_dossier_create", {
    request: JSON.stringify(configuredPolicyRequest()),
  }, pendingPolicyContext);
  executeNormalSessionQualityTool(policyBridge, "quality_dossier_finalize", {
    request: JSON.stringify({ expected_revision: 1 }),
  }, pendingPolicyContext);
  const pendingPolicyState = inspectNormalSessionQualityState(policyBridge, pendingPolicyContext.sessionID);
  const policyVerification = executeNormalSessionQualityTool(policyBridge, "quality_verification_record", {
    request: JSON.stringify({ expected_revision: policyState.dossier.revision }),
  }, { ...policyContext, agent: "verifier" });
  assert.equal(policyVerification.complete, true);

  const changedPolicy = JSON.parse(fs.readFileSync(policyExample, "utf8"));
  changedPolicy.policy_id = "ARCHPOLICY-example-drifted";
  delete changedPolicy.fingerprint;
  changedPolicy.fingerprint = fingerprint(changedPolicy);
  fs.writeFileSync(policyFile, `${JSON.stringify(changedPolicy, null, 2)}\n`, "utf8");
  assertContractError(() => executeNormalSessionQualityTool(policyBridge, "quality_session_finalize", {
    request: JSON.stringify({ expected_revision: policyState.dossier.revision }),
  }, policyContext), "QUALITY_ARCHITECTURE_POLICY_DRIFT");
  assertContractError(() => executeNormalSessionQualityTool(policyBridge, "quality_verification_record", {
    request: JSON.stringify({ expected_revision: pendingPolicyState.dossier.revision }),
  }, { ...pendingPolicyContext, agent: "verifier" }), "QUALITY_ARCHITECTURE_POLICY_DRIFT");

  fs.copyFileSync(policyExample, policyFile);
  const invalidPolicyContext = { sessionID: "session/policy-invalid", agent: "orchestrator" };
  executeNormalSessionQualityTool(policyBridge, "quality_dossier_create", {
    request: JSON.stringify(configuredPolicyRequest()),
  }, invalidPolicyContext);
  executeNormalSessionQualityTool(policyBridge, "quality_dossier_finalize", {
    request: JSON.stringify({ expected_revision: 1 }),
  }, invalidPolicyContext);
  const invalidPolicyState = inspectNormalSessionQualityState(policyBridge, invalidPolicyContext.sessionID);
  fs.writeFileSync(policyFile, "{invalid\n", "utf8");
  assertContractError(() => executeNormalSessionQualityTool(policyBridge, "quality_verification_record", {
    request: JSON.stringify({ expected_revision: invalidPolicyState.dossier.revision }),
  }, { ...invalidPolicyContext, agent: "verifier" }), "QUALITY_ARCHITECTURE_POLICY_INVALID");

  fs.copyFileSync(policyExample, policyFile);
  const deletedPolicyContext = { sessionID: "session/policy-deleted", agent: "orchestrator" };
  executeNormalSessionQualityTool(policyBridge, "quality_dossier_create", {
    request: JSON.stringify(configuredPolicyRequest()),
  }, deletedPolicyContext);
  executeNormalSessionQualityTool(policyBridge, "quality_dossier_finalize", {
    request: JSON.stringify({ expected_revision: 1 }),
  }, deletedPolicyContext);
  const deletedPolicyState = inspectNormalSessionQualityState(policyBridge, deletedPolicyContext.sessionID);
  fs.unlinkSync(policyFile);
  assertContractError(() => executeNormalSessionQualityTool(policyBridge, "quality_verification_record", {
    request: JSON.stringify({ expected_revision: deletedPolicyState.dossier.revision }),
  }, { ...deletedPolicyContext, agent: "verifier" }), "QUALITY_ARCHITECTURE_POLICY_DRIFT");

  const absentPolicyBridge = createNormalSessionQualityBridge({ ...options, workspaceRoot: policyRoot });
  const appearedPolicyContext = { sessionID: "session/policy-appeared", agent: "orchestrator" };
  executeNormalSessionQualityTool(absentPolicyBridge, "quality_dossier_create", {
    request: JSON.stringify(dossierRequest()),
  }, appearedPolicyContext);
  executeNormalSessionQualityTool(absentPolicyBridge, "quality_dossier_finalize", {
    request: JSON.stringify({ expected_revision: 1 }),
  }, appearedPolicyContext);
  fs.copyFileSync(policyExample, policyFile);
  assertContractError(() => executeNormalSessionQualityTool(absentPolicyBridge, "quality_verification_record", {
    request: JSON.stringify({ expected_revision: 1 }),
  }, { ...appearedPolicyContext, agent: "verifier" }), "QUALITY_ARCHITECTURE_POLICY_DRIFT");
} finally {
  fs.rmSync(policyRoot, { recursive: true, force: true });
}

const gitFixture = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-workspace-snapshot-"));
try {
  fs.writeFileSync(path.join(gitFixture, ".gitignore"), ".oc_harness/\nignored/\n", "utf8");
  fs.writeFileSync(path.join(gitFixture, "owned.txt"), "one\n", "utf8");
  fs.writeFileSync(path.join(gitFixture, "outside.txt"), "one\n", "utf8");
  for (const args of [
    ["init", "-q"],
    ["add", "."],
    ["-c", "user.name=OpenCode Harness", "-c", "user.email=harness@example.invalid", "commit", "-qm", "fixture"],
  ]) {
    const result = spawnSync("git", args, { cwd: gitFixture, encoding: "utf8", shell: false, windowsHide: true });
    assert.equal(result.status, 0, `git ${args[0]} must prepare the workspace fixture`);
  }
  fs.writeFileSync(path.join(gitFixture, "owned.txt"), "two\n", "utf8");
  const firstDirty = observeContentBoundWorkspace(gitFixture, "fixture-salt");
  fs.writeFileSync(path.join(gitFixture, "owned.txt"), "three\n", "utf8");
  const secondDirty = observeContentBoundWorkspace(gitFixture, "fixture-salt");
  assert.notEqual(firstDirty.fingerprint, secondDirty.fingerprint, "a second edit to an already-dirty file must change the workspace fingerprint");
  assert.deepEqual(diffContentBoundWorkspaces(firstDirty, secondDirty), ["owned.txt"]);
  spawnSync("git", ["add", "owned.txt"], { cwd: gitFixture, encoding: "utf8", shell: false, windowsHide: true });
  const staged = observeContentBoundWorkspace(gitFixture, "fixture-salt");
  assert.deepEqual(diffContentBoundWorkspaces(secondDirty, staged), ["owned.txt"], "index-only changes must remain content-bound");
  fs.writeFileSync(path.join(gitFixture, "outside.txt"), "two\n", "utf8");
  const outsideDirty = observeContentBoundWorkspace(gitFixture, "fixture-salt");
  fs.writeFileSync(path.join(gitFixture, "outside.txt"), "three\n", "utf8");
  const outsideDirtyAgain = observeContentBoundWorkspace(gitFixture, "fixture-salt");
  assert.deepEqual(diffContentBoundWorkspaces(outsideDirty, outsideDirtyAgain), ["outside.txt"], "already-dirty unowned content must remain observable");

  fs.mkdirSync(path.join(gitFixture, "ignored"));
  const ignoredFile = path.join(gitFixture, "ignored", "cache.txt");
  fs.writeFileSync(ignoredFile, "one\n", "utf8");
  const ignoredBefore = observeContentBoundWorkspace(gitFixture, "fixture-salt", ["ignored"]);
  fs.writeFileSync(ignoredFile, "two\n", "utf8");
  const ignoredAfter = observeContentBoundWorkspace(gitFixture, "fixture-salt", ["ignored"]);
  assert.deepEqual(diffContentBoundWorkspaces(ignoredBefore, ignoredAfter), ["ignored/cache.txt"], "explicit observation scopes must content-bind ignored files");

  const fixtureHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: gitFixture, encoding: "utf8", shell: false, windowsHide: true }).stdout.trim();
  const ignoredBridge = createNormalSessionQualityBridge({
    workspaceRoot: gitFixture,
    checkCatalog: createDefaultNormalSessionCheckCatalog(),
    runTrustedTarget,
    evaluateGate: passedGate,
    clock,
    idFactory,
  });
  const ignoredContext = { sessionID: "session/ignored-mutation", agent: "orchestrator" };
  const ignoredRequest = dossierRequest();
  ignoredRequest.task_shape.starting_commit = fixtureHead;
  ignoredRequest.task_shape.worktree_state = "dirty-preserved";
  ignoredRequest.verification_boundary.ownership_paths = ["ignored"];
  executeNormalSessionQualityTool(ignoredBridge, "quality_dossier_create", { request: JSON.stringify(ignoredRequest) }, ignoredContext);
  const ignoredInitialState = inspectNormalSessionQualityState(ignoredBridge, ignoredContext.sessionID);
  assert(
    ignoredInitialState.initial_workspace.entries.some((entry) => entry.path === "ignored/cache.txt"),
    "the authoritative initial snapshot must include ignored files under dossier ownership",
  );
  assert(
    ignoredInitialState.initial_workspace.entries.some((entry) => entry.path === "quality/architecture-policy.json"),
    "the authoritative initial snapshot must bind the architecture-policy path even while it is absent",
  );
  executeNormalSessionQualityTool(ignoredBridge, "quality_dossier_finalize", { request: JSON.stringify({ expected_revision: 1 }) }, ignoredContext);
  executeNormalSessionQualityTool(ignoredBridge, "quality_action_authorize", {
    request: JSON.stringify({ expected_revision: 1, kind: "edit", paths: ["ignored/cache.txt"] }),
  }, ignoredContext);
  handleNormalSessionToolBefore(ignoredBridge, {
    tool: "write",
    sessionID: ignoredContext.sessionID,
    callID: "call-ignored-write",
  }, { args: { filePath: "ignored/cache.txt", content: "three\n" } });
  fs.writeFileSync(ignoredFile, "three\n", "utf8");
  handleNormalSessionToolAfter(ignoredBridge, { tool: "write", sessionID: ignoredContext.sessionID, callID: "call-ignored-write" });
  const ignoredState = inspectNormalSessionQualityState(ignoredBridge, ignoredContext.sessionID);
  assert.equal(ignoredState.mutation_revision, 1, "ignored-file mutation must advance the trusted mutation revision");
  assert(ignoredState.last_workspace.entries.some((entry) => entry.path === "ignored/cache.txt"), "ignored-file mutation must remain in the trusted workspace fingerprint");
  fs.writeFileSync(ignoredFile, "four\n", "utf8");
  assertContractError(() => executeNormalSessionQualityTool(ignoredBridge, "quality_action_authorize", {
    request: JSON.stringify({ expected_revision: 1, kind: "edit", paths: ["ignored/cache.txt"] }),
  }, ignoredContext), "QUALITY_WORKSPACE_UNTRACED");

  const ignoredNewFileContext = { sessionID: "session/ignored-new-file", agent: "orchestrator" };
  executeNormalSessionQualityTool(ignoredBridge, "quality_dossier_create", {
    request: JSON.stringify(ignoredRequest),
  }, ignoredNewFileContext);
  executeNormalSessionQualityTool(ignoredBridge, "quality_dossier_finalize", {
    request: JSON.stringify({ expected_revision: 1 }),
  }, ignoredNewFileContext);
  fs.writeFileSync(path.join(gitFixture, "ignored", "created-after-gate.txt"), "late\n", "utf8");
  assertContractError(() => executeNormalSessionQualityTool(ignoredBridge, "quality_action_authorize", {
    request: JSON.stringify({ expected_revision: 1, kind: "edit", paths: ["ignored/cache.txt"] }),
  }, ignoredNewFileContext), "QUALITY_WORKSPACE_UNTRACED");
} finally {
  fs.rmSync(gitFixture, { recursive: true, force: true });
}

console.log("Normal-session quality bridge checks passed.");
