import { assertEnum, assertSafeId } from "../feedback/contracts.mjs";
import { normalizeRelativePath } from "../feedback/privacy.mjs";
import {
  ARCHITECTURE_EVALUATION_SCHEMA_VERSION,
  ARCHITECTURE_EVALUATION_STATUSES,
  ARCHITECTURE_POLICY_SCHEMA_VERSION,
  ARCHITECTURE_RULE_KINDS,
  IMPACT_RELATIONSHIP_KINDS,
  QUALITY_LIMITS,
} from "./constants.mjs";
import { validateEngineeringImpactGraph } from "./impact-graph.mjs";
import {
  ContractError,
  assertArray,
  assertBoolean,
  assertFingerprint,
  assertInteger,
  assertSchemaVersion,
  assertStableTypedId,
  assertString,
  assertStringArray,
  assertUniqueIds,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
  validateEvidenceReferences,
} from "./validation.mjs";

export const ARCHITECTURE_EVALUATOR_IDS = Object.freeze([
  "dependency-graph-v1",
  "test-coverage-v1",
  "cycle-v1",
]);

const RULE_EVALUATOR = Object.freeze({
  deny_dependency: "dependency-graph-v1",
  allow_dependency: "dependency-graph-v1",
  require_test_coverage: "test-coverage-v1",
  deny_cycle: "cycle-v1",
});

const POLICY_KEYS = Object.freeze([
  "schema_version",
  "policy_id",
  "enforce_existing",
  "required_evaluator_ids",
  "rules",
  "fingerprint",
]);
const POLICY_INPUT_KEYS = Object.freeze(POLICY_KEYS.filter((key) => !["schema_version", "fingerprint"].includes(key)));
const EVALUATION_KEYS = Object.freeze([
  "schema_version",
  "evaluation_id",
  "status",
  "computational",
  "policy_id",
  "policy_fingerprint",
  "graph_id",
  "graph_fingerprint",
  "baseline_graph_id",
  "baseline_graph_fingerprint",
  "evaluators",
  "violations",
  "summary",
  "fingerprint",
]);

function canonicalSelectorPath(value, label) {
  assertString(value, label, { maxBytes: QUALITY_LIMITS.stringBytes });
  const normalized = normalizeRelativePath(value, label);
  if (normalized !== value) {
    throw new ContractError("QUALITY_PATH_CANONICAL", `${label} must use canonical forward slashes`);
  }
  return value;
}

function validateCanonicalEvidenceReferences(value, label, options = {}) {
  validateEvidenceReferences(value, label, options);
  value.forEach((entry, index) => {
    if (["file", "doc"].includes(entry.kind)) canonicalSelectorPath(entry.value, `${label}[${index}].value`);
  });
  return value;
}

function validateSelector(value, label) {
  exact(value, ["type", "value"], ["type", "value"], label);
  assertEnum(value.type, ["exact_path", "path_prefix"], `${label}.type`);
  canonicalSelectorPath(value.value, `${label}.value`);
  return value;
}

function validateRelationshipKinds(value, label) {
  assertArray(value, label, {
    min: 1,
    max: IMPACT_RELATIONSHIP_KINDS.length,
    item: (entry, entryLabel) => assertEnum(entry, IMPACT_RELATIONSHIP_KINDS, entryLabel),
  });
  if (new Set(value).size !== value.length) {
    throw new ContractError("QUALITY_ARCHITECTURE_DUPLICATE_RELATIONSHIP", `${label} must not contain duplicates`);
  }
  return value;
}

function validateRuleBase(value, label) {
  assertStableTypedId(value.id, "ARCHRULE", `${label}.id`);
  assertEnum(value.kind, ARCHITECTURE_RULE_KINDS, `${label}.kind`);
  assertSafeId(value.evaluator_id, `${label}.evaluator_id`);
  assertString(value.rationale, `${label}.rationale`);
  const expectedEvaluator = RULE_EVALUATOR[value.kind];
  if (ARCHITECTURE_EVALUATOR_IDS.includes(value.evaluator_id) && value.evaluator_id !== expectedEvaluator) {
    throw new ContractError(
      "QUALITY_ARCHITECTURE_RULE_EVALUATOR",
      `${label}.${value.kind} requires ${expectedEvaluator}, not ${value.evaluator_id}`,
    );
  }
}

function validateArchitectureRule(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractError("QUALITY_ARCHITECTURE_RULE", `${label} must be an object`);
  }
  if (["deny_dependency", "allow_dependency"].includes(value.kind)) {
    const keys = ["id", "kind", "source", "target", "relationship_kinds", "evaluator_id", "rationale"];
    exact(value, keys, keys, label);
    validateRuleBase(value, label);
    validateSelector(value.source, `${label}.source`);
    validateSelector(value.target, `${label}.target`);
    validateRelationshipKinds(value.relationship_kinds, `${label}.relationship_kinds`);
    return value;
  }
  if (value.kind === "require_test_coverage") {
    const keys = ["id", "kind", "subject", "minimum_tests", "evaluator_id", "rationale"];
    exact(value, keys, keys, label);
    validateRuleBase(value, label);
    validateSelector(value.subject, `${label}.subject`);
    assertInteger(value.minimum_tests, `${label}.minimum_tests`, { min: 1, max: QUALITY_LIMITS.arrayItems });
    return value;
  }
  if (value.kind === "deny_cycle") {
    const keys = ["id", "kind", "scope", "relationship_kinds", "evaluator_id", "rationale"];
    exact(value, keys, keys, label);
    validateRuleBase(value, label);
    validateSelector(value.scope, `${label}.scope`);
    validateRelationshipKinds(value.relationship_kinds, `${label}.relationship_kinds`);
    return value;
  }
  throw new ContractError("CONTRACT_ENUM", `${label}.kind must be one of: ${ARCHITECTURE_RULE_KINDS.join(", ")}`);
}

function fingerprintInput(value) {
  const copy = { ...value };
  delete copy.fingerprint;
  return copy;
}

export function validateArchitecturePolicy(value) {
  exact(value, POLICY_KEYS, POLICY_KEYS, "architecture policy");
  assertSchemaVersion(value.schema_version, ARCHITECTURE_POLICY_SCHEMA_VERSION, "architecture policy");
  assertStableTypedId(value.policy_id, "ARCHPOLICY", "architecture policy.policy_id");
  assertBoolean(value.enforce_existing, "architecture policy.enforce_existing");
  assertStringArray(value.required_evaluator_ids, "architecture policy.required_evaluator_ids", {
    min: 1,
    max: 64,
    maxBytes: 128,
  });
  value.required_evaluator_ids.forEach((id, index) => assertSafeId(id, `architecture policy.required_evaluator_ids[${index}]`));
  assertArray(value.rules, "architecture policy.rules", {
    min: 1,
    max: QUALITY_LIMITS.arrayItems,
    item: validateArchitectureRule,
  });
  assertUniqueIds(value.rules, "architecture policy.rules");
  for (const rule of value.rules) {
    if (!value.required_evaluator_ids.includes(rule.evaluator_id)) {
      throw new ContractError("QUALITY_ARCHITECTURE_EVALUATOR_REQUIRED", `${rule.id} evaluator ${rule.evaluator_id} is not required by policy`);
    }
  }
  assertFingerprint(value.fingerprint, "architecture policy.fingerprint");
  const expected = fingerprint(fingerprintInput(value));
  if (!fingerprintsEqual(value.fingerprint, expected)) {
    throw new ContractError("QUALITY_ARCHITECTURE_POLICY_FINGERPRINT", "architecture policy fingerprint does not match persisted fields");
  }
  return value;
}

export function buildArchitecturePolicy(input) {
  exact(input, POLICY_INPUT_KEYS, POLICY_INPUT_KEYS, "architecture policy input");
  const withoutFingerprint = {
    schema_version: ARCHITECTURE_POLICY_SCHEMA_VERSION,
    ...JSON.parse(canonicalJson(input)),
  };
  const policy = {
    ...withoutFingerprint,
    fingerprint: fingerprint(withoutFingerprint),
  };
  validateArchitecturePolicy(policy);
  return deepFrozenClone(policy, "architecture policy");
}

export function parseArchitecturePolicy(serialized) {
  if (typeof serialized !== "string") {
    throw new ContractError("QUALITY_ARCHITECTURE_POLICY_JSON", "architecture policy source must be a JSON string");
  }
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes === 0 || bytes > QUALITY_LIMITS.recordBytes) {
    throw new ContractError(
      "QUALITY_ARCHITECTURE_POLICY_JSON_BYTES",
      `architecture policy source must be 1..${QUALITY_LIMITS.recordBytes} UTF-8 bytes`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new ContractError("QUALITY_ARCHITECTURE_POLICY_JSON", "architecture policy source is not valid JSON");
  }
  validateArchitecturePolicy(parsed);
  return deepFrozenClone(parsed, "architecture policy");
}

function selectorMatches(node, selector) {
  if (node.path === null) return false;
  if (selector.type === "exact_path") return node.path === selector.value;
  return node.path === selector.value || node.path.startsWith(`${selector.value}/`);
}

function uniqueEvidence(items) {
  const byIdentity = new Map();
  for (const item of items.flatMap((entry) => entry.evidence_refs ?? [])) {
    byIdentity.set(`${item.kind}:${item.value}`, item);
  }
  return [...byIdentity.values()].sort((left, right) => `${left.kind}:${left.value}`.localeCompare(`${right.kind}:${right.value}`));
}

function makeRawViolation({ ruleIds, kind, subjectIds, evidenceRefs }) {
  const sortedRuleIds = [...ruleIds].sort();
  const sortedSubjectIds = [...new Set(subjectIds)].sort();
  const signature = canonicalJson({ kind, rule_ids: sortedRuleIds, subject_ids: sortedSubjectIds });
  return {
    signature,
    violation_id: `ARCHV-${fingerprint(signature).slice(7, 31)}`,
    rule_ids: sortedRuleIds,
    kind,
    subject_ids: sortedSubjectIds,
    message: `${kind}:${sortedSubjectIds.join(",")}`,
    evidence_refs: evidenceRefs,
  };
}

function dependencyViolations(graph, rules, availableEvaluatorIds) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const availableRules = rules.filter((rule) => availableEvaluatorIds.has(rule.evaluator_id));
  const denies = availableRules.filter((rule) => rule.kind === "deny_dependency");
  const allows = availableRules.filter((rule) => rule.kind === "allow_dependency");
  const violations = [];

  for (const edge of graph.edges) {
    const source = nodes.get(edge.from);
    const target = nodes.get(edge.to);
    for (const rule of denies) {
      if (
        rule.relationship_kinds.includes(edge.relationship)
        && selectorMatches(source, rule.source)
        && selectorMatches(target, rule.target)
      ) {
        violations.push(makeRawViolation({
          ruleIds: [rule.id],
          kind: "dependency_denied",
          subjectIds: [edge.id, edge.from, edge.to],
          evidenceRefs: uniqueEvidence([edge, source, target]),
        }));
      }
    }

    const applicableAllows = allows.filter((rule) => (
      rule.relationship_kinds.includes(edge.relationship) && selectorMatches(source, rule.source)
    ));
    if (applicableAllows.length > 0 && !applicableAllows.some((rule) => selectorMatches(target, rule.target))) {
      violations.push(makeRawViolation({
        ruleIds: applicableAllows.map((rule) => rule.id),
        kind: "dependency_not_allowed",
        subjectIds: [edge.id, edge.from, edge.to],
        evidenceRefs: uniqueEvidence([edge, source, target]),
      }));
    }
  }
  return violations;
}

function testCoverageViolations(graph, rules, availableEvaluatorIds) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const testRules = rules.filter((rule) => rule.kind === "require_test_coverage" && availableEvaluatorIds.has(rule.evaluator_id));
  const violations = [];
  for (const rule of testRules) {
    for (const subject of graph.nodes.filter((node) => node.kind !== "test" && selectorMatches(node, rule.subject))) {
      const tests = new Set();
      for (const edge of graph.edges) {
        if (!["tests", "verifies"].includes(edge.relationship)) continue;
        if (edge.from === subject.id && nodes.get(edge.to)?.kind === "test") tests.add(edge.to);
        if (edge.to === subject.id && nodes.get(edge.from)?.kind === "test") tests.add(edge.from);
      }
      if (tests.size < rule.minimum_tests) {
        violations.push(makeRawViolation({
          ruleIds: [rule.id],
          kind: "test_coverage_missing",
          subjectIds: [subject.id],
          evidenceRefs: uniqueEvidence([subject]),
        }));
      }
    }
  }
  return violations;
}

function stronglyConnectedComponents(nodeIds, edges) {
  const adjacency = new Map(nodeIds.map((id) => [id, []]));
  for (const edge of edges) adjacency.get(edge.from)?.push(edge.to);
  for (const targets of adjacency.values()) targets.sort();
  let nextIndex = 0;
  const indexes = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];

  const visit = (nodeId) => {
    indexes.set(nodeId, nextIndex);
    lowLinks.set(nodeId, nextIndex);
    nextIndex += 1;
    stack.push(nodeId);
    onStack.add(nodeId);
    for (const targetId of adjacency.get(nodeId)) {
      if (!indexes.has(targetId)) {
        visit(targetId);
        lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId), lowLinks.get(targetId)));
      } else if (onStack.has(targetId)) {
        lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId), indexes.get(targetId)));
      }
    }
    if (lowLinks.get(nodeId) === indexes.get(nodeId)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== nodeId);
      components.push(component.sort());
    }
  };
  for (const nodeId of [...nodeIds].sort()) if (!indexes.has(nodeId)) visit(nodeId);
  return components;
}

function cycleViolations(graph, rules, availableEvaluatorIds) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const cycleRules = rules.filter((rule) => rule.kind === "deny_cycle" && availableEvaluatorIds.has(rule.evaluator_id));
  const violations = [];
  for (const rule of cycleRules) {
    const scopedNodeIds = graph.nodes.filter((node) => selectorMatches(node, rule.scope)).map((node) => node.id);
    const scoped = new Set(scopedNodeIds);
    const scopedEdges = graph.edges.filter((edge) => (
      scoped.has(edge.from) && scoped.has(edge.to) && rule.relationship_kinds.includes(edge.relationship)
    ));
    for (const component of stronglyConnectedComponents(scopedNodeIds, scopedEdges)) {
      const componentSet = new Set(component);
      const componentEdges = scopedEdges.filter((edge) => componentSet.has(edge.from) && componentSet.has(edge.to));
      const cyclic = component.length > 1 || componentEdges.some((edge) => edge.from === edge.to);
      if (!cyclic) continue;
      violations.push(makeRawViolation({
        ruleIds: [rule.id],
        kind: "cycle_detected",
        subjectIds: component,
        evidenceRefs: uniqueEvidence([
          ...component.map((id) => nodes.get(id)),
          ...componentEdges,
        ]),
      }));
    }
  }
  return violations;
}

function rawViolations(graph, policy, evaluatorStatuses) {
  const available = new Set(evaluatorStatuses.filter((entry) => entry.candidate_status === "available").map((entry) => entry.id));
  return [
    ...dependencyViolations(graph, policy.rules, available),
    ...testCoverageViolations(graph, policy.rules, available),
    ...cycleViolations(graph, policy.rules, available),
  ].sort((left, right) => left.signature.localeCompare(right.signature));
}

function evaluatorStatus(graph, evaluatorId) {
  if (!ARCHITECTURE_EVALUATOR_IDS.includes(evaluatorId)) return "unsupported";
  if (graph.coverage.available_evaluator_ids.includes(evaluatorId)) return "available";
  return "unavailable";
}

function createEvaluation({ graph, policy, baseline }) {
  const identity = {
    graph_fingerprint: graph.fingerprint,
    policy_fingerprint: policy?.fingerprint ?? null,
    baseline_graph_fingerprint: baseline?.fingerprint ?? null,
  };
  const evaluationId = `ARCHEVAL-${fingerprint(identity).slice(7, 31)}`;
  if (policy === null) {
    const withoutFingerprint = {
      schema_version: ARCHITECTURE_EVALUATION_SCHEMA_VERSION,
      evaluation_id: evaluationId,
      status: "not_configured",
      computational: false,
      policy_id: null,
      policy_fingerprint: null,
      graph_id: graph.graph_id,
      graph_fingerprint: graph.fingerprint,
      baseline_graph_id: null,
      baseline_graph_fingerprint: null,
      evaluators: [],
      violations: [],
      summary: { introduced_count: 0, unchanged_count: 0, blocking_count: 0 },
    };
    return { ...withoutFingerprint, fingerprint: fingerprint(withoutFingerprint) };
  }

  const evaluators = [...policy.required_evaluator_ids].sort().map((id) => ({
    id,
    candidate_status: evaluatorStatus(graph, id),
    baseline_status: baseline === null ? "not_applicable" : evaluatorStatus(baseline, id),
  }));
  const candidateRaw = rawViolations(graph, policy, evaluators);
  const baselineEvaluators = evaluators.map((entry) => ({ ...entry, candidate_status: entry.baseline_status }));
  const baselineRaw = baseline === null ? [] : rawViolations(baseline, policy, baselineEvaluators);
  const baselineSignatures = new Set(baselineRaw.map((entry) => entry.signature));
  const violations = candidateRaw.map(({ signature, ...entry }) => {
    const disposition = baselineSignatures.has(signature) ? "unchanged" : "introduced";
    return {
      ...entry,
      disposition,
      blocking: disposition === "introduced" || policy.enforce_existing,
    };
  });
  const summary = {
    introduced_count: violations.filter((entry) => entry.disposition === "introduced").length,
    unchanged_count: violations.filter((entry) => entry.disposition === "unchanged").length,
    blocking_count: violations.filter((entry) => entry.blocking).length,
  };
  const evaluatorBlocked = evaluators.some((entry) => (
    entry.candidate_status !== "available"
    || (baseline !== null && entry.baseline_status !== "available")
  ));
  const status = evaluatorBlocked ? "blocked" : summary.blocking_count > 0 ? "failed" : "passed";
  const withoutFingerprint = {
    schema_version: ARCHITECTURE_EVALUATION_SCHEMA_VERSION,
    evaluation_id: evaluationId,
    status,
    computational: true,
    policy_id: policy.policy_id,
    policy_fingerprint: policy.fingerprint,
    graph_id: graph.graph_id,
    graph_fingerprint: graph.fingerprint,
    baseline_graph_id: baseline?.graph_id ?? null,
    baseline_graph_fingerprint: baseline?.fingerprint ?? null,
    evaluators,
    violations,
    summary,
  };
  return { ...withoutFingerprint, fingerprint: fingerprint(withoutFingerprint) };
}

function validateEvaluatorResult(value, label) {
  const keys = ["id", "candidate_status", "baseline_status"];
  exact(value, keys, keys, label);
  assertSafeId(value.id, `${label}.id`);
  assertEnum(value.candidate_status, ["available", "unavailable", "unsupported"], `${label}.candidate_status`);
  assertEnum(value.baseline_status, ["available", "unavailable", "unsupported", "not_applicable"], `${label}.baseline_status`);
  return value;
}

function validateViolation(value, label) {
  const keys = ["violation_id", "rule_ids", "kind", "subject_ids", "message", "evidence_refs", "disposition", "blocking"];
  exact(value, keys, keys, label);
  assertStableTypedId(value.violation_id, "ARCHV", `${label}.violation_id`);
  assertStringArray(value.rule_ids, `${label}.rule_ids`, { min: 1, max: 64, maxBytes: 128 });
  value.rule_ids.forEach((id, index) => assertStableTypedId(id, "ARCHRULE", `${label}.rule_ids[${index}]`));
  assertEnum(value.kind, ["dependency_denied", "dependency_not_allowed", "test_coverage_missing", "cycle_detected"], `${label}.kind`);
  assertStringArray(value.subject_ids, `${label}.subject_ids`, { min: 1, max: 128, maxBytes: 128 });
  value.subject_ids.forEach((id, index) => assertSafeId(id, `${label}.subject_ids[${index}]`));
  assertString(value.message, `${label}.message`);
  validateCanonicalEvidenceReferences(value.evidence_refs, `${label}.evidence_refs`, { min: 1 });
  assertEnum(value.disposition, ["introduced", "unchanged"], `${label}.disposition`);
  assertBoolean(value.blocking, `${label}.blocking`);
  return value;
}

export function validateArchitectureEvaluation(value) {
  exact(value, EVALUATION_KEYS, EVALUATION_KEYS, "architecture evaluation");
  assertSchemaVersion(value.schema_version, ARCHITECTURE_EVALUATION_SCHEMA_VERSION, "architecture evaluation");
  assertStableTypedId(value.evaluation_id, "ARCHEVAL", "architecture evaluation.evaluation_id");
  assertEnum(value.status, ARCHITECTURE_EVALUATION_STATUSES, "architecture evaluation.status");
  assertBoolean(value.computational, "architecture evaluation.computational");
  if (value.policy_id === null) {
    if (value.policy_fingerprint !== null) throw new ContractError("QUALITY_ARCHITECTURE_EVALUATION_POLICY", "null policy id requires null fingerprint");
  } else {
    assertStableTypedId(value.policy_id, "ARCHPOLICY", "architecture evaluation.policy_id");
    assertFingerprint(value.policy_fingerprint, "architecture evaluation.policy_fingerprint");
  }
  assertStableTypedId(value.graph_id, "GRAPH", "architecture evaluation.graph_id");
  assertFingerprint(value.graph_fingerprint, "architecture evaluation.graph_fingerprint");
  if (value.baseline_graph_id === null) {
    if (value.baseline_graph_fingerprint !== null) throw new ContractError("QUALITY_ARCHITECTURE_EVALUATION_BASELINE", "null baseline id requires null fingerprint");
  } else {
    assertStableTypedId(value.baseline_graph_id, "GRAPH", "architecture evaluation.baseline_graph_id");
    assertFingerprint(value.baseline_graph_fingerprint, "architecture evaluation.baseline_graph_fingerprint");
  }
  assertArray(value.evaluators, "architecture evaluation.evaluators", { max: 64, item: validateEvaluatorResult });
  const evaluatorIds = value.evaluators.map((entry) => entry.id);
  if (new Set(evaluatorIds).size !== evaluatorIds.length) {
    throw new ContractError("QUALITY_ARCHITECTURE_EVALUATOR_DUPLICATE", "architecture evaluation has duplicate evaluator ids");
  }
  if (value.policy_id !== null && value.evaluators.length === 0) {
    throw new ContractError("QUALITY_ARCHITECTURE_EVALUATOR_MISSING", "configured architecture evaluation needs required evaluator results");
  }
  if (value.baseline_graph_id === null && value.evaluators.some((entry) => entry.baseline_status !== "not_applicable")) {
    throw new ContractError("QUALITY_ARCHITECTURE_EVALUATION_BASELINE", "evaluation without a baseline must mark every baseline evaluator not_applicable");
  }
  if (value.baseline_graph_id !== null && value.evaluators.some((entry) => entry.baseline_status === "not_applicable")) {
    throw new ContractError("QUALITY_ARCHITECTURE_EVALUATION_BASELINE", "evaluation with a baseline must record every baseline evaluator status");
  }
  assertArray(value.violations, "architecture evaluation.violations", { max: QUALITY_LIMITS.arrayItems, item: validateViolation });
  const violationIds = value.violations.map((entry) => entry.violation_id);
  if (new Set(violationIds).size !== violationIds.length) {
    throw new ContractError("QUALITY_ARCHITECTURE_VIOLATION_DUPLICATE", "architecture evaluation has duplicate violation ids");
  }
  exact(value.summary, ["introduced_count", "unchanged_count", "blocking_count"], ["introduced_count", "unchanged_count", "blocking_count"], "architecture evaluation.summary");
  for (const key of ["introduced_count", "unchanged_count", "blocking_count"]) {
    assertInteger(value.summary[key], `architecture evaluation.summary.${key}`, { max: QUALITY_LIMITS.arrayItems });
  }
  const expectedSummary = {
    introduced_count: value.violations.filter((entry) => entry.disposition === "introduced").length,
    unchanged_count: value.violations.filter((entry) => entry.disposition === "unchanged").length,
    blocking_count: value.violations.filter((entry) => entry.blocking).length,
  };
  if (canonicalJson(value.summary) !== canonicalJson(expectedSummary)) {
    throw new ContractError("QUALITY_ARCHITECTURE_EVALUATION_SUMMARY", "architecture evaluation summary does not match violations");
  }
  const notConfigured = value.status === "not_configured";
  if (notConfigured !== !value.computational || notConfigured !== (value.policy_id === null)) {
    throw new ContractError("QUALITY_ARCHITECTURE_EVALUATION_STATE", "not_configured evaluation must be the only non-computational state");
  }
  if (notConfigured && (value.evaluators.length > 0 || value.violations.length > 0 || value.baseline_graph_id !== null)) {
    throw new ContractError("QUALITY_ARCHITECTURE_EVALUATION_STATE", "not_configured evaluation cannot contain policy results");
  }
  const evaluatorBlocked = value.evaluators.some((entry) => (
    entry.candidate_status !== "available"
    || (value.baseline_graph_id !== null && entry.baseline_status !== "available")
  ));
  if (value.status === "blocked" && !evaluatorBlocked) {
    throw new ContractError("QUALITY_ARCHITECTURE_EVALUATION_STATE", "blocked evaluation needs unavailable or unsupported evaluator evidence");
  }
  if (["passed", "failed"].includes(value.status) && evaluatorBlocked) {
    throw new ContractError("QUALITY_ARCHITECTURE_EVALUATION_STATE", `${value.status} evaluation cannot have blocked evaluators`);
  }
  if (value.status === "passed" && value.summary.blocking_count > 0) {
    throw new ContractError("QUALITY_ARCHITECTURE_EVALUATION_STATE", "passed evaluation cannot have blocking violations");
  }
  if (value.status === "failed" && value.summary.blocking_count === 0) {
    throw new ContractError("QUALITY_ARCHITECTURE_EVALUATION_STATE", "failed evaluation needs a blocking violation");
  }
  assertFingerprint(value.fingerprint, "architecture evaluation.fingerprint");
  const expected = fingerprint(fingerprintInput(value));
  if (!fingerprintsEqual(value.fingerprint, expected)) {
    throw new ContractError("QUALITY_ARCHITECTURE_EVALUATION_FINGERPRINT", "architecture evaluation fingerprint does not match persisted fields");
  }
  return value;
}

export function evaluateArchitecturePolicy(input) {
  exact(input, ["graph", "policy", "baseline"], ["graph", "policy", "baseline"], "architecture evaluation input");
  validateEngineeringImpactGraph(input.graph);
  if (input.policy !== null) validateArchitecturePolicy(input.policy);
  if (input.baseline !== null) validateEngineeringImpactGraph(input.baseline);
  if (input.policy === null && input.baseline !== null) {
    throw new ContractError("QUALITY_ARCHITECTURE_BASELINE_WITHOUT_POLICY", "baseline graph is not meaningful without a configured policy");
  }
  const evaluation = createEvaluation({
    graph: input.graph,
    policy: input.policy,
    baseline: input.baseline,
  });
  validateArchitectureEvaluation(evaluation);
  return deepFrozenClone(evaluation, "architecture evaluation");
}
