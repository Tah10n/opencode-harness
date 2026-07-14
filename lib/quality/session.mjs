import { assertEnum, assertSafeId } from "../feedback/contracts.mjs";
import { normalizeRelativePath } from "../feedback/privacy.mjs";
import { createQualityAttestation } from "./attestation.mjs";
import { validateEngineeringDossier } from "./dossier.mjs";
import { validateEngineeringCheckCatalog, validateEngineeringGateDecision } from "./gate.mjs";
import {
  inspectEngineeringDossier,
  recordArchitectureEvaluation,
  recordPostArchitectureEvaluation,
  recordPreimplementationEvidence,
  recordEngineeringDossier,
  recordGateDecision,
  recordIntegratedVerificationEvidence,
  snapshotEngineeringQualityStore,
} from "./store.mjs";
import { validateIntegratedVerificationEvidence } from "./verification-evidence.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertFingerprint,
  assertInteger,
  assertIso,
  assertStringArray,
  canonicalJson,
  deepFrozenClone,
  exact,
} from "./validation.mjs";

const SESSION_INTERNALS = new WeakMap();
const ACTION_KINDS = Object.freeze(["edit", "write_tool", "job_create"]);

function stateFor(session) {
  const state = SESSION_INTERNALS.get(session);
  if (!state) throw new ContractError("QUALITY_SESSION", "session must be created by createEngineeringQualitySession");
  return state;
}

function fail(state, code, detail) {
  if (state.lifecycle !== "failed") {
    state.lifecycle = "failed";
    state.failure = Object.freeze({ code, detail });
  }
  throw new ContractError(state.failure.code, state.failure.detail);
}

function assertUsable(state) {
  if (state.lifecycle === "failed") throw new ContractError(state.failure.code, state.failure.detail);
  if (state.lifecycle === "attested") throw new ContractError("QUALITY_SESSION_FINALIZED", "quality session is already attested");
}

function canonicalPath(value, label) {
  const normalized = normalizeRelativePath(value, label);
  if (normalized !== value) throw new ContractError("QUALITY_PATH_CANONICAL", `${label} must use canonical forward slashes`);
  return value;
}

function withinOwnership(file, ownership) {
  return ownership.some((entry) => file === entry || file.startsWith(`${entry}/`));
}

function invalidateIntegratedVerification(state) {
  state.integratedVerificationEvidenceId = null;
  state.integratedVerificationSequence = null;
}

function verificationMappings(dossier) {
  return [
    ...dossier.invariants,
    ...dossier.edge_cases,
    ...dossier.failure_modes,
    ...dossier.premortem_matrix,
    ...dossier.counterexamples,
    ...dossier.specialized_checks,
    { id: "ROLLBACK-recovery", mapping: dossier.rollback_recovery.mapping },
  ].map((entry) => entry.mapping);
}

function requiredVerificationTargets(dossier) {
  const mappings = verificationMappings(dossier).filter((mapping) => mapping.classification !== "not_applicable");
  return {
    checkIds: new Set([
      ...dossier.verification_boundary.check_ids,
      ...dossier.verification_boundary.integration_check_ids,
      ...dossier.test_obligations.filter((entry) => entry.required).map((entry) => entry.check_id),
      ...mappings.flatMap((mapping) => mapping.check_ids),
    ]),
    mechanismIds: new Set([
      ...dossier.verification_boundary.mechanism_ids,
      ...mappings.flatMap((mapping) => mapping.mechanism_ids),
    ]),
  };
}

function validateIntegratedReceipts(state, evidence, catalog, dossier, snapshot) {
  validateEngineeringCheckCatalog(catalog);
  if (catalog.fingerprint !== snapshot.gate.check_catalog_fingerprint) {
    return fail(state, "QUALITY_INTEGRATED_EVIDENCE_CATALOG", "integrated verification catalog does not match the linked gate");
  }
  const checks = new Map(catalog.checks.map((entry) => [entry.check_id, entry]));
  const mechanisms = new Map(catalog.mechanisms.map((entry) => [entry.mechanism_id, entry]));
  const obligations = new Map(dossier.test_obligations.map((entry) => [entry.check_id, entry]));
  const preimplementationChecks = new Map(
    (snapshot.preimplementation_evidence?.baseline_receipts ?? []).map((entry) => [entry.check_id, entry]),
  );
  const preimplementationMechanisms = new Map();
  for (const entry of snapshot.preimplementation_evidence?.plan_challenge_receipts ?? []) {
    const entries = preimplementationMechanisms.get(entry.mechanism_id) ?? [];
    entries.push(entry);
    preimplementationMechanisms.set(entry.mechanism_id, entries);
  }
  for (const receipt of evidence.check_receipts) {
    if (receipt.status !== "passed") {
      return fail(state, "QUALITY_INTEGRATED_VERIFICATION_FAILED", `integrated check ${receipt.check_id} is ${receipt.status}`);
    }
    const catalogEntry = checks.get(receipt.check_id);
    const obligation = obligations.get(receipt.check_id);
    if (!catalogEntry?.available || !obligation) {
      return fail(state, "QUALITY_INTEGRATED_EVIDENCE_CATALOG", `integrated check is not available and obligated: ${receipt.check_id}`);
    }
    if (
      catalogEntry.trusted_producer !== receipt.trusted_producer
      || !catalogEntry.phases.includes(receipt.phase)
      || obligation.trusted_producer !== receipt.trusted_producer
      || obligation.phase !== receipt.phase
      || obligation.command_or_mechanism !== receipt.command_or_mechanism
    ) {
      return fail(state, "QUALITY_INTEGRATED_EVIDENCE_RECEIPT", `integrated check receipt contradicts its catalog or dossier obligation: ${receipt.check_id}`);
    }
    const baselineReceipt = preimplementationChecks.get(receipt.check_id);
    if (receipt.phase === "preimplementation" && (
      !baselineReceipt
      || baselineReceipt.status !== "passed"
      || baselineReceipt.trusted_producer !== receipt.trusted_producer
      || baselineReceipt.command_or_mechanism !== receipt.command_or_mechanism
      || baselineReceipt.evidence_fingerprint !== receipt.evidence_fingerprint
      || baselineReceipt.completed_at !== receipt.completed_at
    )) {
      return fail(state, "QUALITY_INTEGRATED_EVIDENCE_RECEIPT", `preimplementation receipt is not the gate-authoritative receipt: ${receipt.check_id}`);
    }
  }
  for (const receipt of evidence.mechanism_receipts) {
    if (receipt.status !== "passed") {
      return fail(state, "QUALITY_INTEGRATED_VERIFICATION_FAILED", `integrated mechanism ${receipt.mechanism_id} is ${receipt.status}`);
    }
    const catalogEntry = mechanisms.get(receipt.mechanism_id);
    if (
      !catalogEntry?.available
      || catalogEntry.trusted_producer !== receipt.trusted_producer
      || !catalogEntry.phases.includes(receipt.phase)
    ) {
      return fail(state, "QUALITY_INTEGRATED_EVIDENCE_RECEIPT", `integrated mechanism receipt contradicts its catalog: ${receipt.mechanism_id}`);
    }
    const planChallengeReceipts = preimplementationMechanisms.get(receipt.mechanism_id);
    if (planChallengeReceipts && !planChallengeReceipts.some((authoritative) => (
      authoritative.status === "passed"
      && authoritative.trusted_producer === receipt.trusted_producer
      && authoritative.phase === receipt.phase
      && authoritative.evidence_fingerprint === receipt.evidence_fingerprint
      && authoritative.completed_at === receipt.completed_at
    ))) {
      return fail(
        state,
        "QUALITY_INTEGRATED_EVIDENCE_RECEIPT",
        `preimplementation mechanism is not the gate-authoritative plan-challenge receipt: ${receipt.mechanism_id}`,
      );
    }
  }
  const required = requiredVerificationTargets(dossier);
  const providedChecks = new Set(evidence.check_receipts.map((entry) => entry.check_id));
  const providedMechanisms = new Set(evidence.mechanism_receipts.map((entry) => entry.mechanism_id));
  const missingChecks = [...required.checkIds].filter((id) => !providedChecks.has(id));
  const missingMechanisms = [...required.mechanismIds].filter((id) => !providedMechanisms.has(id));
  if (missingChecks.length > 0 || missingMechanisms.length > 0) {
    return fail(
      state,
      "QUALITY_INTEGRATED_VERIFICATION_MISSING",
      `integrated verification omitted targets: ${[...missingChecks, ...missingMechanisms].join(",")}`,
    );
  }
}

function validateGateTraceReceipt(value, gate) {
  const keys = ["sequence", "evidence_refs", "verifier_codes"];
  exact(value, keys, keys, "quality gate trace receipt");
  assertInteger(value.sequence, "quality gate trace receipt.sequence", { min: 1 });
  assertArray(value.evidence_refs, "quality gate trace receipt.evidence_refs", { min: 1, max: 32 });
  const gateRef = value.evidence_refs.some((entry) => entry?.kind === "file" && entry?.value === "quality/gate.json");
  if (!gateRef) throw new ContractError("QUALITY_GATE_TRACE_LINK", "gate trace receipt must reference quality/gate.json");
  assertStringArray(value.verifier_codes, "quality gate trace receipt.verifier_codes", { min: 1, maxBytes: 128 });
  const expectedCode = gate.status === "passed" ? "QUALITY-GATE-PASSED" : "QUALITY-GATE-BLOCKED";
  if (!value.verifier_codes.includes(expectedCode)) {
    throw new ContractError("QUALITY_GATE_TRACE_LINK", `gate trace receipt must contain ${expectedCode}`);
  }
  return value;
}

export function createEngineeringQualitySession(options) {
  const keys = ["store", "initial_workspace_fingerprint"];
  exact(options, keys, keys, "quality session options");
  if (!options.store || typeof options.store.run_id !== "string" || typeof options.store.task_id !== "string") {
    throw new ContractError("QUALITY_SESSION_STORE", "quality session requires an Engineering Quality Store");
  }
  assertFingerprint(options.initial_workspace_fingerprint, "quality session.initial_workspace_fingerprint");
  const api = Object.freeze({ run_id: options.store.run_id, task_id: options.store.task_id });
  SESSION_INTERNALS.set(api, {
    store: options.store,
    runId: options.store.run_id,
    taskId: options.store.task_id,
    initialWorkspaceFingerprint: options.initial_workspace_fingerprint,
    workspaceAtGateFingerprint: null,
    currentWorkspaceFingerprint: options.initial_workspace_fingerprint,
    dossierId: null,
    gateId: null,
    gateTraceSequence: null,
    firstImplementationSequence: null,
    lastImplementationActionSequence: null,
    lastWorkspaceMutationSequence: null,
    integratedVerificationSequence: null,
    integratedVerificationEvidenceId: null,
    lifecycle: "init",
    failure: null,
    attestation: null,
  });
  return api;
}

export function sessionRecordDossier(session, dossier) {
  const state = stateFor(session);
  assertUsable(state);
  validateEngineeringDossier(dossier, { requireFinalized: true });
  if (state.dossierId !== null && state.dossierId !== dossier.dossier_id) {
    return fail(state, "QUALITY_DOSSIER_RECORD_CONFLICT", "quality session already binds another dossier");
  }
  const stored = recordEngineeringDossier(state.store, dossier);
  state.dossierId = stored.dossier_id;
  if (state.lifecycle === "init") state.lifecycle = "dossier_recorded";
  return stored;
}

export function sessionObserveWorkspace(session, input) {
  const state = stateFor(session);
  assertUsable(state);
  exact(input, ["fingerprint", "sequence"], ["fingerprint", "sequence"], "quality workspace observation");
  assertFingerprint(input.fingerprint, "quality workspace observation.fingerprint");
  assertInteger(input.sequence, "quality workspace observation.sequence", { min: 0 });
  if (["init", "dossier_recorded"].includes(state.lifecycle) && input.fingerprint !== state.initialWorkspaceFingerprint) {
    return fail(state, "QUALITY_PRE_GATE_VIOLATION", "workspace changed before a trusted gate was linked");
  }
  state.currentWorkspaceFingerprint = input.fingerprint;
  return deepFrozenClone({ lifecycle: state.lifecycle, workspace_fingerprint: input.fingerprint }, "quality workspace observation receipt");
}

export function sessionLinkGate(session, input) {
  const state = stateFor(session);
  assertUsable(state);
  const keys = [
    "decision",
    "preimplementation_evidence",
    "architecture_evaluation",
    "workspace_fingerprint",
    "append_trace",
  ];
  exact(input, keys, ["decision", "workspace_fingerprint", "append_trace"], "quality gate link");
  validateEngineeringGateDecision(input.decision);
  assertFingerprint(input.workspace_fingerprint, "quality gate link.workspace_fingerprint");
  if (typeof input.append_trace !== "function") throw new ContractError("QUALITY_GATE_TRACE_LINK", "append_trace must be a trusted callback");
  if (state.dossierId === null) return fail(state, "QUALITY_DOSSIER_NOT_FINALIZED", "gate cannot link before the finalized dossier is recorded");
  const dossier = inspectEngineeringDossier(state.store, state.dossierId);
  if (input.decision.dossier_id !== dossier.dossier_id || input.decision.dossier_fingerprint !== dossier.fingerprint) {
    return fail(state, "QUALITY_GATE_DOSSIER", "gate does not bind the recorded finalized dossier");
  }
  if (input.workspace_fingerprint !== state.initialWorkspaceFingerprint || state.currentWorkspaceFingerprint !== state.initialWorkspaceFingerprint) {
    return fail(state, "QUALITY_PRE_GATE_VIOLATION", "workspace changed before the trusted gate transition");
  }
  if (input.architecture_evaluation !== undefined && input.architecture_evaluation !== null) {
    recordArchitectureEvaluation(state.store, input.architecture_evaluation);
  }
  if (input.preimplementation_evidence !== undefined && input.preimplementation_evidence !== null) {
    recordPreimplementationEvidence(state.store, input.preimplementation_evidence);
  }
  const storedGate = recordGateDecision(state.store, input.decision);
  let receipt;
  try {
    receipt = validateGateTraceReceipt(input.append_trace(Object.freeze({
      run_id: state.runId,
      task_id: state.taskId,
      dossier_id: dossier.dossier_id,
      dossier_fingerprint: dossier.fingerprint,
      gate_id: storedGate.gate_id,
      gate_fingerprint: storedGate.fingerprint,
      gate_status: storedGate.status,
    })), storedGate);
  } catch (error) {
    const detail = error instanceof ContractError ? error.message : "trusted gate trace append failed";
    return fail(state, "QUALITY_GATE_TRACE_LINK_FAILED", detail);
  }
  state.gateId = storedGate.gate_id;
  state.gateTraceSequence = receipt.sequence;
  state.workspaceAtGateFingerprint = input.workspace_fingerprint;
  state.lifecycle = storedGate.status === "passed" ? "implementation_enabled" : "gate_blocked";
  return deepFrozenClone({
    gate_id: storedGate.gate_id,
    gate_status: storedGate.status,
    gate_trace_sequence: receipt.sequence,
    implementation_enabled: storedGate.status === "passed",
  }, "quality gate link receipt");
}

export function sessionAuthorizeAction(session, input) {
  const state = stateFor(session);
  assertUsable(state);
  const keys = ["kind", "intent", "writable", "write_scope"];
  exact(input, keys, keys, "quality action authorization");
  assertEnum(input.kind, ACTION_KINDS, "quality action authorization.kind");
  assertEnum(input.intent, ["read_only", "implementation"], "quality action authorization.intent");
  assertBoolean(input.writable, "quality action authorization.writable");
  assertStringArray(input.write_scope, "quality action authorization.write_scope", { path: true });
  if (["edit", "write_tool"].includes(input.kind)
    && (input.intent !== "implementation" || !input.writable || input.write_scope.length === 0)) {
    return fail(state, "QUALITY_HANDOFF_INCOMPLETE", `${input.kind} requires implementation intent, writable permission, and non-empty write_scope`);
  }
  const mutationCapable = input.kind !== "job_create" || input.intent === "implementation" || input.writable;
  if (!mutationCapable && input.intent === "read_only" && !input.writable && input.write_scope.length === 0) {
    return deepFrozenClone({ authorized: true, gate_required: false, gate_fingerprint: null }, "quality action authorization receipt");
  }
  if (state.lifecycle === "gate_blocked") return fail(state, "QUALITY_GATE_BLOCKED", "blocked gate cannot authorize implementation");
  if (state.lifecycle !== "implementation_enabled") {
    return fail(state, "QUALITY_PRE_GATE_VIOLATION", "mutation-capable action was attempted before the trusted gate transition");
  }
  if (input.intent === "implementation" && (!input.writable || input.write_scope.length === 0)) {
    return fail(state, "QUALITY_HANDOFF_INCOMPLETE", "implementation delegation requires writable permission and non-empty write_scope");
  }
  const snapshot = snapshotEngineeringQualityStore(state.store);
  const dossier = snapshot.dossier;
  for (const file of input.write_scope) {
    const canonical = canonicalPath(file, "quality action authorization.write_scope entry");
    if (!withinOwnership(canonical, dossier.verification_boundary.ownership_paths)) {
      return fail(state, "QUALITY_WRITE_SCOPE_VIOLATION", `action exceeds dossier ownership before side effect: ${canonical}`);
    }
  }
  if (input.intent === "implementation") invalidateIntegratedVerification(state);
  return deepFrozenClone({
    authorized: true,
    gate_required: true,
    gate_fingerprint: snapshot.gate.fingerprint,
  }, "quality action authorization receipt");
}

export function sessionRecordImplementationDelegation(session, input) {
  const state = stateFor(session);
  assertUsable(state);
  exact(input, ["sequence", "write_scope"], ["sequence", "write_scope"], "quality implementation delegation");
  if (state.lifecycle !== "implementation_enabled") {
    return fail(state, "QUALITY_PRE_GATE_VIOLATION", "implementation delegation occurred without a passed linked gate");
  }
  assertInteger(input.sequence, "quality implementation delegation.sequence", { min: 1 });
  if (input.sequence <= state.gateTraceSequence) {
    return fail(state, "QUALITY_PRE_GATE_VIOLATION", "implementation delegation sequence does not follow the gate sequence");
  }
  assertStringArray(input.write_scope, "quality implementation delegation.write_scope", { min: 1, path: true });
  const dossier = inspectEngineeringDossier(state.store, state.dossierId);
  for (const file of input.write_scope) {
    if (!withinOwnership(file, dossier.verification_boundary.ownership_paths)) {
      return fail(state, "QUALITY_WRITE_SCOPE_VIOLATION", `implementation delegation exceeds dossier ownership: ${file}`);
    }
  }
  if (input.sequence <= (state.lastImplementationActionSequence ?? state.gateTraceSequence)) {
    return fail(state, "QUALITY_SEQUENCE_CONFLICT", "implementation delegation sequences must follow prior implementation evidence");
  }
  if (state.firstImplementationSequence === null) state.firstImplementationSequence = input.sequence;
  state.lastImplementationActionSequence = input.sequence;
  invalidateIntegratedVerification(state);
  return deepFrozenClone({
    first_implementation_sequence: state.firstImplementationSequence,
    last_implementation_action_sequence: state.lastImplementationActionSequence,
    delegation_sequence: input.sequence,
  }, "quality implementation delegation receipt");
}

export function sessionRecordImplementation(session, input) {
  const state = stateFor(session);
  assertUsable(state);
  const keys = ["first_sequence", "sequence", "workspace_fingerprint", "files_written"];
  exact(input, keys, keys, "quality implementation event");
  if (state.lifecycle !== "implementation_enabled") {
    return fail(state, "QUALITY_PRE_GATE_VIOLATION", "implementation event occurred without a passed linked gate");
  }
  assertInteger(input.sequence, "quality implementation event.sequence", { min: 1 });
  assertInteger(input.first_sequence, "quality implementation event.first_sequence", { min: 1 });
  if (input.first_sequence <= state.gateTraceSequence || input.first_sequence > input.sequence) {
    return fail(state, "QUALITY_PRE_GATE_VIOLATION", "implementation sequence does not follow the gate sequence");
  }
  assertFingerprint(input.workspace_fingerprint, "quality implementation event.workspace_fingerprint");
  assertArray(input.files_written, "quality implementation event.files_written", {
    min: 1,
    max: 128,
    item: (entry, label) => canonicalPath(entry, label),
  });
  const dossier = inspectEngineeringDossier(state.store, state.dossierId);
  for (const file of input.files_written) {
    if (!withinOwnership(file, dossier.verification_boundary.ownership_paths)) {
      return fail(state, "QUALITY_WRITE_SCOPE_VIOLATION", `implementation wrote outside dossier ownership: ${file}`);
    }
  }
  if (
    state.lastWorkspaceMutationSequence !== null
    && input.first_sequence <= state.lastWorkspaceMutationSequence
  ) {
    return fail(state, "QUALITY_SEQUENCE_CONFLICT", "workspace mutation sequences must be strictly increasing");
  }
  state.firstImplementationSequence = Math.min(
    state.firstImplementationSequence ?? input.first_sequence,
    input.first_sequence,
  );
  state.lastImplementationActionSequence = Math.max(state.lastImplementationActionSequence ?? input.sequence, input.sequence);
  state.lastWorkspaceMutationSequence = input.sequence;
  state.currentWorkspaceFingerprint = input.workspace_fingerprint;
  invalidateIntegratedVerification(state);
  return deepFrozenClone({
    first_implementation_sequence: state.firstImplementationSequence,
    last_implementation_action_sequence: state.lastImplementationActionSequence,
    last_workspace_mutation_sequence: state.lastWorkspaceMutationSequence,
  }, "quality implementation receipt");
}

export function sessionRecordIntegratedVerification(session, input) {
  const state = stateFor(session);
  assertUsable(state);
  const keys = ["evidence", "check_catalog"];
  exact(input, keys, keys, "quality integrated verification");
  if (state.lifecycle !== "implementation_enabled") {
    return fail(state, "QUALITY_GATE_BLOCKED", "integrated verification cannot complete without a passed gate");
  }
  validateIntegratedVerificationEvidence(input.evidence);
  const evidence = input.evidence;
  if (evidence.trace_event_sequence <= (state.lastImplementationActionSequence ?? state.gateTraceSequence)) {
    return fail(state, "QUALITY_INTEGRATED_VERIFICATION_MISSING", "integrated verification must follow the last workspace mutation or gate");
  }
  const snapshot = snapshotEngineeringQualityStore(state.store);
  const dossier = snapshot.dossier;
  if (
    evidence.run_id !== state.runId
    || evidence.task_id !== state.taskId
    || evidence.dossier_id !== dossier.dossier_id
    || evidence.dossier_fingerprint !== dossier.fingerprint
    || evidence.gate_id !== snapshot.gate.gate_id
    || evidence.gate_fingerprint !== snapshot.gate.fingerprint
    || evidence.check_catalog_fingerprint !== input.check_catalog.fingerprint
    || evidence.check_catalog_fingerprint !== snapshot.gate.check_catalog_fingerprint
    || evidence.workspace_fingerprint !== state.currentWorkspaceFingerprint
  ) {
    return fail(state, "QUALITY_INTEGRATED_EVIDENCE_BINDING", "integrated verification does not bind the active session state");
  }
  validateIntegratedReceipts(state, evidence, input.check_catalog, dossier, snapshot);
  const stored = recordIntegratedVerificationEvidence(state.store, evidence);
  state.integratedVerificationEvidenceId = stored.evidence_id;
  state.integratedVerificationSequence = stored.trace_event_sequence;
  return deepFrozenClone({
    integrated_verification_sequence: stored.trace_event_sequence,
    integrated_verification_evidence_id: stored.evidence_id,
    integrated_verification_evidence_fingerprint: stored.fingerprint,
  }, "quality integrated verification receipt");
}

export function sessionRecordPostArchitectureEvaluation(session, evaluation) {
  const state = stateFor(session);
  assertUsable(state);
  if (state.lifecycle !== "implementation_enabled") {
    return fail(
      state,
      "QUALITY_POST_ARCHITECTURE_ORDER",
      "post-implementation architecture evaluation requires an enabled implementation session",
    );
  }
  const stored = recordPostArchitectureEvaluation(state.store, evaluation);
  return deepFrozenClone({
    evaluation_id: stored.evaluation_id,
    status: stored.status,
    fingerprint: stored.fingerprint,
  }, "quality post-implementation architecture receipt");
}

export function sessionFinalizeAttestation(session, input) {
  const state = stateFor(session);
  assertUsable(state);
  const keys = [
    "final_workspace_fingerprint",
    "teardown_verified",
    "model_profile_id",
    "model_profile_fingerprint",
    "prompt_profile_id",
    "prompt_profile_fingerprint",
    "runtime_execution_fingerprint",
    "attested_at",
  ];
  exact(input, keys, keys, "quality attestation finalization");
  if (state.gateId === null || state.gateTraceSequence === null) {
    return fail(state, "QUALITY_GATE_TRACE_LINK", "quality attestation requires a linked gate event");
  }
  assertFingerprint(input.final_workspace_fingerprint, "quality attestation finalization.final_workspace_fingerprint");
  assertBoolean(input.teardown_verified, "quality attestation finalization.teardown_verified");
  if (!input.teardown_verified) return fail(state, "QUALITY_TEARDOWN_UNVERIFIED", "adapter process tree teardown was not verified");
  for (const key of ["model_profile_id", "prompt_profile_id"]) assertSafeId(input[key], `quality attestation finalization.${key}`);
  for (const key of ["model_profile_fingerprint", "prompt_profile_fingerprint"]) assertFingerprint(input[key], `quality attestation finalization.${key}`);
  assertFingerprint(input.runtime_execution_fingerprint, "quality attestation finalization.runtime_execution_fingerprint", { nullable: true });
  assertIso(input.attested_at, "quality attestation finalization.attested_at");
  const snapshot = snapshotEngineeringQualityStore(state.store, {
    integrated_verification_evidence_id: state.integratedVerificationEvidenceId,
  });
  if (
    snapshot.architecture_evaluation !== null
    && snapshot.architecture_evaluation.policy_id !== null
  ) {
    if (snapshot.post_architecture_evaluation === null) {
      return fail(
        state,
        "QUALITY_POST_ARCHITECTURE_AUDIT_MISSING",
        "configured architecture policy requires a trusted post-implementation evaluation",
      );
    }
    if (snapshot.post_architecture_evaluation.status === "blocked") {
      return fail(
        state,
        "QUALITY_POST_ARCHITECTURE_AUDIT_BLOCKED",
        "post-implementation architecture evaluation has unavailable evidence",
      );
    }
    if (
      snapshot.post_architecture_evaluation.status === "failed"
      && ["high", "critical"].includes(snapshot.dossier.risk_class)
    ) {
      return fail(
        state,
        "QUALITY_POST_ARCHITECTURE_AUDIT_FAILED",
        "high and critical completion is blocked by a post-implementation architecture violation",
      );
    }
  }
  if (snapshot.gate.status === "passed") {
    const workspaceChanged = input.final_workspace_fingerprint !== state.workspaceAtGateFingerprint;
    if (workspaceChanged && state.firstImplementationSequence === null) {
      return fail(state, "QUALITY_IMPLEMENTATION_EVENT_MISSING", "workspace changed without a trusted implementation event");
    }
    if (state.integratedVerificationSequence === null) {
      return fail(state, "QUALITY_INTEGRATED_VERIFICATION_MISSING", "passed gate requires integrated verification after the final mutation");
    }
    if (input.runtime_execution_fingerprint === null) {
      return fail(state, "QUALITY_RUNTIME_EXECUTION_MISSING", "passed gate requires trusted runtime execution evidence");
    }
    if (
      input.final_workspace_fingerprint !== state.currentWorkspaceFingerprint
      || snapshot.integrated_verification_evidence?.workspace_fingerprint !== input.final_workspace_fingerprint
    ) {
      return fail(state, "QUALITY_INTEGRATED_EVIDENCE_BINDING", "final workspace does not match the verified workspace");
    }
  } else if (
    state.firstImplementationSequence !== null
    || state.lastImplementationActionSequence !== null
    || state.lastWorkspaceMutationSequence !== null
    || state.integratedVerificationSequence !== null
    || input.runtime_execution_fingerprint !== null
  ) {
    return fail(state, "QUALITY_ATTESTATION_BLOCKED_GATE", "blocked gate cannot attest implementation or execution evidence");
  }
  const attestation = createQualityAttestation({
    run_id: state.runId,
    task_id: state.taskId,
    dossier_id: snapshot.dossier.dossier_id,
    dossier_schema_version: snapshot.dossier.schema_version,
    dossier_fingerprint: snapshot.dossier.fingerprint,
    gate_id: snapshot.gate.gate_id,
    gate_status: snapshot.gate.status,
    gate_fingerprint: snapshot.gate.fingerprint,
    gate_trace_sequence: state.gateTraceSequence,
    first_implementation_sequence: state.firstImplementationSequence,
    last_implementation_action_sequence: state.lastImplementationActionSequence,
    last_workspace_mutation_sequence: state.lastWorkspaceMutationSequence,
    integrated_verification_sequence: state.integratedVerificationSequence,
    integrated_verification_evidence_fingerprint: snapshot.integrated_verification_evidence?.fingerprint ?? null,
    runtime_execution_fingerprint: input.runtime_execution_fingerprint,
    workspace_at_gate_fingerprint: state.workspaceAtGateFingerprint,
    final_workspace_fingerprint: input.final_workspace_fingerprint,
    model_profile_id: input.model_profile_id,
    model_profile_fingerprint: input.model_profile_fingerprint,
    prompt_profile_id: input.prompt_profile_id,
    prompt_profile_fingerprint: input.prompt_profile_fingerprint,
    post_architecture_evaluation_fingerprint: snapshot.post_architecture_evaluation?.fingerprint ?? null,
    artifact_refs: [
      { kind: "file", value: "quality/dossier.json" },
      { kind: "file", value: "quality/gate.json" },
      ...(snapshot.preimplementation_evidence === null
        ? []
        : [{ kind: "file", value: "quality/preimplementation-evidence.json" }]),
      ...(snapshot.architecture_evaluation === null
        ? []
        : [{ kind: "file", value: "quality/architecture-evaluation.json" }]),
      ...(snapshot.post_architecture_evaluation === null
        ? []
        : [{ kind: "file", value: "quality/post-architecture-evaluation.json" }]),
      ...(snapshot.integrated_verification_evidence === null
        ? []
        : [{ kind: "file", value: "quality/integrated-verification-evidence.json" }]),
    ],
    teardown_verified: input.teardown_verified,
    attested_at: input.attested_at,
  });
  state.attestation = attestation;
  state.lifecycle = "attested";
  return attestation;
}

export function inspectEngineeringQualitySession(session) {
  const state = stateFor(session);
  return deepFrozenClone({
    run_id: state.runId,
    task_id: state.taskId,
    lifecycle: state.lifecycle,
    failure: state.failure,
    dossier_id: state.dossierId,
    gate_id: state.gateId,
    gate_trace_sequence: state.gateTraceSequence,
    first_implementation_sequence: state.firstImplementationSequence,
    last_implementation_action_sequence: state.lastImplementationActionSequence,
    last_workspace_mutation_sequence: state.lastWorkspaceMutationSequence,
    integrated_verification_sequence: state.integratedVerificationSequence,
    integrated_verification_evidence_id: state.integratedVerificationEvidenceId,
    workspace_at_gate_fingerprint: state.workspaceAtGateFingerprint,
    current_workspace_fingerprint: state.currentWorkspaceFingerprint,
    attestation_fingerprint: state.attestation?.fingerprint ?? null,
  }, "quality session inspection");
}

export function snapshotEngineeringQualitySession(session) {
  const state = stateFor(session);
  if (state.lifecycle !== "attested" || state.attestation === null) {
    throw new ContractError("QUALITY_SESSION_INCOMPLETE", "quality session must be attested before publication");
  }
  return deepFrozenClone({
    store: snapshotEngineeringQualityStore(state.store, {
      integrated_verification_evidence_id: state.integratedVerificationEvidenceId,
    }),
    attestation: state.attestation,
    lifecycle: state.lifecycle,
  }, "quality session snapshot");
}
