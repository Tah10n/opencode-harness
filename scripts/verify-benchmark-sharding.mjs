import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fingerprint } from "../lib/feedback/contracts.mjs";
import { loadSyntheticContracts } from "../lib/benchmark/contracts.mjs";
import { syntheticOpenCodeAdapterFingerprint } from "../lib/benchmark/opencode-adapter.mjs";
import { loadSyntheticTemplateSet } from "../lib/benchmark/renderer.mjs";
import {
  DEFAULT_SYNTHETIC_SHARD_ROOT,
  loadSyntheticShardReportArtifact,
  mergeSyntheticShardArtifacts,
  mergeSyntheticShardReports,
  prepareSyntheticBenchmarkMatrix,
  publishSyntheticShardArtifact,
  validateSyntheticShardReport,
  validateSyntheticShardReportSourceBinding,
} from "../lib/benchmark/sharding.mjs";
import {
  buildSyntheticSuitePlan,
  projectSyntheticSuitePlanFamily,
} from "../lib/benchmark/suite-plan.mjs";
import { syntheticModelJobBudget } from "../lib/benchmark/workflow-budget.mjs";
import { runSyntheticPairedShard } from "../lib/benchmark/runner.mjs";
import { completeReport } from "./verify-benchmark-reporting.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function modelBindingFingerprint(execution) {
  return fingerprint({
    schema: "synthetic-model-binding-v1",
    provider: execution.provider,
    model: execution.model,
    variant: execution.variant,
  });
}

function buildShard(fullReport, plan, familyId, index) {
  const projection = projectSyntheticSuitePlanFamily(plan, familyId);
  const pairById = new Map(fullReport.pairs.map((pair) => [pair.pair_id, pair]));
  const pairs = projection.pair_ids.map((pairId) => pairById.get(pairId));
  return {
    schema_version: 1,
    report_kind: "synthetic-paired-shard",
    shard_marker: "synthetic-paired-family-shard-v1",
    shard_id: `shard-${String(index + 1).padStart(2, "0")}`,
    parent_generation_id: plan.generation_id,
    created_at: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    suite: { ...fullReport.suite },
    family_id: familyId,
    model_binding_fingerprint: modelBindingFingerprint(fullReport.execution),
    adapter_fingerprint: syntheticOpenCodeAdapterFingerprint(),
    execution: structuredClone(fullReport.execution),
    profiles: structuredClone(fullReport.profiles),
    schedule_projection: structuredClone(projection.schedule),
    expected_pair_ids: [...projection.pair_ids],
    actual_pair_ids: pairs.map((pair) => pair.pair_id),
    complete: true,
    incomplete_reasons: [],
    pair_count: pairs.length,
    pairs: structuredClone(pairs),
    residual_caveats: structuredClone(fullReport.residual_caveats),
  };
}

function rejects(label, callback) {
  assert.throws(callback, undefined, label);
}

export async function verifyBenchmarkSharding({ root = defaultRoot } = {}) {
  const contracts = loadSyntheticContracts(root);
  const templateSet = loadSyntheticTemplateSet(root, contracts);
  const source = completeReport(contracts, templateSet, "sharding-source", root, "standard");
  const plan = buildSyntheticSuitePlan({
    contracts,
    templateSet,
    suiteId: "standard",
    seed: source.suite.seed,
    baselineProfileId: "plain",
    candidateProfileId: "instrumented",
  });
  source.generation_id = plan.generation_id;
  const shards = plan.suite.family_ids.map((familyId, index) => buildShard(source, plan, familyId, index));
  for (const shard of shards) {
    assert.equal(validateSyntheticShardReport(shard), shard);
    assert.equal(validateSyntheticShardReportSourceBinding(shard, { sourceRoot: root }), shard);
  }
  const sourcePairById = new Map(source.pairs.map((pair) => [pair.pair_id, pair]));
  const executedShard = await runSyntheticPairedShard({
    sourceRoot: root,
    suiteId: "standard",
    familyId: plan.suite.family_ids[0],
    seed: source.suite.seed,
    baselineProfileId: "plain",
    candidateProfileId: "instrumented",
    model: "fixture/model",
    provider: "fixture",
    timeoutMs: 60_000,
    adapterUrl: pathToFileURL(import.meta.url).href,
    adapterInvoker: async () => { throw new Error("injected pair runner must bypass the adapter"); },
    pairRunner: async ({ scheduleEntry }) => {
      const pair = structuredClone(sourcePairById.get(scheduleEntry.pair_id));
      return {
        pair,
        profile_fingerprints: {
          baseline: pair.baseline.profile_fingerprint,
          candidate: pair.candidate.profile_fingerprint,
        },
      };
    },
    clock: () => new Date("2026-01-31T00:00:00.000Z"),
    idFactory: () => "synthetic-runtime-shard-test",
  });
  assert.equal(executedShard.adapter_fingerprint, syntheticOpenCodeAdapterFingerprint());
  assert.equal(executedShard.pair_count, 6);
  assert.deepEqual(
    shards.flatMap((shard) => shard.schedule_projection)
      .sort((left, right) => plan.schedule.findIndex((entry) => entry.pair_id === left.pair_id)
        - plan.schedule.findIndex((entry) => entry.pair_id === right.pair_id)),
    [...plan.schedule],
  );
  const merged = mergeSyntheticShardReports({
    sourceRoot: root,
    suiteId: "standard",
    seed: source.suite.seed,
    baselineProfileId: "plain",
    candidateProfileId: "instrumented",
    shardReports: shards,
    clock: () => new Date("2026-02-01T00:00:00.000Z"),
    idFactory: () => "synthetic-merged-sharding-test",
  });
  assert.equal(merged.complete, true);
  assert.deepEqual(merged.pairs.map((pair) => pair.pair_id), plan.schedule.map((entry) => entry.pair_id));

  rejects("missing shard", () => mergeSyntheticShardReports({
    sourceRoot: root,
    suiteId: "standard",
    seed: source.suite.seed,
    baselineProfileId: "plain",
    candidateProfileId: "instrumented",
    shardReports: shards.slice(1),
  }));
  rejects("duplicate shard", () => mergeSyntheticShardReports({
    sourceRoot: root,
    suiteId: "standard",
    seed: source.suite.seed,
    baselineProfileId: "plain",
    candidateProfileId: "instrumented",
    shardReports: [...shards, structuredClone(shards[0])],
  }));
  const caveatDrift = shards.map((shard) => structuredClone(shard));
  caveatDrift[0].residual_caveats.push("shard-specific-caveat");
  rejects("residual caveat drift", () => mergeSyntheticShardReports({
    sourceRoot: root,
    suiteId: "standard",
    seed: source.suite.seed,
    baselineProfileId: "plain",
    candidateProfileId: "instrumented",
    shardReports: caveatDrift,
  }));

  const mutations = [
    ["unexpected family", (value) => { value.family_id = "foreign-family"; }],
    ["other seed", (value) => { value.suite.seed = "foreign-seed"; }],
    ["other model", (value) => { value.model_binding_fingerprint = fingerprint({ other: "model" }); }],
    ["other executable", (value) => { value.execution.executable_fingerprint = fingerprint({ other: "executable" }); }],
    ["other profile", (value) => { value.profiles.baseline.fingerprint = fingerprint({ other: "profile" }); }],
    ["other timeout", (value) => { value.execution.timeout_ms += 1; }],
    ["other template", (value) => { value.suite.template_set_fingerprint = fingerprint({ other: "template" }); }],
    ["other policy", (value) => { value.suite.comparison_policy_fingerprint = fingerprint({ other: "policy" }); }],
    ["duplicate pair", (value) => { value.pairs[1] = structuredClone(value.pairs[0]); value.actual_pair_ids[1] = value.actual_pair_ids[0]; }],
    ["missing pair", (value) => { value.pairs.pop(); value.actual_pair_ids.pop(); value.pair_count -= 1; }],
    ["wrong local order", (value) => { value.schedule_projection[0].order.reverse(); value.pairs[0].order.reverse(); }],
    ["absolute path", (value) => { value.execution.model = "/Users/private/model"; }],
    ["credential", (value) => { value.execution.model = "Bearer secretmaterial12345"; }],
  ];
  for (const [label, mutate] of mutations) {
    const value = structuredClone(shards[0]);
    mutate(value);
    rejects(label, () => validateSyntheticShardReportSourceBinding(value, { sourceRoot: root }));
  }
  const incomplete = structuredClone(shards[0]);
  incomplete.complete = false;
  incomplete.incomplete_reasons = ["pair-evidence-incomplete"];
  rejects("incomplete shard", () => mergeSyntheticShardReports({
    sourceRoot: root,
    suiteId: "standard",
    seed: source.suite.seed,
    baselineProfileId: "plain",
    candidateProfileId: "instrumented",
    shardReports: [incomplete, ...shards.slice(1)],
  }));

  const fullPreparation = prepareSyntheticBenchmarkMatrix({
    sourceRoot: root,
    suiteId: "full",
    seed: "budget-test",
    baselineProfileId: "plain",
    candidateProfileId: "instrumented",
    timeoutMs: 300_000,
  });
  assert.equal(fullPreparation.execution_mode, "family-sharded");
  assert.equal(fullPreparation.matrix.include.length, 16);
  assert.equal(fullPreparation.budget.agent_run_count, 20);
  assert.equal(fullPreparation.budget.worker_timeout_ms, 635_000);
  rejects("excessive full shard timeout", () => syntheticModelJobBudget({ pairCount: 10, timeoutMs: 3_600_000 }));

  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "synthetic-shards-"));
  try {
    for (const shard of shards) {
      publishSyntheticShardArtifact({ sourceRoot: artifactRoot, contractSourceRoot: root, report: shard });
    }
    const firstPath = `${DEFAULT_SYNTHETIC_SHARD_ROOT}/${shards[0].parent_generation_id}/${shards[0].family_id}/${shards[0].shard_id}/report.json`;
    assert.equal(loadSyntheticShardReportArtifact({
      sourceRoot: artifactRoot,
      contractSourceRoot: root,
      reportPath: firstPath,
    }).report.shard_id, shards[0].shard_id);
    const mergedArtifacts = mergeSyntheticShardArtifacts({
      sourceRoot: artifactRoot,
      contractSourceRoot: root,
      suiteId: "standard",
      seed: source.suite.seed,
      baselineProfileId: "plain",
      candidateProfileId: "instrumented",
      shardsDirectory: DEFAULT_SYNTHETIC_SHARD_ROOT,
      clock: () => new Date("2026-02-02T00:00:00.000Z"),
      idFactory: () => "synthetic-merged-artifact-test",
    });
    assert.equal(mergedArtifacts.report.complete, true);
    const completionPath = path.join(path.dirname(path.join(artifactRoot, firstPath)), "completion.json");
    const completion = JSON.parse(fs.readFileSync(completionPath, "utf8"));
    completion.report_fingerprint = fingerprint({ tampered: true });
    fs.writeFileSync(completionPath, `${JSON.stringify(completion, null, 2)}\n`);
    rejects("tampered completion", () => loadSyntheticShardReportArtifact({
      sourceRoot: artifactRoot,
      contractSourceRoot: root,
      reportPath: firstPath,
    }));
  } finally {
    fs.rmSync(artifactRoot, { recursive: true, force: true });
  }
  return { families: shards.length, negative_cases: mutations.length + 5 };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await verifyBenchmarkSharding();
  console.log(`Synthetic benchmark sharding verification passed (${result.families} family shards; ${result.negative_cases} negative cases).`);
}
