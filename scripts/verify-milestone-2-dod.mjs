import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  VERIFICATION_RECEIPT_PRODUCERS,
  assessMilestone2Receipts,
  assessMilestone2Status,
  sealVerificationReceipt,
  validateMilestone2DodDocument,
} from "../lib/quality/milestone-dod.mjs";
import { ContractError, fingerprint } from "../lib/quality/validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const document = JSON.parse(fs.readFileSync(path.join(root, "quality", "milestone-2-dod.v1.json"), "utf8"));

validateMilestone2DodDocument(document);
for (const item of document.items) {
  for (const relativePath of item.evidence_refs) {
    const resolved = path.resolve(root, ...relativePath.split("/"));
    assert(resolved.startsWith(`${root}${path.sep}`) && fs.existsSync(resolved), `${item.item_id} evidence is missing: ${relativePath}`);
  }
}

assert.equal(assessMilestone2Status({ deterministic: "passed", runtime: "available_passed", live: "available_passed", external_blocking_context: false }), "verified");
assert.equal(assessMilestone2Status({ deterministic: "passed", runtime: "unavailable", live: "unavailable", external_blocking_context: false }), "verified");
assert.equal(assessMilestone2Status({ deterministic: "passed", runtime: "available_passed", live: "unavailable", external_blocking_context: false }), "partially_verified");
assert.equal(assessMilestone2Status({ deterministic: "passed", runtime: "available_failed", live: "unavailable", external_blocking_context: false }), "verification_failed");
assert.equal(assessMilestone2Status({ deterministic: "missing", runtime: "unavailable", live: "unavailable", external_blocking_context: true }), "blocked_external_state");

for (const field of ["deterministic", "runtime", "live", "external_blocking_context"]) {
  const incomplete = { deterministic: "passed", runtime: "unavailable", live: "unavailable", external_blocking_context: false };
  delete incomplete[field];
  assert.throws(() => assessMilestone2Status(incomplete), ContractError, `one-fact removal must fail: ${field}`);
}

const classProducer = new Map([
  ["deterministic", VERIFICATION_RECEIPT_PRODUCERS.deterministic],
  ["runtime_optional", VERIFICATION_RECEIPT_PRODUCERS.runtime],
  ["live_external", VERIFICATION_RECEIPT_PRODUCERS.live],
]);
const expectedChecks = document.items.flatMap((item) => item.check_ids.map((checkId) => ({
  check_id: checkId,
  producer_id: classProducer.get(item.execution_class),
  command_id: `contract-${checkId}`,
})));
const receiptFor = (expected, status = "passed") => sealVerificationReceipt({
  schema_version: 1,
  check_id: expected.check_id,
  producer_id: expected.producer_id,
  command_id: expected.command_id,
  started_at: "2026-07-10T09:00:00.000Z",
  completed_at: "2026-07-10T09:00:01.000Z",
  status,
  evidence_fingerprint: fingerprint({ check_id: expected.check_id, status }),
});
const allReceipts = expectedChecks.map((entry) => receiptFor(entry));
const deterministicIds = new Set(document.items
  .filter((item) => item.execution_class === "deterministic")
  .flatMap((item) => item.check_ids));
assert.equal(deterministicIds.has("normal-session-plugin-api-probe"), false, "installed API probe must not be deterministic default evidence");
const deterministicReceipts = allReceipts.filter((receipt) => deterministicIds.has(receipt.check_id));

assert.equal(assessMilestone2Receipts({ document, receipts: allReceipts, expectedChecks }).status, "verified");
assert.equal(assessMilestone2Receipts({ document, receipts: deterministicReceipts, expectedChecks }).status, "verified");
const runtimeCheckIds = new Set(document.items
  .filter((item) => item.execution_class === "runtime_optional")
  .flatMap((item) => item.check_ids));
assert(runtimeCheckIds.has("normal-session-plugin-api-probe"), "installed API probe must remain explicit optional runtime evidence");
const runtimeReceipts = allReceipts.filter((receipt) => runtimeCheckIds.has(receipt.check_id));
assert.equal(assessMilestone2Receipts({
  document,
  receipts: [...deterministicReceipts, ...runtimeReceipts],
  expectedChecks,
}).status, "partially_verified");
assert.equal(assessMilestone2Receipts({ document, receipts: deterministicReceipts.slice(1), expectedChecks }).status, "verification_failed");
assert.equal(assessMilestone2Receipts({
  document,
  receipts: deterministicReceipts.map((receipt, index) => index === 0 ? receiptFor(expectedChecks.find((entry) => entry.check_id === receipt.check_id), "failed") : receipt),
  expectedChecks,
}).status, "verification_failed");
assert.throws(() => assessMilestone2Receipts({
  document,
  receipts: [...deterministicReceipts, deterministicReceipts[0]],
  expectedChecks,
}), /duplicate verification receipt/u);
assert.throws(() => assessMilestone2Receipts({
  document,
  receipts: [sealVerificationReceipt({
    ...deterministicReceipts[0],
    producer_id: "untrusted/producer",
    fingerprint: undefined,
  })],
  expectedChecks,
}), /untrusted producer/u);
assert.throws(() => assessMilestone2Receipts({
  document,
  receipts: [sealVerificationReceipt({
    ...deterministicReceipts[0],
    command_id: "substituted-command",
    fingerprint: undefined,
  })],
  expectedChecks,
}), /substituted command/u);

console.log("Milestone 2 DoD contract passed (manifest and policy only). This command consumes no execution receipts and asserts no milestone completion status.");
