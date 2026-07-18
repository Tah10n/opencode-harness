import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const EXISTING_SCENARIOS = Object.freeze([
  "quality-architecture-boundary",
  "quality-concurrency-cancellation",
  "quality-cross-module-invariant",
  "quality-migration-compatibility",
  "quality-partial-dependency-failure",
  "quality-persistence-rollback",
  "quality-public-api-compatibility",
  "quality-resource-lifecycle",
  "quality-retry-idempotency",
  "quality-small-local-control",
  "quality-stale-cache-version-skew",
  "related-callpath-discovery",
]);
const NEW_SCENARIOS = Object.freeze([
  "quality-alternate-config-path",
  "quality-hidden-reexport-consumer",
  "quality-owning-abstraction",
  "quality-sibling-defect-variant",
]);
const EXPECTED_SCENARIOS = Object.freeze([...EXISTING_SCENARIOS, ...NEW_SCENARIOS].sort());
const NEW_SUITE = Object.freeze({
  "quality-alternate-config-path": "held_out",
  "quality-hidden-reexport-consumer": "development",
  "quality-owning-abstraction": "development",
  "quality-sibling-defect-variant": "held_out",
});

const WIDE_DEEP_CODES = Object.freeze([
  "CONTEXT_STRATEGY_SELECTED_BEFORE_IMPLEMENTATION",
  "CONTEXT_REQUIRED_RECEIPTS_BOUND",
  "CONTEXT_REPORT_FINALIZED_BEFORE_IMPLEMENTATION",
  "CONTEXT_DIRECT_TRANSITIVE_PATHS_REPRESENTED",
  "CONTEXT_EXCLUSIONS_EVIDENCE_BOUND",
  "CONTEXT_CRITICAL_PATHS_DEEPLY_ANALYZED",
  "CONTEXT_BLOCKING_UNKNOWNS_RESOLVED",
  "CONTEXT_EDGE_FAILURE_VERIFICATION_LINKED",
  "CONTEXT_DISCOVERY_BOUNDED",
  "CONTEXT_IMPLEMENTATION_WITHIN_PLANNED_OWNERSHIP",
  "CONTEXT_FINAL_RECONCILIATION_COMPLETE",
]);
const STANDARD_LITE_CODES = Object.freeze([
  "CONTEXT_STRATEGY_SELECTED_BEFORE_IMPLEMENTATION",
  "CONTEXT_REQUIRED_RECEIPTS_BOUND",
  "CONTEXT_BLOCKING_UNKNOWNS_RESOLVED",
  "CONTEXT_EDGE_FAILURE_VERIFICATION_LINKED",
  "CONTEXT_DISCOVERY_BOUNDED",
  "CONTEXT_IMPLEMENTATION_WITHIN_PLANNED_OWNERSHIP",
  "CONTEXT_FINAL_RECONCILIATION_COMPLETE",
  "CONTEXT_STANDARD_LITE_PROCESS_BOUNDED",
]);
const QUALITY_ASSERTION_SUFFIXES = Object.freeze([
  "dossier-before-edit",
  "gate-before-edit",
  "coverage-recorded",
  "unknowns-resolved",
  "mapping-verified",
  "architecture-respected",
  "ownership-respected",
  "integrated-verification",
  "valid-completion",
]);
const SCENARIO_KEYS = Object.freeze([
  "id",
  "description",
  "risk_tags",
  "failure_family",
  "workspace_policy",
  "repo_fixture",
  "task",
  "setup_commands",
  "visible_checks",
  "hidden_checks",
  "hidden_check_files",
  "hidden_trace_assertions",
  "timeout",
  "repetitions",
  "expected_contracts",
  "forbidden_regressions",
]);
const SIDECAR_KEYS = Object.freeze([
  "schema_version",
  "sidecar_version",
  "scenario_id",
  "seeded_defect",
  "visible_oracle",
  "bad_patch",
  "compliant_patch",
  "hidden_counterexample",
  "forbidden_regression",
  "risk_class",
  "workload_class",
  "expected_ownership",
  "required_quality_assertion_ids",
  "suite",
  "fixture_fingerprint",
]);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8").replace(/^\uFEFF/u, ""));
}

function exactKeys(value, expected, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} keys drifted`);
}

function safeRelative(relativePath, label) {
  assert.equal(typeof relativePath, "string", `${label} must be a string`);
  assert(relativePath.length > 0 && relativePath.length <= 1000, `${label} length is invalid`);
  assert(!path.isAbsolute(relativePath), `${label} must be relative`);
  assert(!relativePath.includes("\\") && !relativePath.includes(":"), `${label} must be portable`);
  const segments = relativePath.split("/");
  assert(segments.every((segment) => segment && segment !== "." && segment !== ".."), `${label} must be canonical`);
  return relativePath;
}

function resolveInside(base, relativePath, label) {
  safeRelative(relativePath, label);
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(base, ...relativePath.split("/"));
  assert(resolved.startsWith(`${resolvedBase}${path.sep}`), `${label} escaped its root`);
  return resolved;
}

function regularFiles(directory) {
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(current, entry.name);
      assert(!entry.isSymbolicLink(), `linked fixture entry is forbidden: ${absolute}`);
      if (entry.isDirectory()) visit(absolute);
      else {
        assert(entry.isFile(), `fixture entry must be a regular file: ${absolute}`);
        files.push(absolute);
      }
    }
  }
  visit(directory);
  return files;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function fileSha256(file) {
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && !stat.isSymbolicLink(), `${file} must be a regular file`);
  return sha256(fs.readFileSync(file));
}

function fixtureFingerprint(directory) {
  const hash = crypto.createHash("sha256");
  for (const file of regularFiles(directory)) {
    hash.update(path.relative(directory, file).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function patchFingerprint(patch) {
  const hash = crypto.createHash("sha256");
  for (const entry of patch.files) {
    hash.update(entry.target);
    hash.update("\0");
    hash.update(entry.sha256);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function parseNodeTestCommand(command, label) {
  assert.equal(typeof command, "string", `${label} must be a string`);
  const match = /^node --test ([a-zA-Z0-9._/-]+)$/u.exec(command);
  assert(match, `${label} must be one bounded node:test command`);
  return safeRelative(match[1], label);
}

function runNodeTest(workspace, command, label) {
  const testPath = parseNodeTestCommand(command, label);
  const result = spawnSync(process.execPath, ["--test", testPath], {
    cwd: workspace,
    encoding: "utf8",
    shell: false,
    timeout: 30000,
    windowsHide: true,
  });
  assert.equal(result.error, undefined, `${label} could not execute: ${result.error?.message ?? "unknown error"}`);
  return result;
}

function resultDetails(result) {
  return `status=${result.status}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function validatePatch(patch, { scenarioId, variant, ownership }) {
  exactKeys(patch, ["files"], `${scenarioId}.${variant}_patch`);
  assert(Array.isArray(patch.files) && patch.files.length >= 1 && patch.files.length <= 4, `${scenarioId}.${variant}_patch is unbounded`);
  const targets = new Set();
  for (const [index, entry] of patch.files.entries()) {
    exactKeys(entry, ["source", "target", "sha256"], `${scenarioId}.${variant}_patch.files[${index}]`);
    safeRelative(entry.source, `${scenarioId}.${variant}.source`);
    safeRelative(entry.target, `${scenarioId}.${variant}.target`);
    assert(entry.source.startsWith(`quality/live-scenarios/artifacts/${scenarioId}/${variant}/`), `${scenarioId}.${variant} artifact escaped its directory`);
    assert(!targets.has(entry.target), `${scenarioId}.${variant} repeated ${entry.target}`);
    assert(ownership.includes(entry.target), `${scenarioId}.${variant} escaped declared ownership`);
    targets.add(entry.target);
    const source = resolveInside(root, entry.source, `${scenarioId}.${variant}.source`);
    assert.equal(fileSha256(source), entry.sha256, `${scenarioId}.${variant} artifact hash drifted`);
  }
}

function applyPatch(workspace, patch, scenarioId, variant) {
  for (const entry of patch.files) {
    const source = resolveInside(root, entry.source, `${scenarioId}.${variant}.source`);
    const target = resolveInside(workspace, entry.target, `${scenarioId}.${variant}.target`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function stageHidden(workspace, scenario) {
  for (const entry of scenario.hidden_check_files) {
    const source = resolveInside(root, entry.source, `${scenario.id}.hidden.source`);
    const target = resolveInside(workspace, entry.target, `${scenario.id}.hidden.target`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function validateVariant({ scenario, sidecar, variant }) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), `opencode-context-${scenario.id}-${variant}-`));
  try {
    const fixture = resolveInside(root, scenario.repo_fixture, `${scenario.id}.fixture`);
    fs.cpSync(fixture, workspace, { recursive: true, errorOnExist: true });
    const patch = variant === "bad" ? sidecar.bad_patch : sidecar.compliant_patch;
    applyPatch(workspace, patch, scenario.id, variant);
    const visible = runNodeTest(workspace, scenario.visible_checks[0], `${scenario.id}.${variant}.visible`);
    assert.equal(visible.status, 0, `${scenario.id}.${variant} must pass the visible oracle\n${resultDetails(visible)}`);
    stageHidden(workspace, scenario);
    const hidden = runNodeTest(workspace, scenario.hidden_checks[0], `${scenario.id}.${variant}.hidden`);
    if (variant === "bad") {
      assert.notEqual(hidden.status, 0, `${scenario.id}.bad must be trapped by the hidden oracle`);
    } else {
      assert.equal(hidden.status, 0, `${scenario.id}.good must pass the hidden oracle\n${resultDetails(hidden)}`);
    }
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

const catalog = readJson("quality/context-live-scenarios.v1.json");
exactKeys(catalog, ["schema_version", "catalog_version", "code_profiles", "scenarios"], "context live catalog");
assert.equal(catalog.schema_version, 1);
assert.equal(catalog.catalog_version, "1.0.0");
exactKeys(catalog.code_profiles, ["standard-lite-v1", "wide-deep-v1"], "context live code profiles");
assert.deepEqual(catalog.code_profiles["standard-lite-v1"], STANDARD_LITE_CODES);
assert.deepEqual(catalog.code_profiles["wide-deep-v1"], WIDE_DEEP_CODES);
assert.equal(new Set([...STANDARD_LITE_CODES, ...WIDE_DEEP_CODES]).size, 12, "context verifier code inventory drifted");

assert(Array.isArray(catalog.scenarios), "context live scenarios must be an array");
assert.deepEqual(catalog.scenarios.map((entry) => entry.scenario_id), EXPECTED_SCENARIOS, "context live scenario inventory changed or is not sorted");
assert.equal(catalog.scenarios.filter((entry) => entry.scenario_kind === "existing").length, 12, "at least twelve existing context scenarios are required");
assert.equal(catalog.scenarios.filter((entry) => entry.scenario_kind === "new").length, 4, "exactly four new failure mechanisms are required");

for (const [index, entry] of catalog.scenarios.entries()) {
  exactKeys(entry, [
    "scenario_id",
    "scenario_kind",
    "risk_class",
    "strategy_id",
    "code_profile",
    "requires_full_context_report",
  ], `context live scenarios[${index}]`);
  assert(["existing", "new"].includes(entry.scenario_kind), `${entry.scenario_id} scenario_kind is invalid`);
  assert(["standard-lite", "high", "critical"].includes(entry.risk_class), `${entry.scenario_id} risk is invalid`);
  const expectedStrategy = entry.risk_class === "standard-lite"
    ? "standard-lite-local-v1"
    : `${entry.risk_class}-wide-deep-v1`;
  assert.equal(entry.strategy_id, expectedStrategy, `${entry.scenario_id} strategy weakened`);
  assert.equal(entry.code_profile, entry.risk_class === "standard-lite" ? "standard-lite-v1" : "wide-deep-v1");
  assert.equal(entry.requires_full_context_report, entry.risk_class !== "standard-lite");

  const scenario = readJson(`evals/scenarios/${entry.scenario_id}.json`);
  exactKeys(scenario, SCENARIO_KEYS, `${entry.scenario_id} scenario`);
  assert.equal(scenario.id, entry.scenario_id);
  assert(Array.isArray(scenario.hidden_trace_assertions) && scenario.hidden_trace_assertions.length <= 50);
  assert.equal(new Set(scenario.hidden_trace_assertions.map((assertion) => assertion.assertion_id)).size, scenario.hidden_trace_assertions.length, `${entry.scenario_id} assertion IDs repeat`);
  const manifestRisk = scenario.risk_tags.find((tag) => ["standard", "high", "critical"].includes(tag));
  assert.equal(entry.risk_class, manifestRisk === "standard" ? "standard-lite" : manifestRisk, `${entry.scenario_id} catalog risk drifted from manifest`);
  const contextAssertions = scenario.hidden_trace_assertions.filter((assertion) => typeof assertion.code === "string" && assertion.code.startsWith("CONTEXT_"));
  assert(contextAssertions.every((assertion) => assertion.op === "verifier_code_exists"), `${entry.scenario_id} introduced a context assertion DSL operation`);
  assert.deepEqual(
    contextAssertions.map((assertion) => assertion.code),
    catalog.code_profiles[entry.code_profile],
    `${entry.scenario_id} context verifier codes drifted`,
  );
}

const hiddenHashes = new Set();
const patchFingerprints = new Set();
const workloadClasses = new Set();
for (const scenarioId of NEW_SCENARIOS) {
  const scenario = readJson(`evals/scenarios/${scenarioId}.json`);
  const sidecar = readJson(`quality/live-scenarios/${scenarioId}.v1.json`);
  exactKeys(sidecar, SIDECAR_KEYS, `${scenarioId} sidecar`);
  assert.equal(sidecar.schema_version, 1);
  assert.equal(sidecar.sidecar_version, "1.0.0");
  assert.equal(sidecar.scenario_id, scenarioId);
  assert.equal(sidecar.risk_class, "high");
  assert.equal(sidecar.suite, NEW_SUITE[scenarioId]);
  assert(!workloadClasses.has(sidecar.workload_class), `${scenarioId} reused a workload class`);
  workloadClasses.add(sidecar.workload_class);
  assert.equal(scenario.workspace_policy.mode, "allowlist");
  assert.deepEqual(sidecar.expected_ownership, scenario.workspace_policy.allowed_paths, `${scenarioId} ownership drifted`);
  assert.equal(scenario.repetitions, 2);
  assert.equal(scenario.visible_checks.length, 1);
  assert.equal(scenario.hidden_checks.length, 1);
  assert.equal(scenario.hidden_check_files.length, 1);
  assert.equal(sidecar.visible_oracle.command, scenario.visible_checks[0]);
  assert.equal(sidecar.visible_oracle.seeded_status, "failed");
  assert(scenario.forbidden_regressions.includes(sidecar.forbidden_regression), `${scenarioId} sidecar regression is not runner-owned manifest data`);
  const expectedQualityIds = QUALITY_ASSERTION_SUFFIXES.map((suffix) => `${scenarioId}-${suffix}`);
  assert.deepEqual(sidecar.required_quality_assertion_ids, expectedQualityIds, `${scenarioId} M2 assertion binding drifted`);
  assert.deepEqual(scenario.hidden_trace_assertions.slice(0, expectedQualityIds.length).map((entry) => entry.assertion_id), expectedQualityIds, `${scenarioId} M2 assertions must precede context assertions`);

  const fixture = resolveInside(root, scenario.repo_fixture, `${scenarioId}.fixture`);
  const fixtureFiles = regularFiles(fixture);
  assert(fixtureFiles.length >= 3 && fixtureFiles.length <= 8, `${scenarioId} fixture must contain 3-8 files`);
  assert(fixtureFiles.reduce((total, file) => total + fs.statSync(file).size, 0) <= 20000, `${scenarioId} fixture exceeds 20 KB`);
  assert.equal(fixtureFingerprint(fixture), sidecar.fixture_fingerprint, `${scenarioId} fixture fingerprint drifted`);

  const hiddenSource = resolveInside(root, scenario.hidden_check_files[0].source, `${scenarioId}.hidden.source`);
  assert(scenario.hidden_check_files[0].source.startsWith(`evals/hidden/${scenarioId}/`));
  assert(scenario.hidden_check_files[0].target.startsWith(".live-hidden/"));
  const hiddenHash = fileSha256(hiddenSource);
  assert(!hiddenHashes.has(hiddenHash), `${scenarioId} reused a hidden oracle`);
  hiddenHashes.add(hiddenHash);

  validatePatch(sidecar.bad_patch, { scenarioId, variant: "bad", ownership: sidecar.expected_ownership });
  validatePatch(sidecar.compliant_patch, { scenarioId, variant: "good", ownership: sidecar.expected_ownership });
  for (const patch of [sidecar.bad_patch, sidecar.compliant_patch]) {
    const currentFingerprint = patchFingerprint(patch);
    assert(!patchFingerprints.has(currentFingerprint), `${scenarioId} reused a patch bundle`);
    patchFingerprints.add(currentFingerprint);
  }

  const seededWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), `opencode-context-${scenarioId}-seeded-`));
  try {
    fs.cpSync(fixture, seededWorkspace, { recursive: true, errorOnExist: true });
    const seeded = runNodeTest(seededWorkspace, scenario.visible_checks[0], `${scenarioId}.seeded.visible`);
    assert.notEqual(seeded.status, 0, `${scenarioId} seeded defect must fail the visible oracle`);
  } finally {
    fs.rmSync(seededWorkspace, { recursive: true, force: true });
  }
  validateVariant({ scenario, sidecar, variant: "bad" });
  validateVariant({ scenario, sidecar, variant: "good" });
}

const allScenarioFiles = fs.readdirSync(path.join(root, "evals", "scenarios"))
  .filter((name) => name.endsWith(".json"));
const failureFamilies = allScenarioFiles.map((name) => readJson(`evals/scenarios/${name}`).failure_family);
assert.equal(new Set(failureFamilies).size, failureFamilies.length, "failure families must remain mechanism-specific");

console.log("Context live-manifest self-test passed (12 existing context scenarios plus 4 distinct new mechanisms).");
