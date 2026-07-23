import { assertEnum } from "../feedback/contracts.mjs";
import { validateEngineeringImpactGraph } from "./impact-graph.mjs";
import {
  ADVANCED_CONTEXT_TOOLS,
  CONTEXT_DEEP_DIMENSIONS,
  CONTEXT_QUESTION_KEYS,
  CONTEXT_WIDE_CATEGORIES,
  MINIMAL_CONTEXT_TOOLS,
  validateContextStrategyBinding,
} from "./context-strategies.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertFingerprint,
  assertInteger,
  assertIso,
  assertPlain,
  assertStableTypedId,
  assertString,
  assertStringArray,
  assertUniqueIds,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const WHOLE_SYSTEM_CONTEXT_REPORT_SCHEMA_VERSION = 1;
export const CONTEXT_REPORT_STATUSES = Object.freeze(["draft", "finalized"]);

const CONTENT_KEYS = Object.freeze([
  "wide_analysis",
  "claims",
  "deep_analyses",
  "questions",
  "task_evidence",
  "tool_state",
  "budget_state",
]);
const REPORT_KEYS = Object.freeze([
  "schema_version", "report_id", "session_key", "run_id", "task_id", "risk_class", "strategy_id",
  "strategy_binding_fingerprint", "workspace_fingerprint", "dossier_id", "dossier_analysis_fingerprint",
  "impact_graph_id", "impact_graph_fingerprint", "status", "revision", ...CONTENT_KEYS, "receipt_ids",
  "created_at", "updated_at", "finalized_at", "fingerprint",
]);
const ALL_CONTEXT_TOOLS = Object.freeze([...MINIMAL_CONTEXT_TOOLS, ...ADVANCED_CONTEXT_TOOLS]);
const GENERIC_UNSUPPORTED_STATEMENTS = new Set([
  "no issues found",
  "all callers checked",
  "edge cases considered",
  "architecture looks fine",
]);

function assertSafeAnalyticalStatement(value, label, options = {}) {
  assertString(value, label, options);
  const normalized = value.trim().toLowerCase().replace(/[.!?]+$/u, "");
  if (GENERIC_UNSUPPORTED_STATEMENTS.has(normalized)) {
    throw new ContractError("CONTEXT_GENERIC_CLAIM", `${label} is not falsifiable or evidence-specific`);
  }
}

function stringArray(value, label, options = {}) {
  return assertStringArray(value, label, { max: 256, maxBytes: 512, ...options });
}

function validateWide(value, label) {
  assertPlain(value, label);
  const keys = ["id", "category", "classification", "claim_ids", "subject_ids", "receipt_ids", "rationale"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "WIDE", `${label}.id`);
  assertEnum(value.category, CONTEXT_WIDE_CATEGORIES, `${label}.category`);
  assertEnum(value.classification, ["represented", "reasoned_excluded"], `${label}.classification`);
  stringArray(value.claim_ids, `${label}.claim_ids`, { min: 1 });
  stringArray(value.subject_ids, `${label}.subject_ids`);
  stringArray(value.receipt_ids, `${label}.receipt_ids`, { min: 1 });
  assertString(value.rationale, `${label}.rationale`, { nullable: true, maxBytes: 2000 });
  if ((value.classification === "reasoned_excluded") !== (value.rationale !== null)) {
    throw new ContractError("CONTEXT_WIDE_EXCLUSION_REASON", `${label} reasoned exclusion requires a rationale and represented evidence forbids one`);
  }
}

function validateClaim(value, label) {
  assertPlain(value, label);
  const keys = ["id", "kind", "statement", "subject_ids", "receipt_ids"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "CLAIM", `${label}.id`);
  assertEnum(value.kind, ["observed", "inferred", "unresolved_hypothesis", "reasoned_exclusion"], `${label}.kind`);
  assertSafeAnalyticalStatement(value.statement, `${label}.statement`, { maxBytes: 2000 });
  stringArray(value.subject_ids, `${label}.subject_ids`, { min: 1 });
  stringArray(value.receipt_ids, `${label}.receipt_ids`, { min: value.kind === "inferred" ? 0 : 1 });
}

function validateDimension(value, label) {
  assertPlain(value, label);
  const keys = ["dimension", "classification", "analysis", "not_applicable_reason", "receipt_ids", "verification_ids"];
  exact(value, keys, keys, label);
  assertEnum(value.dimension, CONTEXT_DEEP_DIMENSIONS, `${label}.dimension`);
  assertEnum(value.classification, ["applicable", "not_applicable"], `${label}.classification`);
  assertString(value.analysis, `${label}.analysis`, { nullable: true, maxBytes: 4000 });
  assertString(value.not_applicable_reason, `${label}.not_applicable_reason`, { nullable: true, maxBytes: 2000 });
  stringArray(value.receipt_ids, `${label}.receipt_ids`, { min: 1 });
  stringArray(value.verification_ids, `${label}.verification_ids`);
  if (value.classification === "applicable") {
    if (value.analysis === null || value.not_applicable_reason !== null) {
      throw new ContractError("CONTEXT_DEEP_DIMENSION_UNCLASSIFIED", `${label} applicable dimension requires analysis only`);
    }
  } else if (value.analysis !== null || value.not_applicable_reason === null) {
    throw new ContractError("CONTEXT_DEEP_NOT_APPLICABLE_REASON", `${label} not-applicable dimension requires a specific reason only`);
  }
}

function validateDeep(value, label) {
  assertPlain(value, label);
  const keys = [
    "id", "impact_path_id", "node_ids", "edge_ids", "symbol_ids", "inputs", "outputs", "dimensions",
    "falsification_question_id", "invariant_ids", "edge_case_ids", "failure_mode_ids", "test_obligation_ids",
    "unresolved_question_ids", "receipt_ids",
  ];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "DEEP", `${label}.id`);
  assertStableTypedId(value.impact_path_id, "BLAST", `${label}.impact_path_id`);
  stringArray(value.node_ids, `${label}.node_ids`, { min: 1 });
  stringArray(value.edge_ids, `${label}.edge_ids`);
  stringArray(value.symbol_ids, `${label}.symbol_ids`);
  stringArray(value.inputs, `${label}.inputs`, { min: 1, maxBytes: 2000 });
  stringArray(value.outputs, `${label}.outputs`, { min: 1, maxBytes: 2000 });
  assertArray(value.dimensions, `${label}.dimensions`, { max: CONTEXT_DEEP_DIMENSIONS.length, item: validateDimension });
  if (new Set(value.dimensions.map((entry) => entry.dimension)).size !== value.dimensions.length) {
    throw new ContractError("CONTEXT_DEEP_DIMENSION_DUPLICATE", `${label} contains duplicate dimensions`);
  }
  assertStableTypedId(value.falsification_question_id, "QUESTION", `${label}.falsification_question_id`);
  for (const key of ["invariant_ids", "edge_case_ids", "failure_mode_ids", "test_obligation_ids", "unresolved_question_ids", "receipt_ids"]) {
    stringArray(value[key], `${label}.${key}`, { min: key === "receipt_ids" ? 1 : 0 });
  }
}

function validateQuestion(value, label) {
  assertPlain(value, label);
  const keys = ["id", "question_key", "statement", "expected_observation", "actual_observation", "status", "receipt_ids", "impact_if_wrong", "next_action", "applied_update_ids", "applied_update_fingerprint"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.id, "QUESTION", `${label}.id`);
  assertEnum(value.question_key, CONTEXT_QUESTION_KEYS, `${label}.question_key`);
  assertSafeAnalyticalStatement(value.statement, `${label}.statement`, { maxBytes: 2000 });
  assertSafeAnalyticalStatement(value.expected_observation, `${label}.expected_observation`, { maxBytes: 2000 });
  assertString(value.actual_observation, `${label}.actual_observation`, { nullable: true, maxBytes: 2000 });
  assertEnum(value.status, ["confirmed", "refuted", "uncertain", "not_applicable"], `${label}.status`);
  stringArray(value.receipt_ids, `${label}.receipt_ids`, { min: value.status === "not_applicable" ? 0 : 1 });
  assertEnum(value.impact_if_wrong, ["low", "material", "high"], `${label}.impact_if_wrong`);
  assertString(value.next_action, `${label}.next_action`, { nullable: true, maxBytes: 2000 });
  stringArray(value.applied_update_ids, `${label}.applied_update_ids`);
  if (value.applied_update_fingerprint !== null) assertFingerprint(value.applied_update_fingerprint, `${label}.applied_update_fingerprint`);
  if ((value.applied_update_ids.length === 0) !== (value.applied_update_fingerprint === null)) {
    throw new ContractError("CONTEXT_HYPOTHESIS_UPDATE_UNBOUND", `${label} applied updates require a runner-owned causal fingerprint`);
  }
  if (value.status === "uncertain" && value.next_action === null) {
    throw new ContractError("CONTEXT_HYPOTHESIS_NEXT_ACTION", `${label} uncertain question requires a next action`);
  }
  if (["confirmed", "refuted"].includes(value.status) && value.actual_observation === null) {
    throw new ContractError("CONTEXT_HYPOTHESIS_OBSERVATION", `${label} resolved question requires an actual observation`);
  }
}

function validateTaskEvidence(value, label) {
  assertPlain(value, label);
  const keys = [
    "owning_abstraction_claim_id", "sibling_variant_question_ids", "characterization_test_ids",
    "negative_path_ids", "compatibility_ids", "reproduction_status", "reproduction_evidence_ids",
  ];
  exact(value, keys, keys, label);
  if (value.owning_abstraction_claim_id !== null) assertStableTypedId(value.owning_abstraction_claim_id, "CLAIM", `${label}.owning_abstraction_claim_id`);
  for (const key of keys.filter((entry) => entry.endsWith("_ids"))) stringArray(value[key], `${label}.${key}`);
  assertEnum(value.reproduction_status, ["not_required", "reproduced", "unavailable_nonmaterial", "unavailable_material"], `${label}.reproduction_status`);
  if (value.reproduction_status === "reproduced" && value.reproduction_evidence_ids.length === 0) {
    throw new ContractError("CONTEXT_REPRODUCTION_EVIDENCE_MISSING", `${label} reproduced status requires evidence IDs`);
  }
}

function validateToolState(value, label) {
  assertPlain(value, label);
  const keys = [
    "minimal_available", "advanced_available", "advanced_unavailable", "unsupported_schema_tools", "fallback_used",
    "reduced_semantic_coverage", "semantic_completeness_claimed", "unresolved_truncation_receipt_ids",
  ];
  exact(value, keys, keys, label);
  for (const key of ["minimal_available", "advanced_available", "advanced_unavailable", "unsupported_schema_tools"]) {
    stringArray(value[key], `${label}.${key}`);
    for (const tool of value[key]) assertEnum(tool, ALL_CONTEXT_TOOLS, `${label}.${key} item`);
  }
  const advancedStates = [...value.advanced_available, ...value.advanced_unavailable];
  if (new Set(advancedStates).size !== advancedStates.length) {
    throw new ContractError("CONTEXT_TOOL_STATE_CONFLICT", `${label} marks an advanced tool both available and unavailable`);
  }
  for (const key of ["fallback_used", "reduced_semantic_coverage", "semantic_completeness_claimed"]) assertBoolean(value[key], `${label}.${key}`);
  stringArray(value.unresolved_truncation_receipt_ids, `${label}.unresolved_truncation_receipt_ids`);
  if (value.fallback_used && !value.reduced_semantic_coverage) {
    throw new ContractError("CONTEXT_FALLBACK_COVERAGE_CLAIM", `${label} fallback must record reduced semantic coverage`);
  }
}

function validateBudgetState(value, label) {
  assertPlain(value, label);
  const keys = ["context_calls_used", "context_calls_max", "read_only_subagents_used", "read_only_subagents_max", "exhausted", "unresolved_area"];
  exact(value, keys, keys, label);
  assertInteger(value.context_calls_used, `${label}.context_calls_used`, { min: 0, max: 512 });
  assertInteger(value.context_calls_max, `${label}.context_calls_max`, { min: 1, max: 512 });
  assertInteger(value.read_only_subagents_used, `${label}.read_only_subagents_used`, { min: 0, max: 16 });
  assertInteger(value.read_only_subagents_max, `${label}.read_only_subagents_max`, { min: 0, max: 16 });
  assertBoolean(value.exhausted, `${label}.exhausted`);
  assertString(value.unresolved_area, `${label}.unresolved_area`, { nullable: true, maxBytes: 2000 });
  if (value.context_calls_used > value.context_calls_max || value.read_only_subagents_used > value.read_only_subagents_max) {
    throw new ContractError("CONTEXT_BUDGET_EXCEEDED", `${label} usage exceeds the selected strategy bound`);
  }
  if (value.exhausted !== (value.unresolved_area !== null)) {
    throw new ContractError("CONTEXT_BUDGET_STATE", `${label} exhaustion must identify an unresolved area`);
  }
}

function fingerprintInput(report) {
  const copy = JSON.parse(canonicalJson(report));
  delete copy.fingerprint;
  return copy;
}

export function engineeringDossierAnalysisFingerprint(dossier) {
  const copy = JSON.parse(canonicalJson(dossier));
  for (const key of ["revision", "status", "architecture_assessment", "plan_challenge", "gate_state", "updated_at", "finalized_at", "fingerprint"]) delete copy[key];
  return fingerprint(copy);
}

export function wholeSystemContextReportAnalysisFingerprint(report) {
  if (report === null) return fingerprint({ mode: "not_applicable" });
  const copy = JSON.parse(canonicalJson(report));
  for (const key of [
    "schema_version", "report_id", "session_key", "run_id", "task_id", "risk_class", "strategy_id",
    "strategy_binding_fingerprint", "workspace_fingerprint", "dossier_id", "dossier_analysis_fingerprint",
    "impact_graph_id", "impact_graph_fingerprint", "status", "revision", "created_at", "updated_at",
    "finalized_at", "fingerprint",
  ]) delete copy[key];
  return fingerprint(copy);
}

function validateCrossReferences(report, { dossier = null, impactGraph = null } = {}) {
  const claimById = new Map(report.claims.map((entry) => [entry.id, entry]));
  const claims = new Set(claimById.keys());
  const questions = new Set(report.questions.map((entry) => entry.id));
  for (const entry of report.wide_analysis) {
    for (const claimId of entry.claim_ids) if (!claims.has(claimId)) throw new ContractError("CONTEXT_CLAIM_DANGLING", `${entry.id} references unknown claim ${claimId}`);
  }
  for (const entry of report.deep_analyses) {
    if (!questions.has(entry.falsification_question_id)) throw new ContractError("CONTEXT_QUESTION_DANGLING", `${entry.id} references unknown falsification question`);
    for (const questionId of entry.unresolved_question_ids) if (!questions.has(questionId)) throw new ContractError("CONTEXT_QUESTION_DANGLING", `${entry.id} references unknown unresolved question ${questionId}`);
  }
  const applicableUpdateIds = new Set([
    ...report.wide_analysis.flatMap((entry) => [entry.id, ...entry.subject_ids]),
    ...report.claims.flatMap((entry) => [entry.id, ...entry.subject_ids]),
    ...report.deep_analyses.flatMap((entry) => [
      entry.id,
      entry.impact_path_id,
      ...entry.node_ids,
      ...entry.edge_ids,
      ...entry.invariant_ids,
      ...entry.edge_case_ids,
      ...entry.failure_mode_ids,
      ...entry.test_obligation_ids,
    ]),
    ...report.task_evidence.characterization_test_ids,
    ...report.task_evidence.negative_path_ids,
    ...report.task_evidence.compatibility_ids,
    ...report.task_evidence.reproduction_evidence_ids,
  ]);
  for (const question of report.questions) {
    for (const updateId of question.applied_update_ids) {
      if (!applicableUpdateIds.has(updateId)) {
        throw new ContractError("CONTEXT_HYPOTHESIS_UPDATE_DANGLING", `${question.id} references unknown applied update ${updateId}`);
      }
    }
    if (question.status === "refuted" && question.applied_update_ids.length > 0) {
      const linkedDeep = report.deep_analyses.filter((entry) => entry.falsification_question_id === question.id);
      const linkedUpdateIds = new Set(linkedDeep.flatMap((entry) => [
        entry.id,
        entry.impact_path_id,
        ...entry.invariant_ids,
        ...entry.edge_case_ids,
        ...entry.failure_mode_ids,
        ...entry.test_obligation_ids,
      ]));
      if (linkedDeep.length === 0
        || !question.applied_update_ids.some((id) => linkedDeep.some((entry) => entry.id === id))
        || question.applied_update_ids.some((id) => !linkedUpdateIds.has(id))) {
        throw new ContractError("CONTEXT_HYPOTHESIS_UPDATE_UNBOUND", `${question.id} refutation must bind the affected deep analysis and its mapped plan items`);
      }
    }
  }
  if (report.task_evidence.owning_abstraction_claim_id !== null && !claims.has(report.task_evidence.owning_abstraction_claim_id)) {
    throw new ContractError("CONTEXT_CLAIM_DANGLING", "owning abstraction references an unknown claim");
  }
  if (report.task_evidence.owning_abstraction_claim_id !== null) {
    const owningClaim = claimById.get(report.task_evidence.owning_abstraction_claim_id);
    if (owningClaim.kind === "inferred" || owningClaim.receipt_ids.length === 0) {
      throw new ContractError("CONTEXT_OWNING_ABSTRACTION_EVIDENCE", "owning abstraction must reference a non-inferred machine-evidenced claim");
    }
  }
  for (const questionId of report.task_evidence.sibling_variant_question_ids) {
    if (!questions.has(questionId)) throw new ContractError("CONTEXT_QUESTION_DANGLING", `sibling discovery references unknown question ${questionId}`);
  }
  if (impactGraph !== null) {
    validateEngineeringImpactGraph(impactGraph);
    if (report.impact_graph_id !== impactGraph.graph_id || !fingerprintsEqual(report.impact_graph_fingerprint, impactGraph.fingerprint)) {
      throw new ContractError("CONTEXT_GRAPH_BINDING_INVALID", "context report does not bind the supplied impact graph");
    }
    const paths = new Map(impactGraph.affected_paths.map((entry) => [entry.id, entry]));
    const graphSubjectIds = new Set([
      ...impactGraph.nodes.map((entry) => entry.id),
      ...impactGraph.edges.map((entry) => entry.id),
      ...impactGraph.affected_paths.map((entry) => entry.id),
      ...impactGraph.excluded_siblings.map((entry) => entry.id),
      ...impactGraph.unknowns.map((entry) => entry.id),
    ]);
    for (const claim of report.claims) {
      for (const subjectId of claim.subject_ids) {
        if (!graphSubjectIds.has(subjectId)) throw new ContractError("CONTEXT_GRAPH_SUBJECT_INVALID", `${claim.id} references unknown impact subject ${subjectId}`);
      }
    }
    for (const wide of report.wide_analysis) {
      for (const subjectId of wide.subject_ids) {
        if (!graphSubjectIds.has(subjectId)) throw new ContractError("CONTEXT_GRAPH_SUBJECT_INVALID", `${wide.id} references unknown impact subject ${subjectId}`);
      }
    }
    for (const deep of report.deep_analyses) {
      const path = paths.get(deep.impact_path_id);
      if (!path) throw new ContractError("CONTEXT_GRAPH_PATH_MISMATCH", `${deep.id} references unknown impact path`);
      if (canonicalJson(deep.node_ids) !== canonicalJson(path.node_ids) || canonicalJson(deep.edge_ids) !== canonicalJson(path.edge_ids)) {
        throw new ContractError("CONTEXT_GRAPH_PATH_MISMATCH", `${deep.id} duplicates a path differently from the impact graph`);
      }
    }
  }
  if (dossier !== null) {
    if (report.dossier_id !== dossier.dossier_id || !fingerprintsEqual(report.dossier_analysis_fingerprint, engineeringDossierAnalysisFingerprint(dossier))) {
      throw new ContractError("CONTEXT_DOSSIER_BINDING_INVALID", "context report does not bind the supplied dossier");
    }
    const dossierIds = new Set([
      ...dossier.invariants.map((entry) => entry.id),
      ...dossier.edge_cases.map((entry) => entry.id),
      ...dossier.failure_modes.map((entry) => entry.id),
      ...dossier.test_obligations.map((entry) => entry.id),
    ]);
    for (const deep of report.deep_analyses) {
      for (const id of [...deep.invariant_ids, ...deep.edge_case_ids, ...deep.failure_mode_ids, ...deep.test_obligation_ids]) {
        if (!dossierIds.has(id)) throw new ContractError("CONTEXT_DOSSIER_REFERENCE_INVALID", `${deep.id} references unknown dossier item ${id}`);
      }
    }
    const testObligationIds = new Set(dossier.test_obligations.map((entry) => entry.id));
    const verificationIds = new Set([
      ...dossier.test_obligations.flatMap((entry) => [entry.id, entry.check_id]),
      ...dossier.specialized_checks.map((entry) => entry.id),
      ...Object.values(dossier.verification_plan).flatMap((entry) => Array.isArray(entry) ? entry : []),
    ]);
    for (const deep of report.deep_analyses) {
      for (const dimension of deep.dimensions) {
        if (dimension.classification === "applicable" && dimension.verification_ids.length === 0) {
          throw new ContractError("CONTEXT_VERIFICATION_MAPPING_MISSING", `${deep.id}/${dimension.dimension} lacks a concrete verification mapping`);
        }
        for (const verificationId of dimension.verification_ids) {
          if (!verificationIds.has(verificationId)) {
            throw new ContractError("CONTEXT_DOSSIER_REFERENCE_INVALID", `${deep.id}/${dimension.dimension} references unknown verification ${verificationId}`);
          }
        }
      }
    }
    const negativePathIds = new Set([
      ...dossier.edge_cases.map((entry) => entry.id),
      ...dossier.failure_modes.map((entry) => entry.id),
      ...(dossier.impact_graph?.affected_paths ?? []).map((entry) => entry.id),
    ]);
    const compatibilityIds = new Set([
      ...dossier.invariants.map((entry) => entry.id),
      ...dossier.public_contracts.map((entry) => entry.id),
    ]);
    for (const id of report.task_evidence.characterization_test_ids) {
      if (!testObligationIds.has(id)) throw new ContractError("CONTEXT_TASK_EVIDENCE_INVALID", `characterization references unknown test obligation ${id}`);
    }
    for (const id of report.task_evidence.negative_path_ids) {
      if (!negativePathIds.has(id)) throw new ContractError("CONTEXT_TASK_EVIDENCE_INVALID", `negative-path evidence references unknown dossier or impact item ${id}`);
    }
    for (const id of report.task_evidence.compatibility_ids) {
      if (!compatibilityIds.has(id)) throw new ContractError("CONTEXT_TASK_EVIDENCE_INVALID", `compatibility evidence references unknown invariant or public contract ${id}`);
    }
    const reproductionIds = new Set([...testObligationIds, ...questions, ...report.receipt_ids]);
    for (const id of report.task_evidence.reproduction_evidence_ids) {
      if (!reproductionIds.has(id)) throw new ContractError("CONTEXT_TASK_EVIDENCE_INVALID", `reproduction evidence references unknown test, question, or receipt ${id}`);
    }
  }
}

export function validateWholeSystemContextReport(value, options = {}) {
  assertPlain(value, "whole-system context report");
  exact(value, REPORT_KEYS, REPORT_KEYS, "whole-system context report");
  if (value.schema_version !== WHOLE_SYSTEM_CONTEXT_REPORT_SCHEMA_VERSION) throw new ContractError("CONTEXT_REPORT_SCHEMA", "whole-system context report schema is unsupported");
  assertStableTypedId(value.report_id, "CONTEXT", "whole-system context report.report_id");
  for (const key of ["session_key", "run_id", "task_id", "dossier_id"]) assertString(value[key], `whole-system context report.${key}`, { maxBytes: 256 });
  assertEnum(value.risk_class, ["high", "critical"], "whole-system context report.risk_class");
  assertEnum(value.strategy_id, ["high-wide-deep-v1", "critical-wide-deep-v1"], "whole-system context report.strategy_id");
  for (const key of ["strategy_binding_fingerprint", "workspace_fingerprint", "dossier_analysis_fingerprint", "impact_graph_fingerprint", "fingerprint"]) assertFingerprint(value[key], `whole-system context report.${key}`);
  assertStableTypedId(value.impact_graph_id, "GRAPH", "whole-system context report.impact_graph_id");
  assertEnum(value.status, CONTEXT_REPORT_STATUSES, "whole-system context report.status");
  assertInteger(value.revision, "whole-system context report.revision", { min: 1 });
  assertArray(value.wide_analysis, "whole-system context report.wide_analysis", { max: CONTEXT_WIDE_CATEGORIES.length, item: validateWide });
  assertArray(value.claims, "whole-system context report.claims", { max: 256, item: validateClaim });
  assertArray(value.deep_analyses, "whole-system context report.deep_analyses", { max: 128, item: validateDeep });
  assertArray(value.questions, "whole-system context report.questions", { max: 128, item: validateQuestion });
  for (const [items, label] of [[value.wide_analysis, "wide analysis"], [value.claims, "claims"], [value.deep_analyses, "deep analyses"], [value.questions, "questions"]]) assertUniqueIds(items, label);
  if (new Set(value.wide_analysis.map((entry) => entry.category)).size !== value.wide_analysis.length) throw new ContractError("CONTEXT_WIDE_CATEGORY_DUPLICATE", "wide analysis contains a duplicate category");
  if (new Set(value.deep_analyses.map((entry) => entry.impact_path_id)).size !== value.deep_analyses.length) throw new ContractError("CONTEXT_DEEP_PATH_DUPLICATE", "critical impact path has multiple deep analyses");
  validateTaskEvidence(value.task_evidence, "whole-system context report.task_evidence");
  validateToolState(value.tool_state, "whole-system context report.tool_state");
  validateBudgetState(value.budget_state, "whole-system context report.budget_state");
  stringArray(value.receipt_ids, "whole-system context report.receipt_ids");
  for (const item of [...value.wide_analysis, ...value.claims, ...value.deep_analyses, ...value.questions]) {
    for (const receiptId of item.receipt_ids) if (!value.receipt_ids.includes(receiptId)) throw new ContractError("CONTEXT_RECEIPT_DANGLING", `${item.id} references unbound receipt ${receiptId}`);
  }
  for (const deep of value.deep_analyses) for (const dimension of deep.dimensions) {
    for (const receiptId of dimension.receipt_ids) if (!value.receipt_ids.includes(receiptId)) throw new ContractError("CONTEXT_RECEIPT_DANGLING", `${deep.id} dimension references unbound receipt ${receiptId}`);
  }
  assertIso(value.created_at, "whole-system context report.created_at");
  assertIso(value.updated_at, "whole-system context report.updated_at");
  if (value.finalized_at !== null) assertIso(value.finalized_at, "whole-system context report.finalized_at");
  if ((value.status === "finalized") !== (value.finalized_at !== null)) throw new ContractError("CONTEXT_REPORT_FINALIZATION", "context report status and finalized_at disagree");
  validateCrossReferences(value, options);
  const expected = fingerprint(fingerprintInput(value));
  if (!fingerprintsEqual(value.fingerprint, expected)) throw new ContractError("CONTEXT_REPORT_FINGERPRINT", "whole-system context report fingerprint is invalid");
  return value;
}

function emptyContent(strategyBinding) {
  return {
    wide_analysis: [],
    claims: [],
    deep_analyses: [],
    questions: [],
    task_evidence: {
      owning_abstraction_claim_id: null,
      sibling_variant_question_ids: [],
      characterization_test_ids: [],
      negative_path_ids: [],
      compatibility_ids: [],
      reproduction_status: strategyBinding.requires_pre_change_reproduction ? "unavailable_material" : "not_required",
      reproduction_evidence_ids: [],
    },
    tool_state: {
      minimal_available: [],
      advanced_available: [],
      advanced_unavailable: [...ADVANCED_CONTEXT_TOOLS],
      unsupported_schema_tools: [],
      fallback_used: true,
      reduced_semantic_coverage: true,
      semantic_completeness_claimed: false,
      unresolved_truncation_receipt_ids: [],
    },
    budget_state: {
      context_calls_used: 0,
      context_calls_max: strategyBinding.budgets.max_context_calls,
      read_only_subagents_used: 0,
      read_only_subagents_max: strategyBinding.budgets.max_read_only_subagents,
      exhausted: false,
      unresolved_area: null,
    },
  };
}

function reportWithFingerprint(source) {
  return deepFrozenClone({ ...source, fingerprint: fingerprint(source) }, "whole-system context report");
}

export function createWholeSystemContextReportDraft({
  report_id: reportId,
  session_key: sessionKey,
  strategy_binding: strategyBinding,
  workspace_fingerprint: workspaceFingerprint,
  dossier,
  created_at: createdAt,
  content = null,
} = {}) {
  validateContextStrategyBinding(strategyBinding);
  if (!dossier?.impact_graph) throw new ContractError("CONTEXT_GRAPH_REQUIRED", "high/critical context report requires the existing dossier impact graph");
  validateEngineeringImpactGraph(dossier.impact_graph);
  if (!["high", "critical"].includes(strategyBinding.risk_class) || dossier.risk_class !== strategyBinding.risk_class) throw new ContractError("CONTEXT_REPORT_RISK_BINDING", "context report requires matching high/critical strategy and dossier");
  assertFingerprint(workspaceFingerprint, "context report workspace fingerprint");
  assertIso(createdAt, "context report created_at");
  const analytical = content === null ? emptyContent(strategyBinding) : content;
  assertPlain(analytical, "context report content");
  exact(analytical, CONTENT_KEYS, CONTENT_KEYS, "context report content");
  if (analytical.questions.some((entry) => entry.applied_update_fingerprint !== null || entry.applied_update_ids.length > 0)) {
    throw new ContractError("CONTEXT_HYPOTHESIS_UPDATE_UNBOUND", "initial context report content cannot claim a pre-existing refutation update");
  }
  const source = {
    schema_version: WHOLE_SYSTEM_CONTEXT_REPORT_SCHEMA_VERSION,
    report_id: reportId,
    session_key: sessionKey,
    run_id: dossier.run_id,
    task_id: dossier.task_id,
    risk_class: dossier.risk_class,
    strategy_id: strategyBinding.strategy_id,
    strategy_binding_fingerprint: strategyBinding.fingerprint,
    workspace_fingerprint: workspaceFingerprint,
    dossier_id: dossier.dossier_id,
    dossier_analysis_fingerprint: engineeringDossierAnalysisFingerprint(dossier),
    impact_graph_id: dossier.impact_graph.graph_id,
    impact_graph_fingerprint: dossier.impact_graph.fingerprint,
    status: "draft",
    revision: 1,
    ...JSON.parse(canonicalJson(analytical)),
    receipt_ids: [...new Set([
      ...analytical.wide_analysis.flatMap((entry) => entry.receipt_ids),
      ...analytical.claims.flatMap((entry) => entry.receipt_ids),
      ...analytical.deep_analyses.flatMap((entry) => [...entry.receipt_ids, ...entry.dimensions.flatMap((dimension) => dimension.receipt_ids)]),
      ...analytical.questions.flatMap((entry) => entry.receipt_ids),
    ])].sort(),
    created_at: createdAt,
    updated_at: createdAt,
    finalized_at: null,
  };
  const report = reportWithFingerprint(source);
  validateWholeSystemContextReport(report, { dossier, impactGraph: dossier.impact_graph });
  return report;
}

export function updateWholeSystemContextReportDraft(report, { expected_revision: expectedRevision, updated_at: updatedAt, patch } = {}) {
  validateWholeSystemContextReport(report);
  if (report.revision !== expectedRevision) throw new ContractError("CONTEXT_REPORT_REVISION_CONFLICT", "context report expected_revision is stale");
  assertIso(updatedAt, "context report updated_at");
  assertPlain(patch, "context report patch");
  exact(patch, CONTENT_KEYS, [], "context report patch");
  const content = Object.fromEntries(CONTENT_KEYS.map((key) => [key, Object.hasOwn(patch, key) ? structuredClone(patch[key]) : structuredClone(report[key])]));
  const previousRecords = new Map([
    ...report.wide_analysis,
    ...report.claims,
    ...report.deep_analyses,
  ].map((entry) => [entry.id, entry]));
  const nextRecords = new Map([
    ...content.wide_analysis,
    ...content.claims,
    ...content.deep_analyses,
  ].map((entry) => [entry.id, entry]));
  const previousQuestions = new Map(report.questions.map((entry) => [entry.id, entry]));
  content.questions = content.questions.map((question) => {
    const previous = previousQuestions.get(question.id);
    if (question.status !== "refuted" || question.applied_update_ids.length === 0) {
      return { ...question, applied_update_fingerprint: null };
    }
    const changedUpdateIds = question.applied_update_ids.filter((id) => {
      const before = previousRecords.get(id);
      const after = nextRecords.get(id);
      return before !== undefined && after !== undefined && canonicalJson(before) !== canonicalJson(after);
    });
    const linkedDeepIds = content.deep_analyses
      .filter((entry) => entry.falsification_question_id === question.id)
      .map((entry) => entry.id);
    if (previous?.status !== "refuted" && !changedUpdateIds.some((id) => linkedDeepIds.includes(id))) {
      throw new ContractError("CONTEXT_HYPOTHESIS_UPDATE_UNBOUND", `${question.id} refutation did not causally change its linked deep analysis`);
    }
    if (previous?.status === "refuted" && changedUpdateIds.length === 0 && previous.applied_update_fingerprint !== null) {
      return { ...question, applied_update_fingerprint: previous.applied_update_fingerprint };
    }
    const causal = {
      question_id: question.id,
      previous_revision: report.revision,
      next_revision: report.revision + 1,
      changed_update_ids: changedUpdateIds.sort(),
      previous_question_fingerprint: previous === undefined ? null : fingerprint(previous),
      next_question_body_fingerprint: fingerprint({ ...question, applied_update_fingerprint: null }),
    };
    return { ...question, applied_update_fingerprint: fingerprint(causal) };
  });
  const source = {
    ...fingerprintInput(report),
    ...JSON.parse(canonicalJson(content)),
    status: "draft",
    revision: report.revision + 1,
    receipt_ids: [...new Set([
      ...content.wide_analysis.flatMap((entry) => entry.receipt_ids),
      ...content.claims.flatMap((entry) => entry.receipt_ids),
      ...content.deep_analyses.flatMap((entry) => [...entry.receipt_ids, ...entry.dimensions.flatMap((dimension) => dimension.receipt_ids)]),
      ...content.questions.flatMap((entry) => entry.receipt_ids),
    ])].sort(),
    updated_at: updatedAt,
    finalized_at: null,
  };
  const updated = reportWithFingerprint(source);
  validateWholeSystemContextReport(updated);
  return updated;
}

function receiptEntries(receiptIndex) {
  if (Array.isArray(receiptIndex)) return receiptIndex;
  if (receiptIndex && Array.isArray(receiptIndex.receipts)) return receiptIndex.receipts;
  throw new ContractError("CONTEXT_RECEIPT_INDEX_INVALID", "context receipt index must expose a receipts array");
}

export function finalizeWholeSystemContextReport(report, {
  finalized_at: finalizedAt,
  strategy_binding: strategyBinding,
  workspace_fingerprint: workspaceFingerprint,
  dossier,
  receipt_index: receiptIndex,
  implementation_started_sequence: implementationStartedSequence = null,
} = {}) {
  validateWholeSystemContextReport(report, { dossier, impactGraph: dossier?.impact_graph ?? null });
  validateContextStrategyBinding(strategyBinding);
  if (report.status !== "draft") throw new ContractError("CONTEXT_REPORT_FINALIZED", "context report is already finalized");
  if (!fingerprintsEqual(report.strategy_binding_fingerprint, strategyBinding.fingerprint) || report.strategy_id !== strategyBinding.strategy_id) throw new ContractError("CONTEXT_STRATEGY_BINDING_INVALID", "context report strategy binding is stale");
  if (!fingerprintsEqual(report.workspace_fingerprint, workspaceFingerprint)) throw new ContractError("CONTEXT_EVIDENCE_STALE", "context report workspace is stale");
  assertIso(finalizedAt, "context report finalized_at");
  const receipts = new Map(receiptEntries(receiptIndex).map((entry) => [entry.receipt_id, entry]));
  for (const receiptId of report.receipt_ids) {
    const receipt = receipts.get(receiptId);
    if (!receipt) throw new ContractError("CONTEXT_RECEIPT_UNKNOWN", `context report references unknown receipt ${receiptId}`);
    if (receipt.session_key !== report.session_key || receipt.run_id !== report.run_id || receipt.task_id !== report.task_id) throw new ContractError("CONTEXT_RECEIPT_CROSS_SESSION", `${receiptId} belongs to another context session`);
    if (receipt.source_fingerprint !== report.workspace_fingerprint) throw new ContractError("CONTEXT_RECEIPT_STALE_WORKSPACE", `${receiptId} belongs to another workspace state`);
    if ((receipt.mutation_revision_started ?? 0) !== 0 || (receipt.mutation_revision_completed ?? 0) !== 0) throw new ContractError("CONTEXT_RECEIPT_AFTER_MUTATION", `${receiptId} cannot prove pre-change understanding`);
    if (implementationStartedSequence !== null && receipt.sequence >= implementationStartedSequence) throw new ContractError("CONTEXT_RECEIPT_AFTER_MUTATION", `${receiptId} does not predate implementation`);
    if (receipt.completed_at && Date.parse(receipt.completed_at) > Date.parse(finalizedAt)) throw new ContractError("CONTEXT_RECEIPT_AFTER_FINALIZATION", `${receiptId} was completed after context finalization`);
  }
  const source = {
    ...fingerprintInput(report),
    status: "finalized",
    revision: report.revision + 1,
    updated_at: finalizedAt,
    finalized_at: finalizedAt,
  };
  const finalized = reportWithFingerprint(source);
  validateWholeSystemContextReport(finalized, { dossier, impactGraph: dossier.impact_graph });
  return finalized;
}

export function wholeSystemContextReportFingerprintInput(report) {
  validateWholeSystemContextReport(report);
  return deepFrozenClone(fingerprintInput(report), "whole-system context report fingerprint input");
}
