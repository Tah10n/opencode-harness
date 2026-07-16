import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MILESTONE_DOD_DESCENDANT_SCENARIO_IDS,
  MILESTONE_DOD_DIMENSIONS,
  MILESTONE_DOD_HOST_SCENARIO_IDS,
  assessMilestone2Receipts,
  assessMilestone2Status,
  deriveMilestone2StatusFacts,
  milestone2ExpectedChecks,
  sealMilestone2ReceiptBundle,
  sealMilestone2StatusFacts,
  sealOperationalVerificationReceipt,
  sealVerificationReceipt,
  validateMilestone2DodDocument,
  validateMilestone2ReceiptBundle,
  validateMilestone2StatusFacts,
} from "../lib/quality/milestone-dod.mjs";
import { sealMilestone2OperationalReport } from "../lib/quality/milestone-operational-report.mjs";
import {
  assertMilestone2BundleMatchesRunContext,
  milestone2SharedRunFingerprint,
  milestone2SourceStabilityFingerprint,
} from "../lib/quality/milestone-run-context.mjs";
import { ContractError, fingerprint } from "../lib/quality/validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const document = JSON.parse(fs.readFileSync(path.join(root, "quality", "milestone-2-dod.v3.json"), "utf8"));
const staleV2Document = JSON.parse(fs.readFileSync(path.join(root, "quality", "milestone-2-dod.v2.json"), "utf8"));
const staleV1Document = JSON.parse(fs.readFileSync(path.join(root, "quality", "milestone-2-dod.v1.json"), "utf8"));

validateMilestone2DodDocument(document);
assert.deepEqual(
  document.dimensions.map((dimension) => dimension.dimension_id),
  MILESTONE_DOD_DIMENSIONS,
  "Milestone 2 dimensions must stay explicit and canonically ordered",
);
for (const dimension of document.dimensions) {
  for (const relativePath of dimension.evidence_refs) {
    const resolved = path.resolve(root, ...relativePath.split("/"));
    assert(
      resolved.startsWith(`${root}${path.sep}`) && fs.existsSync(resolved),
      `${dimension.dimension_id} evidence location is missing: ${relativePath}`,
    );
  }
}

assert.throws(() => validateMilestone2DodDocument(staleV1Document), ContractError, "stale v1 DoD must be rejected");
assert.throws(() => validateMilestone2DodDocument(staleV2Document), ContractError, "stale v2 DoD must be rejected");
assert.throws(() => validateMilestone2DodDocument({ ...document, schema_version: 2 }), /schema_version must be 3/u);
assert.throws(() => validateMilestone2DodDocument({ ...document, unexpected: true }), ContractError);
for (const field of Object.keys(document)) {
  const incomplete = structuredClone(document);
  delete incomplete[field];
  assert.throws(() => validateMilestone2DodDocument(incomplete), ContractError, `one-document-field removal must fail: ${field}`);
}
assert.throws(() => validateMilestone2DodDocument({
  ...document,
  dod_id: "tampered-dod-id",
}), /fingerprint mismatch/u);
assert.throws(() => validateMilestone2DodDocument({
  ...document,
  dimensions: document.dimensions.map((dimension, index) => index === 0 ? {
    ...dimension,
    allowed_states: ["failed", "verified", "unavailable"],
  } : dimension),
}), /canonical ordered values/u);
const swappedOperationalBody = structuredClone(document);
delete swappedOperationalBody.fingerprint;
const windowsChecks = swappedOperationalBody.dimensions[1].check_ids;
swappedOperationalBody.dimensions[1].check_ids = swappedOperationalBody.dimensions[2].check_ids;
swappedOperationalBody.dimensions[2].check_ids = windowsChecks;
assert.throws(() => validateMilestone2DodDocument({
  ...swappedOperationalBody,
  fingerprint: fingerprint(swappedOperationalBody),
}), /canonical ordered values/u, "operational check IDs cannot acquire another dimension's producer");

const completeFactBody = Object.freeze({
  deterministic_contracts: "verified",
  windows_runtime: "verified",
  linux_runtime: "verified",
  macos_runtime: "verified",
  host_hook_e2e: "verified",
  general_live_evaluation: "not_requested",
  external_blocking_context: [],
});

function facts(overrides = {}) {
  return sealMilestone2StatusFacts({ ...completeFactBody, ...overrides });
}

function blocker(dimensionId, suffix = dimensionId) {
  return {
    dimension_id: dimensionId,
    reason_code: `external-${suffix}`,
    reason: `External state prevents ${dimensionId} verification in this run.`,
    external_dependency: `host/${suffix}`,
  };
}

const fullyVerified = facts({ general_live_evaluation: "verified" });
const fullyVerifiedReport = assessMilestone2Status(fullyVerified);
assert.equal(fullyVerifiedReport.status, "verified");
assert.equal(fullyVerifiedReport.facts_fingerprint, fullyVerified.fingerprint);
assert.deepEqual(fullyVerifiedReport.missing_facts, []);
assert.deepEqual(fullyVerifiedReport.failed_facts, []);
assert.match(fullyVerifiedReport.status_rationale, /mandatory operational evidence.*is verified/u);

const liveNotRequestedReport = assessMilestone2Status(facts());
assert.equal(liveNotRequestedReport.status, "verified");
assert.deepEqual(liveNotRequestedReport.missing_facts, []);

const deterministicOnlyFacts = facts({
  windows_runtime: "unavailable",
  linux_runtime: "unavailable",
  macos_runtime: "unavailable",
  host_hook_e2e: "unavailable",
});
const deterministicOnlyReport = assessMilestone2Status(deterministicOnlyFacts);
assert.equal(deterministicOnlyReport.status, "partially_verified", "deterministic-only evidence must never be verified");
assert.deepEqual(
  deterministicOnlyReport.missing_facts,
  [
    { dimension_id: "windows_runtime", state: "unavailable", externally_blocked: false },
    { dimension_id: "linux_runtime", state: "unavailable", externally_blocked: false },
    { dimension_id: "macos_runtime", state: "unavailable", externally_blocked: false },
    { dimension_id: "host_hook_e2e", state: "unavailable", externally_blocked: false },
  ],
  "missing facts must be exact and canonically ordered",
);

for (const dimensionId of MILESTONE_DOD_DIMENSIONS) {
  const report = assessMilestone2Status(facts({ [dimensionId]: "failed" }));
  assert.equal(report.status, "verification_failed", `${dimensionId}=failed must fail verification`);
  assert.deepEqual(report.failed_facts, [
    { dimension_id: dimensionId, state: "failed", externally_blocked: false },
  ]);
}

for (const dimensionId of MILESTONE_DOD_DIMENSIONS) {
  const report = assessMilestone2Status(facts({ [dimensionId]: "unavailable" }));
  assert.equal(
    report.status,
    dimensionId === "deterministic_contracts" ? "verification_failed" : "partially_verified",
    `${dimensionId}=unavailable must use its dimension-specific completion semantics`,
  );
}

for (const dimensionId of MILESTONE_DOD_DIMENSIONS.filter((entry) => entry !== "general_live_evaluation")) {
  assert.throws(() => facts({ [dimensionId]: "not_requested" }), /is unsupported/u);
}
for (const dimensionId of MILESTONE_DOD_DIMENSIONS) {
  assert.throws(() => facts({ [dimensionId]: "unsupported" }), /is unsupported/u);
}

const oneBlockedFacts = facts({
  windows_runtime: "unavailable",
  external_blocking_context: [blocker("windows_runtime")],
});
const oneBlockedReport = assessMilestone2Status(oneBlockedFacts);
assert.equal(oneBlockedReport.status, "blocked_external_state");
assert.deepEqual(oneBlockedReport.missing_facts, [
  { dimension_id: "windows_runtime", state: "unavailable", externally_blocked: true },
]);
assert.match(oneBlockedReport.status_rationale, /explicit bounded external blocking context/u);

const allOperationalBlockedReport = assessMilestone2Status(facts({
  windows_runtime: "unavailable",
  linux_runtime: "unavailable",
  macos_runtime: "unavailable",
  host_hook_e2e: "unavailable",
  external_blocking_context: [
    blocker("windows_runtime"),
    blocker("linux_runtime"),
    blocker("macos_runtime"),
    blocker("host_hook_e2e"),
  ],
}));
assert.equal(allOperationalBlockedReport.status, "blocked_external_state");

assert.equal(assessMilestone2Status(facts({ windows_runtime: "unavailable" })).status, "partially_verified");
assert.equal(assessMilestone2Status(facts({
  windows_runtime: "unavailable",
  linux_runtime: "unavailable",
  external_blocking_context: [blocker("windows_runtime")],
})).status, "partially_verified", "a mixed blocked/unexplained gap must remain partial");
assert.equal(assessMilestone2Status(facts({
  windows_runtime: "unavailable",
  general_live_evaluation: "unavailable",
  external_blocking_context: [blocker("windows_runtime")],
})).status, "partially_verified", "requested live evidence unavailable without eligible blocking context must remain partial");
assert.equal(assessMilestone2Status(facts({
  deterministic_contracts: "unavailable",
  windows_runtime: "unavailable",
  external_blocking_context: [blocker("windows_runtime")],
})).status, "verification_failed", "external state cannot replace missing deterministic evidence");

assert.throws(() => facts({
  external_blocking_context: [blocker("windows_runtime")],
}), /requires windows_runtime=unavailable/u);
assert.throws(() => facts({
  windows_runtime: "unavailable",
  external_blocking_context: [blocker("windows_runtime", "first"), blocker("windows_runtime", "second")],
}), /duplicates windows_runtime/u);
assert.throws(() => facts({
  general_live_evaluation: "unavailable",
  external_blocking_context: [blocker("general_live_evaluation")],
}), /not eligible/u);
assert.throws(() => facts({
  windows_runtime: "unavailable",
  linux_runtime: "unavailable",
  external_blocking_context: [blocker("linux_runtime"), blocker("windows_runtime")],
}), /canonical operational dimension order/u);
assert.throws(() => facts({
  windows_runtime: "unavailable",
  external_blocking_context: Array.from({ length: 5 }, (_, index) => blocker("windows_runtime", `overflow-${index}`)),
}), ContractError, "external blocking context must remain bounded");

const validFacts = facts();
for (const field of Object.keys(validFacts)) {
  const incomplete = structuredClone(validFacts);
  delete incomplete[field];
  assert.throws(() => validateMilestone2StatusFacts(incomplete), ContractError, `one-fact removal must fail: ${field}`);
}
assert.throws(() => validateMilestone2StatusFacts({ ...validFacts, unexpected: true }), ContractError);
assert.throws(() => validateMilestone2StatusFacts({ ...validFacts, schema_version: 2 }), /schema_version must be 3/u);
assert.throws(() => validateMilestone2StatusFacts({
  ...validFacts,
  fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
}), /fingerprint mismatch/u);
assert.throws(() => sealMilestone2StatusFacts({
  ...completeFactBody,
  external_blocking_context: [{
    ...blocker("windows_runtime"),
    reason: "",
  }],
  windows_runtime: "unavailable",
}), ContractError);

const expectedChecks = milestone2ExpectedChecks(document);
const expectedByCheckId = new Map(expectedChecks.map((entry) => [entry.check_id, entry]));
const operationalHead = "e".repeat(40);
const operationalRun = Object.freeze({
  provider: "github_actions",
  run_id: "milestone-dod-fixture-run",
  run_attempt: 1,
  job_id: null,
  repository: "fixture/opencode-harness",
  source_attestation_fingerprint: fingerprint({ source: "portable-fixture-source" }),
});

function operationalDimension(checkId) {
  if (checkId.startsWith("windows-")) return { dimension: "windows_runtime", platform: "win32" };
  if (checkId.startsWith("linux-")) return { dimension: "linux_runtime", platform: "linux" };
  if (checkId.startsWith("macos-")) return { dimension: "macos_runtime", platform: "darwin" };
  if (checkId === "normal-session-host-hook-e2e") return { dimension: "host_hook_e2e", platform: "linux" };
  return null;
}

function operationalResult(checkId, platform) {
  const reportFingerprint = fingerprint({ check_id: checkId, report: "fixture" });
  if (checkId === "normal-session-host-hook-e2e") {
    return {
      kind: "installed_host",
      verification_mode: "trusted_adapter",
      report_fingerprint: reportFingerprint,
      containment_kind: null,
      containment_identity_fingerprints: [],
      teardown_verified: null,
      scenario_ids: [...MILESTONE_DOD_HOST_SCENARIO_IDS],
      trusted_check_receipt_fingerprints: [fingerprint({ host_check: checkId })],
      scenario_contract_fingerprint: fingerprint({ host_scenarios: MILESTONE_DOD_HOST_SCENARIO_IDS }),
      attestation_fingerprint: fingerprint({ host_attestation: checkId }),
      host_evidence_fingerprint: fingerprint({ host_evidence: checkId }),
    };
  }
  const descendant = checkId.endsWith("descendant-teardown");
  return {
    kind: descendant ? "descendant_teardown" : "trusted_project_check",
    verification_mode: null,
    report_fingerprint: reportFingerprint,
    containment_kind: platform === "win32"
      ? "windows-job-object-v1"
      : platform === "linux" ? "linux-cgroup-v2" : "macos-exclusive-uid-v1",
    containment_identity_fingerprints: [fingerprint({ containment: checkId })],
    teardown_verified: true,
    scenario_ids: descendant
      ? [...MILESTONE_DOD_DESCENDANT_SCENARIO_IDS[platform]]
      : ["trusted_project_check"],
    trusted_check_receipt_fingerprints: descendant ? [] : [fingerprint({ trusted_check: checkId })],
    scenario_contract_fingerprint: null,
    attestation_fingerprint: null,
    host_evidence_fingerprint: null,
  };
}

function receiptFor(expected, status = "passed", scopeOverrides = {}) {
  const operational = operationalDimension(expected.check_id);
  if (operational === null) {
    return sealVerificationReceipt({
      schema_version: 1,
      check_id: expected.check_id,
      producer_id: expected.producer_id,
      command_id: expected.command_id,
      started_at: "2026-07-15T09:00:00.000Z",
      completed_at: "2026-07-15T09:00:01.000Z",
      status,
      evidence_fingerprint: fingerprint({ check_id: expected.check_id, status }),
    });
  }
  const evidenceScope = {
    kind: "milestone_operational",
    dimension_id: operational.dimension,
    platform: operational.platform,
    head_sha: operationalHead,
    workspace_fingerprint: fingerprint({ workspace: operational.dimension }),
    run_binding: {
      ...operationalRun,
      job_id: `${operational.dimension}-fixture-job`,
    },
    result: operationalResult(expected.check_id, operational.platform),
    ...scopeOverrides,
  };
  return sealOperationalVerificationReceipt({
    check_id: expected.check_id,
    started_at: "2026-07-15T09:00:00.000Z",
    completed_at: "2026-07-15T09:00:01.000Z",
    status,
    evidence_scope: evidenceScope,
  });
}

const allReceipts = expectedChecks
  .filter((entry) => entry.check_id !== "general-live-evaluation")
  .map((entry) => receiptFor(entry));
const receiptVerifiedFacts = deriveMilestone2StatusFacts({ document, receipts: allReceipts });
assert.equal(receiptVerifiedFacts.deterministic_contracts, "verified");
assert.equal(receiptVerifiedFacts.windows_runtime, "verified");
assert.equal(receiptVerifiedFacts.linux_runtime, "verified");
assert.equal(receiptVerifiedFacts.macos_runtime, "verified");
assert.equal(receiptVerifiedFacts.host_hook_e2e, "verified");
assert.equal(receiptVerifiedFacts.general_live_evaluation, "not_requested");
assert.equal(assessMilestone2Receipts({
  document,
  receipts: allReceipts,
  facts: receiptVerifiedFacts,
}).status, "verified");

const deterministicBundle = sealMilestone2ReceiptBundle({
  dimension_id: "deterministic_contracts",
  head_sha: operationalHead,
  workspace_fingerprint: fingerprint({ workspace: "deterministic-contracts" }),
  run_binding: {
    ...operationalRun,
    job_id: "deterministic-fixture-job",
  },
  receipts: allReceipts.filter((receipt) => receipt.schema_version === 1),
});
assert.equal(validateMilestone2ReceiptBundle(deterministicBundle), deterministicBundle);

const windowsReceipts = allReceipts.filter((receipt) => (
  receipt.evidence_scope?.dimension_id === "windows_runtime"
));
const windowsScope = windowsReceipts[0].evidence_scope;
const windowsBundle = sealMilestone2ReceiptBundle({
  dimension_id: "windows_runtime",
  head_sha: windowsScope.head_sha,
  workspace_fingerprint: windowsScope.workspace_fingerprint,
  run_binding: windowsScope.run_binding,
  receipts: windowsReceipts,
});
assert.equal(validateMilestone2ReceiptBundle(windowsBundle), windowsBundle);
const aggregateRunContext = {
  head_sha: windowsBundle.head_sha,
  workspace_fingerprint: fingerprint({ workspace: "aggregate-checkout-can-differ" }),
  run_binding: {
    ...windowsBundle.run_binding,
    job_id: "milestone-2-status-fixture-job",
  },
};
const metadataOnlyContext = {
  ...structuredClone(windowsBundle),
  workspace_fingerprint: fingerprint({ workspace: "same-source-different-local-index-identity" }),
};
assert.equal(
  milestone2SourceStabilityFingerprint(windowsBundle),
  milestone2SourceStabilityFingerprint(metadataOnlyContext),
  "machine-local workspace identity drift must not impersonate a portable source change",
);
const changedPortableSourceContext = structuredClone(metadataOnlyContext);
changedPortableSourceContext.run_binding.source_attestation_fingerprint = fingerprint({ source: "changed-portable-source" });
assert.notEqual(
  milestone2SourceStabilityFingerprint(windowsBundle),
  milestone2SourceStabilityFingerprint(changedPortableSourceContext),
  "portable source attestation drift must fail the source-stability comparison",
);
assert.equal(
  milestone2SharedRunFingerprint(windowsBundle),
  milestone2SharedRunFingerprint(aggregateRunContext),
  "portable source attestation must allow the aggregate job to use a separate checkout identity",
);
assert.equal(assertMilestone2BundleMatchesRunContext(windowsBundle, aggregateRunContext), windowsBundle);
const mismatchedAggregateContext = structuredClone(aggregateRunContext);
mismatchedAggregateContext.run_binding.source_attestation_fingerprint = fingerprint({ source: "different-current-source" });
assert.notEqual(
  milestone2SharedRunFingerprint(windowsBundle),
  milestone2SharedRunFingerprint(mismatchedAggregateContext),
  "portable source mismatch must affect the current-to-bundle comparison",
);
assert.throws(
  () => assertMilestone2BundleMatchesRunContext(windowsBundle, mismatchedAggregateContext),
  (error) => error?.code === "MILESTONE_BUNDLE_RUN_CONTEXT_MISMATCH",
  "the aggregate assessor must reject a bundle from a different portable source attestation",
);
assert.throws(() => sealMilestone2ReceiptBundle({
  dimension_id: "windows_runtime",
  head_sha: windowsScope.head_sha,
  workspace_fingerprint: fingerprint({ workspace: "wrong-bundle" }),
  run_binding: windowsScope.run_binding,
  receipts: windowsReceipts,
}), /provenance does not match its bundle/u);
assert.throws(() => sealMilestone2ReceiptBundle({
  dimension_id: "linux_runtime",
  head_sha: windowsScope.head_sha,
  workspace_fingerprint: windowsScope.workspace_fingerprint,
  run_binding: windowsScope.run_binding,
  receipts: windowsReceipts,
}), /does not belong to linux_runtime/u);
const tamperedBundle = structuredClone(windowsBundle);
tamperedBundle.fingerprint = fingerprint({ tampered: true });
assert.throws(() => validateMilestone2ReceiptBundle(tamperedBundle), /fingerprint mismatch/u);

const descendantReport = sealMilestone2OperationalReport({
  report_kind: "descendant_teardown",
  platform: "win32",
  containment_kind: "windows-job-object-v1",
  containment_identity_fingerprints: [fingerprint({ containment: "fixture" })],
  teardown_verified: true,
  scenario_ids: [...MILESTONE_DOD_DESCENDANT_SCENARIO_IDS.win32],
  trusted_check_receipt_fingerprints: [],
});
assert.equal(descendantReport.report_kind, "descendant_teardown");
const macosDescendantReport = sealMilestone2OperationalReport({
  report_kind: "descendant_teardown",
  platform: "darwin",
  containment_kind: "macos-exclusive-uid-v1",
  containment_identity_fingerprints: [fingerprint({ containment: "fixture-macos" })],
  teardown_verified: true,
  scenario_ids: [...MILESTONE_DOD_DESCENDANT_SCENARIO_IDS.darwin],
  trusted_check_receipt_fingerprints: [],
});
assert.equal(macosDescendantReport.containment_kind, "macos-exclusive-uid-v1");
assert.throws(() => sealMilestone2OperationalReport({
  report_kind: "descendant_teardown",
  platform: "darwin",
  containment_kind: "macos-process-group",
  containment_identity_fingerprints: [fingerprint({ containment: "fixture-macos" })],
  teardown_verified: true,
  scenario_ids: [...MILESTONE_DOD_DESCENDANT_SCENARIO_IDS.darwin],
  trusted_check_receipt_fingerprints: [],
}), /containment kind does not match platform/u);
assert.throws(() => sealMilestone2OperationalReport({
  report_kind: "descendant_teardown",
  platform: "win32",
  containment_kind: "windows-job-object-v1",
  containment_identity_fingerprints: [fingerprint({ containment: "fixture" })],
  teardown_verified: true,
  scenario_ids: ["direct_child"],
  trusted_check_receipt_fingerprints: [],
}), /scenario contract is incomplete/u);

const deterministicCheckIds = document.dimensions
  .find((dimension) => dimension.dimension_id === "deterministic_contracts")
  .check_ids;
const deterministicExpectedChecks = expectedChecks.filter((entry) => deterministicCheckIds.includes(entry.check_id));
const deterministicReceipts = deterministicExpectedChecks.map((entry) => receiptFor(entry));
const derivedDeterministicFacts = deriveMilestone2StatusFacts({ document, receipts: deterministicReceipts });
assert.equal(derivedDeterministicFacts.deterministic_contracts, "verified");
assert.equal(derivedDeterministicFacts.windows_runtime, "unavailable");
assert.equal(derivedDeterministicFacts.linux_runtime, "unavailable");
assert.equal(derivedDeterministicFacts.macos_runtime, "unavailable");
assert.equal(derivedDeterministicFacts.host_hook_e2e, "unavailable");
assert.equal(assessMilestone2Receipts({
  document,
  receipts: deterministicReceipts,
  facts: derivedDeterministicFacts,
}).status, "partially_verified", "receipt aggregation must not upgrade deterministic-only evidence");

const firstDeterministicCheck = deterministicExpectedChecks[0];
const missingDeterministicDecision = assessMilestone2Receipts({
  document,
  receipts: deterministicReceipts.slice(1),
  facts: facts({
    deterministic_contracts: "unavailable",
    windows_runtime: "unavailable",
    linux_runtime: "unavailable",
    macos_runtime: "unavailable",
    host_hook_e2e: "unavailable",
  }),
});
assert.equal(missingDeterministicDecision.status, "verification_failed");
assert.deepEqual(missingDeterministicDecision.deterministic_missing, [firstDeterministicCheck.check_id]);

const failedDeterministicReceipts = deterministicReceipts.map((receipt, index) => (
  index === 0 ? receiptFor(firstDeterministicCheck, "failed") : receipt
));
const failedDeterministicDecision = assessMilestone2Receipts({
  document,
  receipts: failedDeterministicReceipts,
  facts: facts({
    deterministic_contracts: "failed",
    windows_runtime: "unavailable",
    linux_runtime: "unavailable",
    macos_runtime: "unavailable",
    host_hook_e2e: "unavailable",
  }),
});
assert.equal(failedDeterministicDecision.status, "verification_failed");
assert.deepEqual(failedDeterministicDecision.deterministic_failed, [firstDeterministicCheck.check_id]);

assert.throws(() => assessMilestone2Receipts({
  document,
  receipts: deterministicReceipts.slice(1),
  facts: deterministicOnlyFacts,
}), /requires every declared check receipt to pass/u);
assert.throws(() => assessMilestone2Receipts({
  document,
  receipts: [...deterministicReceipts, deterministicReceipts[0]],
  facts: deterministicOnlyFacts,
}), /duplicate verification receipt/u);
assert.throws(() => sealVerificationReceipt({
  ...deterministicReceipts[0],
  producer_id: "untrusted/producer",
  fingerprint: undefined,
}), /generic receipt sealing is restricted to the deterministic runner/u);
assert.throws(() => assessMilestone2Receipts({
  document,
  receipts: [sealVerificationReceipt({
    ...deterministicReceipts[0],
    command_id: "substituted-command",
    fingerprint: undefined,
  })],
  facts: facts({
    deterministic_contracts: "unavailable",
    windows_runtime: "unavailable",
    linux_runtime: "unavailable",
    macos_runtime: "unavailable",
    host_hook_e2e: "unavailable",
  }),
}), /substituted command/u);

const windowsTrustedCheck = expectedByCheckId.get("windows-trusted-project-check");
const windowsDescendantCheck = expectedByCheckId.get("windows-descendant-teardown");
const linuxTrustedCheck = expectedByCheckId.get("linux-trusted-project-check");
const hostHookCheck = expectedByCheckId.get("normal-session-host-hook-e2e");

assert.throws(() => sealVerificationReceipt({
  schema_version: 1,
  check_id: windowsTrustedCheck.check_id,
  producer_id: windowsTrustedCheck.producer_id,
  command_id: windowsTrustedCheck.command_id,
  started_at: "2026-07-15T09:00:00.000Z",
  completed_at: "2026-07-15T09:00:01.000Z",
  status: "passed",
  evidence_fingerprint: fingerprint({ fixture: "generic-operational-sealer" }),
}), /generic receipt sealing is restricted to the deterministic runner/u,
"generic sealing must not mint operational evidence");

assert.throws(() => sealOperationalVerificationReceipt({
  check_id: windowsTrustedCheck.check_id,
  started_at: "2026-07-15T09:00:00.000Z",
  completed_at: "2026-07-15T09:00:01.000Z",
  status: "passed",
  evidence_scope: null,
}), ContractError, "operational evidence requires the runner-owned typed scope");

assert.throws(() => receiptFor(hostHookCheck, "passed", {
  result: {
    ...operationalResult(hostHookCheck.check_id, "linux"),
    verification_mode: "deterministic_fixture",
  },
}), /not installed-host evidence/u,
"deterministic host fixtures must never satisfy installed-host evidence");

const macosExpectedCheck = expectedByCheckId.get("macos-trusted-project-check");
assert.equal(receiptFor(macosExpectedCheck).evidence_scope.result.containment_kind, "macos-exclusive-uid-v1");
assert.throws(() => receiptFor(macosExpectedCheck, "passed", {
  result: {
    ...operationalResult(macosExpectedCheck.check_id, "darwin"),
    containment_kind: "macos-fixture-controller",
  },
}), /lacks verified containment bindings/u,
"macOS evidence must bind the registered exclusive-UID controller kind");

assert.throws(() => assessMilestone2Receipts({
  document,
  receipts: [
    receiptFor(windowsTrustedCheck),
    receiptFor(windowsDescendantCheck, "passed", { head_sha: "f".repeat(40) }),
  ],
  facts: deterministicOnlyFacts,
}), /do not share one HEAD, workspace, job, and run binding/u);

assert.throws(() => assessMilestone2Receipts({
  document,
  receipts: [
    receiptFor(windowsTrustedCheck),
    receiptFor(linuxTrustedCheck, "passed", {
      run_binding: {
        ...operationalRun,
        run_id: "another-verification-run",
        job_id: "linux_runtime-fixture-job",
      },
    }),
  ],
  facts: deterministicOnlyFacts,
}), /one repository HEAD and verification run/u);

assert.throws(() => assessMilestone2Receipts({
  document,
  receipts: [
    receiptFor(windowsTrustedCheck),
    receiptFor(linuxTrustedCheck, "passed", {
      run_binding: {
        ...operationalRun,
        job_id: "linux_runtime-fixture-job",
        source_attestation_fingerprint: fingerprint({ source: "different-portable-source" }),
      },
    }),
  ],
  facts: deterministicOnlyFacts,
}), /one repository HEAD and verification run/u,
"cross-dimension receipts must share one portable source attestation");

const receiptsMissingLinuxTeardown = allReceipts.filter((receipt) => (
  receipt.check_id !== "linux-descendant-teardown"
));
const missingOperationalFacts = deriveMilestone2StatusFacts({
  document,
  receipts: receiptsMissingLinuxTeardown,
});
assert.equal(missingOperationalFacts.linux_runtime, "unavailable");
assert.notEqual(assessMilestone2Receipts({
  document,
  receipts: receiptsMissingLinuxTeardown,
  facts: missingOperationalFacts,
}).status, "verified", "missing operational artifacts must never upgrade the milestone");

const failedLinuxReceipts = allReceipts.map((receipt) => (
  receipt.check_id === "linux-descendant-teardown"
    ? receiptFor(expectedByCheckId.get(receipt.check_id), "failed")
    : receipt
));
const failedOperationalFacts = deriveMilestone2StatusFacts({ document, receipts: failedLinuxReceipts });
assert.equal(failedOperationalFacts.linux_runtime, "failed");
assert.equal(assessMilestone2Receipts({
  document,
  receipts: failedLinuxReceipts,
  facts: failedOperationalFacts,
}).status, "verification_failed");

const failedHostResult = {
  kind: "installed_host",
  verification_mode: null,
  report_fingerprint: fingerprint({ host_failure: "adapter_rejected" }),
  containment_kind: null,
  containment_identity_fingerprints: [],
  teardown_verified: null,
  scenario_ids: [],
  trusted_check_receipt_fingerprints: [],
  scenario_contract_fingerprint: null,
  attestation_fingerprint: null,
  host_evidence_fingerprint: null,
};
const failedHostReceipts = allReceipts.map((receipt) => (
  receipt.check_id === hostHookCheck.check_id
    ? receiptFor(hostHookCheck, "failed", { result: failedHostResult })
    : receipt
));
const failedHostFacts = deriveMilestone2StatusFacts({ document, receipts: failedHostReceipts });
assert.equal(failedHostFacts.host_hook_e2e, "failed");
const failedHostDecision = assessMilestone2Receipts({
  document,
  receipts: failedHostReceipts,
  facts: failedHostFacts,
});
assert.equal(failedHostDecision.status, "verification_failed");
assert(failedHostDecision.receipt_failed.includes(hostHookCheck.check_id),
  "a conclusive installed-host failure must remain a failed milestone receipt");
assert.throws(() => deriveMilestone2StatusFacts({
  document,
  receipts: failedHostReceipts,
  external_blocking_context: [blocker("host_hook_e2e")],
}), /requires host_hook_e2e=unavailable/u,
"external-unavailability context must not downgrade a conclusive installed-host failure");

const macosCheckId = document.dimensions.find((dimension) => dimension.dimension_id === "macos_runtime").check_ids[0];
const failedMacosReceipts = [...deterministicReceipts, receiptFor(expectedByCheckId.get(macosCheckId), "failed")];
const failedMacosFacts = deriveMilestone2StatusFacts({ document, receipts: failedMacosReceipts });
assert.equal(failedMacosFacts.macos_runtime, "failed");
assert.equal(assessMilestone2Receipts({
  document,
  receipts: failedMacosReceipts,
  facts: failedMacosFacts,
}).status, "verification_failed");

assert.throws(() => assessMilestone2Receipts({
  document,
  receipts: deterministicReceipts,
  expectedChecks: deterministicExpectedChecks,
  facts: deterministicOnlyFacts,
}), /expectedChecks is not supported/u, "callers must not supply their own receipt authority");

console.log("Milestone 2 DoD v3 contract passed. This command consumes no execution receipts from real runs and asserts no milestone completion status for the current workspace.");
