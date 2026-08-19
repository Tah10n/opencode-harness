import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { validateBenchmarkV2PilotContract } from "./v2-pilot.mjs";

export const BENCHMARK_V2_PATHS = Object.freeze({
  corpus: "benchmarks/v2/corpus-contract.v2.json",
  dev: "benchmarks/v2/dev/families.v2.json",
  devBindings: "benchmarks/v2/dev/render-bindings.v2.json",
  validation: "benchmarks/v2/validation/families.v2.json",
  validationBindings: "benchmarks/v2/validation/render-bindings.v2.json",
  holdout: "benchmarks/v2/holdout/selection-contract.v2.json",
  saltCommitment: "benchmarks/v2/holdout/salt-commitment.v2.json",
  realCommitCandidates: "benchmarks/v2/holdout/real-commit-candidates.v2.json",
  power: "benchmarks/v2/power-analysis.v2.json",
  policy: "benchmarks/v2/promotion-policy.v2.json",
  pilot: "benchmarks/v2/pilot-contract.v2.json",
});

const STRATA = Object.freeze(["small", "medium", "high"]);
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/u;

export class BenchmarkV2ContractError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "BenchmarkV2ContractError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new BenchmarkV2ContractError(code, message);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}

function exactKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    fail("BENCHMARK_V2_SHAPE", `${label} must contain exactly the frozen fields`);
  }
}

function exactSequence(value, expected, label) {
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    fail("BENCHMARK_V2_SEQUENCE", `${label} is not the preregistered sequence`);
  }
}

function readJson(root, relativePath) {
  if (typeof relativePath !== "string" || relativePath.startsWith("/") || relativePath.includes("\\")
    || relativePath.split("/").some((part) => ["", ".", ".."].includes(part))) {
    fail("BENCHMARK_V2_PATH", "contract path is not a canonical repository path");
  }
  const absolute = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(path.resolve(root), absolute);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail("BENCHMARK_V2_PATH", "contract path escapes the repository");
  }
  try {
    return JSON.parse(fs.readFileSync(absolute, "utf8").replace(/^\uFEFF/u, ""));
  } catch (error) {
    fail("BENCHMARK_V2_JSON", `${relativePath} is unreadable or invalid: ${error.message}`);
  }
}

function validateFamilies(manifest, { split, minimumPerStratum, exactPerStratum }) {
  const keys = split === "validation"
    ? ["schema_version", "split", "selection_status", "execution_status", "maximum_uses_per_architecture_generation", "families"]
    : ["schema_version", "split", "selection_status", "execution_status", "families"];
  exactKeys(manifest, keys, `${split} manifest`);
  if (manifest.schema_version !== 2 || manifest.split !== split || !Array.isArray(manifest.families)) {
    fail("BENCHMARK_V2_SPLIT", `${split} manifest version, split, or families are invalid`);
  }
  const expectedExecutionStatus = "executable";
  if (manifest.execution_status !== expectedExecutionStatus) {
    fail("BENCHMARK_V2_EXECUTION_STATUS", `${split} execution status is invalid`);
  }
  if (split === "development" && manifest.selection_status !== "open-for-development") {
    fail("BENCHMARK_V2_SPLIT", "development selection status is invalid");
  }
  if (split === "validation" && (manifest.selection_status !== "sealed-after-generation"
    || manifest.maximum_uses_per_architecture_generation !== 2)) {
    fail("BENCHMARK_V2_VALIDATION_REUSE", "validation must be sealed and capped at two uses per architecture generation");
  }
  const ids = [];
  const recipes = [];
  const counts = Object.fromEntries(STRATA.map((stratum) => [stratum, 0]));
  for (const [index, family] of manifest.families.entries()) {
    exactKeys(family, ["id", "stratum", "recipe_id"], `${split}.families[${index}]`);
    if (!SAFE_ID.test(family.id) || !family.id.startsWith(`${split === "development" ? "dev" : split}-`)
      || !SAFE_ID.test(family.recipe_id) || !STRATA.includes(family.stratum)) {
      fail("BENCHMARK_V2_FAMILY", `${split}.families[${index}] is invalid`);
    }
    ids.push(family.id);
    recipes.push(family.recipe_id);
    counts[family.stratum] += 1;
  }
  if (new Set(ids).size !== ids.length || new Set(recipes).size !== recipes.length) {
    fail("BENCHMARK_V2_FAMILY_DUPLICATE", `${split} family and recipe IDs must be unique`);
  }
  for (const stratum of STRATA) {
    if (counts[stratum] < minimumPerStratum
      || (exactPerStratum !== undefined && counts[stratum] !== exactPerStratum)) {
      fail("BENCHMARK_V2_STRATUM", `${split} ${stratum} count is insufficient`);
    }
  }
  return Object.freeze({
    ids,
    recipes,
    recipeByFamilyId: new Map(manifest.families.map((family) => [family.id, family.recipe_id])),
    counts,
    total: manifest.families.length,
  });
}

function validateRenderBindings(bindings, summary, split) {
  exactKeys(bindings, ["schema_version", "split", "bindings"], `${split} render bindings`);
  if (bindings.schema_version !== 2 || bindings.split !== split
    || !Array.isArray(bindings.bindings) || bindings.bindings.length !== summary.total) {
    fail("BENCHMARK_V2_BINDING", `${split} render bindings are incomplete`);
  }
  const familyIds = [];
  const renderIdentities = [];
  for (const [index, binding] of bindings.bindings.entries()) {
    const high = Object.hasOwn(binding, "kernel_id");
    const expectedKeys = high
      ? Object.hasOwn(binding, "multifile_solution")
        ? ["family_id", "kernel_id", "multifile_solution"]
        : ["family_id", "kernel_id"]
      : Object.hasOwn(binding, "multifile_solution")
        ? ["family_id", "source_family_id", "semantic_variant", "multifile_solution"]
        : ["family_id", "source_family_id", "semantic_variant"];
    exactKeys(binding, expectedKeys, `development render binding[${index}]`);
    if (!SAFE_ID.test(binding.family_id)
      || (high && !SAFE_ID.test(binding.kernel_id))
      || (!high && (!SAFE_ID.test(binding.source_family_id)
        || !Number.isSafeInteger(binding.semantic_variant)
        || binding.semantic_variant < 1 || binding.semantic_variant > 5))
      || (Object.hasOwn(binding, "multifile_solution") && binding.multifile_solution !== true)) {
      fail("BENCHMARK_V2_BINDING", `${split} render binding[${index}] is invalid`);
    }
    familyIds.push(binding.family_id);
    renderIdentities.push(high ? `kernel:${binding.kernel_id}` : `source:${binding.source_family_id}:${binding.semantic_variant}`);
    if (split === "validation" && binding.kernel_id !== summary.recipeByFamilyId.get(binding.family_id)) {
      fail("BENCHMARK_V2_BINDING", `${binding.family_id} validation kernel does not match its preregistered recipe`);
    }
  }
  if (new Set(familyIds).size !== familyIds.length || new Set(renderIdentities).size !== renderIdentities.length
    || JSON.stringify([...familyIds].sort()) !== JSON.stringify([...summary.ids].sort())) {
    fail("BENCHMARK_V2_BINDING", `${split} bindings overlap or do not cover the family registry`);
  }
}

function logChoose(n, k) {
  let result = 0;
  for (let index = 1; index <= k; index += 1) {
    result += Math.log(n - k + index) - Math.log(index);
  }
  return result;
}

function binomialProbability(n, k, probability) {
  if (probability === 0) return k === 0 ? 1 : 0;
  if (probability === 1) return k === n ? 1 : 0;
  return Math.exp(logChoose(n, k) + k * Math.log(probability) + (n - k) * Math.log1p(-probability));
}

function binomialUpperTails(n, probability) {
  const tails = Array(n + 1).fill(0);
  let running = 0;
  for (let value = n; value >= 0; value -= 1) {
    running += binomialProbability(n, value, probability);
    tails[value] = running;
  }
  return tails;
}

export function exactMcNemarPower({
  pair_count,
  candidate_only_probability,
  baseline_only_probability,
  alpha,
} = {}) {
  if (!Number.isSafeInteger(pair_count) || pair_count < 1 || pair_count > 2_000
    || !(candidate_only_probability > baseline_only_probability)
    || candidate_only_probability + baseline_only_probability >= 1
    || !(alpha > 0 && alpha < 1)) {
    fail("BENCHMARK_V2_POWER_INPUT", "exact McNemar power inputs are invalid");
  }
  const discordance = candidate_only_probability + baseline_only_probability;
  const winProbability = candidate_only_probability / discordance;
  let power = 0;
  for (let discordant = 0; discordant <= pair_count; discordant += 1) {
    let conditionalPower = 0;
    const nullUpperTails = binomialUpperTails(discordant, 0.5);
    for (let candidateWins = 0; candidateWins <= discordant; candidateWins += 1) {
      if (nullUpperTails[candidateWins] < alpha) {
        conditionalPower += binomialProbability(discordant, candidateWins, winProbability);
      }
    }
    power += binomialProbability(pair_count, discordant, discordance) * conditionalPower;
  }
  return power;
}

function validateCorpus(corpus) {
  exactKeys(corpus, [
    "schema_version", "contract_id", "strata", "requirements_visibility",
    "hidden_content_allowed", "hidden_requirements", "reference_solution_visibility",
    "hidden_installation_phase", "public_file_count_maximum", "changed_file_count_bounds",
    "medium_multifile_solution_fraction_minimum", "medium_required_topology_edges",
    "high_risk_domains", "allowed_origins",
  ], "corpus contract");
  if (corpus.schema_version !== 2 || corpus.requirements_visibility !== "complete"
    || corpus.hidden_requirements !== "forbidden" || corpus.reference_solution_visibility !== "runner-only"
    || corpus.hidden_installation_phase !== "after-model-settlement"
    || corpus.public_file_count_maximum !== 20
    || corpus.medium_multifile_solution_fraction_minimum !== 0.5) {
    fail("BENCHMARK_V2_CORPUS", "corpus visibility or topology boundary drifted");
  }
  exactSequence(corpus.strata, STRATA, "corpus strata");
  exactSequence(corpus.hidden_content_allowed, ["concrete-examples", "consumers", "tests"], "hidden content boundary");
  exactSequence(corpus.changed_file_count_bounds, [1, 4], "changed-file bounds");
  exactSequence(corpus.medium_required_topology_edges,
    ["entry-point", "consumer", "test-or-config-contract"], "medium topology edges");
  exactSequence(corpus.allowed_origins,
    ["procedural-synthetic", "real-commit-derived-compatible-license"], "allowed corpus origins");
  if (!Array.isArray(corpus.high_risk_domains) || corpus.high_risk_domains.length < 11
    || !corpus.high_risk_domains.includes("authorization")
    || !corpus.high_risk_domains.includes("untrusted-prompt-boundary")) {
    fail("BENCHMARK_V2_CORPUS", "high-risk domain coverage is incomplete");
  }
}

function validateSaltCommitment(commitment) {
  exactKeys(commitment, [
    "schema_version", "commitment_id", "algorithm", "commitment",
    "created_before_holdout_selection", "preimage_storage",
  ], "holdout salt commitment");
  if (commitment.schema_version !== 2
    || commitment.commitment_id !== "benchmark-v2-holdout-preregistered-salt"
    || commitment.algorithm !== "profile-value-sha256-v1"
    || !/^sha256:[0-9a-f]{64}$/u.test(commitment.commitment)
    || commitment.created_before_holdout_selection !== true
    || commitment.preimage_storage !== "git-ignored-private-runtime-state") {
    fail("BENCHMARK_V2_HOLDOUT_SALT", "holdout salt commitment is invalid or not preregistered");
  }
}

function validateRealCommitCandidates(registry) {
  exactKeys(registry, [
    "schema_version", "registry_id", "selection_status", "task_materialization_status",
    "metadata_source", "reference_patch_access", "repositories", "candidates",
  ], "real-commit candidate registry");
  if (registry.schema_version !== 2
    || registry.registry_id !== "benchmark-v2-real-commit-candidates"
    || registry.selection_status !== "candidate-pool-not-selected"
    || registry.task_materialization_status !== "provenance-curated-fixtures-not-yet-materialized"
    || registry.metadata_source !== "github-commit-api-without-patch-bodies"
    || registry.reference_patch_access !== "forbidden-before-model-settlement"
    || !Array.isArray(registry.repositories) || registry.repositories.length < 3
    || !Array.isArray(registry.candidates)) {
    fail("BENCHMARK_V2_REAL_COMMIT_REGISTRY", "real-commit candidate boundary is invalid");
  }
  const repositoryIds = [];
  for (const [index, repository] of registry.repositories.entries()) {
    exactKeys(repository, [
      "id", "url", "license_spdx", "license_path", "license_blob_sha",
    ], `real-commit repository[${index}]`);
    if (!SAFE_ID.test(repository.id)
      || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository.url)
      || repository.license_spdx !== "MIT"
      || typeof repository.license_path !== "string"
      || repository.license_path.length < 1 || repository.license_path.length > 128
      || repository.license_path.startsWith("/") || repository.license_path.includes("\\")
      || repository.license_path.split("/").some((part) => ["", ".", ".."].includes(part))
      || !/^[0-9a-f]{40}$/u.test(repository.license_blob_sha)) {
      fail("BENCHMARK_V2_REAL_COMMIT_REPOSITORY", `real-commit repository[${index}] is invalid`);
    }
    repositoryIds.push(repository.id);
  }
  if (new Set(repositoryIds).size !== repositoryIds.length) {
    fail("BENCHMARK_V2_REAL_COMMIT_REPOSITORY", "real-commit repository IDs must be unique");
  }

  const ids = [];
  const commits = [];
  const usedRepositories = new Set();
  const counts = Object.fromEntries(STRATA.map((stratum) => [stratum, 0]));
  for (const [index, candidate] of registry.candidates.entries()) {
    exactKeys(candidate, [
      "id", "stratum", "repository_id", "commit_sha", "parent_sha", "title", "changed_paths",
    ], `real-commit candidate[${index}]`);
    if (!SAFE_ID.test(candidate.id) || !candidate.id.startsWith(`real-${candidate.stratum}-`)
      || !STRATA.includes(candidate.stratum) || !repositoryIds.includes(candidate.repository_id)
      || !/^[0-9a-f]{40}$/u.test(candidate.commit_sha)
      || !/^[0-9a-f]{40}$/u.test(candidate.parent_sha)
      || candidate.commit_sha === candidate.parent_sha
      || typeof candidate.title !== "string" || candidate.title.length < 3 || candidate.title.length > 160
      || !Array.isArray(candidate.changed_paths)
      || candidate.changed_paths.length < 1 || candidate.changed_paths.length > 4) {
      fail("BENCHMARK_V2_REAL_COMMIT_CANDIDATE", `real-commit candidate[${index}] is invalid`);
    }
    for (const changedPath of candidate.changed_paths) {
      if (typeof changedPath !== "string" || changedPath.length < 1 || changedPath.length > 256
        || changedPath.startsWith("/") || changedPath.includes("\\")
        || changedPath.split("/").some((part) => ["", ".", ".."].includes(part))) {
        fail("BENCHMARK_V2_REAL_COMMIT_PATH", `real-commit candidate[${index}] has an unsafe path`);
      }
    }
    if (new Set(candidate.changed_paths).size !== candidate.changed_paths.length) {
      fail("BENCHMARK_V2_REAL_COMMIT_PATH", `real-commit candidate[${index}] repeats a changed path`);
    }
    ids.push(candidate.id);
    commits.push(`${candidate.repository_id}:${candidate.commit_sha}`);
    usedRepositories.add(candidate.repository_id);
    counts[candidate.stratum] += 1;
  }
  if (new Set(ids).size !== ids.length || new Set(commits).size !== commits.length
    || usedRepositories.size < 3 || STRATA.some((stratum) => counts[stratum] !== 12)) {
    fail("BENCHMARK_V2_REAL_COMMIT_COVERAGE", "real-commit candidates must be unique and provide 12 per stratum across at least three repositories");
  }
  return Object.freeze({ counts, total: registry.candidates.length, repository_count: usedRepositories.size });
}

function validateHoldout(holdout, saltCommitment, selectedHoldoutExists) {
  exactKeys(holdout, [
    "schema_version", "split", "selection_status", "selected_manifest_path",
    "selected_manifest_must_be_absent_before_freeze", "family_count", "family_count_by_stratum",
    "paired_trajectories_per_family", "minimum_real_commit_derived_fraction",
    "minimum_real_commit_derived_families", "seed_derivation", "freeze_bindings",
    "post_selection_mutation_policy", "reference_solution_access",
  ], "holdout selection contract");
  if (holdout.schema_version !== 2 || holdout.split !== "holdout"
    || holdout.selection_status !== "unselected-until-freeze"
    || holdout.selected_manifest_must_be_absent_before_freeze !== true
    || selectedHoldoutExists || holdout.family_count < 60
    || holdout.paired_trajectories_per_family !== 2
    || holdout.minimum_real_commit_derived_fraction !== 0.25
    || holdout.minimum_real_commit_derived_families < Math.ceil(holdout.family_count * 0.25)) {
    fail("BENCHMARK_V2_HOLDOUT", "holdout is selected early or violates size/composition boundaries");
  }
  if (holdout.selected_manifest_path !== ".oc_harness/benchmark-v2/holdout/round-<freeze-fingerprint-prefix>.selected.v2.json"
    || holdout.reference_solution_access !== "runner-only-after-model-settlement") {
    fail("BENCHMARK_V2_HOLDOUT", "holdout output or reference-solution boundary drifted");
  }
  const counts = holdout.family_count_by_stratum;
  if (STRATA.some((stratum) => !Number.isSafeInteger(counts?.[stratum]) || counts[stratum] < 20)
    || STRATA.reduce((sum, stratum) => sum + counts[stratum], 0) !== holdout.family_count) {
    fail("BENCHMARK_V2_HOLDOUT", "holdout stratum counts are invalid");
  }
  exactSequence(holdout.seed_derivation?.ordered_inputs,
    ["frozen_candidate_sha", "github_workflow_run_id", "preregistered_salt"], "holdout seed inputs");
  exactKeys(holdout.seed_derivation, [
    "algorithm", "ordered_inputs", "must_be_unknown_during_development", "salt_commitment_path",
  ], "holdout seed derivation");
  exactSequence(holdout.seed_derivation.must_be_unknown_during_development,
    ["github_workflow_run_id"], "holdout unknown seed inputs");
  exactSequence(holdout.freeze_bindings, [
    "harness_source_sha", "evaluator_fingerprint", "promotion_policy_fingerprint",
    "task_generator_fingerprint", "model", "provider", "variant", "timeout_ms",
  ], "holdout freeze bindings");
  if (holdout.seed_derivation?.algorithm !== "sha256-canonical-json"
    || holdout.seed_derivation.salt_commitment_path !== "benchmarks/v2/holdout/salt-commitment.v2.json"
    || holdout.post_selection_mutation_policy !== "invalidate-confirmatory-round") {
    fail("BENCHMARK_V2_HOLDOUT", "holdout seed or invalidation policy is weak");
  }
  validateSaltCommitment(saltCommitment);
}

function validatePower(power, holdout) {
  exactKeys(power, [
    "schema_version", "analysis_id", "calculated_before_confirmatory_run", "primary_test",
    "allocated_alpha_round_1", "minimum_useful_absolute_effect",
    "assumed_candidate_only_success_probability", "assumed_baseline_only_success_probability",
    "assumed_discordance_probability", "family_count", "paired_trajectories_per_family",
    "paired_observation_count", "exact_power", "minimum_required_power", "cluster_sensitivity",
    "interpretation",
  ], "power analysis");
  if (power.schema_version !== 2 || power.calculated_before_confirmatory_run !== true
    || power.primary_test !== "one-sided-exact-mcnemar" || power.allocated_alpha_round_1 !== 0.025
    || power.minimum_useful_absolute_effect !== 0.08
    || Math.abs((power.assumed_candidate_only_success_probability
      - power.assumed_baseline_only_success_probability) - 0.08) > Number.EPSILON
    || Math.abs(power.assumed_discordance_probability
      - (power.assumed_candidate_only_success_probability
        + power.assumed_baseline_only_success_probability)) > Number.EPSILON
    || power.family_count !== holdout.family_count
    || power.paired_trajectories_per_family !== holdout.paired_trajectories_per_family
    || power.paired_observation_count !== holdout.family_count * holdout.paired_trajectories_per_family) {
    fail("BENCHMARK_V2_POWER", "power analysis is not bound to the holdout design");
  }
  const computed = exactMcNemarPower({
    pair_count: power.paired_observation_count,
    candidate_only_probability: power.assumed_candidate_only_success_probability,
    baseline_only_probability: power.assumed_baseline_only_success_probability,
    alpha: power.allocated_alpha_round_1,
  });
  const sensitivity = exactMcNemarPower({
    pair_count: power.cluster_sensitivity?.effective_pair_count_floor,
    candidate_only_probability: power.assumed_candidate_only_success_probability,
    baseline_only_probability: power.assumed_baseline_only_success_probability,
    alpha: power.allocated_alpha_round_1,
  });
  if (Math.abs(computed - power.exact_power) > 1e-9
    || Math.abs(sensitivity - power.cluster_sensitivity?.exact_power_at_effective_pair_count) > 1e-9
    || computed < power.minimum_required_power || sensitivity < power.minimum_required_power) {
    fail("BENCHMARK_V2_POWER", "declared exact or clustered-sensitivity power is insufficient or stale");
  }
  return Object.freeze({ exact: computed, clustered_sensitivity: sensitivity });
}

function validatePolicy(policy) {
  exactKeys(policy, [
    "schema_version", "policy_id", "status", "applies_only_to_splits", "historical_reinterpretation",
    "primary_metric", "confidence_level", "minimum_paired_improvement",
    "confidence_interval_lower_bound_minimum_exclusive", "statistical_test", "alpha_spending",
    "maximum_confirmatory_rounds", "safety_guardrails", "activation_guardrails", "cost_guardrails",
    "incomplete_outcome_policy", "external_state_policy", "threshold_change_policy",
    "required_bindings", "verdicts",
  ], "promotion policy v2");
  if (policy.schema_version !== 2 || policy.status !== "preregistered-development"
    || policy.historical_reinterpretation !== "forbidden"
    || policy.primary_metric !== "regression_free_task_success" || policy.confidence_level !== 0.95
    || policy.minimum_paired_improvement !== 0.05
    || policy.confidence_interval_lower_bound_minimum_exclusive !== 0
    || policy.statistical_test !== "exact-paired-permutation"
    || policy.maximum_confirmatory_rounds !== 3) {
    fail("BENCHMARK_V2_POLICY", "primary promotion contract drifted");
  }
  exactSequence(policy.applies_only_to_splits, ["validation", "holdout"], "policy split scope");
  exactSequence(policy.alpha_spending, [
    { round: 1, alpha: 0.025 },
    { round: 2, alpha: 0.015 },
    { round: 3, alpha: 0.010 },
  ], "alpha spending");
  const safety = policy.safety_guardrails;
  const activation = policy.activation_guardrails;
  const cost = policy.cost_guardrails;
  exactKeys(safety, [
    "new_critical_regressions_maximum", "high_medium_regression_delta_maximum",
    "safety_delta_upper_confidence_bound_maximum",
    "small_stratum_delta_lower_confidence_bound_minimum", "timeout_rate_delta_maximum",
  ], "policy safety guardrails");
  exactKeys(activation, ["eligible_mechanism_activation_minimum"], "policy activation guardrails");
  exactKeys(cost, [
    "default_core_median_duration_ratio_maximum", "default_core_mean_duration_ratio_maximum",
    "optional_high_risk_duration_ratio_maximum", "optional_high_risk_requires_positive_quality_gain",
  ], "policy cost guardrails");
  if (safety?.new_critical_regressions_maximum !== 0
    || safety?.high_medium_regression_delta_maximum !== 0
    || safety?.safety_delta_upper_confidence_bound_maximum !== 0.02
    || safety?.small_stratum_delta_lower_confidence_bound_minimum !== -0.03
    || safety?.timeout_rate_delta_maximum !== 0.02
    || activation?.eligible_mechanism_activation_minimum !== 0.95
    || cost?.default_core_median_duration_ratio_maximum !== 2
    || cost?.default_core_mean_duration_ratio_maximum !== 2.5
    || cost?.optional_high_risk_duration_ratio_maximum !== 4
    || cost?.optional_high_risk_requires_positive_quality_gain !== true) {
    fail("BENCHMARK_V2_POLICY", "promotion guardrails drifted");
  }
  exactSequence(policy.required_bindings, [
    "source_sha", "evaluator_fingerprint", "promotion_policy_fingerprint",
    "task_generator_fingerprint", "holdout_selection_fingerprint", "model", "provider",
    "variant", "timeout_ms", "fixture_fingerprint", "seed", "arm_ordering_policy",
  ], "promotion policy bindings");
  exactSequence(policy.verdicts,
    ["promote", "reject", "inconclusive", "blocked-unproven"], "promotion verdicts");
  if (policy.incomplete_outcome_policy !== "separate-not-scored"
    || policy.external_state_policy !== "blocked-unproven"
    || policy.threshold_change_policy !== "new-policy-version-and-new-disjoint-holdout") {
    fail("BENCHMARK_V2_POLICY", "incomplete, external-state, or threshold-change policy drifted");
  }
}

export function validateBenchmarkV2Contracts({
  corpus,
  dev,
  devBindings,
  validation,
  validationBindings,
  holdout,
  saltCommitment,
  realCommitCandidates,
  power,
  policy,
  pilot,
  selectedHoldoutExists = false,
} = {}) {
  validateCorpus(corpus);
  const devSummary = validateFamilies(dev, { split: "development", minimumPerStratum: 12, exactPerStratum: 12 });
  validateRenderBindings(devBindings, devSummary, "development");
  const validationSummary = validateFamilies(validation, { split: "validation", minimumPerStratum: 10, exactPerStratum: 10 });
  validateRenderBindings(validationBindings, validationSummary, "validation");
  const allIds = [...devSummary.ids, ...validationSummary.ids];
  const allRecipes = [...devSummary.recipes, ...validationSummary.recipes];
  if (new Set(allIds).size !== allIds.length || new Set(allRecipes).size !== allRecipes.length) {
    fail("BENCHMARK_V2_SPLIT_OVERLAP", "development and validation families or recipes overlap");
  }
  validateHoldout(holdout, saltCommitment, selectedHoldoutExists);
  const realCommitSummary = validateRealCommitCandidates(realCommitCandidates);
  const powerSummary = validatePower(power, holdout);
  validatePolicy(policy);
  validateBenchmarkV2PilotContract(pilot);
  const source = {
    corpus, dev, devBindings, validation, validationBindings, holdout, saltCommitment,
    realCommitCandidates, power, policy, pilot,
  };
  return Object.freeze({
    status: "passed",
    evidence_class: "model-free-contract-validation",
    model_execution: false,
    execution_status: "development-and-validation-executable",
    family_counts: Object.freeze({
      development: devSummary.counts,
      validation: validationSummary.counts,
      holdout_planned: holdout.family_count_by_stratum,
    }),
    family_totals: Object.freeze({
      development: devSummary.total,
      validation: validationSummary.total,
      holdout_planned: holdout.family_count,
    }),
    paired_holdout_observations: power.paired_observation_count,
    real_commit_candidate_count: realCommitSummary.total,
    real_commit_repository_count: realCommitSummary.repository_count,
    exact_power: powerSummary.exact,
    clustered_sensitivity_power: powerSummary.clustered_sensitivity,
    contract_fingerprint: fingerprint(source),
  });
}

export function loadBenchmarkV2Contracts(root) {
  const repositoryRoot = path.resolve(root);
  const loaded = Object.fromEntries(Object.entries(BENCHMARK_V2_PATHS)
    .map(([key, relativePath]) => [key, readJson(repositoryRoot, relativePath)]));
  return Object.freeze({
    ...loaded,
    selectedHoldoutExists: false,
  });
}

export function validateLoadedBenchmarkV2Contracts(root) {
  return validateBenchmarkV2Contracts(loadBenchmarkV2Contracts(root));
}
