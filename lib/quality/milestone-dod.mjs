import {
  assertExactKeys,
  assertIsoTimestamp,
  assertSafeId,
} from "../feedback/contracts.mjs";
import { MILESTONE_DOD_SCHEMA_VERSION } from "./constants.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertCommit,
  assertFingerprint,
  assertString,
  assertStringArray,
  exact,
  fingerprint,
} from "./validation.mjs";

export const MILESTONE_DOD_STATUSES = Object.freeze([
  "verified",
  "partially_verified",
  "verification_failed",
  "blocked_external_state",
]);

export const VERIFICATION_RECEIPT_PRODUCERS = Object.freeze({
  deterministic: "opencode-harness/deterministic-verifier-v1",
  runtime: "opencode-harness/installed-runtime-verifier-v1",
  live: "opencode-harness/live-evaluation-v1",
});

const RECEIPT_STATUSES = Object.freeze(["passed", "failed"]);
const MAX_RECEIPTS = 64;

export function validateMilestone2DodDocument(value) {
  exact(value, ["schema_version", "dod_id", "baseline_commit", "items", "completion_policy", "fingerprint"], [
    "schema_version", "dod_id", "baseline_commit", "items", "completion_policy", "fingerprint",
  ], "milestone 2 DoD");
  if (value.schema_version !== MILESTONE_DOD_SCHEMA_VERSION) {
    throw new ContractError(
      "MILESTONE_DOD_SCHEMA_VERSION",
      `milestone 2 DoD.schema_version must be ${MILESTONE_DOD_SCHEMA_VERSION}`,
    );
  }
  assertString(value.dod_id, "milestone 2 DoD.dod_id", { maxBytes: 128 });
  assertCommit(value.baseline_commit, "milestone 2 DoD.baseline_commit");
  assertArray(value.items, "milestone 2 DoD.items", {
    min: 18,
    max: 18,
    item: (entry, label) => {
      exact(entry, ["item_id", "requirement", "execution_class", "check_ids", "evidence_refs", "mandatory"], [
        "item_id", "requirement", "execution_class", "check_ids", "evidence_refs", "mandatory",
      ], label);
      assertString(entry.item_id, `${label}.item_id`, { maxBytes: 16 });
      assertString(entry.requirement, `${label}.requirement`);
      if (!["deterministic", "runtime_optional", "live_external"].includes(entry.execution_class)) {
        throw new ContractError("MILESTONE_DOD_EXECUTION_CLASS", `${label}.execution_class is unsupported`);
      }
      assertStringArray(entry.check_ids, `${label}.check_ids`, { min: 1, max: 8 });
      assertStringArray(entry.evidence_refs, `${label}.evidence_refs`, { path: true, min: 1, max: 8 });
      assertBoolean(entry.mandatory, `${label}.mandatory`);
    },
  });
  const expectedItemIds = Array.from({ length: 18 }, (_, index) => `DOD-${String(index + 1).padStart(2, "0")}`);
  if (JSON.stringify(value.items.map((entry) => entry.item_id)) !== JSON.stringify(expectedItemIds)) {
    throw new ContractError("MILESTONE_DOD_ITEM_IDS", "milestone 2 DoD item IDs must be the canonical DOD-01..DOD-18 sequence");
  }
  const optionalItemIds = new Set(["DOD-11", "DOD-17"]);
  if (value.items.some((entry) => entry.mandatory === optionalItemIds.has(entry.item_id))) {
    throw new ContractError(
      "MILESTONE_DOD_MANDATORY",
      "only installed-runtime and general live-evaluation evidence may be optional",
    );
  }
  const checkIds = value.items.flatMap((entry) => entry.check_ids);
  if (new Set(checkIds).size !== checkIds.length) {
    throw new ContractError("MILESTONE_DOD_CHECK_DUPLICATE", "milestone 2 DoD check IDs must be unique");
  }
  exact(value.completion_policy, MILESTONE_DOD_STATUSES, MILESTONE_DOD_STATUSES, "milestone 2 DoD.completion_policy");
  MILESTONE_DOD_STATUSES.forEach((status) => {
    assertString(value.completion_policy[status], `milestone 2 DoD.completion_policy.${status}`);
  });
  assertFingerprint(value.fingerprint, "milestone 2 DoD.fingerprint");
  const body = structuredClone(value);
  delete body.fingerprint;
  if (value.fingerprint !== fingerprint(body)) {
    throw new ContractError("MILESTONE_DOD_FINGERPRINT", "milestone 2 DoD fingerprint mismatch");
  }
  return value;
}

export function assessMilestone2Status(facts) {
  exact(facts, ["deterministic", "runtime", "live", "external_blocking_context"], [
    "deterministic", "runtime", "live", "external_blocking_context",
  ], "milestone 2 status facts");
  if (!["passed", "failed", "missing"].includes(facts.deterministic)) {
    throw new ContractError("MILESTONE_DOD_STATUS_FACT", "deterministic status fact is invalid");
  }
  if (!["available_passed", "available_failed", "unavailable"].includes(facts.runtime)) {
    throw new ContractError("MILESTONE_DOD_STATUS_FACT", "runtime status fact is invalid");
  }
  if (!["available_passed", "available_failed", "unavailable"].includes(facts.live)) {
    throw new ContractError("MILESTONE_DOD_STATUS_FACT", "live status fact is invalid");
  }
  assertBoolean(facts.external_blocking_context, "milestone 2 status facts.external_blocking_context");
  if (facts.deterministic === "failed" || facts.runtime === "available_failed" || facts.live === "available_failed") {
    return "verification_failed";
  }
  if (facts.deterministic === "missing") {
    return facts.external_blocking_context ? "blocked_external_state" : "verification_failed";
  }
  const runtimeProvided = facts.runtime === "available_passed";
  const liveProvided = facts.live === "available_passed";
  if (runtimeProvided !== liveProvided) return "partially_verified";
  return "verified";
}

function receiptBody(receipt) {
  const body = structuredClone(receipt);
  delete body.fingerprint;
  return body;
}

export function sealVerificationReceipt(receipt) {
  const body = receiptBody({ evidence_scope: null, ...receipt });
  const sealed = Object.freeze({ ...body, fingerprint: fingerprint(body) });
  validateVerificationReceipt(sealed);
  return sealed;
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
  if (receipt.schema_version !== 1) {
    throw new ContractError("MILESTONE_RECEIPT_SCHEMA", "verification receipt.schema_version must be 1");
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
  if (receipt.evidence_scope !== null) {
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
  assertFingerprint(receipt.fingerprint, "verification receipt.fingerprint");
  if (receipt.fingerprint !== fingerprint(receiptBody(receipt))) {
    throw new ContractError("MILESTONE_RECEIPT_FINGERPRINT", "verification receipt fingerprint mismatch");
  }
  return receipt;
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

function validateReceiptSet(receipts, expectedChecks, label) {
  assertArray(receipts, label, { max: MAX_RECEIPTS, item: validateVerificationReceipt });
  const expected = expectedCheckMap(expectedChecks);
  const seen = new Map();
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
    seen.set(receipt.check_id, receipt);
  }
  return { expected, seen };
}

export function assessMilestone2Receipts({ document, receipts, expectedChecks }) {
  validateMilestone2DodDocument(document);
  const deterministicCheckIds = document.items
    .filter((item) => item.execution_class === "deterministic")
    .flatMap((item) => item.check_ids);
  const runtimeCheckIds = document.items
    .filter((item) => item.execution_class === "runtime_optional")
    .flatMap((item) => item.check_ids);
  const liveCheckIds = document.items
    .filter((item) => item.execution_class === "live_external")
    .flatMap((item) => item.check_ids);
  const declaredIds = [...deterministicCheckIds, ...runtimeCheckIds, ...liveCheckIds];
  const expectedIds = expectedChecks.map((entry) => entry.check_id);
  if (new Set(expectedIds).size !== expectedIds.length || expectedIds.some((id) => !declaredIds.includes(id))) {
    throw new ContractError("MILESTONE_EXPECTED_SCOPE", "expected receipt registry contains duplicate or undeclared checks");
  }
  const { seen } = validateReceiptSet(receipts, expectedChecks, "verification receipts");
  const classify = (checkIds) => {
    const selected = checkIds.map((checkId) => seen.get(checkId)).filter(Boolean);
    if (selected.some((receipt) => receipt.status === "failed")) return "available_failed";
    if (selected.length === checkIds.length && selected.every((receipt) => receipt.status === "passed")) {
      return "available_passed";
    }
    return "unavailable";
  };
  const deterministicMissing = deterministicCheckIds.filter((checkId) => !seen.has(checkId));
  const deterministicFailed = deterministicCheckIds.filter((checkId) => seen.get(checkId)?.status === "failed");
  const status = assessMilestone2Status({
    deterministic: deterministicFailed.length > 0 ? "failed" : deterministicMissing.length > 0 ? "missing" : "passed",
    runtime: classify(runtimeCheckIds),
    live: classify(liveCheckIds),
    external_blocking_context: false,
  });
  return Object.freeze({
    status,
    deterministic_missing: Object.freeze(deterministicMissing),
    deterministic_failed: Object.freeze(deterministicFailed),
    runtime: classify(runtimeCheckIds),
    live: classify(liveCheckIds),
  });
}
