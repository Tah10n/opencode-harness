import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPublicKey, randomUUID, sign, verify as verifySignature } from "node:crypto";
import { spawnSync } from "node:child_process";

import { ContractError, canonicalJson, fingerprint } from "../feedback/contracts.mjs";
import { buildBenchmarkV3ArmOrderSchedule } from "./v3-arm-order.mjs";
import { loadBenchmarkV3Corpus } from "./v3-corpus.mjs";
import { loadBenchmarkV3Design } from "./v3-design.mjs";
import { loadSignedBenchmarkV3ExecutionAuthority } from "./v3-execution-authority.mjs";
import { loadSignedBenchmarkV3HoldoutCommitment, loadSignedExternalBenchmarkV3Holdout,
  revealBenchmarkV3HoldoutSelection } from "./v3-holdout.mjs";
import { benchmarkV3OperatorSpkiFingerprint, loadBenchmarkV3OperatorPrivateKey } from "./v3-operator-custody.mjs";
import { runBenchmarkV3IsolatedSemanticCase } from "./v3-operator-semantic.mjs";
import { buildProfileBundleManifest } from "../profile-v3.mjs";

const STRATA = Object.freeze(["small", "medium", "high"]);
const SHA = /^[0-9a-f]{40}$/u;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\0]+$/u;

function fail(message) { throw new ContractError("BENCHMARK_V3_OPERATOR_MATERIALIZE", message); }
function expect(condition, message) { if (!condition) fail(message); }
function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { fail(`${label} is unavailable`); }
}
function passed(result) { return result.status === 0 && result.signal === null && result.error === undefined; }
function run(file, args, options = {}) {
  return spawnSync(file, args, { encoding: "utf8", shell: false, windowsHide: true,
    maxBuffer: 64 * 1024 * 1024, ...options });
}
function writeJson(file, value) {
  const descriptor = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
  try { fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
}
function mkdirPrivate(directory) { fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); fs.chmodSync(directory, 0o700); }
function createProtectedDirectory(directory, channelRoot, ownerUid) {
  const configuredRoot = path.resolve(channelRoot);
  const root = fs.realpathSync.native(configuredRoot);
  const target = path.resolve(directory);
  const relative = path.relative(configuredRoot, target);
  expect(relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative),
    "external holdout target escaped its protected channel");
  let current = root;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    if (!fs.existsSync(current)) fs.mkdirSync(current, { mode: 0o700 });
    fs.chmodSync(current, 0o700);
    const stat = fs.lstatSync(current);
    expect(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === ownerUid,
      "external holdout target ancestry is not private and issuer-owned");
  }
}
function stageFiles(root, files) {
  for (const entry of files) {
    const target = path.join(root, ...entry.path.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.content, "utf8");
  }
}
function validFiles(files) {
  return Array.isArray(files) && files.length >= 1 && files.length <= 4
    && files.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry)
      && canonicalJson(Object.keys(entry).sort()) === canonicalJson(["content", "path"])
      && typeof entry.path === "string" && SAFE_PATH.test(entry.path) && typeof entry.content === "string"
      && Buffer.byteLength(entry.content) <= 256 * 1024)
    && new Set(files.map((entry) => entry.path)).size === files.length;
}
function validatePoolFamily(entry) {
  const keys = ["schema_version", "identity", "prompt", "clauses", "public_files", "hidden_test_files", "reference_files",
    "alternative_files", "alternative_provenance", "defect_severity", "test_argv", "runtime_key", "runtime_version",
    "expected_test_count"];
  expect(entry && typeof entry === "object" && !Array.isArray(entry)
    && canonicalJson(Object.keys(entry).sort()) === canonicalJson(keys.sort()) && entry.schema_version === 1,
  "private family-pool entry shape is invalid");
  const identity = entry.identity;
  expect(identity && typeof identity === "object" && STRATA.includes(identity.stratum)
    && SHA.test(identity.source_commit) && SHA.test(identity.parent_commit)
    && Array.isArray(identity.source_paths) && identity.source_paths.length >= 1 && identity.source_paths.length <= 4
    && identity.source_paths.every((sourcePath) => typeof sourcePath === "string" && SAFE_PATH.test(sourcePath)),
  "private family-pool identity is invalid");
  expect(typeof entry.prompt === "string" && entry.prompt.length > 10 && Array.isArray(entry.clauses)
    && entry.clauses.length === 5 && canonicalJson(entry.clauses.map((clause) => clause.kind))
      === canonicalJson(["observed-bug", "required-behavior", "preserved-behavior", "boundary-error-cases", "allowed-mutation"])
    && entry.clauses.every((clause, index) => clause?.clause_id === `REQ-00${index + 1}`
      && typeof clause.text === "string" && clause.text.length > 10),
  "private family-pool visible contract is invalid");
  expect([entry.public_files, entry.hidden_test_files, entry.reference_files, entry.alternative_files].every(validFiles)
    && canonicalJson(entry.public_files.map((file) => file.path)) === canonicalJson(identity.source_paths)
    && canonicalJson(entry.reference_files.map((file) => file.path)) === canonicalJson(identity.source_paths)
    && canonicalJson(entry.alternative_files.map((file) => file.path)) === canonicalJson(identity.source_paths)
    && fingerprint(entry.reference_files) !== fingerprint(entry.alternative_files),
  "private family-pool source, oracle, reference, or independent alternative files are invalid");
  expect(entry.alternative_provenance?.policy === "first-semantic-later-frozen-history-real-git-bytes-v1"
    && SHA.test(entry.alternative_provenance.source_commit)
    && entry.alternative_provenance.source_commit !== identity.source_commit,
  "private family-pool alternative provenance is invalid");
  expect(typeof entry.defect_severity === "string" && entry.defect_severity.length > 0
    && Array.isArray(entry.test_argv)
    && canonicalJson(entry.test_argv) === canonicalJson(entry.hidden_test_files.map((file) => file.path))
    && typeof entry.runtime_key === "string" && typeof entry.runtime_version === "string"
    && Number.isSafeInteger(entry.expected_test_count) && entry.expected_test_count > 0,
  "private family-pool oracle binding is invalid");
  return entry;
}

function semanticCase(repository, entry, semanticRuntimeRoot, overlay) {
  expect(passed(run("git", ["checkout", "--quiet", "--force", entry.identity.parent_commit], { cwd: repository })),
    "private family parent checkout failed");
  expect(passed(run("git", ["clean", "-fdx", "--quiet"], { cwd: repository })), "private family workspace clean failed");
  stageFiles(repository, entry.public_files);
  stageFiles(repository, entry.hidden_test_files);
  stageFiles(repository, overlay);
  return runBenchmarkV3IsolatedSemanticCase({ repository, semanticRuntimeRoot, runtimeKey: entry.runtime_key,
    testArgv: entry.test_argv, expectedTestCount: entry.expected_test_count });
}

function issuer(sourceRoot) {
  const value = readJson(path.join(sourceRoot, "benchmarks", "v3", "holdout-issuers.v1.json"), "holdout issuer registry");
  expect(value?.schema_version === 1 && Array.isArray(value.issuers) && value.issuers.length === 1,
    "holdout issuer registry is invalid");
  return value.issuers[0];
}

export function verifyBenchmarkV3OperatorHoldoutPoolBinding({ bindingPath, commitment, authority,
  familyPool, custodyDirectory, holdoutIssuer, now = Date.now() }) {
  const value = readJson(path.resolve(bindingPath), "pre-baseline family-pool binding");
  const expectedKeys = ["schema_version", "issuer_id", "protected_channel", "campaign_execution_id",
    "holdout_execution_id", "source_sha", "source_tree_fingerprint", "design_fingerprint", "corpus_fingerprint",
    "authority_fingerprint", "commitment_fingerprint", "sampling_frame_fingerprint", "family_pool_fingerprint",
    "salt_commitment", "custody_directory_fingerprint", "issued_at_ms", "expires_at_ms", "signature"];
  expect(value && typeof value === "object" && !Array.isArray(value)
    && canonicalJson(Object.keys(value).sort()) === canonicalJson(expectedKeys.sort()),
  "pre-baseline family-pool binding shape is invalid");
  const { signature, ...body } = value;
  let signatureValid = false;
  try { signatureValid = /^[A-Za-z0-9_-]{86}$/u.test(signature)
    && verifySignature(null, Buffer.from(canonicalJson(body), "utf8"), createPublicKey(holdoutIssuer.public_key_pem),
      Buffer.from(signature, "base64url")); } catch { signatureValid = false; }
  expect(value.schema_version === 1 && value.issuer_id === holdoutIssuer.issuer_id
    && value.protected_channel === holdoutIssuer.protected_channel
    && value.campaign_execution_id === authority.receipt.campaign_execution_id
    && value.holdout_execution_id === authority.receipt.holdout_execution_id
    && value.source_sha === authority.receipt.source_sha
    && value.source_tree_fingerprint === authority.receipt.source_tree_fingerprint
    && value.design_fingerprint === authority.receipt.design_fingerprint
    && value.corpus_fingerprint === authority.receipt.corpus_fingerprint
    && value.authority_fingerprint === authority.authority_fingerprint
    && value.commitment_fingerprint === commitment.commitment_fingerprint
    && value.sampling_frame_fingerprint === commitment.commitment.sampling_frame_fingerprint
    && value.salt_commitment === commitment.commitment.salt_commitment
    && value.family_pool_fingerprint === fingerprint(familyPool)
    && value.custody_directory_fingerprint === fingerprint(path.resolve(custodyDirectory))
    && Number.isSafeInteger(value.issued_at_ms) && Number.isSafeInteger(value.expires_at_ms)
    && value.issued_at_ms <= now && value.expires_at_ms > now
    && value.expires_at_ms - value.issued_at_ms <= 30 * 24 * 60 * 60 * 1000 && signatureValid,
  "private family pool is not the exact signed pre-baseline pool");
  return Object.freeze(value);
}

export function materializeBenchmarkV3ExternalHoldout({ sourceRoot, custodyRoot, outputDirectory, authorityPath,
  commitmentPath, campaignReportPath, familyPoolPath, semanticRuntimeRoot, provenanceBundle,
  holdoutRoot, ownerUid = 0, now = Date.now() }) {
  const source = fs.realpathSync.native(path.resolve(sourceRoot));
  const output = path.resolve(outputDirectory);
  const prepared = buildProfileBundleManifest(source, "lab").manifest;
  const corpus = loadBenchmarkV3Corpus(source);
  const { value: design, validation } = loadBenchmarkV3Design(source);
  const authority = loadSignedBenchmarkV3ExecutionAuthority({ sourceRoot: source, receiptPath: path.resolve(authorityPath),
    sourceSha: prepared.source_sha, sourceTreeFingerprint: prepared.source_tree_fingerprint,
    designFingerprint: validation.design_fingerprint, corpusFingerprint: corpus.corpus_fingerprint,
    outputDirectory: output, now });
  const commitment = loadSignedBenchmarkV3HoldoutCommitment({ sourceRoot: source, commitmentPath: path.resolve(commitmentPath),
    campaignExecutionId: authority.receipt.campaign_execution_id, holdoutExecutionId: authority.receipt.holdout_execution_id,
    sourceSha: prepared.source_sha, sourceTreeFingerprint: prepared.source_tree_fingerprint,
    designFingerprint: validation.design_fingerprint, corpusFingerprint: corpus.corpus_fingerprint, now });
  const report = readJson(path.resolve(campaignReportPath), "frozen campaign report");
  const { study_fingerprint: declaredStudyFingerprint, ...reportBody } = report;
  expect(declaredStudyFingerprint === fingerprint(reportBody) && report.status === "sealed-holdout-required"
    && report.validation_efficacy?.passed === true && report.ledger?.campaign_fingerprint === report.campaign_binding?.campaign_fingerprint
    && report.ledger?.final_candidate_sha === report.final_candidate_sha && SHA.test(report.final_candidate_sha)
    && Number.isSafeInteger(report.final_candidate_frozen_at_ms) && report.final_candidate_frozen_at_ms <= now
    && typeof report.product_bundle_fingerprint === "string",
  "campaign report is not a frozen passed-validation result");
  const frame = readJson(path.join(path.dirname(path.resolve(commitmentPath)), "sampling-frame.private.json"), "private sampling frame");
  const saltRecord = readJson(path.join(path.dirname(path.resolve(commitmentPath)), "selection-salt.private.json"), "private selection salt");
  const reveal = revealBenchmarkV3HoldoutSelection({ commitment, samplingFrame: frame, salt: saltRecord?.salt });
  const commitmentDirectory = path.dirname(path.resolve(commitmentPath));
  expect(path.resolve(familyPoolPath) === path.join(commitmentDirectory, "family-pool.private.json"),
    "external private family pool path differs from the committed custody directory");
  const pool = readJson(path.resolve(familyPoolPath), "external private family pool");
  expect(pool?.schema_version === 1 && Array.isArray(pool.families), "external private family pool is invalid");
  const holdoutIssuer = issuer(source);
  verifyBenchmarkV3OperatorHoldoutPoolBinding({
    bindingPath: path.join(path.resolve(holdoutIssuer.channel_root), "one-shot-prebaseline-commitment.json"),
    commitment, authority, familyPool: pool, custodyDirectory: commitmentDirectory, holdoutIssuer, now,
  });
  const poolFamilies = pool.families.map(validatePoolFamily);
  const byIdentity = new Map(poolFamilies.map((entry) => [fingerprint(entry.identity), entry]));
  expect(byIdentity.size === poolFamilies.length, "external private family pool contains duplicate identities");
  const selected = reveal.selected_identities.map((identity) => byIdentity.get(fingerprint(identity)));
  expect(selected.every(Boolean), "external private family pool does not cover the exact deterministic selection");
  expect(fs.existsSync(provenanceBundle) && path.isAbsolute(provenanceBundle)
    && fs.existsSync(semanticRuntimeRoot) && path.isAbsolute(semanticRuntimeRoot),
  "provenance bundle or semantic runtime is unavailable");
  const calibrationRepository = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "benchmark-v3-holdout-calibration-"));
  const rendered = [];
  try {
    expect(passed(run("git", ["clone", "--quiet", "--no-checkout", provenanceBundle, calibrationRepository])),
      "external holdout provenance clone failed");
    const counters = new Map(STRATA.map((stratum) => [stratum, 0]));
    for (const entry of selected) {
      const parent = run("git", ["rev-parse", `${entry.identity.source_commit}^`], { cwd: calibrationRepository });
      expect(passed(parent) && parent.stdout.trim() === entry.identity.parent_commit,
        "external private family parent binding is invalid");
      const ancestor = run("git", ["merge-base", "--is-ancestor", entry.identity.source_commit,
        readJson(path.join(source, "benchmarks", "v3", "corpus", "SOURCE.json"), "frozen provenance source").source_tip],
      { cwd: calibrationRepository });
      expect(passed(ancestor), "external private family commit is outside frozen provenance history");
      const alternativeDescends = run("git", ["merge-base", "--is-ancestor", entry.identity.source_commit,
        entry.alternative_provenance.source_commit], { cwd: calibrationRepository });
      const alternativeInFrozenHistory = run("git", ["merge-base", "--is-ancestor",
        entry.alternative_provenance.source_commit,
        readJson(path.join(source, "benchmarks", "v3", "corpus", "SOURCE.json"), "frozen provenance source").source_tip],
      { cwd: calibrationRepository });
      expect(passed(alternativeDescends) && passed(alternativeInFrozenHistory),
        "external semantic alternative is outside the later frozen provenance history");
      for (const file of entry.public_files) {
        const blob = run("git", ["show", `${entry.identity.parent_commit}:${file.path}`], { cwd: calibrationRepository });
        expect(passed(blob) && blob.stdout === file.content, "external public source bytes are not parent bytes");
      }
      for (const file of entry.hidden_test_files) {
        const blob = run("git", ["show", `${entry.identity.source_commit}:${file.path}`], { cwd: calibrationRepository });
        expect(passed(blob) && blob.stdout === file.content, "external hidden oracle bytes are not source-commit bytes");
      }
      for (const file of entry.reference_files) {
        const blob = run("git", ["show", `${entry.identity.source_commit}:${file.path}`], { cwd: calibrationRepository });
        expect(passed(blob) && blob.stdout === file.content, "external reference source bytes are not source-commit bytes");
      }
      for (const file of entry.alternative_files) {
        const blob = run("git", ["show", `${entry.alternative_provenance.source_commit}:${file.path}`],
          { cwd: calibrationRepository });
        expect(passed(blob) && blob.stdout === file.content, "external alternative source bytes are not later frozen-history bytes");
      }
      const preFix = semanticCase(calibrationRepository, entry, semanticRuntimeRoot, []);
      const reference = semanticCase(calibrationRepository, entry, semanticRuntimeRoot, entry.reference_files);
      const alternative = semanticCase(calibrationRepository, entry, semanticRuntimeRoot, entry.alternative_files);
      expect(preFix.authentic && !preFix.passed && reference.passed && alternative.passed,
        "pre-fix failure, reference calibration, or independent semantic alternative witness failed");
      const next = counters.get(entry.identity.stratum) + 1; counters.set(entry.identity.stratum, next);
      const familyId = `v3-external-holdout-${entry.identity.stratum}-${String(next).padStart(2, "0")}`;
      const contractBody = { schema_version: 1, contract_id: `${familyId}-public-contract`, clauses: entry.clauses };
      const contract = Object.freeze({ ...contractBody, contract_fingerprint: fingerprint(contractBody) });
      const publicSurface = Object.freeze({ schema_version: 1, family_id: familyId, split: "holdout",
        stratum: entry.identity.stratum, prompt: entry.prompt,
        visible_requirements: Object.freeze(entry.clauses.map((clause) => `${clause.kind}: ${clause.text}`)), contract,
        base_source_tip: readJson(path.join(source, "benchmarks", "v3", "corpus", "SOURCE.json"), "frozen provenance source").source_tip,
        public_files: Object.freeze(entry.public_files) });
      const controlSurface = Object.freeze({ schema_version: 1, family_id: familyId,
        oracle: "external-hidden-semantic-oracle-and-closed-mutation-set", defect_severity: entry.defect_severity,
        hidden_test_files: Object.freeze(entry.hidden_test_files), allowed_mutation_paths: Object.freeze(entry.identity.source_paths),
        test_argv: Object.freeze(entry.test_argv), runtime_key: entry.runtime_key, runtime_version: entry.runtime_version,
        expected_test_count: entry.expected_test_count, provenance: Object.freeze({ kind: "real-commit-derived",
          repository: "https://github.com/eslint/eslint", source_commit: entry.identity.source_commit,
          parent_commit: entry.identity.parent_commit, source_paths: Object.freeze(entry.identity.source_paths),
          license: "MIT", license_fingerprint: corpus.source.license_fingerprint }) });
      const manifestBody = { schema_version: 1, family_id: familyId,
        public_surface_fingerprint: fingerprint(publicSurface), control_surface_fingerprint: fingerprint(controlSurface),
        source_identity_fingerprint: fingerprint({ repository: controlSurface.provenance.repository,
          commit: controlSurface.provenance.source_commit }) };
      rendered.push(Object.freeze({ family_id: familyId, public_surface: publicSurface, control_surface: controlSurface,
        manifest: Object.freeze({ ...manifestBody, family_fingerprint: fingerprint(manifestBody) }) }));
    }
  } finally { fs.rmSync(calibrationRepository, { recursive: true, force: true }); }
  expect(rendered.length === 90 && STRATA.every((stratum) => rendered.filter((entry) => entry.public_surface.stratum === stratum).length === 30),
    "external holdout rendering did not produce exactly 30 families per stratum");
  const target = path.resolve(holdoutRoot);
  expect(!fs.existsSync(target), "external holdout materialization target already exists");
  const staging = `${target}.staging-${randomUUID()}`;
  expect(!fs.existsSync(staging), "external holdout staging target already exists");
  let manifest;
  let completed = false;
  try {
  createProtectedDirectory(staging, holdoutIssuer.channel_root, ownerUid);
  const familiesDirectory = path.join(staging, "families"); mkdirPrivate(familiesDirectory);
  for (const family of rendered) {
    const directory = path.join(familiesDirectory, family.family_id); mkdirPrivate(directory);
    writeJson(path.join(directory, "public.json"), family.public_surface);
    writeJson(path.join(directory, "control.json"), family.control_surface);
    writeJson(path.join(directory, "manifest.json"), family.manifest);
  }
  const familyIds = rendered.map((entry) => entry.family_id);
  const index = Object.freeze({ schema_version: 1, family_ids: familyIds, family_count: 90,
    corpus_index_fingerprint: fingerprint(familyIds) });
  writeJson(path.join(staging, "index.json"), index);
  const schedule = buildBenchmarkV3ArmOrderSchedule({ policy: design.arm_order_schedule, split: "holdout",
    families: rendered.map((entry) => ({ family_id: entry.family_id, stratum: entry.public_surface.stratum })) });
  const controlsFingerprint = fingerprint(rendered.map((entry) => ({ family_id: entry.family_id,
    control_surface_fingerprint: entry.manifest.control_surface_fingerprint,
    family_fingerprint: entry.manifest.family_fingerprint })));
  const key = loadBenchmarkV3OperatorPrivateKey({ custodyRoot, role: "holdout-custodian", ownerUid });
  expect(benchmarkV3OperatorSpkiFingerprint(key) === benchmarkV3OperatorSpkiFingerprint(holdoutIssuer.public_key_pem),
    "holdout custodian key does not match the committed issuer registry");
  const manifestBody = Object.freeze({ schema_version: 2, issuer_id: holdoutIssuer.issuer_id,
    protected_channel: holdoutIssuer.protected_channel, campaign_execution_id: authority.receipt.campaign_execution_id,
    holdout_execution_id: authority.receipt.holdout_execution_id,
    campaign_fingerprint: report.ledger.campaign_fingerprint, design_fingerprint: validation.design_fingerprint,
    final_candidate_sha: report.final_candidate_sha, product_bundle_fingerprint: report.product_bundle_fingerprint,
    candidate_frozen_at_ms: report.final_candidate_frozen_at_ms, created_after_candidate_freeze: true,
    family_count: 90, strata: Object.freeze({ small: 30, medium: 30, high: 30 }),
    corpus_index_fingerprint: index.corpus_index_fingerprint, controls_fingerprint: controlsFingerprint,
    oracle_calibration: Object.freeze({ pre_fix_fails: true, reference_fix_passes: true,
      independent_alternative_passes: true, audited_outside_public_git: true }), reference_solutions_included: false,
    holdout_selection: Object.freeze({ commitment_fingerprint: commitment.commitment_fingerprint, ...reveal }),
    arm_order_schedule: schedule, execution_limit: 1, issued_at_ms: now,
    expires_at_ms: now + 7 * 24 * 60 * 60 * 1000 });
  manifest = Object.freeze({ ...manifestBody,
    signature: sign(null, Buffer.from(canonicalJson(manifestBody), "utf8"), key).toString("base64url") });
  writeJson(path.join(staging, "manifest.json"), manifest);
  const previousBundle = process.env.BENCHMARK_V3_PROVENANCE_BUNDLE;
  process.env.BENCHMARK_V3_PROVENANCE_BUNDLE = provenanceBundle;
  try {
    loadSignedExternalBenchmarkV3Holdout({ sourceRoot: source, manifestPath: path.join(staging, "manifest.json"),
      campaignFingerprint: report.ledger.campaign_fingerprint, designFingerprint: validation.design_fingerprint,
      finalCandidateSha: report.final_candidate_sha, productBundleFingerprint: report.product_bundle_fingerprint,
      candidateFrozenAtMs: report.final_candidate_frozen_at_ms,
      campaignExecutionId: authority.receipt.campaign_execution_id,
      holdoutExecutionId: authority.receipt.holdout_execution_id, holdoutCommitment: commitment,
      armOrderPolicy: design.arm_order_schedule,
      publicSourceCommits: corpus.split_assignment.entries.map((entry) => entry.source_commit),
      publicSourcePaths: corpus.families.flatMap((entry) => entry.control_surface.provenance.source_paths), now });
  } finally {
    if (previousBundle === undefined) delete process.env.BENCHMARK_V3_PROVENANCE_BUNDLE;
    else process.env.BENCHMARK_V3_PROVENANCE_BUNDLE = previousBundle;
  }
  fs.renameSync(staging, target);
  completed = true;
  } finally {
    if (!completed) fs.rmSync(staging, { recursive: true, force: true });
  }
  return Object.freeze({ manifest_path: path.join(target, "manifest.json"), manifest_fingerprint: fingerprint(manifest),
    family_count: 90, strata: Object.freeze({ small: 30, medium: 30, high: 30 }),
    reference_solutions_included: false, calibration: manifest.oracle_calibration });
}
