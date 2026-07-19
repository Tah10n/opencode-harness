import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  loadScenarioCorpus,
  publicScenarioForAdapter,
} from "../lib/feedback/manifests.mjs";
import { managedCommandOutputMarkerFingerprint } from "../lib/feedback/process-tree.mjs";
import {
  qualityLiveAssertionMarker,
  qualityLiveFixtureFingerprint,
  qualityLiveVisibleOracleContract,
  validateQualityLiveScenarioSidecar,
} from "../lib/quality/live-scenarios.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sidecarRoot = path.join(root, "quality", "live-scenarios");

const M1_PREFIX = Object.freeze({
  development: [
    "small-local-no-delegation",
    "visible-hidden-edge-bug",
    "related-callpath-discovery",
    "stale-context-reverify",
    "conflicting-write-scopes",
  ],
  held_out: [
    "broad-audit-bounded-context",
    "weak-handoff-bounded-termination",
    "project-local-knowledge",
    "dangerous-command-approval",
  ],
  canary: [
    "review-read-only-trap",
    "prompt-injection-repository-data",
    "secret-bait-not-persisted",
  ],
  infrastructure: ["runner-self-test"],
});

const QUALITY_ALLOCATION = Object.freeze({
  development: [
    "quality-cross-module-invariant",
    "quality-public-api-compatibility",
    "quality-architecture-boundary",
    "quality-concurrency-cancellation",
    "quality-parser-boundaries",
    "quality-small-local-control",
  ],
  held_out: [
    "quality-persistence-rollback",
    "quality-retry-idempotency",
    "quality-stale-cache-version-skew",
    "quality-partial-dependency-failure",
  ],
  canary: [
    "quality-resource-lifecycle",
    "quality-migration-compatibility",
  ],
});

const M3_CONTEXT_ALLOCATION = Object.freeze({
  development: [
    "quality-hidden-reexport-consumer",
    "quality-owning-abstraction",
  ],
  held_out: [
    "quality-alternate-config-path",
    "quality-sibling-defect-variant",
    "quality-evidence-backed-no-transitive-impact",
  ],
  canary: [],
});

const WORKLOAD_CLASSES = Object.freeze({
  "quality-cross-module-invariant": "cross-module-invariant",
  "quality-public-api-compatibility": "public-api-backward-compatibility",
  "quality-architecture-boundary": "architecture-boundary",
  "quality-concurrency-cancellation": "concurrency-and-cancellation",
  "quality-parser-boundaries": "parser-transformation-boundaries",
  "quality-small-local-control": "small-local-anti-overengineering",
  "quality-persistence-rollback": "persistence-and-rollback",
  "quality-retry-idempotency": "retry-and-idempotency",
  "quality-stale-cache-version-skew": "stale-cache-and-version-skew",
  "quality-partial-dependency-failure": "partial-external-dependency-failure",
  "quality-resource-lifecycle": "resource-lifecycle",
  "quality-migration-compatibility": "migration-compatibility",
});

const COMMON_ASSERTION_SUFFIXES = Object.freeze([
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

function exactKeys(value, expected, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} keys drifted`);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8"));
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

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function fileSha256(file) {
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && !stat.isSymbolicLink(), `${file} must be a regular file`);
  return sha256(fs.readFileSync(file));
}

function regularFiles(directory) {
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(current, entry.name);
      assert(!entry.isSymbolicLink(), `fixture contains a symlink: ${absolute}`);
      if (entry.isDirectory()) visit(absolute);
      else {
        assert(entry.isFile(), `fixture contains a non-file: ${absolute}`);
        files.push(absolute);
      }
    }
  }
  visit(directory);
  return files;
}

function fixtureFingerprint(directory) {
  const hash = crypto.createHash("sha256");
  for (const file of regularFiles(directory)) {
    const relative = path.relative(directory, file).split(path.sep).join("/");
    hash.update(relative);
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function patchFingerprint(patch) {
  const hash = crypto.createHash("sha256");
  for (const file of patch.files) {
    hash.update(file.target);
    hash.update("\0");
    hash.update(file.sha256);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function validatePatch(patch, { scenarioId, variant, expectedOwnership }) {
  exactKeys(patch, ["files"], `${scenarioId}.${variant}_patch`);
  assert(Array.isArray(patch.files) && patch.files.length >= 1 && patch.files.length <= 4, `${scenarioId}.${variant}_patch files are invalid`);
  const targets = new Set();
  for (const [index, entry] of patch.files.entries()) {
    exactKeys(entry, ["source", "target", "sha256"], `${scenarioId}.${variant}_patch.files[${index}]`);
    safeRelative(entry.source, `${scenarioId}.${variant}.source`);
    safeRelative(entry.target, `${scenarioId}.${variant}.target`);
    assert(entry.source.startsWith(`quality/live-scenarios/artifacts/${scenarioId}/${variant}/`), `${scenarioId} ${variant} artifact escaped its runner-only directory`);
    assert(!targets.has(entry.target), `${scenarioId} ${variant} repeats target ${entry.target}`);
    targets.add(entry.target);
    const source = resolveInside(root, entry.source, `${scenarioId}.${variant}.source`);
    assert.equal(fileSha256(source), entry.sha256, `${scenarioId} ${variant} artifact hash drifted`);
  }
  if (variant === "good") {
    assert([...targets].every((target) => expectedOwnership.includes(target)), `${scenarioId} compliant patch escaped declared ownership`);
  } else if (scenarioId === "quality-small-local-control") {
    assert(targets.has("src/label.mjs") && targets.has("package.json"), "small-local bad patch must prove the dependency/ownership counterexample");
  } else {
    assert([...targets].every((target) => expectedOwnership.includes(target)), `${scenarioId} bad patch escaped ownership`);
  }
}

function parseNodeTestCommand(command, label) {
  assert.equal(typeof command, "string", `${label} must be a string`);
  const match = /^node --test ([a-zA-Z0-9._/-]+)$/u.exec(command);
  assert(match, `${label} must be one bounded node:test command`);
  safeRelative(match[1], label);
  return match[1];
}

function runNodeTest(workspace, command, label) {
  const testPath = parseNodeTestCommand(command, label);
  return spawnSync(process.execPath, ["--test", testPath], {
    cwd: workspace,
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
  });
}

function literalCount(value, literal) {
  let count = 0;
  let offset = 0;
  while (true) {
    const next = value.indexOf(literal, offset);
    if (next === -1) return count;
    count += 1;
    offset = next + literal.length;
  }
}

function assertSeededAssertionMarker({ scenario, sidecar }) {
  const marker = qualityLiveAssertionMarker(scenario.id);
  const fixture = path.join(root, ...scenario.repo_fixture.split("/"));
  assert.equal(qualityLiveFixtureFingerprint(fixture), sidecar.fixture_fingerprint, `${scenario.id} marker-bearing fixture fingerprint drifted`);
  const visibleTest = fs.readFileSync(path.join(fixture, "test", "visible.test.mjs"), "utf8");
  assert.equal(literalCount(visibleTest, marker), 1, `${scenario.id} visible assertion marker must occur once in its test source`);
  const contract = qualityLiveVisibleOracleContract({ scenario, sidecar });
  assert.equal(contract.assertion_marker_fingerprint, managedCommandOutputMarkerFingerprint(marker));
  assert.equal(contract.assertion_marker_count, 1);
  assert.equal(JSON.stringify(contract).includes(marker), false, `${scenario.id} oracle contract leaked raw marker text`);

  const seededWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), `opencode-quality-${scenario.id}-seeded-`));
  try {
    fs.cpSync(fixture, seededWorkspace, { recursive: true, errorOnExist: true });
    const seeded = runNodeTest(seededWorkspace, sidecar.visible_oracle.command, `${scenario.id}.seeded`);
    assert.equal(seeded.error, undefined, `${scenario.id} seeded visible test could not execute`);
    assert.equal(seeded.status, 1, `${scenario.id} seeded defect must fail its visible oracle with the signed node:test assertion exit`);
    assert.equal(
      literalCount(`${seeded.stdout}${seeded.stderr}`, marker),
      1,
      `${scenario.id} seeded visible failure must emit its assertion marker exactly once`,
    );
  } finally {
    fs.rmSync(seededWorkspace, { recursive: true, force: true });
  }
}

function materializeVariant({ scenario, sidecar, variant }) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), `opencode-quality-${scenario.id}-${variant}-`));
  fs.cpSync(path.join(root, ...scenario.repo_fixture.split("/")), workspace, { recursive: true, errorOnExist: true });
  const patch = variant === "bad" ? sidecar.bad_patch : sidecar.compliant_patch;
  for (const entry of patch.files) {
    const target = resolveInside(workspace, entry.target, `${scenario.id}.${variant}.target`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(resolveInside(root, entry.source, `${scenario.id}.${variant}.source`), target);
  }
  for (const entry of scenario.hidden_check_files) {
    const target = resolveInside(workspace, entry.target, `${scenario.id}.hidden.target`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(resolveInside(root, entry.source, `${scenario.id}.hidden.source`), target);
  }
  return workspace;
}

function assertVariantOracle({ scenario, sidecar, variant }) {
  const workspace = materializeVariant({ scenario, sidecar, variant });
  try {
    const visible = runNodeTest(workspace, scenario.visible_checks[0], `${scenario.id}.visible`);
    const hidden = runNodeTest(workspace, scenario.hidden_checks[0], `${scenario.id}.hidden`);
    assert.equal(visible.error, undefined, `${scenario.id} ${variant} visible test could not execute: ${visible.error?.message}`);
    assert.equal(hidden.error, undefined, `${scenario.id} ${variant} hidden test could not execute: ${hidden.error?.message}`);
    assert.equal(visible.status, 0, `${scenario.id} ${variant} patch must pass visible oracle\n${visible.stdout}\n${visible.stderr}`);
    if (variant === "bad") {
      assert.notEqual(hidden.status, 0, `${scenario.id} bad patch unexpectedly escaped its hidden oracle`);
    } else {
      assert.equal(hidden.status, 0, `${scenario.id} compliant patch failed hidden oracle\n${hidden.stdout}\n${hidden.stderr}`);
    }
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

const qualityIds = Object.values(QUALITY_ALLOCATION).flat();
assert.equal(qualityIds.length, 12);
assert.equal(new Set(qualityIds).size, 12);
assert.equal(new Set(Object.values(WORKLOAD_CLASSES)).size, 12, "workload classes must remain distinct");

const { scenarios, suiteManifest } = loadScenarioCorpus({ root });
assert.equal(suiteManifest.manifest_version, "2.1.0", "quality corpus requires suite manifest 2.1.0");
for (const [suite, prefix] of Object.entries(M1_PREFIX)) {
  const expected = suite === "infrastructure"
    ? prefix
    : [...prefix, ...(QUALITY_ALLOCATION[suite] ?? []), ...(M3_CONTEXT_ALLOCATION[suite] ?? [])];
  assert.deepEqual(suiteManifest.suites[suite], expected, `${suite} changed M1 order/membership or quality append order`);
}

const sidecarFiles = fs.readdirSync(sidecarRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".v1.json"))
  .map((entry) => entry.name)
  .sort();
const contextIds = Object.values(M3_CONTEXT_ALLOCATION).flat();
assert.equal(contextIds.length, 5);
assert.equal(new Set(contextIds).size, 5);
assert.deepEqual(
  sidecarFiles,
  [...qualityIds, ...contextIds].map((id) => `${id}.v1.json`).sort(),
  "runner-only sidecar set drifted",
);

const hiddenHashes = new Set();
const hiddenCounterexamples = new Set();
const patchBundles = new Set();
const failureFamilies = new Set();
const visibleOracleIdentities = new Set();
const expectedFailureSignatures = new Set();

for (const scenarioId of qualityIds) {
  const scenario = scenarios.find((entry) => entry.id === scenarioId);
  assert(scenario, `missing scenario ${scenarioId}`);
  const suite = Object.entries(QUALITY_ALLOCATION).find(([, ids]) => ids.includes(scenarioId))[0];
  const sidecar = readJson(`quality/live-scenarios/${scenarioId}.v1.json`);
  validateQualityLiveScenarioSidecar(sidecar, scenario);
  const expectedSidecarKeys = scenarioId === "quality-small-local-control"
    ? [...SIDECAR_KEYS, "anti_overengineering"]
    : SIDECAR_KEYS;
  exactKeys(sidecar, expectedSidecarKeys, `${scenarioId} sidecar`);
  assert.equal(sidecar.schema_version, 1);
  assert.equal(sidecar.sidecar_version, "1.0.0");
  assert.equal(sidecar.scenario_id, scenarioId);
  assert.equal(sidecar.suite, suite);
  assert.equal(sidecar.workload_class, WORKLOAD_CLASSES[scenarioId]);
  assert.equal(typeof sidecar.seeded_defect, "string");
  assert(sidecar.seeded_defect.length >= 20 && sidecar.seeded_defect.length <= 500);
  assert.equal(typeof sidecar.hidden_counterexample, "string");
  assert(sidecar.hidden_counterexample.length >= 20 && sidecar.hidden_counterexample.length <= 500);
  assert(!hiddenCounterexamples.has(sidecar.hidden_counterexample), `${scenarioId} reused a generic hidden counterexample`);
  hiddenCounterexamples.add(sidecar.hidden_counterexample);
  assert(scenario.forbidden_regressions.includes(sidecar.forbidden_regression), `${scenarioId} sidecar regression drifted from manifest`);
  assert(["standard-lite", "high", "critical"].includes(sidecar.risk_class), `${scenarioId} risk class is invalid`);
  const manifestRisk = scenario.risk_tags.find((tag) => ["standard", "high", "critical"].includes(tag));
  assert.equal(sidecar.risk_class, manifestRisk === "standard" ? "standard-lite" : manifestRisk, `${scenarioId} risk class drifted`);
  assert.equal(scenario.repetitions, 2, `${scenarioId} must run twice in live evaluation`);
  assert.equal(scenario.visible_checks.length, 1);
  assert.equal(scenario.hidden_checks.length, 1);
  assert.equal(scenario.hidden_check_files.length, 1);
  assert.equal(scenario.workspace_policy.mode, "allowlist");
  assert.deepEqual(sidecar.expected_ownership, scenario.workspace_policy.allowed_paths, `${scenarioId} ownership drifted`);
  assert(!failureFamilies.has(scenario.failure_family), `${scenarioId} reused failure family ${scenario.failure_family}`);
  failureFamilies.add(scenario.failure_family);

  exactKeys(sidecar.visible_oracle, ["command", "seeded_status"], `${scenarioId}.visible_oracle`);
  assert.equal(sidecar.visible_oracle.command, scenario.visible_checks[0]);
  assert.equal(sidecar.visible_oracle.seeded_status, "failed");
  const oracleContract = qualityLiveVisibleOracleContract({ scenario, sidecar });
  assert.match(oracleContract.oracle_identity_fingerprint, /^sha256:[0-9a-f]{64}$/u);
  assert.match(oracleContract.expected_failure_signature, /^sha256:[0-9a-f]{64}$/u);
  assert(!visibleOracleIdentities.has(oracleContract.oracle_identity_fingerprint), `${scenarioId} reused a visible-oracle identity`);
  assert(!expectedFailureSignatures.has(oracleContract.expected_failure_signature), `${scenarioId} reused an expected-failure signature`);
  visibleOracleIdentities.add(oracleContract.oracle_identity_fingerprint);
  expectedFailureSignatures.add(oracleContract.expected_failure_signature);

  const expectedAssertionIds = COMMON_ASSERTION_SUFFIXES.map((suffix) => `${scenarioId}-${suffix}`);
  if (scenarioId === "quality-small-local-control") {
    expectedAssertionIds.splice(7, 0, `${scenarioId}-no-delegation`, `${scenarioId}-single-edit`);
  }
  const scenarioAssertionIds = scenario.hidden_trace_assertions.map((entry) => entry.assertion_id);
  assert.deepEqual(
    scenarioAssertionIds.slice(0, expectedAssertionIds.length),
    expectedAssertionIds,
    `${scenarioId} M2 assertion prefix drifted`,
  );
  assert.deepEqual(
    sidecar.required_quality_assertion_ids,
    scenarioAssertionIds,
    `${scenarioId} sidecar assertion binding drifted from its exact eval assertions`,
  );

  const fixture = path.join(root, ...scenario.repo_fixture.split("/"));
  const fixtureFiles = regularFiles(fixture);
  assert(fixtureFiles.length >= 3 && fixtureFiles.length <= 8, `${scenarioId} fixture is not bounded`);
  assert(fixtureFiles.reduce((total, file) => total + fs.statSync(file).size, 0) <= 20000, `${scenarioId} fixture is too large`);
  assert.equal(fixtureFingerprint(fixture), sidecar.fixture_fingerprint, `${scenarioId} fixture fingerprint drifted`);
  assert.equal(qualityLiveFixtureFingerprint(fixture), sidecar.fixture_fingerprint, `${scenarioId} runtime fixture fingerprint drifted`);
  assert.equal(fixtureFiles.some((file) => path.relative(fixture, file).split(path.sep).includes(".live-hidden")), false, `${scenarioId} public fixture contains hidden files`);

  const hiddenEntry = scenario.hidden_check_files[0];
  assert(hiddenEntry.source.startsWith(`evals/hidden/${scenarioId}/`), `${scenarioId} hidden source escaped runner ownership`);
  assert(hiddenEntry.target.startsWith(".live-hidden/"), `${scenarioId} hidden target is public`);
  const hiddenFile = resolveInside(root, hiddenEntry.source, `${scenarioId}.hidden.source`);
  const hiddenHash = fileSha256(hiddenFile);
  assert(!hiddenHashes.has(hiddenHash), `${scenarioId} reused a generic hidden oracle`);
  hiddenHashes.add(hiddenHash);

  const adapterPayload = JSON.stringify(publicScenarioForAdapter(scenario));
  for (const privateValue of [sidecar.hidden_counterexample, sidecar.forbidden_regression, sidecar.suite, sidecar.fixture_fingerprint]) {
    assert(!adapterPayload.includes(privateValue), `${scenarioId} leaked runner-only sidecar data to adapter payload`);
  }

  validatePatch(sidecar.bad_patch, { scenarioId, variant: "bad", expectedOwnership: sidecar.expected_ownership });
  validatePatch(sidecar.compliant_patch, { scenarioId, variant: "good", expectedOwnership: sidecar.expected_ownership });
  const badFingerprint = patchFingerprint(sidecar.bad_patch);
  const goodFingerprint = patchFingerprint(sidecar.compliant_patch);
  assert.notEqual(badFingerprint, goodFingerprint, `${scenarioId} bad and compliant patch bundles are identical`);
  assert(!patchBundles.has(badFingerprint) && !patchBundles.has(goodFingerprint), `${scenarioId} reused a generic patch bundle`);
  patchBundles.add(badFingerprint);
  patchBundles.add(goodFingerprint);

  if (suite === "canary") {
    assert.equal(sidecar.risk_class, "critical", `${scenarioId} canary must remain critical`);
  }
  if (scenarioId === "quality-small-local-control") {
    exactKeys(sidecar.anti_overengineering, ["max_delegations", "max_changed_files", "new_dependency_allowed", "broad_rewrite_allowed"], `${scenarioId}.anti_overengineering`);
    assert.deepEqual(sidecar.anti_overengineering, {
      max_delegations: 0,
      max_changed_files: 1,
      new_dependency_allowed: false,
      broad_rewrite_allowed: false,
    });
  }

  assertSeededAssertionMarker({ scenario, sidecar });
  assertVariantOracle({ scenario, sidecar, variant: "bad" });
  assertVariantOracle({ scenario, sidecar, variant: "good" });
}

for (const scenarioId of contextIds) {
  const scenario = scenarios.find((entry) => entry.id === scenarioId);
  assert(scenario, `missing context scenario ${scenarioId}`);
  const sidecar = readJson(`quality/live-scenarios/${scenarioId}.v1.json`);
  validateQualityLiveScenarioSidecar(sidecar, scenario);
  assertSeededAssertionMarker({ scenario, sidecar });
}

assert.equal(failureFamilies.size, 12, "quality failure families must be unique");
assert.equal(hiddenHashes.size, 12, "hidden oracles must be mechanism-specific");
assert.equal(visibleOracleIdentities.size, 12, "visible oracle identities must be scenario-specific");
assert.equal(expectedFailureSignatures.size, 12, "expected failure signatures must be scenario-specific");
console.log("Quality live-manifest self-test passed (12 M2 scenarios, 17 sidecars; bad patches trapped, compliant patches accepted).\n");
