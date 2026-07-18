const ORCHESTRATOR_TOOLS = Object.freeze([
  "quality_session_start",
  "quality_dossier_create",
  "quality_dossier_update",
  "quality_dossier_inspect",
  "quality_context_strategy_escalate",
  "quality_context_report_create",
  "quality_context_report_update",
  "quality_context_report_finalize",
  "quality_dossier_finalize",
  "quality_action_authorize",
  "quality_context_reconcile",
  "quality_session_finalize",
]);

export const NORMAL_SESSION_QUALITY_PROFILE_PERMISSIONS = Object.freeze({
  orchestrator: ORCHESTRATOR_TOOLS,
  "orchestrator-deep": ORCHESTRATOR_TOOLS,
  architect: Object.freeze(["quality_dossier_inspect", "quality_architecture_evaluate"]),
  reviewer: Object.freeze(["quality_dossier_inspect", "quality_architecture_evaluate", "quality_context_reviewer_record"]),
  verifier: Object.freeze(["quality_dossier_inspect", "quality_verification_record"]),
});

export function expectedNormalSessionQualityPermission(agentName, toolId) {
  return (NORMAL_SESSION_QUALITY_PROFILE_PERMISSIONS[agentName] ?? []).includes(toolId) ? "allow" : "deny";
}
