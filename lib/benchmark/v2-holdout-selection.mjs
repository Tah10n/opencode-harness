import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { fingerprintProfileValue } from "../profile-v3.mjs";

const STRATA = Object.freeze(["small", "medium", "high"]);
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const ORIGINS = Object.freeze(["procedural-synthetic", "real-commit-derived-compatible-license"]);

export class BenchmarkV2HoldoutSelectionError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "BenchmarkV2HoldoutSelectionError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new BenchmarkV2HoldoutSelectionError(code, message);
}

function exactKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    fail("BENCHMARK_V2_HOLDOUT_SELECTION_SCHEMA", `${label} has unexpected fields`);
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function seededRank(seed, namespace, value) {
  return createHash("sha256").update(JSON.stringify(canonical({ seed, namespace, value }))).digest("hex");
}

function validateFreezeEnvelope(manifest) {
  exactKeys(manifest, [
    "schema_version", "manifest_kind", "status", "confirmatory_round", "allocated_alpha",
    "github_workflow_run_id", "salt_commitment", "holdout_seed", "holdout_selected",
    "selected_holdout_manifest", "bindings", "freeze_fingerprint",
  ], "freeze manifest");
  const { freeze_fingerprint: declared, ...source } = manifest;
  exactKeys(manifest.bindings, [
    "harness_source_sha", "harness_tree_sha", "harness_fingerprint", "evaluator_fingerprint",
    "promotion_policy_fingerprint", "task_generator_fingerprint", "benchmark_contract_fingerprint",
    "model", "provider", "variant", "timeout_ms", "executable_fingerprint",
    "candidate_profile_id", "candidate_profile_fingerprint", "arm_ordering_policy",
  ], "freeze bindings");
  if (manifest.schema_version !== 2 || manifest.manifest_kind !== "benchmark-v2-confirmatory-freeze"
    || manifest.status !== "frozen-pre-selection" || manifest.holdout_selected !== false
    || manifest.selected_holdout_manifest !== null || !SHA256.test(manifest.holdout_seed)
    || !SHA256.test(declared) || fingerprintProfileValue(source) !== declared
    || !/^[0-9a-f]{40}$/u.test(manifest.bindings.harness_source_sha)
    || !/^[0-9a-f]{40}$/u.test(manifest.bindings.harness_tree_sha)
    || ["harness_fingerprint", "evaluator_fingerprint", "promotion_policy_fingerprint",
      "task_generator_fingerprint", "benchmark_contract_fingerprint", "executable_fingerprint",
      "candidate_profile_fingerprint"]
      .some((key) => !SHA256.test(manifest.bindings[key]))
    || !Number.isSafeInteger(manifest.bindings.timeout_ms)
    || manifest.bindings.timeout_ms < 60_000 || manifest.bindings.timeout_ms > 3_600_000
    || !["P1", "P2", "P3", "P4", "P34", "P35", "P36", "P37", "P38", "P39", "P40", "P41", "P42", "P43", "P44", "P45", "P46", "P47", "P48", "P49", "P50", "P51", "P52"].includes(manifest.bindings.candidate_profile_id)
    || manifest.bindings.arm_ordering_policy !== "sha256-family-repetition-counterbalance-v1") {
    fail("BENCHMARK_V2_HOLDOUT_SELECTION_FREEZE", "selection requires an intact pre-selection freeze envelope");
  }
}

function validateSelectionContract(contract) {
  if (contract?.schema_version !== 2 || contract.split !== "holdout"
    || contract.selection_status !== "unselected-until-freeze"
    || contract.selected_manifest_must_be_absent_before_freeze !== true
    || contract.family_count !== 90
    || contract.minimum_real_commit_derived_families !== 23
    || contract.minimum_real_commit_derived_fraction !== 0.25
    || contract.paired_trajectories_per_family !== 2
    || contract.selected_manifest_path !== ".oc_harness/benchmark-v2/holdout/round-<freeze-fingerprint-prefix>.selected.v2.json"
    || contract.reference_solution_access !== "runner-only-after-model-settlement"
    || contract.post_selection_mutation_policy !== "invalidate-confirmatory-round"
    || JSON.stringify(contract.seed_derivation?.ordered_inputs) !== JSON.stringify([
      "frozen_candidate_sha", "github_workflow_run_id", "preregistered_salt",
    ])
    || STRATA.some((stratum) => contract.family_count_by_stratum?.[stratum] !== 30)) {
    fail("BENCHMARK_V2_HOLDOUT_SELECTION_CONTRACT", "holdout selection contract is incompatible");
  }
}

function validatePool(pool, expectedOrigin) {
  exactKeys(pool, [
    "schema_version", "registry_id", "origin", "selection_status",
    "task_materialization_status", "reference_solution_access", "candidates",
  ], `${expectedOrigin} pool`);
  if (pool.schema_version !== 2 || !SAFE_ID.test(pool.registry_id)
    || pool.origin !== expectedOrigin || pool.selection_status !== "candidate-pool-not-selected"
    || pool.task_materialization_status !== "executable"
    || pool.reference_solution_access !== "runner-only-after-model-settlement"
    || !Array.isArray(pool.candidates)) {
    fail("BENCHMARK_V2_HOLDOUT_SELECTION_POOL", `${expectedOrigin} pool is not executable and sealed`);
  }
  const ids = new Set();
  const identities = new Set();
  const fixtureFingerprints = new Set();
  for (const [index, candidate] of pool.candidates.entries()) {
    exactKeys(candidate, [
      "id", "stratum", "origin", "task_identity", "fixture_fingerprint",
    ], `${expectedOrigin} candidate[${index}]`);
    if (!SAFE_ID.test(candidate.id) || !STRATA.includes(candidate.stratum)
      || candidate.origin !== expectedOrigin
      || typeof candidate.task_identity !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{2,511}$/u.test(candidate.task_identity)
      || !SHA256.test(candidate.fixture_fingerprint)) {
      fail("BENCHMARK_V2_HOLDOUT_SELECTION_CANDIDATE", `${expectedOrigin} candidate[${index}] is invalid`);
    }
    if (ids.has(candidate.id) || identities.has(candidate.task_identity)
      || fixtureFingerprints.has(candidate.fixture_fingerprint)) {
      fail("BENCHMARK_V2_HOLDOUT_SELECTION_DUPLICATE", `${expectedOrigin} pool contains duplicate identity`);
    }
    ids.add(candidate.id);
    identities.add(candidate.task_identity);
    fixtureFingerprints.add(candidate.fixture_fingerprint);
  }
  return Object.freeze({ pool, ids, identities, fixtureFingerprints });
}

function realQuotas(seed, minimum) {
  const base = Math.floor(minimum / STRATA.length);
  const remainder = minimum - base * STRATA.length;
  const ordered = [...STRATA].sort((left, right) => seededRank(seed, "real-quota", left)
    .localeCompare(seededRank(seed, "real-quota", right)));
  return Object.freeze(Object.fromEntries(STRATA.map((stratum) => [
    stratum,
    base + (ordered.slice(0, remainder).includes(stratum) ? 1 : 0),
  ])));
}

function selectFrom(pool, { seed, namespace, stratum, count }) {
  const eligible = pool.candidates.filter((candidate) => candidate.stratum === stratum)
    .sort((left, right) => seededRank(seed, namespace, left.task_identity)
      .localeCompare(seededRank(seed, namespace, right.task_identity)));
  if (eligible.length < count) {
    fail("BENCHMARK_V2_HOLDOUT_SELECTION_COVERAGE", `${namespace} lacks ${stratum} candidates`);
  }
  return eligible.slice(0, count);
}

function safeSelectedFamily(candidate) {
  return Object.freeze({
    id: candidate.id,
    stratum: candidate.stratum,
    origin: candidate.origin,
    task_identity: candidate.task_identity,
    fixture_fingerprint: candidate.fixture_fingerprint,
  });
}

export function buildBenchmarkV2HoldoutSelection({
  freezeManifest,
  selectionContract,
  proceduralPool,
  realCommitPool,
  excludedTaskIdentities = [],
} = {}) {
  validateFreezeEnvelope(freezeManifest);
  validateSelectionContract(selectionContract);
  const procedural = validatePool(proceduralPool, ORIGINS[0]);
  const real = validatePool(realCommitPool, ORIGINS[1]);
  if (!Array.isArray(excludedTaskIdentities)
    || excludedTaskIdentities.some((identity) => typeof identity !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,511}$/u.test(identity))
    || new Set(excludedTaskIdentities).size !== excludedTaskIdentities.length) {
    fail("BENCHMARK_V2_HOLDOUT_SELECTION_EXCLUSIONS", "excluded task identities are invalid");
  }
  const poolIds = [...procedural.ids, ...real.ids];
  const poolIdentities = [...procedural.identities, ...real.identities];
  const poolFixtureFingerprints = [...procedural.fixtureFingerprints, ...real.fixtureFingerprints];
  if (new Set(poolIdentities).size !== poolIdentities.length
    || new Set(poolIds).size !== poolIds.length
    || new Set(poolFixtureFingerprints).size !== poolFixtureFingerprints.length
    || poolIdentities.some((identity) => excludedTaskIdentities.includes(identity))) {
    fail("BENCHMARK_V2_HOLDOUT_SELECTION_OVERLAP", "candidate pools overlap each other or an earlier split");
  }

  const seed = freezeManifest.holdout_seed;
  const quotas = realQuotas(seed, selectionContract.minimum_real_commit_derived_families);
  const selected = [];
  const composition = {};
  for (const stratum of STRATA) {
    const realCount = quotas[stratum];
    const proceduralCount = selectionContract.family_count_by_stratum[stratum] - realCount;
    selected.push(...selectFrom(realCommitPool, {
      seed, namespace: "real-commit-derived", stratum, count: realCount,
    }));
    selected.push(...selectFrom(proceduralPool, {
      seed, namespace: "procedural-synthetic", stratum, count: proceduralCount,
    }));
    composition[stratum] = Object.freeze({
      total: selectionContract.family_count_by_stratum[stratum],
      real_commit_derived: realCount,
      procedural_synthetic: proceduralCount,
    });
  }
  const selectedFamilies = Object.freeze(selected.map(safeSelectedFamily)
    .sort((left, right) => left.stratum.localeCompare(right.stratum) || left.id.localeCompare(right.id)));
  const realCount = selectedFamilies.filter((candidate) => candidate.origin === ORIGINS[1]).length;
  if (selectedFamilies.length !== selectionContract.family_count
    || new Set(selectedFamilies.map((candidate) => candidate.task_identity)).size !== selectedFamilies.length
    || realCount < selectionContract.minimum_real_commit_derived_families
    || realCount / selectedFamilies.length < selectionContract.minimum_real_commit_derived_fraction) {
    fail("BENCHMARK_V2_HOLDOUT_SELECTION_COMPOSITION", "selected holdout violates size or origin composition");
  }
  const source = {
    schema_version: 2,
    manifest_kind: "benchmark-v2-selected-holdout",
    status: "selected-post-freeze",
    freeze_fingerprint: freezeManifest.freeze_fingerprint,
    holdout_seed: seed,
    harness_source_sha: freezeManifest.bindings.harness_source_sha,
    selection_contract_fingerprint: fingerprintProfileValue(selectionContract),
    pool_fingerprints: Object.freeze({
      procedural: fingerprintProfileValue(proceduralPool),
      real_commit_derived: fingerprintProfileValue(realCommitPool),
    }),
    excluded_task_identity_count: excludedTaskIdentities.length,
    excluded_task_identities_fingerprint: fingerprintProfileValue([...excludedTaskIdentities].sort()),
    family_count: selectedFamilies.length,
    family_count_by_stratum: Object.freeze(Object.fromEntries(STRATA.map((stratum) => [
      stratum, selectedFamilies.filter((candidate) => candidate.stratum === stratum).length,
    ]))),
    real_commit_derived_family_count: realCount,
    composition_by_stratum: Object.freeze(composition),
    selected_families: selectedFamilies,
  };
  return Object.freeze({ ...source, selection_fingerprint: fingerprintProfileValue(source) });
}

export function validateBenchmarkV2HoldoutSelection(manifest) {
  exactKeys(manifest, [
    "schema_version", "manifest_kind", "status", "freeze_fingerprint", "holdout_seed",
    "harness_source_sha", "selection_contract_fingerprint", "pool_fingerprints", "family_count",
    "excluded_task_identity_count", "excluded_task_identities_fingerprint",
    "family_count_by_stratum", "real_commit_derived_family_count", "composition_by_stratum",
    "selected_families", "selection_fingerprint",
  ], "selected holdout manifest");
  const { selection_fingerprint: declared, ...source } = manifest;
  exactKeys(manifest.pool_fingerprints, ["procedural", "real_commit_derived"], "selected pool fingerprints");
  exactKeys(manifest.family_count_by_stratum, STRATA, "selected family counts");
  exactKeys(manifest.composition_by_stratum, STRATA, "selected stratum composition");
  if (manifest.schema_version !== 2 || manifest.manifest_kind !== "benchmark-v2-selected-holdout"
    || manifest.status !== "selected-post-freeze" || !SHA256.test(manifest.freeze_fingerprint)
    || !SHA256.test(manifest.holdout_seed) || !/^[0-9a-f]{40}$/u.test(manifest.harness_source_sha)
    || !SHA256.test(manifest.selection_contract_fingerprint)
    || !SHA256.test(manifest.pool_fingerprints?.procedural)
    || !SHA256.test(manifest.pool_fingerprints?.real_commit_derived)
    || !Number.isSafeInteger(manifest.excluded_task_identity_count)
    || manifest.excluded_task_identity_count < 1
    || !SHA256.test(manifest.excluded_task_identities_fingerprint)
    || manifest.family_count !== 90 || manifest.real_commit_derived_family_count < 23
    || !Array.isArray(manifest.selected_families) || manifest.selected_families.length !== 90
    || declared !== fingerprintProfileValue(source)) {
    fail("BENCHMARK_V2_HOLDOUT_SELECTION_MANIFEST", "selected holdout manifest is invalid");
  }
  const ids = new Set();
  const identities = new Set();
  for (const [index, candidate] of manifest.selected_families.entries()) {
    exactKeys(candidate, ["id", "stratum", "origin", "task_identity", "fixture_fingerprint"], `selected family[${index}]`);
    if (!SAFE_ID.test(candidate.id) || !STRATA.includes(candidate.stratum)
      || !ORIGINS.includes(candidate.origin)
      || typeof candidate.task_identity !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{2,511}$/u.test(candidate.task_identity)
      || !SHA256.test(candidate.fixture_fingerprint)
      || ids.has(candidate.id) || identities.has(candidate.task_identity)) {
      fail("BENCHMARK_V2_HOLDOUT_SELECTION_MANIFEST", `selected family[${index}] is invalid`);
    }
    ids.add(candidate.id);
    identities.add(candidate.task_identity);
  }
  let observedRealCount = 0;
  for (const stratum of STRATA) {
    const families = manifest.selected_families.filter((candidate) => candidate.stratum === stratum);
    const real = families.filter((candidate) => candidate.origin === ORIGINS[1]).length;
    exactKeys(manifest.composition_by_stratum[stratum], [
      "total", "real_commit_derived", "procedural_synthetic",
    ], `${stratum} composition`);
    if (families.length !== 30 || manifest.family_count_by_stratum?.[stratum] !== 30
      || manifest.composition_by_stratum?.[stratum]?.total !== 30
      || manifest.composition_by_stratum[stratum].real_commit_derived !== real
      || manifest.composition_by_stratum[stratum].procedural_synthetic !== 30 - real) {
      fail("BENCHMARK_V2_HOLDOUT_SELECTION_MANIFEST", `${stratum} composition is invalid`);
    }
    observedRealCount += real;
  }
  if (manifest.real_commit_derived_family_count !== observedRealCount
    || observedRealCount / manifest.family_count < 0.25) {
    fail("BENCHMARK_V2_HOLDOUT_SELECTION_MANIFEST", "real-commit composition total is invalid");
  }
  return manifest;
}

export function writeBenchmarkV2HoldoutSelection(repositoryRoot, manifest) {
  validateBenchmarkV2HoldoutSelection(manifest);
  const root = fs.realpathSync.native(path.resolve(repositoryRoot));
  let directory = root;
  for (const segment of [".oc_harness", "benchmark-v2", "holdout"]) {
    directory = path.join(directory, segment);
    if (fs.existsSync(directory)) {
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        fail("BENCHMARK_V2_HOLDOUT_SELECTION_PATH", "selection evidence directory is unsafe");
      }
    } else {
      fs.mkdirSync(directory, { mode: 0o700 });
    }
  }
  const target = path.join(directory, `round-${manifest.freeze_fingerprint.slice(7, 31)}.selected.v2.json`);
  fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  return path.relative(root, target).split(path.sep).join("/");
}
