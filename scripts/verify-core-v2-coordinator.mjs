import assert from "node:assert/strict";

import { fingerprint } from "../lib/feedback/contracts.mjs";
import { runCoreV2Coordinator } from "../lib/quality/core-v2-coordinator.mjs";

const fp = (value) => fingerprint({ value });
const snapshots = (...ids) => ids.map((id) => ({ fingerprint: fp(id), id }));
const diff = (before, after) => {
  if (before.id === after.id) return [];
  if (before.id === "initial" && after.id === "primary") return ["src/task.mjs"];
  if (before.id === "primary" && after.id === "audit") return ["test/task.test.mjs"];
  if (before.id === "initial" && after.id === "audit") return ["src/task.mjs", "test/task.test.mjs"];
  throw new Error(`unexpected fixture diff ${before.id}:${after.id}`);
};
const checks = [
  { check_id: "source-check", scope_prefixes: ["src"], cost_rank: 10 },
  { check_id: "test-check", scope_prefixes: ["test"], cost_rank: 1 },
];
const passedCheck = (checkId) => ({
  status: "passed",
  command_fingerprint: fp(`command:${checkId}`),
  detail_code: "exit-zero",
  fixed_public_check: { argv: ["node", "--test", "test/task.test.mjs"] },
  public_check_diagnostic: null,
});
const failedCheck = (checkId) => ({
  status: "failed",
  command_fingerprint: fp(`command:${checkId}`),
  detail_code: "test-failed",
  fixed_public_check: { argv: ["node", "--test", "test/task.test.mjs"] },
  public_check_diagnostic: { exit_status: 1, output: "not ok", truncated: false },
});

function observer(sequence) {
  let index = 0;
  return () => sequence[Math.min(index++, sequence.length - 1)];
}

const simpleCheckIds = [];
const simple = await runCoreV2Coordinator({
  workspace_root: "/fixture",
  visible_requirements: "Update the visible source contract.",
  stratum: "medium",
  allowed_target_paths: ["src/task.mjs"],
  catalog_fingerprint: fp("catalog"),
  checks,
  invoke_primary: async () => ({ completed: true }),
  invoke_contract_auditor: async () => { throw new Error("auditor must not run"); },
  run_selected_check: async ({ check_id }) => { simpleCheckIds.push(check_id); return passedCheck(check_id); },
  observe_workspace: observer(snapshots("initial", "primary")),
  diff_workspaces: diff,
});
assert.equal(simple.status, "completed");
assert.deepEqual(simpleCheckIds, ["source-check"]);
assert.equal(simple.remediation.eligible, false);

const retryCheckIds = [];
let auditInput = null;
const remediated = await runCoreV2Coordinator({
  workspace_root: "/fixture",
  visible_requirements: "Update source and preserve its public test contract.",
  stratum: "high",
  allowed_target_paths: ["src/task.mjs", "test/task.test.mjs"],
  catalog_fingerprint: fp("catalog"),
  checks,
  invoke_primary: async () => ({ completed: true }),
  invoke_contract_auditor: async (input) => { auditInput = input; return { completed: true }; },
  run_selected_check: async ({ check_id }) => {
    retryCheckIds.push(check_id);
    return retryCheckIds.length === 1 ? failedCheck(check_id) : passedCheck(check_id);
  },
  observe_workspace: observer(snapshots("initial", "primary", "audit")),
  diff_workspaces: diff,
});
assert.equal(remediated.status, "completed");
assert.deepEqual(retryCheckIds, ["source-check", "source-check"]);
assert.equal(auditInput.agent_id, "contract-auditor");
assert.match(auditInput.prompt, /PUBLIC_CHECK_RESULT_V1=/u);
assert.equal(remediated.activation.verification_started_count, 2);
assert.equal(remediated.remediation.retry_verification_passed_count, 1);
assert.deepEqual(remediated.remediation.trigger_reasons, [
  "risk-gated-specialized-visible-contract",
  "high-risk",
  "public-check-failed",
  "visible-target-missing",
]);

let noCheckPrompt = null;
const noApplicable = await runCoreV2Coordinator({
  workspace_root: "/fixture",
  visible_requirements: "Update the visible source contract.",
  stratum: "high",
  allowed_target_paths: ["src/task.mjs"],
  catalog_fingerprint: fp("docs-catalog"),
  checks: [{ check_id: "docs-check", scope_prefixes: ["docs"], cost_rank: 1 }],
  invoke_primary: async () => ({ completed: true }),
  invoke_contract_auditor: async ({ prompt }) => { noCheckPrompt = prompt; return { completed: true }; },
  run_selected_check: async () => { throw new Error("no check must run"); },
  observe_workspace: observer(snapshots("initial", "primary", "primary")),
  diff_workspaces: diff,
});
assert.equal(noApplicable.status, "completed");
assert.equal(noApplicable.terminal.reason, "no_applicable_trusted_check");
assert.match(noCheckPrompt, /RUNNER_SELECTED_PUBLIC_CHECK_V1=null/u);
assert.doesNotMatch(noCheckPrompt, /unavailable.*argv/u);

const unavailable = await runCoreV2Coordinator({
  workspace_root: "/fixture",
  visible_requirements: "Update the visible source contract.",
  stratum: "medium",
  allowed_target_paths: ["src/task.mjs"],
  catalog_fingerprint: fp("catalog"),
  checks,
  invoke_primary: async () => ({ completed: true }),
  invoke_contract_auditor: async () => { throw new Error("auditor must not remediate unavailable infrastructure"); },
  run_selected_check: async ({ check_id }) => ({
    ...passedCheck(check_id),
    status: "unavailable",
    detail_code: "toolchain-unavailable",
    public_check_diagnostic: { exit_status: null, output: "toolchain unavailable", truncated: false },
  }),
  observe_workspace: observer(snapshots("initial", "primary", "primary")),
  diff_workspaces: diff,
});
assert.equal(unavailable.status, "blocked");
assert.equal(unavailable.terminal.reason, "verification_unavailable");
assert.equal(unavailable.remediation.eligible, false);

await assert.rejects(() => runCoreV2Coordinator({
  workspace_root: "/fixture",
  visible_requirements: "Update only the visible source contract.",
  stratum: "high",
  allowed_target_paths: ["src/task.mjs"],
  catalog_fingerprint: fp("catalog"),
  checks,
  invoke_primary: async () => ({ completed: true }),
  invoke_contract_auditor: async () => ({ completed: true }),
  run_selected_check: async ({ check_id }) => failedCheck(check_id),
  observe_workspace: observer(snapshots("initial", "primary", "audit")),
  diff_workspaces: diff,
}), /CORE_V2_SCOPE/u);

process.stdout.write("core v2 coordinator passed\n");
