import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  acceptancePolicyFingerprint,
  assessCandidate,
  permissionSurfaceFingerprint,
  validateDecisionDocument,
  writeDecisionArtifacts,
} from "../lib/feedback/acceptance.mjs";
import {
  EVIDENCE_PRODUCERS,
  ContractError,
  fingerprint,
} from "../lib/feedback/contracts.mjs";
import { permissionProfileFingerprint } from "../lib/feedback/evidence.mjs";
import { createReportHistory } from "../lib/feedback/report-history.mjs";
import { ProcessTreeTeardownError } from "../lib/feedback/process-tree.mjs";
import { captureStaticEvidence, repositoryStateFingerprint } from "./capture-static-evidence.mjs";

const createdAt = "2026-07-10T00:00:00Z";
const candidateRepositoryFingerprint = fingerprint({ repository: "candidate" });

function canonicalScenario(scenarioId, repetitions = 1) {
  return {
    id: scenarioId,
    repetitions,
    scenario_id: scenarioId,
    failure_family: scenarioId === "target-a" ? "target-family" : `${scenarioId}-family`,
    version: 1,
  };
}

function canonicalScenarios() {
  return [
    canonicalScenario("target-a"),
    canonicalScenario("development-swap"),
    canonicalScenario("held-a"),
    canonicalScenario("canary-a"),
    canonicalScenario("runner-self-test"),
  ];
}

function reportAttestation(report) {
  const generation = `${report.evaluation_run_id}-generation`;
  const marker = {
    schema_version: 1,
    generation,
    evaluation_run_id: report.evaluation_run_id,
    report_fingerprint: fingerprint(report),
    json_text_fingerprint: fingerprint(`${JSON.stringify(report, null, 2)}\n`),
    markdown_fingerprint: fingerprint(`# report ${report.evaluation_run_id}\n`),
    json_file: `${generation}.json`,
    markdown_file: `${generation}.md`,
    completed_at: createdAt,
  };
  return {
    ...Object.fromEntries(Object.entries(marker).filter(([key]) => !["schema_version", "completed_at"].includes(key))),
    marker_fingerprint: fingerprint(marker),
    marker,
  };
}

function commandResult(checkId, status = "passed") {
  return {
    check_id: checkId,
    status,
    exit_code: status === "unavailable" ? null : status === "passed" ? 0 : 1,
    stdout_chars: status === "unavailable" ? 0 : 12,
    stderr_chars: status === "passed" || status === "unavailable" ? 0 : 8,
  };
}

function unavailableMetadata() {
  return { available: false, value: null };
}

function refreshResult(result) {
  const checks = [...result.setup_results, ...result.visible_results, ...result.hidden_results];
  result.visible_pass_rate = result.visible_results.length === 0
    ? 1
    : result.visible_results.filter((entry) => entry.status === "passed").length / result.visible_results.length;
  result.hidden_pass_rate = result.hidden_results.filter((entry) => entry.status === "passed").length / result.hidden_results.length;
  result.defect_escape_rate = result.hidden_results.some((entry) => entry.status !== "passed") ? 1 : 0;
  result.status = result.adapter_classification === "unavailable" || checks.some((entry) => entry.status === "unavailable")
    ? "incomplete"
    : result.adapter_classification === "passed" && checks.every((entry) => entry.status === "passed")
      ? "passed"
      : "failed";
  result.incomplete_evidence = result.status === "incomplete" ? ["check-unavailable"] : [];
  return result;
}

function resultFor(scenarioId, role, {
  hiddenStatuses = ["passed", "passed"],
  cost = 10,
  duration = 100,
  profileFingerprint,
  repositoryFingerprint = candidateRepositoryFingerprint,
} = {}) {
  return refreshResult({
    scenario_id: scenarioId,
    repetition: 1,
    profile_role: role,
    repository_fingerprint: repositoryFingerprint,
    profile_fingerprint: profileFingerprint,
    operational_run_id: `${role}-${scenarioId}-run`,
    scenario_fingerprint: fingerprint(canonicalScenario(scenarioId)),
    status: "passed",
    adapter_classification: "passed",
    setup_results: [commandResult(`${scenarioId}.setup.1`)],
    visible_results: [commandResult(`${scenarioId}.visible.1`)],
    hidden_results: hiddenStatuses.map((status, index) => commandResult(`${scenarioId}.hidden.${index + 1}`, status)),
    visible_pass_rate: 1,
    hidden_pass_rate: 1,
    defect_escape_rate: 0,
    duration_ms: duration,
    cost: { available: true, value: cost, currency: "USD" },
    model: unavailableMetadata(),
    tool: unavailableMetadata(),
    incomplete_evidence: [],
  });
}

function suiteManifest() {
  return {
    schema_version: 1,
    manifest_version: "test-v1",
    suites: {
      development: ["target-a", "development-swap"],
      held_out: ["held-a"],
      canary: ["canary-a"],
      infrastructure: ["runner-self-test"],
    },
  };
}

function policy() {
  return {
    schema_version: 1,
    policy_version: "test-v1",
    required_suites: ["development", "held_out", "canary"],
    target: {
      failure_family: "target-family",
      scenario_ids: ["target-a"],
      minimum_improvement: 1,
    },
    expected_producer_ids: {
      live_evaluation: EVIDENCE_PRODUCERS.liveEvaluation,
      infrastructure_self_test: EVIDENCE_PRODUCERS.infrastructureSelfTest,
      static_verification: EVIDENCE_PRODUCERS.staticVerification,
      permission_snapshot: EVIDENCE_PRODUCERS.runtimePermissionSnapshot,
    },
  };
}

function staticEvidence() {
  return {
    schema_version: 1,
    producer_id: EVIDENCE_PRODUCERS.staticVerification,
    source: "local_verify",
    candidate_id: "candidate-profile",
    repository_fingerprint: candidateRepositoryFingerprint,
    command_id: "npm-run-verify",
    passed: true,
    complete: true,
    created_at: createdAt,
    duration_ms: 50,
  };
}

function permissionSnapshot(
  profileId,
  permissions = { bash: "ask", edit: "allow" },
  source = "installed_runtime",
  { subjectFingerprint = fingerprint({ repository: profileId }), runtimeFingerprint = fingerprint({ runtime: profileId }) } = {},
) {
  const surfaceFingerprint = permissionSurfaceFingerprint(permissions);
  return {
    schema_version: 1,
    producer_id: EVIDENCE_PRODUCERS.runtimePermissionSnapshot,
    source,
    profile_id: profileId,
    subject_fingerprint: subjectFingerprint,
    runtime_fingerprint: runtimeFingerprint,
    surface_fingerprint: surfaceFingerprint,
    profile_fingerprint: permissionProfileFingerprint({
      subjectFingerprint,
      runtimeFingerprint,
      surfaceFingerprint,
    }),
    permissions,
    complete: true,
    incomplete_scopes: [],
    created_at: createdAt,
  };
}

function liveReport(profileFingerprints) {
  const results = [];
  for (const role of ["baseline", "candidate"]) {
    results.push(resultFor("target-a", role, {
      hiddenStatuses: role === "baseline" ? ["failed", "passed"] : ["passed", "passed"],
      profileFingerprint: profileFingerprints[role],
    }));
    results.push(resultFor("development-swap", role, {
      hiddenStatuses: ["failed", "passed"],
      profileFingerprint: profileFingerprints[role],
    }));
    results.push(resultFor("held-a", role, { profileFingerprint: profileFingerprints[role] }));
    results.push(resultFor("canary-a", role, { profileFingerprint: profileFingerprints[role] }));
  }
  return {
    schema_version: 1,
    evaluation_run_id: "evaluation-test",
    created_at: createdAt,
    provenance: {
      producer_id: EVIDENCE_PRODUCERS.liveEvaluation,
      evidence_kind: "live",
      complete: true,
    },
    results,
  };
}

function baseInputs() {
  const baselinePermissionSnapshot = permissionSnapshot("baseline-profile");
  const candidatePermissionSnapshot = permissionSnapshot("candidate-profile", undefined, undefined, {
    subjectFingerprint: candidateRepositoryFingerprint,
  });
  const report = liveReport({
      baseline: baselinePermissionSnapshot.profile_fingerprint,
      candidate: candidatePermissionSnapshot.profile_fingerprint,
    });
  return {
    reports: [report],
    reportAttestations: [reportAttestation(report)],
    staticEvidence: staticEvidence(),
    baselinePermissionSnapshot,
    candidatePermissionSnapshot,
    policy: policy(),
    suiteManifest: suiteManifest(),
    canonicalScenarios: canonicalScenarios(),
    baselineId: "baseline-profile",
    candidateId: "candidate-profile",
    clock: () => createdAt,
    idFactory: () => "decision-test",
  };
}

function replacePermissionSnapshot(inputs, role, snapshot) {
  inputs[`${role}PermissionSnapshot`] = snapshot;
  for (const result of inputs.reports.flatMap((report) => report.results).filter((entry) => entry.profile_role === role)) {
    result.profile_fingerprint = snapshot.profile_fingerprint;
  }
}

function candidateResult(inputs, scenarioId) {
  return inputs.reports[0].results.find(
    (entry) => entry.profile_role === "candidate" && entry.scenario_id === scenarioId,
  );
}

function setCheckStatus(check, status) {
  check.status = status;
  check.exit_code = status === "unavailable" ? null : status === "passed" ? 0 : 1;
  check.stdout_chars = status === "unavailable" ? 0 : 12;
  check.stderr_chars = status === "passed" || status === "unavailable" ? 0 : 8;
}

function assertDecision(inputs, expected, reasonCode, { refreshAttestations = true } = {}) {
  if (refreshAttestations) inputs.reportAttestations = inputs.reports.map(reportAttestation);
  const decision = assessCandidate(inputs);
  assert.equal(decision.decision, expected);
  assert(decision.reason_codes.includes(reasonCode), `${reasonCode} missing from ${decision.reason_codes.join(", ")}`);
  return decision;
}

function assertContractError(callback, expectedCode) {
  assert.throws(callback, (error) => error instanceof ContractError && error.code === expectedCode);
}

function reversedObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reversedObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, nested]) => [key, reversedObjectKeys(nested)]));
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-candidate-assessment-"));
const tests = [];

function test(name, callback) {
  tests.push([name, callback]);
}

test("accepted candidate and immutable decision artifacts", () => {
  const decision = assertDecision(baseInputs(), "accepted", "ACCEPTED");
  assert.deepEqual(decision.paired_scenario_repetition_keys, [
    "canary-a#1",
    "development-swap#1",
    "held-a#1",
    "target-a#1",
  ]);
  const inputs = baseInputs();
  assert.equal(decision.profile_fingerprints.baseline, inputs.baselinePermissionSnapshot.profile_fingerprint);
  assert.equal(decision.profile_fingerprints.candidate, inputs.candidatePermissionSnapshot.profile_fingerprint);
  const outputDirectory = path.join(tempRoot, "decisions");
  const artifacts = writeDecisionArtifacts({ decision, workspaceRoot: tempRoot, outputDirectory });
  assert(fs.existsSync(artifacts.jsonPath));
  assert(fs.existsSync(artifacts.markdownPath));
  assert(fs.existsSync(artifacts.markerPath));
  const marker = JSON.parse(fs.readFileSync(artifacts.markerPath, "utf8"));
  assert.equal(marker.decision_fingerprint, fingerprint(decision));
  assert.match(decision.scenario_corpus_fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.match(decision.pair_universe_fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert(decision.input_report_fingerprints.every((entry) => entry.artifact_attestation_fingerprint !== null));
  assertContractError(
    () => writeDecisionArtifacts({ decision, workspaceRoot: tempRoot, outputDirectory }),
    "FILES_IMMUTABLE_EXISTS",
  );
});

test("unattested or artifact-mismatched live reports are inconclusive", () => {
  const missing = baseInputs();
  missing.reportAttestations = [];
  const missingDecision = assertDecision(missing, "inconclusive", "UNTRUSTED_LIVE_REPORT", { refreshAttestations: false });
  assert.equal(missingDecision.input_report_fingerprints[0].artifact_attestation_fingerprint, null);

  const tampered = baseInputs();
  tampered.reportAttestations[0].markdown_fingerprint = fingerprint("tampered markdown");
  const tamperedDecision = assertDecision(tampered, "inconclusive", "UNTRUSTED_LIVE_REPORT", { refreshAttestations: false });
  assert.equal(tamperedDecision.input_report_fingerprints[0].artifact_attestation_fingerprint, null);

  const mixed = baseInputs();
  const unattestedExtra = structuredClone(mixed.reports[0]);
  unattestedExtra.evaluation_run_id = "evaluation-unattested-extra";
  mixed.reports.push(unattestedExtra);
  const mixedDecision = assertDecision(mixed, "inconclusive", "UNTRUSTED_LIVE_REPORT", { refreshAttestations: false });
  assert.equal(mixedDecision.hard_gates.evidence_identity.status, "inconclusive");
  assert.equal(mixedDecision.input_report_fingerprints.filter((entry) => entry.artifact_attestation_fingerprint === null).length, 1);
});

test("decision writer rejects a non-existing output below a linked parent before creating outside artifacts", () => {
  const workspaceRoot = path.join(tempRoot, "decision-confined-workspace");
  const outsideRoot = path.join(tempRoot, "decision-outside");
  fs.mkdirSync(workspaceRoot);
  fs.mkdirSync(outsideRoot);
  const sentinelPath = path.join(outsideRoot, "sentinel.txt");
  fs.writeFileSync(sentinelPath, "unchanged\n", "utf8");
  const linkedParent = path.join(workspaceRoot, "linked-parent");
  fs.symlinkSync(outsideRoot, linkedParent, process.platform === "win32" ? "junction" : "dir");
  const escapedOutput = path.join(linkedParent, "decisions");
  const decision = assessCandidate(baseInputs());
  assertContractError(
    () => writeDecisionArtifacts({ decision, workspaceRoot, outputDirectory: escapedOutput }),
    "FILES_SYMLINK",
  );
  assert.deepEqual(fs.readdirSync(outsideRoot), ["sentinel.txt"]);
  assert.equal(fs.readFileSync(sentinelPath, "utf8"), "unchanged\n");
  assert.equal(fs.existsSync(path.join(outsideRoot, "decisions")), false);
});

test("canonical repetitions define the pair universe and cannot be lowered by report omission", () => {
  const inputs = baseInputs();
  inputs.canonicalScenarios = inputs.canonicalScenarios.map((scenario) => (
    scenario.id === "target-a" ? canonicalScenario("target-a", 2) : scenario
  ));
  const targetFingerprint = fingerprint(canonicalScenario("target-a", 2));
  for (const result of inputs.reports[0].results.filter((entry) => entry.scenario_id === "target-a")) {
    result.scenario_fingerprint = targetFingerprint;
  }
  const decision = assertDecision(inputs, "inconclusive", "MISSING_REQUIRED_PAIR");
  assert(decision.hard_gates.required_pairs.missing_pair_keys.includes("target-a#2"));
  assert.notEqual(decision.pair_universe_fingerprint, assessCandidate(baseInputs()).pair_universe_fingerprint);
});

test("canary regression rejects", () => {
  const inputs = baseInputs();
  const candidate = candidateResult(inputs, "canary-a");
  setCheckStatus(candidate.visible_results[0], "failed");
  refreshResult(candidate);
  assertDecision(inputs, "rejected", "CANARY_REGRESSION");
});

test("canary adapter timeout remains inconclusive even when regression is observed", () => {
  const inputs = baseInputs();
  const candidate = candidateResult(inputs, "canary-a");
  candidate.adapter_classification = "timed_out";
  for (const check of [...candidate.visible_results, ...candidate.hidden_results]) {
    setCheckStatus(check, "unavailable");
  }
  refreshResult(candidate);
  assert.equal(candidate.status, "incomplete");
  const decision = assertDecision(inputs, "inconclusive", "CANARY_REGRESSION");
  assert(decision.reason_codes.includes("INCOMPLETE_REQUIRED_PAIR"));
});

test("held-out regression rejects", () => {
  const inputs = baseInputs();
  const candidate = candidateResult(inputs, "held-a");
  setCheckStatus(candidate.visible_results[0], "failed");
  refreshResult(candidate);
  assertDecision(inputs, "rejected", "HELD_OUT_REGRESSION");
});

test("same-rate swapped hidden failure rejects by check_id", () => {
  const inputs = baseInputs();
  const candidate = candidateResult(inputs, "development-swap");
  setCheckStatus(candidate.hidden_results[0], "passed");
  setCheckStatus(candidate.hidden_results[1], "failed");
  refreshResult(candidate);
  assert.equal(candidate.hidden_pass_rate, 0.5);
  const baseline = inputs.reports[0].results.find(
    (entry) => entry.profile_role === "baseline" && entry.scenario_id === "development-swap",
  );
  assert.equal(baseline.hidden_pass_rate, candidate.hidden_pass_rate);
  const decision = assertDecision(inputs, "rejected", "NEW_HIDDEN_CHECK_FAILURE");
  assert.deepEqual(decision.hard_gates.hidden_check_regressions.failures, [
    "development-swap#1:development-swap.hidden.2",
  ]);
});

test("proven common hidden failure remains inconclusive with a mismatched check set", () => {
  const inputs = baseInputs();
  const candidate = candidateResult(inputs, "development-swap");
  setCheckStatus(candidate.hidden_results[0], "passed");
  setCheckStatus(candidate.hidden_results[1], "failed");
  candidate.hidden_results.push(commandResult("development-swap.hidden.3"));
  refreshResult(candidate);
  const decision = assertDecision(inputs, "inconclusive", "NEW_HIDDEN_CHECK_FAILURE");
  assert(decision.reason_codes.includes("MISMATCHED_CHECK_IDS"));
});

test("mismatched check set cannot prove an outer-status-only regression", () => {
  const inputs = baseInputs();
  const candidate = candidateResult(inputs, "canary-a");
  candidate.visible_results.push(commandResult("canary-a.visible.2", "failed"));
  refreshResult(candidate);
  const decision = assertDecision(inputs, "inconclusive", "MISMATCHED_CHECK_IDS");
  assert(!decision.reason_codes.includes("CANARY_REGRESSION"));
});

test("cost ceiling rejects", () => {
  const inputs = baseInputs();
  inputs.policy.cost_ceiling = { maximum_ratio: 1.1, currency: "USD" };
  for (const result of inputs.reports[0].results.filter((entry) => entry.profile_role === "candidate")) {
    result.cost.value = 20;
  }
  assertDecision(inputs, "rejected", "COST_CEILING_EXCEEDED");
});

test("duration ceiling rejects", () => {
  const inputs = baseInputs();
  inputs.policy.duration_ceiling = { maximum_ratio: 1.1 };
  for (const result of inputs.reports[0].results.filter((entry) => entry.profile_role === "candidate")) {
    result.duration_ms = 200;
  }
  assertDecision(inputs, "rejected", "DURATION_CEILING_EXCEEDED");
});

test("proven absolute ceiling failure remains inconclusive with a missing pair", () => {
  const inputs = baseInputs();
  inputs.policy.cost_ceiling = { maximum_candidate_total: 5, currency: "USD" };
  inputs.reports[0].results = inputs.reports[0].results.filter(
    (entry) => !(entry.profile_role === "candidate" && entry.scenario_id === "canary-a"),
  );
  const decision = assertDecision(inputs, "inconclusive", "COST_CEILING_EXCEEDED");
  assert(decision.reason_codes.includes("MISSING_REQUIRED_PAIR"));
});

test("missing static evidence is inconclusive", () => {
  const inputs = baseInputs();
  inputs.staticEvidence = null;
  assertDecision(inputs, "inconclusive", "MISSING_STATIC_VERIFICATION");
});

test("malformed static evidence is inconclusive", () => {
  const inputs = baseInputs();
  inputs.staticEvidence.unexpected = true;
  assertDecision(inputs, "inconclusive", "INVALID_STATIC_VERIFICATION");
});

test("proven static failure remains inconclusive with other missing evidence", () => {
  const inputs = baseInputs();
  inputs.staticEvidence.passed = false;
  inputs.candidatePermissionSnapshot = null;
  const decision = assertDecision(inputs, "inconclusive", "STATIC_VERIFICATION_FAILED");
  assert(decision.reason_codes.includes("MISSING_CANDIDATE_PERMISSION_SNAPSHOT"));
});

test("missing permission evidence is inconclusive", () => {
  const inputs = baseInputs();
  inputs.candidatePermissionSnapshot = null;
  assertDecision(inputs, "inconclusive", "MISSING_CANDIDATE_PERMISSION_SNAPSHOT");
});

test("incomplete baseline/candidate pairs are inconclusive", () => {
  const inputs = baseInputs();
  inputs.reports[0].results = inputs.reports[0].results.filter(
    (entry) => !(entry.profile_role === "candidate" && entry.scenario_id === "canary-a"),
  );
  assertDecision(inputs, "inconclusive", "MISSING_REQUIRED_PAIR");
});

test("malformed report is rejected", () => {
  const inputs = baseInputs();
  inputs.reports[0].unexpected = true;
  assertContractError(() => assessCandidate(inputs), "CONTRACT_UNKNOWN_FIELD");
});

test("inconsistent role profile fingerprints are rejected", () => {
  const inputs = baseInputs();
  candidateResult(inputs, "canary-a").profile_fingerprint = fingerprint({ profile: "different-candidate" });
  assertContractError(() => assessCandidate(inputs), "ACCEPTANCE_PROFILE_FINGERPRINT");
});

test("identical baseline and candidate profile fingerprints are rejected", () => {
  const inputs = baseInputs();
  const baselineFingerprint = inputs.reports[0].results.find((entry) => entry.profile_role === "baseline").profile_fingerprint;
  for (const result of inputs.reports[0].results.filter((entry) => entry.profile_role === "candidate")) {
    result.profile_fingerprint = baselineFingerprint;
  }
  assertContractError(() => assessCandidate(inputs), "ACCEPTANCE_PROFILE_FINGERPRINT");
});

test("passed check with nonzero exit code is rejected", () => {
  const inputs = baseInputs();
  inputs.reports[0].results[0].hidden_results[1].exit_code = 1;
  assertContractError(() => assessCandidate(inputs), "ACCEPTANCE_EXIT_STATUS");
});

test("failed check with zero exit code is rejected", () => {
  const inputs = baseInputs();
  inputs.reports[0].results[0].hidden_results[0].exit_code = 0;
  assertContractError(() => assessCandidate(inputs), "ACCEPTANCE_EXIT_STATUS");
});

test("timed-out check with non-null exit code is rejected", () => {
  const inputs = baseInputs();
  const check = inputs.reports[0].results[0].hidden_results[0];
  check.status = "timed_out";
  check.exit_code = 1;
  assertContractError(() => assessCandidate(inputs), "ACCEPTANCE_EXIT_STATUS");
});

test("duplicate report pair is rejected", () => {
  const inputs = baseInputs();
  inputs.reports[0].results.push(structuredClone(inputs.reports[0].results[0]));
  assertContractError(() => assessCandidate(inputs), "ACCEPTANCE_DUPLICATE_PAIR");
});

test("duplicate check_id is rejected", () => {
  const inputs = baseInputs();
  inputs.reports[0].results[0].hidden_results.push(structuredClone(inputs.reports[0].results[0].hidden_results[0]));
  assertContractError(() => assessCandidate(inputs), "ACCEPTANCE_DUPLICATE_CHECK");
});

test("policy fingerprint is stable across key order", () => {
  const original = policy();
  const reordered = reversedObjectKeys(original);
  assert.equal(acceptancePolicyFingerprint(original), acceptancePolicyFingerprint(reordered));
});

test("shuffled results still pair by scenario and repetition", () => {
  const inputs = baseInputs();
  const repetitionTwo = inputs.reports[0].results
    .filter((entry) => entry.scenario_id === "target-a")
    .map((entry) => ({
      ...structuredClone(entry),
      repetition: 2,
      operational_run_id: `${entry.profile_role}-target-a-repetition-2-run`,
    }));
  inputs.reports[0].results.push(...repetitionTwo);
  inputs.reports[0].results.reverse();
  inputs.canonicalScenarios = inputs.canonicalScenarios.map((scenario) => (
    scenario.id === "target-a" ? canonicalScenario("target-a", 2) : scenario
  ));
  const targetFingerprint = fingerprint(canonicalScenario("target-a", 2));
  for (const result of inputs.reports[0].results.filter((entry) => entry.scenario_id === "target-a")) {
    result.scenario_fingerprint = targetFingerprint;
  }
  const decision = assertDecision(inputs, "accepted", "ACCEPTED");
  assert.equal(decision.metric_deltas.target_success_rate.delta, 1);
  assert(decision.paired_scenario_repetition_keys.includes("target-a#2"));
});

test("scenario fingerprint mismatch cannot prove an apparent regression", () => {
  const inputs = baseInputs();
  const candidate = candidateResult(inputs, "canary-a");
  setCheckStatus(candidate.visible_results[0], "failed");
  refreshResult(candidate);
  candidate.scenario_fingerprint = fingerprint({ scenario_id: "canary-a", version: 2 });
  const decision = assertDecision(inputs, "inconclusive", "MISMATCHED_SCENARIO_FINGERPRINT");
  assert(!decision.reason_codes.includes("CANARY_REGRESSION"));
});

test("permission widening rejects", () => {
  const inputs = baseInputs();
  replacePermissionSnapshot(inputs, "candidate", permissionSnapshot(
    "candidate-profile",
    { bash: "allow", edit: "allow" },
    "installed_runtime",
    { subjectFingerprint: candidateRepositoryFingerprint },
  ));
  const decision = assertDecision(inputs, "rejected", "PERMISSION_SURFACE_WIDENED");
  assert.deepEqual(decision.hard_gates.permission_surface.widened_permissions, ["bash"]);
});

test("permission key mismatch is inconclusive even when a shared key widens", () => {
  const inputs = baseInputs();
  replacePermissionSnapshot(inputs, "candidate", permissionSnapshot(
    "candidate-profile",
    { bash: "allow", extra: "deny" },
    "installed_runtime",
    { subjectFingerprint: candidateRepositoryFingerprint },
  ));
  const decision = assertDecision(inputs, "inconclusive", "PERMISSION_KEYS_MISMATCH");
  assert(decision.reason_codes.includes("PERMISSION_SURFACE_WIDENED"));
  assert.deepEqual(decision.hard_gates.permission_surface.widened_permissions, ["bash"]);
});

test("known nested bash widening rejects on an equal-key complete surface", () => {
  const inputs = baseInputs();
  replacePermissionSnapshot(inputs, "baseline", permissionSnapshot(
    "baseline-profile",
    { "bash.git_*": "deny", "external_directory.*": "ask" },
  ));
  replacePermissionSnapshot(inputs, "candidate", permissionSnapshot(
    "candidate-profile",
    { "bash.git_*": "allow", "external_directory.*": "ask" },
    "installed_runtime",
    { subjectFingerprint: candidateRepositoryFingerprint },
  ));
  const decision = assertDecision(inputs, "rejected", "PERMISSION_SURFACE_WIDENED");
  assert.deepEqual(decision.hard_gates.permission_surface.widened_permissions, ["bash.git_*"]);
});

test("candidate permission subject mismatch is evidence-identity inconclusive", () => {
  const inputs = baseInputs();
  replacePermissionSnapshot(inputs, "candidate", permissionSnapshot("candidate-profile"));
  const decision = assertDecision(inputs, "inconclusive", "MISMATCHED_CANDIDATE_EVIDENCE_FINGERPRINT");
  assert.equal(decision.hard_gates.evidence_identity.status, "inconclusive");
  assert(decision.missing_evidence.includes("evidence_identity:candidate:permission_subject_fingerprint"));
});

test("candidate live repository mismatch is evidence-identity inconclusive", () => {
  const inputs = baseInputs();
  for (const result of inputs.reports[0].results.filter((entry) => entry.profile_role === "candidate")) {
    result.repository_fingerprint = fingerprint({ repository: "other-candidate-content" });
  }
  assertDecision(inputs, "inconclusive", "MISMATCHED_CANDIDATE_EVIDENCE_FINGERPRINT");
});

test("baseline live repository mismatch uses the baseline identity reason", () => {
  const inputs = baseInputs();
  for (const result of inputs.reports[0].results.filter((entry) => entry.profile_role === "baseline")) {
    result.repository_fingerprint = fingerprint({ repository: "other-baseline-run-content" });
  }
  assertDecision(inputs, "inconclusive", "MISMATCHED_BASELINE_EVIDENCE_FINGERPRINT");
});

test("live profile label cannot replace matching permission content attestation", () => {
  const inputs = baseInputs();
  const unrelated = fingerprint({ profile: "same-label-different-content" });
  for (const result of inputs.reports[0].results.filter((entry) => entry.profile_role === "baseline")) {
    result.profile_fingerprint = unrelated;
  }
  assertDecision(inputs, "inconclusive", "MISMATCHED_BASELINE_EVIDENCE_FINGERPRINT");
});

test("incomplete permission snapshot is explicit and inconclusive", () => {
  const inputs = baseInputs();
  const snapshot = structuredClone(inputs.candidatePermissionSnapshot);
  snapshot.complete = false;
  snapshot.incomplete_scopes = ["agent.general"];
  replacePermissionSnapshot(inputs, "candidate", snapshot);
  assertDecision(inputs, "inconclusive", "INCOMPLETE_CANDIDATE_PERMISSION_SNAPSHOT");
});

test("unknown permission action is invalid evidence and never accepted", () => {
  const inputs = baseInputs();
  replacePermissionSnapshot(inputs, "candidate", permissionSnapshot(
    "candidate-profile",
    { bash: "ask", edit: "allow", previously_unlisted_tool: "sometimes" },
    "installed_runtime",
    { subjectFingerprint: candidateRepositoryFingerprint },
  ));
  assertDecision(inputs, "inconclusive", "INVALID_CANDIDATE_PERMISSION_SNAPSHOT");
});

test("mandatory inconclusive identity overrides a complete permission failure", () => {
  const inputs = baseInputs();
  replacePermissionSnapshot(inputs, "candidate", permissionSnapshot(
    "candidate-profile",
    { bash: "allow", edit: "allow" },
    "installed_runtime",
    { subjectFingerprint: candidateRepositoryFingerprint },
  ));
  for (const result of inputs.reports[0].results.filter((entry) => entry.profile_role === "candidate")) {
    result.repository_fingerprint = fingerprint({ repository: "mismatched-live-content" });
  }
  const decision = assertDecision(inputs, "inconclusive", "PERMISSION_SURFACE_WIDENED");
  assert(decision.reason_codes.includes("MISMATCHED_CANDIDATE_EVIDENCE_FINGERPRINT"));
  const forged = { ...decision, decision: "rejected" };
  assertContractError(() => validateDecisionDocument(forged), "ACCEPTANCE_DECISION_CONSISTENCY");
});

test("live result requires a repository fingerprint", () => {
  const inputs = baseInputs();
  delete inputs.reports[0].results[0].repository_fingerprint;
  assertContractError(() => assessCandidate(inputs), "CONTRACT_MISSING_FIELD");
});

test("fixture permission snapshot is untrusted for acceptance", () => {
  const inputs = baseInputs();
  replacePermissionSnapshot(inputs, "candidate", permissionSnapshot(
    "candidate-profile",
    { bash: "ask", edit: "allow" },
    "fixture",
    { subjectFingerprint: candidateRepositoryFingerprint },
  ));
  assertDecision(inputs, "inconclusive", "UNTRUSTED_CANDIDATE_PERMISSION_SNAPSHOT");
});

test("infrastructure evidence cannot support behavioral acceptance", () => {
  const inputs = baseInputs();
  inputs.reports[0].provenance = {
    producer_id: EVIDENCE_PRODUCERS.infrastructureSelfTest,
    evidence_kind: "infrastructure_self_test",
    complete: true,
  };
  assertDecision(inputs, "inconclusive", "MISSING_REQUIRED_PAIR");
});

test("untrusted live producer is inconclusive", () => {
  const inputs = baseInputs();
  inputs.reports[0].provenance.producer_id = "example/untrusted-live-v1";
  assertDecision(inputs, "inconclusive", "UNTRUSTED_LIVE_REPORT");
});

test("incomplete live provenance is inconclusive", () => {
  const inputs = baseInputs();
  inputs.reports[0].provenance.complete = false;
  assertDecision(inputs, "inconclusive", "INCOMPLETE_LIVE_REPORT");
});

test("first-party static producer records only strict evidence", async () => {
  const workspaceRoot = path.join(tempRoot, "static-workspace");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const fixedFingerprint = fingerprint({ repository: "temp" });
  let monotonicCalls = 0;
  const snapshotRoot = path.join(tempRoot, "static-snapshot");
  fs.mkdirSync(snapshotRoot);
  const result = await captureStaticEvidence({
    workspaceRoot,
    candidateId: "candidate-profile",
    runVerify: (verifyRoot) => {
      assert.equal(verifyRoot, snapshotRoot);
      return { status: 0, signal: null, error: undefined };
    },
    clock: () => createdAt,
    idFactory: () => "static-test",
    fingerprintRepository: () => fixedFingerprint,
    materializeSnapshot: () => ({
      snapshotRoot,
      repositoryFingerprint: fixedFingerprint,
      verifyIntegrity: () => {},
      cleanup: () => fs.rmSync(snapshotRoot, { recursive: true, force: true }),
    }),
    monotonicNow: () => [0n, 25_000_000n][monotonicCalls++],
  });
  assert.equal(result.evidence.passed, true);
  assert.equal(result.evidence.complete, true);
  assert.equal(result.evidence.duration_ms, 25);
  assert.equal(result.evidence.source, "local_verify");
  assert.deepEqual(Object.keys(result.evidence).sort(), [
    "candidate_id",
    "command_id",
    "complete",
    "created_at",
    "duration_ms",
    "passed",
    "producer_id",
    "repository_fingerprint",
    "schema_version",
    "source",
  ]);
  assert(fs.existsSync(result.outputPath));
});

test("static snapshot cleanup retries transient failures before evidence publication", async () => {
  const workspaceRoot = path.join(tempRoot, "static-cleanup-retry-workspace");
  const snapshotRoot = path.join(tempRoot, "static-cleanup-retry-snapshot");
  fs.mkdirSync(workspaceRoot);
  fs.mkdirSync(snapshotRoot);
  const fixedFingerprint = fingerprint({ repository: "cleanup-retry" });
  let cleanupCalls = 0;
  const result = await captureStaticEvidence({
    workspaceRoot,
    candidateId: "cleanup-retry-candidate",
    runVerify: () => ({ status: 0, signal: null, error: undefined }),
    clock: () => createdAt,
    idFactory: () => "cleanup-retry-static",
    fingerprintRepository: () => fixedFingerprint,
    materializeSnapshot: () => ({
      snapshotRoot,
      repositoryFingerprint: fixedFingerprint,
      verifyIntegrity: () => {},
      cleanup: () => {
        cleanupCalls += 1;
        if (cleanupCalls < 3) throw new Error("transient cleanup failure");
        fs.rmSync(snapshotRoot, { recursive: true, force: true });
      },
    }),
    monotonicNow: (() => { let call = 0; return () => [0n, 1_000_000n][call++]; })(),
  });
  assert.equal(cleanupCalls, 3);
  assert.equal(result.evidence.complete, true);
  assert.equal(fs.existsSync(snapshotRoot), false);
});

test("permanent snapshot cleanup failure stops publication and surfaces a bounded recovery entry", async () => {
  const workspaceRoot = path.join(tempRoot, "static-cleanup-failure-workspace");
  const snapshotParent = path.join(tempRoot, "opencode-harness-static-permanent-failure");
  const snapshotRoot = path.join(snapshotParent, "repository");
  fs.mkdirSync(workspaceRoot);
  fs.mkdirSync(snapshotRoot, { recursive: true });
  fs.writeFileSync(path.join(snapshotRoot, "source.txt"), "temporary source copy\n", "utf8");
  const fixedFingerprint = fingerprint({ repository: "cleanup-failure" });
  await assert.rejects(captureStaticEvidence({
    workspaceRoot,
    candidateId: "cleanup-failure-candidate",
    runVerify: () => ({ status: 0, signal: null, error: undefined }),
    fingerprintRepository: () => fixedFingerprint,
    materializeSnapshot: () => ({
      snapshotRoot,
      repositoryFingerprint: fixedFingerprint,
      verifyIntegrity: () => {},
      cleanup: () => { throw new Error("persistent cleanup failure"); },
    }),
  }), (error) => (
    error instanceof ContractError
    && error.code === "STATIC_EVIDENCE_CLEANUP"
    && error.message.includes("opencode-harness-static-permanent-failure")
    && !error.message.includes(tempRoot)
  ));
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".oc_harness", "evidence")), false);
  fs.rmSync(snapshotParent, { recursive: true, force: true });
});

test("static timeout and unverified teardown publish no evidence", async () => {
  for (const [label, runVerify, expectedCode] of [
    [
      "timeout",
      () => ({ status: null, signal: null, error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }), timed_out: true }),
      "STATIC_EVIDENCE_TIMEOUT",
    ],
    [
      "teardown",
      () => { throw new ProcessTreeTeardownError(); },
      "STATIC_EVIDENCE_TEARDOWN_UNVERIFIED",
    ],
  ]) {
    const workspaceRoot = path.join(tempRoot, `static-${label}-workspace`);
    const snapshotRoot = path.join(tempRoot, `static-${label}-snapshot`);
    fs.mkdirSync(workspaceRoot);
    fs.mkdirSync(snapshotRoot);
    const fixedFingerprint = fingerprint({ repository: label });
    await assert.rejects(captureStaticEvidence({
      workspaceRoot,
      candidateId: `${label}-candidate`,
      runVerify,
      fingerprintRepository: () => fixedFingerprint,
      materializeSnapshot: () => ({
        snapshotRoot,
        repositoryFingerprint: fixedFingerprint,
        verifyIntegrity: () => {},
        cleanup: () => fs.rmSync(snapshotRoot, { recursive: true, force: true }),
      }),
    }), (error) => error instanceof ContractError && error.code === expectedCode);
    assert.equal(fs.existsSync(path.join(workspaceRoot, ".oc_harness")), false, `${label} published evidence`);
  }
});

test("repository fingerprint covers tracked and untracked candidate state", () => {
  const workspaceRoot = path.join(tempRoot, "fingerprint-workspace");
  fs.mkdirSync(workspaceRoot);
  const runGit = (args) => {
    const result = spawnSync("git", args, { cwd: workspaceRoot, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
  };
  runGit(["init", "--quiet"]);
  fs.writeFileSync(path.join(workspaceRoot, "tracked.txt"), "tracked\n", "utf8");
  runGit(["add", "tracked.txt"]);
  runGit([
    "-c", "user.name=Harness Test",
    "-c", "user.email=harness@example.invalid",
    "-c", "commit.gpgsign=false",
    "commit", "--quiet", "-m", "initial",
  ]);
  const clean = repositoryStateFingerprint(workspaceRoot);
  fs.writeFileSync(path.join(workspaceRoot, "untracked.txt"), "first\n", "utf8");
  const untracked = repositoryStateFingerprint(workspaceRoot);
  fs.writeFileSync(path.join(workspaceRoot, "untracked.txt"), "second\n", "utf8");
  const changed = repositoryStateFingerprint(workspaceRoot);
  assert.notEqual(clean, untracked);
  assert.notEqual(untracked, changed);
});

test("static verification reads an immutable external snapshot despite source mutation and restore", async () => {
  const workspaceRoot = path.join(tempRoot, "snapshot-workspace");
  fs.mkdirSync(workspaceRoot);
  const runGit = (args) => {
    const result = spawnSync("git", args, { cwd: workspaceRoot, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
  };
  runGit(["init", "--quiet"]);
  const sentinelPath = path.join(workspaceRoot, "sentinel.txt");
  fs.writeFileSync(sentinelPath, "captured\n", "utf8");
  runGit(["add", "sentinel.txt"]);
  runGit([
    "-c", "user.name=Harness Test",
    "-c", "user.email=harness@example.invalid",
    "-c", "commit.gpgsign=false",
    "commit", "--quiet", "-m", "initial",
  ]);
  let verifyRootSeen = null;
  const result = await captureStaticEvidence({
    workspaceRoot,
    candidateId: "snapshot-candidate",
    runVerify: (verifyRoot) => {
      verifyRootSeen = verifyRoot;
      assert.notEqual(path.resolve(verifyRoot), path.resolve(workspaceRoot));
      fs.writeFileSync(sentinelPath, "mutated-during-verify\n", "utf8");
      assert.equal(fs.readFileSync(path.join(verifyRoot, "sentinel.txt"), "utf8"), "captured\n");
      fs.writeFileSync(sentinelPath, "captured\n", "utf8");
      return { status: 0, signal: null, error: undefined };
    },
    clock: () => createdAt,
    idFactory: () => "snapshot-static",
  });
  assert.equal(result.evidence.passed, true);
  assert.equal(result.evidence.complete, true);
  assert(verifyRootSeen && !fs.existsSync(path.dirname(verifyRootSeen)), "snapshot temporary root must be cleaned");
});

test("static evidence fails closed when verification mutates the materialized snapshot", async () => {
  const workspaceRoot = path.join(tempRoot, "snapshot-mutation-workspace");
  fs.mkdirSync(workspaceRoot);
  const runGit = (args) => {
    const result = spawnSync("git", args, { cwd: workspaceRoot, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
  };
  runGit(["init", "--quiet"]);
  fs.writeFileSync(path.join(workspaceRoot, "tracked.txt"), "stable\n", "utf8");
  runGit(["add", "tracked.txt"]);
  runGit([
    "-c", "user.name=Harness Test",
    "-c", "user.email=harness@example.invalid",
    "-c", "commit.gpgsign=false",
    "commit", "--quiet", "-m", "initial",
  ]);
  const result = await captureStaticEvidence({
    workspaceRoot,
    candidateId: "snapshot-mutator",
    runVerify: (verifyRoot) => {
      fs.writeFileSync(path.join(verifyRoot, "unexpected-generated.txt"), "unexpected\n", "utf8");
      return { status: 0, signal: null, error: undefined };
    },
    clock: () => createdAt,
    idFactory: () => "snapshot-mutated",
  });
  assert.equal(result.evidence.passed, false);
  assert.equal(result.evidence.complete, false);
});

test("candidate CLI writes a confined immutable artifact set", () => {
  const cliRoot = path.join(tempRoot, "cli-workspace");
  fs.mkdirSync(cliRoot, { recursive: true });
  const inputs = baseInputs();
  const canonical = inputs.canonicalScenarios.map((scenario) => ({
    id: scenario.id,
    description: `Canonical ${scenario.id} scenario for acceptance CLI verification.`,
    risk_tags: ["standard", "acceptance-fixture"],
    failure_family: scenario.id === "target-a" ? "target-family" : `${scenario.id}-family`,
    workspace_policy: { mode: "read_only" },
    repo_fixture: "fixtures/sample-project",
    task: `Assess ${scenario.id} without changing the canonical evidence contract.`,
    setup_commands: [],
    visible_checks: ["node --version"],
    hidden_checks: ["node --version"],
    hidden_check_files: [{
      source: `evals/hidden/${scenario.id}/hidden.txt`,
      target: `.live-hidden/${scenario.id}.txt`,
    }],
    hidden_trace_assertions: [{
      assertion_id: `${scenario.id}-verification-present`,
      op: "event_exists",
      event_type: "verification",
    }],
    timeout: 60000,
    repetitions: scenario.repetitions,
    expected_contracts: ["Canonical evidence remains bound to this scenario."],
    forbidden_regressions: ["Do not accept evidence from a different scenario corpus."],
  }));
  fs.mkdirSync(path.join(cliRoot, "fixtures", "sample-project"), { recursive: true });
  fs.mkdirSync(path.join(cliRoot, "evals", "scenarios"), { recursive: true });
  for (const scenario of canonical) {
    const hiddenDirectory = path.join(cliRoot, "evals", "hidden", scenario.id);
    fs.mkdirSync(hiddenDirectory, { recursive: true });
    fs.writeFileSync(path.join(hiddenDirectory, "hidden.txt"), "runner-owned\n", "utf8");
    fs.writeFileSync(
      path.join(cliRoot, "evals", "scenarios", `${scenario.id}.json`),
      `${JSON.stringify(scenario, null, 2)}\n`,
      "utf8",
    );
  }
  fs.writeFileSync(
    path.join(cliRoot, "evals", "suites.json"),
    `${JSON.stringify(inputs.suiteManifest, null, 2)}\n`,
    "utf8",
  );
  for (const result of inputs.reports[0].results) {
    result.scenario_fingerprint = fingerprint(canonical.find((scenario) => scenario.id === result.scenario_id));
  }
  const values = {
    static: inputs.staticEvidence,
    baseline: inputs.baselinePermissionSnapshot,
    candidate: inputs.candidatePermissionSnapshot,
    policy: inputs.policy,
  };
  const paths = {};
  for (const [name, value] of Object.entries(values)) {
    paths[name] = path.join(cliRoot, `${name}.json`);
    fs.writeFileSync(paths[name], `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
  const reportDirectory = path.join(cliRoot, "evals", "reports");
  const history = createReportHistory({
    workspaceRoot: cliRoot,
    reportDir: reportDirectory,
    clock: () => createdAt,
    idFactory: () => "cli-report",
  });
  const reportArtifact = history.write(inputs.reports[0]);
  const cliPath = path.resolve("scripts/assess-candidate.mjs");
  const commonArgs = [
    "--static-evidence", paths.static,
    "--baseline-permissions", paths.baseline,
    "--candidate-permissions", paths.candidate,
    "--policy", paths.policy,
    "--baseline-id", "baseline-profile",
    "--candidate-id", "candidate-profile",
  ];
  const result = spawnSync(process.execPath, [
    cliPath,
    "--report", reportArtifact.jsonPath,
    ...commonArgs,
    "--output-dir", "decisions",
  ], { cwd: cliRoot, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const artifacts = fs.readdirSync(path.join(cliRoot, "decisions"));
  assert.equal(artifacts.filter((name) => name.endsWith(".complete.json")).length, 1);
  assert.equal(artifacts.filter((name) => name.endsWith(".json") && !name.endsWith(".complete.json")).length, 1);
  assert.equal(artifacts.filter((name) => name.endsWith(".md")).length, 1);

  const markerlessPath = path.join(reportDirectory, "markerless.json");
  fs.writeFileSync(markerlessPath, `${JSON.stringify(inputs.reports[0], null, 2)}\n`, "utf8");
  const markerless = spawnSync(process.execPath, [
    cliPath,
    "--report", markerlessPath,
    ...commonArgs,
    "--output-dir", "decisions-markerless",
  ], { cwd: cliRoot, encoding: "utf8", windowsHide: true });
  assert.equal(markerless.status, 2, markerless.stderr);
  const markerlessDecisionFile = fs.readdirSync(path.join(cliRoot, "decisions-markerless"))
    .find((name) => name.endsWith(".json") && !name.endsWith(".complete.json"));
  const markerlessDecision = JSON.parse(fs.readFileSync(path.join(cliRoot, "decisions-markerless", markerlessDecisionFile), "utf8"));
  assert.equal(markerlessDecision.decision, "inconclusive");
  assert(markerlessDecision.reason_codes.includes("UNTRUSTED_LIVE_REPORT"));

  fs.appendFileSync(reportArtifact.mdPath, "tampered\n", "utf8");
  const tampered = spawnSync(process.execPath, [
    cliPath,
    "--report", reportArtifact.jsonPath,
    ...commonArgs,
    "--output-dir", "decisions-tampered",
  ], { cwd: cliRoot, encoding: "utf8", windowsHide: true });
  assert.equal(tampered.status, 2, tampered.stderr);
  const tamperedDecisionFile = fs.readdirSync(path.join(cliRoot, "decisions-tampered"))
    .find((name) => name.endsWith(".json") && !name.endsWith(".complete.json"));
  const tamperedDecision = JSON.parse(fs.readFileSync(path.join(cliRoot, "decisions-tampered", tamperedDecisionFile), "utf8"));
  assert(tamperedDecision.reason_codes.includes("UNTRUSTED_LIVE_REPORT"));

  const override = spawnSync(process.execPath, [
    cliPath,
    "--report", markerlessPath,
    ...commonArgs,
    "--expected-pairs", "forged.json",
    "--output-dir", "decisions-forged",
  ], { cwd: cliRoot, encoding: "utf8", windowsHide: true });
  assert.equal(override.status, 1);
  assert.match(`${override.stdout}\n${override.stderr}`, /ACCEPTANCE_CLI_ARGUMENT/);
});

let passed = 0;
try {
  for (const [name, callback] of tests) {
    await callback();
    passed += 1;
    console.log(`ok - ${name}`);
  }
  console.log(`Candidate assessment verification passed (${passed}/${tests.length}).`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
