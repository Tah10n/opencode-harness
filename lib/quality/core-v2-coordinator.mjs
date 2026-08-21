import {
  completeCoreVerification,
  coreVerificationActivationObservation,
  coreVerificationTerminalDecision,
  createCoreVerificationGate,
  recordCoreWorkspaceMutation,
  startCoreVerification,
} from "./core-verification-gate.mjs";
import {
  renderVisibleContractRemediationPrompt,
  riskGatedVisibleContractRemediationDecision,
  verificationRemediationObservation,
} from "./verification-remediation-gate.mjs";
function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function completed(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || typeof value.completed !== "boolean") fail("CORE_V2_ADAPTER", `${label} result is invalid`);
  return value;
}

function checkResult(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || !["passed", "failed", "unavailable", "unrelated_infrastructure_failure"].includes(value.status)
    || typeof value.command_fingerprint !== "string" || typeof value.detail_code !== "string"
    || value.fixed_public_check === null || typeof value.fixed_public_check !== "object"
    || Array.isArray(value.fixed_public_check) || !Array.isArray(value.fixed_public_check.argv)
    || value.fixed_public_check.argv.length < 1
    || (value.status === "failed" && value.public_check_diagnostic === null)
    || (value.status === "passed" && value.public_check_diagnostic !== null)) {
    fail("CORE_V2_CHECK", "runner-selected check result is invalid");
  }
  return value;
}

function assertAllowedChanges(changedPaths, allowedTargetPaths) {
  const allowed = new Set(allowedTargetPaths);
  const outside = changedPaths.filter((entry) => !allowed.has(entry));
  if (outside.length > 0) fail("CORE_V2_SCOPE", `workspace changed outside allowed targets: ${outside.join(", ")}`);
}

function noCheckAuditPrompt({ visibleRequirements, changedPaths }) {
  return [
    "The host is starting the single required visible-contract conformance pass after the first implementation attempt.",
    "Audit every clause of the visible requirements against the current public diff and relevant public call sites or tests. Correct any concrete mismatch you find; otherwise preserve the workspace unchanged.",
    "No applicable project-owned trusted check exists for the current public paths. Do not invent or substitute a command. The host will report this verification boundary explicitly.",
    "Do not seek hidden tests or reference content. Return the normal final outcome protocol after this bounded pass.",
    `VISIBLE_REQUIREMENTS_JSON=${JSON.stringify(visibleRequirements)}`,
    `CURRENT_PUBLIC_DIFF_V1=${JSON.stringify({ changed_paths: changedPaths })}`,
    "RUNNER_SELECTED_PUBLIC_CHECK_V1=null",
    'PUBLIC_CHECK_RESULT_V1={"status":"unavailable","diagnostic":null}',
  ].join(" ");
}

export function coreV2RemediationPlan({
  visible_requirements,
  stratum,
  allowed_target_paths,
  changed_paths,
  first_attempt_completed,
  current_diff,
  fixed_public_check = null,
  public_check_status,
  public_check_diagnostic = null,
} = {}) {
  if (!["passed", "failed", "unavailable", "unrelated_infrastructure_failure"].includes(public_check_status)) {
    fail("CORE_V2_CHECK", "public check status is invalid");
  }
  if (public_check_status === "unrelated_infrastructure_failure"
    || (fixed_public_check !== null && public_check_status === "unavailable")) {
    return Object.freeze({ eligible: false, trigger_reasons: Object.freeze([]), prompt: null });
  }
  const decisionStatus = public_check_status === "unavailable" ? "passed" : public_check_status;
  const decision = riskGatedVisibleContractRemediationDecision({
    stratum,
    public_check_status: decisionStatus,
    allowed_target_paths,
    changed_paths,
    first_attempt_completed,
  });
  const trigger_reasons = decision.eligible
    ? Object.freeze(["risk-gated-specialized-visible-contract", ...decision.reasons])
    : Object.freeze([]);
  if (!decision.eligible) return Object.freeze({ eligible: false, trigger_reasons, prompt: null });
  const prompt = fixed_public_check === null
    ? noCheckAuditPrompt({ visibleRequirements: visible_requirements, changedPaths: changed_paths })
    : renderVisibleContractRemediationPrompt({
      visible_requirements,
      current_diff,
      fixed_public_check,
      public_check_status,
      public_check_diagnostic,
    });
  return Object.freeze({ eligible: true, trigger_reasons, prompt });
}

export async function runCoreV2Coordinator({
  workspace_root,
  visible_requirements,
  stratum,
  allowed_target_paths,
  catalog_fingerprint,
  checks,
  invoke_primary,
  invoke_contract_auditor,
  run_selected_check,
  observe_workspace,
  diff_workspaces,
} = {}) {
  if (typeof workspace_root !== "string" || workspace_root.length < 1
    || typeof visible_requirements !== "string" || visible_requirements.length < 1
    || !["small", "medium", "high"].includes(stratum)
    || !Array.isArray(allowed_target_paths)
    || typeof invoke_primary !== "function" || typeof invoke_contract_auditor !== "function"
    || typeof run_selected_check !== "function" || typeof observe_workspace !== "function"
    || typeof diff_workspaces !== "function") fail("CORE_V2_INPUT", "coordinator input is invalid");

  let gate = createCoreVerificationGate({ catalog_fingerprint, checks });
  const initial = observe_workspace(workspace_root);
  const primary = completed(await invoke_primary({ visible_requirements }), "primary");
  let current = observe_workspace(workspace_root);
  let changedPaths = diff_workspaces(initial, current);
  assertAllowedChanges(changedPaths, allowed_target_paths);
  let verification = null;
  let pinnedCheckId = null;

  const verifyCurrent = async ({ pin = false } = {}) => {
    if (changedPaths.length === 0) return null;
    gate = recordCoreWorkspaceMutation(gate, {
      changed_paths: changedPaths,
      workspace_fingerprint: current.fingerprint,
      pinned_check_id: pin ? pinnedCheckId : null,
    });
    if (gate.selected_check_id === null) return null;
    pinnedCheckId ??= gate.selected_check_id;
    gate = startCoreVerification(gate, { check_id: gate.selected_check_id });
    const result = checkResult(await run_selected_check({
      check_id: gate.selected_check_id,
      mutation_revision: gate.mutation_revision,
      workspace_fingerprint: current.fingerprint,
    }));
    gate = completeCoreVerification(gate, {
      check_id: gate.selected_check_id,
      mutation_revision: gate.mutation_revision,
      workspace_fingerprint: current.fingerprint,
      status: result.status,
      command_fingerprint: result.command_fingerprint,
      detail_code: result.detail_code,
    });
    return result;
  };

  verification = await verifyCurrent();
  const publicCheckStatus = verification?.status ?? "unavailable";
  const remediationPlan = coreV2RemediationPlan({
    visible_requirements,
    stratum,
    allowed_target_paths,
    changed_paths: changedPaths,
    first_attempt_completed: primary.completed,
    current_diff: { changed_paths: changedPaths },
    fixed_public_check: verification?.fixed_public_check ?? null,
    public_check_status: publicCheckStatus,
    public_check_diagnostic: publicCheckStatus === "failed"
      ? verification?.public_check_diagnostic ?? null
      : null,
  });
  let remediation = verificationRemediationObservation({
    eligible: remediationPlan.eligible,
    trigger_reasons: remediationPlan.trigger_reasons,
  });

  if (remediationPlan.eligible) {
    const beforeAudit = current;
    const audit = completed(await invoke_contract_auditor({
      prompt: remediationPlan.prompt,
      agent_id: "contract-auditor",
    }), "contract auditor");
    current = observe_workspace(workspace_root);
    const auditChangedPaths = diff_workspaces(beforeAudit, current);
    const changed = auditChangedPaths.length > 0;
    changedPaths = diff_workspaces(initial, current);
    assertAllowedChanges(changedPaths, allowed_target_paths);
    if (changed) verification = await verifyCurrent({ pin: pinnedCheckId !== null });
    remediation = verificationRemediationObservation({
      eligible: true,
      started: true,
      completed: audit.completed,
      changed,
      reverified: changed,
      verification_passed: changed && verification?.status === "passed",
      trigger_reasons: remediationPlan.trigger_reasons,
    });
  }

  const terminal = coreVerificationTerminalDecision(gate);
  return Object.freeze({
    status: primary.completed && remediation.operationally_complete && terminal.allowed ? "completed" : "blocked",
    terminal,
    activation: coreVerificationActivationObservation(gate),
    remediation,
  });
}
