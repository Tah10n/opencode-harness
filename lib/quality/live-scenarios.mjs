import fs from "node:fs";
import path from "node:path";

import { assertSafeId } from "../feedback/contracts.mjs";
import { isInside } from "../feedback/files.mjs";
import { createEngineeringCheckCatalog } from "./gate.mjs";
import {
  ContractError,
  assertArray,
  assertInteger,
  assertPlain,
  assertString,
  assertStringArray,
  deepFrozenClone,
  exact,
} from "./validation.mjs";

const COMMON_KEYS = Object.freeze([
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

function validatePatch(value, label) {
  exact(value, ["files"], ["files"], label);
  assertArray(value.files, `${label}.files`, {
    min: 1,
    max: 4,
    item: (entry, itemLabel) => {
      exact(entry, ["source", "target", "sha256"], ["source", "target", "sha256"], itemLabel);
      assertString(entry.source, `${itemLabel}.source`, { maxBytes: 1000 });
      assertString(entry.target, `${itemLabel}.target`, { maxBytes: 1000 });
      if (!/^[0-9a-f]{64}$/.test(entry.sha256)) throw new ContractError("QUALITY_LIVE_PATCH_HASH", `${itemLabel}.sha256 is invalid`);
    },
  });
}

export function validateQualityLiveScenarioSidecar(value, scenario) {
  assertPlain(value, "quality live scenario sidecar");
  const smallLocal = scenario?.id === "quality-small-local-control";
  const keys = smallLocal ? [...COMMON_KEYS, "anti_overengineering"] : COMMON_KEYS;
  exact(value, keys, keys, "quality live scenario sidecar");
  if (value.schema_version !== 1 || value.sidecar_version !== "1.0.0") {
    throw new ContractError("QUALITY_LIVE_SIDECAR_VERSION", "quality live sidecar must use schema 1 and sidecar version 1.0.0");
  }
  assertSafeId(value.scenario_id, "quality live sidecar.scenario_id");
  if (!scenario || value.scenario_id !== scenario.id) throw new ContractError("QUALITY_LIVE_SIDECAR_BINDING", "sidecar scenario identity mismatch");
  for (const field of ["seeded_defect", "hidden_counterexample", "forbidden_regression", "workload_class", "suite", "fixture_fingerprint"]) {
    assertString(value[field], `quality live sidecar.${field}`, { maxBytes: 1000 });
  }
  if (!["standard-lite", "high", "critical"].includes(value.risk_class)) {
    throw new ContractError("QUALITY_LIVE_SIDECAR_RISK", "quality live sidecar risk_class is invalid");
  }
  const manifestRisk = scenario.risk_tags.find((entry) => ["standard", "high", "critical"].includes(entry));
  if (value.risk_class !== (manifestRisk === "standard" ? "standard-lite" : manifestRisk)) {
    throw new ContractError("QUALITY_LIVE_SIDECAR_RISK", "sidecar risk_class does not match the public manifest");
  }
  if (scenario.workspace_policy.mode !== "allowlist") {
    throw new ContractError("QUALITY_LIVE_SIDECAR_OWNERSHIP", "quality scenario must use an explicit workspace allowlist");
  }
  assertStringArray(value.expected_ownership, "quality live sidecar.expected_ownership", { path: true, min: 1, max: 64 });
  if (JSON.stringify(value.expected_ownership) !== JSON.stringify(scenario.workspace_policy.allowed_paths)) {
    throw new ContractError("QUALITY_LIVE_SIDECAR_OWNERSHIP", "sidecar ownership does not match the public workspace policy");
  }
  assertStringArray(value.required_quality_assertion_ids, "quality live sidecar.required_quality_assertion_ids", { min: 1, max: 32 });
  exact(value.visible_oracle, ["command", "seeded_status"], ["command", "seeded_status"], "quality live sidecar.visible_oracle");
  if (value.visible_oracle.command !== scenario.visible_checks[0] || value.visible_oracle.seeded_status !== "failed") {
    throw new ContractError("QUALITY_LIVE_SIDECAR_ORACLE", "sidecar visible oracle does not match the public scenario");
  }
  validatePatch(value.bad_patch, "quality live sidecar.bad_patch");
  validatePatch(value.compliant_patch, "quality live sidecar.compliant_patch");
  if (smallLocal) {
    exact(value.anti_overengineering, ["max_delegations", "max_changed_files", "new_dependency_allowed", "broad_rewrite_allowed"], [
      "max_delegations", "max_changed_files", "new_dependency_allowed", "broad_rewrite_allowed",
    ], "quality live sidecar.anti_overengineering");
    assertInteger(value.anti_overengineering.max_delegations, "quality live sidecar.anti_overengineering.max_delegations", { min: 0 });
    assertInteger(value.anti_overengineering.max_changed_files, "quality live sidecar.anti_overengineering.max_changed_files", { min: 0 });
    if (value.anti_overengineering.new_dependency_allowed !== false || value.anti_overengineering.broad_rewrite_allowed !== false) {
      throw new ContractError("QUALITY_LIVE_SIDECAR_OVERENGINEERING", "small-local sidecar must prohibit dependencies and broad rewrites");
    }
  }
  return value;
}

export function loadQualityLiveScenarioSidecar({ root, scenario }) {
  const resolvedRoot = path.resolve(root);
  const file = path.resolve(resolvedRoot, "quality", "live-scenarios", `${assertSafeId(scenario.id, "scenario.id")}.v1.json`);
  if (!isInside(resolvedRoot, file)) throw new ContractError("QUALITY_LIVE_SIDECAR_PATH", "quality sidecar path escaped the source root");
  if (!fs.existsSync(file)) return null;
  let value;
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("not an ordinary file");
    value = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new ContractError("QUALITY_LIVE_SIDECAR_JSON", `quality sidecar is unavailable or invalid: ${error.message}`);
  }
  validateQualityLiveScenarioSidecar(value, scenario);
  return deepFrozenClone(value, "quality live scenario sidecar");
}

export function qualityLiveCheckCatalog(scenarioId) {
  assertSafeId(scenarioId, "scenarioId");
  return createEngineeringCheckCatalog({
    catalog_id: `${scenarioId}-quality-catalog-v1`,
    checks: [
      { check_id: `${scenarioId}-baseline`, trusted_producer: "opencode-harness-quality-runner", phases: ["preimplementation"], available: true },
      { check_id: `${scenarioId}-visible`, trusted_producer: "opencode-harness-quality-runner", phases: ["slice"], available: true },
      { check_id: `${scenarioId}-integration`, trusted_producer: "opencode-harness-quality-runner", phases: ["integration"], available: true },
    ],
    mechanisms: [
      { mechanism_id: `${scenarioId}-hidden-evaluation`, trusted_producer: "opencode-harness-quality-runner", phases: ["integration"], available: true },
      { mechanism_id: `${scenarioId}-architecture-evaluation`, trusted_producer: "opencode-harness-quality-runner", phases: ["preimplementation"], available: true },
      { mechanism_id: `${scenarioId}-architect-plan-challenge`, trusted_producer: "opencode-harness-traced-architect", phases: ["preimplementation"], available: true },
      { mechanism_id: `${scenarioId}-reviewer-plan-challenge`, trusted_producer: "opencode-harness-traced-reviewer", phases: ["preimplementation"], available: true },
    ],
  });
}
