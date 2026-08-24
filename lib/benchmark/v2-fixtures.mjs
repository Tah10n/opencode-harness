import { createHash } from "node:crypto";

import { fingerprintProfileValue } from "../profile-v3.mjs";
import { renderVnextInstance, validateRenderedVnextInstance } from "./vnext-fixtures.mjs";
import {
  BENCHMARK_V2_VALIDATION_KERNELS,
  BENCHMARK_V2_VALIDATION_VISIBLE_REQUIREMENTS,
} from "./v2-validation-kernels.mjs";
import {
  BENCHMARK_V2_HOLDOUT_HIGH_KERNELS,
  BENCHMARK_V2_HOLDOUT_MEDIUM_KERNELS,
  BENCHMARK_V2_HOLDOUT_SMALL_KERNELS,
} from "./v2-holdout-kernels.mjs";
import { BENCHMARK_V2_REAL_HOLDOUT_KERNELS } from "./v2-real-holdout-kernels.mjs";

function renderedFile(filePath, content) {
  return Object.freeze({
    path: filePath,
    content,
    bytes: Buffer.byteLength(content, "utf8"),
    line_count: content.length === 0 ? 0 : content.split("\n").length - (content.endsWith("\n") ? 1 : 0),
    content_fingerprint: fingerprintProfileValue({ path: filePath, content }),
  });
}

function stableVariant(seed, familyId, maximum = 5) {
  const digest = createHash("sha256").update(`${seed}\0${familyId}`).digest();
  return (digest.readUInt32BE(0) % maximum) + 1;
}

function familyDefinition(family, binding, seed) {
  if (binding.kernel_id !== undefined) {
    return Object.freeze({
      id: family.id,
      fixture_id: `v2-${family.id}`,
      stratum: "high",
      source_family_id: "path-confinement",
      source_semantic_variant: stableVariant(seed, family.id),
      kernel_id: binding.kernel_id,
      requirement_visibility: "complete",
      change_file_bounds: Object.freeze([1, 4]),
      potential_file_bounds: Object.freeze([8, 20]),
    });
  }
  return Object.freeze({
    id: family.id,
    fixture_id: `v2-${family.id}`,
    stratum: family.stratum,
    source_family_id: binding.source_family_id,
    source_semantic_variant: binding.semantic_variant,
    requirement_visibility: "complete",
    change_file_bounds: Object.freeze(family.stratum === "medium" ? [1, 4] : [1, 2]),
    potential_file_bounds: Object.freeze(family.stratum === "medium" ? [8, 20] : [1, 7]),
  });
}

function replaceFile(files, replacement) {
  let replaced = false;
  const result = files.map((file) => {
    if (file.path !== replacement.path) return file;
    replaced = true;
    return replacement;
  });
  if (!replaced) throw new Error(`missing rendered file ${replacement.path}`);
  return Object.freeze(result);
}

function rebuildFingerprints(instance, additions) {
  const source = { ...instance, ...additions };
  const publicFixtureFingerprint = fingerprintProfileValue(source.public_files.map((entry) => ({
    path: entry.path,
    fingerprint: entry.content_fingerprint,
  })));
  const hiddenFixtureFingerprint = fingerprintProfileValue(source.hidden_files.map((entry) => ({
    path: entry.path,
    fingerprint: entry.content_fingerprint,
  })));
  const body = {
    ...source,
    public_fixture_fingerprint: publicFixtureFingerprint,
    hidden_fixture_fingerprint: hiddenFixtureFingerprint,
    generated_fixture_fingerprint: fingerprintProfileValue({
      publicFixtureFingerprint,
      hiddenFixtureFingerprint,
      topology: source.topology,
    }),
  };
  return Object.freeze({ ...body, instance_fingerprint: fingerprintProfileValue(body) });
}

function augmentMultifileMedium(instance, family) {
  const taskPath = instance.task_scope.allowed_changed_paths[0];
  const initialConfigFile = instance.public_files.find((file) => file.path === "config/feature.json");
  if (initialConfigFile === undefined) throw new Error(`${family.id} lacks its visible config contract`);
  const initialConfig = JSON.parse(initialConfigFile.content);
  const fixedConfigFile = renderedFile("config/feature.json", `${JSON.stringify({
    ...initialConfig,
    contract_version: 2,
  }, null, 2)}\n`);
  const hiddenConfigFile = renderedFile("test/hidden-consumer-config-binding.test.mjs", `import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test(${JSON.stringify(`${family.id} config binding`)}, () => {
  const config = JSON.parse(fs.readFileSync(new URL("../config/feature.json", import.meta.url), "utf8"));
  assert.equal(config.family, ${JSON.stringify(family.id)});
  assert.equal(config.entry, ${JSON.stringify(taskPath)});
  assert.equal(config.contract_version, 2);
});
`);
  const changedPaths = Object.freeze([taskPath, "config/feature.json"].sort());
  const visibleGoal = instance.prompt.split(" Task scope:")[0];
  return rebuildFingerprints(instance, {
    prompt: `${visibleGoal} Also update config/feature.json to set numeric contract_version to 2. Task scope: modify only these visible repository paths: ${changedPaths.map((entry) => `\`${entry}\``).join(", ")}. At most 2 files may change. Do not create or modify any other file; reading other visible repository files is allowed.`,
    public_files: replaceFile(instance.public_files, initialConfigFile),
    hidden_files: replaceFile(instance.hidden_files, hiddenConfigFile),
    solution_files: Object.freeze([...instance.solution_files, fixedConfigFile]),
    task_scope: Object.freeze({ mode: "edit", allowed_changed_paths: changedPaths, max_changed_files: 2 }),
    workspace_policy: Object.freeze({
      ...instance.workspace_policy,
      expected_changed_paths: changedPaths,
      forbidden_paths: Object.freeze(instance.workspace_policy.forbidden_paths.filter((entry) => entry !== "config/feature.json")),
      max_changed_files: 2,
    }),
  });
}

export function renderBenchmarkV2DevelopmentFamily({
  repositoryRoot,
  family,
  binding,
  seed,
  repetition = 1,
} = {}) {
  if (family?.id !== binding?.family_id) throw new Error("v2 development family and binding do not match");
  const definition = familyDefinition(family, binding, seed);
  const rendered = renderVnextInstance({ repositoryRoot, family: definition, seed, repetition });
  const instance = binding.multifile_solution === true
    ? augmentMultifileMedium(rendered, family)
    : rendered;
  validateRenderedVnextInstance(instance, definition);
  return instance;
}

export function renderBenchmarkV2DevelopmentCorpus({
  repositoryRoot,
  manifest,
  bindings,
  seed,
  repetition = 1,
} = {}) {
  const bindingByFamily = new Map(bindings.bindings.map((entry) => [entry.family_id, entry]));
  return Object.freeze(manifest.families.map((family) => renderBenchmarkV2DevelopmentFamily({
    repositoryRoot,
    family,
    binding: bindingByFamily.get(family.id),
    seed,
    repetition,
  })));
}

function replaceValidationKernel(instance, family, binding, kernels = BENCHMARK_V2_VALIDATION_KERNELS) {
  const kernel = kernels[binding.kernel_id];
  if (kernel === undefined) throw new Error(`missing benchmark v2 kernel ${binding.kernel_id}`);
  const visibleRequirements = kernels === BENCHMARK_V2_VALIDATION_KERNELS
    ? BENCHMARK_V2_VALIDATION_VISIBLE_REQUIREMENTS[binding.kernel_id]
    : kernel.contract;
  if (visibleRequirements === undefined) throw new Error(`missing benchmark v2 visible requirements ${binding.kernel_id}`);
  const taskPath = instance.task_scope.allowed_changed_paths[0];
  const importPath = `../${taskPath}`;
  const taskFile = renderedFile(taskPath, kernel.buggy);
  const solutionFile = renderedFile(taskPath, kernel.fixed);
  const publicTest = renderedFile("test/public.test.mjs", `import test from "node:test";
import assert from "node:assert/strict";
import { ${kernel.api} } from ${JSON.stringify(importPath)};
test(${JSON.stringify(kernel.contract)}, async () => { ${kernel.publicCase} });
`);
  const hiddenTest = renderedFile("test/hidden.test.mjs", `import test from "node:test";
import assert from "node:assert/strict";
import { ${kernel.api} } from ${JSON.stringify(importPath)};
test(${JSON.stringify(`${kernel.contract} hidden examples`)}, async () => { ${kernel.hiddenCase} });
`);
  let hiddenFiles = replaceFile(instance.hidden_files, hiddenTest);
  if (family.stratum !== "small") {
    hiddenFiles = replaceFile(hiddenFiles, renderedFile("test/hidden-consumer-remote-worker.test.mjs", `import test from "node:test";
import assert from "node:assert/strict";
import { workerContract } from "../src/consumers/worker.mjs";
test(${JSON.stringify(`${family.id} remote worker contract`)}, () => {
  assert.deepEqual(workerContract, ${JSON.stringify([kernel.api, "family"].sort())});
});
`));
  }
  const changedPaths = Object.freeze([taskPath]);
  const definition = Object.freeze({
    id: family.id,
    fixture_id: `v2-${family.id}`,
    stratum: family.stratum,
    source_family_id: "function-boundaries",
    source_semantic_variant: 1,
    kernel_id: binding.kernel_id,
    requirement_visibility: "complete",
    change_file_bounds: Object.freeze(family.stratum === "small" ? [1, 2] : [1, 4]),
    potential_file_bounds: Object.freeze(family.stratum === "small" ? [1, 7] : [8, 20]),
  });
  return {
    definition,
    instance: rebuildFingerprints(instance, {
      category: family.stratum === "high" ? "high-risk-contract" : instance.category,
      risk: family.stratum === "high" ? "critical" : instance.risk,
      prompt: `Repair the ${kernel.contract} defect. Complete visible behavior: ${visibleRequirements}. Preserve the public ${kernel.api} API, modify only ${taskPath}, inspect visible consumers for ${family.stratum === "small" ? "local compatibility" : "repository compatibility"}, and run the visible check.`,
      public_files: replaceFile(replaceFile(instance.public_files, taskFile), publicTest),
      hidden_files: hiddenFiles,
      solution_files: Object.freeze([solutionFile]),
      task_scope: Object.freeze({ mode: "edit", allowed_changed_paths: changedPaths, max_changed_files: 1 }),
      workspace_policy: Object.freeze({
        ...instance.workspace_policy,
        expected_changed_paths: changedPaths,
        max_changed_files: 1,
      }),
      ...(family.stratum === "high" ? {
        high_risk_contract: Object.freeze({
          kernel_id: binding.kernel_id,
          property: kernel.contract,
          visible_requirements: visibleRequirements,
          oracle_kind: "executable-hidden-test",
        }),
      } : {}),
    }),
  };
}

export function renderBenchmarkV2ValidationFamily({
  repositoryRoot,
  family,
  binding,
  seed,
  repetition = 1,
} = {}) {
  if (family?.id !== binding?.family_id) throw new Error("v2 validation family and binding do not match");
  const baseStratum = family.stratum === "small" ? "small" : "medium";
  const baseDefinition = Object.freeze({
    id: family.id,
    fixture_id: `v2-${family.id}`,
    stratum: baseStratum,
    source_family_id: baseStratum === "small" ? "function-boundaries" : "hidden-consumer-discovery",
    source_semantic_variant: stableVariant(seed, family.id),
    requirement_visibility: "complete",
    change_file_bounds: Object.freeze(baseStratum === "small" ? [1, 2] : [1, 4]),
    potential_file_bounds: Object.freeze(baseStratum === "small" ? [1, 7] : [8, 20]),
  });
  const base = renderVnextInstance({ repositoryRoot, family: baseDefinition, seed, repetition });
  const replaced = replaceValidationKernel(base, family, binding);
  const instance = binding.multifile_solution === true
    ? augmentMultifileMedium(replaced.instance, family)
    : replaced.instance;
  validateRenderedVnextInstance(instance, replaced.definition);
  return instance;
}

export function renderBenchmarkV2ValidationCorpus({
  repositoryRoot,
  manifest,
  bindings,
  seed,
  repetition = 1,
} = {}) {
  const bindingByFamily = new Map(bindings.bindings.map((entry) => [entry.family_id, entry]));
  return Object.freeze(manifest.families.map((family) => renderBenchmarkV2ValidationFamily({
    repositoryRoot,
    family,
    binding: bindingByFamily.get(family.id),
    seed,
    repetition,
  })));
}

export function renderBenchmarkV2ProceduralSmallCorpus({
  repositoryRoot,
  registry,
  seed,
  repetition = 1,
} = {}) {
  if (registry?.registry_id !== "benchmark-v2-procedural-holdout-candidates"
    || registry.selection_status !== "candidate-pool-not-selected"
    || registry.task_materialization_status !== "executable") {
    throw new Error("procedural holdout registry is not the preregistered executable source");
  }
  const families = registry.candidates.filter((candidate) => candidate.stratum === "small");
  if (families.length !== 24 || families.some((family) => family.changed_file_count !== 1)) {
    throw new Error("procedural small registry coverage drifted");
  }
  return Object.freeze(families.map((family) => {
    const binding = Object.freeze({ family_id: family.id, kernel_id: family.recipe_id });
    const baseDefinition = Object.freeze({
      id: family.id,
      fixture_id: `v2-${family.id}`,
      stratum: "small",
      source_family_id: "function-boundaries",
      source_semantic_variant: stableVariant(seed, family.id),
      requirement_visibility: "complete",
      change_file_bounds: Object.freeze([1, 2]),
      potential_file_bounds: Object.freeze([1, 7]),
    });
    const base = renderVnextInstance({ repositoryRoot, family: baseDefinition, seed, repetition });
    const replaced = replaceValidationKernel(base, family, binding, BENCHMARK_V2_HOLDOUT_SMALL_KERNELS);
    validateRenderedVnextInstance(replaced.instance, replaced.definition);
    return replaced.instance;
  }));
}

function renderBenchmarkV2ProceduralMultifileFamily({ repositoryRoot, family, seed, repetition, kernels }) {
  const kernel = kernels[family.recipe_id];
  if (kernel === undefined) throw new Error(`missing benchmark v2 ${family.stratum} kernel ${family.recipe_id}`);
  const definition = Object.freeze({
    id: family.id,
    fixture_id: `v2-${family.id}`,
    stratum: family.stratum,
    source_family_id: "hidden-consumer-discovery",
    source_semantic_variant: stableVariant(seed, family.id),
    requirement_visibility: "complete",
    change_file_bounds: Object.freeze([2, 4]),
    potential_file_bounds: Object.freeze([8, 20]),
    ...(family.stratum === "high" ? { kernel_id: family.recipe_id } : {}),
  });
  const renderDefinition = family.stratum === "high"
    ? Object.freeze({ ...definition, stratum: "medium" })
    : definition;
  const base = renderVnextInstance({ repositoryRoot, family: renderDefinition, seed, repetition });
  const taskPath = base.task_scope.allowed_changed_paths[0];
  const taskFile = renderedFile(taskPath, kernel.buggy);
  const fixedTaskFile = renderedFile(taskPath, kernel.fixed);
  const publicApiPath = "src/public-api.mjs";
  const publicApiFile = renderedFile(publicApiPath, `export { ${kernel.api} } from "./value.mjs";
export const contractVersion = 1;
export const family = ${JSON.stringify(family.id)};
`);
  const fixedPublicApiFile = renderedFile(publicApiPath, `export { ${kernel.api} } from "./value.mjs";
export const contractVersion = 2;
export const family = ${JSON.stringify(family.id)};
`);
  const publicTest = renderedFile("test/public.test.mjs", `import test from "node:test";
import assert from "node:assert/strict";
import { ${kernel.api}, contractVersion } from "../src/public-api.mjs";
test(${JSON.stringify(kernel.contract)}, async () => { assert.equal(contractVersion, 2); ${kernel.publicCase} });
`);
  const hiddenTest = renderedFile("test/hidden.test.mjs", `import test from "node:test";
import assert from "node:assert/strict";
import { ${kernel.api}, contractVersion } from "../src/public-api.mjs";
test(${JSON.stringify(`${kernel.contract} hidden examples`)}, async () => { assert.equal(contractVersion, 2); ${kernel.hiddenCase} });
`);
  const hiddenConsumer = renderedFile("test/hidden-consumer-remote-worker.test.mjs", `import test from "node:test";
import assert from "node:assert/strict";
import { workerContract } from "../src/consumers/worker.mjs";
test(${JSON.stringify(`${family.id} remote public API contract`)}, () => {
  assert.deepEqual(workerContract, ${JSON.stringify([kernel.api, "contractVersion", "family"].sort())});
});
`);
  const changedPaths = Object.freeze([taskPath, publicApiPath].sort());
  const instance = rebuildFingerprints(base, {
    prompt: `Repair the ${kernel.contract} defect${family.risk_domain === undefined ? "" : ` in the ${family.risk_domain} risk domain`}. Complete visible behavior: ${kernel.contract}. Preserve the public ${kernel.api} API through the visible entry point, set its numeric contractVersion export to 2, preserve the visible remote-consumer chain, modify only ${changedPaths.map((entry) => `\`${entry}\``).join(" and ")}, and run the visible check.`,
    public_files: replaceFile(replaceFile(replaceFile(base.public_files, taskFile), publicApiFile), publicTest),
    hidden_files: replaceFile(replaceFile(base.hidden_files, hiddenTest), hiddenConsumer),
    solution_files: Object.freeze([fixedTaskFile, fixedPublicApiFile]),
    task_scope: Object.freeze({ mode: "edit", allowed_changed_paths: changedPaths, max_changed_files: 2 }),
    workspace_policy: Object.freeze({
      ...base.workspace_policy,
      expected_changed_paths: changedPaths,
      forbidden_paths: Object.freeze(base.workspace_policy.forbidden_paths.filter((entry) => entry !== publicApiPath)),
      max_changed_files: 2,
    }),
    ...(family.stratum === "high" ? {
      category: "high-risk-contract",
      risk: "critical",
      high_risk_contract: Object.freeze({
        kernel_id: family.recipe_id,
        property: kernel.contract,
        visible_requirements: kernel.contract,
        risk_domain: family.risk_domain,
        oracle_kind: "executable-hidden-test",
      }),
    } : {}),
  });
  validateRenderedVnextInstance(instance, definition);
  return instance;
}

export function renderBenchmarkV2ProceduralMediumCorpus({
  repositoryRoot,
  registry,
  seed,
  repetition = 1,
} = {}) {
  if (registry?.registry_id !== "benchmark-v2-procedural-holdout-candidates"
    || registry.selection_status !== "candidate-pool-not-selected"
    || registry.task_materialization_status !== "executable") {
    throw new Error("procedural holdout registry is not the preregistered executable source");
  }
  const families = registry.candidates.filter((candidate) => candidate.stratum === "medium");
  if (families.length !== 24 || families.some((family) => family.changed_file_count !== 2)) {
    throw new Error("procedural medium registry coverage drifted");
  }
  return Object.freeze(families.map((family) => renderBenchmarkV2ProceduralMultifileFamily({
    repositoryRoot, family, seed, repetition, kernels: BENCHMARK_V2_HOLDOUT_MEDIUM_KERNELS,
  })));
}

export function renderBenchmarkV2ProceduralHighCorpus({
  repositoryRoot,
  registry,
  seed,
  repetition = 1,
} = {}) {
  if (registry?.registry_id !== "benchmark-v2-procedural-holdout-candidates"
    || registry.selection_status !== "candidate-pool-not-selected"
    || registry.task_materialization_status !== "executable") {
    throw new Error("procedural holdout registry is not the preregistered executable source");
  }
  const families = registry.candidates.filter((candidate) => candidate.stratum === "high");
  if (families.length !== 24 || families.some((family) => family.changed_file_count !== 2)) {
    throw new Error("procedural high registry coverage drifted");
  }
  return Object.freeze(families.map((family) => renderBenchmarkV2ProceduralMultifileFamily({
    repositoryRoot, family, seed, repetition, kernels: BENCHMARK_V2_HOLDOUT_HIGH_KERNELS,
  })));
}

export function buildBenchmarkV2ProceduralHoldoutPool({ registry, instances } = {}) {
  if (registry?.registry_id !== "benchmark-v2-procedural-holdout-candidates"
    || registry.origin !== "procedural-synthetic"
    || registry.task_materialization_status !== "executable"
    || !Array.isArray(instances) || instances.length !== 72) {
    throw new Error("procedural holdout pool requires the complete executable registry and 72 instances");
  }
  const instanceById = new Map(instances.map((instance) => [instance.family_id, instance]));
  if (instanceById.size !== 72) throw new Error("procedural holdout pool instances are not unique");
  const candidates = registry.candidates.map((candidate) => {
    const instance = instanceById.get(candidate.id);
    const publicPaths = new Set(instance?.public_files?.map((file) => file.path));
    if (instance === undefined || instance.solution_files.length !== candidate.changed_file_count
      || instance.public_files.length > 20
      || instance.solution_files.some((file) => !instance.task_scope.allowed_changed_paths.includes(file.path))
      || instance.hidden_files.some((file) => publicPaths.has(file.path))
      || instance.prompt.includes("reference solution")
      || !/^sha256:[0-9a-f]{64}$/u.test(instance.instance_fingerprint)) {
      throw new Error(`procedural holdout instance ${candidate.id} violates executable pool bounds`);
    }
    return Object.freeze({
      id: candidate.id,
      stratum: candidate.stratum,
      origin: "procedural-synthetic",
      task_identity: `procedural-v2:${candidate.id}:${candidate.recipe_id}`,
      fixture_fingerprint: instance.instance_fingerprint,
    });
  });
  return Object.freeze({
    schema_version: 2,
    registry_id: "benchmark-v2-procedural-executable-pool",
    origin: "procedural-synthetic",
    selection_status: "candidate-pool-not-selected",
    task_materialization_status: "executable",
    reference_solution_access: "runner-only-after-model-settlement",
    candidates: Object.freeze(candidates),
  });
}

function realCommitRequirements(registry, requirements) {
  if (registry?.schema_version !== 2
    || registry.registry_id !== "benchmark-v2-real-commit-candidates"
    || registry.selection_status !== "candidate-pool-not-selected"
    || registry.task_materialization_status !== "provenance-curated-fixtures-not-yet-materialized"
    || registry.reference_patch_access !== "forbidden-before-model-settlement"
    || !Array.isArray(registry.candidates) || registry.candidates.length !== 36
    || requirements?.schema_version !== 2
    || requirements.manifest_id !== "benchmark-v2-real-commit-visible-requirements"
    || requirements.status !== "curated-pre-reference-oracle-audit"
    || requirements.requirements_visibility !== "complete-for-declared-oracle-scope"
    || requirements.reference_patch_access !== "forbidden-before-model-settlement"
    || !Array.isArray(requirements.requirements) || requirements.requirements.length !== 36) {
    throw new Error("real-commit holdout provenance or visible-requirement boundary is invalid");
  }
  const byCandidate = new Map(requirements.requirements.map((entry) => [entry.candidate_id, entry]));
  if (byCandidate.size !== 36 || registry.candidates.some((candidate) => {
    const requirement = byCandidate.get(candidate.id);
    return requirement === undefined || typeof requirement.visible_requirement !== "string"
      || requirement.visible_requirement.length < 40 || typeof requirement.evidence_url !== "string"
      || BENCHMARK_V2_REAL_HOLDOUT_KERNELS[candidate.id] === undefined;
  })) {
    throw new Error("real-commit holdout does not have one executable visible contract per candidate");
  }
  return byCandidate;
}

export function renderBenchmarkV2RealCommitCorpus({
  repositoryRoot,
  registry,
  requirements,
  seed,
  repetition = 1,
} = {}) {
  const requirementByCandidate = realCommitRequirements(registry, requirements);
  const instances = registry.candidates.map((candidate) => {
    const requirement = requirementByCandidate.get(candidate.id);
    const kernel = Object.freeze({
      ...BENCHMARK_V2_REAL_HOLDOUT_KERNELS[candidate.id],
      contract: requirement.visible_requirement,
    });
    const family = Object.freeze({
      id: candidate.id,
      stratum: candidate.stratum,
      recipe_id: candidate.id,
      changed_file_count: candidate.stratum === "small" ? 1 : 2,
      ...(candidate.stratum === "high" ? { risk_domain: "real-commit-contract" } : {}),
    });
    let instance;
    if (candidate.stratum === "small") {
      const definition = Object.freeze({
        id: candidate.id,
        fixture_id: `v2-${candidate.id}`,
        stratum: "small",
        source_family_id: "function-boundaries",
        source_semantic_variant: stableVariant(seed, candidate.id),
        requirement_visibility: "complete",
        change_file_bounds: Object.freeze([1, 2]),
        potential_file_bounds: Object.freeze([1, 7]),
      });
      const base = renderVnextInstance({ repositoryRoot, family: definition, seed, repetition });
      const replaced = replaceValidationKernel(base, family,
        Object.freeze({ family_id: candidate.id, kernel_id: candidate.id }),
        Object.freeze({ [candidate.id]: kernel }));
      validateRenderedVnextInstance(replaced.instance, replaced.definition);
      instance = replaced.instance;
    } else {
      instance = renderBenchmarkV2ProceduralMultifileFamily({
        repositoryRoot,
        family,
        seed,
        repetition,
        kernels: Object.freeze({ [candidate.id]: kernel }),
      });
    }
    return rebuildFingerprints(instance, {
      prompt: `${instance.prompt} Provenance: compatible-license real-commit micro-repair ${candidate.repository_id}@${candidate.parent_sha}; the complete behavioral requirement above was curated from ${requirement.evidence_url} without exposing a reference patch.`,
    });
  });
  const counts = Object.fromEntries(["small", "medium", "high"].map((stratum) => [
    stratum, instances.filter((instance) => instance.family_id.startsWith(`real-${stratum}-`)).length,
  ]));
  if (JSON.stringify(counts) !== JSON.stringify({ small: 12, medium: 12, high: 12 })
    || instances.some((instance) => instance.public_files.length > 20
      || instance.solution_files.length < 1 || instance.solution_files.length > 4
      || instance.solution_files.some((file) => !instance.task_scope.allowed_changed_paths.includes(file.path)))) {
    throw new Error("real-commit holdout executable corpus violates size, stratum, or change bounds");
  }
  return Object.freeze(instances);
}

export function buildBenchmarkV2RealCommitHoldoutPool({ registry, instances } = {}) {
  if (registry?.registry_id !== "benchmark-v2-real-commit-candidates"
    || !Array.isArray(instances) || instances.length !== 36) {
    throw new Error("real-commit holdout pool requires the complete rendered corpus");
  }
  const instanceById = new Map(instances.map((instance) => [instance.family_id, instance]));
  if (instanceById.size !== 36) throw new Error("real-commit holdout instances are not unique");
  const candidates = registry.candidates.map((candidate) => {
    const instance = instanceById.get(candidate.id);
    if (instance === undefined || !/^sha256:[0-9a-f]{64}$/u.test(instance.instance_fingerprint)
      || instance.prompt.includes("reference solution") || instance.public_files.length > 20) {
      throw new Error(`real-commit holdout instance ${candidate.id} is not executable and sealed`);
    }
    return Object.freeze({
      id: candidate.id,
      stratum: candidate.stratum,
      origin: "real-commit-derived-compatible-license",
      task_identity: `real-commit-v2:${candidate.repository_id}@${candidate.parent_sha}:${candidate.id}`,
      fixture_fingerprint: instance.instance_fingerprint,
    });
  });
  return Object.freeze({
    schema_version: 2,
    registry_id: "benchmark-v2-real-commit-executable-pool",
    origin: "real-commit-derived-compatible-license",
    selection_status: "candidate-pool-not-selected",
    task_materialization_status: "executable",
    reference_solution_access: "runner-only-after-model-settlement",
    candidates: Object.freeze(candidates),
  });
}

export function validateBenchmarkV2DevelopmentCorpus(instances) {
  if (!Array.isArray(instances) || instances.length !== 36) throw new Error("v2 development corpus must contain 36 instances");
  const familyIds = new Set();
  const counts = { small: 0, medium: 0, high: 0 };
  let mediumMultifile = 0;
  for (const instance of instances) {
    if (familyIds.has(instance.family_id)) throw new Error("v2 development corpus contains duplicate families");
    familyIds.add(instance.family_id);
    const stratum = instance.family_id.split("-")[1];
    if (!Object.hasOwn(counts, stratum)) throw new Error(`unknown v2 stratum for ${instance.family_id}`);
    counts[stratum] += 1;
    if (instance.public_files.length > 20 || instance.solution_files.length < 1 || instance.solution_files.length > 4
      || instance.task_scope.allowed_changed_paths.length < 1 || instance.task_scope.allowed_changed_paths.length > 4
      || instance.solution_files.some((solution) => !instance.task_scope.allowed_changed_paths.includes(solution.path))) {
      throw new Error(`${instance.family_id} violates public/change/reference bounds`);
    }
    if (stratum === "medium" && instance.solution_files.length >= 2) mediumMultifile += 1;
    const publicPaths = new Set(instance.public_files.map((file) => file.path));
    if (instance.hidden_files.some((file) => publicPaths.has(file.path))) {
      throw new Error(`${instance.family_id} exposes hidden material`);
    }
  }
  if (JSON.stringify(counts) !== JSON.stringify({ small: 12, medium: 12, high: 12 })) {
    throw new Error("v2 development stratum counts drifted");
  }
  if (mediumMultifile < 6) throw new Error("v2 development medium multifile fraction is below 0.5");
  return Object.freeze({ family_count: instances.length, counts: Object.freeze(counts), medium_multifile_count: mediumMultifile });
}

export function validateBenchmarkV2ValidationCorpus(instances) {
  if (!Array.isArray(instances) || instances.length !== 30) throw new Error("v2 validation corpus must contain 30 instances");
  const counts = { small: 0, medium: 0, high: 0 };
  const familyIds = new Set();
  let mediumMultifile = 0;
  for (const instance of instances) {
    if (familyIds.has(instance.family_id)) throw new Error("v2 validation corpus contains duplicate families");
    familyIds.add(instance.family_id);
    const stratum = instance.family_id.split("-")[1];
    if (!Object.hasOwn(counts, stratum)) throw new Error(`unknown v2 validation stratum for ${instance.family_id}`);
    counts[stratum] += 1;
    if (instance.public_files.length > 20 || instance.solution_files.length < 1 || instance.solution_files.length > 4
      || instance.solution_files.some((solution) => !instance.task_scope.allowed_changed_paths.includes(solution.path))) {
      throw new Error(`${instance.family_id} violates validation corpus bounds`);
    }
    if (stratum === "medium" && instance.solution_files.length >= 2) mediumMultifile += 1;
  }
  if (JSON.stringify(counts) !== JSON.stringify({ small: 10, medium: 10, high: 10 }) || mediumMultifile < 5) {
    throw new Error("v2 validation composition drifted");
  }
  return Object.freeze({ family_count: instances.length, counts: Object.freeze(counts), medium_multifile_count: mediumMultifile });
}
