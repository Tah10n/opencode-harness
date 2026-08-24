import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { fingerprintProfileValue } from "../lib/profile-v3.mjs";
import {
  buildBenchmarkV2HoldoutSelection,
  validateBenchmarkV2HoldoutSelection,
  writeBenchmarkV2HoldoutSelection,
} from "../lib/benchmark/v2-holdout-selection.mjs";

const contract = JSON.parse(fs.readFileSync(new URL("../benchmarks/v2/holdout/selection-contract.v2.json", import.meta.url), "utf8"));

function freeze(seedSuffix = "a") {
  const source = {
    schema_version: 2,
    manifest_kind: "benchmark-v2-confirmatory-freeze",
    status: "frozen-pre-selection",
    confirmatory_round: 1,
    allocated_alpha: 0.025,
    github_workflow_run_id: "123456789",
    salt_commitment: `sha256:${"b".repeat(64)}`,
    holdout_seed: `sha256:${seedSuffix.repeat(64)}`,
    holdout_selected: false,
    selected_holdout_manifest: null,
    bindings: {
      harness_source_sha: "c".repeat(40),
      harness_tree_sha: "d".repeat(40),
      harness_fingerprint: `sha256:${"1".repeat(64)}`,
      evaluator_fingerprint: `sha256:${"2".repeat(64)}`,
      promotion_policy_fingerprint: `sha256:${"3".repeat(64)}`,
      task_generator_fingerprint: `sha256:${"4".repeat(64)}`,
      benchmark_contract_fingerprint: `sha256:${"5".repeat(64)}`,
      model: "openai/gpt-5.6-luna",
      provider: "openai",
      variant: "low",
      timeout_ms: 300_000,
      executable_fingerprint: `sha256:${"6".repeat(64)}`,
      candidate_profile_id: "P43",
      candidate_profile_fingerprint: `sha256:${"7".repeat(64)}`,
      arm_ordering_policy: "sha256-family-repetition-counterbalance-v1",
    },
  };
  return { ...source, freeze_fingerprint: fingerprintProfileValue(source) };
}

function pool(origin, prefix, perStratum = 40) {
  const candidates = [];
  for (const stratum of ["small", "medium", "high"]) {
    for (let index = 1; index <= perStratum; index += 1) {
      const id = `${prefix}-${stratum}-${String(index).padStart(2, "0")}`;
      candidates.push({
        id,
        stratum,
        origin,
        task_identity: `${origin}:${id}`,
        fixture_fingerprint: fingerprintProfileValue({ id, origin }),
      });
    }
  }
  return {
    schema_version: 2,
    registry_id: `${prefix}-registry`,
    origin,
    selection_status: "candidate-pool-not-selected",
    task_materialization_status: "executable",
    reference_solution_access: "runner-only-after-model-settlement",
    candidates,
  };
}

const procedural = pool("procedural-synthetic", "proc");
const real = pool("real-commit-derived-compatible-license", "real");
const first = buildBenchmarkV2HoldoutSelection({
  freezeManifest: freeze("a"), selectionContract: contract,
  proceduralPool: procedural, realCommitPool: real,
  excludedTaskIdentities: ["development:one", "validation:one"],
});
assert.equal(validateBenchmarkV2HoldoutSelection(first), first);
assert.equal(first.family_count, 90);
assert.equal(first.real_commit_derived_family_count, 23);
assert.equal(first.excluded_task_identity_count, 2);
assert.match(first.excluded_task_identities_fingerprint, /^sha256:[0-9a-f]{64}$/u);
assert.deepEqual(first.family_count_by_stratum, { small: 30, medium: 30, high: 30 });
assert.deepEqual(
  Object.values(first.composition_by_stratum).map((entry) => entry.real_commit_derived).sort(),
  [7, 8, 8],
);

const repeated = buildBenchmarkV2HoldoutSelection({
  freezeManifest: freeze("a"), selectionContract: contract,
  proceduralPool: procedural, realCommitPool: real,
  excludedTaskIdentities: ["development:one", "validation:one"],
});
assert.equal(repeated.selection_fingerprint, first.selection_fingerprint);
assert.deepEqual(repeated.selected_families, first.selected_families);

const changedSeed = buildBenchmarkV2HoldoutSelection({
  freezeManifest: freeze("d"), selectionContract: contract,
  proceduralPool: procedural, realCommitPool: real,
});
assert.notEqual(changedSeed.selection_fingerprint, first.selection_fingerprint);
assert.notDeepEqual(changedSeed.selected_families, first.selected_families);

const unmaterialized = structuredClone(real);
unmaterialized.task_materialization_status = "provenance-curated-fixtures-not-yet-materialized";
assert.throws(() => buildBenchmarkV2HoldoutSelection({
  freezeManifest: freeze("a"), selectionContract: contract,
  proceduralPool: procedural, realCommitPool: unmaterialized,
}), /BENCHMARK_V2_HOLDOUT_SELECTION_POOL/u);

const overlapping = structuredClone(real);
overlapping.candidates[0].task_identity = procedural.candidates[0].task_identity;
assert.throws(() => buildBenchmarkV2HoldoutSelection({
  freezeManifest: freeze("a"), selectionContract: contract,
  proceduralPool: procedural, realCommitPool: overlapping,
}), /BENCHMARK_V2_HOLDOUT_SELECTION_OVERLAP/u);

const overlappingId = structuredClone(real);
overlappingId.candidates[0].id = procedural.candidates[0].id;
assert.throws(() => buildBenchmarkV2HoldoutSelection({
  freezeManifest: freeze("a"), selectionContract: contract,
  proceduralPool: procedural, realCommitPool: overlappingId,
}), /BENCHMARK_V2_HOLDOUT_SELECTION_OVERLAP/u);

const tooSmall = pool("real-commit-derived-compatible-license", "limited", 7);
assert.throws(() => buildBenchmarkV2HoldoutSelection({
  freezeManifest: freeze("a"), selectionContract: contract,
  proceduralPool: procedural, realCommitPool: tooSmall,
}), /BENCHMARK_V2_HOLDOUT_SELECTION_COVERAGE/u);

const selectedTamper = structuredClone(first);
selectedTamper.selected_families.pop();
assert.throws(() => validateBenchmarkV2HoldoutSelection(selectedTamper), /BENCHMARK_V2_HOLDOUT_SELECTION_MANIFEST/u);

const mismatchedRealCount = structuredClone(first);
mismatchedRealCount.real_commit_derived_family_count += 1;
const { selection_fingerprint: _discarded, ...mismatchedSource } = mismatchedRealCount;
mismatchedRealCount.selection_fingerprint = fingerprintProfileValue(mismatchedSource);
assert.throws(() => validateBenchmarkV2HoldoutSelection(mismatchedRealCount), /BENCHMARK_V2_HOLDOUT_SELECTION_MANIFEST/u);

const duplicateSelectedId = structuredClone(first);
duplicateSelectedId.selected_families[1].id = duplicateSelectedId.selected_families[0].id;
const { selection_fingerprint: _discardedDuplicate, ...duplicateSource } = duplicateSelectedId;
duplicateSelectedId.selection_fingerprint = fingerprintProfileValue(duplicateSource);
assert.throws(() => validateBenchmarkV2HoldoutSelection(duplicateSelectedId), /BENCHMARK_V2_HOLDOUT_SELECTION_MANIFEST/u);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-v2-selection-"));
try {
  const relative = writeBenchmarkV2HoldoutSelection(temporaryRoot, first);
  assert(relative.startsWith(".oc_harness/benchmark-v2/holdout/"));
  assert.equal(fs.statSync(path.join(temporaryRoot, relative)).mode & 0o777, 0o600);
  assert.throws(() => writeBenchmarkV2HoldoutSelection(temporaryRoot, first), /EEXIST/u);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

const symlinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-v2-selection-symlink-"));
const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-v2-selection-outside-"));
try {
  fs.symlinkSync(outsideRoot, path.join(symlinkRoot, ".oc_harness"), "dir");
  assert.throws(() => writeBenchmarkV2HoldoutSelection(symlinkRoot, first), /BENCHMARK_V2_HOLDOUT_SELECTION_PATH/u);
  assert.deepEqual(fs.readdirSync(outsideRoot), []);
} finally {
  fs.rmSync(symlinkRoot, { recursive: true, force: true });
  fs.rmSync(outsideRoot, { recursive: true, force: true });
}

process.stdout.write("benchmark v2 post-freeze holdout selection contracts passed\n");
