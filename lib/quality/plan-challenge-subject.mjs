import {
  engineeringDossierAnalysisFingerprint,
  wholeSystemContextReportAnalysisFingerprint,
} from "./whole-system-context-report.mjs";
import {
  ContractError,
  assertArray,
  assertFingerprint,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const PLAN_CHALLENGE_SUBJECT_SCHEMA_VERSION = 1;

const SUBJECT_KEYS = Object.freeze([
  "schema_version",
  "dossier_analysis_fingerprint",
  "context_strategy_fingerprint",
  "context_report_analysis_fingerprint",
  "context_decision_fingerprint",
  "context_task_profile_evidence_fingerprint",
  "fingerprint",
]);

export function validatePlanChallengeSubject(value) {
  exact(value, SUBJECT_KEYS, SUBJECT_KEYS, "plan challenge subject");
  if (value.schema_version !== PLAN_CHALLENGE_SUBJECT_SCHEMA_VERSION) {
    throw new ContractError("QUALITY_PLAN_CHALLENGE_SUBJECT", "plan challenge subject schema is unsupported");
  }
  for (const key of SUBJECT_KEYS.filter((entry) => !["schema_version", "fingerprint"].includes(entry))) {
    assertFingerprint(value[key], `plan challenge subject.${key}`);
  }
  assertFingerprint(value.fingerprint, "plan challenge subject.fingerprint");
  const source = { ...value };
  delete source.fingerprint;
  if (!fingerprintsEqual(value.fingerprint, fingerprint(source))) {
    throw new ContractError("QUALITY_PLAN_CHALLENGE_SUBJECT", "plan challenge subject fingerprint is invalid");
  }
  return value;
}

export function createPlanChallengeSubject({
  dossier,
  strategy_binding: strategyBinding,
  context_report: contextReport,
  context_decision: contextDecision,
  task_profile_evidence: taskProfileEvidence,
} = {}) {
  if (dossier?.risk_class === "standard-lite") {
    const notApplicable = fingerprint({ mode: "standard-lite-not-applicable" });
    const source = {
      schema_version: PLAN_CHALLENGE_SUBJECT_SCHEMA_VERSION,
      dossier_analysis_fingerprint: engineeringDossierAnalysisFingerprint(dossier),
      context_strategy_fingerprint: strategyBinding.fingerprint,
      context_report_analysis_fingerprint: wholeSystemContextReportAnalysisFingerprint(null),
      context_decision_fingerprint: notApplicable,
      context_task_profile_evidence_fingerprint: notApplicable,
    };
    const subject = { ...source, fingerprint: fingerprint(source) };
    validatePlanChallengeSubject(subject);
    return deepFrozenClone(subject, "standard-lite plan challenge subject");
  }
  if (contextReport?.status !== "finalized" || contextDecision?.status !== "sufficient" || taskProfileEvidence === null) {
    throw new ContractError(
      "QUALITY_PLAN_CHALLENGE_BEFORE_CONTEXT_SUFFICIENCY",
      "formal plan challenge evidence requires a finalized current report and runner-owned sufficient context decision",
    );
  }
  const dossierAnalysisFingerprint = engineeringDossierAnalysisFingerprint(dossier);
  if (!fingerprintsEqual(contextDecision.dossier_analysis_fingerprint, dossierAnalysisFingerprint)
    || !fingerprintsEqual(contextDecision.strategy_binding_fingerprint, strategyBinding?.fingerprint)
    || !fingerprintsEqual(contextDecision.report_fingerprint, contextReport.fingerprint)
    || !fingerprintsEqual(contextDecision.task_profile_evidence?.fingerprint, taskProfileEvidence.fingerprint)) {
    throw new ContractError("QUALITY_PLAN_CHALLENGE_STALE", "runner-owned context artifacts do not bind one current challenge subject");
  }
  const source = {
    schema_version: PLAN_CHALLENGE_SUBJECT_SCHEMA_VERSION,
    dossier_analysis_fingerprint: dossierAnalysisFingerprint,
    context_strategy_fingerprint: strategyBinding.fingerprint,
    context_report_analysis_fingerprint: wholeSystemContextReportAnalysisFingerprint(contextReport),
    context_decision_fingerprint: contextDecision.fingerprint,
    context_task_profile_evidence_fingerprint: taskProfileEvidence.fingerprint,
  };
  const subject = { ...source, fingerprint: fingerprint(source) };
  validatePlanChallengeSubject(subject);
  return deepFrozenClone(subject, "plan challenge subject");
}

export function assertCurrentPlanChallengeReceipts({
  plan_challenge_receipts: receipts,
  dossier,
  strategy_binding: strategyBinding,
  context_report: contextReport,
  context_decision: contextDecision,
  task_profile_evidence: taskProfileEvidence,
} = {}) {
  assertArray(receipts, "current plan challenge receipts", { max: 2 });
  if (dossier?.risk_class === "standard-lite") {
    if (receipts.length !== 0) {
      throw new ContractError("QUALITY_PLAN_CHALLENGE_STALE", "standard-lite cannot persist formal plan challenge receipts");
    }
    return createPlanChallengeSubject({
      dossier,
      strategy_binding: strategyBinding,
      context_report: null,
      context_decision: null,
      task_profile_evidence: null,
    });
  }
  if (receipts.length !== 2) {
    throw new ContractError(
      "QUALITY_PLAN_CHALLENGE_STALE",
      "high-assurance work requires exactly one current architect receipt and one current reviewer receipt",
    );
  }
  const subject = createPlanChallengeSubject({
    dossier,
    strategy_binding: strategyBinding,
    context_report: contextReport,
    context_decision: contextDecision,
    task_profile_evidence: taskProfileEvidence,
  });
  if (contextDecision.session_key !== contextReport?.session_key
    || contextDecision.run_id !== dossier?.run_id
    || contextDecision.task_id !== dossier?.task_id
    || contextDecision.dossier_id !== dossier?.dossier_id
    || contextReport?.run_id !== dossier?.run_id
    || contextReport?.task_id !== dossier?.task_id
    || contextReport?.dossier_id !== dossier?.dossier_id
    || taskProfileEvidence?.session_key !== contextDecision.session_key
    || taskProfileEvidence?.run_id !== dossier?.run_id
    || taskProfileEvidence?.task_id !== dossier?.task_id
    || taskProfileEvidence?.dossier_id !== dossier?.dossier_id) {
    throw new ContractError("QUALITY_PLAN_CHALLENGE_STALE", "current plan challenge artifacts cross session, run, task, or Dossier identities");
  }
  const roles = new Set();
  for (const receipt of receipts) {
    if (roles.has(receipt.role)) {
      throw new ContractError("QUALITY_PLAN_CHALLENGE_STALE", "current plan challenge receipts duplicate a role");
    }
    roles.add(receipt.role);
    const expectedResultId = receipt.role === "architect"
      ? dossier.plan_challenge.architect_result_id
      : receipt.role === "reviewer" ? dossier.plan_challenge.reviewer_result_id : null;
    if (receipt.session_key !== contextDecision.session_key
      || receipt.run_id !== dossier.run_id
      || receipt.task_id !== dossier.task_id
      || receipt.dossier_id !== dossier.dossier_id
      || receipt.result_id !== expectedResultId
      || receipt.dossier_analysis_fingerprint !== subject.dossier_analysis_fingerprint
      || receipt.context_strategy_fingerprint !== subject.context_strategy_fingerprint
      || receipt.context_report_fingerprint !== contextReport.fingerprint
      || receipt.context_report_analysis_fingerprint !== subject.context_report_analysis_fingerprint
      || receipt.context_decision_fingerprint !== subject.context_decision_fingerprint
      || receipt.context_task_profile_evidence_fingerprint !== subject.context_task_profile_evidence_fingerprint
      || receipt.subject_fingerprint !== subject.fingerprint) {
      throw new ContractError("QUALITY_PLAN_CHALLENGE_STALE", `${receipt.role ?? "unknown"} plan challenge receipt does not bind the current artifact set`);
    }
  }
  if (!roles.has("architect") || !roles.has("reviewer")) {
    throw new ContractError(
      "QUALITY_PLAN_CHALLENGE_STALE",
      "high-assurance work requires distinct current architect and reviewer receipts",
    );
  }
  return subject;
}
