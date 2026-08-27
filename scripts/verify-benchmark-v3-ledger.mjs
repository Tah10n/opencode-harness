import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadBenchmarkV3Design } from "../lib/benchmark/v3-design.mjs";
import {
  appendBenchmarkV3LedgerEvent,
  createBenchmarkV3Ledger,
  freezeBenchmarkV3FinalCandidate,
  selectBenchmarkV3Candidate,
  validateBenchmarkV3Ledger,
} from "../lib/benchmark/v3-ledger.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { value: design, validation } = loadBenchmarkV3Design(root);
const fp = (value) => `sha256:${value.repeat(64)}`;
const registration = (id, fill) => ({
  candidate_id: id,
  architecture_fingerprint: fp(fill),
  product_bundle_fingerprint: fp(fill),
  source_sha: fill.repeat(40),
  registered_before_baseline: true,
  development_execution_count: 0,
});
const registrations = [registration("candidate-a", "a")];
const ledgerBinding = {
  campaignExecutionId: "campaign-execution-fixture-001",
  holdoutExecutionId: "holdout-execution-fixture-001",
  holdoutSelectionCommitmentFingerprint: fp("f"),
  armOrderPolicyFingerprint: fp("9"),
};
let ledger = createBenchmarkV3Ledger({
  design,
  designFingerprint: validation.design_fingerprint,
  campaignFingerprint: fp("c"),
  ...ledgerBinding,
  registrations,
});
const metrics = (overrides = {}) => ({
  paired_delta: 0.1,
  new_critical_regressions: 0,
  new_unclassified_semantic_regressions: 0,
  new_high_medium_upper_ci: 0.01,
  small_delta_lower_ci: 0,
  timeout_delta: 0,
  median_duration_ratio: 1.1,
  mean_duration_ratio: 1.2,
  activation_rate: 1,
  candidate_tokens: 100,
  duration_ms: 1000,
  candidate_attempt_count: 60,
  retried_family_count: 0,
  ...overrides,
});
const event = ({ id, candidate = registrations[0], type, stage, status, scored, retry = null, resultMetrics = null }) => ({
  event_id: `event-${id}`,
  event_type: type,
  candidate_id: candidate.candidate_id,
  attempt_id: `attempt-${id}`,
  retry_of_attempt_id: retry,
  stage,
  source_sha: candidate.source_sha,
  model: "fixture-model",
  provider: "fixture-provider",
  variant: "fixture-variant",
  seed: "frozen-seed",
  bindings_fingerprint: fp("d"),
  architecture_fingerprint: candidate.architecture_fingerprint,
  product_bundle_fingerprint: candidate.product_bundle_fingerprint,
  execution_id: stage === "holdout" ? ledgerBinding.holdoutExecutionId : ledgerBinding.campaignExecutionId,
  arm_order_schedule_fingerprint: stage === "acceptance" ? ledgerBinding.armOrderPolicyFingerprint : fp(stage === "validation" ? "7" : stage === "holdout" ? "8" : "6"),
  scored_outcome: scored,
  status,
  result_fingerprint: type === "infrastructure-failure-before-scoring" ? null : fp("e"),
  metrics: scored ? metrics(resultMetrics ?? {}) : null,
});

ledger = appendBenchmarkV3LedgerEvent(ledger, design, event({ id: "accept-a", type: "acceptance-probe", stage: "acceptance", status: "accepted", scored: false }));
ledger = appendBenchmarkV3LedgerEvent(ledger, design, event({ id: "infra-a", type: "infrastructure-failure-before-scoring", stage: "development", status: "infrastructure-failure", scored: false }));
ledger = appendBenchmarkV3LedgerEvent(ledger, design, event({ id: "dev-a", type: "development-execution", stage: "development", status: "scored", scored: true, retry: "attempt-infra-a" }));
ledger = selectBenchmarkV3Candidate(ledger, design);
assert.equal(ledger.selected_candidate_id, "candidate-a");
ledger = appendBenchmarkV3LedgerEvent(ledger, design, event({ id: "validation-a", type: "validation-execution", stage: "validation", status: "scored", scored: true }));
ledger = freezeBenchmarkV3FinalCandidate(ledger, design);
ledger = appendBenchmarkV3LedgerEvent(ledger, design, event({ id: "holdout-a", type: "holdout-execution", stage: "holdout", status: "scored", scored: true }));
assert.deepEqual(validateBenchmarkV3Ledger(ledger, design), {
  status: "validated",
  event_count: 5,
  architecture_slots_consumed: 1,
  infrastructure_failure_count: 1,
  scored_execution_count: 3,
  selected_candidate_id: "candidate-a",
  final_candidate_sha: registrations[0].source_sha,
});

let negativeCount = 0;
function rejects(label, operation) { assert.throws(operation, undefined, label); negativeCount += 1; }
const afterInfra = ledger.events.slice(0, 2).reduce((state, current) => appendBenchmarkV3LedgerEvent(state, design, current), createBenchmarkV3Ledger({ design, designFingerprint: validation.design_fingerprint, campaignFingerprint: fp("c"), ...ledgerBinding, registrations }));
rejects("retry cannot change seed", () => appendBenchmarkV3LedgerEvent(afterInfra, design, { ...event({ id: "bad-seed", type: "development-execution", stage: "development", status: "scored", scored: true, retry: "attempt-infra-a" }), seed: "changed-seed" }));
rejects("only one retry", () => appendBenchmarkV3LedgerEvent(appendBenchmarkV3LedgerEvent(afterInfra, design, event({ id: "retry-one", type: "development-execution", stage: "development", status: "scored", scored: true, retry: "attempt-infra-a" })), design, event({ id: "retry-two", type: "development-execution", stage: "development", status: "scored", scored: true, retry: "attempt-infra-a" })));
rejects("retry chains are forbidden", () => appendBenchmarkV3LedgerEvent(appendBenchmarkV3LedgerEvent(afterInfra, design, event({ id: "retry-infra", type: "infrastructure-failure-before-scoring", stage: "development", status: "infrastructure-failure", scored: false, retry: "attempt-infra-a" })), design, event({ id: "retry-chain", type: "development-execution", stage: "development", status: "scored", scored: true, retry: "attempt-retry-infra" })));
rejects("unlinked repeated infrastructure attempts are forbidden", () => appendBenchmarkV3LedgerEvent(afterInfra, design, event({ id: "unlinked-infra", type: "infrastructure-failure-before-scoring", stage: "development", status: "infrastructure-failure", scored: false })));
rejects("scored failure cannot relabel as infrastructure", () => appendBenchmarkV3LedgerEvent(afterInfra, design, event({ id: "fake-infra", type: "infrastructure-failure-before-scoring", stage: "development", status: "scored", scored: true })));
rejects("candidate architecture cannot relabel", () => appendBenchmarkV3LedgerEvent(afterInfra, design, { ...event({ id: "relabel", type: "development-execution", stage: "development", status: "scored", scored: true }), architecture_fingerprint: fp("e") }));
rejects("validation requires selection", () => appendBenchmarkV3LedgerEvent(afterInfra, design, event({ id: "early-validation", type: "validation-execution", stage: "validation", status: "scored", scored: true })));
rejects("selection summaries cannot be caller supplied", () => selectBenchmarkV3Candidate(afterInfra, design, [{ candidate_id: "candidate-a", paired_delta: 1 }]));
rejects("holdout requires exact frozen SHA", () => appendBenchmarkV3LedgerEvent(ledger, design, { ...event({ id: "reused-holdout", type: "holdout-execution", stage: "holdout", status: "scored", scored: true }), source_sha: "b".repeat(40) }));
rejects("validation cannot bind the holdout execution ID", () => appendBenchmarkV3LedgerEvent(afterInfra, design, {
  ...event({ id: "wrong-execution", type: "validation-execution", stage: "validation", status: "scored", scored: true }),
  execution_id: ledgerBinding.holdoutExecutionId,
}));
rejects("retry cannot change temporal order binding", () => appendBenchmarkV3LedgerEvent(afterInfra, design, {
  ...event({ id: "bad-order", type: "development-execution", stage: "development", status: "scored", scored: true, retry: "attempt-infra-a" }),
  arm_order_schedule_fingerprint: fp("0"),
}));

console.log(JSON.stringify({ status: "passed", evidence_class: "model-free-ledger-verification", model_execution: false, negative_cases: negativeCount }, null, 2));
