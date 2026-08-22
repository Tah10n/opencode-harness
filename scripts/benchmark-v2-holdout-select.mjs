import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { loadBenchmarkV2Contracts } from "../lib/benchmark/v2-contracts.mjs";
import {
  buildBenchmarkV2ProceduralHoldoutPool,
  buildBenchmarkV2RealCommitHoldoutPool,
  renderBenchmarkV2ProceduralHighCorpus,
  renderBenchmarkV2ProceduralMediumCorpus,
  renderBenchmarkV2ProceduralSmallCorpus,
  renderBenchmarkV2RealCommitCorpus,
} from "../lib/benchmark/v2-fixtures.mjs";
import { validateBenchmarkV2FreezeManifest } from "../lib/benchmark/v2-freeze.mjs";
import {
  buildBenchmarkV2HoldoutSelection,
  writeBenchmarkV2HoldoutSelection,
} from "../lib/benchmark/v2-holdout-selection.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parse(values) {
  const options = { freezePath: null, saltFile: null };
  const mapping = { "--freeze": "freezePath", "--salt-file": "saltFile" };
  for (let index = 0; index < values.length; index += 1) {
    const property = mapping[values[index]];
    const next = values[index + 1];
    if (property === undefined || typeof next !== "string" || next.startsWith("--")) {
      throw new Error(`invalid argument ${values[index]}`);
    }
    options[property] = next;
    index += 1;
  }
  if (options.freezePath === null || options.saltFile === null) {
    throw new Error("--freeze and --salt-file are required");
  }
  return options;
}

function readJson(relativeOrAbsolute) {
  const target = path.resolve(root, relativeOrAbsolute);
  return JSON.parse(fs.readFileSync(target, "utf8").replace(/^\uFEFF/u, ""));
}

try {
  const options = parse(process.argv.slice(2));
  const freeze = readJson(options.freezePath);
  const salt = fs.readFileSync(path.resolve(root, options.saltFile), "utf8").trim();
  validateBenchmarkV2FreezeManifest(freeze, {
    repositoryRoot: root,
    salt,
    expectedFreezeFingerprint: freeze.freeze_fingerprint,
    observedExecutableFingerprint: freeze.bindings?.executable_fingerprint,
  });

  const loaded = loadBenchmarkV2Contracts(root);
  const render = { repositoryRoot: root, seed: freeze.holdout_seed.slice(7), repetition: 1 };
  const proceduralInstances = [
    ...renderBenchmarkV2ProceduralSmallCorpus({ ...render, registry: loaded.proceduralCandidates }),
    ...renderBenchmarkV2ProceduralMediumCorpus({ ...render, registry: loaded.proceduralCandidates }),
    ...renderBenchmarkV2ProceduralHighCorpus({ ...render, registry: loaded.proceduralCandidates }),
  ];
  const realInstances = renderBenchmarkV2RealCommitCorpus({
    ...render,
    registry: loaded.realCommitCandidates,
    requirements: loaded.realCommitRequirements,
  });
  const proceduralPool = buildBenchmarkV2ProceduralHoldoutPool({
    registry: loaded.proceduralCandidates,
    instances: proceduralInstances,
  });
  const realCommitPool = buildBenchmarkV2RealCommitHoldoutPool({
    registry: loaded.realCommitCandidates,
    instances: realInstances,
  });
  const excludedTaskIdentities = Object.freeze([
    ...loaded.dev.families.map((family) => `development-v2:${family.id}:${family.recipe_id}`),
    ...loaded.validation.families.map((family) => `validation-v2:${family.id}:${family.recipe_id}`),
  ]);
  const selection = buildBenchmarkV2HoldoutSelection({
    freezeManifest: freeze,
    selectionContract: loaded.holdout,
    proceduralPool,
    realCommitPool,
    excludedTaskIdentities,
  });
  const selectionPath = writeBenchmarkV2HoldoutSelection(root, selection);
  process.stdout.write(`${JSON.stringify({
    status: selection.status,
    selection_path: selectionPath,
    selection_fingerprint: selection.selection_fingerprint,
    family_count: selection.family_count,
    real_commit_derived_family_count: selection.real_commit_derived_family_count,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.code ?? "BENCHMARK_V2_HOLDOUT_SELECT_UNEXPECTED"}: ${error.message}\n`);
  process.exitCode = 1;
}
