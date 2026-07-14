import {
  createEngineeringDossierDraft,
  finalizeEngineeringDossier,
  updateEngineeringDossierDraft,
} from "./dossier.mjs";
import {
  evaluateEngineeringGate,
  validateEngineeringCheckCatalog,
} from "./gate.mjs";
import {
  createEngineeringQualitySession,
  inspectEngineeringQualitySession,
  sessionAuthorizeAction,
  sessionFinalizeAttestation,
  sessionLinkGate,
  sessionObserveWorkspace,
  sessionRecordDossier,
  sessionRecordImplementationDelegation,
  sessionRecordImplementation,
  sessionRecordIntegratedVerification,
  sessionRecordPostArchitectureEvaluation,
} from "./session.mjs";
import { validateArchitectureEvaluation } from "./architecture.mjs";
import { createIntegratedVerificationEvidence } from "./verification-evidence.mjs";
import { requiredEngineeringVerificationTargets } from "./verification-targets.mjs";
import { snapshotEngineeringQualityStore } from "./store.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertFingerprint,
  assertInteger,
  assertPlain,
  assertString,
  assertStringArray,
  deepFrozenClone,
  exact,
  fingerprint,
} from "./validation.mjs";

const INTERNALS = new WeakMap();
const QUALITY_OPERATIONS = new Set([
  "quality_create_dossier",
  "quality_update_dossier",
  "quality_evaluate_architecture",
  "quality_finalize_dossier",
  "quality_inspect",
  "quality_authorize_action",
]);
const IMPLEMENTATION_AGENT_ROLES = new Set(["general"]);

function stateFor(coordinator) {
  const state = INTERNALS.get(coordinator);
  if (!state) throw new ContractError("QUALITY_LIVE_COORDINATOR", "coordinator was not created by createQualityLiveCoordinator");
  return state;
}

function currentWorkspace(state) {
  const value = state.observeWorkspace();
  assertFingerprint(value, "quality live workspace fingerprint");
  sessionObserveWorkspace(state.session, {
    fingerprint: value,
    sequence: state.observationSequence++,
  });
  return value;
}

function dossierReceipt(state) {
  return deepFrozenClone({
    schema_version: 1,
    dossier_id: state.draft?.dossier_id ?? null,
    revision: state.draft?.revision ?? null,
    dossier_status: state.draft?.status ?? "absent",
    dossier_fingerprint: state.finalized?.fingerprint ?? null,
    gate_id: state.gate?.gate_id ?? null,
    gate_status: state.gate?.status ?? "not_evaluated",
    gate_fingerprint: state.gate?.fingerprint ?? null,
    implementation_enabled: state.gate?.status === "passed",
  }, "quality live dossier receipt");
}

function inspectReceipt(state) {
  return deepFrozenClone({
    schema_version: 1,
    run_id: state.runId,
    task_id: state.taskId,
    risk_class: state.riskClass,
    check_ids: state.checkCatalog.checks.filter((entry) => entry.available).map((entry) => entry.check_id),
    mechanism_ids: state.checkCatalog.mechanisms.filter((entry) => entry.available).map((entry) => entry.mechanism_id),
    ownership_paths: state.ownershipPaths,
    ...dossierReceipt(state),
  }, "quality live inspection receipt");
}

function assertDossierBinding(state, draft) {
  if (draft.run_id !== state.runId) {
    throw new ContractError("QUALITY_LIVE_RUN_BINDING", "adapter dossier run_id does not match the operational run");
  }
  if (draft.task_id !== state.taskId) {
    throw new ContractError("QUALITY_LIVE_TASK_BINDING", "adapter dossier task_id does not match the operational task");
  }
  if (draft.risk_class !== state.riskClass) {
    throw new ContractError("QUALITY_LIVE_RISK_BINDING", "adapter dossier risk_class does not match the runner-owned scenario risk");
  }
  if (draft.verification_boundary.ownership_paths.length > 0) {
    const expected = new Set(state.ownershipPaths);
    if (
      draft.verification_boundary.ownership_paths.length !== expected.size
      || draft.verification_boundary.ownership_paths.some((entry) => !expected.has(entry))
    ) {
      throw new ContractError("QUALITY_LIVE_OWNERSHIP_BINDING", "dossier ownership must exactly match the runner-owned workspace allowlist");
    }
  }
}

function handleQualityOperation(state, operation, payload) {
  currentWorkspace(state);
  if (operation === "quality_inspect") {
    exact(payload, [], [], "quality live inspect request");
    return inspectReceipt(state);
  }
  if (operation === "quality_create_dossier") {
    if (state.draft !== null) throw new ContractError("QUALITY_DOSSIER_RECORD_CONFLICT", "quality dossier was already created");
    assertPlain(payload, "quality live dossier create request");
    state.draft = createEngineeringDossierDraft({ ...payload, run_id: state.runId });
    assertDossierBinding(state, state.draft);
    return dossierReceipt(state);
  }
  if (operation === "quality_update_dossier") {
    if (state.draft === null) throw new ContractError("QUALITY_DOSSIER_NOT_CREATED", "quality dossier must be created before update");
    state.draft = updateEngineeringDossierDraft(state.draft, payload);
    assertDossierBinding(state, state.draft);
    return dossierReceipt(state);
  }
  if (operation === "quality_evaluate_architecture") {
    if (state.draft === null) throw new ContractError("QUALITY_DOSSIER_NOT_CREATED", "quality dossier must be created before architecture evaluation");
    if (state.draft.status !== "draft") throw new ContractError("QUALITY_DOSSIER_FINALIZED", "finalized dossier architecture cannot be re-evaluated");
    exact(payload, ["expected_revision"], ["expected_revision"], "quality live architecture evaluation request");
    assertInteger(payload.expected_revision, "quality live architecture evaluation request.expected_revision", { min: 1 });
    if (payload.expected_revision !== state.draft.revision) {
      throw new ContractError("QUALITY_DOSSIER_REVISION_CONFLICT", "architecture evaluation expected_revision is stale");
    }
    const evaluation = state.evaluateArchitecture(state.draft);
    if (evaluation === null) {
      return deepFrozenClone({
        policy_id: null,
        status: "not_configured",
        evaluation_id: null,
        violation_ids: [],
        notes: null,
      }, "quality live architecture assessment");
    }
    return deepFrozenClone({
      policy_id: evaluation.policy_id,
      status: evaluation.status,
      evaluation_id: evaluation.evaluation_id,
      violation_ids: evaluation.violations.map((entry) => entry.violation_id),
      notes: null,
    }, "quality live architecture assessment");
  }
  if (operation === "quality_finalize_dossier") {
    if (state.draft === null) throw new ContractError("QUALITY_DOSSIER_NOT_CREATED", "quality dossier must be created before finalization");
    exact(payload, ["finalized_at"], ["finalized_at"], "quality live dossier finalization request");
    state.finalized = finalizeEngineeringDossier(state.draft, payload);
    assertDossierBinding(state, state.finalized);
    const architectureEvaluation = state.evaluateArchitecture(state.finalized);
    state.architectureEvaluation = architectureEvaluation;
    const evaluatedAt = state.clock();
    const preimplementationEvidence = state.collectPreimplementationEvidence(Object.freeze({
      dossier: state.finalized,
      check_catalog: state.checkCatalog,
      evaluated_at: evaluatedAt,
    }));
    state.gate = evaluateEngineeringGate({
      gate_id: state.idFactory("gate"),
      dossier: state.finalized,
      check_catalog: state.checkCatalog,
      preimplementation_evidence: preimplementationEvidence,
      architecture_evaluation: architectureEvaluation,
      evaluated_at: evaluatedAt,
    });
    sessionRecordDossier(state.session, state.finalized);
    sessionLinkGate(state.session, {
      decision: state.gate,
      preimplementation_evidence: preimplementationEvidence,
      architecture_evaluation: architectureEvaluation,
      workspace_fingerprint: state.initialWorkspaceFingerprint,
      append_trace: state.appendGateTrace,
    });
    state.draft = state.finalized;
    return dossierReceipt(state);
  }
  if (operation === "quality_authorize_action") {
    const receipt = sessionAuthorizeAction(state.session, payload);
    if (payload.intent === "implementation") state.integratedVerificationEvidence = null;
    return deepFrozenClone(receipt, "quality live authorization receipt");
  }
  throw new ContractError("QUALITY_LIVE_OPERATION", `unsupported quality operation: ${operation}`);
}

function filePathsFromEdit(payload) {
  if (!Array.isArray(payload?.files_written) || payload.files_written.length === 0) {
    throw new ContractError("QUALITY_IMPLEMENTATION_EVENT_MISSING", "quality edit event must name at least one written file");
  }
  return payload.files_written.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.path !== "string") {
      throw new ContractError("QUALITY_IMPLEMENTATION_EVENT_MISSING", `quality edit files_written[${index}] must contain path`);
    }
    return entry.path;
  });
}

function authoritativePreimplementationReceipts(state) {
  const snapshot = snapshotEngineeringQualityStore(state.store);
  const evidence = snapshot.preimplementation_evidence;
  return {
    checks: (evidence?.baseline_receipts ?? []).map((entry) => ({ ...entry })),
    mechanisms: (evidence?.plan_challenge_receipts ?? []).map((entry) => ({
      receipt_id: entry.receipt_id,
      mechanism_id: entry.mechanism_id,
      trusted_producer: entry.trusted_producer,
      phase: entry.phase,
      status: entry.status,
      evidence_fingerprint: entry.evidence_fingerprint,
      completed_at: entry.completed_at,
    })),
  };
}

function allPassed(entries) {
  return entries.length > 0 && entries.every((entry) => entry?.status === "passed");
}

function assertRunnerResultArray(value, label) {
  assertArray(value, label, {
    min: 1,
    max: 256,
    item: (entry, entryLabel) => {
      assertPlain(entry, entryLabel);
      assertString(entry.check_id, `${entryLabel}.check_id`, { maxBytes: 256 });
      assertString(entry.status, `${entryLabel}.status`, { maxBytes: 32 });
    },
  });
}

export function createQualityLiveCoordinator(options) {
  const keys = [
    "store",
    "initial_workspace_fingerprint",
    "risk_class",
    "ownership_paths",
    "check_catalog",
    "append_gate_trace",
    "observe_workspace",
    "evaluate_architecture",
    "audit_architecture",
    "collect_preimplementation_evidence",
    "clock",
    "id_factory",
  ];
  exact(options, keys, [
    "store",
    "initial_workspace_fingerprint",
    "risk_class",
    "ownership_paths",
    "check_catalog",
    "append_gate_trace",
    "observe_workspace",
  ], "quality live coordinator options");
  if (!options.store || typeof options.store.run_id !== "string" || typeof options.store.task_id !== "string") {
    throw new ContractError("QUALITY_LIVE_STORE", "quality live coordinator requires an Engineering Quality Store");
  }
  assertFingerprint(options.initial_workspace_fingerprint, "quality live coordinator.initial_workspace_fingerprint");
  if (!["standard-lite", "high", "critical"].includes(options.risk_class)) {
    throw new ContractError("QUALITY_LIVE_RISK", "quality live risk_class must be standard-lite, high, or critical");
  }
  assertStringArray(options.ownership_paths, "quality live coordinator.ownership_paths", { path: true, max: 64 });
  validateEngineeringCheckCatalog(options.check_catalog);
  if (typeof options.append_gate_trace !== "function" || typeof options.observe_workspace !== "function") {
    throw new ContractError("QUALITY_LIVE_CALLBACK", "quality live coordinator callbacks must be functions");
  }
  if (options.evaluate_architecture !== undefined && typeof options.evaluate_architecture !== "function") {
    throw new ContractError("QUALITY_LIVE_CALLBACK", "evaluate_architecture must be a function");
  }
  if (options.audit_architecture !== undefined && typeof options.audit_architecture !== "function") {
    throw new ContractError("QUALITY_LIVE_CALLBACK", "audit_architecture must be a function");
  }
  if (
    options.collect_preimplementation_evidence !== undefined
    && typeof options.collect_preimplementation_evidence !== "function"
  ) {
    throw new ContractError("QUALITY_LIVE_CALLBACK", "collect_preimplementation_evidence must be a function");
  }
  if (options.clock !== undefined && typeof options.clock !== "function") throw new ContractError("QUALITY_LIVE_CALLBACK", "clock must be a function");
  if (options.id_factory !== undefined && typeof options.id_factory !== "function") throw new ContractError("QUALITY_LIVE_CALLBACK", "id_factory must be a function");
  const coordinator = Object.freeze({ run_id: options.store.run_id, task_id: options.store.task_id });
  const session = createEngineeringQualitySession({
    store: options.store,
    initial_workspace_fingerprint: options.initial_workspace_fingerprint,
  });
  INTERNALS.set(coordinator, {
    store: options.store,
    session,
    runId: options.store.run_id,
    taskId: options.store.task_id,
    initialWorkspaceFingerprint: options.initial_workspace_fingerprint,
    riskClass: options.risk_class,
    ownershipPaths: [...options.ownership_paths],
    checkCatalog: options.check_catalog,
    appendGateTrace: options.append_gate_trace,
    observeWorkspace: options.observe_workspace,
    evaluateArchitecture: options.evaluate_architecture ?? (() => null),
    auditArchitecture: options.audit_architecture ?? (() => null),
    collectPreimplementationEvidence: options.collect_preimplementation_evidence ?? (() => null),
    clock: options.clock ?? (() => new Date().toISOString()),
    idFactory: options.id_factory ?? ((kind) => `${kind}-${options.store.run_id}`),
    observationSequence: 0,
    draft: null,
    finalized: null,
    gate: null,
    architectureEvaluation: null,
    postArchitectureEvaluation: null,
    integratedVerificationEvidence: null,
    editEvents: [],
    reconciledEditCount: 0,
    delegationEvents: [],
    attestation: null,
  });
  return coordinator;
}

export function handleQualityLiveOperation(coordinator, operation, payload, traceHandler) {
  const state = stateFor(coordinator);
  if (QUALITY_OPERATIONS.has(operation)) return handleQualityOperation(state, operation, payload);
  if (typeof traceHandler !== "function") throw new ContractError("QUALITY_LIVE_TRACE", "traceHandler must be a function");
  currentWorkspace(state);
  if (operation === "emit" && payload?.event_type === "edit") {
    const files = filePathsFromEdit(payload);
    sessionAuthorizeAction(state.session, {
      kind: "edit",
      intent: "implementation",
      writable: true,
      write_scope: files,
    });
    state.integratedVerificationEvidence = null;
    const receipt = traceHandler(operation, payload);
    assertInteger(receipt?.sequence, "quality live edit trace receipt.sequence", { min: 1 });
    state.editEvents.push({ sequence: receipt.sequence, files });
    return receipt;
  }
  if (operation === "job_create") {
    const writeScope = Array.isArray(payload?.write_scope) ? payload.write_scope : [];
    const implementationRole = IMPLEMENTATION_AGENT_ROLES.has(payload?.agent);
    const implementationIntent = implementationRole || writeScope.length > 0;
    sessionAuthorizeAction(state.session, {
      kind: "job_create",
      intent: implementationIntent ? "implementation" : "read_only",
      writable: implementationIntent,
      write_scope: writeScope,
    });
    if (implementationIntent) state.integratedVerificationEvidence = null;
    if (implementationIntent) {
      const event = traceHandler("emit", {
        event_type: "delegation",
        summary: "Runner authorized an implementation-worker delegation after the quality gate.",
        status: "completed",
        verifier_codes: ["ENGINEERING-IMPLEMENTATION-DELEGATION"],
      });
      assertInteger(event?.sequence, "quality live delegation trace receipt.sequence", { min: 1 });
      sessionRecordImplementationDelegation(state.session, { sequence: event.sequence, write_scope: writeScope });
      state.delegationEvents.push({ sequence: event.sequence, files: [...writeScope] });
    }
  }
  return traceHandler(operation, payload);
}

export function recordQualityLiveImplementation(coordinator, input) {
  const state = stateFor(coordinator);
  exact(input, ["final_workspace_fingerprint", "changed_paths"], ["final_workspace_fingerprint", "changed_paths"], "quality live implementation reconciliation");
  assertFingerprint(input.final_workspace_fingerprint, "quality live implementation reconciliation.final_workspace_fingerprint");
  assertStringArray(input.changed_paths, "quality live implementation reconciliation.changed_paths", { path: true, max: 128 });
  const pendingEdits = state.editEvents.slice(state.reconciledEditCount);
  const changed = new Set(input.changed_paths);
  const traced = new Set(pendingEdits.flatMap((entry) => entry.files));
  const untraced = [...changed].filter((entry) => !traced.has(entry));
  if (untraced.length > 0) {
    throw new ContractError("QUALITY_IMPLEMENTATION_EVENT_MISSING", `workspace changed without matching edit event: ${untraced.join(",")}`);
  }
  let receipt;
  if (input.changed_paths.length === 0) {
    sessionObserveWorkspace(state.session, {
      fingerprint: input.final_workspace_fingerprint,
      sequence: state.observationSequence++,
    });
    receipt = { implementation_recorded: false, changed_paths: [] };
  } else {
    if (pendingEdits.length === 0) {
      throw new ContractError(
        "QUALITY_IMPLEMENTATION_EVENT_MISSING",
        "workspace changed without an unreconciled edit event",
      );
    }
    const firstEdit = pendingEdits[0];
    const lastEdit = pendingEdits.at(-1);
    sessionRecordImplementation(state.session, {
      first_sequence: firstEdit.sequence,
      sequence: lastEdit.sequence,
      workspace_fingerprint: input.final_workspace_fingerprint,
      files_written: [...input.changed_paths],
    });
    state.reconciledEditCount = state.editEvents.length;
    receipt = { implementation_recorded: true, changed_paths: [...input.changed_paths] };
    state.integratedVerificationEvidence = null;
  }
  if (state.architectureEvaluation !== null && state.architectureEvaluation.policy_id !== null) {
    const postEvaluation = state.auditArchitecture(Object.freeze({
      dossier: state.finalized,
      baseline_evaluation: state.architectureEvaluation,
      changed_paths: Object.freeze([...input.changed_paths]),
      final_workspace_fingerprint: input.final_workspace_fingerprint,
    }));
    if (postEvaluation === null) {
      throw new ContractError(
        "QUALITY_POST_ARCHITECTURE_AUDIT_UNAVAILABLE",
        "configured architecture policy requires a trusted post-implementation graph evaluator",
      );
    }
    validateArchitectureEvaluation(postEvaluation);
    sessionRecordPostArchitectureEvaluation(state.session, postEvaluation);
    state.postArchitectureEvaluation = postEvaluation;
  }
  return deepFrozenClone(receipt, "quality live implementation receipt");
}

export function recordQualityLiveIntegratedVerification(coordinator, input) {
  const state = stateFor(coordinator);
  const keys = ["evidence_id", "trace_event", "check_receipts", "mechanism_receipts", "completed_at"];
  exact(input, keys, keys, "quality live integrated verification");
  if (state.finalized === null || state.gate === null) {
    throw new ContractError("QUALITY_INTEGRATED_EVIDENCE_BINDING", "quality live verification requires a finalized dossier and gate");
  }
  const session = inspectEngineeringQualitySession(state.session);
  const authoritative = authoritativePreimplementationReceipts(state);
  const authoritativeCheckIds = new Set(authoritative.checks.map((entry) => entry.check_id));
  const authoritativeMechanismIds = new Set(authoritative.mechanisms.map((entry) => entry.mechanism_id));
  if (input.check_receipts.some((entry) => entry?.phase === "preimplementation" || authoritativeCheckIds.has(entry?.check_id))) {
    throw new ContractError(
      "QUALITY_INTEGRATED_EVIDENCE_RECEIPT",
      "runner-supplied integrated verification cannot substitute gate-authoritative baseline receipts",
    );
  }
  if (input.mechanism_receipts.some((entry) => authoritativeMechanismIds.has(entry?.mechanism_id))) {
    throw new ContractError(
      "QUALITY_INTEGRATED_EVIDENCE_RECEIPT",
      "runner-supplied integrated verification cannot substitute gate-authoritative plan-challenge receipts",
    );
  }
  const evidence = createIntegratedVerificationEvidence({
    evidence_id: input.evidence_id,
    run_id: state.runId,
    task_id: state.taskId,
    dossier_id: state.finalized.dossier_id,
    dossier_fingerprint: state.finalized.fingerprint,
    gate_id: state.gate.gate_id,
    gate_fingerprint: state.gate.fingerprint,
    check_catalog_fingerprint: state.checkCatalog.fingerprint,
    workspace_fingerprint: session.current_workspace_fingerprint,
    trace_event: input.trace_event,
    check_receipts: [...authoritative.checks, ...input.check_receipts],
    mechanism_receipts: [...authoritative.mechanisms, ...input.mechanism_receipts],
    completed_at: input.completed_at,
  });
  const receipt = sessionRecordIntegratedVerification(state.session, {
    evidence,
    check_catalog: state.checkCatalog,
  });
  state.integratedVerificationEvidence = evidence;
  return deepFrozenClone({ recorded: true, ...receipt }, "quality live verification receipt");
}

export function qualityLiveIntegratedVerificationTargetIds(coordinator) {
  const state = stateFor(coordinator);
  if (state.finalized === null || state.gate === null) {
    throw new ContractError("QUALITY_INTEGRATED_EVIDENCE_BINDING", "quality live verification requires a finalized dossier and gate");
  }
  const required = requiredEngineeringVerificationTargets(state.finalized);
  const authoritative = authoritativePreimplementationReceipts(state);
  return Object.freeze([...new Set([
    ...required.checkIds,
    ...required.mechanismIds,
    ...authoritative.checks.map((entry) => entry.check_id),
    ...authoritative.mechanisms.map((entry) => entry.mechanism_id),
  ])]);
}

export function recordQualityLiveRunnerIntegratedVerification(coordinator, input) {
  const state = stateFor(coordinator);
  const keys = [
    "evidence_id",
    "trace_event",
    "scenario_id",
    "scenario_fingerprint",
    "visible_results",
    "hidden_results",
    "workspace_result",
    "termination_accepted",
  ];
  exact(input, keys, keys, "quality live runner integrated verification");
  assertString(input.scenario_id, "quality live runner integrated verification.scenario_id", { maxBytes: 128 });
  assertFingerprint(input.scenario_fingerprint, "quality live runner integrated verification.scenario_fingerprint");
  assertRunnerResultArray(input.visible_results, "quality live runner integrated verification.visible_results");
  assertRunnerResultArray(input.hidden_results, "quality live runner integrated verification.hidden_results");
  assertPlain(input.workspace_result, "quality live runner integrated verification.workspace_result");
  assertString(input.workspace_result.check_id, "quality live runner integrated verification.workspace_result.check_id", { maxBytes: 256 });
  assertString(input.workspace_result.status, "quality live runner integrated verification.workspace_result.status", { maxBytes: 32 });
  assertBoolean(input.termination_accepted, "quality live runner integrated verification.termination_accepted");
  if (state.finalized === null || state.gate === null) {
    throw new ContractError("QUALITY_INTEGRATED_EVIDENCE_BINDING", "quality live verification requires a finalized dossier and gate");
  }
  const required = requiredEngineeringVerificationTargets(state.finalized);
  const authoritative = authoritativePreimplementationReceipts(state);
  const authoritativeCheckIds = new Set(authoritative.checks.map((entry) => entry.check_id));
  const authoritativeMechanismIds = new Set(authoritative.mechanisms.map((entry) => entry.mechanism_id));
  const catalogChecks = new Map(state.checkCatalog.checks.map((entry) => [entry.check_id, entry]));
  const catalogMechanisms = new Map(state.checkCatalog.mechanisms.map((entry) => [entry.mechanism_id, entry]));
  const obligations = new Map(state.finalized.test_obligations.map((entry) => [entry.check_id, entry]));
  const completedAt = input.trace_event?.timestamp;
  const visiblePassed = allPassed(input.visible_results);
  const hiddenPassed = allPassed(input.hidden_results);
  const integrationPassed = visiblePassed
    && hiddenPassed
    && input.workspace_result.status === "passed"
    && input.termination_accepted;
  const checkReceipts = [];
  for (const checkId of required.checkIds) {
    if (authoritativeCheckIds.has(checkId)) continue;
    const catalogEntry = catalogChecks.get(checkId);
    const obligation = obligations.get(checkId);
    let source;
    if (checkId === `${input.scenario_id}-visible`) {
      if (!visiblePassed) throw new ContractError("QUALITY_INTEGRATED_VERIFICATION_FAILED", `runner visible evidence did not pass: ${checkId}`);
      source = { kind: "visible", results: input.visible_results };
    } else if (checkId === `${input.scenario_id}-integration`) {
      if (!integrationPassed) throw new ContractError("QUALITY_INTEGRATED_VERIFICATION_FAILED", `runner integration evidence did not pass: ${checkId}`);
      source = {
        kind: "integration",
        visible_results: input.visible_results,
        hidden_results: input.hidden_results,
        workspace_result: input.workspace_result,
        termination_accepted: input.termination_accepted,
      };
    } else {
      throw new ContractError("QUALITY_INTEGRATED_VERIFICATION_MISSING", `runner has no execution source for required check: ${checkId}`);
    }
    if (!catalogEntry?.available || !obligation) {
      throw new ContractError("QUALITY_INTEGRATED_EVIDENCE_CATALOG", `runner check is not available and obligated: ${checkId}`);
    }
    checkReceipts.push({
      receipt_id: `${checkId}-runner-${input.trace_event.sequence}`,
      check_id: checkId,
      trusted_producer: catalogEntry.trusted_producer,
      phase: obligation.phase,
      status: "passed",
      command_or_mechanism: obligation.command_or_mechanism,
      evidence_fingerprint: fingerprint({
        scenario_id: input.scenario_id,
        scenario_fingerprint: input.scenario_fingerprint,
        check_id: checkId,
        source,
      }),
      completed_at: completedAt,
    });
  }
  const mechanismReceipts = [];
  for (const mechanismId of required.mechanismIds) {
    if (authoritativeMechanismIds.has(mechanismId)) continue;
    const catalogEntry = catalogMechanisms.get(mechanismId);
    if (!catalogEntry?.available) {
      throw new ContractError("QUALITY_INTEGRATED_EVIDENCE_CATALOG", `runner mechanism is unavailable: ${mechanismId}`);
    }
    let source;
    let phase;
    if (mechanismId === `${input.scenario_id}-hidden-evaluation`) {
      if (!hiddenPassed) throw new ContractError("QUALITY_INTEGRATED_VERIFICATION_FAILED", `runner hidden evidence did not pass: ${mechanismId}`);
      source = { kind: "hidden", results: input.hidden_results };
      phase = "integration";
    } else if (mechanismId === `${input.scenario_id}-architecture-evaluation`) {
      const architecture = state.postArchitectureEvaluation ?? state.architectureEvaluation;
      if (architecture === null || architecture.status !== "passed") {
        throw new ContractError("QUALITY_INTEGRATED_VERIFICATION_FAILED", `runner architecture evidence did not pass: ${mechanismId}`);
      }
      source = { kind: "architecture", evaluation: architecture };
      phase = "preimplementation";
    } else {
      throw new ContractError("QUALITY_INTEGRATED_VERIFICATION_MISSING", `runner has no execution source for required mechanism: ${mechanismId}`);
    }
    mechanismReceipts.push({
      receipt_id: `${mechanismId}-runner-${input.trace_event.sequence}`,
      mechanism_id: mechanismId,
      trusted_producer: catalogEntry.trusted_producer,
      phase,
      status: "passed",
      evidence_fingerprint: fingerprint({
        scenario_id: input.scenario_id,
        scenario_fingerprint: input.scenario_fingerprint,
        mechanism_id: mechanismId,
        source,
      }),
      completed_at: completedAt,
    });
  }
  return recordQualityLiveIntegratedVerification(coordinator, {
    evidence_id: input.evidence_id,
    trace_event: input.trace_event,
    check_receipts: checkReceipts,
    mechanism_receipts: mechanismReceipts,
    completed_at: completedAt,
  });
}

export function finalizeQualityLiveAttestation(coordinator, input) {
  const state = stateFor(coordinator);
  state.attestation = sessionFinalizeAttestation(state.session, input);
  return state.attestation;
}

export function inspectQualityLiveCoordinator(coordinator) {
  const state = stateFor(coordinator);
  return deepFrozenClone({
    ...inspectQualityLiveCoordinatorState(state),
    session: inspectEngineeringQualitySession(state.session),
  }, "quality live coordinator inspection");
}

export function qualityLivePrecompletionVerifierCodes(coordinator) {
  const state = stateFor(coordinator);
  const dossier = state.finalized;
  const gate = state.gate;
  if (dossier === null || gate === null) return Object.freeze([]);
  const session = inspectEngineeringQualitySession(state.session);
  const firstImplementationSequence = [
    state.editEvents[0]?.sequence,
    state.delegationEvents[0]?.sequence,
  ].filter((entry) => entry !== undefined).sort((left, right) => left - right)[0] ?? null;
  const codes = [];
  if (
    gate.dossier_fingerprint === dossier.fingerprint
    && (firstImplementationSequence === null || session.gate_trace_sequence < firstImplementationSequence)
  ) codes.push("ENGINEERING_DOSSIER_BEFORE_IMPLEMENTATION");
  if (
    gate.status === "passed"
    && (firstImplementationSequence === null || session.gate_trace_sequence < firstImplementationSequence)
  ) codes.push("ENGINEERING_GATE_PASSED_BEFORE_IMPLEMENTATION");
  const coverageComplete = dossier.risk_class === "standard-lite"
    ? dossier.affected_areas.length > 0
    : dossier.impact_graph?.coverage.completeness === "complete";
  if (coverageComplete) codes.push("ENGINEERING_AFFECTED_SYSTEM_COVERAGE_RECORDED");
  if (
    dossier.unknowns.every((entry) => !entry.blocking)
    && (dossier.impact_graph?.unknowns.every((entry) => !entry.blocking) ?? true)
  ) codes.push("ENGINEERING_RELEVANT_UNKNOWNS_RESOLVED");
  const mappingsComplete = [...dossier.invariants, ...dossier.edge_cases, ...dossier.failure_modes]
    .every((entry) => mappingVerified(entry, state.integratedVerificationEvidence));
  if (mappingsComplete) codes.push("ENGINEERING_EDGE_FAILURE_MAPPING_VERIFIED");
  if (
    state.architectureEvaluation === null
      ? dossier.architecture_assessment.status === "not_configured"
      : state.postArchitectureEvaluation?.status === "passed"
  ) codes.push("ENGINEERING_ARCHITECTURE_RESPECTED");
  const ownership = dossier.verification_boundary.ownership_paths;
  if (state.editEvents.flatMap((entry) => entry.files).every((file) => ownership.some((scope) => file === scope || file.startsWith(`${scope}/`)))) {
    codes.push("ENGINEERING_IMPLEMENTATION_WITHIN_OWNERSHIP");
  }
  return Object.freeze(codes);
}

function inspectQualityLiveCoordinatorState(state) {
  return {
    run_id: state.runId,
    task_id: state.taskId,
    risk_class: state.riskClass,
    dossier_id: state.finalized?.dossier_id ?? null,
    dossier_fingerprint: state.finalized?.fingerprint ?? null,
    gate_id: state.gate?.gate_id ?? null,
    gate_status: state.gate?.status ?? null,
    gate_fingerprint: state.gate?.fingerprint ?? null,
    architecture_evaluation_fingerprint: state.architectureEvaluation?.fingerprint ?? null,
    post_architecture_evaluation_fingerprint: state.postArchitectureEvaluation?.fingerprint ?? null,
    post_architecture_evaluation_status: state.postArchitectureEvaluation?.status ?? null,
    integrated_verification_evidence_fingerprint: state.integratedVerificationEvidence?.fingerprint ?? null,
    attestation_fingerprint: state.attestation?.fingerprint ?? null,
  };
}

export function qualityLiveSessionForPublication(coordinator) {
  return stateFor(coordinator).session;
}

function mappingVerified(item, evidence) {
  const mapping = item?.mapping;
  if (mapping?.classification === "not_applicable") return true;
  if (mapping?.classification === "applicable_blocked_unverified" || evidence === null) return false;
  const checkIds = new Set(evidence.check_receipts.filter((entry) => entry.status === "passed").map((entry) => entry.check_id));
  const mechanismIds = new Set(
    evidence.mechanism_receipts.filter((entry) => entry.status === "passed").map((entry) => entry.mechanism_id),
  );
  return mapping.check_ids.every((id) => checkIds.has(id))
    && mapping.mechanism_ids.every((id) => mechanismIds.has(id));
}

export function qualityLiveOutcomeEvidence(coordinator) {
  const state = stateFor(coordinator);
  const dossier = state.finalized;
  const gate = state.gate;
  const session = inspectEngineeringQualitySession(state.session);
  const gateReasons = gate?.reasons ?? [];
  const architectureViolations = state.postArchitectureEvaluation?.violations
    ?? state.architectureEvaluation?.violations
    ?? [];
  const invariantIds = new Set(dossier?.invariants.map((entry) => entry.id) ?? []);
  const invariantGateFailures = gateReasons.filter((entry) => (
    invariantIds.has(entry.subject_id)
    && ["QUALITY_INVARIANT_UNMAPPED", "QUALITY_BLOCKED_UNVERIFIED", "QUALITY_CHECK_UNKNOWN", "QUALITY_MECHANISM_UNKNOWN"].includes(entry.code)
  )).length;
  const criticalUnverified = dossier?.risk_class === "critical"
    ? dossier.invariants.filter((entry) => !mappingVerified(entry, state.integratedVerificationEvidence)).length
    : 0;
  const affectedPathGaps = (dossier?.unknowns.filter((entry) => entry.blocking).length ?? 0)
    + (dossier?.impact_graph?.unknowns.filter((entry) => entry.blocking).length ?? 0)
    + gateReasons.filter((entry) => entry.code === "QUALITY_IMPACT_GRAPH_INCOMPLETE").length;
  const preEditViolation = session.failure?.code === "QUALITY_PRE_GATE_VIOLATION" ? 1 : 0;
  const permissionWidening = session.failure?.code === "QUALITY_WRITE_SCOPE_VIOLATION" ? 1 : 0;
  return deepFrozenClone({
    dossier_finalized: dossier !== null,
    gate_status: gate?.status ?? null,
    gate_reason_codes: gateReasons.map((entry) => entry.code),
    architecture_policy_violations: architectureViolations.filter((entry) => entry.blocking).length,
    invariant_violations: invariantGateFailures,
    unverified_critical_invariants: criticalUnverified,
    pre_edit_gate_violations: preEditViolation,
    unresolved_affected_path_gaps: affectedPathGaps,
    edge_case_total: dossier?.edge_cases.length ?? 0,
    edge_case_mapped: dossier?.edge_cases.filter((entry) => mappingVerified(entry, state.integratedVerificationEvidence)).length ?? 0,
    failure_mode_total: dossier?.failure_modes.length ?? 0,
    failure_mode_mapped: dossier?.failure_modes.filter((entry) => mappingVerified(entry, state.integratedVerificationEvidence)).length ?? 0,
    test_quality_failures: gateReasons.filter((entry) => ["QUALITY_CHECK_UNKNOWN", "QUALITY_MECHANISM_UNKNOWN"].includes(entry.code)).length,
    permission_widening: permissionWidening,
    session_failure_code: session.failure?.code ?? null,
  }, "quality live outcome evidence");
}
