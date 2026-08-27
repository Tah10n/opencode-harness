#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  captureBenchmarkV3Workspace,
  evaluateBenchmarkV3Workspace,
  fingerprintBenchmarkV3SemanticRuntime,
  loadBenchmarkV3Corpus,
  materializeBenchmarkV3Workspace,
} from "../lib/benchmark/v3-corpus.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const semanticRuntimeRoot = process.env.BENCHMARK_V3_ESLINT_RUNTIME_ROOT;
if (typeof semanticRuntimeRoot !== "string" || !path.isAbsolute(semanticRuntimeRoot)) {
  throw new Error("BENCHMARK_V3_CONTRACT_AUDIT: BENCHMARK_V3_ESLINT_RUNTIME_ROOT must be an absolute frozen runtime path");
}

const corpus = loadBenchmarkV3Corpus(root, { executeOracles: true, semanticRuntimeRoot });
const runtime = fingerprintBenchmarkV3SemanticRuntime(semanticRuntimeRoot,
  corpus.families.map((entry) => entry.control_surface.runtime_key));
const runtimeByKey = new Map(runtime.entries.map((entry) => [entry.key, entry.key_fingerprint]));

const alternatives = Object.freeze([
  Object.freeze({
    family_id: "v3-validation-small-01",
    replace: Object.freeze({
      from: 'if (node.argument.name === "undefined") {',
      to: 'if (node.argument.name === "undefined" && context.sourceCode.isGlobalReference(node.argument)) {',
    }),
  }),
  Object.freeze({
    family_id: "v3-development-small-01",
    replace: Object.freeze({
      from: 'if (node.parent && node.parent.type === "NewExpression") {',
      to: 'if (node.parent?.type === "NewExpression" && node.parent.callee === node) {',
    }),
  }),
]);

const alternativeWitnesses = [];
for (const alternative of alternatives) {
  const family = corpus.families.find((entry) => entry.family_id === alternative.family_id);
  assert.ok(family, `${alternative.family_id} representative family is missing`);
  assert.equal(family.control_surface.reference_files.length, 1,
    `${alternative.family_id} representative alternative must stay single-source`);
  const workspace = materializeBenchmarkV3Workspace(root, family);
  try {
    const source = family.public_surface.public_files[0];
    const target = path.join(workspace, ...source.path.split("/"));
    assert.equal(source.content.includes(alternative.replace.from), true,
      `${alternative.family_id} alternative repair precondition drifted`);
    const alternativeContent = source.content.replace(alternative.replace.from, alternative.replace.to);
    assert.notEqual(alternativeContent, source.content);
    assert.notEqual(alternativeContent, family.control_surface.reference_files[0].content,
      `${alternative.family_id} alternative repair collapsed to reference bytes`);
    const before = captureBenchmarkV3Workspace(workspace);
    fs.writeFileSync(target, alternativeContent, "utf8");
    const result = evaluateBenchmarkV3Workspace(workspace, family.control_surface, {
      beforeSnapshot: before,
      semanticRuntimeRoot,
      expectedRuntimeKeyFingerprint: runtimeByKey.get(family.control_surface.runtime_key),
      revalidateRuntimeKey: false,
    });
    assert.equal(result.passed, true,
      `${alternative.family_id} independently authored semantic alternative did not pass the hidden oracle`);
    alternativeWitnesses.push(Object.freeze({ family_id: family.family_id,
      reference_bytes_equal: false, hidden_oracle_passed: true, result_fingerprint: result.result_fingerprint }));
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

const mutationCoverageFamily = corpus.families.find((entry) => entry.family_id === "v3-development-high-19");
assert.ok(mutationCoverageFamily, "representative multi-source preservation family is missing");
const allowedMutationNegativeWitnesses = [];
for (const sourcePath of mutationCoverageFamily.control_surface.allowed_mutation_paths) {
  const workspace = materializeBenchmarkV3Workspace(root, mutationCoverageFamily);
  try {
    const before = captureBenchmarkV3Workspace(workspace);
    fs.writeFileSync(path.join(workspace, ...sourcePath.split("/")), '"use strict";\nmodule.exports = {};\n', "utf8");
    const result = evaluateBenchmarkV3Workspace(workspace, mutationCoverageFamily.control_surface, {
      beforeSnapshot: before,
      semanticRuntimeRoot,
      expectedRuntimeKeyFingerprint: runtimeByKey.get(mutationCoverageFamily.control_surface.runtime_key),
      revalidateRuntimeKey: false,
    });
    assert.equal(result.passed, false, `${mutationCoverageFamily.family_id} oracle does not observe destructive mutation of ${sourcePath}`);
    allowedMutationNegativeWitnesses.push(Object.freeze({ family_id: mutationCoverageFamily.family_id,
      source_path: sourcePath, destructive_mutation_rejected: true, result_fingerprint: result.result_fingerprint }));
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

process.stdout.write(`${JSON.stringify({
  schema_version: 1,
  audit: "benchmark-v3-visible-contracts",
  status: "passed",
  model_calls: 0,
  public_family_count: corpus.families.length,
  public_splits: ["development", "validation"],
  audit_scope: "structural-all-family-contract-checks-plus-two-representative-semantic-alternatives",
  full_corpus_semantic_sufficiency_claimed: false,
  independently_reviewed_contract_ledger_entries: 0,
  contract_reference_patch_disclosure_rejected: true,
  pre_fix_failure_count: corpus.semantic_oracle_expectations.length,
  reference_fix_pass_count: corpus.semantic_oracle_expectations.length,
  independently_authored_alternative_witnesses: alternativeWitnesses,
  allowed_mutation_negative_witnesses: allowedMutationNegativeWitnesses,
}, null, 2)}\n`);
