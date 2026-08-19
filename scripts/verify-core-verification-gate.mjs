import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fingerprint } from "../lib/feedback/contracts.mjs";
import {
  completeCoreVerification,
  coreVerificationActivationObservation,
  coreVerificationTerminalDecision,
  createCoreVerificationGate,
  recordCoreWorkspaceMutation,
  startCoreVerification,
} from "../lib/quality/core-verification-gate.mjs";

const fp = (value) => fingerprint({ value });
const checks = [
  { check_id: "full-suite", scope_prefixes: [], cost_rank: 100 },
  { check_id: "narrow-source", scope_prefixes: ["src"], cost_rank: 10 },
  { check_id: "narrow-test", scope_prefixes: ["test"], cost_rank: 20 },
];
const initial = createCoreVerificationGate({ catalog_fingerprint: fp("catalog"), checks });
assert.deepEqual(coreVerificationTerminalDecision(initial), {
  allowed: true,
  reason: "no_workspace_mutation",
  activation_eligible: false,
  activated: false,
});

const mutated = recordCoreWorkspaceMutation(initial, {
  changed_paths: ["src/feature.mjs"],
  workspace_fingerprint: fp("workspace-1"),
});
assert.equal(mutated.mutation_revision, 1);
assert.equal(mutated.selected_check_id, "narrow-source");
assert.equal(coreVerificationTerminalDecision(mutated).allowed, false);
assert.throws(() => startCoreVerification(mutated, { check_id: "full-suite" }), /CORE_VERIFICATION_CHECK_SUBSTITUTION/u);

const started = startCoreVerification(mutated, { check_id: "narrow-source" });
assert.equal(coreVerificationActivationObservation(started).post_last_mutation_verification, true);
assert.throws(() => completeCoreVerification(started, {
  check_id: "narrow-source",
  mutation_revision: 1,
  workspace_fingerprint: fp("stale"),
  status: "passed",
  command_fingerprint: fp("command"),
  detail_code: "exit-zero",
}), /CORE_VERIFICATION_STALE/u);

const failed = completeCoreVerification(started, {
  check_id: "narrow-source",
  mutation_revision: 1,
  workspace_fingerprint: fp("workspace-1"),
  status: "failed",
  command_fingerprint: fp("command"),
  detail_code: "test-failure",
});
assert.equal(coreVerificationTerminalDecision(failed).allowed, false);
assert.equal(coreVerificationTerminalDecision(failed).reason, "verification_failed");

const remutated = recordCoreWorkspaceMutation(failed, {
  changed_paths: ["test/feature.test.mjs"],
  workspace_fingerprint: fp("workspace-2"),
});
assert.equal(remutated.mutation_revision, 2);
assert.equal(remutated.selected_check_id, "narrow-test");
assert.equal(remutated.verification, null);
const passed = completeCoreVerification(
  startCoreVerification(remutated, { check_id: "narrow-test" }),
  {
    check_id: "narrow-test",
    mutation_revision: 2,
    workspace_fingerprint: fp("workspace-2"),
    status: "passed",
    command_fingerprint: fp("command-2"),
    detail_code: "exit-zero",
  },
);
assert.equal(coreVerificationTerminalDecision(passed).allowed, true);
assert.equal(coreVerificationActivationObservation(passed).verification_started_count, 2);
assert.equal(coreVerificationActivationObservation(passed).verification_completed_count, 2);

const unavailable = completeCoreVerification(
  startCoreVerification(mutated, { check_id: "narrow-source" }),
  {
    check_id: "narrow-source",
    mutation_revision: 1,
    workspace_fingerprint: fp("workspace-1"),
    status: "unavailable",
    command_fingerprint: fp("command-unavailable"),
    detail_code: "toolchain-unavailable",
  },
);
assert.equal(coreVerificationTerminalDecision(unavailable).allowed, false);
assert.equal(coreVerificationTerminalDecision(unavailable).reason, "verification_unavailable");

const noApplicable = recordCoreWorkspaceMutation(
  createCoreVerificationGate({
    catalog_fingerprint: fp("scoped-catalog"),
    checks: [{ check_id: "docs-only", scope_prefixes: ["docs"], cost_rank: 1 }],
  }),
  { changed_paths: ["src/code.mjs"], workspace_fingerprint: fp("workspace-3") },
);
assert.deepEqual(coreVerificationTerminalDecision(noApplicable), {
  allowed: true,
  reason: "no_applicable_trusted_check",
  activation_eligible: true,
  activated: true,
});

const spacedPath = recordCoreWorkspaceMutation(initial, {
  changed_paths: ["src/user visible/feature.mjs"],
  workspace_fingerprint: fp("workspace-with-space"),
});
assert.equal(spacedPath.selected_check_id, "narrow-source");

assert.throws(() => createCoreVerificationGate({
  catalog_fingerprint: fp("bad"),
  checks: [{ check_id: "bad", scope_prefixes: ["../escape"], cost_rank: 1 }],
}), /CORE_VERIFICATION_SCHEMA/u);

const standaloneRoot = fs.mkdtempSync(path.join(os.tmpdir(), "core-verification-standalone-"));
try {
  const source = fileURLToPath(new URL("../lib/quality/core-verification-gate.mjs", import.meta.url));
  const target = path.join(standaloneRoot, "core-verification-gate.mjs");
  fs.copyFileSync(source, target);
  const standalone = await import(`${pathToFileURL(target).href}?fixture=standalone`);
  const standaloneState = standalone.createCoreVerificationGate({
    catalog_fingerprint: fp("standalone-catalog"),
    checks: [],
  });
  assert.equal(standalone.coreVerificationTerminalDecision(standaloneState).allowed, true);
} finally {
  fs.rmSync(standaloneRoot, { recursive: true, force: true });
}

process.stdout.write("core verification gate passed\n");
