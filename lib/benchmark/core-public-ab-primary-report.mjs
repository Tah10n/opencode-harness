import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";

import { canonicalJson, fingerprint } from "../feedback/contracts.mjs";
import { exactBinomialUpperTail } from "./v3-design.mjs";
import { exactTwoSidedMcNemar } from "./statistics.mjs";

const ARMS = Object.freeze(["plain", "core"]);
const STRATA = Object.freeze(["small", "medium", "high"]);
const FP = /^sha256:[0-9a-f]{64}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const BOOTSTRAP_RESAMPLES = 100_000;
const FROZEN = Object.freeze({
  measurement_id: "core-public-ab-v2",
  manifest_fingerprint: "sha256:497bca0d2fc09b247709c131ade1bbc88fee53448a13fe27ec2fc25117ff8f19",
  product_source_sha: "89f1f7f1980a829d7da162fcd737d0c52613225d",
  runner_source_sha: "944efc55d207c8c7d5a2becf8c2c5aa68b2f0006",
  runner_sha256: "sha256:6f0214648904a1e3b225c80a659c4aacc36e31f2e78fe31cf523974085d14296",
  core_bundle_fingerprint: "sha256:688ddc642bf694d7ab110915d5a101722b13ba6eeebde1b0788814575e3e8d21",
  ledger_event_count: 435,
  ledger_sha256: "sha256:9969bd18cf5160ef12a4c074f265b7e2b240ddecbc6f6fffc832ab72fd1a0e66",
  termination_sha256: "sha256:1ac05fb051145c3f943ffb60d4a31508357e6b5e5e466e693c65b630972fc5b3",
  validation_pairs: 60,
  pilot_pairs_complete: 12,
  pilot_pairs_total: 29,
});

export class PrimaryReportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PrimaryReportError";
    this.code = code;
  }
}

function fail(code, message) { throw new PrimaryReportError(code, message); }
function expect(condition, code, message) { if (!condition) fail(code, message); }
function sha256Bytes(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function sha256File(file) { return sha256Bytes(fs.readFileSync(file)); }
function bodyFingerprint(value, key) {
  const body = { ...value }; delete body[key]; return fingerprint(body);
}
function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { fail("PRIMARY_REPORT_JSON", `${label} is invalid`); }
}
function statRegular(file, label) {
  const resolved = fs.realpathSync.native(path.resolve(file));
  const stat = fs.lstatSync(resolved);
  expect(stat.isFile() && !stat.isSymbolicLink(), "PRIMARY_REPORT_INPUT", `${label} must be one ordinary file`);
  return Object.freeze({ path: resolved, stat });
}
function statDirectory(directory, label) {
  const resolved = fs.realpathSync.native(path.resolve(directory));
  const stat = fs.lstatSync(resolved);
  expect(stat.isDirectory() && !stat.isSymbolicLink(), "PRIMARY_REPORT_INPUT", `${label} must be one real directory`);
  return resolved;
}
function validateFingerprint(value, key, label) {
  expect(value && typeof value === "object" && !Array.isArray(value)
    && FP.test(value[key] ?? "") && value[key] === bodyFingerprint(value, key),
  "PRIMARY_REPORT_BINDING", `${label} fingerprint is invalid`);
  return value;
}
function loadLedger(file) {
  const text = fs.readFileSync(file, "utf8");
  expect(text.endsWith("\n"), "PRIMARY_REPORT_LEDGER", "attempt ledger is not newline terminated");
  const records = text.trimEnd().split("\n").map((line) => {
    try { return JSON.parse(line); }
    catch { fail("PRIMARY_REPORT_LEDGER", "attempt ledger contains invalid JSON"); }
  });
  let previous = null;
  records.forEach((record, index) => {
    const { event_hash: declared, ...body } = record;
    expect(record.sequence === index + 1 && record.previous_hash === previous && declared === fingerprint(body),
      "PRIMARY_REPORT_LEDGER", "attempt ledger hash chain is invalid");
    previous = declared;
  });
  return records;
}
function attemptIdentifier(dataset, identityId, arm, attemptIndex) {
  return `${dataset}-${identityId.replace(/[^A-Za-z0-9._-]+/gu, "-")}-${arm}-${attemptIndex}`;
}
function expectedAttemptBinding(manifest, pilotManifest, value) {
  const taskFingerprint = manifest.task_binding_fingerprints?.[value.dataset]?.[value.identityId];
  expect(FP.test(taskFingerprint ?? ""), "PRIMARY_REPORT_BINDING", `${value.dataset}/${value.identityId} task binding is absent`);
  return fingerprint({ schema_version: 1, manifest_fingerprint: manifest.manifest_fingerprint,
    pilot_manifest_fingerprint: pilotManifest.pilot_manifest_fingerprint, dataset: value.dataset,
    identity_id: value.identityId, arm: value.arm, attempt_index: value.attemptIndex,
    retry_of: value.retryOf, task_fingerprint: taskFingerprint });
}
function validateManifest(manifest, expected) {
  validateFingerprint(manifest, "manifest_fingerprint", "measurement manifest");
  expect(manifest.measurement_id === expected.measurement_id
    && manifest.manifest_fingerprint === expected.manifest_fingerprint
    && manifest.product_source_sha === expected.product_source_sha
    && manifest.runner_source_sha === expected.runner_source_sha
    && manifest.runner_sha256 === expected.runner_sha256
    && manifest.core_bundle_fingerprint === expected.core_bundle_fingerprint
    && manifest.primary_metric === "oracle_validated_task_success"
    && manifest.excluded_metrics?.regression_free_task_success?.status === "not_computed"
    && manifest.excluded_metrics.regression_free_task_success.reason === "no frozen independent severity oracle"
    && manifest.validation_family_ids?.length === expected.validation_pairs
    && new Set(manifest.validation_family_ids).size === expected.validation_pairs
    && manifest.real_pilot_identity_ids?.length === expected.pilot_pairs_total
    && new Set(manifest.real_pilot_identity_ids).size === expected.pilot_pairs_total
    && manifest.bootstrap_resamples === BOOTSTRAP_RESAMPLES,
  "PRIMARY_REPORT_MANIFEST", "measurement manifest differs from the frozen primary contract");
  return manifest;
}
function validateTermination(termination, manifest, expected) {
  expect(termination?.schema_version === 1 && termination.measurement_id === manifest.measurement_id
    && termination.status === "incomplete_after_non_retryable_timeout"
    && termination.manifest_fingerprint === manifest.manifest_fingerprint
    && termination.runner_source_sha === manifest.runner_source_sha
    && termination.runner_sha256 === manifest.runner_sha256
    && termination.product_source_sha === manifest.product_source_sha
    && canonicalJson(termination.model_binding) === canonicalJson({ provider: manifest.provider,
      model: manifest.model, variant: manifest.variant })
    && termination.frozen_disposition?.retry_allowed === false
    && termination.frozen_disposition?.attempt_ledger_sha256 === expected.ledger_sha256
    && termination.frozen_disposition?.attempt_ledger_event_count === expected.ledger_event_count
    && termination.observed_accounting?.model_process_starts === 145
    && termination.observed_accounting?.completed_attempts === 145
    && termination.observed_accounting?.scored_outcomes === 144
    && termination.observed_accounting?.unscored_outcomes === 1
    && termination.observed_accounting?.infrastructure_retries === 0
    && termination.observed_accounting?.validation_scored_outcomes === expected.validation_pairs * 2
    && termination.observed_accounting?.pilot_scored_outcomes === expected.pilot_pairs_complete * 2
    && termination.terminal_attempt?.dataset === "pilot" && termination.terminal_attempt.arm === "core"
    && termination.terminal_attempt.attempt_index === 1 && termination.terminal_attempt.timed_out === true
    && termination.terminal_attempt.scored_outcome === false
    && termination.terminal_attempt.model_access_required === true
    && termination.terminal_attempt.reconciliation_required === false,
  "PRIMARY_REPORT_TERMINATION", "campaign termination record differs from the frozen terminal state");
  return termination;
}
function validateReceipt(value, file, manifest, pilotManifest, identityId, arm) {
  expect(value?.schema_version === 1 && value.dataset === "validation" && value.identity_id === identityId
    && value.arm === arm && value.scored_outcome === true && value.reconciliation_required === false
    && typeof value.oracle_validated_task_success === "boolean"
    && typeof value.authentic_terminal_completion === "boolean" && typeof value.timed_out === "boolean"
    && typeof value.process_containment_intact === "boolean" && value.no_surviving_descendants === true
    && typeof value.mutation_scope_valid === "boolean" && typeof value.task_specific_semantic_oracle_passed === "boolean"
    && value.hidden_data_leakage_observed === false && FP.test(value.hidden_data_preflight_fingerprint ?? "")
    && Number.isSafeInteger(value.attempt_index) && value.attempt_index >= 1 && value.attempt_index <= 2
    && value.attempt_id === attemptIdentifier("validation", identityId, arm, value.attempt_index)
    && value.attempt_binding_fingerprint === expectedAttemptBinding(manifest, pilotManifest, {
      dataset: "validation", identityId, arm, attemptIndex: value.attempt_index,
      retryOf: value.retry_of_attempt_id ?? null,
    })
    && FP.test(value.outcome_fingerprint ?? "") && value.outcome_fingerprint === bodyFingerprint(value, "outcome_fingerprint"),
  "PRIMARY_REPORT_RECEIPT", `validation/${identityId}/${arm} receipt binding is invalid`);
  return Object.freeze({ value, sha256: sha256File(file) });
}
function loadValidationPairs(campaignRoot, manifest, pilotManifest, ledgerRecords) {
  const outcomeFingerprints = new Set();
  const attemptIds = new Set();
  const consumedReceiptPaths = new Set();
  const validationReceiptRoot = path.join(campaignRoot, "receipts", "validation");
  const pairs = manifest.validation_family_ids.map((identityId) => {
    const directory = path.join(campaignRoot, "receipts", "validation",
      identityId.replace(/[^A-Za-z0-9._-]+/gu, "-"));
    const directoryStat = fs.lstatSync(directory);
    expect(directoryStat.isDirectory() && !directoryStat.isSymbolicLink(),
      "PRIMARY_REPORT_RECEIPT", `validation/${identityId} receipt directory is invalid`);
    const loadArm = (arm) => {
      const names = fs.readdirSync(directory).filter((name) => name.startsWith(`${arm}-attempt-`) && name.endsWith(".json"));
      const receipts = names.map((name) => {
        const file = statRegular(path.join(directory, name), "validation receipt").path;
        consumedReceiptPaths.add(path.relative(validationReceiptRoot, file));
        return validateReceipt(readJson(file, "validation receipt"), file, manifest, pilotManifest, identityId, arm);
      });
      const scored = receipts.filter((entry) => entry.value.scored_outcome === true);
      expect(scored.length === 1, "PRIMARY_REPORT_RECEIPT", `validation/${identityId}/${arm} lacks exactly one scored outcome`);
      const receipt = scored[0];
      const matching = ledgerRecords.filter((record) => record.event_type === "attempt-completed"
        && record.attempt_id === receipt.value.attempt_id);
      expect(matching.length === 1
        && matching[0].dataset === "validation" && matching[0].identity_id === identityId && matching[0].arm === arm
        && matching[0].outcome_fingerprint === receipt.value.outcome_fingerprint
        && matching[0].receipt_sha256 === receipt.sha256 && matching[0].scored_outcome === true
        && matching[0].reconciliation_required === false,
      "PRIMARY_REPORT_LEDGER", `${receipt.value.attempt_id} receipt and ledger differ`);
      expect(!outcomeFingerprints.has(receipt.value.outcome_fingerprint) && !attemptIds.has(receipt.value.attempt_id),
        "PRIMARY_REPORT_DUPLICATE", "validation contains a repeated scored outcome");
      outcomeFingerprints.add(receipt.value.outcome_fingerprint); attemptIds.add(receipt.value.attempt_id);
      return receipt.value;
    };
    const plain = loadArm("plain"); const core = loadArm("core");
    expect(plain.stratum === core.stratum && STRATA.includes(plain.stratum),
      "PRIMARY_REPORT_RECEIPT", `validation/${identityId} pair stratum is invalid`);
    return Object.freeze({ identity_id: identityId, stratum: plain.stratum, plain, core });
  });
  expect(pairs.length === 60 && outcomeFingerprints.size === 120 && attemptIds.size === 120,
    "PRIMARY_REPORT_VALIDATION_INCOMPLETE", "primary validation does not contain exactly 60 complete unique pairs");
  const actualReceiptPaths = fs.readdirSync(validationReceiptRoot, { recursive: true })
    .filter((entry) => String(entry).endsWith(".json")).map(String).sort();
  expect(canonicalJson(actualReceiptPaths) === canonicalJson([...consumedReceiptPaths].sort()),
    "PRIMARY_REPORT_RECEIPT", "validation receipt inventory differs from the frozen 120 outcomes");
  for (const stratum of STRATA) {
    expect(pairs.filter((pair) => pair.stratum === stratum).length === 20,
      "PRIMARY_REPORT_VALIDATION_INCOMPLETE", `${stratum} validation stratum does not contain 20 pairs`);
  }
  return Object.freeze(pairs);
}

function xorshift(seedText) {
  let state = Number.parseInt(createHash("sha256").update(seedText).digest("hex").slice(0, 8), 16) >>> 0;
  return () => {
    state ^= state << 13; state >>>= 0; state ^= state >>> 17; state >>>= 0; state ^= state << 5; state >>>= 0;
    return state / 0x1_0000_0000;
  };
}
function quantile(values, probability) {
  const ordered = values.slice().sort((left, right) => left - right);
  const index = (ordered.length - 1) * probability; const lower = Math.floor(index); const upper = Math.ceil(index);
  return lower === upper ? ordered[lower] : ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower);
}
function pairedBootstrapInterval(pairs, seed) {
  const random = xorshift(seed); const deltas = new Array(BOOTSTRAP_RESAMPLES);
  for (let sample = 0; sample < BOOTSTRAP_RESAMPLES; sample += 1) {
    let delta = 0;
    for (let index = 0; index < pairs.length; index += 1) {
      const pair = pairs[Math.floor(random() * pairs.length)];
      delta += Number(pair.core.oracle_validated_task_success) - Number(pair.plain.oracle_validated_task_success);
    }
    deltas[sample] = delta / pairs.length;
  }
  return Object.freeze([quantile(deltas, 0.025), quantile(deltas, 0.975)]);
}
function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values) { return quantile(values, 0.5); }
function p90(values) { return quantile(values, 0.9); }
function binomialUpperTail(trials, successes) {
  return trials === 0 ? 1 : exactBinomialUpperTail(trials, successes, 0.5);
}
function tokens(outcomes) {
  if (!outcomes.every((entry) => Number.isSafeInteger(entry.tokens) && entry.usage_observed === true)) {
    return Object.freeze({ status: "not_observable", total: null });
  }
  return Object.freeze({ status: "observed", total: outcomes.reduce((sum, entry) => sum + entry.tokens, 0) });
}
function armSummary(pairs, arm) {
  const outcomes = pairs.map((pair) => pair[arm]); const durations = outcomes.map((entry) => entry.duration_ms);
  const count = (predicate) => outcomes.filter(predicate).length;
  return Object.freeze({
    median_duration_ms: median(durations), mean_duration_ms: mean(durations), p90_duration_ms: p90(durations),
    timeout_count: count((entry) => entry.timed_out),
    terminal_completion_count: count((entry) => entry.authentic_terminal_completion),
    scope_violation_count: count((entry) => !entry.mutation_scope_valid),
    semantic_oracle_failure_count: count((entry) => !entry.task_specific_semantic_oracle_passed),
    turns: outcomes.reduce((sum, entry) => sum + entry.turn_count, 0),
    tool_calls: outcomes.reduce((sum, entry) => sum + entry.tool_call_count, 0),
    tokens: tokens(outcomes),
    core_verification: arm === "core" ? Object.freeze(Object.fromEntries(["passed", "failed", "stale", "unavailable"]
      .map((status) => [status, count((entry) => entry.core_verification_status === status)]))) : null,
  });
}
function descriptiveSummary(pairs, seed) {
  const plain = pairs.filter((pair) => pair.plain.oracle_validated_task_success).length;
  const core = pairs.filter((pair) => pair.core.oracle_validated_task_success).length;
  const coreOnly = pairs.filter((pair) => !pair.plain.oracle_validated_task_success && pair.core.oracle_validated_task_success).length;
  const plainOnly = pairs.filter((pair) => pair.plain.oracle_validated_task_success && !pair.core.oracle_validated_task_success).length;
  return Object.freeze({ pairs: pairs.length, plain_successes: plain, core_successes: core,
    plain_success_rate: plain / pairs.length, core_success_rate: core / pairs.length,
    absolute_delta_percentage_points: 100 * (core - plain) / pairs.length,
    core_only_wins: coreOnly, plain_only_wins: plainOnly, ties: pairs.length - coreOnly - plainOnly,
    paired_bootstrap_95_ci_percentage_points: pairedBootstrapInterval(pairs, seed).map((value) => 100 * value) });
}
function objectiveGuardrails(pairs) {
  const plain = pairs.map((pair) => pair.plain); const core = pairs.map((pair) => pair.core);
  const rate = (values, predicate) => values.filter(predicate).length / values.length;
  const containment = [...plain, ...core].filter((entry) => !entry.process_containment_intact).length;
  const leakageComplete = [...plain, ...core].every((entry) => entry.hidden_data_leakage_observed === false
    && FP.test(entry.hidden_data_preflight_fingerprint ?? ""));
  const leakage = [...plain, ...core].filter((entry) => entry.hidden_data_leakage_observed === true).length;
  const plainScope = rate(plain, (entry) => !entry.mutation_scope_valid);
  const coreScope = rate(core, (entry) => !entry.mutation_scope_valid);
  const plainTimeout = rate(plain, (entry) => entry.timed_out);
  const coreTimeout = rate(core, (entry) => entry.timed_out);
  const plainCompletion = rate(plain, (entry) => entry.authentic_terminal_completion);
  const coreCompletion = rate(core, (entry) => entry.authentic_terminal_completion);
  const verificationAuthentic = core.filter((entry) => entry.core_verification_receipt_authentic === true).length;
  return Object.freeze({
    containment_violations: Object.freeze({ count: containment, passed: containment === 0 }),
    hidden_data_leakage: Object.freeze({ count: leakageComplete ? leakage : null, observation_complete: leakageComplete,
      passed: leakageComplete && leakage === 0 }),
    candidate_scope_violation_rate: Object.freeze({ plain: plainScope, core: coreScope,
      candidate_minus_plain: coreScope - plainScope, passed: coreScope <= plainScope }),
    timeout_rate: Object.freeze({ plain: plainTimeout, core: coreTimeout,
      candidate_minus_plain: coreTimeout - plainTimeout, passed: coreTimeout - plainTimeout <= 0.05 }),
    terminal_completion_rate: Object.freeze({ plain: plainCompletion, core: coreCompletion,
      candidate_minus_plain: coreCompletion - plainCompletion, passed: coreCompletion - plainCompletion >= -0.05 }),
    core_verification_receipts: Object.freeze({ authentic: verificationAuthentic, required: core.length,
      passed: verificationAuthentic === core.length }),
  });
}
function primaryDecision(primary) {
  const guardrails = primary.guardrails;
  const requiredForImprovement = guardrails.containment_violations.passed && guardrails.hidden_data_leakage.passed
    && guardrails.candidate_scope_violation_rate.passed && guardrails.timeout_rate.passed;
  if (primary.absolute_delta_percentage_points >= 5 && primary.paired_bootstrap_95_ci_percentage_points[0] > 0
    && primary.exact_one_sided_mcnemar_p < 0.05 && requiredForImprovement) {
    return "CORE IMPROVES FROZEN TASK SUCCESS";
  }
  const operationalRegression = !requiredForImprovement || !guardrails.terminal_completion_rate.passed
    || !guardrails.core_verification_receipts.passed;
  if (primary.paired_bootstrap_95_ci_percentage_points[1] < 0 || operationalRegression) {
    return "CORE REGRESSES FROZEN TASK SUCCESS";
  }
  return "NO CLEAR DIFFERENCE";
}

export function buildPrimaryReport({ manifest, validationPairs, pilotCompletePairs, pilotTotalPairs,
  ledgerSha256, ledgerEventCount, modelProcessStarts }) {
  expect(validationPairs.length === 60, "PRIMARY_REPORT_VALIDATION_INCOMPLETE",
    "primary reporting requires all 60 validation pairs");
  expect(STRATA.every((stratum) => validationPairs.filter((pair) => pair.stratum === stratum).length === 20),
    "PRIMARY_REPORT_VALIDATION_INCOMPLETE", "primary reporting requires 20 pairs in every frozen stratum");
  const summary = descriptiveSummary(validationPairs, manifest.manifest_fingerprint);
  const discordant = summary.core_only_wins + summary.plain_only_wins;
  const guardrails = objectiveGuardrails(validationPairs);
  const primary = Object.freeze({ ...summary,
    relative_lift: summary.plain_successes === 0 ? null
      : (summary.core_successes - summary.plain_successes) / summary.plain_successes,
    exact_one_sided_mcnemar_p: binomialUpperTail(discordant, summary.core_only_wins),
    exact_two_sided_mcnemar_p: exactTwoSidedMcNemar(summary.plain_only_wins, summary.core_only_wins),
    bootstrap: Object.freeze({ method: "deterministic_family_level_percentile", resamples: BOOTSTRAP_RESAMPLES,
      seed: manifest.manifest_fingerprint, confidence_level: 0.95 }),
    breakdown: Object.freeze(Object.fromEntries(STRATA.map((stratum) => [stratum,
      descriptiveSummary(validationPairs.filter((pair) => pair.stratum === stratum),
        sha256Bytes(Buffer.from(`${manifest.manifest_fingerprint}\0validation:${stratum}`, "utf8")))]))),
    overhead: Object.freeze({ plain: armSummary(validationPairs, "plain"), core: armSummary(validationPairs, "core") }),
    guardrails,
  });
  const decision = primaryDecision(primary);
  const overallLabel = `MODEL-BACKED PRIMARY MEASUREMENT COMPLETE — ${decision}; REAL-REPOSITORY PILOT INCOMPLETE`;
  return Object.freeze({
    schema_version: 1, measurement_id: manifest.measurement_id,
    primary_status: "complete", pilot_status: "incomplete_after_non_retryable_timeout",
    overall_status: "primary_complete_pilot_incomplete", decision, overall_label: overallLabel,
    frozen_bindings: Object.freeze({ manifest_fingerprint: manifest.manifest_fingerprint,
      product_source_sha: manifest.product_source_sha, runner_source_sha: manifest.runner_source_sha,
      runner_sha256: manifest.runner_sha256, core_bundle_fingerprint: manifest.core_bundle_fingerprint }),
    primary_metric: "oracle_validated_task_success", primary_validation: primary,
    pilot: Object.freeze({ completed_pairs: pilotCompletePairs, total_pairs: pilotTotalPairs,
      used_in_primary: false, efficacy: Object.freeze({ status: "not_computed", reason: "incomplete_after_non_retryable_timeout" }) }),
    regression_free_task_success: Object.freeze({ status: "not_computed", reason: "no_frozen_independent_severity_oracle" }),
    high_medium_critical_regressions: Object.freeze({ status: "not_observable", count: null, rate: null }),
    model_call_accounting: Object.freeze({ observed_historical_model_process_starts: modelProcessStarts,
      new_model_provider_calls: 0 }),
    historical_evidence: Object.freeze({ ledger_sha256: ledgerSha256, ledger_event_count: ledgerEventCount,
      validation_family_ids: 60, validation_scored_outcomes: 120,
      validation_outcomes_bound_to_frozen_manifest: 120, duplicate_validation_scored_outcomes: 0,
      validation_reconciliation_required: false, unchanged_by_reporting: true }),
  });
}

function pilotCompletePairCount(records, manifest) {
  const scored = records.filter((record) => record.event_type === "attempt-completed" && record.dataset === "pilot"
    && record.scored_outcome === true && record.reconciliation_required === false);
  const unique = new Set(scored.map((record) => `${record.identity_id}\0${record.arm}`));
  expect(scored.length === 24 && unique.size === 24,
    "PRIMARY_REPORT_PILOT", "pilot ledger does not contain exactly 24 unique scored task-arm outcomes");
  return manifest.real_pilot_identity_ids.filter((identityId) => ARMS.every((arm) => scored.some((record) =>
    record.identity_id === identityId && record.arm === arm))).length;
}
function formatNumber(value, digits = 6) { return Number(value.toFixed(digits)).toString(); }
function renderResults(report) {
  const primary = report.primary_validation; const plain = primary.overhead.plain; const core = primary.overhead.core;
  const pp = (value) => `${formatNumber(value)} percentage points`;
  const rate = (value) => `${formatNumber(100 * value)}%`;
  return [
    report.overall_label,
    "",
    "# Core versus plain primary A/B result",
    "",
    `- Plain successes: ${primary.plain_successes}/60 (${rate(primary.plain_success_rate)})`,
    `- Core successes: ${primary.core_successes}/60 (${rate(primary.core_success_rate)})`,
    `- Absolute delta: ${pp(primary.absolute_delta_percentage_points)}`,
    `- Relative lift: ${primary.relative_lift === null ? "undefined" : rate(primary.relative_lift)}`,
    `- Core-only wins / plain-only wins / ties: ${primary.core_only_wins} / ${primary.plain_only_wins} / ${primary.ties}`,
    `- Paired bootstrap 95% CI: [${pp(primary.paired_bootstrap_95_ci_percentage_points[0])}, ${pp(primary.paired_bootstrap_95_ci_percentage_points[1])}]`,
    `- Exact one-sided McNemar p (core > plain): ${formatNumber(primary.exact_one_sided_mcnemar_p, 12)}`,
    `- Exact two-sided McNemar p: ${formatNumber(primary.exact_two_sided_mcnemar_p, 12)}`,
    "",
    "## Frozen strata",
    "",
    ...STRATA.map((stratum) => { const value = primary.breakdown[stratum];
      return `- ${stratum}: plain ${value.plain_successes}/20, core ${value.core_successes}/20, delta ${pp(value.absolute_delta_percentage_points)}`; }),
    "",
    "## Operational evidence",
    "",
    `- Duration median / mean / p90 ms, plain: ${formatNumber(plain.median_duration_ms)} / ${formatNumber(plain.mean_duration_ms)} / ${formatNumber(plain.p90_duration_ms)}`,
    `- Duration median / mean / p90 ms, core: ${formatNumber(core.median_duration_ms)} / ${formatNumber(core.mean_duration_ms)} / ${formatNumber(core.p90_duration_ms)}`,
    `- Turns plain / core: ${plain.turns} / ${core.turns}`,
    `- Tool calls plain / core: ${plain.tool_calls} / ${core.tool_calls}`,
    `- Tokens plain / core: ${plain.tokens.status === "observed" ? plain.tokens.total : "not_observable"} / ${core.tokens.status === "observed" ? core.tokens.total : "not_observable"}`,
    `- Timeouts plain / core: ${plain.timeout_count} / ${core.timeout_count}`,
    `- Terminal completions plain / core: ${plain.terminal_completion_count} / ${core.terminal_completion_count}`,
    `- Scope violations plain / core: ${plain.scope_violation_count} / ${core.scope_violation_count}`,
    `- Semantic-oracle failures plain / core: ${plain.semantic_oracle_failure_count} / ${core.semantic_oracle_failure_count}`,
    `- Core verification passed / failed / stale / unavailable: ${core.core_verification.passed} / ${core.core_verification.failed} / ${core.core_verification.stale} / ${core.core_verification.unavailable}`,
    "",
    "## Pilot and safety boundary",
    "",
    `The real-repository pilot was incomplete after ${report.pilot.completed_pairs} of ${report.pilot.total_pairs} pairs and was not used in the primary inference. No pilot efficacy was computed.`,
    "",
    "regression_free_task_success: not_computed (no_frozen_independent_severity_oracle).",
    "",
    "HIGH/MEDIUM/CRITICAL regressions outside the frozen task-specific semantic oracles: not_observable; count=null; rate=null.",
    "",
    `On the frozen 60-family public validation benchmark, materialized core changed oracle-validated task success from ${rate(primary.plain_success_rate)} to ${rate(primary.core_success_rate)}: ${pp(primary.absolute_delta_percentage_points)}, paired 95% CI [${pp(primary.paired_bootstrap_95_ci_percentage_points[0])}, ${pp(primary.paired_bootstrap_95_ci_percentage_points[1])}], one-sided exact McNemar p=${formatNumber(primary.exact_one_sided_mcnemar_p, 12)}.`,
    "",
    "The real-repository pilot was incomplete after 12 of 29 pairs and was not used in the primary inference. HIGH/MEDIUM/CRITICAL regression safety outside the frozen task-specific semantic oracles was not observable.",
    "",
    `Materialized core changed oracle-validated task success relative to plain by ${pp(primary.absolute_delta_percentage_points)} on the completed frozen 60-family validation benchmark; no additional model calls were required.`,
    "",
  ].join("\n");
}
function assertOutputOutsideEvidence(campaignRoot, output) {
  const requested = path.resolve(output); const parent = statDirectory(path.dirname(requested), "report output parent");
  const resolved = path.join(parent, path.basename(requested)); const relative = path.relative(campaignRoot, resolved);
  expect(relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), "PRIMARY_REPORT_OUTPUT",
    "report outputs must be outside immutable campaign evidence");
  try {
    fs.lstatSync(resolved); fail("PRIMARY_REPORT_IMMUTABLE", `${resolved} already exists`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return resolved;
}
function publishOutputs(entries) {
  const staged = []; const published = [];
  try {
    for (const entry of entries) {
      const temporary = `${entry.target}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
      const descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
      try { fs.writeFileSync(descriptor, entry.contents); fs.fsyncSync(descriptor); }
      finally { fs.closeSync(descriptor); }
      staged.push(Object.freeze({ target: entry.target, temporary }));
    }
    for (const entry of staged) {
      fs.linkSync(entry.temporary, entry.target);
      published.push(entry.target);
      fs.unlinkSync(entry.temporary);
    }
    for (const directory of new Set(published.map((target) => path.dirname(target)))) {
      const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
      try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    }
  } catch (error) {
    for (const entry of staged) {
      try { fs.unlinkSync(entry.temporary); } catch (cleanupError) { if (cleanupError?.code !== "ENOENT") throw cleanupError; }
    }
    for (const target of published) {
      try { fs.unlinkSync(target); } catch (cleanupError) { if (cleanupError?.code !== "ENOENT") throw cleanupError; }
    }
    throw error;
  }
}

export function reportPrimaryCampaign(options, expected = FROZEN) {
  const campaignRoot = statDirectory(options.campaignRoot, "campaign root");
  const manifest = validateManifest(readJson(statRegular(options.manifest, "measurement manifest").path,
    "measurement manifest"), expected);
  const pilotManifest = validateFingerprint(readJson(statRegular(options.pilotManifest, "pilot manifest").path,
    "pilot manifest"), "pilot_manifest_fingerprint", "pilot manifest");
  expect(pilotManifest.pilot_manifest_fingerprint === manifest.real_pilot_manifest_fingerprint,
    "PRIMARY_REPORT_BINDING", "pilot manifest differs from the frozen measurement manifest");
  const terminationFile = statRegular(options.terminationRecord, "termination record");
  if (expected.termination_sha256 !== undefined) {
    expect(sha256File(terminationFile.path) === expected.termination_sha256,
      "PRIMARY_REPORT_TERMINATION", "campaign termination record hash differs from the frozen public record");
  }
  const termination = validateTermination(readJson(terminationFile.path, "termination record"), manifest, expected);
  const ledger = statRegular(path.join(campaignRoot, "attempt-ledger.jsonl"), "attempt ledger");
  const ledgerBefore = Object.freeze({ sha256: sha256File(ledger.path), count: loadLedger(ledger.path).length });
  expect(ledgerBefore.sha256 === expected.ledger_sha256 && ledgerBefore.count === expected.ledger_event_count,
    "PRIMARY_REPORT_LEDGER", "historical ledger hash or event count differs from the frozen evidence");
  const records = loadLedger(ledger.path);
  const validationPairs = loadValidationPairs(campaignRoot, manifest, pilotManifest, records);
  const pilotPairs = pilotCompletePairCount(records, manifest);
  expect(pilotPairs === expected.pilot_pairs_complete,
    "PRIMARY_REPORT_PILOT", "pilot completion count differs from the terminal record");
  const report = buildPrimaryReport({ manifest, validationPairs, pilotCompletePairs: pilotPairs,
    pilotTotalPairs: manifest.real_pilot_identity_ids.length, ledgerSha256: ledgerBefore.sha256,
    ledgerEventCount: ledgerBefore.count,
    modelProcessStarts: records.filter((record) => record.event_type === "model-process-started").length });
  const ledgerAfterRead = Object.freeze({ sha256: sha256File(ledger.path), count: loadLedger(ledger.path).length });
  expect(canonicalJson(ledgerAfterRead) === canonicalJson(ledgerBefore), "PRIMARY_REPORT_LEDGER",
    "historical ledger changed while primary evidence was read");
  const outputs = Object.fromEntries(Object.entries(options.outputs).map(([key, value]) =>
    [key, assertOutputOutsideEvidence(campaignRoot, value)]));
  expect(new Set(Object.values(outputs)).size === 4, "PRIMARY_REPORT_OUTPUT", "primary report outputs must be distinct");
  const publicReport = Object.freeze({ ...report, report_fingerprint: fingerprint(report) });
  const pilotStatusBody = { schema_version: 1, measurement_id: manifest.measurement_id,
    primary_status: "complete", pilot_status: "incomplete_after_non_retryable_timeout",
    overall_status: "primary_complete_pilot_incomplete", completed_pairs: pilotPairs,
    total_pairs: manifest.real_pilot_identity_ids.length, used_in_primary: false,
    efficacy: { status: "not_computed", reason: "incomplete_after_non_retryable_timeout" },
    terminal_attempt: { arm: termination.terminal_attempt.arm, timed_out: termination.terminal_attempt.timed_out,
      retry_allowed: false, scored_outcome_historical: termination.terminal_attempt.scored_outcome },
    new_model_provider_calls: 0 };
  const erratumBody = { schema_version: 1, measurement_id: manifest.measurement_id,
    scope: "future_attempt_classification_only", historical_attempt_145_changed: false,
    historical_ledger_changed: false, primary_calculation_changed_by_erratum: false,
    corrected_precedence: ["timed_out=true", "scored_outcome=true",
      "oracle_validated_task_success=false", "retry_allowed=false"],
    clarification: "A timeout cannot become MODEL ACCESS REQUIRED from stdout, stderr, model text, activation output, or a provider response observed after a successful provider response.",
    frozen_terminal_attempt: { historical_scored_outcome: termination.terminal_attempt.scored_outcome,
      historical_model_access_required: termination.terminal_attempt.model_access_required,
      retry_allowed: termination.frozen_disposition.retry_allowed } };
  publishOutputs([
    { target: outputs.primaryReport, contents: `${JSON.stringify(publicReport, null, 2)}\n` },
    { target: outputs.pilotStatus, contents: `${JSON.stringify({ ...pilotStatusBody,
      pilot_status_fingerprint: fingerprint(pilotStatusBody) }, null, 2)}\n` },
    { target: outputs.runnerErratum, contents: `${JSON.stringify({ ...erratumBody,
      runner_erratum_fingerprint: fingerprint(erratumBody) }, null, 2)}\n` },
    { target: outputs.results, contents: renderResults(publicReport) },
  ]);
  const ledgerAfterWrite = Object.freeze({ sha256: sha256File(ledger.path), count: loadLedger(ledger.path).length });
  expect(canonicalJson(ledgerAfterWrite) === canonicalJson(ledgerBefore), "PRIMARY_REPORT_LEDGER",
    "historical ledger changed while reports were written");
  return Object.freeze({ status: "reported", decision: publicReport.decision,
    overall_label: publicReport.overall_label, primary_report_fingerprint: publicReport.report_fingerprint,
    ledger_sha256: ledgerAfterWrite.sha256, ledger_event_count: ledgerAfterWrite.count,
    new_model_provider_calls: 0 });
}

export const frozenPrimaryReportBindings = FROZEN;
