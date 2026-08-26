import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { canonicalJson, fingerprint } from "../lib/feedback/contracts.mjs";
import { benchmarkV3ReadinessEnvironment, validateBenchmarkV3ReadinessReceipt } from "../lib/benchmark/v3-readiness.mjs";

import { materializeProfileBundleV3 } from "../lib/profile-v3.mjs";
import { loadBenchmarkV3Corpus } from "../lib/benchmark/v3-corpus.mjs";
import { loadBenchmarkV3Design } from "../lib/benchmark/v3-design.mjs";
import {
  buildBenchmarkV3AttemptEnvelope,
  buildBenchmarkV3ModelBinding,
  classifyBenchmarkV3AttemptReceipt,
  evaluateBenchmarkV3EfficacyGate,
  evaluateBenchmarkV3Guardrails,
  resolveBenchmarkV3StudySeeds,
  summarizeBenchmarkV3Stage,
  verifyBenchmarkV3OpenCodeExecutable,
  verifyBenchmarkV3FilesystemIsolation,
  verifyBenchmarkV3ProductBundle,
} from "../lib/benchmark/v3-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { value: design } = loadBenchmarkV3Design(root);
const corpus = loadBenchmarkV3Corpus(root);
const readinessRoot = fs.mkdtempSync(path.join(root, ".v3-readiness-receipt-"));
try {
  if (process.platform === "win32") {
    assert.throws(() => validateBenchmarkV3ReadinessReceipt("C:\\untrusted.json", {
      capability: "real-process-containment", sourceRoot: root,
    }));
  } else {
  fs.chmodSync(readinessRoot, 0o700);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const issuer = Object.freeze({
    issuer_id: "fixture-readiness-issuer-v1",
    protected_channel: "fixture-protected-channel-v1",
    channel_root: readinessRoot,
    owner_uid: process.getuid(),
    capabilities: Object.freeze(["real-process-containment"]),
    public_key_pem: publicKey.export({ type: "spki", format: "pem" }),
  });
  const environment = benchmarkV3ReadinessEnvironment();
  const sourceSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  const body = { schema_version: 2, issuer_id: issuer.issuer_id, protected_channel: issuer.protected_channel,
    ...environment, source_sha: sourceSha, capability: "real-process-containment",
    status: "verified", issued_at_ms: Date.now() - 1_000, expires_at_ms: Date.now() + 60_000 };
  const receiptPath = path.join(readinessRoot, "receipt.json");
  const signed = { ...body, signature: sign(null, Buffer.from(canonicalJson(body), "utf8"), privateKey).toString("base64url") };
  fs.writeFileSync(receiptPath, JSON.stringify(signed), { mode: 0o600 });
  assert.equal(validateBenchmarkV3ReadinessReceipt(receiptPath, {
    capability: body.capability, sourceRoot: root, trustedIssuers: [issuer],
  }).status, "verified");
  fs.writeFileSync(receiptPath, JSON.stringify({ ...body, signature: "self-authored" }), { mode: 0o600 });
  assert.throws(() => validateBenchmarkV3ReadinessReceipt(receiptPath, {
    capability: body.capability, sourceRoot: root, trustedIssuers: [issuer],
  }), /signature/u, "self-authored readiness JSON must be rejected");
  fs.writeFileSync(receiptPath, JSON.stringify(signed), { mode: 0o600 });
  const hardlinkPath = path.join(readinessRoot, "receipt-hardlink.json");
  fs.linkSync(receiptPath, hardlinkPath);
  assert.throws(() => validateBenchmarkV3ReadinessReceipt(receiptPath, {
    capability: body.capability, sourceRoot: root, trustedIssuers: [issuer],
  }));
  fs.unlinkSync(hardlinkPath);
  const symlinkPath = path.join(readinessRoot, "receipt-symlink.json");
  fs.symlinkSync(receiptPath, symlinkPath);
  assert.throws(() => validateBenchmarkV3ReadinessReceipt(symlinkPath, {
    capability: body.capability, sourceRoot: root, trustedIssuers: [issuer],
  }));
  }
  const readySpoof = spawnSync(process.execPath, [path.join(root, "scripts", "verify-benchmark-v3-campaign-readiness.mjs")], {
    cwd: root, encoding: "utf8", env: { ...process.env, OPENCODE_QUALITY_PROCESS_CONTAINMENT_READY: "1",
      BENCHMARK_V3_HIDDEN_NAMESPACE_ISOLATION_READY: "1", BENCHMARK_V3_PROVIDER_ONLY_EGRESS_READY: "1" },
  });
  assert.equal(readySpoof.status, 2);
  assert.equal(JSON.parse(readySpoof.stdout).reasons.some((entry) => entry.code === "PROCESS_CONTAINMENT_UNAVAILABLE"), true);
} finally { fs.rmSync(readinessRoot, { recursive: true, force: true }); }
const families = corpus.families.filter((entry) => entry.split === "development");
const first = families[0];
const envelope = buildBenchmarkV3AttemptEnvelope({
  family: first,
  armId: "candidate-one",
  sourceSha: "a".repeat(40),
  productBundleFingerprint: `sha256:${"b".repeat(64)}`,
  opencodeExecutableFingerprint: `sha256:${"f".repeat(64)}`,
  model: "fixture-model",
  provider: "fixture-provider",
  variant: "fixture-variant",
  corpusGenerationSeed: "frozen-seed",
  modelSamplingSeed: null,
});
const serialized = JSON.stringify(envelope);
assert.equal(serialized.includes("control_surface"), false);
assert.equal(serialized.includes("reference_files"), false);
assert.equal(serialized.includes(first.control_surface.provenance.source_commit), false);
assert.equal(envelope.public_surface_fingerprint, first.manifest.public_surface_fingerprint);
assert.equal(envelope.corpus_generation_seed, "frozen-seed");
assert.equal(envelope.model_sampling_seed, null);
const seededEnvelope = buildBenchmarkV3AttemptEnvelope({ ...envelope, family: first, armId: envelope.arm_id,
  sourceSha: envelope.source_sha, productBundleFingerprint: envelope.product_bundle_fingerprint,
  opencodeExecutableFingerprint: envelope.opencode_executable_fingerprint, corpusGenerationSeed: "frozen-seed",
  modelSamplingSeed: "supported-model-seed" });
assert.equal(seededEnvelope.corpus_generation_seed, envelope.corpus_generation_seed);
assert.equal(seededEnvelope.public_surface_fingerprint, envelope.public_surface_fingerprint);
const bindingFixture = { executableFingerprint: `sha256:${"1".repeat(64)}`, opencodeVersion: "1.18.21",
  provider: "fixture-provider", model: "fixture-model", variant: "fixture-variant", variantSupported: true,
  modelSamplingSeedSupported: false, corpusGenerationSeed: "frozen-seed", candidateBundleFingerprints: [`sha256:${"2".repeat(64)}`],
  evaluatorFingerprint: `sha256:${"3".repeat(64)}`, corpusFingerprint: corpus.corpus_fingerprint,
  designFingerprint: `sha256:${"4".repeat(64)}`, semanticRuntimeFingerprint: `sha256:${"5".repeat(64)}` };
const unseededBinding = buildBenchmarkV3ModelBinding(bindingFixture);
const explicitlyUnseededBinding = buildBenchmarkV3ModelBinding({ ...bindingFixture, modelSamplingSeed: null });
assert.deepEqual(unseededBinding, explicitlyUnseededBinding);
assert.equal(unseededBinding.corpus_fingerprint, corpus.corpus_fingerprint);
assert.deepEqual(resolveBenchmarkV3StudySeeds(corpus), {
  corpus_generation_seed: corpus.generator.corpus_generation_seed,
  model_sampling_seed: null,
});
assert.throws(() => resolveBenchmarkV3StudySeeds(corpus, {
  corpusGenerationSeed: "substituted-seed",
}), /corpus generation seed substitution is forbidden/u);
assert.deepEqual(resolveBenchmarkV3StudySeeds(corpus, {
  corpusGenerationSeed: corpus.generator.corpus_generation_seed,
  modelSamplingSeed: "supported-model-seed",
  modelSamplingSeedSupported: true,
}), {
  corpus_generation_seed: corpus.generator.corpus_generation_seed,
  model_sampling_seed: "supported-model-seed",
});
assert.equal(design.retry_policy.maximum_infrastructure_retries, 1);

const outcome = (family, passed, overrides = {}) => ({
  family_id: family.family_id,
  stratum: family.stratum,
  passed,
  defect_severity: passed ? "none" : family.control_surface.defect_severity,
  timeout: false,
  duration_ms: 100,
  tokens: 0,
  activation: true,
  activation_eligible: true,
  process_status: 0,
  result_fingerprint: `sha256:${(passed ? "c" : "d").repeat(64)}`,
  ...overrides,
});
const baseline = families.map((family, index) => outcome(family, index >= 15));
const candidate = families.map((family) => outcome(family, true, { tokens: 10 }));
const report = summarizeBenchmarkV3Stage({ baseline, candidate });
assert.equal(report.family_count, 60);
assert.equal(report.candidate_only, 15);
assert.equal(report.baseline_only, 0);
assert.equal(report.paired_delta, 0.25);
assert.equal(report.exact_p <= 0.025, true);
assert.equal(report.candidate_tokens, 600);
assert.equal(report.activation_rate, 1);
assert.equal(evaluateBenchmarkV3Guardrails(design, report).passed, true);
assert.equal(evaluateBenchmarkV3EfficacyGate(design, report).passed, true);
const baselineTimeouts = [...baseline];
baselineTimeouts[0] = outcome(families[0], false, { timeout: true, process_status: null });
const baselineTimeoutReport = summarizeBenchmarkV3Stage({ baseline: baselineTimeouts, candidate });
assert.equal(baselineTimeoutReport.timeout_delta, -1 / baseline.length);
const candidateTimeouts = [...candidate];
candidateTimeouts[0] = outcome(families[0], false, { timeout: true, process_status: null });
candidateTimeouts[1] = outcome(families[1], false, { timeout: true, process_status: null });
const candidateTimeoutReport = summarizeBenchmarkV3Stage({ baseline, candidate: candidateTimeouts });
assert.equal(candidateTimeoutReport.timeout_delta, 2 / baseline.length);
assert.equal(evaluateBenchmarkV3Guardrails(design, candidateTimeoutReport).failures.includes("timeout-delta"), true);
const zeroInclusiveCi = evaluateBenchmarkV3EfficacyGate(design, {
  ...report, paired_delta: 0.1, exact_p: 0.01, confidence_interval: [0, 0.2],
});
assert.equal(zeroInclusiveCi.criteria.paired_delta, true);
assert.equal(zeroInclusiveCi.criteria.exact_p, true);
assert.equal(zeroInclusiveCi.criteria.confidence_interval_lower, false);
assert.equal(zeroInclusiveCi.passed, false);

const regressed = [...candidate];
const criticalFamilyIndex = 0;
regressed[criticalFamilyIndex] = outcome(families[criticalFamilyIndex], false);
const unsafe = summarizeBenchmarkV3Stage({ baseline: families.map((family) => outcome(family, true)), candidate: regressed });
assert.equal(unsafe.new_critical_regressions, 0);
assert.equal(unsafe.new_unclassified_semantic_regressions, 1);
assert.deepEqual(evaluateBenchmarkV3Guardrails(design, unsafe).failures.includes("new-unclassified-semantic-regression"), true);
const scoped = [...candidate];
scoped[0] = outcome(families[0], false, { scope_violation: true });
assert.equal(summarizeBenchmarkV3Stage({ baseline: families.map((family) => outcome(family, true)), candidate: scoped }).baseline_only, 1);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "v3-product-negative-"));
try {
  const clone = path.join(temporary, "source");
  assert.equal(spawnSync("git", ["clone", "--quiet", "--no-hardlinks", root, clone]).status, 0);
  const clean = materializeProfileBundleV3({ repositoryRoot: clone, bundleId: "core", outputDirectory: path.join(temporary, "clean") });
  assert.equal(clean.manifest.source_git_clean, true);
  assert.doesNotThrow(() => verifyBenchmarkV3ProductBundle(clone, clean.output_directory));
  fs.appendFileSync(path.join(clone, "agents", "core.md"), "\n");
  const dirty = materializeProfileBundleV3({ repositoryRoot: clone, bundleId: "core", outputDirectory: path.join(temporary, "dirty"), allowDirty: true });
  assert.equal(dirty.manifest.source_git_clean, false);
  assert.throws(() => verifyBenchmarkV3ProductBundle(clone, dirty.output_directory), /BENCHMARK_V3_RUNNER_PRODUCT_BINDING/u);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }

const executableRoot = fs.mkdtempSync(path.join(os.tmpdir(), "v3-opencode-binding-"));
try {
  const executable = path.join(executableRoot, "opencode");
  fs.writeFileSync(executable, "#!/bin/sh\nprintf '1.18.21\\n'\n", { mode: 0o700 });
  const identity = verifyBenchmarkV3OpenCodeExecutable(executable);
  assert.equal(identity.version, "1.18.21");
  assert.throws(() => verifyBenchmarkV3FilesystemIsolation(root, identity), /BENCHMARK_V3_RUNNER_(?:FILESYSTEM|NETWORK)_ISOLATION/u);
  fs.appendFileSync(executable, "# drift\n");
  assert.notEqual(verifyBenchmarkV3OpenCodeExecutable(executable).executable_fingerprint, identity.executable_fingerprint);
} finally { fs.rmSync(executableRoot, { recursive: true, force: true }); }

const runnerSource = fs.readFileSync(path.join(root, "lib", "benchmark", "v3-runner.mjs"), "utf8");
for (const forbidden of ["runBaseline:", "runCandidate:", "typeof runBaseline", "typeof runCandidate"]) assert.equal(runnerSource.includes(forbidden), false);
for (const required of ["runManagedCommand", "reviewed_source_root", "semantic_runtime_fingerprint", "catalog_before", "attempt_fingerprints", "json_event_count"]) {
  assert.equal(runnerSource.includes(required), true);
}
const allowedFinalStatuses = new Set([
  "POSITIVE HOLDOUT — PILOT REQUIRED",
  "NO PROMOTABLE HARNESS",
  "STUDY BLOCKED — INFRASTRUCTURE",
]);
for (const match of runnerSource.matchAll(/final_status:\s*"([^"]+)"/gu)) assert.equal(allowedFinalStatuses.has(match[1]), true);
const workerSource = fs.readFileSync(path.join(root, "scripts", "benchmark-v3-attempt-worker.mjs"), "utf8");
assert.equal(workerSource.includes("input.env"), true);
assert.equal(workerSource.includes("input.env_overrides"), true);
assert.equal(workerSource.includes("input.opencode_identity"), true);
assert.equal(workerSource.includes("stdout:"), false);

const workerFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "v3-worker-protocol-"));
try {
  const executable = path.join(workerFixtureRoot, "fake-opencode");
  fs.writeFileSync(executable, `#!/usr/bin/env node
if (process.argv[2] === "--version") { process.stdout.write("1.18.21\\n"); process.exit(0); }
if (process.argv[2] === "run" && process.argv[3] === "--help") { process.stdout.write("--variant <name>\\n"); process.exit(0); }
process.stdout.write(JSON.stringify({type:"step_finish",usage:{total_tokens:3}})+"\\n");
if (process.argv.includes("--open-before-text")) process.stdout.write(JSON.stringify({type:"step_start",part:{}})+"\\n");
if (process.argv.includes("--running-tool-before-text")) process.stdout.write(JSON.stringify({type:"tool_use",part:{id:"tool-1",state:{status:"running"}}})+"\\n");
if (process.argv.includes("--terminal-tool-reuse")) { process.stdout.write(JSON.stringify({type:"tool_use",part:{id:"tool-1",state:{status:"completed"}}})+"\\n"); process.stdout.write(JSON.stringify({type:"tool_use",part:{id:"tool-1",state:{status:"running"}}})+"\\n"); }
if (process.argv.includes("--final")) process.stdout.write(JSON.stringify({type:"text",part:{text:"done"}})+"\\n");
if (process.argv.includes("--unfinished")) process.stdout.write(JSON.stringify({type:"step_start",part:{}})+"\\n");
if (process.argv.includes("--valid-receipt")) require("node:fs").writeSync(3, JSON.stringify({schema_version:1,catalog_fingerprint:"sha256:${"a".repeat(64)}",catalog_status:"loaded",decision:{allowed:true,reason:"post_last_mutation_verification_passed"},activation:{post_last_mutation_verification:true},check:{status:"passed",command_fingerprint:"sha256:${"b".repeat(64)}"}})+"\\n");
if (process.argv.includes("--failed-receipt")) { require("node:fs").writeSync(3, JSON.stringify({schema_version:1,catalog_fingerprint:"sha256:${"a".repeat(64)}",catalog_status:"loaded",decision:{allowed:false,reason:"verification_failed"},activation:{post_last_mutation_verification:false},check:{status:"failed",command_fingerprint:"sha256:${"b".repeat(64)}"}})+"\\n"); process.exitCode=20; }
if (process.argv.includes("--unavailable-receipt")) { require("node:fs").writeSync(3, JSON.stringify({schema_version:1,catalog_fingerprint:"sha256:${"a".repeat(64)}",catalog_status:"loaded",decision:{allowed:false,reason:"verification_unavailable"},activation:{post_last_mutation_verification:false},check:{status:"unavailable",command_fingerprint:"sha256:${"b".repeat(64)}"}})+"\\n"); process.exitCode=20; }
if (process.argv.includes("--forged-receipt")) require("node:fs").writeSync(3, JSON.stringify({schema_version:1,catalog_fingerprint:"sha256:${"f".repeat(64)}",catalog_status:"loaded",decision:{allowed:true,reason:"post_last_mutation_verification_passed"},activation:{post_last_mutation_verification:true},check:{status:"passed",command_fingerprint:"sha256:${"b".repeat(64)}"}})+"\\n");
process.stderr.write('[opencode-harness-core] {"activation":{"post_last_mutation_verification":true}}\\n');
`, { mode: 0o700 });
  const stat = fs.lstatSync(executable);
  const identity = { schema_version: 1, path: fs.realpathSync.native(executable), size: stat.size, mode: stat.mode & 0o7777,
    device: String(stat.dev), inode: String(stat.ino), sha256: `sha256:${createHash("sha256").update(fs.readFileSync(executable)).digest("hex")}`,
    version: "1.18.21", variant_supported: false, seed_supported: false };
  const unseededCompatibility = verifyBenchmarkV3OpenCodeExecutable(executable);
  assert.equal(unseededCompatibility.version, "1.18.21");
  assert.equal(unseededCompatibility.variant_supported, true);
  assert.equal(unseededCompatibility.seed_supported, false);
  const runWorker = (args, candidate = false) => {
    const input = path.join(workerFixtureRoot, `input-${args.join("-")}-${candidate}.json`);
    const output = path.join(workerFixtureRoot, `output-${args.join("-")}-${candidate}.json`);
    fs.writeFileSync(input, JSON.stringify({ schema_version: 1, file: executable, args, cwd: workerFixtureRoot, timeout_ms: 10_000,
      env_overrides: {}, opencode_identity: identity,
      activation_binding: candidate ? { catalog_fingerprint: `sha256:${"a".repeat(64)}`, command_fingerprint: `sha256:${"b".repeat(64)}` } : null }));
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "benchmark-v3-attempt-worker.mjs"), input, output, "DONE"], { encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "DONE");
    return JSON.parse(fs.readFileSync(output, "utf8"));
  };
  const missingFinal = runWorker(["--missing-final"]);
  assert.equal(missingFinal.protocol_valid, false);
  assert.equal(missingFinal.terminal_event_count, 0);
  assert.equal(classifyBenchmarkV3AttemptReceipt(missingFinal, "baseline").infrastructure_failure, false);
  assert.equal(classifyBenchmarkV3AttemptReceipt(missingFinal, "baseline").verification_succeeded, false);
  const complete = runWorker(["--final"]);
  assert.equal(complete.protocol_valid, true);
  assert.equal(complete.terminal_event_count, 1);
  const unfinished = runWorker(["--final", "--unfinished"]);
  assert.equal(unfinished.protocol_valid, false);
  assert.equal(unfinished.terminal_event_count, 0);
  const openThenText = runWorker(["--open-before-text", "--final"]);
  assert.equal(openThenText.protocol_valid, false);
  assert.equal(openThenText.open_step_count, 1);
  const runningToolThenText = runWorker(["--running-tool-before-text", "--final"]);
  assert.equal(runningToolThenText.protocol_valid, false);
  assert.equal(runningToolThenText.unfinished_tool_count, 1);
  const terminalToolReuse = runWorker(["--terminal-tool-reuse", "--final"]);
  assert.equal(terminalToolReuse.protocol_valid, false);
  const spoofed = runWorker(["--final"], true);
  assert.equal(spoofed.activation, false);
  assert.equal(spoofed.activation_receipt_valid, false);
  const trustedPipe = runWorker(["--final", "--valid-receipt"], true);
  assert.equal(trustedPipe.activation, true);
  assert.equal(trustedPipe.activation_receipt_valid, true);
  assert.equal(trustedPipe.activation_receipt_authentic, true);
  assert.equal(classifyBenchmarkV3AttemptReceipt(trustedPipe, "candidate").verification_succeeded, true);
  for (const receiptFlag of ["--failed-receipt", "--unavailable-receipt"]) {
    const negative = runWorker(["--final", receiptFlag], true);
    assert.equal(negative.status, 20);
    assert.equal(negative.activation_receipt_authentic, true);
    assert.equal(negative.activation_receipt_valid, false);
    const classified = classifyBenchmarkV3AttemptReceipt(negative, "candidate");
    assert.equal(classified.receipt_authentic, true);
    assert.equal(classified.complete_scored_outcome, true);
    assert.equal(classified.verification_succeeded, false);
    assert.equal(classified.infrastructure_failure, false);
  }
  const forged = runWorker(["--final", "--forged-receipt"], true);
  assert.equal(forged.activation_receipt_authentic, false);
  assert.equal(classifyBenchmarkV3AttemptReceipt(forged, "candidate").infrastructure_failure, true);
  const timeoutReceipt = { ...trustedPipe, status: null, signal: "SIGTERM", timed_out: true, error_code: "ETIMEDOUT",
    protocol_valid: false, terminal_event_count: 0, activation: false, activation_receipt_valid: false,
    activation_receipt_authentic: false };
  for (const armKind of ["baseline", "candidate"]) {
    const timeoutClassification = classifyBenchmarkV3AttemptReceipt(timeoutReceipt, armKind);
    assert.equal(timeoutClassification.receipt_authentic, true);
    assert.equal(timeoutClassification.complete_scored_outcome, true);
    assert.equal(timeoutClassification.verification_succeeded, false);
    assert.equal(timeoutClassification.infrastructure_failure, false);
  }
  assert.equal(classifyBenchmarkV3AttemptReceipt({ ...timeoutReceipt, error_code: "EIO" }, "baseline").infrastructure_failure, true);
} finally { fs.rmSync(workerFixtureRoot, { recursive: true, force: true }); }

console.log(JSON.stringify({ status: "passed", evidence_class: "model-free-contained-runner-contract", model_execution: false,
  corpus_fingerprint: corpus.corpus_fingerprint, negative_product_self_assertion_rejected: true, hidden_control_absent_from_attempt_envelope: true }, null, 2));
