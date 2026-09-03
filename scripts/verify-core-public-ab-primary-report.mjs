#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { fingerprint } from "../lib/feedback/contracts.mjs";
import { buildPrimaryReport, PrimaryReportError,
  reportPrimaryCampaign } from "../lib/benchmark/core-public-ab-primary-report.mjs";

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function fileSha256(file) { return sha256(fs.readFileSync(file)); }
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

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "core-primary-report-fixture-"));
try {
  const campaignRoot = path.join(fixtureRoot, "campaign");
  const publicRoot = path.join(fixtureRoot, "public");
  fs.mkdirSync(path.join(campaignRoot, "receipts", "validation"), { recursive: true });
  fs.mkdirSync(publicRoot);
  const validationIds = Array.from({ length: 60 }, (_entry, index) => `validation-${index + 1}`);
  const pilotIds = Array.from({ length: 29 }, (_entry, index) => `pilot-${index + 1}`);
  const pilotManifestBody = { schema_version: 1, pilot_id: "synthetic-pilot" };
  const pilotManifest = { ...pilotManifestBody, pilot_manifest_fingerprint: fingerprint(pilotManifestBody) };
  const taskBindings = Object.fromEntries(validationIds.map((id) => [id, fingerprint({ task: id })]));
  const manifestBody = { schema_version: 1, measurement_id: "synthetic-primary-report-io",
    product_source_sha: "3".repeat(40), runner_source_sha: "4".repeat(40), runner_sha256: sha256("io-runner"),
    core_bundle_fingerprint: sha256("io-core"), provider: "openai", model: "synthetic", variant: "low",
    primary_metric: "oracle_validated_task_success",
    excluded_metrics: { regression_free_task_success: { status: "not_computed",
      reason: "no frozen independent severity oracle" } },
    validation_family_ids: validationIds, real_pilot_identity_ids: pilotIds,
    real_pilot_manifest_fingerprint: pilotManifest.pilot_manifest_fingerprint,
    bootstrap_resamples: 100000, task_binding_fingerprints: { validation: taskBindings } };
  const ioManifest = { ...manifestBody, manifest_fingerprint: fingerprint(manifestBody) };
  const manifestFile = path.join(fixtureRoot, "measurement-manifest.json");
  const pilotManifestFile = path.join(fixtureRoot, "pilot-manifest.json");
  writeJson(manifestFile, ioManifest); writeJson(pilotManifestFile, pilotManifest);

  const records = []; let previousHash = null;
  const append = (event) => {
    const body = { schema_version: 1, sequence: records.length + 1, previous_hash: previousHash, ...event };
    const record = { ...body, event_hash: fingerprint(body) };
    records.push(record); previousHash = record.event_hash;
  };
  for (let index = 0; index < validationIds.length; index += 1) {
    const identityId = validationIds[index]; const stratum = ["small", "medium", "high"][Math.floor(index / 20)];
    for (const arm of ["plain", "core"]) {
      const attemptIndex = 1; const attemptId = `validation-${identityId}-${arm}-${attemptIndex}`;
      const attemptBinding = fingerprint({ schema_version: 1, manifest_fingerprint: ioManifest.manifest_fingerprint,
        pilot_manifest_fingerprint: pilotManifest.pilot_manifest_fingerprint, dataset: "validation",
        identity_id: identityId, arm, attempt_index: attemptIndex, retry_of: null,
        task_fingerprint: taskBindings[identityId] });
      const success = arm === "plain" ? index < 30 : index < 36;
      const body = { schema_version: 1, dataset: "validation", identity_id: identityId, stratum, arm,
        attempt_index: attemptIndex, attempt_id: attemptId, retry_of_attempt_id: null,
        attempt_binding_fingerprint: attemptBinding, oracle_validated_task_success: success,
        scored_outcome: true, reconciliation_required: false, authentic_terminal_completion: true,
        timed_out: false, process_containment_intact: true, no_surviving_descendants: true,
        mutation_scope_valid: true, task_specific_semantic_oracle_passed: success,
        hidden_data_leakage_observed: false, hidden_data_preflight_fingerprint: sha256("hidden-absent"),
        duration_ms: 100 + index, turn_count: 2, tool_call_count: 1, tokens: 10, usage_observed: true,
        core_verification_receipt_authentic: arm === "core" ? true : null,
        core_verification_status: arm === "core" ? "passed" : null };
      const receipt = { ...body, outcome_fingerprint: fingerprint(body) };
      const receiptFile = path.join(campaignRoot, "receipts", "validation", identityId, `${arm}-attempt-1.json`);
      writeJson(receiptFile, receipt);
      append({ event_type: "attempt-completed", attempt_id: attemptId, dataset: "validation",
        identity_id: identityId, stratum, arm, attempt_index: attemptIndex,
        outcome_fingerprint: receipt.outcome_fingerprint, receipt_sha256: fileSha256(receiptFile),
        scored_outcome: true, reconciliation_required: false });
    }
  }
  for (const identityId of pilotIds.slice(0, 12)) {
    for (const arm of ["plain", "core"]) append({ event_type: "attempt-completed",
      attempt_id: `pilot-${identityId}-${arm}-1`, dataset: "pilot", identity_id: identityId,
      arm, attempt_index: 1, scored_outcome: true, reconciliation_required: false });
  }
  for (let index = 0; index < 145; index += 1) append({ event_type: "model-process-started",
    attempt_id: `model-process-${index + 1}` });
  const ledgerFile = path.join(campaignRoot, "attempt-ledger.jsonl");
  fs.writeFileSync(ledgerFile, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
  const expected = { measurement_id: ioManifest.measurement_id, manifest_fingerprint: ioManifest.manifest_fingerprint,
    product_source_sha: ioManifest.product_source_sha, runner_source_sha: ioManifest.runner_source_sha,
    runner_sha256: ioManifest.runner_sha256, core_bundle_fingerprint: ioManifest.core_bundle_fingerprint,
    ledger_event_count: records.length, ledger_sha256: fileSha256(ledgerFile), validation_pairs: 60,
    pilot_pairs_complete: 12, pilot_pairs_total: 29 };
  const termination = { schema_version: 1, measurement_id: ioManifest.measurement_id,
    status: "incomplete_after_non_retryable_timeout", manifest_fingerprint: ioManifest.manifest_fingerprint,
    runner_source_sha: ioManifest.runner_source_sha, runner_sha256: ioManifest.runner_sha256,
    product_source_sha: ioManifest.product_source_sha,
    model_binding: { provider: "openai", model: "synthetic", variant: "low" },
    observed_accounting: { model_process_starts: 145, completed_attempts: 145, scored_outcomes: 144,
      unscored_outcomes: 1, infrastructure_retries: 0, validation_scored_outcomes: 120,
      pilot_scored_outcomes: 24 },
    terminal_attempt: { dataset: "pilot", arm: "core", attempt_index: 1, timed_out: true,
      scored_outcome: false, model_access_required: true, reconciliation_required: false },
    frozen_disposition: { retry_allowed: false, attempt_ledger_sha256: expected.ledger_sha256,
      attempt_ledger_event_count: expected.ledger_event_count } };
  const terminationFile = path.join(fixtureRoot, "termination.json"); writeJson(terminationFile, termination);
  const outputs = { primaryReport: path.join(publicRoot, "primary.json"), pilotStatus: path.join(publicRoot, "pilot.json"),
    runnerErratum: path.join(publicRoot, "erratum.json"), results: path.join(publicRoot, "results.md") };
  const reported = reportPrimaryCampaign({ manifest: manifestFile, pilotManifest: pilotManifestFile,
    campaignRoot, terminationRecord: terminationFile, outputs }, expected);
  assert.equal(reported.status, "reported");
  assert(Object.values(outputs).every((file) => fs.lstatSync(file).isFile()));
  assert.equal(fileSha256(ledgerFile), expected.ledger_sha256);

  const partialRoot = path.join(fixtureRoot, "partial-output"); fs.mkdirSync(partialRoot);
  const blockedPilot = path.join(partialRoot, "pilot.json"); fs.writeFileSync(blockedPilot, "existing\n");
  const partialOutputs = { primaryReport: path.join(partialRoot, "primary.json"), pilotStatus: blockedPilot,
    runnerErratum: path.join(partialRoot, "erratum.json"), results: path.join(partialRoot, "results.md") };
  assert.throws(() => reportPrimaryCampaign({ manifest: manifestFile, pilotManifest: pilotManifestFile,
    campaignRoot, terminationRecord: terminationFile, outputs: partialOutputs }, expected),
  (error) => error instanceof PrimaryReportError && error.code === "PRIMARY_REPORT_IMMUTABLE");
  assert.equal(fs.existsSync(partialOutputs.primaryReport), false);

  const evidenceOutput = path.join(campaignRoot, "report-target"); fs.mkdirSync(evidenceOutput);
  const link = path.join(fixtureRoot, "output-link"); fs.symlinkSync(evidenceOutput, link, "dir");
  const symlinkOutputs = { primaryReport: path.join(link, "primary.json"),
    pilotStatus: path.join(partialRoot, "pilot-2.json"), runnerErratum: path.join(partialRoot, "erratum-2.json"),
    results: path.join(partialRoot, "results-2.md") };
  assert.throws(() => reportPrimaryCampaign({ manifest: manifestFile, pilotManifest: pilotManifestFile,
    campaignRoot, terminationRecord: terminationFile, outputs: symlinkOutputs }, expected),
  (error) => error instanceof PrimaryReportError && error.code === "PRIMARY_REPORT_OUTPUT");
  assert.equal(fs.readdirSync(evidenceOutput).length, 0);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({ status: "passed", synthetic_validation_pairs: 60,
  complete_validation_incomplete_pilot: "reported", incomplete_validation_complete_pilot: "rejected",
  filesystem_transaction_and_symlink_boundaries: "passed",
  bootstrap_resamples: completePrimary.primary_validation.bootstrap.resamples })}\n`);
