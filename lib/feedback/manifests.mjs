import fs from "node:fs";
import path from "node:path";
import {
  ContractError,
  PERMISSION_DECISIONS,
  RISK_LEVELS,
  TERMINATION_REASONS,
  TRACE_STATUSES,
  assertExactKeys,
  assertPlainObject,
  assertSafeId,
} from "./contracts.mjs";
import {
  assertConfinedExistingPath,
  assertConfinedTree,
  isInside,
} from "./files.mjs";
import { normalizeRelativePath } from "./privacy.mjs";
import { validateTraceAssertions } from "./trace-assertions.mjs";

export const SCENARIO_FIELDS = Object.freeze([
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

export const PUBLIC_SCENARIO_FIELDS = Object.freeze([
  "id",
  "description",
  "risk_tags",
  "repo_fixture",
  "task",
  "setup_commands",
  "visible_checks",
  "timeout",
  "repetitions",
]);

export const SUITE_NAMES = Object.freeze(["development", "held_out", "canary", "infrastructure"]);
export const BEHAVIORAL_SUITE_NAMES = Object.freeze(["development", "held_out", "canary"]);
export const SUITE_SCHEMA_VERSION = 1;

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const ID_SCHEMA_PATTERN = "^(?!(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\.|$))(?!.*\\.$)[a-z0-9][a-z0-9._-]{0,127}$";
const PORTABLE_RELATIVE_PATH_SCHEMA_PATTERN = "^(?![/.])(?!.*//)(?!.*(?:^|/)(?:\\.|\\.\\.)(?:/|$))(?!.*(?:^|/)(?:[Cc][Oo][Nn]|[Pp][Rr][Nn]|[Aa][Uu][Xx]|[Nn][Uu][Ll]|[Cc][Oo][Mm][1-9]|[Ll][Pp][Tt][1-9])(?:\\.[^/]*)?(?:/|$))(?!.*[. ](?:/|$))(?!.*:)[^\\\\]+$";
const RUNNER_SELF_TEST_ID = "runner-self-test";

export function scenarioJsonSchema() {
  const id = { type: "string", pattern: ID_SCHEMA_PATTERN };
  const nonEmptyString = { type: "string", minLength: 1, maxLength: 1000 };
  const assertionString = { type: "string", minLength: 1, maxLength: 256 };
  const portableRelativePath = {
    type: "string",
    minLength: 1,
    maxLength: 2000,
    pattern: PORTABLE_RELATIVE_PATH_SCHEMA_PATTERN,
  };
  const eventAssertion = {
    type: "object",
    required: ["assertion_id", "op"],
    properties: {
      assertion_id: { $ref: "#/$defs/id" },
      op: { enum: ["event_exists", "event_absent"] },
      event_type: { $ref: "#/$defs/assertionString" },
      tool_or_command: { $ref: "#/$defs/assertionString" },
      permission_decision: { enum: [...PERMISSION_DECISIONS] },
      status: { enum: [...TRACE_STATUSES] },
    },
    anyOf: [
      { required: ["event_type"] },
      { required: ["tool_or_command"] },
      { required: ["permission_decision"] },
      { required: ["status"] },
    ],
    additionalProperties: false,
  };
  const traceAssertion = {
    oneOf: [
      { $ref: "#/$defs/eventAssertion" },
      {
        type: "object",
        required: ["assertion_id", "op", "event_type", "max"],
        properties: {
          assertion_id: { $ref: "#/$defs/id" },
          op: { const: "event_count_at_most" },
          event_type: { $ref: "#/$defs/assertionString" },
          max: { type: "integer", minimum: 0, maximum: 1000 },
        },
        additionalProperties: false,
      },
      {
        type: "object",
        required: ["assertion_id", "op", "source_kind"],
        properties: {
          assertion_id: { $ref: "#/$defs/id" },
          op: { const: "context_receipt_exists" },
          source_kind: { enum: ["file", "files", "repository", "tool", "other"] },
          relative_path: { $ref: "#/$defs/portableRelativePath" },
        },
        additionalProperties: false,
      },
      {
        type: "object",
        required: ["assertion_id", "op", "code"],
        properties: {
          assertion_id: { $ref: "#/$defs/id" },
          op: { const: "verifier_code_exists" },
          code: { $ref: "#/$defs/id" },
        },
        additionalProperties: false,
      },
      {
        type: "object",
        required: ["assertion_id", "op", "value"],
        properties: {
          assertion_id: { $ref: "#/$defs/id" },
          op: { const: "termination_reason_equals" },
          value: { enum: [...TERMINATION_REASONS] },
        },
        additionalProperties: false,
      },
      {
        type: "object",
        required: ["assertion_id", "op"],
        properties: {
          assertion_id: { $ref: "#/$defs/id" },
          op: { const: "no_overlapping_job_write_scopes" },
        },
        additionalProperties: false,
      },
      {
        type: "object",
        required: ["assertion_id", "op", "finding_id", "severity", "file", "start_line", "end_line", "code"],
        properties: {
          assertion_id: { $ref: "#/$defs/id" },
          op: { const: "review_finding_exists" },
          finding_id: { $ref: "#/$defs/id" },
          severity: { enum: ["P0", "P1", "P2", "P3"] },
          file: { $ref: "#/$defs/portableRelativePath" },
          start_line: { type: "integer", minimum: 1 },
          end_line: { type: "integer", minimum: 1 },
          code: { $ref: "#/$defs/id" },
        },
        additionalProperties: false,
      },
      {
        type: "object",
        required: ["assertion_id", "op", "value"],
        properties: {
          assertion_id: { $ref: "#/$defs/id" },
          op: { const: "sanitized_value_absent" },
          value: { type: "string", minLength: 1, maxLength: 200 },
        },
        additionalProperties: false,
      },
    ],
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "OpenCode harness live-evaluation scenario",
    type: "object",
    required: [...SCENARIO_FIELDS],
    properties: {
      id: { $ref: "#/$defs/id" },
      description: { type: "string", minLength: 1, maxLength: 2000 },
      risk_tags: {
        type: "array",
        items: { $ref: "#/$defs/nonEmptyString" },
        minItems: 2,
        maxItems: 10,
        uniqueItems: true,
        contains: { enum: [...RISK_LEVELS] },
        minContains: 1,
        maxContains: 1,
      },
      failure_family: { $ref: "#/$defs/id" },
      workspace_policy: { $ref: "#/$defs/workspacePolicy" },
      repo_fixture: {
        allOf: [
          { $ref: "#/$defs/portableRelativePath" },
          {
            type: "string",
            pattern: "^(?:fixtures/sample-project|fixtures/live/[^/]+(?:/[^/]+)*)$",
          },
        ],
      },
      task: { type: "string", minLength: 1, maxLength: 4000 },
      setup_commands: { ...structuredClone({ $ref: "#/$defs/stringArray" }), maxItems: 10 },
      visible_checks: { ...structuredClone({ $ref: "#/$defs/stringArray" }), maxItems: 20 },
      hidden_checks: { ...structuredClone({ $ref: "#/$defs/stringArray" }), minItems: 1, maxItems: 20 },
      hidden_check_files: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        uniqueItems: true,
        items: {
          type: "object",
          required: ["source", "target"],
          properties: {
            source: { $ref: "#/$defs/portableRelativePath" },
            target: { $ref: "#/$defs/portableRelativePath" },
          },
          additionalProperties: false,
        },
      },
      hidden_trace_assertions: {
        type: "array",
        minItems: 1,
        maxItems: 50,
        items: { $ref: "#/$defs/traceAssertion" },
      },
      timeout: { type: "integer", minimum: 1000, maximum: 300000 },
      repetitions: { type: "integer", minimum: 1, maximum: 5 },
      expected_contracts: { ...structuredClone({ $ref: "#/$defs/stringArray" }), minItems: 1, maxItems: 20 },
      forbidden_regressions: { ...structuredClone({ $ref: "#/$defs/stringArray" }), minItems: 1, maxItems: 20 },
    },
    $defs: {
      id,
      nonEmptyString,
      assertionString,
      portableRelativePath,
      stringArray: {
        type: "array",
        items: { $ref: "#/$defs/nonEmptyString" },
        maxItems: 50,
        uniqueItems: true,
      },
      workspacePolicy: {
        oneOf: [
          {
            type: "object",
            required: ["mode"],
            properties: { mode: { const: "read_only" } },
            additionalProperties: false,
          },
          {
            type: "object",
            required: ["mode", "allowed_paths"],
            properties: {
              mode: { const: "allowlist" },
              allowed_paths: {
                type: "array",
                minItems: 1,
                maxItems: 50,
                uniqueItems: true,
                items: { $ref: "#/$defs/portableRelativePath" },
              },
            },
            additionalProperties: false,
          },
        ],
      },
      eventAssertion,
      traceAssertion,
    },
    additionalProperties: false,
  };
}

export function suiteJsonSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "OpenCode harness live-evaluation suite manifest",
    type: "object",
    required: ["schema_version", "manifest_version", "suites"],
    properties: {
      schema_version: { const: SUITE_SCHEMA_VERSION },
      manifest_version: { $ref: "#/$defs/id", maxLength: 32 },
      suites: {
        type: "object",
        required: [...SUITE_NAMES],
        properties: Object.fromEntries(SUITE_NAMES.map((name) => [name, { $ref: "#/$defs/scenarioIds" }])),
        additionalProperties: false,
      },
    },
    $defs: {
      id: { type: "string", pattern: ID_SCHEMA_PATTERN },
      scenarioIds: {
        type: "array",
        items: { $ref: "#/$defs/id" },
        minItems: 1,
        maxItems: 100,
        uniqueItems: true,
      },
    },
    additionalProperties: false,
  };
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new ContractError("MANIFEST_JSON", `${label} is not valid JSON: ${error.message}`);
  }
}

function assertId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new ContractError("MANIFEST_ID", `${label} must be a lowercase filename-safe identifier`);
  }
  assertSafeId(value, label);
  return value;
}

function assertString(value, label, { maxLength = 2000 } = {}) {
  if (typeof value !== "string" || value.trim() === "" || value.length > maxLength) {
    throw new ContractError("MANIFEST_STRING", `${label} must be a non-empty string of at most ${maxLength} characters`);
  }
  return value;
}

function assertStringArray(value, label, { min = 0, max = 50 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ContractError("MANIFEST_ARRAY", `${label} must contain between ${min} and ${max} strings`);
  }
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    assertString(item, `${label}[${index}]`, { maxLength: 1000 });
    if (seen.has(item)) throw new ContractError("MANIFEST_DUPLICATE", `${label} contains duplicate value ${item}`);
    seen.add(item);
  }
  return value;
}

function resolveCheckedInPath(root, relativePath, label) {
  const normalized = normalizeRelativePath(relativePath, label);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...normalized.split("/"));
  if (!isInside(resolvedRoot, resolved)) throw new ContractError("MANIFEST_PATH", `${label} escapes the repository root`);
  return { normalized, resolved };
}

function validateRepoFixture(root, repoFixture, label) {
  assertString(repoFixture, label, { maxLength: 2000 });
  const { normalized, resolved } = resolveCheckedInPath(root, repoFixture, label);
  if (repoFixture !== normalized) {
    throw new ContractError("MANIFEST_PATH_CANONICAL", `${label} must use canonical forward-slash relative syntax`);
  }
  if (normalized !== "fixtures/sample-project" && !/^fixtures\/live\/[^/]+(?:\/.*)?$/.test(normalized)) {
    throw new ContractError("MANIFEST_FIXTURE_SCOPE", `${label} must be fixtures/sample-project or fixtures/live/<name>`);
  }
  try {
    assertConfinedTree(root, resolved);
  } catch (error) {
    if (error?.code === "FILES_MISSING" || error?.code === "FILES_TYPE") {
      throw new ContractError("MANIFEST_FIXTURE_MISSING", `${label} does not name an existing fixture directory`);
    }
    throw error;
  }
  return { normalized, resolved };
}

function validateWorkspacePolicy(policy, label) {
  assertPlainObject(policy, label);
  if (policy.mode === "read_only") {
    assertExactKeys(policy, { allowed: ["mode"], required: ["mode"] }, label);
    return structuredClone(policy);
  }
  if (policy.mode !== "allowlist") {
    throw new ContractError("MANIFEST_WORKSPACE_POLICY", `${label}.mode must be read_only or allowlist`);
  }
  assertExactKeys(policy, {
    allowed: ["mode", "allowed_paths"],
    required: ["mode", "allowed_paths"],
  }, label);
  if (!Array.isArray(policy.allowed_paths) || policy.allowed_paths.length === 0 || policy.allowed_paths.length > 50) {
    throw new ContractError("MANIFEST_WORKSPACE_POLICY", `${label}.allowed_paths must contain between 1 and 50 exact relative paths`);
  }
  const seen = new Set();
  for (const [index, value] of policy.allowed_paths.entries()) {
    const pathLabel = `${label}.allowed_paths[${index}]`;
    assertString(value, pathLabel, { maxLength: 2000 });
    const normalized = normalizeRelativePath(value, pathLabel);
    if (value !== normalized) {
      throw new ContractError("MANIFEST_PATH_CANONICAL", `${pathLabel} must use canonical forward-slash relative syntax`);
    }
    if (seen.has(normalized)) {
      throw new ContractError("MANIFEST_DUPLICATE", `${label}.allowed_paths contains duplicate value ${normalized}`);
    }
    seen.add(normalized);
  }
  return structuredClone(policy);
}

function validateHiddenFiles(root, scenario, fixturePath, label) {
  if (!Array.isArray(scenario.hidden_check_files) || scenario.hidden_check_files.length === 0 || scenario.hidden_check_files.length > 20) {
    throw new ContractError("MANIFEST_HIDDEN_FILES", `${label}.hidden_check_files must contain between 1 and 20 entries`);
  }
  const sources = new Set();
  const targets = new Set();
  for (const [index, entry] of scenario.hidden_check_files.entries()) {
    const entryLabel = `${label}.hidden_check_files[${index}]`;
    assertExactKeys(entry, { allowed: ["source", "target"], required: ["source", "target"] }, entryLabel);
    assertString(entry.source, `${entryLabel}.source`);
    assertString(entry.target, `${entryLabel}.target`);
    const source = resolveCheckedInPath(root, entry.source, `${entryLabel}.source`);
    const target = normalizeRelativePath(entry.target, `${entryLabel}.target`);
    if (entry.source !== source.normalized || entry.target !== target) {
      throw new ContractError("MANIFEST_PATH_CANONICAL", `${entryLabel} paths must use canonical forward-slash relative syntax`);
    }
    const expectedPrefix = `evals/hidden/${scenario.id}/`;
    if (!source.normalized.startsWith(expectedPrefix)) {
      throw new ContractError("MANIFEST_HIDDEN_SCOPE", `${entryLabel}.source must be unique runner-owned data under ${expectedPrefix}`);
    }
    try {
      assertConfinedExistingPath(root, source.resolved, { type: "file" });
    } catch (error) {
      if (error?.code === "FILES_MISSING" || error?.code === "FILES_TYPE") {
        throw new ContractError("MANIFEST_HIDDEN_MISSING", `${entryLabel}.source must be an existing file`);
      }
      throw error;
    }
    if (isInside(fixturePath, source.resolved)) {
      throw new ContractError("MANIFEST_HIDDEN_PUBLIC", `${entryLabel}.source must stay outside repo_fixture`);
    }
    if (sources.has(source.normalized) || targets.has(target)) {
      throw new ContractError("MANIFEST_HIDDEN_DUPLICATE", `${entryLabel} duplicates a hidden source or target`);
    }
    sources.add(source.normalized);
    targets.add(target);
  }
}

export function validateScenario(scenario, { root, sourcePath = null } = {}) {
  if (typeof root !== "string" || root.trim() === "") throw new ContractError("MANIFEST_ROOT", "root is required");
  const label = sourcePath ? path.relative(root, sourcePath).replaceAll("\\", "/") : "scenario";
  assertExactKeys(scenario, { allowed: SCENARIO_FIELDS, required: SCENARIO_FIELDS }, label);
  assertId(scenario.id, `${label}.id`);
  if (sourcePath && path.basename(sourcePath, ".json") !== scenario.id) {
    throw new ContractError("MANIFEST_FILENAME", `${label} filename must match scenario id ${scenario.id}`);
  }
  assertString(scenario.description, `${label}.description`);
  assertStringArray(scenario.risk_tags, `${label}.risk_tags`, { min: 2, max: 10 });
  const riskLevels = scenario.risk_tags.filter((tag) => RISK_LEVELS.includes(tag));
  if (riskLevels.length !== 1) throw new ContractError("MANIFEST_RISK", `${label}.risk_tags must contain exactly one standard/high/critical tag`);
  assertId(scenario.failure_family, `${label}.failure_family`);
  validateWorkspacePolicy(scenario.workspace_policy, `${label}.workspace_policy`);
  const fixture = validateRepoFixture(root, scenario.repo_fixture, `${label}.repo_fixture`);
  assertString(scenario.task, `${label}.task`, { maxLength: 4000 });
  assertStringArray(scenario.setup_commands, `${label}.setup_commands`, { max: 10 });
  assertStringArray(scenario.visible_checks, `${label}.visible_checks`, { max: 20 });
  assertStringArray(scenario.hidden_checks, `${label}.hidden_checks`, { min: 1, max: 20 });
  validateHiddenFiles(root, scenario, fixture.resolved, label);
  validateTraceAssertions(scenario.hidden_trace_assertions, `${label}.hidden_trace_assertions`);
  if (!Number.isInteger(scenario.timeout) || scenario.timeout < 1000 || scenario.timeout > 300000) {
    throw new ContractError("MANIFEST_TIMEOUT", `${label}.timeout must be an integer from 1000 through 300000`);
  }
  if (!Number.isInteger(scenario.repetitions) || scenario.repetitions < 1 || scenario.repetitions > 5) {
    throw new ContractError("MANIFEST_REPETITIONS", `${label}.repetitions must be an integer from 1 through 5`);
  }
  assertStringArray(scenario.expected_contracts, `${label}.expected_contracts`, { min: 1, max: 20 });
  assertStringArray(scenario.forbidden_regressions, `${label}.forbidden_regressions`, { min: 1, max: 20 });
  return structuredClone(scenario);
}

function scenarioMap(scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new ContractError("MANIFEST_SCENARIOS", "scenarios must be a non-empty array");
  }
  const map = new Map();
  for (const scenario of scenarios) {
    if (map.has(scenario.id)) throw new ContractError("MANIFEST_DUPLICATE_ID", `duplicate scenario id ${scenario.id}`);
    map.set(scenario.id, scenario);
  }
  return map;
}

export function validateSuiteManifest(manifest, scenarios) {
  assertExactKeys(manifest, {
    allowed: ["schema_version", "manifest_version", "suites"],
    required: ["schema_version", "manifest_version", "suites"],
  }, "suite_manifest");
  if (manifest.schema_version !== SUITE_SCHEMA_VERSION) {
    throw new ContractError("SUITE_SCHEMA_VERSION", `suite_manifest.schema_version must be ${SUITE_SCHEMA_VERSION}`);
  }
  assertString(manifest.manifest_version, "suite_manifest.manifest_version", { maxLength: 32 });
  assertId(manifest.manifest_version, "suite_manifest.manifest_version");
  assertExactKeys(manifest.suites, { allowed: SUITE_NAMES, required: SUITE_NAMES }, "suite_manifest.suites");
  const scenariosById = scenarioMap(scenarios);
  const membership = new Map();
  for (const suite of SUITE_NAMES) {
    assertStringArray(manifest.suites[suite], `suite_manifest.suites.${suite}`, { min: 1, max: 100 });
    for (const id of manifest.suites[suite]) {
      assertId(id, `suite_manifest.suites.${suite}`);
      if (!scenariosById.has(id)) throw new ContractError("SUITE_UNKNOWN_SCENARIO", `${suite} references unknown scenario ${id}`);
      if (membership.has(id)) throw new ContractError("SUITE_DUPLICATE_MEMBERSHIP", `${id} belongs to both ${membership.get(id)} and ${suite}`);
      membership.set(id, suite);
    }
  }
  if (manifest.suites.infrastructure.length !== 1 || manifest.suites.infrastructure[0] !== RUNNER_SELF_TEST_ID) {
    throw new ContractError("SUITE_INFRASTRUCTURE", `infrastructure must contain only ${RUNNER_SELF_TEST_ID}`);
  }
  for (const scenario of scenarios) {
    const suite = membership.get(scenario.id);
    if (!suite) throw new ContractError("SUITE_MISSING_MEMBERSHIP", `${scenario.id} is missing suite membership`);
    if (scenario.id === RUNNER_SELF_TEST_ID) {
      if (suite !== "infrastructure") throw new ContractError("SUITE_INFRASTRUCTURE", `${RUNNER_SELF_TEST_ID} must be infrastructure`);
    } else if (!BEHAVIORAL_SUITE_NAMES.includes(suite)) {
      throw new ContractError("SUITE_BEHAVIORAL", `${scenario.id} must belong to exactly one behavioral suite`);
    }
  }
  return structuredClone(manifest);
}

export function suiteForScenario(suiteManifest, scenarioId) {
  for (const suite of SUITE_NAMES) {
    if (suiteManifest.suites[suite].includes(scenarioId)) return suite;
  }
  return null;
}

export function publicScenarioForAdapter(scenario) {
  assertPlainObject(scenario, "scenario");
  const result = {};
  for (const field of PUBLIC_SCENARIO_FIELDS) {
    if (Object.hasOwn(scenario, field)) result[field] = structuredClone(scenario[field]);
  }
  return result;
}

export function selectScenarios({ scenarios, suiteManifest, suite = null, scenarioIds = [] } = {}) {
  const scenariosById = scenarioMap(scenarios);
  validateSuiteManifest(suiteManifest, scenarios);
  if (suite !== null && !SUITE_NAMES.includes(suite)) throw new ContractError("SELECTION_UNKNOWN_SUITE", `unknown suite ${suite}`);
  const requestedIds = typeof scenarioIds === "string" ? [scenarioIds] : scenarioIds;
  if (!Array.isArray(requestedIds)) throw new ContractError("SELECTION_SCENARIOS", "scenarioIds must be an array or string");
  const uniqueRequested = [];
  for (const id of requestedIds) {
    assertId(id, "scenario selection");
    if (!scenariosById.has(id)) throw new ContractError("SELECTION_UNKNOWN_SCENARIO", `unknown scenario ${id}`);
    if (!uniqueRequested.includes(id)) uniqueRequested.push(id);
  }

  let selectedIds;
  if (suite !== null) selectedIds = [...suiteManifest.suites[suite]];
  else if (uniqueRequested.length > 0) selectedIds = uniqueRequested;
  else selectedIds = BEHAVIORAL_SUITE_NAMES.flatMap((name) => suiteManifest.suites[name]);

  if (suite !== null && uniqueRequested.length > 0) {
    for (const id of uniqueRequested) {
      if (!selectedIds.includes(id)) throw new ContractError("SELECTION_SUITE_MISMATCH", `${id} does not belong to suite ${suite}`);
    }
    selectedIds = uniqueRequested;
  }
  return selectedIds.map((id) => ({ scenario: scenariosById.get(id), suite: suiteForScenario(suiteManifest, id) }));
}

export function loadScenarioCorpus({ root } = {}) {
  if (typeof root !== "string" || root.trim() === "") throw new ContractError("MANIFEST_ROOT", "root is required");
  const scenarioDirectory = path.join(root, "evals", "scenarios");
  if (!fs.existsSync(scenarioDirectory)) throw new ContractError("MANIFEST_DIRECTORY", "evals/scenarios is missing");
  const files = fs.readdirSync(scenarioDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(scenarioDirectory, name));
  if (files.length === 0) throw new ContractError("MANIFEST_EMPTY", "no scenario manifests found");
  const scenarios = files.map((file) => validateScenario(readJson(file, path.relative(root, file)), { root, sourcePath: file }));
  scenarioMap(scenarios);
  const suitePath = path.join(root, "evals", "suites.json");
  if (!fs.existsSync(suitePath)) throw new ContractError("SUITE_MISSING", "evals/suites.json is missing");
  const suiteManifest = validateSuiteManifest(readJson(suitePath, "evals/suites.json"), scenarios);
  return { scenarios, suiteManifest };
}
