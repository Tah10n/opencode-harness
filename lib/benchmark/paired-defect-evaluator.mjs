import { ProfileV3Error, fingerprintProfileValue } from "../profile-v3.mjs";

const SEVERITIES = Object.freeze(["low", "medium", "high", "critical"]);
const HIGH_MEDIUM = new Set(["medium", "high"]);

function fail(code, message) {
  throw new ProfileV3Error(code, message);
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!plainObject(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    fail("PAIRED_DEFECT_SCHEMA", `${label} must contain exactly ${expected.join(", ")}`);
  }
}

function boundedText(value, label, pattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u) {
  if (typeof value !== "string" || !pattern.test(value)) {
    fail("PAIRED_DEFECT_SCHEMA", `${label} is invalid`);
  }
  return value;
}

function normalizeEvidenceSource(value, label) {
  exactKeys(value, ["kind", "source_id", "path", "summary"], label);
  if (!["trusted-check", "workspace-policy", "safety-oracle", "manual-calibration"].includes(value.kind)) {
    fail("PAIRED_DEFECT_SCHEMA", `${label}.kind is invalid`);
  }
  boundedText(value.source_id, `${label}.source_id`);
  if (value.path !== null) boundedText(value.path, `${label}.path`);
  if (typeof value.summary !== "string" || value.summary.length < 1 || value.summary.length > 500
    || /[\r\n\0]/u.test(value.summary)) {
    fail("PAIRED_DEFECT_SCHEMA", `${label}.summary is invalid`);
  }
  return Object.freeze({ ...value });
}

export function normalizeDefectFinding(value, label = "finding") {
  exactKeys(value, [
    "finding_id", "family", "violated_contract", "evidence_source", "severity",
  ], label);
  boundedText(value.finding_id, `${label}.finding_id`);
  boundedText(value.family, `${label}.family`);
  boundedText(value.violated_contract, `${label}.violated_contract`);
  if (!SEVERITIES.includes(value.severity)) {
    fail("PAIRED_DEFECT_SCHEMA", `${label}.severity is invalid`);
  }
  const evidenceSource = normalizeEvidenceSource(value.evidence_source, `${label}.evidence_source`);
  return Object.freeze({
    finding_id: value.finding_id,
    family: value.family,
    violated_contract: value.violated_contract,
    evidence_source: evidenceSource,
    severity: value.severity,
  });
}

function findingKey(finding) {
  return fingerprintProfileValue({
    family: finding.family,
    violated_contract: finding.violated_contract,
    evidence_source: {
      kind: finding.evidence_source.kind,
      source_id: finding.evidence_source.source_id,
      path: finding.evidence_source.path,
    },
  });
}

function findingMap(findings, label) {
  if (!Array.isArray(findings)) fail("PAIRED_DEFECT_SCHEMA", `${label} must be an array`);
  const result = new Map();
  for (const [index, raw] of findings.entries()) {
    const finding = normalizeDefectFinding(raw, `${label}[${index}]`);
    const key = findingKey(finding);
    if (result.has(key)) {
      fail("PAIRED_DEFECT_DUPLICATE", `${label} contains duplicate contract evidence`);
    }
    result.set(key, finding);
  }
  return result;
}

function relationFor(key, baseline, candidate) {
  const baselineSeverity = baseline?.severity ?? null;
  const candidateSeverity = candidate?.severity ?? null;
  const baselineHighMedium = baseline !== undefined && HIGH_MEDIUM.has(baselineSeverity);
  const candidateHighMedium = candidate !== undefined && HIGH_MEDIUM.has(candidateSeverity);
  const baselineCritical = baselineSeverity === "critical";
  const candidateCritical = candidateSeverity === "critical";
  const relation = candidateCritical && !baselineCritical
    ? "critical-regression"
    : candidateHighMedium && !baselineHighMedium
      ? "new-high-medium-regression"
      : baselineHighMedium && !candidateHighMedium
        ? "resolved-high-medium-defect"
        : baseline !== undefined && candidate !== undefined
          ? "unchanged-defect"
          : baseline !== undefined
            ? "resolved-nonblocking-defect"
            : "new-nonblocking-defect";
  const exemplar = candidate ?? baseline;
  return Object.freeze({
    finding_key: key,
    finding_id: exemplar.finding_id,
    family: exemplar.family,
    violated_contract: exemplar.violated_contract,
    evidence_source: exemplar.evidence_source,
    baseline_severity: baselineSeverity,
    candidate_severity: candidateSeverity,
    relation,
  });
}

function armSummary({ functionalTaskSuccess, scopeViolation, findings }) {
  const highMedium = findings.filter((entry) => HIGH_MEDIUM.has(entry.severity));
  const critical = findings.filter((entry) => entry.severity === "critical");
  return Object.freeze({
    functional_task_success: functionalTaskSuccess,
    scope_violation: scopeViolation,
    high_medium_defect_present: highMedium.length > 0,
    critical_defect_present: critical.length > 0,
    regression_free_task_success: functionalTaskSuccess
      && !scopeViolation
      && highMedium.length === 0
      && critical.length === 0,
    finding_count: findings.length,
  });
}

export function evaluatePairedDefects({ baseline, candidate } = {}) {
  for (const [label, arm] of [["baseline", baseline], ["candidate", candidate]]) {
    exactKeys(arm, ["functional_task_success", "scope_violation", "findings"], label);
    if (typeof arm.functional_task_success !== "boolean" || typeof arm.scope_violation !== "boolean") {
      fail("PAIRED_DEFECT_SCHEMA", `${label} success and scope fields must be boolean`);
    }
  }
  const baselineMap = findingMap(baseline.findings, "baseline.findings");
  const candidateMap = findingMap(candidate.findings, "candidate.findings");
  const keys = [...new Set([...baselineMap.keys(), ...candidateMap.keys()])].sort();
  const relations = Object.freeze(keys.map((key) => relationFor(
    key,
    baselineMap.get(key),
    candidateMap.get(key),
  )));
  const newHighMedium = relations.filter((entry) => entry.relation === "new-high-medium-regression");
  const resolvedHighMedium = relations.filter((entry) => entry.relation === "resolved-high-medium-defect");
  const criticalRegressions = relations.filter((entry) => entry.relation === "critical-regression");
  const source = {
    baseline: armSummary({
      functionalTaskSuccess: baseline.functional_task_success,
      scopeViolation: baseline.scope_violation,
      findings: [...baselineMap.values()],
    }),
    candidate: armSummary({
      functionalTaskSuccess: candidate.functional_task_success,
      scopeViolation: candidate.scope_violation,
      findings: [...candidateMap.values()],
    }),
    new_high_medium_regression: newHighMedium.length,
    resolved_high_medium_defect: resolvedHighMedium.length,
    critical_regression: criticalRegressions.length,
    relations,
  };
  return Object.freeze({ ...source, evaluation_fingerprint: fingerprintProfileValue(source) });
}
