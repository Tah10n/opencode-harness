import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BEHAVIORAL_SUITE_NAMES,
  PUBLIC_SCENARIO_FIELDS,
  SUITE_NAMES,
  loadScenarioCorpus,
  publicScenarioForAdapter,
  scenarioJsonSchema,
  selectScenarios,
  suiteJsonSchema,
  validateScenario,
  validateSuiteManifest,
} from "../lib/feedback/manifests.mjs";
import { assessCandidate } from "../lib/feedback/acceptance.mjs";
import {
  TRACE_ASSERTION_OPERATIONS,
  evaluateTraceAssertions,
  validateTraceAssertion,
} from "../lib/feedback/trace-assertions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedSuites = Object.freeze({
  development: [
    "small-local-no-delegation",
    "visible-hidden-edge-bug",
    "related-callpath-discovery",
    "stale-context-reverify",
    "conflicting-write-scopes",
    "quality-cross-module-invariant",
    "quality-public-api-compatibility",
    "quality-architecture-boundary",
    "quality-concurrency-cancellation",
    "quality-parser-boundaries",
    "quality-small-local-control",
    "quality-hidden-reexport-consumer",
    "quality-owning-abstraction",
  ],
  held_out: [
    "broad-audit-bounded-context",
    "weak-handoff-bounded-termination",
    "project-local-knowledge",
    "dangerous-command-approval",
    "quality-persistence-rollback",
    "quality-retry-idempotency",
    "quality-stale-cache-version-skew",
    "quality-partial-dependency-failure",
    "quality-alternate-config-path",
    "quality-sibling-defect-variant",
    "quality-evidence-backed-no-transitive-impact",
  ],
  canary: [
    "review-read-only-trap",
    "prompt-injection-repository-data",
    "secret-bait-not-persisted",
    "quality-resource-lifecycle",
    "quality-migration-compatibility",
  ],
  infrastructure: ["runner-self-test"],
});

function rejectsCode(callback, code) {
  assert.throws(callback, (error) => error?.code === code, `expected ${code}`);
}

function assertionStatus(assertion, evidence) {
  const [result] = evaluateTraceAssertions([assertion], evidence);
  assert.deepEqual(Object.keys(result), ["assertion_id", "status", "reason_code"]);
  return result.status;
}

const scenarioSchema = JSON.parse(fs.readFileSync(path.join(root, "evals", "scenario.schema.json"), "utf8"));
const suiteSchema = JSON.parse(fs.readFileSync(path.join(root, "evals", "suite.schema.json"), "utf8"));
assert.deepEqual(scenarioSchema, scenarioJsonSchema(), "checked scenario schema drifted from executable runtime contract");
assert.deepEqual(suiteSchema, suiteJsonSchema(), "checked suite schema drifted from executable runtime contract");

function schemaStringAccepts(schema, value) {
  const resolved = schema.$ref
    ? scenarioSchema.$defs[schema.$ref.replace("#/$defs/", "")]
    : schema;
  if (resolved.allOf && !resolved.allOf.every((entry) => schemaStringAccepts(entry, value))) return false;
  if (resolved.type === "string" && typeof value !== "string") return false;
  if (Number.isInteger(resolved.minLength) && value.length < resolved.minLength) return false;
  if (Number.isInteger(resolved.maxLength) && value.length > resolved.maxLength) return false;
  if (typeof resolved.pattern === "string" && !new RegExp(resolved.pattern).test(value)) return false;
  return true;
}

const { scenarios, suiteManifest } = loadScenarioCorpus({ root });
const behavioral = scenarios.filter((scenario) => scenario.id !== "runner-self-test");
const infrastructure = scenarios.filter((scenario) => scenario.id === "runner-self-test");
assert.equal(scenarios.length, 30, "corpus must contain 29 behavioral scenarios plus runner self-test");
assert.equal(behavioral.length, 29);
assert.equal(infrastructure.length, 1);
assert.equal(new Set(behavioral.map((scenario) => scenario.failure_family)).size, 29, "failure families must be distinct");
assert(new Set(behavioral.map((scenario) => scenario.repo_fixture)).size >= 8, "corpus must use at least eight mechanism-specific fixtures");

const documentedCorpusPhrase = `${behavioral.length} behavioural scenarios plus ${infrastructure.length} infrastructure self-test`;
for (const relativePath of ["docs/evaluation.md", "docs/live-evaluation.md"]) {
  const document = fs.readFileSync(path.join(root, relativePath), "utf8");
  assert(
    document.includes(documentedCorpusPhrase),
    `${relativePath} must state the machine-derived live corpus size: ${documentedCorpusPhrase}`,
  );
  for (const match of document.matchAll(/\b(\d+)\s*\+\s*(\d+)\s+corpus\b/giu)) {
    assert.equal(
      `${match[1]}+${match[2]}`,
      `${behavioral.length}+${infrastructure.length}`,
      `${relativePath} contains a stale live corpus count: ${match[0]}`,
    );
  }
}

for (const scenario of behavioral) {
  assert.equal(schemaStringAccepts(scenarioSchema.properties.repo_fixture, scenario.repo_fixture), true, `${scenario.id} fixture must satisfy the public schema`);
  assert(["read_only", "allowlist"].includes(scenario.workspace_policy.mode), `${scenario.id} needs an explicit workspace policy`);
  assert(scenario.hidden_checks.length >= 1, `${scenario.id} needs a hidden shell check`);
  assert(scenario.hidden_trace_assertions.length >= 1, `${scenario.id} needs a hidden trace assertion`);
  assert(scenario.hidden_check_files.every((entry) => entry.source.startsWith(`evals/hidden/${scenario.id}/`)));
}
for (const scenarioId of ["review-read-only-trap", "broad-audit-bounded-context", "dangerous-command-approval", "weak-handoff-bounded-termination"]) {
  assert.equal(scenarios.find((scenario) => scenario.id === scenarioId).workspace_policy.mode, "read_only");
}
assert.deepEqual(suiteManifest.suites, expectedSuites);
assert.deepEqual(Object.keys(suiteManifest.suites), SUITE_NAMES);
assert.deepEqual(BEHAVIORAL_SUITE_NAMES, ["development", "held_out", "canary"]);

const defaultSelection = selectScenarios({ scenarios, suiteManifest });
assert.equal(defaultSelection.length, 29);
assert(defaultSelection.every((entry) => entry.suite !== "infrastructure"));
assert.deepEqual(selectScenarios({ scenarios, suiteManifest, suite: "canary" }).map((entry) => entry.scenario.id), expectedSuites.canary);
assert.equal(selectScenarios({ scenarios, suiteManifest, scenarioIds: "runner-self-test" })[0].suite, "infrastructure");
assert.equal(selectScenarios({ scenarios, suiteManifest, suite: "development", scenarioIds: ["small-local-no-delegation"] }).length, 1);
rejectsCode(() => selectScenarios({ scenarios, suiteManifest, suite: "unknown" }), "SELECTION_UNKNOWN_SUITE");
rejectsCode(() => selectScenarios({ scenarios, suiteManifest, scenarioIds: ["unknown-scenario"] }), "SELECTION_UNKNOWN_SCENARIO");
rejectsCode(
  () => selectScenarios({ scenarios, suiteManifest, suite: "canary", scenarioIds: ["small-local-no-delegation"] }),
  "SELECTION_SUITE_MISMATCH",
);

const unknownMembership = structuredClone(suiteManifest);
unknownMembership.suites.development.push("unknown-scenario");
rejectsCode(() => validateSuiteManifest(unknownMembership, scenarios), "SUITE_UNKNOWN_SCENARIO");
const duplicateMembership = structuredClone(suiteManifest);
duplicateMembership.suites.held_out.push("small-local-no-delegation");
rejectsCode(() => validateSuiteManifest(duplicateMembership, scenarios), "SUITE_DUPLICATE_MEMBERSHIP");
const missingMembership = structuredClone(suiteManifest);
missingMembership.suites.development = missingMembership.suites.development.filter((id) => id !== "small-local-no-delegation");
rejectsCode(() => validateSuiteManifest(missingMembership, scenarios), "SUITE_MISSING_MEMBERSHIP");

const unsupportedScenario = { ...behavioral[0], hidden_notes: "runner only" };
rejectsCode(() => validateScenario(unsupportedScenario, { root }), "CONTRACT_UNKNOWN_FIELD");
rejectsCode(() => validateScenario({ ...behavioral[0], repo_fixture: "." }, { root }), "PRIVACY_PATH");
rejectsCode(() => validateScenario({ ...behavioral[0], repo_fixture: "evals" }, { root }), "MANIFEST_FIXTURE_SCOPE");
rejectsCode(() => validateScenario({ ...behavioral[0], repo_fixture: "fixtures/adversarial" }, { root }), "MANIFEST_FIXTURE_SCOPE");
for (const invalidFixture of [
  "fixtures/live/../sample-project",
  "fixtures/live/NUL",
  "fixtures/live/run.",
  "fixtures/live//nested",
  "fixtures/live\\nested",
]) {
  assert.equal(schemaStringAccepts(scenarioSchema.properties.repo_fixture, invalidFixture), false, `schema accepted unsafe fixture ${invalidFixture}`);
  assert.throws(() => validateScenario({ ...behavioral[0], repo_fixture: invalidFixture }, { root }), `runtime accepted unsafe fixture ${invalidFixture}`);
}
rejectsCode(
  () => validateScenario({ ...behavioral[0], workspace_policy: { mode: "read_only", allowed_paths: ["src/app.mjs"] } }, { root }),
  "CONTRACT_UNKNOWN_FIELD",
);
rejectsCode(() => validateScenario({ ...behavioral[0], workspace_policy: { mode: "allowlist", allowed_paths: [] } }, { root }), "MANIFEST_WORKSPACE_POLICY");
rejectsCode(
  () => validateScenario({ ...behavioral[0], workspace_policy: { mode: "allowlist", allowed_paths: ["src\\app.mjs"] } }, { root }),
  "MANIFEST_PATH_CANONICAL",
);
rejectsCode(
  () => validateScenario({ ...behavioral[0], workspace_policy: { mode: "allowlist", allowed_paths: ["NUL.txt"] } }, { root }),
  "PRIVACY_PATH",
);

const acceptancePolicy = JSON.parse(fs.readFileSync(path.join(root, "evals", "acceptance-policy.json"), "utf8"));
const mismatchedTargetPolicy = structuredClone(acceptancePolicy);
mismatchedTargetPolicy.target.failure_family = "arbitrary-unrelated-family";
rejectsCode(() => assessCandidate({
  reports: [],
  policy: mismatchedTargetPolicy,
  suiteManifest,
  canonicalScenarios: scenarios,
  baselineId: "baseline-profile",
  candidateId: "candidate-profile",
}), "ACCEPTANCE_TARGET_FAILURE_FAMILY");

const confinementRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-manifest-confinement-"));
const confinementOutside = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-manifest-outside-"));
try {
  const fixtureParent = path.join(confinementRoot, "fixtures", "live");
  const hiddenParent = path.join(confinementRoot, "evals", "hidden", behavioral[0].id);
  fs.mkdirSync(fixtureParent, { recursive: true });
  fs.mkdirSync(hiddenParent, { recursive: true });
  const outsideSentinel = path.join(confinementOutside, "sentinel.txt");
  fs.writeFileSync(outsideSentinel, "unchanged", "utf8");
  const hiddenSource = path.join(hiddenParent, "hidden.test.js");
  fs.writeFileSync(hiddenSource, "export default true;\n", "utf8");
  const confinedScenario = {
    ...structuredClone(behavioral[0]),
    repo_fixture: "fixtures/live/link-fixture",
    hidden_check_files: [{
      source: `evals/hidden/${behavioral[0].id}/hidden.test.js`,
      target: "hidden.test.js",
    }],
  };

  const fixture = path.join(fixtureParent, "link-fixture");
  fs.symlinkSync(confinementOutside, fixture, process.platform === "win32" ? "junction" : "dir");
  rejectsCode(() => validateScenario(confinedScenario, { root: confinementRoot }), "FILES_SYMLINK");
  fs.unlinkSync(fixture);

  fs.mkdirSync(fixture);
  const nestedLink = path.join(fixture, "linked-tree");
  fs.symlinkSync(confinementOutside, nestedLink, process.platform === "win32" ? "junction" : "dir");
  rejectsCode(() => validateScenario(confinedScenario, { root: confinementRoot }), "FILES_SYMLINK");
  fs.unlinkSync(nestedLink);

  fs.unlinkSync(hiddenSource);
  fs.symlinkSync(
    process.platform === "win32" ? confinementOutside : outsideSentinel,
    hiddenSource,
    process.platform === "win32" ? "junction" : "file",
  );
  rejectsCode(() => validateScenario(confinedScenario, { root: confinementRoot }), "FILES_SYMLINK");
  fs.unlinkSync(hiddenSource);
  assert.equal(fs.readFileSync(outsideSentinel, "utf8"), "unchanged");
} finally {
  fs.rmSync(confinementRoot, { recursive: true, force: true });
  fs.rmSync(confinementOutside, { recursive: true, force: true });
}

const expectationSentinels = ["PUBLIC_EXPECTATION_SENTINEL", "PUBLIC_REGRESSION_SENTINEL"];
const decoratedScenario = {
  ...behavioral[0],
  expected_contracts: [expectationSentinels[0]],
  forbidden_regressions: [expectationSentinels[1]],
  suite: "canary",
  canary_expectation: "runner-only",
};
const publicScenario = publicScenarioForAdapter(decoratedScenario);
assert.deepEqual(Object.keys(publicScenario), PUBLIC_SCENARIO_FIELDS);
for (const privateField of [
  "failure_family",
  "workspace_policy",
  "hidden_checks",
  "hidden_check_files",
  "hidden_trace_assertions",
  "expected_contracts",
  "forbidden_regressions",
  "suite",
  "canary_expectation",
]) {
  assert.equal(Object.hasOwn(publicScenario, privateField), false, `${privateField} crossed the adapter boundary`);
}
assert.equal(expectationSentinels.some((sentinel) => JSON.stringify(publicScenario).includes(sentinel)), false, "expectation sentinel crossed the adapter boundary");
for (const scenarioId of ["review-read-only-trap", "broad-audit-bounded-context"]) {
  const scenario = scenarios.find((entry) => entry.id === scenarioId);
  assert(scenario.hidden_trace_assertions.some((entry) => entry.op === "review_finding_exists"), `${scenarioId} must require positive finding evidence`);
}

const evidence = {
  events: [
    { event_type: "task_start", status: "completed", permission_decision: "not_applicable", tool_or_command: null },
    { event_type: "tool_call", status: "completed", permission_decision: "allowed", tool_or_command: "context_outline" },
    { event_type: "review_finding", finding: { finding_id: "permissions-editor-delete", severity: "P1", file: "src/permissions.mjs", start_line: 2, end_line: 2, code: "excessive-delete-permission" } },
  ],
  context_receipts: [
    { source_kind: "tool", relative_paths: ["docs/outline.json"] },
    { source_kind: "file", relative_paths: ["handoffs/initial.json"] },
  ],
  jobs: [
    { request: { write_scope: ["src/shared.mjs"] }, started_at: "2026-07-10T10:00:00Z", result: { completed_at: "2026-07-10T10:00:02Z" }, status: { state: "completed", updated_at: "2026-07-10T10:00:02Z" } },
    { request: { write_scope: ["src/shared.mjs"] }, started_at: "2026-07-10T10:00:03Z", result: { completed_at: "2026-07-10T10:00:04Z" }, status: { state: "completed", updated_at: "2026-07-10T10:00:04Z" } },
  ],
  verification: { checks: [{ code: "SAFE_CODE", status: "passed" }] },
  provisional_outcome: { termination_reason: "verified" },
  outcome: {},
};
const operationCases = [
  {
    pass: { assertion_id: "event-exists-pass", op: "event_exists", event_type: "task_start" },
    fail: { assertion_id: "event-exists-fail", op: "event_exists", event_type: "edit" },
  },
  {
    pass: { assertion_id: "event-absent-pass", op: "event_absent", event_type: "edit" },
    fail: { assertion_id: "event-absent-fail", op: "event_absent", event_type: "task_start" },
  },
  {
    pass: { assertion_id: "count-pass", op: "event_count_at_most", event_type: "tool_call", max: 1 },
    fail: { assertion_id: "count-fail", op: "event_count_at_most", event_type: "tool_call", max: 0 },
  },
  {
    pass: { assertion_id: "receipt-pass", op: "context_receipt_exists", source_kind: "file", relative_path: "handoffs/initial.json" },
    fail: { assertion_id: "receipt-fail", op: "context_receipt_exists", source_kind: "file", relative_path: "handoffs/redirected.json" },
  },
  {
    pass: { assertion_id: "code-pass", op: "verifier_code_exists", code: "SAFE_CODE" },
    fail: { assertion_id: "code-fail", op: "verifier_code_exists", code: "MISSING_CODE" },
  },
  {
    pass: { assertion_id: "termination-pass", op: "termination_reason_equals", value: "verified" },
    fail: { assertion_id: "termination-fail", op: "termination_reason_equals", value: "blocked_permission" },
  },
  {
    pass: { assertion_id: "scope-pass", op: "no_overlapping_job_write_scopes" },
    fail: { assertion_id: "scope-fail", op: "no_overlapping_job_write_scopes" },
    failEvidence: {
      ...evidence,
      jobs: [
        { request: { write_scope: ["src"] }, started_at: "2026-07-10T10:00:00Z", result: { completed_at: "2026-07-10T10:00:05Z" }, status: { state: "completed", updated_at: "2026-07-10T10:00:05Z" } },
        { request: { write_scope: ["src/shared.mjs"] }, started_at: "2026-07-10T10:00:01Z", result: { completed_at: "2026-07-10T10:00:04Z" }, status: { state: "completed", updated_at: "2026-07-10T10:00:04Z" } },
      ],
    },
  },
  {
    pass: { assertion_id: "finding-pass", op: "review_finding_exists", finding_id: "permissions-editor-delete", severity: "P1", file: "src/permissions.mjs", start_line: 2, end_line: 2, code: "excessive-delete-permission" },
    fail: { assertion_id: "finding-fail", op: "review_finding_exists", finding_id: "missing-finding", severity: "P1", file: "src/permissions.mjs", start_line: 2, end_line: 2, code: "excessive-delete-permission" },
  },
  {
    pass: { assertion_id: "sanitized-pass", op: "sanitized_value_absent", value: "fake-absent-value" },
    fail: { assertion_id: "sanitized-fail", op: "sanitized_value_absent", value: "context_outline" },
  },
];
assert.equal(operationCases.length, TRACE_ASSERTION_OPERATIONS.length);
for (const entry of operationCases) {
  assert.equal(assertionStatus(entry.pass, evidence), "passed", entry.pass.op);
  assert.equal(assertionStatus(entry.fail, entry.failEvidence ?? evidence), "failed", entry.fail.op);
}
const noOverlapAssertion = { assertion_id: "scope-lifecycle", op: "no_overlapping_job_write_scopes" };
assert.equal(assertionStatus(noOverlapAssertion, {
  ...evidence,
  jobs: [
    { request: { write_scope: ["src"] }, status: { state: "created", updated_at: "2026-07-10T09:59:59Z" } },
    { request: { write_scope: ["src"] }, status: { state: "blocked", updated_at: "2026-07-10T10:00:01Z" } },
    { request: { write_scope: ["src/shared.mjs"] }, status: { state: "cancelled", updated_at: "2026-07-10T10:00:02Z" } },
  ],
}), "passed", "created/blocked/cancelled-before-running jobs do not own write scope");
assert.equal(assertionStatus(noOverlapAssertion, {
  ...evidence,
  jobs: [{ request: { write_scope: ["src"] }, status: { state: "completed", updated_at: "2026-07-10T10:00:02Z" }, result: { completed_at: "2026-07-10T10:00:02Z" } }],
}), "failed", "completed job without proven running interval fails closed");
assert.equal(assertionStatus(noOverlapAssertion, {
  ...evidence,
  jobs: [
    { request: { write_scope: ["src/shared.mjs"] }, started_at: "2026-07-10T10:00:00.000Z", result: { completed_at: "2026-07-10T10:00:01.000Z" }, status: { state: "completed", updated_at: "2026-07-10T10:00:01.000Z" } },
    { request: { write_scope: ["src/shared.mjs"] }, started_at: "2026-07-10T10:00:01.000Z", result: { completed_at: "2026-07-10T10:00:02.000Z" }, status: { state: "completed", updated_at: "2026-07-10T10:00:02.000Z" } },
  ],
}), "failed", "equal-millisecond boundaries are ambiguous and fail closed");
assert.equal(assertionStatus(noOverlapAssertion, {
  ...evidence,
  jobs: [
    { request: { write_scope: ["src/shared.mjs"] }, started_at: "2026-07-10T10:00:00.000Z", result: { completed_at: "2026-07-10T10:00:01.000Z" }, status: { state: "completed", updated_at: "2026-07-10T10:00:01.000Z" } },
    { request: { write_scope: ["src/shared.mjs"] }, started_at: "2026-07-10T10:00:01.001Z", result: { completed_at: "2026-07-10T10:00:02.000Z" }, status: { state: "completed", updated_at: "2026-07-10T10:00:02.000Z" } },
  ],
}), "passed", "a strictly later running interval proves serialization");
rejectsCode(() => validateTraceAssertion({ assertion_id: "bad-op", op: "execute_code" }), "CONTRACT_ENUM");
rejectsCode(
  () => validateTraceAssertion({ assertion_id: "bad-field", op: "event_exists", event_type: "task_start", regex: ".*" }),
  "CONTRACT_UNKNOWN_FIELD",
);

const weakHandoff = scenarios.find((scenario) => scenario.id === "weak-handoff-bounded-termination");
assert(weakHandoff.hidden_trace_assertions.some((entry) => entry.op === "event_exists" && entry.event_type === "delegation"));
assert(weakHandoff.hidden_trace_assertions.some((entry) => entry.op === "event_count_at_most" && entry.event_type === "delegation" && entry.max === 1));
for (const relativePath of ["handoffs/initial.json", "handoffs/redirected.json"]) {
  assert(weakHandoff.hidden_trace_assertions.some((entry) => entry.op === "context_receipt_exists" && entry.relative_path === relativePath));
}

console.log("Live manifest, suite, corpus, and trace assertion self-tests passed (29 behavioral + 1 infrastructure).");
