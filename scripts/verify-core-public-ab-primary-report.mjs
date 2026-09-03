#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { buildPrimaryReport, PrimaryReportError } from "../lib/benchmark/core-public-ab-primary-report.mjs";

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
function outcome(arm, success, overrides = {}) {
  return Object.freeze({
    oracle_validated_task_success: success,
    duration_ms: success ? 100 : 120,
    turn_count: 2,
    tool_call_count: 1,
    tokens: 10,
    usage_observed: true,
    timed_out: false,
    authentic_terminal_completion: true,
    process_containment_intact: true,
    no_surviving_descendants: true,
    mutation_scope_valid: true,
    task_specific_semantic_oracle_passed: success,
    hidden_data_leakage_observed: false,
    hidden_data_preflight_fingerprint: sha256("hidden-data-absent"),
    core_verification_receipt_authentic: arm === "core" ? true : null,
    core_verification_status: arm === "core" ? "passed" : null,
    ...overrides,
  });
}

const manifest = Object.freeze({
  measurement_id: "synthetic-primary-report",
  manifest_fingerprint: sha256("synthetic-frozen-manifest"),
  product_source_sha: "1".repeat(40),
  runner_source_sha: "2".repeat(40),
  runner_sha256: sha256("runner"),
  core_bundle_fingerprint: sha256("core"),
});
const validationPairs = Array.from({ length: 60 }, (_entry, index) => Object.freeze({
  identity_id: `synthetic-${index + 1}`,
  stratum: ["small", "medium", "high"][Math.floor(index / 20)],
  plain: outcome("plain", index < 30),
  core: outcome("core", index < 36),
}));

const completePrimary = buildPrimaryReport({
  manifest,
  validationPairs,
  pilotCompletePairs: 12,
  pilotTotalPairs: 29,
  ledgerSha256: sha256("synthetic-ledger"),
  ledgerEventCount: 435,
  modelProcessStarts: 145,
});
assert.equal(completePrimary.primary_status, "complete");
assert.equal(completePrimary.pilot_status, "incomplete_after_non_retryable_timeout");
assert.equal(completePrimary.overall_status, "primary_complete_pilot_incomplete");
assert.equal(completePrimary.primary_validation.pairs, 60);
assert.equal(completePrimary.pilot.used_in_primary, false);
assert.equal(completePrimary.pilot.efficacy.status, "not_computed");
assert.equal(completePrimary.model_call_accounting.new_model_provider_calls, 0);
assert.equal(completePrimary.regression_free_task_success.status, "not_computed");
assert.deepEqual(completePrimary.high_medium_critical_regressions,
  { status: "not_observable", count: null, rate: null });

assert.throws(() => buildPrimaryReport({
  manifest,
  validationPairs: validationPairs.slice(0, 59),
  pilotCompletePairs: 29,
  pilotTotalPairs: 29,
  ledgerSha256: sha256("synthetic-ledger"),
  ledgerEventCount: 435,
  modelProcessStarts: 178,
}), (error) => error instanceof PrimaryReportError && error.code === "PRIMARY_REPORT_VALIDATION_INCOMPLETE");

process.stdout.write(`${JSON.stringify({ status: "passed", synthetic_validation_pairs: 60,
  complete_validation_incomplete_pilot: "reported", incomplete_validation_complete_pilot: "rejected",
  bootstrap_resamples: completePrimary.primary_validation.bootstrap.resamples })}\n`);
