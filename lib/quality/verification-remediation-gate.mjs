function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

const METRIC_KEYS = Object.freeze([
  "tool_call_count",
  "task_action_call_count",
  "context_read_count",
  "model_turn_count",
  "continuation_turn_count",
  "duration_ms",
]);

export function verificationRemediationObservation({
  eligible,
  started = false,
  completed = false,
  changed = false,
  reverified = false,
  verification_passed = false,
  retry_metrics = null,
  evidence_fingerprint = null,
  reason = null,
} = {}) {
  if ([eligible, started, completed, changed, reverified, verification_passed]
    .some((value) => typeof value !== "boolean")) {
    fail("VERIFICATION_REMEDIATION_OBSERVATION", "boolean lifecycle fields are required");
  }
  if (!eligible && (started || completed || changed || reverified)) {
    fail("VERIFICATION_REMEDIATION_OBSERVATION", "an ineligible retry cannot have lifecycle activity");
  }
  if (completed && !started) {
    fail("VERIFICATION_REMEDIATION_OBSERVATION", "a completed retry must have started");
  }
  if (changed && !started) {
    fail("VERIFICATION_REMEDIATION_OBSERVATION", "workspace change requires a started retry");
  }
  if (reverified && !changed) {
    fail("VERIFICATION_REMEDIATION_OBSERVATION", "reverification requires a workspace change");
  }
  if (verification_passed && !reverified) {
    fail("VERIFICATION_REMEDIATION_OBSERVATION", "a passed verification must have been rerun");
  }
  if (retry_metrics !== null && (
    typeof retry_metrics !== "object"
      || Array.isArray(retry_metrics)
      || METRIC_KEYS.some((key) => !Number.isSafeInteger(retry_metrics[key]) || retry_metrics[key] < 0)
  )) {
    fail("VERIFICATION_REMEDIATION_OBSERVATION", "retry metrics are invalid");
  }
  if (evidence_fingerprint !== null && !/^sha256:[0-9a-f]{64}$/u.test(evidence_fingerprint)) {
    fail("VERIFICATION_REMEDIATION_OBSERVATION", "evidence fingerprint is invalid");
  }
  const operationallyComplete = !eligible || (started && completed);
  return Object.freeze({
    eligible,
    retry_required_count: eligible ? 1 : 0,
    retry_started_count: started ? 1 : 0,
    retry_completed_count: completed ? 1 : 0,
    retry_changed_count: changed ? 1 : 0,
    retry_reverified_count: reverified ? 1 : 0,
    retry_verification_passed_count: verification_passed ? 1 : 0,
    operationally_complete: operationallyComplete,
    retry_metrics: retry_metrics === null ? null : Object.freeze({ ...retry_metrics }),
    evidence_fingerprint,
    reason: reason ?? (operationallyComplete
      ? eligible ? verification_passed ? "retry_verification_passed" : reverified ? "retry_verification_failed" : changed ? "retry_changed" : "retry_no_change" : "not_eligible"
      : started ? "retry_incomplete" : "retry_not_started"),
  });
}
