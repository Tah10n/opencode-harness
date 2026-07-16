import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runManagedCommand } from "../lib/feedback/process-tree.mjs";
import {
  VERIFICATION_RECEIPT_PRODUCERS,
  assessMilestone2Receipts,
  deriveMilestone2StatusFacts,
  sealMilestone2ReceiptBundle,
  sealVerificationReceipt,
} from "../lib/quality/milestone-dod.mjs";
import {
  assertMilestone2RunContextStable,
  captureMilestone2RunContext,
} from "../lib/quality/milestone-run-context.mjs";
import { fingerprint } from "../lib/quality/validation.mjs";
import {
  committedWhitespaceRequestFromEnvironment,
  verifyCommittedWhitespace,
} from "../lib/quality/whitespace.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deterministicProducer = VERIFICATION_RECEIPT_PRODUCERS.deterministic;

export const DETERMINISTIC_STAGE_REGISTRY = Object.freeze([
  { command_id: "verify-static", npm_script: "verify:static", check_ids: ["documentation-attribution-boundary", "tracked-artifact-boundary", "model-frontmatter-documentation"] },
  { command_id: "verify-feedback-foundation", npm_script: "verify:feedback-foundation", check_ids: [] },
  { command_id: "verify-trace-store", npm_script: "verify:trace-store", check_ids: [] },
  { command_id: "verify-report-history", npm_script: "verify:report-history", check_ids: [] },
  { command_id: "verify-adapter-worker", npm_script: "verify:adapter-worker", check_ids: [] },
  { command_id: "eval", npm_script: "eval", check_ids: [] },
  { command_id: "verify-drift", npm_script: "verify:drift", check_ids: [] },
  { command_id: "verify-adoption-bundle", npm_script: "verify:adoption-bundle", check_ids: [] },
  { command_id: "verify-runtime-fixture", npm_script: "verify:runtime:fixture", check_ids: [] },
  { command_id: "verify-runtime-quality-hooks-fixture", npm_script: "verify:runtime:quality-hooks:fixture", check_ids: ["runtime-quality-hooks-fixtures"] },
  { command_id: "verify-live-eval", npm_script: "verify:live-eval", check_ids: [] },
  { command_id: "verify-acceptance", npm_script: "verify:acceptance", check_ids: [] },
  { command_id: "verify-quality-contracts", npm_script: "verify:quality-contracts", check_ids: [] },
  { command_id: "verify-engineering-dossier", npm_script: "verify:engineering-dossier", check_ids: ["engineering-dossier-lifecycle", "engineering-dossier-negative-matrix", "engineering-mapping-gate"] },
  { command_id: "verify-architecture-policy", npm_script: "verify:architecture-policy", check_ids: ["engineering-architecture-policy"] },
  { command_id: "verify-impact-graph", npm_script: "verify:impact-graph", check_ids: ["engineering-impact-graph"] },
  { command_id: "verify-prompt-inventory", npm_script: "verify:prompt-inventory", check_ids: ["prompt-inventory-drift"] },
  { command_id: "verify-quality-live-coordinator", npm_script: "verify:quality-live-coordinator", check_ids: ["engineering-pre-gate-latch"] },
  { command_id: "verify-quality-live-runner", npm_script: "verify:quality-live-runner", check_ids: ["quality-live-runner-integration"] },
  { command_id: "verify-quality-verification-targets", npm_script: "verify:quality-verification-targets", check_ids: ["canonical-verification-targets"] },
  { command_id: "verify-normal-session-quality-bridge", npm_script: "verify:normal-session-quality-bridge", check_ids: ["normal-session-quality-bridge"] },
  { command_id: "verify-session-classification", npm_script: "verify:session-classification", check_ids: ["session-classification-lifecycle"] },
  { command_id: "verify-project-check-catalog", npm_script: "verify:project-check-catalog", check_ids: ["project-check-catalog"] },
  { command_id: "verify-workspace-observation", npm_script: "verify:workspace-observation", check_ids: ["workspace-observation-boundary"] },
  { command_id: "verify-trusted-toolchain-host-config", npm_script: "verify:trusted-toolchain-host-config", check_ids: [] },
  { command_id: "verify-trusted-toolchains", npm_script: "verify:trusted-toolchains", check_ids: ["trusted-toolchain-resolution"] },
  { command_id: "verify-process-containment", npm_script: "verify:process-containment", check_ids: ["process-containment-contract"] },
  { command_id: "verify-trusted-project-runner", npm_script: "verify:trusted-project-runner", check_ids: ["trusted-project-runner"] },
  { command_id: "verify-bash-boundary", npm_script: "verify:bash-boundary", check_ids: ["bash-mutation-boundary"] },
  { command_id: "verify-global-quality-plugin-export", npm_script: "verify:global-quality-plugin-export", check_ids: ["global-quality-plugin-export"] },
  { command_id: "verify-quality-live-manifests", npm_script: "verify:quality-live-manifests", check_ids: ["quality-live-corpus"] },
  { command_id: "verify-quality-acceptance", npm_script: "verify:quality-acceptance", check_ids: ["quality-acceptance-negative-matrix"] },
  { command_id: "verify-committed-whitespace-fixtures", npm_script: "verify:whitespace:fixture", check_ids: ["committed-whitespace-fixtures"] },
  { command_id: "verify-milestone-2-dod-contract", npm_script: "verify:milestone-2-dod-contract", check_ids: ["external-gap-classification"] },
]);

const syntheticChecks = Object.freeze([
  { check_id: "npm-run-verify-m1", command_id: "verify-milestone-1-composite" },
  { check_id: "npm-run-verify", command_id: "verify-all-composite" },
]);
const gitCheck = Object.freeze({
  command_id: "verify-committed-whitespace",
  check_ids: Object.freeze(["committed-whitespace"]),
});
const CONTAINMENT_COORDINATION_ENV_PREFIXES = Object.freeze([
  "OPENCODE_QUALITY_CGROUP_",
  "OPENCODE_QUALITY_MACOS_",
]);

export function deterministicStageEnvironment(environment = process.env) {
  return Object.fromEntries(Object.entries(environment).filter(([key]) => (
    !CONTAINMENT_COORDINATION_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))
  )));
}

export function deterministicExpectedChecks() {
  return [
    ...DETERMINISTIC_STAGE_REGISTRY.flatMap((stage) => stage.check_ids.map((checkId) => ({
      check_id: checkId,
      producer_id: deterministicProducer,
      command_id: stage.command_id,
    }))),
    ...syntheticChecks.map((entry) => ({
      check_id: entry.check_id,
      producer_id: deterministicProducer,
      command_id: entry.command_id,
    })),
    ...gitCheck.check_ids.map((checkId) => ({
      check_id: checkId,
      producer_id: deterministicProducer,
      command_id: gitCheck.command_id,
    })),
  ];
}

function npmInvocation(npmScript) {
  if (process.env.npm_execpath) {
    return { file: process.execPath, args: [process.env.npm_execpath, "run", npmScript] };
  }
  return { file: process.platform === "win32" ? "npm.cmd" : "npm", args: ["run", npmScript] };
}

function receiptFromResult({ checkId, commandId, startedAt, completedAt, result }) {
  const status = result.status === 0 && !result.timed_out && !result.error ? "passed" : "failed";
  const evidenceFingerprint = fingerprint({
    command_id: commandId,
    status,
    exit_code: result.status,
    signal: result.signal,
    stdout_chars: result.stdout_chars,
    stderr_chars: result.stderr_chars,
    timed_out: result.timed_out,
    error_code: result.error?.code ?? null,
  });
  return sealVerificationReceipt({
    schema_version: 1,
    check_id: checkId,
    producer_id: deterministicProducer,
    command_id: commandId,
    started_at: startedAt,
    completed_at: completedAt,
    status,
    evidence_fingerprint: evidenceFingerprint,
  });
}

async function runCommand(commandId, command, checkIds) {
  const startedAt = new Date().toISOString();
  let result;
  try {
    result = await runManagedCommand({
      ...command,
      cwd: root,
      env: deterministicStageEnvironment(),
      timeout: 10 * 60 * 1000,
      maxOutputChars: 4 * 1024 * 1024,
    });
  } catch (error) {
    result = {
      status: null,
      signal: null,
      stdout_chars: 0,
      stderr_chars: 0,
      timed_out: false,
      error,
    };
  }
  const completedAt = new Date().toISOString();
  const receipts = checkIds.map((checkId) => receiptFromResult({
    checkId,
    commandId,
    startedAt,
    completedAt,
    result,
  }));
  return { result, receipts, startedAt, completedAt };
}

function writeDeterministicReceiptBundle(output, context, receipts) {
  if (output === undefined) return;
  if (typeof output !== "string" || !path.isAbsolute(output) || path.resolve(output) !== output
    || path.normalize(output) !== output || output.includes("\0") || Buffer.byteLength(output, "utf8") > 4096) {
    throw new Error("OPENCODE_MILESTONE_RECEIPTS_OUT must be a canonical absolute path");
  }
  if (fs.existsSync(output)) throw new Error("deterministic receipt bundle output already exists");
  const parent = path.dirname(output);
  fs.mkdirSync(parent, { recursive: true });
  const canonicalParent = fs.realpathSync.native(parent);
  const comparable = process.platform === "win32"
    ? (value) => value.toLowerCase()
    : (value) => value;
  if (comparable(canonicalParent) !== comparable(parent)) {
    throw new Error("deterministic receipt bundle output parent is not canonical");
  }
  const bundle = sealMilestone2ReceiptBundle({
    dimension_id: "deterministic_contracts",
    head_sha: context.head_sha,
    workspace_fingerprint: context.workspace_fingerprint,
    run_binding: context.run_binding,
    receipts,
  });
  fs.writeFileSync(output, `${JSON.stringify(bundle, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function syntheticReceipt(entry, startedAt, completedAt, evidence) {
  return sealVerificationReceipt({
    schema_version: 1,
    check_id: entry.check_id,
    producer_id: deterministicProducer,
    command_id: entry.command_id,
    started_at: startedAt,
    completed_at: completedAt,
    status: "passed",
    evidence_fingerprint: fingerprint(evidence),
  });
}

function committedWhitespaceReceipt(startedAt) {
  const whitespace = verifyCommittedWhitespace({
    cwd: root,
    ...committedWhitespaceRequestFromEnvironment(),
  });
  const completedAt = new Date().toISOString();
  console.log(JSON.stringify(whitespace, null, 2));
  const receipt = sealVerificationReceipt({
    schema_version: 1,
    check_id: gitCheck.check_ids[0],
    producer_id: deterministicProducer,
    command_id: gitCheck.command_id,
    started_at: startedAt,
    completed_at: completedAt,
    status: whitespace.status === "passed" ? "passed" : "failed",
    evidence_fingerprint: whitespace.evidence_fingerprint,
    evidence_scope: {
      kind: "committed_whitespace",
      mode: whitespace.mode,
      head_sha: whitespace.head_sha,
      range: whitespace.range,
      resolved_range: whitespace.resolved_range,
      working_tree_state: whitespace.working_tree_state,
      command_statuses: whitespace.commands.map((entry) => ({
        argv_fingerprint: fingerprint(entry.argv),
        status: entry.status,
        error_code: entry.error_code,
      })),
    },
  });
  return { whitespace, receipt, completedAt };
}

async function main() {
  const document = JSON.parse(fs.readFileSync(path.join(root, "quality", "milestone-2-dod.v3.json"), "utf8"));
  const runContext = captureMilestone2RunContext({ workspaceRoot: root, localJobId: "deterministic-contracts" });
  const receipts = [];
  const runStartedAt = new Date().toISOString();
  const passedCommands = [];

  try {

  for (const stage of DETERMINISTIC_STAGE_REGISTRY) {
    console.log(`Deterministic stage: npm run ${stage.npm_script}`);
    const outcome = await runCommand(stage.command_id, npmInvocation(stage.npm_script), stage.check_ids);
    receipts.push(...outcome.receipts);
    if (outcome.result.status !== 0 || outcome.result.timed_out || outcome.result.error) {
      console.error(
        `Stage failed: npm run ${stage.npm_script} (exit ${outcome.result.status ?? "unavailable"}; stdout chars ${outcome.result.stdout_chars}; stderr chars ${outcome.result.stderr_chars}).`,
      );
      break;
    }
    passedCommands.push(stage.command_id);
  }

  if (passedCommands.length === DETERMINISTIC_STAGE_REGISTRY.length) {
    console.log("Deterministic stage: committed whitespace verification");
    const whitespaceStartedAt = new Date().toISOString();
    const whitespaceOutcome = committedWhitespaceReceipt(whitespaceStartedAt);
    receipts.push(whitespaceOutcome.receipt);
    if (whitespaceOutcome.whitespace.status === "passed") {
      const completedAt = whitespaceOutcome.completedAt;
      const registryFingerprint = fingerprint({
        passed_commands: passedCommands,
        receipt_fingerprints: receipts.map((receipt) => receipt.fingerprint),
      });
      receipts.push(syntheticReceipt(syntheticChecks[0], runStartedAt, completedAt, {
        scope: "milestone-1-deterministic-registry",
        registry_fingerprint: registryFingerprint,
      }));
      receipts.push(syntheticReceipt(syntheticChecks[1], runStartedAt, completedAt, {
        scope: "complete-deterministic-registry",
        registry_fingerprint: registryFingerprint,
      }));
    }
  }

  const expectedChecks = deterministicExpectedChecks();
  const expectedIds = new Set(expectedChecks.map((entry) => entry.check_id));
  const selectedReceipts = receipts.filter((entry) => expectedIds.has(entry.check_id));
  const deterministicState = selectedReceipts.length === expectedChecks.length
    && selectedReceipts.every((entry) => entry.status === "passed")
    ? "verified"
    : selectedReceipts.some((entry) => entry.status === "failed") ? "failed" : "unavailable";
  const facts = deriveMilestone2StatusFacts({ document, receipts });
  if (facts.deterministic_contracts !== deterministicState) {
    throw new Error("deterministic receipt state derivation diverged from the runner registry");
  }
  const decision = assessMilestone2Receipts({
    document,
    receipts,
    facts,
  });
  console.log(`Milestone 2 verification status: ${decision.status}`);
  console.log(`Milestone 2 deterministic contracts: ${facts.deterministic_contracts}`);
  console.log("Operational runtime and installed-host evidence are reported separately; deterministic verification does not synthesize them.");
  if (decision.status === "verification_failed") {
    console.error(`Failed deterministic checks: ${decision.deterministic_failed.join(", ") || "none"}`);
    console.error(`Missing deterministic checks: ${decision.deterministic_missing.join(", ") || "none"}`);
    process.exitCode = 1;
  } else if (facts.deterministic_contracts !== "verified") {
    throw new Error(`deterministic verify-all did not complete its declared contract suite, got ${facts.deterministic_contracts}`);
  }
  } finally {
    assertMilestone2RunContextStable(runContext, {
      workspaceRoot: root,
      localJobId: "deterministic-contracts",
    });
    writeDeterministicReceiptBundle(process.env.OPENCODE_MILESTONE_RECEIPTS_OUT, runContext, receipts);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`Deterministic verification runner failed: ${error.message}`);
    process.exitCode = 1;
  });
}
