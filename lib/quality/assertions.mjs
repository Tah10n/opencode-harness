import { assertEnum, assertSafeId } from "../feedback/contracts.mjs";
import { validateQualityAttestation } from "./attestation.mjs";
import { validateArchitectureEvaluation } from "./architecture.mjs";
import { validateEngineeringDossier } from "./dossier.mjs";
import { validateEngineeringGateDecision } from "./gate.mjs";
import { validateEngineeringImpactGraph } from "./impact-graph.mjs";
import { validateIntegratedVerificationEvidence } from "./verification-evidence.mjs";
import { deepFrozenClone, exact } from "./validation.mjs";

export const ENGINEERING_QUALITY_ASSERTION_OPERATIONS = Object.freeze([
  "dossier_before_implementation",
  "gate_before_implementation",
  "affected_system_coverage_recorded",
  "no_blocking_unknowns",
  "verification_mapping_complete",
  "architecture_respected",
  "implementation_within_ownership",
  "integrated_verification_after_mutation",
  "valid_completion",
]);

export function validateEngineeringQualityAssertion(value) {
  exact(value, ["assertion_id", "op"], ["assertion_id", "op"], "engineering quality assertion");
  assertSafeId(value.assertion_id, "engineering quality assertion.assertion_id");
  assertEnum(value.op, ENGINEERING_QUALITY_ASSERTION_OPERATIONS, "engineering quality assertion.op");
  return value;
}

function result(assertion, passed, reasonCode) {
  return deepFrozenClone({
    assertion_id: assertion.assertion_id,
    status: passed ? "passed" : "failed",
    reason_code: passed ? null : reasonCode,
  }, "engineering quality assertion result");
}

function writePaths(trace) {
  return trace.events
    .filter((event) => event.event_type === "edit")
    .flatMap((event) => (event.files_written ?? []).map((entry) => entry.path));
}

function insideOwnership(path, ownershipPaths) {
  return ownershipPaths.some((scope) => path === scope || path.startsWith(`${scope}/`));
}

function mappingVerified(mapping, evidence) {
  if (mapping.classification === "not_applicable") return true;
  if (mapping.classification === "applicable_blocked_unverified" || evidence === null) return false;
  const checkIds = new Set(evidence.check_receipts.filter((entry) => entry.status === "passed").map((entry) => entry.check_id));
  const mechanismIds = new Set(
    evidence.mechanism_receipts.filter((entry) => entry.status === "passed").map((entry) => entry.mechanism_id),
  );
  return mapping.check_ids.every((id) => checkIds.has(id))
    && mapping.mechanism_ids.every((id) => mechanismIds.has(id));
}

function mappingsComplete(dossier, integratedEvidence) {
  return [...dossier.invariants, ...dossier.edge_cases, ...dossier.failure_modes]
    .every((entry) => mappingVerified(entry.mapping, integratedEvidence));
}

function architectureRespected(evidence) {
  const configured = evidence.dossier.architecture_assessment.status !== "not_configured";
  if (!configured) {
    return evidence.architecture_evaluation === null
      && evidence.attestation.post_architecture_evaluation_fingerprint === null;
  }
  const evaluation = evidence.architecture_evaluation;
  const graph = evidence.dossier.impact_graph;
  return evaluation !== null
    && graph !== null
    && evaluation.status === "passed"
    && evaluation.fingerprint === evidence.attestation.post_architecture_evaluation_fingerprint
    && evaluation.policy_id === evidence.dossier.architecture_assessment.policy_id
    && evaluation.baseline_graph_id === graph.graph_id
    && evaluation.baseline_graph_fingerprint === graph.fingerprint;
}

function validTerminal(trace) {
  if (!trace.complete || !trace.outcome || !trace.verification) return false;
  if (trace.events.at(-1)?.event_type !== "task_end") return false;
  if (trace.verification.status !== "passed") return false;
  return ["done", "verified"].includes(trace.outcome.termination_reason)
    && ["completed", "changed", "no-op", "no-findings"].includes(trace.outcome.status);
}

export function evaluateEngineeringQualityAssertions(assertions, evidence) {
  if (!Array.isArray(assertions)) throw new TypeError("assertions must be an array");
  exact(evidence, ["dossier", "gate", "attestation", "architecture_evaluation", "integrated_verification_evidence", "trace"], [
    "dossier",
    "gate",
    "attestation",
    "architecture_evaluation",
    "integrated_verification_evidence",
    "trace",
  ], "engineering quality assertion evidence");
  validateEngineeringDossier(evidence.dossier, { requireFinalized: true });
  validateEngineeringGateDecision(evidence.gate);
  validateQualityAttestation(evidence.attestation);
  if (evidence.dossier.impact_graph !== null) validateEngineeringImpactGraph(evidence.dossier.impact_graph);
  if (evidence.architecture_evaluation !== null) validateArchitectureEvaluation(evidence.architecture_evaluation);
  if (evidence.integrated_verification_evidence !== null) {
    validateIntegratedVerificationEvidence(evidence.integrated_verification_evidence);
  }
  const integratedEvidenceBound = evidence.integrated_verification_evidence !== null
    && evidence.integrated_verification_evidence.run_id === evidence.attestation.run_id
    && evidence.integrated_verification_evidence.task_id === evidence.attestation.task_id
    && evidence.integrated_verification_evidence.dossier_id === evidence.dossier.dossier_id
    && evidence.integrated_verification_evidence.dossier_fingerprint === evidence.dossier.fingerprint
    && evidence.integrated_verification_evidence.gate_id === evidence.gate.gate_id
    && evidence.integrated_verification_evidence.gate_fingerprint === evidence.gate.fingerprint
    && evidence.integrated_verification_evidence.fingerprint
      === evidence.attestation.integrated_verification_evidence_fingerprint;
  const activeIntegratedEvidence = integratedEvidenceBound ? evidence.integrated_verification_evidence : null;
  const trace = evidence.trace;
  const implementationSequence = evidence.attestation.first_implementation_sequence;
  const integrationSequence = evidence.attestation.integrated_verification_sequence;
  const ownershipPaths = evidence.dossier.verification_boundary.ownership_paths;
  const paths = writePaths(trace);

  return assertions.map((assertion) => {
    validateEngineeringQualityAssertion(assertion);
    if (assertion.op === "dossier_before_implementation") {
      const passed = evidence.gate.dossier_fingerprint === evidence.dossier.fingerprint
        && evidence.attestation.dossier_fingerprint === evidence.dossier.fingerprint
        && (implementationSequence === null || evidence.attestation.gate_trace_sequence < implementationSequence);
      return result(assertion, passed, "QUALITY_ASSERT_DOSSIER_ORDER");
    }
    if (assertion.op === "gate_before_implementation") {
      const passed = evidence.gate.status === "passed"
        && evidence.attestation.gate_fingerprint === evidence.gate.fingerprint
        && (implementationSequence === null || evidence.attestation.gate_trace_sequence < implementationSequence);
      return result(assertion, passed, "QUALITY_ASSERT_GATE_ORDER");
    }
    if (assertion.op === "affected_system_coverage_recorded") {
      const graphComplete = evidence.dossier.risk_class === "standard-lite"
        ? evidence.dossier.affected_areas.length > 0
        : evidence.dossier.impact_graph?.coverage.completeness === "complete";
      return result(assertion, graphComplete, "QUALITY_ASSERT_AFFECTED_COVERAGE");
    }
    if (assertion.op === "no_blocking_unknowns") {
      const passed = evidence.dossier.unknowns.every((entry) => !entry.blocking)
        && (evidence.dossier.impact_graph?.unknowns.every((entry) => !entry.blocking) ?? true);
      return result(assertion, passed, "QUALITY_ASSERT_UNKNOWN");
    }
    if (assertion.op === "verification_mapping_complete") {
      return result(
        assertion,
        mappingsComplete(evidence.dossier, activeIntegratedEvidence),
        "QUALITY_ASSERT_MAPPING",
      );
    }
    if (assertion.op === "architecture_respected") {
      return result(assertion, architectureRespected(evidence), "QUALITY_ASSERT_ARCHITECTURE");
    }
    if (assertion.op === "implementation_within_ownership") {
      const passed = paths.every((entry) => insideOwnership(entry, ownershipPaths));
      return result(assertion, passed, "QUALITY_ASSERT_OWNERSHIP");
    }
    if (assertion.op === "integrated_verification_after_mutation") {
      const passed = integrationSequence !== null
        && integrationSequence > (
          evidence.attestation.last_implementation_action_sequence ?? evidence.attestation.gate_trace_sequence
        )
        && activeIntegratedEvidence?.trace_event_sequence === integrationSequence
        && activeIntegratedEvidence?.fingerprint
          === evidence.attestation.integrated_verification_evidence_fingerprint;
      return result(assertion, passed, "QUALITY_ASSERT_INTEGRATION_ORDER");
    }
    return result(assertion, validTerminal(trace), "QUALITY_ASSERT_COMPLETION");
  });
}
