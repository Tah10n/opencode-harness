import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  SYNTHETIC_AGENT_TIMEOUT_MAX_MS,
  loadSyntheticContracts,
} from "../lib/benchmark/contracts.mjs";
import { fingerprint } from "../lib/feedback/contracts.mjs";
import {
  loadSyntheticTemplateSet,
  renderSyntheticInstance,
} from "../lib/benchmark/renderer.mjs";
import {
  syntheticEffectivePublicInputFingerprint,
} from "../lib/benchmark/runner.mjs";
import {
  buildSyntheticSuitePlan,
  counterbalancedProfileSchedule,
} from "../lib/benchmark/suite-plan.mjs";
import {
  cleanupSyntheticProfile,
  materializeSyntheticProfile,
} from "../lib/benchmark/profiles.mjs";
import {
  SYNTHETIC_OPENCODE_ADAPTER_VERSION,
  syntheticOpenCodeAdapterFingerprint,
} from "../lib/benchmark/opencode-adapter.mjs";
import {
  publishSyntheticRunArtifacts,
  renderSyntheticRunCsv,
  renderSyntheticRunMarkdown,
  validateSyntheticRunReport,
  validateSyntheticRunReportSourceBinding,
} from "../lib/benchmark/reporting.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fp(value) {
  return fingerprint({ fixture: value });
}

function modelBindingFingerprint({
  provider,
  model,
  variant,
}) {
  return fingerprint({
    schema: "synthetic-model-binding-v1",
    provider,
    model,
    variant,
  });
}

function passedOutcome() {
  return { status: "passed", passed: true, violations: [] };
}

function reviewMatchAudit(check) {
  return {
    strategy: "semantic-concept-one-to-one-v2",
    candidate_count: 1,
    oracle_count: check.expected_findings.length,
    matched_count: check.expected_findings.length,
    severity_calibrated_count: check.expected_findings.length,
    location_calibrated_count: check.expected_findings.length,
    oracle_fingerprint: fingerprint(check.expected_findings),
  };
}

function auditEvidence(profileId, suffix, instance) {
  const changedAllowedPaths = instance.task_scope.mode === "edit"
    ? [...instance.task_scope.allowed_changed_paths]
    : [];
  const scope = {
    mode: instance.task_scope.mode,
    allowed_changed_paths: [...instance.task_scope.allowed_changed_paths],
    max_changed_files: instance.task_scope.max_changed_files,
    observation_status: "available",
    changed_allowed_paths: changedAllowedPaths,
    changed_path_count: changedAllowedPaths.length,
    changed_paths_fingerprint: fingerprint({
      schema: "synthetic-changed-paths-v1",
      paths: changedAllowedPaths,
    }),
    unexpected_path_count: 0,
    unexpected_path_ids: [],
    unexpected_path_ids_complete: true,
    forbidden_path_count: 0,
    forbidden_path_ids: [],
    forbidden_path_ids_complete: true,
    violation_codes: [],
  };
  const instrumented = profileId === "instrumented";
  const control = {
    classification: instrumented ? "attested" : "absent",
    session_count: instrumented ? 1 : 0,
    registration_count: instrumented ? 1 : 0,
    registration_only_count: 0,
    owner_session_count: instrumented ? 1 : 0,
    child_session_count: 0,
    attested_owner_count: instrumented ? 1 : 0,
    control_state_fingerprint: instrumented ? fp(`control-${suffix}`) : null,
    violation_codes: [],
  };
  const reviewMatch = instance.visible_check.kind === "structured-review"
    ? {
        visible: reviewMatchAudit(instance.visible_check),
        hidden: reviewMatchAudit(instance.hidden_check),
      }
    : null;
  const source = { scope, control, review_match: reviewMatch };
  return { ...source, fingerprint: fingerprint(source) };
}

function successfulResult(profileId, profileFingerprint, suffix, instance) {
  return {
    profile_id: profileId,
    profile_fingerprint: profileFingerprint,
    operational_run_id: `op-${suffix}`,
    execution_status: "completed",
    termination_reason: "verified",
    reason: null,
    cli_version: "1.17.0",
    adapter_evidence_observed: true,
    adapter_completed_correctly: true,
    agent_reported_success: true,
    claimed_completion: true,
    claimed_outcome_availability: "available",
    explicit_block: false,
    explicit_failure: false,
    termination_acceptable: true,
    visible_check: passedOutcome(),
    hidden_check: passedOutcome(),
    workspace_policy: passedOutcome(),
    common_safety: passedOutcome(),
    treatment_compliance: passedOutcome(),
    trace_policy: passedOutcome(),
    teardown: passedOutcome(),
    cleanup: passedOutcome(),
    hidden_safety_failed: false,
    task_evidence_complete: true,
    task_correct: true,
    evidence_complete: true,
    whole_task_success: true,
    defect_escape_v2: false,
    false_block: null,
    audit_evidence: auditEvidence(profileId, suffix, instance),
    fingerprints: {
      adapter: syntheticOpenCodeAdapterFingerprint(),
      initial_workspace: fp("initial"),
      final_workspace: fp(`final-${suffix}`),
      trace: fp(`trace-${suffix}`),
    },
    metrics: {
      total_tool_call_count: 3,
      task_action_call_count: 3,
      computational_control_call_count: 0,
      subagent_call_count: 0,
      discretionary_delegation_count: 0,
      runner_assigned_delegation_count: 0,
      context_read_count: null,
      permission_request_count: null,
      model_turn_count: 1,
      continuation_turn_count: profileId === "instrumented" ? 1 : 0,
      dangerous_command_count: 0,
      network_action_count: 0,
      hidden_access_attempt_count: 0,
      workspace_mutation_count: 1,
      fix_command_count: 1,
      repository_instruction_action_count: 0,
      secret_write_count: 0,
      duration_ms: 10,
      cost_usd: null,
      availability: {
        context_reads: "unavailable",
        permission_requests: "unavailable",
        network_actions: "available",
        cost: "unavailable",
      },
    },
    operational_trace_id: `trace-${suffix}`,
  };
}

function pairId(identity) {
  return fingerprint({
    schema: "synthetic-pair-identity-v2",
    family_id: identity.family_id,
    semantic_variant_id: identity.semantic_variant_id,
    semantic_variant_fingerprint: identity.semantic_variant_fingerprint,
    trajectory_id: identity.trajectory_id,
    trajectory_fingerprint: identity.trajectory_fingerprint,
    generated_fixture_fingerprint: identity.generated_fixture_fingerprint,
    trajectory_repetition: identity.trajectory_repetition,
  });
}

function bindPairToInstance(pair, instance) {
  pair.identity = {
    family_id: instance.family_id,
    category: instance.category,
    risk: instance.risk,
    source_class: instance.source_class,
    semantic_variant_id: instance.semantic_variant_id,
    semantic_variant_fingerprint: instance.semantic_variant_fingerprint,
    trajectory_id: instance.trajectory_id,
    trajectory_fingerprint: instance.trajectory_fingerprint,
    generated_fixture_fingerprint: instance.generated_fixture_fingerprint,
    trajectory_repetition: instance.repetition,
  };
  pair.pair_id = pairId(pair.identity);
  pair.binding.public_fixture_fingerprint = instance.public_fixture_fingerprint;
  pair.binding.hidden_fixture_fingerprint = instance.hidden_fixture_fingerprint;
  pair.binding.task_scope_fingerprint = fingerprint(instance.task_scope);
}

function canonicalProfileFingerprint(sourceRoot, profileId) {
  const materialized = materializeSyntheticProfile({ sourceRoot, profileId });
  try {
    return materialized.profileFingerprint;
  } finally {
    cleanupSyntheticProfile(materialized);
  }
}

export function completeReport(
  contracts,
  templateSet,
  runId = "reporting-self-test",
  sourceRoot = defaultRoot,
  suiteId = "smoke",
) {
  const baselineFingerprint = canonicalProfileFingerprint(sourceRoot, "plain");
  const candidateFingerprint = canonicalProfileFingerprint(sourceRoot, "instrumented");
  const suite = contracts.suites.find((entry) => entry.id === suiteId);
  assert(suite);
  const seed = "reporting-self-test";
  const plan = buildSyntheticSuitePlan({
    contracts,
    templateSet,
    suiteId: suite.id,
    seed,
    baselineProfileId: "plain",
    candidateProfileId: "instrumented",
  });
  const { instances } = plan;
  const orderByPairId = new Map(plan.schedule.map((entry) => [entry.pair_id, entry.order]));
  const pairs = instances.map((instance) => {
    const identity = {
      family_id: instance.family_id,
      category: instance.category,
      risk: instance.risk,
      source_class: instance.source_class,
      semantic_variant_id: instance.semantic_variant_id,
      semantic_variant_fingerprint: instance.semantic_variant_fingerprint,
      trajectory_id: instance.trajectory_id,
      trajectory_fingerprint: instance.trajectory_fingerprint,
      generated_fixture_fingerprint: instance.generated_fixture_fingerprint,
      trajectory_repetition: instance.repetition,
    };
    const currentPairId = pairId(identity);
    return {
      pair_id: currentPairId,
      identity,
      order: [...orderByPairId.get(currentPairId)],
      binding: {
        public_fixture_fingerprint: instance.public_fixture_fingerprint,
        hidden_fixture_fingerprint: instance.hidden_fixture_fingerprint,
        task_scope_fingerprint: fingerprint(instance.task_scope),
        effective_public_input_fingerprint: syntheticEffectivePublicInputFingerprint(instance),
        initial_public_manifest_fingerprint: fp("initial"),
        model_fingerprint: modelBindingFingerprint({
          provider: "fixture",
          model: "fixture/model",
          variant: null,
        }),
        executable_fingerprint: fp("executable"),
        executable_version: "1.17.0",
        executable_basename: "opencode",
        executable_platform: "linux",
        executable_identity_policy_version: 2,
        timeout_ms: 60_000,
        limits_fingerprint: fp("limits"),
        adapter_protocol_version: SYNTHETIC_OPENCODE_ADAPTER_VERSION,
      },
      complete: true,
      incomplete_reasons: [],
      baseline: successfulResult(
        "plain",
        baselineFingerprint,
        `${instance.family_id}-${instance.semantic_variant_id}-${instance.repetition}-plain`,
        instance,
      ),
      candidate: successfulResult(
        "instrumented",
        candidateFingerprint,
        `${instance.family_id}-${instance.semantic_variant_id}-${instance.repetition}-instrumented`,
        instance,
      ),
    };
  });
  return {
    schema_version: 5,
    report_kind: "synthetic-paired-run",
    run_id: runId,
    generation_id: plan.generation_id,
    created_at: "2026-01-01T00:00:00.000Z",
    suite: {
      id: suite.id,
      manifest_fingerprint: contracts.fingerprints.suites,
      template_set_fingerprint: fingerprint(templateSet),
      comparison_policy_fingerprint: contracts.fingerprints.comparison_policy,
      profile_inventory_fingerprint: contracts.fingerprints.inventory,
      seed,
      semantic_variants: suite.semantic_variants,
      trajectory_repetitions: suite.trajectory_repetitions,
      declared_pair_count: pairs.length,
    },
    execution: {
      provider: "fixture",
      model: "fixture/model",
      variant: null,
      timeout_ms: 60_000,
      limits_fingerprint: fp("limits"),
      adapter_protocol_version: SYNTHETIC_OPENCODE_ADAPTER_VERSION,
      executable_fingerprint: fp("executable"),
      executable_version: "1.17.0",
      executable_basename: "opencode",
      executable_platform: "linux",
      executable_identity_policy_version: 2,
      model_tool_availability: {
        opencode: "available",
        model: "available",
        cost: "unavailable",
      },
    },
    profiles: {
      baseline: { id: "plain", fingerprint: baselineFingerprint },
      candidate: { id: "instrumented", fingerprint: candidateFingerprint },
    },
    complete: true,
    incomplete_reasons: [],
    pair_count: pairs.length,
    pairs,
    residual_caveats: [
      "context-reads-unavailable",
      "cost-unavailable",
      "permission-requests-unavailable",
    ],
  };
}

function incompleteReport(contracts, templateSet, sourceRoot = defaultRoot) {
  const report = structuredClone(completeReport(
    contracts,
    templateSet,
    "reporting-incomplete-test",
    sourceRoot,
  ));
  const candidate = report.pairs[0].candidate;
  Object.assign(candidate, {
    execution_status: "blocked_external_state",
    termination_reason: "blocked_external_state",
    reason: "opencode_not_found",
    cli_version: null,
    adapter_evidence_observed: false,
    adapter_completed_correctly: false,
    agent_reported_success: null,
    claimed_completion: false,
    claimed_outcome_availability: "unavailable",
    explicit_block: false,
    explicit_failure: false,
    termination_acceptable: false,
    common_safety: {
      status: "incomplete",
      passed: null,
      violations: ["common_safety_unobserved"],
    },
    treatment_compliance: {
      status: "not_run",
      passed: null,
      violations: ["control_not_observed"],
    },
    trace_policy: {
      status: "incomplete",
      passed: null,
      violations: ["trace_evidence_incomplete"],
    },
    task_evidence_complete: false,
    task_correct: false,
    evidence_complete: false,
    whole_task_success: false,
    false_block: null,
    fingerprints: {
      ...candidate.fingerprints,
      adapter: null,
    },
    metrics: {
      ...candidate.metrics,
      total_tool_call_count: null,
      task_action_call_count: null,
      computational_control_call_count: null,
      subagent_call_count: null,
      discretionary_delegation_count: null,
      runner_assigned_delegation_count: null,
      model_turn_count: null,
      continuation_turn_count: null,
      dangerous_command_count: null,
      network_action_count: null,
      hidden_access_attempt_count: null,
      workspace_mutation_count: null,
      fix_command_count: null,
      repository_instruction_action_count: null,
      secret_write_count: null,
      duration_ms: null,
      availability: {
        ...candidate.metrics.availability,
        network_actions: "unavailable",
      },
    },
  });
  report.pairs[0].complete = false;
  report.pairs[0].incomplete_reasons = ["candidate-evidence-incomplete"];
  report.complete = false;
  report.incomplete_reasons = ["pair-evidence-incomplete"];
  return report;
}

function mustReject(value, code) {
  assert.throws(
    () => validateSyntheticRunReport(value),
    (error) => error?.code === code,
  );
}

function rebindAudit(result) {
  result.audit_evidence.fingerprint = fingerprint({
    scope: result.audit_evidence.scope,
    control: result.audit_evidence.control,
    review_match: result.audit_evidence.review_match,
  });
}

function preseedRunFiles(root, report, contents, count) {
  const runRoot = path.join(root, "reports", "runs", report.run_id);
  fs.mkdirSync(runRoot, { recursive: true });
  const entries = [
    ["report.json", `${JSON.stringify(report, null, 2)}\n`],
    ["report.md", contents.markdown],
    ["pairs.csv", contents.csv],
  ];
  for (const [name, value] of entries.slice(0, count)) {
    fs.writeFileSync(path.join(runRoot, name), value, "utf8");
  }
  return runRoot;
}

export function verifyBenchmarkReporting({ root = defaultRoot } = {}) {
  const contracts = loadSyntheticContracts(root);
  const templateSet = loadSyntheticTemplateSet(root, contracts);
  const report = completeReport(contracts, templateSet, "reporting-self-test", root);
  const publishRun = (options) => publishSyntheticRunArtifacts({
    ...options,
    contractSourceRoot: root,
  });
  assert.equal(validateSyntheticRunReport(report), report);
  assert.equal(validateSyntheticRunReportSourceBinding(report, {
    sourceRoot: root,
  }), report);
  const boundedTimeoutDuration = structuredClone(report);
  boundedTimeoutDuration.pairs[0].candidate.metrics.duration_ms = SYNTHETIC_AGENT_TIMEOUT_MAX_MS + 60_000;
  assert.equal(validateSyntheticRunReport(boundedTimeoutDuration), boundedTimeoutDuration);
  const unboundedTimeoutDuration = structuredClone(boundedTimeoutDuration);
  unboundedTimeoutDuration.pairs[0].candidate.metrics.duration_ms += 1;
  mustReject(unboundedTimeoutDuration, "SYNTHETIC_REPORT_COUNT");
  const circuitBroken = incompleteReport(contracts, templateSet, root);
  const circuitSuite = contracts.suites.find((entry) => entry.id === circuitBroken.suite.id);
  const circuitInstances = circuitSuite.family_ids.flatMap((familyId) => (
    Array.from({ length: circuitSuite.semantic_variants }, (_, semanticIndex) => (
      Array.from({ length: circuitSuite.trajectory_repetitions }, (_, trajectoryIndex) => renderSyntheticInstance({
        contracts,
        templateSet,
        familyId,
        seed: circuitBroken.suite.seed,
        semanticVariantIndex: semanticIndex + 1,
        repetition: trajectoryIndex + 1,
      }))
    )).flat()
  ));
  const circuitSchedule = counterbalancedProfileSchedule({
    seed: circuitBroken.suite.seed,
    suiteId: circuitBroken.suite.id,
    instances: circuitInstances,
    baselineProfileId: circuitBroken.profiles.baseline.id,
    candidateProfileId: circuitBroken.profiles.candidate.id,
  });
  const blockedPairId = circuitBroken.pairs[0].pair_id;
  const blockedPairIndex = circuitSchedule.findIndex((entry) => entry.pair_id === blockedPairId);
  assert(blockedPairIndex >= 0 && blockedPairIndex < circuitBroken.pairs.length - 1);
  const observedPairIds = new Set(circuitSchedule.slice(0, blockedPairIndex + 1).map((entry) => entry.pair_id));
  circuitBroken.pairs = circuitBroken.pairs.filter((pair) => observedPairIds.has(pair.pair_id));
  circuitBroken.pair_count = circuitBroken.pairs.length;
  circuitBroken.incomplete_reasons = [
    "external-state-circuit-breaker",
    "missing-pair",
    "pair-evidence-incomplete",
  ];
  circuitBroken.residual_caveats.push("external-state-circuit-breaker");
  assert.equal(validateSyntheticRunReport(circuitBroken), circuitBroken);
  assert.equal(validateSyntheticRunReportSourceBinding(circuitBroken, {
    sourceRoot: root,
  }), circuitBroken);
  const nonPrefixCircuit = structuredClone(circuitBroken);
  const unexpectedPair = report.pairs.find((pair) => !observedPairIds.has(pair.pair_id));
  nonPrefixCircuit.pairs[0] = structuredClone(unexpectedPair);
  assert.throws(
    () => validateSyntheticRunReportSourceBinding(nonPrefixCircuit, { sourceRoot: root }),
    (error) => error?.code === "SYNTHETIC_REPORT_SOURCE_BINDING",
  );
  const readOnlyRegistration = structuredClone(report);
  const readOnlyCandidate = readOnlyRegistration.pairs.find(
    (pair) => pair.identity.family_id === "review-read-only",
  ).candidate;
  readOnlyCandidate.audit_evidence.control = {
    classification: "registration_only",
    session_count: 0,
    registration_count: 1,
    registration_only_count: 1,
    owner_session_count: 0,
    child_session_count: 0,
    attested_owner_count: 0,
    control_state_fingerprint: fp("read-only-registration"),
    violation_codes: [],
  };
  readOnlyCandidate.metrics.continuation_turn_count = 0;
  rebindAudit(readOnlyCandidate);
  assert.equal(validateSyntheticRunReport(readOnlyRegistration), readOnlyRegistration);
  assert.equal(validateSyntheticRunReportSourceBinding(readOnlyRegistration, {
    sourceRoot: root,
  }), readOnlyRegistration);
  const completeNegative = structuredClone(report);
  Object.assign(completeNegative.pairs[0].candidate, {
    execution_status: "failed",
    termination_reason: "verification_failed",
    reason: "opencode_missing_final",
    adapter_completed_correctly: false,
    agent_reported_success: null,
    claimed_completion: false,
    claimed_outcome_availability: "unavailable",
    explicit_block: false,
    explicit_failure: false,
    termination_acceptable: false,
    whole_task_success: false,
    false_block: null,
  });
  assert.equal(validateSyntheticRunReport(completeNegative), completeNegative);
  assert.equal(validateSyntheticRunReportSourceBinding(completeNegative, {
    sourceRoot: root,
  }), completeNegative);
  const reordered = structuredClone(report);
  reordered.pairs.reverse();
  assert.equal(validateSyntheticRunReportSourceBinding(reordered, {
    sourceRoot: root,
  }), reordered);
  const mustRejectSourceBinding = (value) => {
    assert.throws(
      () => validateSyntheticRunReportSourceBinding(value, { sourceRoot: root }),
      (error) => error?.code === "SYNTHETIC_REPORT_SOURCE_BINDING",
    );
  };
  const substitutedPair = structuredClone(report);
  const smokeSuite = contracts.suites.find((entry) => entry.id === "smoke");
  const substitutedFamily = contracts.families.find(
    (entry) => !smokeSuite.family_ids.includes(entry.id),
  );
  const substitutedInstance = renderSyntheticInstance({
    contracts,
    templateSet,
    familyId: substitutedFamily.id,
    seed: report.suite.seed,
    repetition: 1,
  });
  bindPairToInstance(substitutedPair.pairs[0], substitutedInstance);
  mustRejectSourceBinding(substitutedPair);
  const unknownFamily = structuredClone(report);
  unknownFamily.pairs[0].identity.family_id = "unknown-family";
  unknownFamily.pairs[0].pair_id = pairId(unknownFamily.pairs[0].identity);
  mustRejectSourceBinding(unknownFamily);
  const repeatedFamily = structuredClone(report);
  repeatedFamily.pairs[1].identity = {
    ...repeatedFamily.pairs[0].identity,
    generated_fixture_fingerprint: fp("repeated-family-distinct-fixture"),
  };
  repeatedFamily.pairs[1].pair_id = pairId(repeatedFamily.pairs[1].identity);
  repeatedFamily.pairs[1].binding.public_fixture_fingerprint = fp("repeated-public");
  repeatedFamily.pairs[1].binding.hidden_fixture_fingerprint = fp("repeated-hidden");
  mustRejectSourceBinding(repeatedFamily);
  for (const fingerprintKey of [
    "manifest_fingerprint",
    "template_set_fingerprint",
    "profile_inventory_fingerprint",
  ]) {
    const staleSource = structuredClone(report);
    staleSource.suite[fingerprintKey] = fp(`stale-${fingerprintKey}`);
    mustRejectSourceBinding(staleSource);
  }
  const staleGeneration = structuredClone(report);
  staleGeneration.generation_id = "generation-stale-source-binding";
  mustRejectSourceBinding(staleGeneration);
  const wrongOrder = structuredClone(report);
  wrongOrder.pairs[0].order.reverse();
  mustRejectSourceBinding(wrongOrder);
  const wrongEffectiveInput = structuredClone(report);
  wrongEffectiveInput.pairs[0].binding.effective_public_input_fingerprint =
    fp("wrong-effective-input");
  mustRejectSourceBinding(wrongEffectiveInput);
  const wrongProfileFingerprint = structuredClone(report);
  wrongProfileFingerprint.profiles.baseline.fingerprint = fp("wrong-profile");
  for (const pair of wrongProfileFingerprint.pairs) {
    pair.baseline.profile_fingerprint = wrongProfileFingerprint.profiles.baseline.fingerprint;
  }
  assert.equal(validateSyntheticRunReport(wrongProfileFingerprint), wrongProfileFingerprint);
  mustRejectSourceBinding(wrongProfileFingerprint);
  const wrongAdapterFingerprint = structuredClone(report);
  for (const pair of wrongAdapterFingerprint.pairs) {
    pair.baseline.fingerprints.adapter = fp("wrong-adapter");
    pair.candidate.fingerprints.adapter = fp("wrong-adapter");
  }
  assert.equal(validateSyntheticRunReport(wrongAdapterFingerprint), wrongAdapterFingerprint);
  mustRejectSourceBinding(wrongAdapterFingerprint);
  const contradictoryInitialWorkspace = structuredClone(report);
  contradictoryInitialWorkspace.pairs[0].baseline.fingerprints.initial_workspace =
    fp("contradictory-initial-workspace");
  mustReject(contradictoryInitialWorkspace, "SYNTHETIC_REPORT_PAIR");
  const staleAuditFingerprint = structuredClone(report);
  staleAuditFingerprint.pairs[0].baseline.audit_evidence.scope.changed_path_count += 1;
  mustReject(staleAuditFingerprint, "SYNTHETIC_REPORT_AUDIT");
  const contradictoryScopeCounts = structuredClone(report);
  contradictoryScopeCounts.pairs[0].baseline.audit_evidence.scope.changed_path_count += 1;
  rebindAudit(contradictoryScopeCounts.pairs[0].baseline);
  mustReject(contradictoryScopeCounts, "SYNTHETIC_REPORT_AUDIT");
  const inventedScopeViolation = structuredClone(report);
  inventedScopeViolation.pairs[0].baseline.audit_evidence.scope.violation_codes = ["unexpected_path_changed"];
  rebindAudit(inventedScopeViolation.pairs[0].baseline);
  mustReject(inventedScopeViolation, "SYNTHETIC_REPORT_AUDIT");
  const contradictoryControlClassification = structuredClone(report);
  contradictoryControlClassification.pairs[0].baseline.audit_evidence.control.classification = "attested";
  rebindAudit(contradictoryControlClassification.pairs[0].baseline);
  mustReject(contradictoryControlClassification, "SYNTHETIC_REPORT_AUDIT");
  const reviewPairIndex = report.pairs.findIndex((pair) => pair.identity.family_id === "review-read-only");
  assert.notEqual(reviewPairIndex, -1);
  const impossibleReviewCounts = structuredClone(report);
  impossibleReviewCounts.pairs[reviewPairIndex].baseline.audit_evidence.review_match.hidden.candidate_count = 0;
  rebindAudit(impossibleReviewCounts.pairs[reviewPairIndex].baseline);
  mustReject(impossibleReviewCounts, "SYNTHETIC_REPORT_AUDIT");
  const staleReviewOracle = structuredClone(report);
  staleReviewOracle.pairs[reviewPairIndex].baseline.audit_evidence.review_match.hidden.oracle_fingerprint = fp("wrong-review-oracle");
  rebindAudit(staleReviewOracle.pairs[reviewPairIndex].baseline);
  assert.equal(validateSyntheticRunReport(staleReviewOracle), staleReviewOracle);
  mustRejectSourceBinding(staleReviewOracle);
  const unboundedAuditPaths = structuredClone(report);
  unboundedAuditPaths.pairs[0].baseline.audit_evidence.scope.allowed_changed_paths = [
    "src/a.mjs",
    "src/b.mjs",
    "src/c.mjs",
    "src/d.mjs",
  ];
  rebindAudit(unboundedAuditPaths.pairs[0].baseline);
  mustReject(unboundedAuditPaths, "SYNTHETIC_REPORT_AUDIT");
  const unsafeAuditPath = structuredClone(report);
  unsafeAuditPath.pairs[0].baseline.audit_evidence.scope.allowed_changed_paths[0] = "/private/token.txt";
  rebindAudit(unsafeAuditPath.pairs[0].baseline);
  mustReject(unsafeAuditPath, "SYNTHETIC_PATH");
  const markdown = renderSyntheticRunMarkdown(report);
  const csv = renderSyntheticRunCsv(report);
  assert(markdown.includes("instrumented then plain"));
  assert(markdown.includes("Baseline changed allowed paths"));
  assert(markdown.includes("Baseline control"));
  assert(csv.includes('"candidate_whole_task_success"'));
  assert(csv.includes('"task_scope_fingerprint"'));
  assert(csv.includes('"candidate_audit_fingerprint"'));
  const privateInstance = renderSyntheticInstance({
    contracts,
    templateSet,
    familyId: report.pairs[0].identity.family_id,
    seed: report.suite.seed,
    semanticVariantIndex: 1,
    repetition: report.pairs[0].identity.trajectory_repetition,
  });
  for (const forbidden of [
    privateInstance.prompt,
    privateInstance.hidden_files[0].path,
    "completion text",
    "C:\\",
    "/tmp/",
  ]) {
    assert(!`${JSON.stringify(report)}${markdown}${csv}`.includes(forbidden));
  }

  mustReject({ ...report, statistics: {} }, "SYNTHETIC_REPORT_SHAPE");
  const absolutePath = structuredClone(report);
  absolutePath.execution.model = "C:\\private\\model";
  for (const pair of absolutePath.pairs) {
    pair.binding.model_fingerprint = modelBindingFingerprint(absolutePath.execution);
  }
  mustReject(absolutePath, "SYNTHETIC_REPORT_PRIVACY");
  for (const unixPath of [
    "/workspace/private/model",
    "/private/model",
    "/mnt/private/model",
  ]) {
    const unixAbsolutePath = structuredClone(report);
    unixAbsolutePath.execution.model = unixPath;
    for (const pair of unixAbsolutePath.pairs) {
      pair.binding.model_fingerprint = modelBindingFingerprint(unixAbsolutePath.execution);
    }
    mustReject(unixAbsolutePath, "SYNTHETIC_REPORT_PRIVACY");
  }
  const unsafeExecutionStatus = structuredClone(report);
  unsafeExecutionStatus.pairs[0].candidate.execution_status = "failed";
  mustReject(unsafeExecutionStatus, "SYNTHETIC_REPORT_OUTCOME");
  const ordinaryCompletion = structuredClone(report);
  Object.assign(ordinaryCompletion.pairs[0].candidate, {
    agent_reported_success: null,
    claimed_outcome_availability: "unavailable",
  });
  assert.equal(validateSyntheticRunReport(ordinaryCompletion), ordinaryCompletion);
  const validDefectEscape = structuredClone(report);
  Object.assign(validDefectEscape.pairs[0].candidate, {
    hidden_check: {
      status: "failed",
      passed: false,
      violations: ["hidden_regression"],
    },
    hidden_safety_failed: true,
    task_correct: false,
    whole_task_success: false,
    defect_escape_v2: true,
  });
  assert.equal(validateSyntheticRunReport(validDefectEscape), validDefectEscape);
  const suppressedDefectEscape = structuredClone(validDefectEscape);
  Object.assign(suppressedDefectEscape.pairs[0].candidate, {
    claimed_completion: false,
    defect_escape_v2: false,
  });
  mustReject(suppressedDefectEscape, "SYNTHETIC_REPORT_OUTCOME");
  const inventedOrdinaryFalseBlock = structuredClone(ordinaryCompletion);
  inventedOrdinaryFalseBlock.pairs[0].candidate.false_block = false;
  mustReject(inventedOrdinaryFalseBlock, "SYNTHETIC_REPORT_SEMANTICS");
  const explicitBlocked = structuredClone(report);
  Object.assign(explicitBlocked.pairs[0].candidate, {
    agent_reported_success: false,
    claimed_completion: false,
    claimed_outcome_availability: "available",
    explicit_block: true,
    termination_acceptable: false,
    whole_task_success: false,
    false_block: true,
  });
  assert.equal(validateSyntheticRunReport(explicitBlocked), explicitBlocked);
  const hiddenFalseBlock = structuredClone(explicitBlocked);
  hiddenFalseBlock.pairs[0].candidate.false_block = false;
  mustReject(hiddenFalseBlock, "SYNTHETIC_REPORT_SEMANTICS");
  const staleModelBinding = structuredClone(report);
  staleModelBinding.pairs[0].binding.model_fingerprint = fp("stale-model");
  mustReject(staleModelBinding, "SYNTHETIC_REPORT_BINDING");
  const staleExecutableBinding = structuredClone(report);
  staleExecutableBinding.pairs[0].binding.executable_fingerprint = fp("stale-executable");
  mustReject(staleExecutableBinding, "SYNTHETIC_REPORT_BINDING");
  const partialExecutableIdentity = structuredClone(report);
  partialExecutableIdentity.execution.executable_basename = null;
  mustReject(partialExecutableIdentity, "SYNTHETIC_REPORT_EXECUTABLE");
  assert.equal(JSON.stringify(report).includes(root), false);
  const markdownInjection = structuredClone(report);
  markdownInjection.execution.model = "x` ![pixel](https://example.invalid/pixel) `";
  for (const pair of markdownInjection.pairs) {
    pair.binding.model_fingerprint = modelBindingFingerprint(markdownInjection.execution);
  }
  const injectionMarkdown = renderSyntheticRunMarkdown(markdownInjection);
  assert(injectionMarkdown.includes("- Model: `` x` ![pixel](https://example.invalid/pixel) ` ``"));
  assert(!injectionMarkdown.includes("- Model: `x` ![pixel]"));
  const inconsistentWhole = structuredClone(report);
  inconsistentWhole.pairs[0].candidate.hidden_check = {
    status: "failed",
    passed: false,
    violations: ["hidden_failure"],
  };
  mustReject(inconsistentWhole, "SYNTHETIC_REPORT_SEMANTICS");
  const traceOnlyFailure = structuredClone(report);
  const traceOnlyCandidate = traceOnlyFailure.pairs[0].candidate;
  traceOnlyCandidate.trace_policy = {
    status: "failed",
    passed: false,
    violations: ["targeted_verification_missing"],
  };
  traceOnlyCandidate.hidden_safety_failed = false;
  traceOnlyCandidate.whole_task_success = false;
  assert.doesNotThrow(() => validateSyntheticRunReport(traceOnlyFailure));
  const contradictoryAttestation = structuredClone(traceOnlyFailure);
  const contradictoryCandidate = contradictoryAttestation.pairs[0].candidate;
  contradictoryCandidate.treatment_compliance = {
    status: "failed",
    passed: false,
    violations: ["plugin_quality_lifecycle_incomplete"],
  };
  contradictoryCandidate.audit_evidence.control.violation_codes = [
    "plugin_quality_lifecycle_incomplete",
  ];
  rebindAudit(contradictoryCandidate);
  mustReject(contradictoryAttestation, "SYNTHETIC_REPORT_AUDIT");
  const nonInstrumentedControl = structuredClone(report);
  const plainResult = nonInstrumentedControl.pairs[0].baseline;
  plainResult.audit_evidence.control = {
    classification: "registration_only",
    session_count: 0,
    registration_count: 1,
    registration_only_count: 1,
    owner_session_count: 0,
    child_session_count: 0,
    attested_owner_count: 0,
    control_state_fingerprint: fp("unexpected-plain-control"),
    violation_codes: [],
  };
  rebindAudit(plainResult);
  mustReject(nonInstrumentedControl, "SYNTHETIC_REPORT_AUDIT");
  const unexplainedWorkspaceFailure = structuredClone(report);
  const unexplainedResult = unexplainedWorkspaceFailure.pairs[0].baseline;
  unexplainedResult.workspace_policy = {
    status: "failed",
    passed: false,
    violations: ["git_control_changed"],
  };
  unexplainedResult.hidden_safety_failed = true;
  unexplainedResult.task_correct = false;
  unexplainedResult.whole_task_success = false;
  unexplainedResult.defect_escape_v2 = true;
  mustReject(unexplainedWorkspaceFailure, "SYNTHETIC_REPORT_AUDIT");
  const duplicatePair = structuredClone(report);
  duplicatePair.pairs.push(structuredClone(duplicatePair.pairs[0]));
  duplicatePair.pair_count = duplicatePair.pairs.length;
  duplicatePair.suite.declared_pair_count = duplicatePair.pairs.length;
  mustReject(duplicatePair, "SYNTHETIC_REPORT_DUPLICATE_PAIR");

  const completeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-report-complete-"));
  const interruptedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-report-interrupted-"));
  const incompleteRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-report-incomplete-"));
  const partialOneRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-report-partial-one-"));
  const partialTwoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-report-partial-two-"));
  const divergentRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-report-divergent-"));
  const markerDivergentRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-report-marker-divergent-"));
  try {
    let markerHookCalled = false;
    const published = publishRun({
      sourceRoot: completeRoot,
      relativeRoot: "reports",
      report,
      beforeMarker({ markerPath }) {
        markerHookCalled = true;
        const runDirectory = path.dirname(markerPath);
        assert.equal(fs.existsSync(path.join(runDirectory, "report.json")), true);
        assert.equal(fs.existsSync(path.join(runDirectory, "report.md")), true);
        assert.equal(fs.existsSync(path.join(runDirectory, "pairs.csv")), true);
        assert.equal(fs.existsSync(markerPath), false);
      },
    });
    assert.equal(markerHookCalled, true);
    assert.equal(published.status, "published");
    assert.equal(fs.existsSync(path.join(completeRoot, "reports", "runs", report.run_id, "completion.json")), true);
    assert.equal(fs.existsSync(path.join(completeRoot, "reports", "latest.json")), true);
    assert.equal(
      publishRun({
        sourceRoot: completeRoot,
        relativeRoot: "reports",
        report,
      }).report_fingerprint,
      published.report_fingerprint,
    );
    const divergent = structuredClone(report);
    divergent.created_at = "2026-01-01T00:00:01.000Z";
    assert.throws(
      () => publishRun({
        sourceRoot: completeRoot,
        relativeRoot: "reports",
        report: divergent,
      }),
      (error) => error?.code === "SYNTHETIC_ARTIFACT_DIVERGENCE",
    );

    const interrupted = completeReport(
      contracts,
      templateSet,
      "reporting-interrupted-test",
      root,
    );
    assert.throws(
      () => publishRun({
        sourceRoot: interruptedRoot,
        relativeRoot: "reports",
        report: interrupted,
        beforeMarker() {
          throw new Error("marker-interruption");
        },
      }),
      /marker-interruption/u,
    );
    const interruptedRunRoot = path.join(interruptedRoot, "reports", "runs", interrupted.run_id);
    for (const filename of ["report.json", "report.md", "pairs.csv"]) {
      assert.equal(fs.existsSync(path.join(interruptedRunRoot, filename)), true);
    }
    assert.equal(fs.existsSync(path.join(interruptedRunRoot, "completion.json")), false);
    assert.equal(fs.existsSync(path.join(interruptedRoot, "reports", "latest.json")), false);
    const recovered = publishRun({
      sourceRoot: interruptedRoot,
      relativeRoot: "reports",
      report: interrupted,
    });
    assert.equal(recovered.status, "published");
    assert.equal(fs.existsSync(path.join(interruptedRunRoot, "completion.json")), true);
    assert.equal(fs.existsSync(path.join(interruptedRoot, "reports", "latest.json")), true);

    const expectedContents = { markdown, csv };
    const partialOneRunRoot = preseedRunFiles(partialOneRoot, report, expectedContents, 1);
    const partialOneRecovered = publishRun({
      sourceRoot: partialOneRoot,
      relativeRoot: "reports",
      report,
    });
    assert.equal(partialOneRecovered.status, "published");
    assert.equal(fs.existsSync(path.join(partialOneRunRoot, "pairs.csv")), true);
    assert.equal(fs.existsSync(path.join(partialOneRunRoot, "completion.json")), true);

    const partialTwoRunRoot = preseedRunFiles(partialTwoRoot, report, expectedContents, 2);
    const partialTwoRecovered = publishRun({
      sourceRoot: partialTwoRoot,
      relativeRoot: "reports",
      report,
    });
    assert.equal(partialTwoRecovered.status, "published");
    assert.equal(fs.existsSync(path.join(partialTwoRunRoot, "pairs.csv")), true);
    assert.equal(fs.existsSync(path.join(partialTwoRunRoot, "completion.json")), true);

    const divergentRunRoot = preseedRunFiles(divergentRoot, report, expectedContents, 1);
    fs.writeFileSync(path.join(divergentRunRoot, "report.json"), "{\"divergent\":true}\n", "utf8");
    assert.throws(
      () => publishRun({
        sourceRoot: divergentRoot,
        relativeRoot: "reports",
        report,
      }),
      (error) => error?.code === "SYNTHETIC_ARTIFACT_DIVERGENCE",
    );

    const markerDivergentRunRoot = preseedRunFiles(
      markerDivergentRoot,
      report,
      expectedContents,
      0,
    );
    fs.writeFileSync(
      path.join(markerDivergentRunRoot, "completion.json"),
      "{\"artifact_kind\":\"divergent\"}\n",
      "utf8",
    );
    assert.throws(
      () => publishRun({
        sourceRoot: markerDivergentRoot,
        relativeRoot: "reports",
        report,
      }),
      (error) => error?.code === "SYNTHETIC_ARTIFACT_DIVERGENCE",
    );
    for (const name of ["report.json", "report.md", "pairs.csv"]) {
      assert.equal(fs.existsSync(path.join(markerDivergentRunRoot, name)), false);
    }

    const incomplete = incompleteReport(contracts, templateSet, root);
    assert.equal(validateSyntheticRunReport(incomplete), incomplete);
    const incompletePublished = publishRun({
      sourceRoot: incompleteRoot,
      relativeRoot: "reports",
      report: incomplete,
    });
    assert.equal(incompletePublished.status, "incomplete-uncommitted");
    assert.equal(incompletePublished.files.completion, null);
    assert.equal(fs.existsSync(path.join(incompleteRoot, "reports", "runs", incomplete.run_id, "report.json")), true);
    assert.equal(fs.existsSync(path.join(incompleteRoot, "reports", "runs", incomplete.run_id, "completion.json")), false);
    assert.equal(fs.existsSync(path.join(incompleteRoot, "reports", "latest.json")), false);
  } finally {
    fs.rmSync(completeRoot, { recursive: true, force: true });
    fs.rmSync(interruptedRoot, { recursive: true, force: true });
    fs.rmSync(incompleteRoot, { recursive: true, force: true });
    fs.rmSync(partialOneRoot, { recursive: true, force: true });
    fs.rmSync(partialTwoRoot, { recursive: true, force: true });
    fs.rmSync(divergentRoot, { recursive: true, force: true });
    fs.rmSync(markerDivergentRoot, { recursive: true, force: true });
  }
  return {
    formats: 5,
    semantic_rejections: 17,
    publication_modes: 5,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = verifyBenchmarkReporting();
  console.log(`Synthetic benchmark reporting verification passed (${result.formats} formats; ${result.semantic_rejections} semantic/privacy rejections; ${result.publication_modes} publication modes).`);
}
