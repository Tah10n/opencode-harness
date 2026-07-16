import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  assessMilestone2Receipts,
  deriveMilestone2StatusFacts,
  validateMilestone2ReceiptBundle,
} from "../lib/quality/milestone-dod.mjs";
import {
  assertMilestone2BundleMatchesRunContext,
  captureMilestone2RunContext,
} from "../lib/quality/milestone-run-context.mjs";
import { fingerprint } from "../lib/quality/validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BUNDLE_BYTES = 4 * 1024 * 1024;

function parseArguments(argv) {
  let bundleDirectory = null;
  let output = null;
  let hostUnavailable = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--bundle-dir" && bundleDirectory === null) bundleDirectory = argv[++index] ?? null;
    else if (argument === "--out" && output === null) output = argv[++index] ?? null;
    else if (argument === "--host-unavailable" && !hostUnavailable) hostUnavailable = true;
    else throw new Error(`unsupported milestone assessment argument: ${argument}`);
  }
  for (const [label, candidate] of [["--bundle-dir", bundleDirectory], ["--out", output]]) {
    if (typeof candidate !== "string" || !path.isAbsolute(candidate) || path.resolve(candidate) !== candidate
      || path.normalize(candidate) !== candidate || candidate.includes("\0")
      || Buffer.byteLength(candidate, "utf8") > 4096) {
      throw new Error(`${label} must be a canonical absolute path`);
    }
  }
  return Object.freeze({ bundleDirectory, output, hostUnavailable });
}

function readBundle(candidate) {
  const bytes = fs.readFileSync(candidate);
  if (bytes.length === 0 || bytes.length > MAX_BUNDLE_BYTES) {
    throw new Error(`receipt bundle size is invalid: ${path.basename(candidate)}`);
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`receipt bundle JSON is invalid: ${path.basename(candidate)}`);
  }
  return validateMilestone2ReceiptBundle(value);
}

function writeAggregate(candidate, value) {
  if (fs.existsSync(candidate)) throw new Error("milestone aggregate output already exists");
  const parent = path.dirname(candidate);
  fs.mkdirSync(parent, { recursive: true });
  const canonicalParent = fs.realpathSync.native(parent);
  const comparable = process.platform === "win32"
    ? (entry) => entry.toLowerCase()
    : (entry) => entry;
  if (comparable(canonicalParent) !== comparable(parent)) {
    throw new Error("milestone aggregate output parent is not canonical");
  }
  fs.writeFileSync(candidate, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const bundleDirectory = fs.realpathSync.native(options.bundleDirectory);
  if (!fs.statSync(bundleDirectory).isDirectory() || bundleDirectory !== options.bundleDirectory) {
    throw new Error("receipt bundle directory must be a canonical directory");
  }
  const runContext = captureMilestone2RunContext({ workspaceRoot: root, localJobId: "milestone-2-aggregate" });
  const names = fs.readdirSync(bundleDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  if (names.length === 0 || names.length > 8) throw new Error("receipt bundle directory has no bounded bundle set");
  const bundles = names.map((name) => readBundle(path.join(bundleDirectory, name)));
  const dimensions = new Set();
  for (const bundle of bundles) {
    if (dimensions.has(bundle.dimension_id)) throw new Error(`duplicate receipt bundle for ${bundle.dimension_id}`);
    dimensions.add(bundle.dimension_id);
    assertMilestone2BundleMatchesRunContext(bundle, runContext);
  }
  const document = JSON.parse(fs.readFileSync(path.join(root, "quality", "milestone-2-dod.v2.json"), "utf8"));
  const receipts = bundles.flatMap((bundle) => bundle.receipts);
  const hasHostReceipt = receipts.some((receipt) => receipt.check_id === "normal-session-host-hook-e2e");
  if (options.hostUnavailable && hasHostReceipt) {
    throw new Error("--host-unavailable conflicts with installed-host evidence");
  }
  const externalBlockingContext = options.hostUnavailable
    ? [{
      dimension_id: "host_hook_e2e",
      reason_code: "installed-host-adapter-unavailable",
      reason: "The GitHub-hosted verification run has no installed OpenCode host adapter session.",
      external_dependency: "installed-opencode-host-adapter",
    }]
    : [];
  const facts = deriveMilestone2StatusFacts({
    document,
    receipts,
    external_blocking_context: externalBlockingContext,
  });
  const decision = assessMilestone2Receipts({ document, receipts, facts });
  const body = {
    schema_version: 1,
    kind: "milestone_2_receipt_aggregate",
    head_sha: runContext.head_sha,
    workspace_fingerprint: runContext.workspace_fingerprint,
    run_binding: runContext.run_binding,
    bundle_fingerprints: bundles.map((bundle) => bundle.fingerprint).sort(),
    facts,
    decision,
  };
  const aggregate = Object.freeze({ ...body, fingerprint: fingerprint(body) });
  writeAggregate(options.output, aggregate);
  console.log(`Milestone 2 aggregate status: ${decision.status}.`);
  console.log(`Missing receipts: ${decision.receipt_missing.join(", ") || "none"}.`);
  console.log(`Failed receipts: ${decision.receipt_failed.join(", ") || "none"}.`);
  if (!["verified", "blocked_external_state"].includes(decision.status)) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`Milestone 2 receipt assessment failed: ${error.message}`);
  process.exitCode = 1;
}
