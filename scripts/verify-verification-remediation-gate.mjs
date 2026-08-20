import assert from "node:assert/strict";

import {
  buildBoundedPublicCheckDiagnostic,
  renderCheckAddressedVerificationRemediationPrompt,
  renderDiffGuidedVerificationRemediationPrompt,
  renderDiagnosticGuidedVerificationRemediationPrompt,
  renderVisibleContractRemediationPrompt,
  riskGatedVisibleContractRemediationDecision,
  verificationRemediationObservation,
} from "../lib/quality/verification-remediation-gate.mjs";

const inactive = verificationRemediationObservation({ eligible: false });
assert.equal(inactive.operationally_complete, true);
assert.equal(inactive.retry_required_count, 0);

const completed = verificationRemediationObservation({
  eligible: true,
  started: true,
  completed: true,
  changed: true,
  reverified: true,
  verification_passed: true,
  retry_metrics: {
    tool_call_count: 3,
    task_action_call_count: 3,
    context_read_count: 0,
    model_turn_count: 1,
    continuation_turn_count: 0,
    duration_ms: 10,
  },
  evidence_fingerprint: `sha256:${"a".repeat(64)}`,
});
assert.equal(completed.operationally_complete, true);
assert.equal(completed.retry_reverified_count, 1);
assert.equal(completed.reason, "retry_verification_passed");

const prompt = renderDiffGuidedVerificationRemediationPrompt({
  visible_requirements: "Preserve the public result shape.",
  current_diff: { schema_version: 1, files: [{ path: "src/task.mjs", before: "old", after: "new" }] },
});
assert.match(prompt, /CURRENT_PUBLIC_DIFF_V1=/u);
assert.match(prompt, /VISIBLE_REQUIREMENTS_JSON=/u);
assert.doesNotMatch(prompt, /[\r\n]/u);

const addressedPrompt = renderCheckAddressedVerificationRemediationPrompt({
  visible_requirements: "Preserve the public result shape.",
  current_diff: { schema_version: 1, files: [{ path: "src/task.mjs", before: "old", after: "new" }] },
  fixed_public_check: { argv: ["node", "--test", "test/public.test.mjs"] },
});
assert.match(addressedPrompt, /RUNNER_SELECTED_PUBLIC_CHECK_V1=/u);
assert.match(addressedPrompt, /test\/public\.test\.mjs/u);
assert.doesNotMatch(addressedPrompt, /[\r\n]/u);

const diagnostic = buildBoundedPublicCheckDiagnostic({
  result: {
    status: 1,
    stdout: "TAP version 13\nnot ok 1 - preserves shape",
    stderr: "at /private/tmp/public-work/test/public.test.mjs:12:3\u001b[31m",
  },
  redacted_roots: ["/private/tmp/public-work"],
});
assert.equal(diagnostic.exit_status, 1);
assert.match(diagnostic.output, /\[workspace\]\/test\/public\.test\.mjs/u);
assert.doesNotMatch(diagnostic.output, /private\/tmp/u);
assert.doesNotMatch(diagnostic.output, /\u001b/u);

const diagnosticPrompt = renderDiagnosticGuidedVerificationRemediationPrompt({
  visible_requirements: "Preserve the public result shape.",
  current_diff: { schema_version: 1, files: [{ path: "src/task.mjs", before: "old", after: "new" }] },
  fixed_public_check: { argv: ["node", "--test", "test/public.test.mjs"] },
  public_check_diagnostic: diagnostic,
});
assert.match(diagnosticPrompt, /PUBLIC_CHECK_DIAGNOSTIC_V1=/u);
assert.match(diagnosticPrompt, /not ok 1 - preserves shape/u);
assert.doesNotMatch(diagnosticPrompt, /[\r\n]/u);

const contractPrompt = renderVisibleContractRemediationPrompt({
  visible_requirements: "Preserve the public result shape.",
  current_diff: { schema_version: 1, files: [{ path: "src/task.mjs", before: "old", after: "new" }] },
  fixed_public_check: { argv: ["node", "--test", "test/public.test.mjs"] },
  public_check_status: "passed",
});
assert.match(contractPrompt, /visible-contract conformance pass/u);
assert.match(contractPrompt, /PUBLIC_CHECK_RESULT_V1=/u);
assert.match(contractPrompt, /"status":"passed"/u);
assert.doesNotMatch(contractPrompt, /[\r\n]/u);

assert.deepEqual(riskGatedVisibleContractRemediationDecision({
  stratum: "medium",
  public_check_status: "passed",
  allowed_target_paths: ["src/task.mjs"],
  changed_paths: ["src/task.mjs"],
  first_attempt_completed: true,
}), { eligible: false, reasons: [] });
assert.deepEqual(riskGatedVisibleContractRemediationDecision({
  stratum: "medium",
  public_check_status: "passed",
  allowed_target_paths: ["config/feature.json", "src/task.mjs"],
  changed_paths: ["config/feature.json", "src/task.mjs"],
  first_attempt_completed: true,
  include_multi_target: true,
}), { eligible: true, reasons: ["multi-target"] });
assert.deepEqual(riskGatedVisibleContractRemediationDecision({
  stratum: "medium",
  public_check_status: "passed",
  allowed_target_paths: ["config/feature.json", "src/task.mjs"],
  changed_paths: ["src/task.mjs"],
  first_attempt_completed: true,
}), { eligible: true, reasons: ["visible-target-missing"] });
assert.deepEqual(riskGatedVisibleContractRemediationDecision({
  stratum: "small",
  public_check_status: "failed",
  allowed_target_paths: ["src/task.mjs"],
  changed_paths: ["src/task.mjs"],
  first_attempt_completed: true,
}), { eligible: true, reasons: ["public-check-failed"] });
assert.deepEqual(riskGatedVisibleContractRemediationDecision({
  stratum: "high",
  public_check_status: "passed",
  allowed_target_paths: ["src/task.mjs"],
  changed_paths: ["src/task.mjs"],
  first_attempt_completed: true,
}), { eligible: true, reasons: ["high-risk"] });

const incompleteAfterMutation = verificationRemediationObservation({
  eligible: true,
  started: true,
  changed: true,
  reason: "retry_invalid",
});
assert.equal(incompleteAfterMutation.operationally_complete, false);
assert.equal(incompleteAfterMutation.retry_changed_count, 1);

assert.throws(
  () => verificationRemediationObservation({ eligible: false, started: true }),
  /VERIFICATION_REMEDIATION_OBSERVATION/u,
);
assert.throws(
  () => verificationRemediationObservation({ eligible: true, changed: true }),
  /VERIFICATION_REMEDIATION_OBSERVATION/u,
);
assert.throws(
  () => verificationRemediationObservation({ eligible: true, started: true, completed: true, reverified: true }),
  /VERIFICATION_REMEDIATION_OBSERVATION/u,
);
assert.throws(
  () => verificationRemediationObservation({ eligible: false, trigger_reasons: ["multi-target"] }),
  /VERIFICATION_REMEDIATION_OBSERVATION/u,
);

process.stdout.write("verification remediation gate passed\n");
