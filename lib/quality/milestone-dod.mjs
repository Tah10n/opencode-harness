import {
  assertExactKeys,
  assertIsoTimestamp,
  assertSafeId,
} from "../feedback/contracts.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertCommit,
  assertFingerprint,
  assertInteger,
  assertString,
  assertStringArray,
  exact,
  fingerprint,
} from "./validation.mjs";

export const MILESTONE_DOD_SCHEMA_VERSION = 2;

export const MILESTONE_DOD_STATUSES = Object.freeze([
  "verified",
  "partially_verified",
  "verification_failed",
  "blocked_external_state",
]);

export const MILESTONE_DOD_DIMENSIONS = Object.freeze([
  "deterministic_contracts",
  "windows_runtime",
  "linux_runtime",
  "macos_runtime",
  "host_hook_e2e",
  "general_live_evaluation",
]);

export const MILESTONE_DOD_OPERATIONAL_DIMENSIONS = Object.freeze([
  "windows_runtime",
  "linux_runtime",
  "macos_runtime",
  "host_hook_e2e",
]);

const DIMENSION_POLICY = Object.freeze({
  deterministic_contracts: Object.freeze({
    mandatory_for_verified: true,
    allowed_states: Object.freeze(["verified", "failed", "unavailable"]),
  }),
  windows_runtime: Object.freeze({
    mandatory_for_verified: true,
    allowed_states: Object.freeze(["verified", "failed", "unavailable"]),
  }),
  linux_runtime: Object.freeze({
    mandatory_for_verified: true,
    allowed_states: Object.freeze(["verified", "failed", "unavailable"]),
  }),
  macos_runtime: Object.freeze({
    mandatory_for_verified: true,
    allowed_states: Object.freeze(["verified", "failed", "unavailable", "unsupported"]),
  }),
  host_hook_e2e: Object.freeze({
    mandatory_for_verified: true,
    allowed_states: Object.freeze(["verified", "failed", "unavailable"]),
  }),
  general_live_evaluation: Object.freeze({
    mandatory_for_verified: false,
    allowed_states: Object.freeze(["verified", "failed", "unavailable", "not_requested"]),
  }),
});

export const MILESTONE_DOD_DIMENSION_STATES = Object.freeze(Object.fromEntries(
  MILESTONE_DOD_DIMENSIONS.map((dimensionId) => [dimensionId, DIMENSION_POLICY[dimensionId].allowed_states]),
));

const MAX_EXTERNAL_BLOCKING_CONTEXTS = MILESTONE_DOD_OPERATIONAL_DIMENSIONS.length;
const RECEIPT_STATUSES = Object.freeze(["passed", "failed"]);
const MAX_RECEIPTS = 64;
const DETERMINISTIC_RECEIPT_SCHEMA_VERSION = 1;
const OPERATIONAL_RECEIPT_SCHEMA_VERSION = 3;
const RECEIPT_BUNDLE_SCHEMA_VERSION = 2;
const RECEIPT_BUNDLE_KIND = "milestone_2_receipt_bundle";

export const MILESTONE_DOD_HOST_SCENARIO_IDS = Object.freeze([
  "unclassified_bash_blocked",
  "pre_gate_bash_blocked",
  "post_gate_bash_blocked",
  "edit_capability_authorized",
  "exact_edit_binding_observed",
  "authorized_edit_completed",
  "replayed_edit_capability_blocked",
  "after_hook_workspace_reconciled",
  "trusted_project_check_passed",
  "final_attestation_created",
]);

export const MILESTONE_DOD_DESCENDANT_SCENARIO_IDS = Object.freeze({
  win32: Object.freeze([
    "direct_child",
    "detached_descendant",
    "timeout_descendant",
  ]),
  linux: Object.freeze([
    "leaf_to_root_migration",
    "leaf_to_sibling_migration",
    "detached_descendant",
    "coordinator_death",
  ]),
});

const OPERATIONAL_PLATFORM_BY_DIMENSION = Object.freeze({
  windows_runtime: "win32",
  linux_runtime: "linux",
  macos_runtime: "darwin",
});

const OPERATIONAL_RESULT_KIND_BY_CHECK = Object.freeze({
  "windows-trusted-project-check": "trusted_project_check",
  "windows-descendant-teardown": "descendant_teardown",
  "linux-trusted-project-check": "trusted_project_check",
  "linux-descendant-teardown": "descendant_teardown",
  "macos-trusted-project-check": "trusted_project_check",
  "normal-session-host-hook-e2e": "installed_host",
});

const DETERMINISTIC_RECEIPT_PRODUCER = "opencode-harness/deterministic-verifier-v1";
const GENERAL_LIVE_RECEIPT_PRODUCER = "opencode-harness/live-evaluation-v1";

export const VERIFICATION_RECEIPT_PRODUCERS = Object.freeze({
  deterministic: DETERMINISTIC_RECEIPT_PRODUCER,
  deterministic_contracts: DETERMINISTIC_RECEIPT_PRODUCER,
  runtime: "opencode-harness/installed-runtime-verifier-v1",
  windows_runtime: "opencode-harness/windows-runtime-verifier-v2",
  linux_runtime: "opencode-harness/linux-runtime-verifier-v2",
  macos_runtime: "opencode-harness/macos-runtime-verifier-v2",
  host_hook_e2e: "opencode-harness/host-hook-e2e-verifier-v2",
  live: GENERAL_LIVE_RECEIPT_PRODUCER,
  general_live_evaluation: GENERAL_LIVE_RECEIPT_PRODUCER,
});

export const MILESTONE_DOD_CHECK_COMMANDS = Object.freeze({
  "npm-run-verify-m1": "verify-milestone-1-composite",
  "engineering-dossier-lifecycle": "verify-engineering-dossier",
  "engineering-dossier-negative-matrix": "verify-engineering-dossier",
  "engineering-pre-gate-latch": "verify-quality-live-coordinator",
  "normal-session-quality-bridge": "verify-normal-session-quality-bridge",
  "runtime-quality-hooks-fixtures": "verify-runtime-quality-hooks-fixture",
  "session-classification-lifecycle": "verify-session-classification",
  "bash-mutation-boundary": "verify-bash-boundary",
  "global-quality-plugin-export": "verify-global-quality-plugin-export",
  "engineering-mapping-gate": "verify-engineering-dossier",
  "canonical-verification-targets": "verify-quality-verification-targets",
  "quality-live-runner-integration": "verify-quality-live-runner",
  "project-check-catalog": "verify-project-check-catalog",
  "workspace-observation-boundary": "verify-workspace-observation",
  "trusted-toolchain-resolution": "verify-trusted-toolchains",
  "process-containment-contract": "verify-process-containment",
  "trusted-project-runner": "verify-trusted-project-runner",
  "engineering-impact-graph": "verify-impact-graph",
  "engineering-architecture-policy": "verify-architecture-policy",
  "quality-live-corpus": "verify-quality-live-manifests",
  "quality-acceptance-negative-matrix": "verify-quality-acceptance",
  "model-frontmatter-documentation": "verify-static",
  "prompt-inventory-drift": "verify-prompt-inventory",
  "documentation-attribution-boundary": "verify-static",
  "npm-run-verify": "verify-all-composite",
  "committed-whitespace": "verify-committed-whitespace",
  "committed-whitespace-fixtures": "verify-committed-whitespace-fixtures",
  "tracked-artifact-boundary": "verify-static",
  "external-gap-classification": "verify-milestone-2-dod-contract",
  "windows-trusted-project-check": "verify-trusted-project-runner",
  "windows-descendant-teardown": "verify-process-containment",
  "linux-trusted-project-check": "verify-trusted-project-runner",
  "linux-descendant-teardown": "verify-process-containment",
  "macos-trusted-project-check": "verify-trusted-project-runner",
  "normal-session-host-hook-e2e": "verify-runtime-quality-hooks",
  "general-live-evaluation": "eval-live",
});

export const MILESTONE_DOD_DIMENSION_CHECK_IDS = Object.freeze({
  deterministic_contracts: Object.freeze([
    "npm-run-verify-m1",
    "engineering-dossier-lifecycle",
    "engineering-dossier-negative-matrix",
    "engineering-pre-gate-latch",
    "normal-session-quality-bridge",
    "runtime-quality-hooks-fixtures",
    "session-classification-lifecycle",
    "bash-mutation-boundary",
    "global-quality-plugin-export",
    "engineering-mapping-gate",
    "canonical-verification-targets",
    "quality-live-runner-integration",
    "project-check-catalog",
    "workspace-observation-boundary",
    "trusted-toolchain-resolution",
    "process-containment-contract",
    "trusted-project-runner",
    "engineering-impact-graph",
    "engineering-architecture-policy",
    "quality-live-corpus",
    "quality-acceptance-negative-matrix",
    "model-frontmatter-documentation",
    "prompt-inventory-drift",
    "documentation-attribution-boundary",
    "npm-run-verify",
    "committed-whitespace",
    "committed-whitespace-fixtures",
    "tracked-artifact-boundary",
    "external-gap-classification",
  ]),
  windows_runtime: Object.freeze([
    "windows-trusted-project-check",
    "windows-descendant-teardown",
  ]),
  linux_runtime: Object.freeze([
    "linux-trusted-project-check",
    "linux-descendant-teardown",
  ]),
  macos_runtime: Object.freeze(["macos-trusted-project-check"]),
  host_hook_e2e: Object.freeze(["normal-session-host-hook-e2e"]),
  general_live_evaluation: Object.freeze(["general-live-evaluation"]),
});

export const MILESTONE_DOD_CHECK_REGISTRY = Object.freeze(Object.fromEntries(
  MILESTONE_DOD_DIMENSIONS.flatMap((dimensionId) => (
    MILESTONE_DOD_DIMENSION_CHECK_IDS[dimensionId].map((checkId) => [checkId, Object.freeze({
      check_id: checkId,
      dimension_id: dimensionId,
      producer_id: VERIFICATION_RECEIPT_PRODUCERS[dimensionId],
      command_id: MILESTONE_DOD_CHECK_COMMANDS[checkId],
    })])
  )),
));

const STATUS_FACT_BODY_KEYS = Object.freeze([
  "schema_version",
  ...MILESTONE_DOD_DIMENSIONS,
  "external_blocking_context",
]);
const STATUS_FACT_KEYS = Object.freeze([...STATUS_FACT_BODY_KEYS, "fingerprint"]);

function freezeDeep(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function withoutFingerprint(value) {
  const body = structuredClone(value);
  delete body.fingerprint;
  return body;
}

function assertCanonicalStringList(actual, expected, label) {
  assertStringArray(actual, label, { min: expected.length, max: expected.length, maxBytes: 128 });
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new ContractError("MILESTONE_DOD_CANONICAL_LIST", `${label} must match the canonical ordered values`);
  }
}

export function validateMilestone2DodDocument(value) {
  const keys = [
    "schema_version",
    "dod_id",
    "baseline_commit",
    "dimensions",
    "external_blocking_context",
    "completion_policy",
    "fingerprint",
  ];
  exact(value, keys, keys, "milestone 2 DoD");
  if (value.schema_version !== MILESTONE_DOD_SCHEMA_VERSION) {
    throw new ContractError(
      "MILESTONE_DOD_SCHEMA_VERSION",
      `milestone 2 DoD.schema_version must be ${MILESTONE_DOD_SCHEMA_VERSION}`,
    );
  }
  assertString(value.dod_id, "milestone 2 DoD.dod_id", { maxBytes: 128 });
  assertCommit(value.baseline_commit, "milestone 2 DoD.baseline_commit");
  assertArray(value.dimensions, "milestone 2 DoD.dimensions", {
    min: MILESTONE_DOD_DIMENSIONS.length,
    max: MILESTONE_DOD_DIMENSIONS.length,
    item: (entry, label, index) => {
      const dimensionKeys = [
        "dimension_id",
        "requirement",
        "mandatory_for_verified",
        "allowed_states",
        "check_ids",
        "evidence_refs",
      ];
      exact(entry, dimensionKeys, dimensionKeys, label);
      const expectedDimensionId = MILESTONE_DOD_DIMENSIONS[index];
      assertSafeId(entry.dimension_id, `${label}.dimension_id`);
      if (entry.dimension_id !== expectedDimensionId) {
        throw new ContractError(
          "MILESTONE_DOD_DIMENSION_ORDER",
          `${label}.dimension_id must be ${expectedDimensionId}`,
        );
      }
      assertString(entry.requirement, `${label}.requirement`);
      assertBoolean(entry.mandatory_for_verified, `${label}.mandatory_for_verified`);
      if (entry.mandatory_for_verified !== DIMENSION_POLICY[expectedDimensionId].mandatory_for_verified) {
        throw new ContractError(
          "MILESTONE_DOD_DIMENSION_MANDATORY",
          `${label}.mandatory_for_verified does not match the Milestone 2 policy`,
        );
      }
      assertCanonicalStringList(
        entry.allowed_states,
        DIMENSION_POLICY[expectedDimensionId].allowed_states,
        `${label}.allowed_states`,
      );
      assertStringArray(entry.check_ids, `${label}.check_ids`, { min: 1, max: MAX_RECEIPTS, maxBytes: 128 });
      entry.check_ids.forEach((checkId, checkIndex) => {
        assertSafeId(checkId, `${label}.check_ids[${checkIndex}]`);
      });
      assertCanonicalStringList(
        entry.check_ids,
        MILESTONE_DOD_DIMENSION_CHECK_IDS[expectedDimensionId],
        `${label}.check_ids`,
      );
      assertStringArray(entry.evidence_refs, `${label}.evidence_refs`, { path: true, min: 1, max: 16 });
    },
  });
  const checkIds = value.dimensions.flatMap((entry) => entry.check_ids);
  if (new Set(checkIds).size !== checkIds.length) {
    throw new ContractError("MILESTONE_DOD_CHECK_DUPLICATE", "milestone 2 DoD check IDs must be globally unique");
  }

  const externalPolicyKeys = ["eligible_dimensions", "max_entries", "require_unavailable_state"];
  exact(
    value.external_blocking_context,
    externalPolicyKeys,
    externalPolicyKeys,
    "milestone 2 DoD.external_blocking_context",
  );
  assertCanonicalStringList(
    value.external_blocking_context.eligible_dimensions,
    MILESTONE_DOD_OPERATIONAL_DIMENSIONS,
    "milestone 2 DoD.external_blocking_context.eligible_dimensions",
  );
  assertInteger(value.external_blocking_context.max_entries, "milestone 2 DoD.external_blocking_context.max_entries", {
    min: MAX_EXTERNAL_BLOCKING_CONTEXTS,
    max: MAX_EXTERNAL_BLOCKING_CONTEXTS,
  });
  assertBoolean(
    value.external_blocking_context.require_unavailable_state,
    "milestone 2 DoD.external_blocking_context.require_unavailable_state",
  );
  if (value.external_blocking_context.require_unavailable_state !== true) {
    throw new ContractError(
      "MILESTONE_DOD_BLOCKING_POLICY",
      "milestone 2 DoD external blocking context must require an unavailable operational dimension",
    );
  }

  exact(value.completion_policy, MILESTONE_DOD_STATUSES, MILESTONE_DOD_STATUSES, "milestone 2 DoD.completion_policy");
  MILESTONE_DOD_STATUSES.forEach((status) => {
    assertString(value.completion_policy[status], `milestone 2 DoD.completion_policy.${status}`);
  });
  assertFingerprint(value.fingerprint, "milestone 2 DoD.fingerprint");
  if (value.fingerprint !== fingerprint(withoutFingerprint(value))) {
    throw new ContractError("MILESTONE_DOD_FINGERPRINT", "milestone 2 DoD fingerprint mismatch");
  }
  return value;
}

function validateExternalBlockingContext(value, facts) {
  const position = new Map(MILESTONE_DOD_OPERATIONAL_DIMENSIONS.map((dimensionId, index) => [dimensionId, index]));
  let previousPosition = -1;
  const seen = new Set();
  assertArray(value, "milestone 2 status facts.external_blocking_context", {
    max: MAX_EXTERNAL_BLOCKING_CONTEXTS,
    item: (entry, label) => {
      const keys = ["dimension_id", "reason_code", "reason", "external_dependency"];
      exact(entry, keys, keys, label);
      assertSafeId(entry.dimension_id, `${label}.dimension_id`);
      if (!MILESTONE_DOD_OPERATIONAL_DIMENSIONS.includes(entry.dimension_id)) {
        throw new ContractError(
          "MILESTONE_DOD_BLOCKING_DIMENSION",
          `${label}.dimension_id is not eligible for external blocking context`,
        );
      }
      if (seen.has(entry.dimension_id)) {
        throw new ContractError(
          "MILESTONE_DOD_BLOCKING_DUPLICATE",
          `external blocking context duplicates ${entry.dimension_id}`,
        );
      }
      const currentPosition = position.get(entry.dimension_id);
      if (currentPosition <= previousPosition) {
        throw new ContractError(
          "MILESTONE_DOD_BLOCKING_ORDER",
          "external blocking context must follow canonical operational dimension order",
        );
      }
      if (facts[entry.dimension_id] !== "unavailable") {
        throw new ContractError(
          "MILESTONE_DOD_BLOCKING_STATE",
          `external blocking context requires ${entry.dimension_id}=unavailable`,
        );
      }
      assertSafeId(entry.reason_code, `${label}.reason_code`);
      assertString(entry.reason, `${label}.reason`, { maxBytes: 512 });
      assertString(entry.external_dependency, `${label}.external_dependency`, { maxBytes: 256 });
      seen.add(entry.dimension_id);
      previousPosition = currentPosition;
    },
  });
  return seen;
}

export function validateMilestone2StatusFacts(value) {
  exact(value, STATUS_FACT_KEYS, STATUS_FACT_KEYS, "milestone 2 status facts");
  if (value.schema_version !== MILESTONE_DOD_SCHEMA_VERSION) {
    throw new ContractError(
      "MILESTONE_DOD_FACTS_SCHEMA_VERSION",
      `milestone 2 status facts.schema_version must be ${MILESTONE_DOD_SCHEMA_VERSION}`,
    );
  }
  for (const dimensionId of MILESTONE_DOD_DIMENSIONS) {
    if (!DIMENSION_POLICY[dimensionId].allowed_states.includes(value[dimensionId])) {
      throw new ContractError(
        "MILESTONE_DOD_DIMENSION_STATE",
        `milestone 2 status facts.${dimensionId} is unsupported`,
      );
    }
  }
  validateExternalBlockingContext(value.external_blocking_context, value);
  assertFingerprint(value.fingerprint, "milestone 2 status facts.fingerprint");
  if (value.fingerprint !== fingerprint(withoutFingerprint(value))) {
    throw new ContractError("MILESTONE_DOD_FACTS_FINGERPRINT", "milestone 2 status facts fingerprint mismatch");
  }
  return value;
}

export function sealMilestone2StatusFacts(facts) {
  const body = { schema_version: MILESTONE_DOD_SCHEMA_VERSION, ...structuredClone(facts) };
  exact(body, STATUS_FACT_BODY_KEYS, STATUS_FACT_BODY_KEYS, "milestone 2 status fact body");
  const sealed = { ...body, fingerprint: fingerprint(body) };
  validateMilestone2StatusFacts(sealed);
  return freezeDeep(sealed);
}

function statusFact(dimensionId, state, externallyBlocked = false) {
  return Object.freeze({ dimension_id: dimensionId, state, externally_blocked: externallyBlocked });
}

export function assessMilestone2Status(facts) {
  validateMilestone2StatusFacts(facts);
  const blockingDimensions = new Set(facts.external_blocking_context.map((entry) => entry.dimension_id));
  const missingFacts = MILESTONE_DOD_DIMENSIONS
    .filter((dimensionId) => facts[dimensionId] === "unavailable")
    .map((dimensionId) => statusFact(dimensionId, "unavailable", blockingDimensions.has(dimensionId)));
  const failedFacts = MILESTONE_DOD_DIMENSIONS
    .filter((dimensionId) => facts[dimensionId] === "failed")
    .map((dimensionId) => statusFact(dimensionId, "failed"));
  const missingOperationalDimensions = MILESTONE_DOD_OPERATIONAL_DIMENSIONS
    .filter((dimensionId) => facts[dimensionId] === "unavailable");
  const allMissingOperationalDimensionsAreBlocked = missingOperationalDimensions.length > 0
    && missingOperationalDimensions.every((dimensionId) => blockingDimensions.has(dimensionId));
  const mandatoryOperationalDimensionsSatisfied = facts.windows_runtime === "verified"
    && facts.linux_runtime === "verified"
    && ["verified", "unsupported"].includes(facts.macos_runtime)
    && facts.host_hook_e2e === "verified";
  const generalLiveSatisfied = ["verified", "not_requested"].includes(facts.general_live_evaluation);

  let status;
  let statusRationale;
  if (failedFacts.length > 0) {
    status = "verification_failed";
    statusRationale = "At least one verification dimension reported failed evidence.";
  } else if (facts.deterministic_contracts === "unavailable") {
    status = "verification_failed";
    statusRationale = "Deterministic contracts are mandatory and cannot be replaced by external blocking context.";
  } else if (mandatoryOperationalDimensionsSatisfied && generalLiveSatisfied) {
    status = "verified";
    statusRationale = "All mandatory operational evidence is verified; macOS is verified or explicitly unsupported; general live evaluation is verified or not requested.";
  } else if (allMissingOperationalDimensionsAreBlocked && generalLiveSatisfied) {
    status = "blocked_external_state";
    statusRationale = "Every unavailable mandatory operational dimension has explicit bounded external blocking context.";
  } else {
    status = "partially_verified";
    statusRationale = "Verification is incomplete, and unavailable dimensions are not wholly explained by explicit external blocking context.";
  }

  return Object.freeze({
    status,
    status_rationale: statusRationale,
    facts_fingerprint: facts.fingerprint,
    missing_facts: Object.freeze(missingFacts),
    failed_facts: Object.freeze(failedFacts),
    external_blocking_context: freezeDeep(structuredClone(facts.external_blocking_context)),
  });
}

function receiptBody(receipt) {
  return withoutFingerprint(receipt);
}

export function sealVerificationReceipt(receipt) {
  if (receipt?.schema_version !== DETERMINISTIC_RECEIPT_SCHEMA_VERSION
    || receipt?.producer_id !== DETERMINISTIC_RECEIPT_PRODUCER) {
    throw new ContractError(
      "MILESTONE_RECEIPT_PRODUCER",
      "generic receipt sealing is restricted to the deterministic runner",
    );
  }
  const body = receiptBody({ evidence_scope: null, ...receipt });
  const sealed = freezeDeep({ ...structuredClone(body), fingerprint: fingerprint(body) });
  validateVerificationReceipt(sealed);
  return sealed;
}

export function sealOperationalVerificationReceipt(receipt) {
  exact(
    receipt,
    ["check_id", "started_at", "completed_at", "status", "evidence_scope"],
    ["check_id", "started_at", "completed_at", "status", "evidence_scope"],
    "operational verification receipt input",
  );
  const contract = MILESTONE_DOD_CHECK_REGISTRY[receipt.check_id];
  if (!contract || !MILESTONE_DOD_OPERATIONAL_DIMENSIONS.includes(contract.dimension_id)) {
    throw new ContractError("MILESTONE_RECEIPT_OPERATIONAL", "operational receipt check is not registered");
  }
  const scope = structuredClone(receipt.evidence_scope);
  const body = {
    schema_version: OPERATIONAL_RECEIPT_SCHEMA_VERSION,
    check_id: receipt.check_id,
    producer_id: contract.producer_id,
    command_id: contract.command_id,
    started_at: receipt.started_at,
    completed_at: receipt.completed_at,
    status: receipt.status,
    evidence_fingerprint: fingerprint(scope),
    evidence_scope: scope,
  };
  const sealed = freezeDeep({ ...body, fingerprint: fingerprint(body) });
  validateVerificationReceipt(sealed);
  return sealed;
}

function validateFingerprintList(value, label, { min = 0, max = 32 } = {}) {
  assertStringArray(value, label, { min, max, maxBytes: 80 });
  value.forEach((entry, index) => assertFingerprint(entry, `${label}[${index}]`));
  if (new Set(value).size !== value.length) {
    throw new ContractError("MILESTONE_RECEIPT_SCOPE", `${label} must be unique`);
  }
}

function validateScenarioIds(value, label, expected = null) {
  assertStringArray(value, label, { max: 32, maxBytes: 128 });
  value.forEach((entry, index) => assertSafeId(entry, `${label}[${index}]`));
  if (new Set(value).size !== value.length) {
    throw new ContractError("MILESTONE_RECEIPT_SCOPE", `${label} must be unique`);
  }
  if (expected !== null && JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new ContractError("MILESTONE_RECEIPT_SCOPE", `${label} must match the canonical scenario contract`);
  }
}

function validateRunBinding(value, label) {
  const keys = ["provider", "run_id", "run_attempt", "job_id", "repository", "source_attestation_fingerprint"];
  exact(value, keys, keys, label);
  if (!["github_actions", "local", "installed_host"].includes(value.provider)) {
    throw new ContractError("MILESTONE_RECEIPT_SCOPE", `${label}.provider is unsupported`);
  }
  assertString(value.run_id, `${label}.run_id`, { maxBytes: 256 });
  assertInteger(value.run_attempt, `${label}.run_attempt`, { min: 1, max: 1_000_000 });
  assertString(value.job_id, `${label}.job_id`, { maxBytes: 256 });
  if (value.repository !== null) assertString(value.repository, `${label}.repository`, { maxBytes: 256 });
  assertFingerprint(value.source_attestation_fingerprint, `${label}.source_attestation_fingerprint`);
}

function validateOperationalResult(receipt, dimensionId, platform, result, label) {
  const keys = [
    "kind",
    "verification_mode",
    "report_fingerprint",
    "containment_kind",
    "containment_identity_fingerprints",
    "teardown_verified",
    "scenario_ids",
    "trusted_check_receipt_fingerprints",
    "scenario_contract_fingerprint",
    "attestation_fingerprint",
    "host_evidence_fingerprint",
  ];
  exact(result, keys, keys, label);
  const expectedKind = OPERATIONAL_RESULT_KIND_BY_CHECK[receipt.check_id];
  if (result.kind !== expectedKind) {
    throw new ContractError("MILESTONE_RECEIPT_SCOPE", `${label}.kind does not match ${receipt.check_id}`);
  }
  if (result.verification_mode !== null
    && !["trusted_adapter", "deterministic_fixture"].includes(result.verification_mode)) {
    throw new ContractError("MILESTONE_RECEIPT_SCOPE", `${label}.verification_mode is unsupported`);
  }
  assertFingerprint(result.report_fingerprint, `${label}.report_fingerprint`);
  if (result.containment_kind !== null) {
    assertString(result.containment_kind, `${label}.containment_kind`, { maxBytes: 128 });
  }
  validateFingerprintList(result.containment_identity_fingerprints, `${label}.containment_identity_fingerprints`);
  if (result.teardown_verified !== null) assertBoolean(result.teardown_verified, `${label}.teardown_verified`);
  validateScenarioIds(result.scenario_ids, `${label}.scenario_ids`);
  validateFingerprintList(result.trusted_check_receipt_fingerprints, `${label}.trusted_check_receipt_fingerprints`);
  for (const key of ["scenario_contract_fingerprint", "attestation_fingerprint", "host_evidence_fingerprint"]) {
    if (result[key] !== null) assertFingerprint(result[key], `${label}.${key}`);
  }

  if (receipt.status !== "passed") return;
  if (dimensionId === "host_hook_e2e") {
    validateScenarioIds(result.scenario_ids, `${label}.scenario_ids`, MILESTONE_DOD_HOST_SCENARIO_IDS);
    if (result.containment_kind !== null
      || result.verification_mode !== "trusted_adapter"
      || result.containment_identity_fingerprints.length !== 0
      || result.teardown_verified !== null
      || result.trusted_check_receipt_fingerprints.length === 0
      || result.scenario_contract_fingerprint === null
      || result.attestation_fingerprint === null
      || result.host_evidence_fingerprint === null) {
      throw new ContractError("MILESTONE_RECEIPT_SCOPE", "passed host evidence is incomplete or not installed-host evidence");
    }
    return;
  }

  const expectedContainmentKind = platform === "win32"
    ? "windows-job-object-v1"
    : platform === "linux" ? "linux-cgroup-v2" : null;
  if (expectedContainmentKind === null) {
    throw new ContractError(
      "MILESTONE_RECEIPT_SCOPE",
      `passed ${platform} evidence has no registered verified containment mechanism`,
    );
  }
  if (result.containment_kind !== expectedContainmentKind
    || result.verification_mode !== null
    || result.containment_kind === null
    || result.containment_identity_fingerprints.length === 0
    || result.teardown_verified !== true
    || result.scenario_contract_fingerprint !== null
    || result.attestation_fingerprint !== null
    || result.host_evidence_fingerprint !== null) {
    throw new ContractError("MILESTONE_RECEIPT_SCOPE", "passed platform evidence lacks verified containment bindings");
  }
  if (result.kind === "trusted_project_check" && result.trusted_check_receipt_fingerprints.length === 0) {
    throw new ContractError("MILESTONE_RECEIPT_SCOPE", "passed trusted-project evidence has no trusted check receipts");
  }
  if (result.kind === "descendant_teardown") {
    validateScenarioIds(
      result.scenario_ids,
      `${label}.scenario_ids`,
      MILESTONE_DOD_DESCENDANT_SCENARIO_IDS[platform] ?? result.scenario_ids,
    );
  }
}

function validateOperationalScope(receipt) {
  const label = "verification receipt.evidence_scope";
  const keys = ["kind", "dimension_id", "platform", "head_sha", "workspace_fingerprint", "run_binding", "result"];
  exact(receipt.evidence_scope, keys, keys, label);
  if (receipt.evidence_scope.kind !== "milestone_operational") {
    throw new ContractError("MILESTONE_RECEIPT_SCOPE", `${label}.kind is unsupported`);
  }
  const contract = MILESTONE_DOD_CHECK_REGISTRY[receipt.check_id];
  if (!contract || !MILESTONE_DOD_OPERATIONAL_DIMENSIONS.includes(contract.dimension_id)
    || receipt.evidence_scope.dimension_id !== contract.dimension_id) {
    throw new ContractError("MILESTONE_RECEIPT_SCOPE", `${label}.dimension_id does not match the runner registry`);
  }
  const expectedPlatform = OPERATIONAL_PLATFORM_BY_DIMENSION[contract.dimension_id] ?? null;
  if (contract.dimension_id === "host_hook_e2e") {
    if (!["win32", "linux", "darwin"].includes(receipt.evidence_scope.platform)) {
      throw new ContractError("MILESTONE_RECEIPT_SCOPE", `${label}.platform is unsupported for host evidence`);
    }
  } else if (receipt.evidence_scope.platform !== expectedPlatform) {
    throw new ContractError("MILESTONE_RECEIPT_SCOPE", `${label}.platform does not match ${contract.dimension_id}`);
  }
  assertCommit(receipt.evidence_scope.head_sha, `${label}.head_sha`);
  assertFingerprint(receipt.evidence_scope.workspace_fingerprint, `${label}.workspace_fingerprint`);
  validateRunBinding(receipt.evidence_scope.run_binding, `${label}.run_binding`);
  validateOperationalResult(
    receipt,
    contract.dimension_id,
    receipt.evidence_scope.platform,
    receipt.evidence_scope.result,
    `${label}.result`,
  );
  if (receipt.evidence_fingerprint !== fingerprint(receipt.evidence_scope)) {
    throw new ContractError("MILESTONE_RECEIPT_SCOPE", "operational receipt evidence fingerprint mismatch");
  }
}

export function validateVerificationReceipt(receipt) {
  assertExactKeys(receipt, {
    allowed: [
      "schema_version", "check_id", "producer_id", "command_id", "started_at", "completed_at", "status",
      "evidence_fingerprint", "evidence_scope", "fingerprint",
    ],
    required: [
      "schema_version", "check_id", "producer_id", "command_id", "started_at", "completed_at", "status",
      "evidence_fingerprint", "evidence_scope", "fingerprint",
    ],
  }, "verification receipt");
  if (![DETERMINISTIC_RECEIPT_SCHEMA_VERSION, OPERATIONAL_RECEIPT_SCHEMA_VERSION].includes(receipt.schema_version)) {
    throw new ContractError("MILESTONE_RECEIPT_SCHEMA", "verification receipt.schema_version is unsupported");
  }
  assertSafeId(receipt.check_id, "verification receipt.check_id");
  assertString(receipt.producer_id, "verification receipt.producer_id", { maxBytes: 128 });
  assertSafeId(receipt.command_id, "verification receipt.command_id");
  assertIsoTimestamp(receipt.started_at, "verification receipt.started_at");
  assertIsoTimestamp(receipt.completed_at, "verification receipt.completed_at");
  if (Date.parse(receipt.completed_at) < Date.parse(receipt.started_at)) {
    throw new ContractError("MILESTONE_RECEIPT_TIME", "verification receipt timestamps must be monotonic");
  }
  if (!RECEIPT_STATUSES.includes(receipt.status)) {
    throw new ContractError("MILESTONE_RECEIPT_STATUS", "verification receipt.status is unsupported");
  }
  assertFingerprint(receipt.evidence_fingerprint, "verification receipt.evidence_fingerprint");
  if (receipt.schema_version === DETERMINISTIC_RECEIPT_SCHEMA_VERSION
    && receipt.producer_id !== DETERMINISTIC_RECEIPT_PRODUCER) {
    throw new ContractError("MILESTONE_RECEIPT_PRODUCER", "schema v1 receipts are deterministic-runner evidence only");
  }
  if (receipt.schema_version === DETERMINISTIC_RECEIPT_SCHEMA_VERSION && receipt.evidence_scope !== null) {
    exact(
      receipt.evidence_scope,
      ["kind", "mode", "head_sha", "range", "resolved_range", "working_tree_state", "command_statuses"],
      ["kind", "mode", "head_sha", "range", "resolved_range", "working_tree_state", "command_statuses"],
      "verification receipt.evidence_scope",
    );
    if (receipt.evidence_scope.kind !== "committed_whitespace") {
      throw new ContractError("MILESTONE_RECEIPT_SCOPE", "verification receipt evidence scope kind is unsupported");
    }
    if (!["local", "pull_request", "push"].includes(receipt.evidence_scope.mode)) {
      throw new ContractError("MILESTONE_RECEIPT_SCOPE", "verification receipt whitespace mode is unsupported");
    }
    assertCommit(receipt.evidence_scope.head_sha, "verification receipt.evidence_scope.head_sha");
    for (const key of ["range", "resolved_range", "working_tree_state"]) {
      if (receipt.evidence_scope[key] !== null) {
        assertString(receipt.evidence_scope[key], `verification receipt.evidence_scope.${key}`, { maxBytes: 256 });
      }
    }
    assertArray(receipt.evidence_scope.command_statuses, "verification receipt.evidence_scope.command_statuses", {
      min: 1,
      max: 32,
      item: (entry, label) => {
        exact(entry, ["argv_fingerprint", "status", "error_code"], ["argv_fingerprint", "status", "error_code"], label);
        assertFingerprint(entry.argv_fingerprint, `${label}.argv_fingerprint`);
        if (entry.status !== null && !Number.isInteger(entry.status)) {
          throw new ContractError("MILESTONE_RECEIPT_SCOPE", `${label}.status must be an integer or null`);
        }
        if (entry.error_code !== null) assertString(entry.error_code, `${label}.error_code`, { maxBytes: 128 });
      },
    });
  }
  if (receipt.schema_version === OPERATIONAL_RECEIPT_SCHEMA_VERSION) validateOperationalScope(receipt);
  assertFingerprint(receipt.fingerprint, "verification receipt.fingerprint");
  if (receipt.fingerprint !== fingerprint(receiptBody(receipt))) {
    throw new ContractError("MILESTONE_RECEIPT_FINGERPRINT", "verification receipt fingerprint mismatch");
  }
  return receipt;
}

export function validateMilestone2ReceiptBundle(bundle) {
  const keys = [
    "schema_version",
    "kind",
    "dimension_id",
    "head_sha",
    "workspace_fingerprint",
    "run_binding",
    "receipts",
    "fingerprint",
  ];
  exact(bundle, keys, keys, "milestone 2 receipt bundle");
  if (bundle.schema_version !== RECEIPT_BUNDLE_SCHEMA_VERSION || bundle.kind !== RECEIPT_BUNDLE_KIND) {
    throw new ContractError("MILESTONE_RECEIPT_BUNDLE_SCHEMA", "milestone 2 receipt bundle schema is unsupported");
  }
  if (!MILESTONE_DOD_DIMENSIONS.includes(bundle.dimension_id)
    || bundle.dimension_id === "general_live_evaluation") {
    throw new ContractError("MILESTONE_RECEIPT_BUNDLE_DIMENSION", "milestone 2 receipt bundle dimension is unsupported");
  }
  assertCommit(bundle.head_sha, "milestone 2 receipt bundle.head_sha");
  assertFingerprint(bundle.workspace_fingerprint, "milestone 2 receipt bundle.workspace_fingerprint");
  validateRunBinding(bundle.run_binding, "milestone 2 receipt bundle.run_binding");
  assertArray(bundle.receipts, "milestone 2 receipt bundle.receipts", {
    max: MAX_RECEIPTS,
    item: validateVerificationReceipt,
  });
  const allowedCheckIds = new Set(MILESTONE_DOD_DIMENSION_CHECK_IDS[bundle.dimension_id]);
  const seen = new Set();
  for (const receipt of bundle.receipts) {
    if (!allowedCheckIds.has(receipt.check_id)) {
      throw new ContractError(
        "MILESTONE_RECEIPT_BUNDLE_CHECK",
        `${receipt.check_id} does not belong to ${bundle.dimension_id}`,
      );
    }
    if (seen.has(receipt.check_id)) {
      throw new ContractError("MILESTONE_RECEIPT_BUNDLE_CHECK", `duplicate bundled check ${receipt.check_id}`);
    }
    seen.add(receipt.check_id);
    if (bundle.dimension_id === "deterministic_contracts") {
      if (receipt.schema_version !== DETERMINISTIC_RECEIPT_SCHEMA_VERSION) {
        throw new ContractError(
          "MILESTONE_RECEIPT_BUNDLE_BINDING",
          "deterministic bundles may contain only deterministic receipts",
        );
      }
      continue;
    }
    const scope = receipt.evidence_scope;
    if (receipt.schema_version !== OPERATIONAL_RECEIPT_SCHEMA_VERSION
      || scope.dimension_id !== bundle.dimension_id
      || scope.head_sha !== bundle.head_sha
      || scope.workspace_fingerprint !== bundle.workspace_fingerprint
      || fingerprint(scope.run_binding) !== fingerprint(bundle.run_binding)) {
      throw new ContractError(
        "MILESTONE_RECEIPT_BUNDLE_BINDING",
        "operational receipt provenance does not match its bundle",
      );
    }
  }
  assertFingerprint(bundle.fingerprint, "milestone 2 receipt bundle.fingerprint");
  if (bundle.fingerprint !== fingerprint(withoutFingerprint(bundle))) {
    throw new ContractError("MILESTONE_RECEIPT_BUNDLE_FINGERPRINT", "milestone 2 receipt bundle fingerprint mismatch");
  }
  return bundle;
}

export function sealMilestone2ReceiptBundle(value) {
  exact(
    value,
    ["dimension_id", "head_sha", "workspace_fingerprint", "run_binding", "receipts"],
    ["dimension_id", "head_sha", "workspace_fingerprint", "run_binding", "receipts"],
    "milestone 2 receipt bundle input",
  );
  const body = {
    schema_version: RECEIPT_BUNDLE_SCHEMA_VERSION,
    kind: RECEIPT_BUNDLE_KIND,
    ...structuredClone(value),
  };
  const sealed = freezeDeep({ ...body, fingerprint: fingerprint(body) });
  validateMilestone2ReceiptBundle(sealed);
  return sealed;
}

function expectedCheckMap(expectedChecks) {
  assertArray(expectedChecks, "expected verification checks", {
    min: 1,
    max: MAX_RECEIPTS,
    item: (entry, label) => {
      exact(entry, ["check_id", "producer_id", "command_id"], ["check_id", "producer_id", "command_id"], label);
      assertSafeId(entry.check_id, `${label}.check_id`);
      assertString(entry.producer_id, `${label}.producer_id`, { maxBytes: 128 });
      assertSafeId(entry.command_id, `${label}.command_id`);
    },
  });
  const map = new Map();
  for (const expected of expectedChecks) {
    if (map.has(expected.check_id)) {
      throw new ContractError("MILESTONE_EXPECTED_DUPLICATE", `duplicate expected check ${expected.check_id}`);
    }
    map.set(expected.check_id, expected);
  }
  return map;
}

export function milestone2ExpectedChecks(document) {
  validateMilestone2DodDocument(document);
  const declaredCheckIds = document.dimensions.flatMap((dimension) => dimension.check_ids);
  const canonicalCheckIds = Object.keys(MILESTONE_DOD_CHECK_REGISTRY);
  const commandCheckIds = Object.keys(MILESTONE_DOD_CHECK_COMMANDS);
  if (JSON.stringify([...declaredCheckIds].sort()) !== JSON.stringify([...canonicalCheckIds].sort())
    || JSON.stringify([...canonicalCheckIds].sort()) !== JSON.stringify([...commandCheckIds].sort())
    || canonicalCheckIds.some((checkId) => MILESTONE_DOD_CHECK_REGISTRY[checkId].command_id === undefined)) {
    throw new ContractError(
      "MILESTONE_DOD_CHECK_REGISTRY",
      "milestone 2 DoD checks must match the runner-owned canonical command registry",
    );
  }
  return freezeDeep(MILESTONE_DOD_DIMENSIONS.flatMap((dimensionId) => (
    MILESTONE_DOD_DIMENSION_CHECK_IDS[dimensionId].map((checkId) => ({
      check_id: checkId,
      producer_id: MILESTONE_DOD_CHECK_REGISTRY[checkId].producer_id,
      command_id: MILESTONE_DOD_CHECK_REGISTRY[checkId].command_id,
    }))
  )));
}

function validateReceiptSet(receipts, expectedChecks, label) {
  assertArray(receipts, label, { max: MAX_RECEIPTS, item: validateVerificationReceipt });
  const expected = expectedCheckMap(expectedChecks);
  const seen = new Map();
  const operationalDimensionBindings = new Map();
  let operationalRunBinding = null;
  for (const receipt of receipts) {
    if (seen.has(receipt.check_id)) {
      throw new ContractError("MILESTONE_RECEIPT_DUPLICATE", `duplicate verification receipt ${receipt.check_id}`);
    }
    const contract = expected.get(receipt.check_id);
    if (!contract) {
      throw new ContractError("MILESTONE_RECEIPT_UNEXPECTED", `unexpected verification receipt ${receipt.check_id}`);
    }
    if (receipt.producer_id !== contract.producer_id) {
      throw new ContractError("MILESTONE_RECEIPT_UNTRUSTED", `untrusted producer for ${receipt.check_id}`);
    }
    if (receipt.command_id !== contract.command_id) {
      throw new ContractError("MILESTONE_RECEIPT_SUBSTITUTED", `substituted command for ${receipt.check_id}`);
    }
    if (receipt.schema_version === OPERATIONAL_RECEIPT_SCHEMA_VERSION) {
      const scope = receipt.evidence_scope;
      const dimensionBinding = fingerprint({
        dimension_id: scope.dimension_id,
        platform: scope.platform,
        head_sha: scope.head_sha,
        workspace_fingerprint: scope.workspace_fingerprint,
        run_binding: scope.run_binding,
      });
      const previousDimensionBinding = operationalDimensionBindings.get(scope.dimension_id);
      if (previousDimensionBinding !== undefined && previousDimensionBinding !== dimensionBinding) {
        throw new ContractError(
          "MILESTONE_RECEIPT_PROVENANCE",
          `${scope.dimension_id} receipts do not share one HEAD, workspace, job, and run binding`,
        );
      }
      operationalDimensionBindings.set(scope.dimension_id, dimensionBinding);
      const sharedRunBinding = fingerprint({
        provider: scope.run_binding.provider,
        run_id: scope.run_binding.run_id,
        run_attempt: scope.run_binding.run_attempt,
        repository: scope.run_binding.repository,
        head_sha: scope.head_sha,
        source_attestation_fingerprint: scope.run_binding.source_attestation_fingerprint,
      });
      if (operationalRunBinding !== null && operationalRunBinding !== sharedRunBinding) {
        throw new ContractError(
          "MILESTONE_RECEIPT_PROVENANCE",
          "operational receipts must belong to one repository HEAD and verification run",
        );
      }
      operationalRunBinding = sharedRunBinding;
    }
    seen.set(receipt.check_id, receipt);
  }
  return { expected, seen };
}

export function deriveMilestone2StatusFacts(value) {
  exact(
    value,
    ["document", "receipts", "macos_state", "general_live_state", "external_blocking_context"],
    ["document", "receipts"],
    "milestone 2 derived status input",
  );
  const {
    document,
    receipts,
    macos_state: macosState = "unsupported",
    general_live_state: generalLiveState = "not_requested",
    external_blocking_context: externalBlockingContext = [],
  } = value;
  validateMilestone2DodDocument(document);
  if (!["unsupported", "unavailable"].includes(macosState)) {
    throw new ContractError("MILESTONE_DOD_DERIVATION", "receipt-free macOS state must be unsupported or unavailable");
  }
  if (!["not_requested", "unavailable"].includes(generalLiveState)) {
    throw new ContractError(
      "MILESTONE_DOD_DERIVATION",
      "receipt-free general live state must be not_requested or unavailable",
    );
  }
  const expectedChecks = milestone2ExpectedChecks(document);
  const { seen } = validateReceiptSet(receipts, expectedChecks, "verification receipts");
  const states = {};
  for (const dimension of document.dimensions) {
    const selected = dimension.check_ids.map((checkId) => seen.get(checkId)).filter(Boolean);
    if (selected.some((receipt) => receipt.status === "failed")) {
      states[dimension.dimension_id] = "failed";
    } else if (selected.length === dimension.check_ids.length
      && selected.every((receipt) => receipt.status === "passed")) {
      states[dimension.dimension_id] = "verified";
    } else {
      states[dimension.dimension_id] = "unavailable";
    }
  }
  if (states.macos_runtime === "unavailable") states.macos_runtime = macosState;
  if (states.general_live_evaluation === "unavailable") states.general_live_evaluation = generalLiveState;
  return sealMilestone2StatusFacts({
    ...states,
    external_blocking_context: structuredClone(externalBlockingContext),
  });
}

export function assessMilestone2Receipts(value) {
  const keys = ["document", "receipts", "facts"];
  exact(value, keys, keys, "milestone 2 receipt assessment");
  const { document, receipts, facts } = value;
  validateMilestone2DodDocument(document);
  validateMilestone2StatusFacts(facts);

  const expectedChecks = milestone2ExpectedChecks(document);
  const { expected, seen } = validateReceiptSet(receipts, expectedChecks, "verification receipts");

  for (const dimension of document.dimensions) {
    const registeredIds = dimension.check_ids.filter((checkId) => expected.has(checkId));
    const selectedReceipts = registeredIds.map((checkId) => seen.get(checkId)).filter(Boolean);
    const allChecksPassed = registeredIds.length === dimension.check_ids.length
      && selectedReceipts.length === dimension.check_ids.length
      && selectedReceipts.every((receipt) => receipt.status === "passed");
    const anyCheckFailed = selectedReceipts.some((receipt) => receipt.status === "failed");
    const claimedState = facts[dimension.dimension_id];
    if (claimedState === "verified" && !allChecksPassed) {
      throw new ContractError(
        "MILESTONE_RECEIPT_FACT_MISMATCH",
        `${dimension.dimension_id}=verified requires every declared check receipt to pass`,
      );
    }
    if (claimedState === "failed" && !anyCheckFailed) {
      throw new ContractError(
        "MILESTONE_RECEIPT_FACT_MISMATCH",
        `${dimension.dimension_id}=failed requires a failed declared check receipt`,
      );
    }
    if (claimedState === "unavailable" && (allChecksPassed || anyCheckFailed)) {
      throw new ContractError(
        "MILESTONE_RECEIPT_FACT_MISMATCH",
        `${dimension.dimension_id}=unavailable conflicts with conclusive receipts`,
      );
    }
    if (["unsupported", "not_requested"].includes(claimedState) && selectedReceipts.length > 0) {
      throw new ContractError(
        "MILESTONE_RECEIPT_FACT_MISMATCH",
        `${dimension.dimension_id}=${claimedState} cannot register execution receipts`,
      );
    }
  }

  const report = assessMilestone2Status(facts);
  const declaredCheckIds = document.dimensions.flatMap((dimension) => dimension.check_ids);
  const registeredMissing = declaredCheckIds.filter((checkId) => expected.has(checkId) && !seen.has(checkId));
  const registeredFailed = declaredCheckIds.filter((checkId) => seen.get(checkId)?.status === "failed");
  const deterministicCheckIds = document.dimensions
    .find((dimension) => dimension.dimension_id === "deterministic_contracts")
    .check_ids;
  return Object.freeze({
    ...report,
    receipt_missing: Object.freeze(registeredMissing),
    receipt_failed: Object.freeze(registeredFailed),
    deterministic_missing: Object.freeze(deterministicCheckIds.filter((checkId) => expected.has(checkId) && !seen.has(checkId))),
    deterministic_failed: Object.freeze(deterministicCheckIds.filter((checkId) => seen.get(checkId)?.status === "failed")),
  });
}
