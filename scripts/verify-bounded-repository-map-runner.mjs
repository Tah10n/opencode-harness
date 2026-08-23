import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fingerprint } from "../lib/feedback/contracts.mjs";
import {
  runSyntheticProfileAttempt,
  syntheticAdapterWorkerTimeoutMs,
  vnextCoreV2AuditTriggerPolicy,
  vnextInitialAgentContext,
  vnextInitialAgentId,
  vnextVisibleContractManifestEnabled,
} from "../lib/benchmark/runner.mjs";
import { loadBenchmarkV2Contracts } from "../lib/benchmark/v2-contracts.mjs";
import { renderBenchmarkV2DevelopmentFamily } from "../lib/benchmark/v2-fixtures.mjs";
import { materializeVnextSyntheticProfile } from "../lib/benchmark/profiles.mjs";
import { SYNTHETIC_OPENCODE_ADAPTER_VERSION } from "../lib/benchmark/opencode-adapter.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contracts = loadBenchmarkV2Contracts(root);
const family = contracts.dev.families.find((entry) => entry.id === "dev-medium-config-propagation");
const binding = contracts.devBindings.bindings.find((entry) => entry.family_id === family.id);
const instance = renderBenchmarkV2DevelopmentFamily({
  repositoryRoot: root,
  family,
  binding,
  seed: "bounded-repository-map-runner",
});
const prompts = new Map();
const firstPrompts = new Map();
let reviewerPrompt = null;
let remediationPrimaryCallCount = 0;
let verificationRetryPrimaryCallCount = 0;
let diffGuidedRetryPrimaryCallCount = 0;
let retryContextPrimaryCallCount = 0;
let checkAddressedPrimaryCallCount = 0;
let diagnosticGuidedPrimaryCallCount = 0;
let visibleContractPrimaryCallCount = 0;
let multiTargetContractPrimaryCallCount = 0;
let specializedContractPrimaryCallCount = 0;
let stratifiedCorePrimaryCallCount = 0;
let riskGatedSpecializedPrimaryCallCount = 0;
let coreV2ProductionPrimaryCallCount = 0;
let coreV2ExactCoordinatorPrimaryCallCount = 0;
let coreV2AdversarialAuditPrimaryCallCount = 0;
let coreV2TransactionalPrimaryCallCount = 0;
let stratifiedVisibleContractPrimaryCallCount = 0;
let manifestTransactionalAuditPrimaryCallCount = 0;
let evidenceGatedManifestAuditPrimaryCallCount = 0;
let manifestRiskGatedAuditPrimaryCallCount = 0;
let criticalManifestRiskAuditPrimaryCallCount = 0;
let reviewerFreeExactCorePrimaryCallCount = 0;
let publicCheckFailureOnlyPrimaryCallCount = 0;
let publicCheckFailureOnlySkipPrimaryCallCount = 0;
let invalidRetryPrimaryCallCount = 0;
let latestPrimaryProfileManifestPath = null;

function commandRunner() {
  return Promise.resolve({
    status: 0,
    signal: null,
    stdout_chars: 0,
    stderr_chars: 0,
    stdout_bytes: 0,
    stderr_bytes: 0,
    timed_out: false,
    teardown_verified: true,
  });
}

function failingCommandRunner() {
  return Promise.resolve({
    status: 1,
    signal: null,
    stdout_chars: 0,
    stderr_chars: 0,
    stdout_bytes: 0,
    stderr_bytes: 0,
    timed_out: false,
    teardown_verified: true,
  });
}

function failOnceCommandRunner() {
  let callCount = 0;
  return () => {
    callCount += 1;
    const stdout = callCount === 1 ? "not ok 1 - VISIBLE_PUBLIC_DIAGNOSTIC" : "ok 1";
    return Promise.resolve({
      status: callCount === 1 ? 1 : 0,
      signal: null,
      stdout,
      stderr: "",
      stdout_chars: stdout.length,
      stderr_chars: 0,
      stdout_bytes: Buffer.byteLength(stdout, "utf8"),
      stderr_bytes: 0,
      timed_out: false,
      teardown_verified: true,
    });
  };
}

function transactionalCommandRunner() {
  let callCount = 0;
  return () => {
    callCount += 1;
    const status = callCount === 2 ? 1 : 0;
    return Promise.resolve({
      status,
      signal: null,
      stdout: status === 0 ? "ok 1" : "not ok 1 - remediation regression",
      stderr: "",
      stdout_chars: 4,
      stderr_chars: 0,
      stdout_bytes: 4,
      stderr_bytes: 0,
      timed_out: false,
      teardown_verified: true,
    });
  };
}

async function fixtureAdapter({ context, onTrace, timeout }) {
  assert.equal(timeout, syntheticAdapterWorkerTimeoutMs(context.timeout));
  latestPrimaryProfileManifestPath = context.profileManifestPath;
  prompts.set(context.profileId, context.prompt);
  if (!firstPrompts.has(context.profileId)) firstPrompts.set(context.profileId, context.prompt);
  for (const file of instance.solution_files) {
    const target = path.join(context.repo, ...file.path.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, "utf8");
  }
  for (const event of [
    { event_type: "tool_call", summary: "read", tool_or_command: "read", status: "completed", verifier_codes: ["FIXTURE_READ"] },
    { event_type: "edit", summary: "edit", tool_or_command: "mutation", status: "completed", verifier_codes: ["FIXTURE_EDIT"] },
  ]) await onTrace("emit", event);
  return {
    passed: true,
    status: "completed",
    termination_reason: "verified",
    reason: null,
    adapter_protocol_version: SYNTHETIC_OPENCODE_ADAPTER_VERSION,
    adapter_fingerprint: fingerprint({ fixture: "bounded-repository-map-runner" }),
    profile_fingerprint: context.profileFingerprint,
    cli_version: "1.18.18",
    parser_status: "valid",
    response_protocol_status: "valid",
    agent_outcome: "success",
    claimed_completion: true,
    claimed_outcome_availability: "available",
    explicit_block: false,
    explicit_failure: false,
    review_findings: [],
    transient_observations: {
      observation_complete: true,
      ambiguity_count: 0,
      path_observation_rejection_count: 0,
      accessed_path_fingerprints: [],
      accessed_path_fingerprint_counts: [],
      mutated_path_fingerprints: [],
      observed_fix_command_count: 1,
      observed_repository_instruction_action_count: 0,
      observed_secret_write_count: 0,
      observed_control_path_action_count: 0,
    },
    trace_summary: {
      trace_complete: false,
      stream_complete: true,
      unobserved_fields: [
        "dangerous_command_count", "fix_command_count", "hidden_access_attempt_count",
        "network_action_count", "repository_instruction_action_count", "secret_write_count",
        "workspace_mutation_count",
      ],
      event_count: 2,
      step_start_count: 1,
      step_finish_count: 1,
      reasoning_event_count: 0,
      final_response_bytes: 32,
      tool_call_count: 2,
      task_action_call_count: 2,
      computational_control_call_count: 0,
      context_read_count: 0,
      delegation_count: 0,
      delegated_agent_ids: [],
      targeted_verification_observed: false,
      dangerous_command_count: null,
      hidden_access_attempt_count: null,
      workspace_mutation_count: null,
      fix_command_count: null,
      repository_instruction_action_count: null,
      secret_write_count: null,
      network_action_count: null,
      observed_dangerous_command_count: 0,
      observed_mutation_tool_count: 1,
      observed_network_tool_count: 0,
      unknown_event_count: 0,
      unfinished_tool_call_count: 0,
      reported_error: false,
    },
    stdout_bytes: 256,
    stderr_bytes: 0,
    duration_ms: 10,
    model_turn_count: 1,
    continuation_turn_count: 0,
  };
}

async function automaticReviewerAdapter({ context, timeout }) {
  assert.equal(timeout, syntheticAdapterWorkerTimeoutMs(context.timeout));
  assert.equal(context.agentId, "core-reviewer");
  assert.equal(context.taskScopeMode, "read-only");
  assert.notEqual(context.profileManifestPath, latestPrimaryProfileManifestPath);
  reviewerPrompt = context.prompt;
  return {
    passed: true,
    status: "completed",
    termination_reason: "verified",
    reason: null,
    adapter_protocol_version: SYNTHETIC_OPENCODE_ADAPTER_VERSION,
    adapter_fingerprint: fingerprint({ fixture: "automatic-reviewer" }),
    profile_fingerprint: context.profileFingerprint,
    cli_version: "1.18.18",
    parser_status: "valid",
    response_protocol_status: "structured-review",
    agent_outcome: null,
    claimed_completion: true,
    claimed_outcome_availability: "unavailable",
    explicit_block: false,
    explicit_failure: false,
    review_findings: [],
    transient_observations: {
      observation_complete: true,
      ambiguity_count: 0,
      path_observation_rejection_count: 0,
      observed_repository_instruction_action_count: 0,
      observed_secret_write_count: 0,
      observed_control_path_action_count: 0,
    },
    trace_summary: {
      stream_complete: true,
      unknown_event_count: 0,
      unfinished_tool_call_count: 0,
      observed_mutation_tool_count: 0,
      observed_dangerous_command_count: 0,
      observed_network_tool_count: 0,
    },
    stdout_bytes: 128,
    stderr_bytes: 0,
    duration_ms: 5,
    model_turn_count: 1,
    continuation_turn_count: 0,
  };
}

async function findingReviewerAdapter(input) {
  const result = await automaticReviewerAdapter(input);
  return {
    ...result,
    review_findings: [{
      severity: "MEDIUM",
      path: instance.solution_files[0].path,
      line: 1,
      contract: "the final source must not retain the injected review marker",
      evidence: "the exact final diff contains REVIEW_DEFECT_MARKER",
      body: "remove only the marker and preserve the functional fix",
    }],
  };
}

async function offDiffReviewerAdapter(input) {
  const result = await automaticReviewerAdapter(input);
  return {
    ...result,
    review_findings: [{
      severity: "HIGH",
      path: "src/not-in-final-diff.mjs",
      line: 1,
      contract: "invented contract",
      evidence: "invented evidence",
      body: "do not accept this finding",
    }],
  };
}

async function remediationPrimaryAdapter(input) {
  remediationPrimaryCallCount += 1;
  const result = await fixtureAdapter(input);
  if (remediationPrimaryCallCount === 1) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// REVIEW_DEFECT_MARKER\n", "utf8");
  }
  return result;
}

async function verificationRetryPrimaryAdapter(input) {
  verificationRetryPrimaryCallCount += 1;
  const result = await fixtureAdapter(input);
  if (verificationRetryPrimaryCallCount === 1) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// VISIBLE_VERIFICATION_DEFECT\n", "utf8");
  }
  return result;
}

async function diffGuidedRetryPrimaryAdapter(input) {
  diffGuidedRetryPrimaryCallCount += 1;
  const result = await fixtureAdapter(input);
  if (diffGuidedRetryPrimaryCallCount === 1) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// VISIBLE_VERIFICATION_DEFECT\n", "utf8");
  }
  return result;
}

async function retryContextPrimaryAdapter(input) {
  retryContextPrimaryCallCount += 1;
  const result = await fixtureAdapter(input);
  if (retryContextPrimaryCallCount === 1) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// VISIBLE_VERIFICATION_DEFECT\n", "utf8");
  }
  return result;
}

async function checkAddressedPrimaryAdapter(input) {
  checkAddressedPrimaryCallCount += 1;
  const result = await fixtureAdapter(input);
  if (checkAddressedPrimaryCallCount === 1) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// VISIBLE_VERIFICATION_DEFECT\n", "utf8");
  }
  return result;
}

async function diagnosticGuidedPrimaryAdapter(input) {
  diagnosticGuidedPrimaryCallCount += 1;
  const result = await fixtureAdapter(input);
  if (diagnosticGuidedPrimaryCallCount === 1) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// VISIBLE_VERIFICATION_DEFECT\n", "utf8");
  }
  return result;
}

async function visibleContractPrimaryAdapter(input) {
  visibleContractPrimaryCallCount += 1;
  const result = await fixtureAdapter(input);
  if (visibleContractPrimaryCallCount === 1) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// VISIBLE_CONTRACT_DEFECT\n", "utf8");
  }
  return result;
}

async function multiTargetContractPrimaryAdapter(input) {
  multiTargetContractPrimaryCallCount += 1;
  return fixtureAdapter(input);
}

async function specializedContractPrimaryAdapter(input) {
  specializedContractPrimaryCallCount += 1;
  if (specializedContractPrimaryCallCount === 2) {
    assert.equal(input.context.agentId, "contract-auditor");
  }
  return fixtureAdapter(input);
}

async function stratifiedCorePrimaryAdapter(input) {
  stratifiedCorePrimaryCallCount += 1;
  if (stratifiedCorePrimaryCallCount === 1) assert.equal(input.context.agentId, undefined);
  if (stratifiedCorePrimaryCallCount === 2) assert.equal(input.context.agentId, "contract-auditor");
  return fixtureAdapter(input);
}

async function riskGatedSpecializedPrimaryAdapter(input) {
  riskGatedSpecializedPrimaryCallCount += 1;
  if (riskGatedSpecializedPrimaryCallCount === 1) assert.equal(input.context.agentId, undefined);
  if (riskGatedSpecializedPrimaryCallCount === 2) assert.equal(input.context.agentId, "contract-auditor");
  return fixtureAdapter(input);
}

async function coreV2ProductionPrimaryAdapter(input) {
  coreV2ProductionPrimaryCallCount += 1;
  if (coreV2ProductionPrimaryCallCount === 1) assert.equal(input.context.agentId, undefined);
  if (coreV2ProductionPrimaryCallCount === 2) assert.equal(input.context.agentId, "contract-auditor");
  return fixtureAdapter(input);
}

async function coreV2ExactCoordinatorPrimaryAdapter(input) {
  coreV2ExactCoordinatorPrimaryCallCount += 1;
  if (coreV2ExactCoordinatorPrimaryCallCount === 1) assert.equal(input.context.agentId, undefined);
  if (coreV2ExactCoordinatorPrimaryCallCount === 2) assert.equal(input.context.agentId, "contract-auditor");
  const result = await fixtureAdapter(input);
  if (coreV2ExactCoordinatorPrimaryCallCount === 2) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// EXACT_COORDINATOR_REMEDIATION\n", "utf8");
  }
  return result;
}

async function coreV2AdversarialAuditPrimaryAdapter(input) {
  coreV2AdversarialAuditPrimaryCallCount += 1;
  if (coreV2AdversarialAuditPrimaryCallCount === 1) assert.equal(input.context.agentId, undefined);
  if (coreV2AdversarialAuditPrimaryCallCount === 2) assert.equal(input.context.agentId, "contract-auditor");
  const result = await fixtureAdapter(input);
  if (coreV2AdversarialAuditPrimaryCallCount === 2) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// ADVERSARIAL_AUDIT_REMEDIATION\n", "utf8");
  }
  return result;
}

async function coreV2TransactionalPrimaryAdapter(input) {
  coreV2TransactionalPrimaryCallCount += 1;
  if (coreV2TransactionalPrimaryCallCount === 1) assert.equal(input.context.agentId, undefined);
  if (coreV2TransactionalPrimaryCallCount === 2) assert.equal(input.context.agentId, "contract-auditor");
  const result = await fixtureAdapter(input);
  if (coreV2TransactionalPrimaryCallCount === 1 && instance.solution_files.length > 1) {
    const omitted = instance.solution_files[1];
    const original = instance.public_files.find((entry) => entry.path === omitted.path);
    assert(original);
    fs.writeFileSync(path.join(input.context.repo, ...omitted.path.split("/")), original.content, "utf8");
  }
  if (coreV2TransactionalPrimaryCallCount === 2) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// TRANSACTIONAL_REMEDIATION_REGRESSION\n", "utf8");
  }
  return result;
}

async function stratifiedVisibleContractPrimaryAdapter(input) {
  stratifiedVisibleContractPrimaryCallCount += 1;
  if (stratifiedVisibleContractPrimaryCallCount === 1) assert.equal(input.context.agentId, undefined);
  if (stratifiedVisibleContractPrimaryCallCount === 2) assert.equal(input.context.agentId, "contract-auditor");
  const result = await fixtureAdapter(input);
  if (stratifiedVisibleContractPrimaryCallCount === 2) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// STRATIFIED_AUDIT_REMEDIATION\n", "utf8");
  }
  return result;
}

async function manifestTransactionalAuditPrimaryAdapter(input) {
  manifestTransactionalAuditPrimaryCallCount += 1;
  if (manifestTransactionalAuditPrimaryCallCount === 1) assert.equal(input.context.agentId, undefined);
  if (manifestTransactionalAuditPrimaryCallCount === 2) assert.equal(input.context.agentId, "contract-auditor");
  const result = await fixtureAdapter(input);
  if (manifestTransactionalAuditPrimaryCallCount === 1 && instance.solution_files.length > 1) {
    const omitted = instance.solution_files[1];
    const original = instance.public_files.find((entry) => entry.path === omitted.path);
    assert(original);
    fs.writeFileSync(path.join(input.context.repo, ...omitted.path.split("/")), original.content, "utf8");
  }
  if (manifestTransactionalAuditPrimaryCallCount === 2) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// MANIFEST_TRANSACTIONAL_AUDIT_REGRESSION\n", "utf8");
  }
  return result;
}

async function evidenceGatedManifestAuditPrimaryAdapter(input) {
  evidenceGatedManifestAuditPrimaryCallCount += 1;
  if (evidenceGatedManifestAuditPrimaryCallCount === 1) assert.equal(input.context.agentId, undefined);
  if (evidenceGatedManifestAuditPrimaryCallCount === 2) assert.equal(input.context.agentId, "contract-auditor");
  const result = await fixtureAdapter(input);
  if (evidenceGatedManifestAuditPrimaryCallCount === 2) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// EVIDENCE_GATED_AUDIT_REMEDIATION\n", "utf8");
  }
  return result;
}

async function manifestRiskGatedAuditPrimaryAdapter(input) {
  manifestRiskGatedAuditPrimaryCallCount += 1;
  assert.equal(input.context.agentId, undefined);
  return fixtureAdapter(input);
}

async function criticalManifestRiskAuditPrimaryAdapter(input) {
  criticalManifestRiskAuditPrimaryCallCount += 1;
  assert.equal(input.context.agentId, undefined);
  return fixtureAdapter(input);
}

async function reviewerFreeExactCorePrimaryAdapter(input) {
  reviewerFreeExactCorePrimaryCallCount += 1;
  assert.equal(input.context.agentId, ["P37", "P38", "P39"].includes(input.context.profileId) ? "core-v4-build" : undefined);
  return fixtureAdapter(input);
}

async function publicCheckFailureOnlyPrimaryAdapter(input) {
  publicCheckFailureOnlyPrimaryCallCount += 1;
  if (publicCheckFailureOnlyPrimaryCallCount === 1) assert.equal(input.context.agentId, undefined);
  if (publicCheckFailureOnlyPrimaryCallCount === 2) assert.equal(input.context.agentId, "contract-auditor");
  const result = await fixtureAdapter(input);
  if (publicCheckFailureOnlyPrimaryCallCount === 2) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// PUBLIC_CHECK_FAILURE_ONLY_REMEDIATION\n", "utf8");
  }
  return result;
}

async function publicCheckFailureOnlySkipPrimaryAdapter(input) {
  publicCheckFailureOnlySkipPrimaryCallCount += 1;
  assert.equal(input.context.agentId, undefined);
  return fixtureAdapter(input);
}

async function invalidRetryPrimaryAdapter(input) {
  invalidRetryPrimaryCallCount += 1;
  const result = await fixtureAdapter(input);
  if (invalidRetryPrimaryCallCount === 1) {
    const target = path.join(input.context.repo, ...instance.solution_files[0].path.split("/"));
    fs.appendFileSync(target, "// VISIBLE_VERIFICATION_DEFECT\n", "utf8");
    return result;
  }
  fs.writeFileSync(path.join(input.context.repo, "unexpected-retry-output.mjs"), "export default true;\n", "utf8");
  return {
    ...result,
    passed: false,
    status: "failed",
    termination_reason: "verification_failed",
    reason: "opencode_nonzero_exit",
  };
}

async function attempt(
  profileId,
  reviewerInvoker = null,
  primaryInvoker = fixtureAdapter,
  selectedCommandRunner = commandRunner,
) {
  let nextId = 0;
  return runSyntheticProfileAttempt({
    sourceRoot: root,
    instance,
    profileId,
    operationalRunId: `bounded-repository-map-${profileId}`,
    model: "fixture/model",
    provider: "fixture",
    timeoutMs: 60_000,
    adapterUrl: new URL("../lib/benchmark/opencode-adapter.mjs", import.meta.url).href,
    adapterInvoker: primaryInvoker,
    reviewerInvoker,
    commandRunner: selectedCommandRunner,
    profileMaterializer: materializeVnextSyntheticProfile,
    clock: () => new Date("2026-08-19T00:00:00.000Z"),
    idFactory: (kind) => `${kind}-${profileId}-${++nextId}`,
  });
}

const withoutMap = await attempt("P2");
const withMap = await attempt("P3");
const withReview = await attempt("P4", automaticReviewerAdapter);
const withReviewAfterFailedVerification = await attempt(
  "P4",
  automaticReviewerAdapter,
  fixtureAdapter,
  failingCommandRunner,
);
const withRemediation = await attempt("P4", findingReviewerAdapter, remediationPrimaryAdapter);
const withOffDiffFinding = await attempt("P4", offDiffReviewerAdapter);
const withVerificationRetry = await attempt(
  "P9",
  null,
  verificationRetryPrimaryAdapter,
  failOnceCommandRunner(),
);
const withDiffGuidedVerificationRetry = await attempt(
  "P10",
  null,
  diffGuidedRetryPrimaryAdapter,
  failOnceCommandRunner(),
);
const withRetryContext = await attempt(
  "P11",
  null,
  retryContextPrimaryAdapter,
  failOnceCommandRunner(),
);
const withCheckAddressedRetry = await attempt(
  "P12",
  null,
  checkAddressedPrimaryAdapter,
  failOnceCommandRunner(),
);
const withDiagnosticGuidedRetry = await attempt(
  "P13",
  null,
  diagnosticGuidedPrimaryAdapter,
  failOnceCommandRunner(),
);
const withVisibleContractRemediation = await attempt(
  "P14",
  null,
  visibleContractPrimaryAdapter,
  commandRunner,
);
const withRiskGatedContractSkip = await attempt(
  "P15",
  null,
  fixtureAdapter,
  commandRunner,
);
const withRiskGatedContractRemediation = await attempt(
  "P15",
  null,
  visibleContractPrimaryAdapter,
  failOnceCommandRunner(),
);
const withMultiTargetContractRemediation = await attempt(
  "P16",
  null,
  multiTargetContractPrimaryAdapter,
  commandRunner,
);
const withSpecializedContractRemediation = await attempt(
  "P17",
  null,
  specializedContractPrimaryAdapter,
  commandRunner,
);
const withStratifiedCore = await attempt(
  "P18",
  null,
  stratifiedCorePrimaryAdapter,
  commandRunner,
);
const withRiskGatedSpecialized = await attempt(
  "P19",
  null,
  riskGatedSpecializedPrimaryAdapter,
  failOnceCommandRunner(),
);
const withCoreV2Production = await attempt(
  "P20",
  null,
  coreV2ProductionPrimaryAdapter,
  failOnceCommandRunner(),
);
const withCoreV2ExactCoordinator = await attempt(
  "P21",
  null,
  coreV2ExactCoordinatorPrimaryAdapter,
  failOnceCommandRunner(),
);
const withCoreV2AdversarialAudit = await attempt(
  "P22",
  null,
  coreV2AdversarialAuditPrimaryAdapter,
  failOnceCommandRunner(),
);
const withCoreV2BoundedContext = await attempt(
  "P23",
  null,
  fixtureAdapter,
  commandRunner,
);
const withCoreV2Transactional = await attempt(
  "P24",
  null,
  coreV2TransactionalPrimaryAdapter,
  transactionalCommandRunner(),
);
const withContractFirst = await attempt(
  "P25",
  null,
  fixtureAdapter,
  commandRunner,
);
const withHostCompiledContract = await attempt(
  "P26",
  null,
  fixtureAdapter,
  commandRunner,
);
const withStratifiedVisibleContract = await attempt(
  "P27",
  null,
  stratifiedVisibleContractPrimaryAdapter,
  failOnceCommandRunner(),
);
const withManifestTransactionalAudit = await attempt(
  "P28",
  null,
  manifestTransactionalAuditPrimaryAdapter,
  transactionalCommandRunner(),
);
const withEvidenceGatedManifestAudit = await attempt(
  "P29",
  null,
  evidenceGatedManifestAuditPrimaryAdapter,
  failOnceCommandRunner(),
);
const withManifestRiskGatedAudit = await attempt(
  "P30",
  null,
  manifestRiskGatedAuditPrimaryAdapter,
  commandRunner,
);
const withCriticalManifestRiskAudit = await attempt(
  "P31",
  null,
  criticalManifestRiskAuditPrimaryAdapter,
  commandRunner,
);
const withReviewerFreeExactCore = await attempt(
  "P32",
  null,
  reviewerFreeExactCorePrimaryAdapter,
  commandRunner,
);
const withScenarioTypedVisibleContract = await attempt(
  "P33",
  null,
  reviewerFreeExactCorePrimaryAdapter,
  commandRunner,
);
const withSecretMutationGuard = await attempt(
  "P35",
  null,
  reviewerFreeExactCorePrimaryAdapter,
  commandRunner,
);
const withStratifiedScenarioVisibleContract = await attempt(
  "P36",
  null,
  reviewerFreeExactCorePrimaryAdapter,
  commandRunner,
);
const withMinimalSmallScenarioVisibleContract = await attempt(
  "P37",
  null,
  reviewerFreeExactCorePrimaryAdapter,
  commandRunner,
);
const withMinimalSmallScenarioVisibleContractNoAudit = await attempt(
  "P38",
  null,
  reviewerFreeExactCorePrimaryAdapter,
  commandRunner,
);
const withProtocolBoundSmallNoAudit = await attempt(
  "P39",
  null,
  reviewerFreeExactCorePrimaryAdapter,
  commandRunner,
);
const withPublicCheckFailureOnly = await attempt(
  "P34",
  null,
  publicCheckFailureOnlyPrimaryAdapter,
  failOnceCommandRunner(),
);
const withPublicCheckFailureOnlySkip = await attempt(
  "P34",
  null,
  publicCheckFailureOnlySkipPrimaryAdapter,
  commandRunner,
);
const withInvalidRetryMutation = await attempt(
  "P9",
  null,
  invalidRetryPrimaryAdapter,
  failOnceCommandRunner(),
);
assert.equal(prompts.get("P2").includes("HOST_REPOSITORY_MAP_V1="), false);
assert.equal(prompts.get("P3").includes("HOST_REPOSITORY_MAP_V1="), true);
assert.doesNotMatch(prompts.get("P3"), /[\r\n]/u);
assert(prompts.get("P3").length <= 16_000);
assert.deepEqual(withoutMap.result.vnext_context_map_observation, {
  eligible: true,
  activated: false,
  reason: "profile_without_host_context",
});
assert.equal(withMap.result.vnext_context_map_observation.eligible, true);
assert.equal(withMap.result.vnext_context_map_observation.activated, true);
assert.equal(withMap.result.vnext_context_map_observation.relevant_file_recall, 1);
assert.equal(withMap.result.vnext_context_map_observation.consumer_recall, 1);
assert(withMap.result.vnext_context_map_observation.context_bytes <= 12_000);
assert.equal(withMap.result.termination_acceptable, true);
assert.equal(withMap.result.metrics.context_read_count, withoutMap.result.metrics.context_read_count + 1);
assert.match(reviewerPrompt, /VISIBLE_REQUIREMENTS_JSON=/u);
assert.match(reviewerPrompt, /FINAL_DIFF_V1=/u);
assert.doesNotMatch(reviewerPrompt, /[\r\n]/u);
assert.equal(withReview.result.vnext_automatic_review_observation.review_required_count, 1);
assert.equal(withReview.result.vnext_automatic_review_observation.review_started_count, 1);
assert.equal(withReview.result.vnext_automatic_review_observation.review_completed_count, 1);
assert.equal(withReview.result.vnext_automatic_review_observation.review_finding_count, 0);
assert.equal(withReview.result.vnext_automatic_review_observation.reviewer_caused_fix_count, 0);
assert.equal(withReview.result.vnext_automatic_review_observation.workspace_unchanged, true);
assert.equal(withReview.result.termination_acceptable, true);
assert.equal(withReviewAfterFailedVerification.result.visible_check.passed, false);
assert.equal(
  withReviewAfterFailedVerification.result.vnext_automatic_review_observation.review_started_count,
  1,
);
assert.equal(
  withReviewAfterFailedVerification.result.vnext_automatic_review_observation.review_completed_count,
  1,
);
assert.equal(
  withReviewAfterFailedVerification.result.vnext_automatic_review_observation.operationally_complete,
  true,
);
assert.equal(withReviewAfterFailedVerification.result.termination_acceptable, false);
assert.equal(remediationPrimaryCallCount, 2);
assert.equal(withRemediation.result.vnext_automatic_review_observation.review_finding_count, 1);
assert.equal(withRemediation.result.vnext_automatic_review_observation.reviewer_caused_fix_count, 1);
assert.equal(withRemediation.result.vnext_automatic_review_observation.reason, "review_findings_remediated_and_reverified");
assert.equal(withRemediation.result.visible_check.passed, true);
assert.equal(withRemediation.result.termination_acceptable, true);
assert.equal(withOffDiffFinding.result.vnext_automatic_review_observation.review_started_count, 1);
assert.equal(withOffDiffFinding.result.vnext_automatic_review_observation.review_completed_count, 0);
assert.equal(withOffDiffFinding.result.termination_acceptable, false);
assert.equal(verificationRetryPrimaryCallCount, 2);
assert.equal(withVerificationRetry.result.vnext_verification_remediation_observation.eligible, true);
assert.equal(withVerificationRetry.result.vnext_verification_remediation_observation.retry_started_count, 1);
assert.equal(withVerificationRetry.result.vnext_verification_remediation_observation.retry_completed_count, 1);
assert.equal(withVerificationRetry.result.vnext_verification_remediation_observation.retry_changed_count, 1);
assert.equal(withVerificationRetry.result.vnext_verification_remediation_observation.retry_reverified_count, 1);
assert.equal(withVerificationRetry.result.vnext_verification_remediation_observation.retry_verification_passed_count, 1);
assert.equal(withVerificationRetry.result.visible_check.passed, true);
assert.equal(withVerificationRetry.result.termination_acceptable, true);
assert.equal(withVerificationRetry.result.metrics.total_tool_call_count, 4);
assert.match(prompts.get("P9"), /runner-selected trusted visible verification did not pass/u);
assert.equal(diffGuidedRetryPrimaryCallCount, 2);
assert.equal(withDiffGuidedVerificationRetry.result.vnext_verification_remediation_observation.eligible, true);
assert.equal(withDiffGuidedVerificationRetry.result.vnext_verification_remediation_observation.retry_changed_count, 1);
assert.equal(withDiffGuidedVerificationRetry.result.vnext_verification_remediation_observation.retry_verification_passed_count, 1);
assert.equal(withDiffGuidedVerificationRetry.result.termination_acceptable, true);
assert.match(prompts.get("P10"), /CURRENT_PUBLIC_DIFF_V1=/u);
assert.match(prompts.get("P10"), /VISIBLE_VERIFICATION_DEFECT/u);
assert.doesNotMatch(prompts.get("P10"), /[\r\n]/u);
assert.equal(retryContextPrimaryCallCount, 2);
assert.equal(withRetryContext.result.vnext_context_map_observation.eligible, true);
assert.equal(withRetryContext.result.vnext_context_map_observation.activated, true);
assert.equal(withRetryContext.result.vnext_context_map_observation.reason, "host_map_injected_before_retry");
assert.equal(withRetryContext.result.vnext_verification_remediation_observation.retry_verification_passed_count, 1);
assert.equal(withRetryContext.result.termination_acceptable, true);
assert.match(prompts.get("P11"), /CURRENT_PUBLIC_DIFF_V1=/u);
assert.match(prompts.get("P11"), /HOST_REPOSITORY_MAP_V1=/u);
assert.equal(checkAddressedPrimaryCallCount, 2);
assert.equal(withCheckAddressedRetry.result.vnext_verification_remediation_observation.retry_verification_passed_count, 1);
assert.equal(withCheckAddressedRetry.result.termination_acceptable, true);
assert.match(prompts.get("P12"), /CURRENT_PUBLIC_DIFF_V1=/u);
assert.match(prompts.get("P12"), /RUNNER_SELECTED_PUBLIC_CHECK_V1=/u);
assert.match(prompts.get("P12"), /test\/public\.test\.mjs/u);
assert.equal(diagnosticGuidedPrimaryCallCount, 2);
assert.equal(withDiagnosticGuidedRetry.result.vnext_verification_remediation_observation.retry_verification_passed_count, 1);
assert.equal(withDiagnosticGuidedRetry.result.termination_acceptable, true);
assert.match(prompts.get("P13"), /CURRENT_PUBLIC_DIFF_V1=/u);
assert.match(prompts.get("P13"), /RUNNER_SELECTED_PUBLIC_CHECK_V1=/u);
assert.match(prompts.get("P13"), /PUBLIC_CHECK_DIAGNOSTIC_V1=/u);
assert.match(prompts.get("P13"), /VISIBLE_PUBLIC_DIAGNOSTIC/u);
assert.doesNotMatch(JSON.stringify(withDiagnosticGuidedRetry.result), /VISIBLE_PUBLIC_DIAGNOSTIC/u);
assert.equal(visibleContractPrimaryCallCount, 4);
assert.equal(withVisibleContractRemediation.result.vnext_verification_remediation_observation.eligible, true);
assert.equal(withVisibleContractRemediation.result.vnext_verification_remediation_observation.retry_completed_count, 1);
assert.equal(withVisibleContractRemediation.result.vnext_verification_remediation_observation.retry_changed_count, 1);
assert.equal(withVisibleContractRemediation.result.vnext_verification_remediation_observation.retry_verification_passed_count, 1);
assert.equal(withVisibleContractRemediation.result.termination_acceptable, true);
assert.match(prompts.get("P14"), /visible-contract conformance pass/u);
assert.match(prompts.get("P14"), /PUBLIC_CHECK_RESULT_V1=/u);
assert.match(prompts.get("P14"), /"status":"passed"/u);
assert.match(prompts.get("P15"), /visible-contract conformance pass/u);
assert.match(prompts.get("P15"), /PUBLIC_CHECK_RESULT_V1=/u);
assert.equal(withRiskGatedContractSkip.result.vnext_verification_remediation_observation.eligible, false);
assert.equal(withRiskGatedContractRemediation.result.vnext_verification_remediation_observation.eligible, true);
assert.equal(withRiskGatedContractRemediation.result.vnext_verification_remediation_observation.retry_completed_count, 1);
assert.equal(multiTargetContractPrimaryCallCount, 2);
assert.equal(withMultiTargetContractRemediation.result.vnext_verification_remediation_observation.eligible, true);
assert.equal(withMultiTargetContractRemediation.result.vnext_verification_remediation_observation.retry_completed_count, 1);
assert.deepEqual(
  withMultiTargetContractRemediation.result.vnext_verification_remediation_observation.trigger_reasons,
  ["multi-target"],
);
assert.match(prompts.get("P16"), /visible-contract conformance pass/u);
assert.equal(specializedContractPrimaryCallCount, 2);
assert.equal(withSpecializedContractRemediation.result.vnext_verification_remediation_observation.eligible, true);
assert.equal(withSpecializedContractRemediation.result.vnext_verification_remediation_observation.retry_completed_count, 1);
assert.deepEqual(
  withSpecializedContractRemediation.result.vnext_verification_remediation_observation.trigger_reasons,
  ["specialized-visible-contract"],
);
assert.match(prompts.get("P17"), /visible-contract conformance pass/u);
assert.equal(stratifiedCorePrimaryCallCount, 2);
assert.equal(withStratifiedCore.result.vnext_verification_remediation_observation.eligible, true);
assert.deepEqual(
  withStratifiedCore.result.vnext_verification_remediation_observation.trigger_reasons,
  ["specialized-visible-contract"],
);
assert.equal(vnextInitialAgentId({ profile_id: "P18", stratum: "small" }), "vnext-small-core");
assert.equal(vnextInitialAgentId({ profile_id: "P18", stratum: "medium" }), null);
assert.equal(vnextInitialAgentId({ profile_id: "P17", stratum: "small" }), null);
assert.equal(riskGatedSpecializedPrimaryCallCount, 2);
assert.equal(withRiskGatedSpecialized.result.vnext_verification_remediation_observation.eligible, true);
assert.deepEqual(
  withRiskGatedSpecialized.result.vnext_verification_remediation_observation.trigger_reasons,
  ["risk-gated-specialized-visible-contract", "public-check-failed"],
);
assert.match(prompts.get("P19"), /visible-contract conformance pass/u);
assert.equal(coreV2ProductionPrimaryCallCount, 2);
assert.equal(withCoreV2Production.result.vnext_verification_remediation_observation.eligible, true);
assert.deepEqual(
  withCoreV2Production.result.vnext_verification_remediation_observation.trigger_reasons,
  ["risk-gated-specialized-visible-contract", "public-check-failed"],
);
assert.match(prompts.get("P20"), /visible-contract conformance pass/u);
assert.match(prompts.get("P20"), /RUNNER_SELECTED_PUBLIC_CHECK_V1=/u);
assert.equal(coreV2ExactCoordinatorPrimaryCallCount, 2);
assert.equal(withCoreV2ExactCoordinator.result.vnext_verification_remediation_observation.eligible, true);
assert.deepEqual(
  withCoreV2ExactCoordinator.result.vnext_verification_remediation_observation.trigger_reasons,
  ["risk-gated-specialized-visible-contract", "public-check-failed"],
);
assert.equal(withCoreV2ExactCoordinator.result.vnext_host_verification_observation.allowed, true);
assert.match(prompts.get("P21"), /visible-contract conformance pass/u);
assert.match(prompts.get("P21"), /RUNNER_SELECTED_PUBLIC_CHECK_V1=/u);
assert.doesNotMatch(prompts.get("P21"), /concrete counterexamples/u);
assert.equal(coreV2AdversarialAuditPrimaryCallCount, 2);
assert.equal(withCoreV2AdversarialAudit.result.vnext_verification_remediation_observation.eligible, true);
assert.equal(withCoreV2AdversarialAudit.result.vnext_host_verification_observation.allowed, true);
assert.match(prompts.get("P22"), /concrete counterexamples/u);
assert.match(prompts.get("P22"), /RUNNER_SELECTED_PUBLIC_CHECK_V1=/u);
assert.match(firstPrompts.get("P23"), /HOST_REPOSITORY_MAP_V1=/u);
assert.doesNotMatch(firstPrompts.get("P23"), /[\r\n]/u);
assert.equal(withCoreV2BoundedContext.result.vnext_context_map_observation.eligible, true);
assert.equal(withCoreV2BoundedContext.result.vnext_context_map_observation.activated, true);
assert.equal(withCoreV2BoundedContext.result.vnext_context_map_observation.reason, "host_map_injected_before_model");
assert.equal(withCoreV2BoundedContext.result.termination_acceptable, true);
assert.equal(coreV2TransactionalPrimaryCallCount, 2);
assert.equal(withCoreV2Transactional.result.vnext_verification_remediation_observation.rollback_attempted_count, 1);
assert.equal(withCoreV2Transactional.result.vnext_verification_remediation_observation.rollback_completed_count, 1);
assert.equal(withCoreV2Transactional.result.vnext_verification_remediation_observation.reason, "retry_rolled_back_and_reverified");
assert.equal(withCoreV2Transactional.result.visible_check.passed, true);
assert.equal(withCoreV2Transactional.result.termination_acceptable, true);
assert.match(firstPrompts.get("P25"), /HOST_REPOSITORY_MAP_V1=/u);
assert.equal(withContractFirst.result.vnext_context_map_observation.activated, true);
assert.equal(withContractFirst.result.vnext_host_verification_observation.activated, true);
assert.equal(withContractFirst.result.vnext_verification_remediation_observation.eligible, false);
assert.equal(withContractFirst.result.termination_acceptable, true);
assert.match(firstPrompts.get("P26"), /HOST_REPOSITORY_MAP_V1=/u);
assert.match(firstPrompts.get("P26"), /HOST_VISIBLE_CONTRACT_V1=/u);
assert.equal(withHostCompiledContract.result.vnext_context_map_observation.activated, true);
assert.equal(withHostCompiledContract.result.vnext_visible_contract_observation.activated, true);
assert.equal(withHostCompiledContract.result.vnext_visible_contract_observation.clause_count > 0, true);
assert.equal(withHostCompiledContract.result.vnext_host_verification_observation.activated, true);
assert.equal(withHostCompiledContract.result.vnext_verification_remediation_observation.eligible, false);
assert.equal(withHostCompiledContract.result.termination_acceptable, true);
assert.equal(stratifiedVisibleContractPrimaryCallCount, 2);
assert.match(firstPrompts.get("P27"), /HOST_REPOSITORY_MAP_V1=/u);
assert.doesNotMatch(firstPrompts.get("P27"), /HOST_VISIBLE_CONTRACT_V1=/u);
assert.equal(withStratifiedVisibleContract.result.vnext_context_map_observation.activated, true);
assert.equal(withStratifiedVisibleContract.result.vnext_visible_contract_observation.eligible, false);
assert.equal(withStratifiedVisibleContract.result.vnext_verification_remediation_observation.operationally_complete, true);
assert.equal(withStratifiedVisibleContract.result.vnext_host_verification_observation.allowed, true);
assert.equal(withStratifiedVisibleContract.result.termination_acceptable, true);
assert.equal(vnextInitialAgentId({ profile_id: "P27", stratum: "small" }), "core-v3-build");
assert.equal(vnextInitialAgentId({ profile_id: "P27", stratum: "medium" }), null);
assert.deepEqual(vnextInitialAgentContext({ profile_id: "P18", stratum: "small" }), { agentId: "vnext-small-core" });
assert.deepEqual(vnextInitialAgentContext({ profile_id: "P27", stratum: "small" }), { agentId: "core-v3-build" });
assert.deepEqual(vnextInitialAgentContext({ profile_id: "P27", stratum: "high" }), {});
assert.equal(manifestTransactionalAuditPrimaryCallCount, 2);
assert.match(firstPrompts.get("P28"), /HOST_REPOSITORY_MAP_V1=/u);
assert.match(firstPrompts.get("P28"), /HOST_VISIBLE_CONTRACT_V1=/u);
assert.equal(withManifestTransactionalAudit.result.vnext_context_map_observation.activated, true);
assert.equal(withManifestTransactionalAudit.result.vnext_visible_contract_observation.activated, true);
assert.equal(withManifestTransactionalAudit.result.vnext_verification_remediation_observation.rollback_attempted_count, 1);
assert.equal(withManifestTransactionalAudit.result.vnext_verification_remediation_observation.rollback_completed_count, 1);
assert.equal(withManifestTransactionalAudit.result.vnext_verification_remediation_observation.reason, "retry_rolled_back_and_reverified");
assert.equal(withManifestTransactionalAudit.result.visible_check.passed, true);
assert.equal(withManifestTransactionalAudit.result.termination_acceptable, true);
assert.equal(vnextInitialAgentId({ profile_id: "P28", stratum: "small" }), null);
assert.deepEqual(vnextInitialAgentContext({ profile_id: "P28", stratum: "high" }), {});
assert.equal(evidenceGatedManifestAuditPrimaryCallCount, 2);
assert.match(firstPrompts.get("P29"), /HOST_REPOSITORY_MAP_V1=/u);
assert.match(firstPrompts.get("P29"), /HOST_VISIBLE_CONTRACT_V1=/u);
assert.deepEqual(
  withEvidenceGatedManifestAudit.result.vnext_verification_remediation_observation.trigger_reasons,
  ["risk-gated-specialized-visible-contract", "public-check-failed"],
);
assert.equal(withEvidenceGatedManifestAudit.result.vnext_verification_remediation_observation.operationally_complete, true);
assert.equal(withEvidenceGatedManifestAudit.result.termination_acceptable, true);
assert.equal(vnextInitialAgentId({ profile_id: "P29", stratum: "high" }), null);
assert.equal(manifestRiskGatedAuditPrimaryCallCount, 1);
assert.match(firstPrompts.get("P30"), /HOST_REPOSITORY_MAP_V1=/u);
assert.match(firstPrompts.get("P30"), /HOST_VISIBLE_CONTRACT_V1=/u);
assert.equal(withManifestRiskGatedAudit.result.vnext_verification_remediation_observation.eligible, false);
assert.equal(withManifestRiskGatedAudit.result.termination_acceptable, true);
assert.equal(vnextInitialAgentId({ profile_id: "P30", stratum: "high" }), null);
assert.equal(criticalManifestRiskAuditPrimaryCallCount, 1);
assert.match(firstPrompts.get("P31"), /HOST_REPOSITORY_MAP_V1=/u);
assert.match(firstPrompts.get("P31"), /HOST_VISIBLE_CONTRACT_V1=/u);
assert.equal(withCriticalManifestRiskAudit.result.vnext_verification_remediation_observation.eligible, false);
assert.equal(withCriticalManifestRiskAudit.result.termination_acceptable, true);
assert.equal(vnextInitialAgentId({ profile_id: "P31", stratum: "high" }), null);
assert.equal(reviewerFreeExactCorePrimaryCallCount, 7);
assert.match(firstPrompts.get("P32"), /HOST_REPOSITORY_MAP_V1=/u);
assert.match(firstPrompts.get("P32"), /HOST_VISIBLE_CONTRACT_V1=/u);
assert.equal(withReviewerFreeExactCore.result.vnext_verification_remediation_observation.eligible, false);
assert.equal(withReviewerFreeExactCore.result.vnext_verification_remediation_observation.retry_started_count, 0);
assert.equal(withReviewerFreeExactCore.result.termination_acceptable, true);
assert.equal(vnextInitialAgentId({ profile_id: "P32", stratum: "high" }), null);
assert.match(firstPrompts.get("P33"), /HOST_REPOSITORY_MAP_V1=/u);
assert.match(firstPrompts.get("P33"), /HOST_VISIBLE_CONTRACT_V2=/u);
assert.match(firstPrompts.get("P33"), /review_focus/u);
assert.equal(withScenarioTypedVisibleContract.result.vnext_verification_remediation_observation.eligible, false);
assert.equal(withScenarioTypedVisibleContract.result.vnext_verification_remediation_observation.retry_started_count, 0);
assert.equal(withScenarioTypedVisibleContract.result.termination_acceptable, true);
assert.equal(vnextInitialAgentId({ profile_id: "P33", stratum: "high" }), null);
assert.match(firstPrompts.get("P35"), /HOST_REPOSITORY_MAP_V1=/u);
assert.match(firstPrompts.get("P35"), /HOST_VISIBLE_CONTRACT_V2=/u);
assert.equal(withSecretMutationGuard.result.vnext_verification_remediation_observation.eligible, false);
assert.deepEqual(withSecretMutationGuard.result.vnext_secret_mutation_guard_observation, {
  eligible: true,
  activated: true,
  denied_count: 0,
  reason: "runtime_guard_bound",
});
assert.equal(withSecretMutationGuard.result.termination_acceptable, true);
assert.equal(vnextInitialAgentId({ profile_id: "P35", stratum: "high" }), null);
assert.match(firstPrompts.get("P36"), /HOST_REPOSITORY_MAP_V1=/u);
assert.match(firstPrompts.get("P36"), /HOST_VISIBLE_CONTRACT_V2=/u);
assert.deepEqual(withStratifiedScenarioVisibleContract.result.vnext_primary_route_observation, {
  eligible: true,
  activated: true,
  stratum: "medium",
  agent_id: "core-v4-build",
  visible_contract_version: "V2",
  reason: "host_route_bound",
});
assert.equal(withStratifiedScenarioVisibleContract.result.termination_acceptable, true);
assert.equal(vnextInitialAgentId({ profile_id: "P36", stratum: "small" }), "core-v3-build");
assert.equal(vnextInitialAgentId({ profile_id: "P36", stratum: "medium" }), null);
assert.equal(withMinimalSmallScenarioVisibleContract.result.execution_status, "completed");
assert.match(firstPrompts.get("P37"), /HOST_REPOSITORY_MAP_V1=/u);
assert.match(firstPrompts.get("P37"), /HOST_VISIBLE_CONTRACT_V2=/u);
assert.deepEqual(withMinimalSmallScenarioVisibleContract.result.vnext_primary_route_observation, {
  eligible: true,
  activated: true,
  stratum: "medium",
  agent_id: "core-v4-build",
  visible_contract_version: "V2",
  reason: "host_route_bound",
});
assert.equal(withMinimalSmallScenarioVisibleContract.result.termination_acceptable, true);
assert.equal(vnextInitialAgentId({ profile_id: "P37", stratum: "small" }), null);
assert.equal(vnextInitialAgentId({ profile_id: "P37", stratum: "medium" }), "core-v4-build");
assert.equal(vnextInitialAgentId({ profile_id: "P37", stratum: "high" }), "core-v4-build");
assert.equal(vnextVisibleContractManifestEnabled({ profile_id: "P37", stratum: "small" }), false);
assert.equal(vnextVisibleContractManifestEnabled({ profile_id: "P37", stratum: "medium" }), true);
assert.equal(vnextVisibleContractManifestEnabled({ profile_id: "P37", stratum: "high" }), true);
assert.equal(withMinimalSmallScenarioVisibleContractNoAudit.result.execution_status, "completed");
assert.match(firstPrompts.get("P38"), /HOST_REPOSITORY_MAP_V1=/u);
assert.match(firstPrompts.get("P38"), /HOST_VISIBLE_CONTRACT_V2=/u);
assert.deepEqual(withMinimalSmallScenarioVisibleContractNoAudit.result.vnext_primary_route_observation, {
  eligible: true,
  activated: true,
  stratum: "medium",
  agent_id: "core-v4-build",
  visible_contract_version: "V2",
  reason: "host_route_bound",
});
assert.equal(withMinimalSmallScenarioVisibleContractNoAudit.result.vnext_verification_remediation_observation.eligible, false);
assert.equal(withMinimalSmallScenarioVisibleContractNoAudit.result.vnext_verification_remediation_observation.retry_started_count, 0);
assert.equal(withMinimalSmallScenarioVisibleContractNoAudit.result.vnext_verification_remediation_observation.retry_completed_count, 0);
assert.equal(withMinimalSmallScenarioVisibleContractNoAudit.result.termination_acceptable, true);
assert.equal(vnextInitialAgentId({ profile_id: "P38", stratum: "small" }), null);
assert.equal(vnextInitialAgentId({ profile_id: "P38", stratum: "medium" }), "core-v4-build");
assert.equal(vnextInitialAgentId({ profile_id: "P38", stratum: "high" }), "core-v4-build");
assert.equal(vnextVisibleContractManifestEnabled({ profile_id: "P38", stratum: "small" }), false);
assert.equal(vnextVisibleContractManifestEnabled({ profile_id: "P38", stratum: "medium" }), true);
assert.equal(vnextVisibleContractManifestEnabled({ profile_id: "P38", stratum: "high" }), true);
assert.equal(vnextCoreV2AuditTriggerPolicy("P37"), "risk-or-evidence");
assert.equal(vnextCoreV2AuditTriggerPolicy("P38"), "disabled");
assert.equal(withProtocolBoundSmallNoAudit.result.execution_status, "completed");
assert.match(firstPrompts.get("P39"), /HOST_REPOSITORY_MAP_V1=/u);
assert.match(firstPrompts.get("P39"), /HOST_VISIBLE_CONTRACT_V2=/u);
assert.deepEqual(withProtocolBoundSmallNoAudit.result.vnext_primary_route_observation, {
  eligible: true,
  activated: true,
  stratum: "medium",
  agent_id: "core-v4-build",
  visible_contract_version: "V2",
  reason: "host_route_bound",
});
assert.equal(withProtocolBoundSmallNoAudit.result.vnext_verification_remediation_observation.eligible, false);
assert.equal(withProtocolBoundSmallNoAudit.result.vnext_verification_remediation_observation.retry_started_count, 0);
assert.equal(withProtocolBoundSmallNoAudit.result.vnext_verification_remediation_observation.retry_completed_count, 0);
assert.equal(vnextInitialAgentId({ profile_id: "P39", stratum: "small" }), "core-v4-build");
assert.equal(vnextInitialAgentId({ profile_id: "P39", stratum: "medium" }), "core-v4-build");
assert.equal(vnextInitialAgentId({ profile_id: "P39", stratum: "high" }), "core-v4-build");
assert.equal(vnextVisibleContractManifestEnabled({ profile_id: "P39", stratum: "small" }), false);
assert.equal(vnextVisibleContractManifestEnabled({ profile_id: "P39", stratum: "medium" }), true);
assert.equal(vnextVisibleContractManifestEnabled({ profile_id: "P39", stratum: "high" }), true);
assert.equal(vnextCoreV2AuditTriggerPolicy("P39"), "disabled");
assert.equal(publicCheckFailureOnlyPrimaryCallCount, 2);
assert.match(firstPrompts.get("P34"), /HOST_REPOSITORY_MAP_V1=/u);
assert.match(firstPrompts.get("P34"), /HOST_VISIBLE_CONTRACT_V2=/u);
assert.equal(withPublicCheckFailureOnly.result.vnext_verification_remediation_observation.eligible, true);
assert.equal(withPublicCheckFailureOnly.result.vnext_verification_remediation_observation.retry_started_count, 1);
assert.equal(withPublicCheckFailureOnly.result.vnext_verification_remediation_observation.retry_completed_count, 1);
assert.equal(withPublicCheckFailureOnly.result.vnext_verification_remediation_observation.retry_changed_count, 1);
assert.equal(withPublicCheckFailureOnly.result.vnext_verification_remediation_observation.retry_verification_passed_count, 1);
assert.deepEqual(
  withPublicCheckFailureOnly.result.vnext_verification_remediation_observation.trigger_reasons,
  ["risk-gated-specialized-visible-contract", "public-check-failed"],
);
assert.equal(withPublicCheckFailureOnly.result.vnext_verification_remediation_observation.rollback_attempted_count, 0);
assert.equal(withPublicCheckFailureOnly.result.termination_acceptable, true);
assert.equal(publicCheckFailureOnlySkipPrimaryCallCount, 1);
assert.equal(withPublicCheckFailureOnlySkip.result.vnext_verification_remediation_observation.eligible, false);
assert.equal(withPublicCheckFailureOnlySkip.result.vnext_verification_remediation_observation.retry_started_count, 0);
assert.equal(withPublicCheckFailureOnlySkip.result.termination_acceptable, true);
assert.equal(vnextInitialAgentId({ profile_id: "P34", stratum: "high" }), null);
assert.throws(
  () => vnextInitialAgentId({ profile_id: "P18", stratum: "unknown" }),
  /SYNTHETIC_RUNNER_INITIAL_AGENT/u,
);
assert.equal(invalidRetryPrimaryCallCount, 2);
assert.equal(withInvalidRetryMutation.result.vnext_verification_remediation_observation.retry_completed_count, 0);
assert.equal(withInvalidRetryMutation.result.vnext_verification_remediation_observation.retry_changed_count, 1);
assert.equal(withInvalidRetryMutation.result.workspace_policy.passed, false);
assert.equal(withInvalidRetryMutation.result.termination_acceptable, false);

process.stdout.write("bounded repository map runner integration passed\n");
