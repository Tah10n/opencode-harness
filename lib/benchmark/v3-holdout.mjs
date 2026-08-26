import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPublicKey, verify as verifySignature } from "node:crypto";
import { spawnSync } from "node:child_process";

import { ContractError, canonicalJson, fingerprint } from "../feedback/contracts.mjs";
import { materializeBenchmarkV3ProvenanceBundle } from "./v3-corpus.mjs";

const FP = /^sha256:[0-9a-f]{64}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\0]+$/u;
const STRATA = Object.freeze(["small", "medium", "high"]);

function fail(code, message) { throw new ContractError(code, message); }
function expect(condition, code, message) { if (!condition) fail(code, message); }
function exact(value, keys, label) {
  expect(value && typeof value === "object" && !Array.isArray(value), "BENCHMARK_V3_HOLDOUT_SHAPE", `${label} must be an object`);
  expect(canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()),
    "BENCHMARK_V3_HOLDOUT_SHAPE", `${label} keys are invalid`);
}
function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { fail("BENCHMARK_V3_HOLDOUT_JSON", `${label} is invalid`); }
}
function assertPrivateTree(root, ownerUid) {
  const entries = [];
  const visit = (current, relative = "") => {
    const stat = fs.lstatSync(current);
    expect(!stat.isSymbolicLink() && stat.uid === ownerUid, "BENCHMARK_V3_HOLDOUT_CUSTODY",
      "private holdout tree contains a link or foreign owner");
    if (stat.isDirectory()) {
      expect((stat.mode & 0o077) === 0, "BENCHMARK_V3_HOLDOUT_CUSTODY", "private holdout directory is accessible to another principal");
      if (relative !== "") entries.push(`${relative}/`);
      for (const name of fs.readdirSync(current).sort()) visit(path.join(current, name), relative === "" ? name : `${relative}/${name}`);
    } else {
      expect(stat.isFile() && stat.nlink === 1 && (stat.mode & 0o077) === 0 && stat.size <= 512 * 1024,
        "BENCHMARK_V3_HOLDOUT_CUSTODY", "private holdout file is not ordinary, private, or bounded");
      entries.push(relative);
    }
  };
  visit(root);
  return Object.freeze(entries);
}
function validateFiles(files, label) {
  expect(Array.isArray(files) && files.length >= 1 && files.length <= 4,
    "BENCHMARK_V3_HOLDOUT_FILES", `${label} count is invalid`);
  for (const [index, entry] of files.entries()) {
    exact(entry, ["path", "content"], `${label}[${index}]`);
    expect(typeof entry.path === "string" && SAFE_PATH.test(entry.path) && typeof entry.content === "string"
      && Buffer.byteLength(entry.content) <= 256 * 1024,
    "BENCHMARK_V3_HOLDOUT_FILES", `${label}[${index}] is invalid`);
  }
  expect(new Set(files.map((entry) => entry.path)).size === files.length,
    "BENCHMARK_V3_HOLDOUT_FILES", `${label} paths are duplicated`);
}

export function loadBenchmarkV3HoldoutIssuers(sourceRoot) {
  const value = readJson(path.join(sourceRoot, "benchmarks", "v3", "holdout-issuers.v1.json"), "holdout issuer registry");
  exact(value, ["schema_version", "issuers"], "holdout issuer registry");
  expect(value.schema_version === 1 && Array.isArray(value.issuers) && value.issuers.length >= 1,
    "BENCHMARK_V3_HOLDOUT_ISSUER", "holdout issuer registry is invalid");
  return Object.freeze(value.issuers.map((entry) => Object.freeze(entry)));
}

function readProtectedManifest(manifestPath, issuer) {
  const channelRoot = fs.realpathSync.native(path.resolve(issuer.channel_root));
  const absolute = path.resolve(manifestPath);
  const parent = fs.realpathSync.native(path.dirname(absolute));
  const canonical = path.join(parent, path.basename(absolute));
  expect(inside(channelRoot, canonical), "BENCHMARK_V3_HOLDOUT_CUSTODY", "manifest is outside its protected custody channel");
  let current = parent;
  while (true) {
    const stat = fs.lstatSync(current);
    expect(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === issuer.owner_uid && (stat.mode & 0o077) === 0,
      "BENCHMARK_V3_HOLDOUT_CUSTODY", "holdout custody ancestry is not private and issuer-owned");
    if (current === channelRoot) break;
    const next = path.dirname(current);
    expect(next !== current && inside(channelRoot, next), "BENCHMARK_V3_HOLDOUT_CUSTODY", "holdout custody ancestry escaped");
    current = next;
  }
  const descriptor = fs.openSync(canonical, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs.fstatSync(descriptor);
    expect(stat.isFile() && stat.nlink === 1 && stat.uid === issuer.owner_uid && (stat.mode & 0o077) === 0 && stat.size <= 128 * 1024,
      "BENCHMARK_V3_HOLDOUT_CUSTODY", "manifest file is not private, bounded, and issuer-owned");
    return JSON.parse(fs.readFileSync(descriptor, "utf8"));
  } finally { fs.closeSync(descriptor); }
}

export function loadSignedExternalBenchmarkV3Holdout({ sourceRoot, manifestPath, campaignFingerprint, designFingerprint,
  finalCandidateSha, productBundleFingerprint, candidateFrozenAtMs, trustedIssuers = loadBenchmarkV3HoldoutIssuers(sourceRoot), now = Date.now(),
  publicSourceCommits = [], publicSourcePaths = [] }) {
  expect(typeof manifestPath === "string" && path.isAbsolute(manifestPath) && Array.isArray(trustedIssuers)
    && Array.isArray(publicSourceCommits) && Array.isArray(publicSourcePaths),
    "BENCHMARK_V3_HOLDOUT_ARGUMENT", "external manifest path or issuer registry is invalid");
  const frozenSource = readJson(path.join(sourceRoot, "benchmarks", "v3", "corpus", "SOURCE.json"), "frozen provenance source");
  const matching = trustedIssuers.filter((issuer) => {
    try { return inside(fs.realpathSync.native(path.resolve(issuer.channel_root)), fs.realpathSync.native(path.dirname(manifestPath))); } catch { return false; }
  });
  expect(matching.length === 1, "BENCHMARK_V3_HOLDOUT_ISSUER", "external manifest issuer channel is untrusted or ambiguous");
  const [issuer] = matching;
  const value = readProtectedManifest(manifestPath, issuer);
  exact(value, ["schema_version", "issuer_id", "protected_channel", "campaign_fingerprint", "design_fingerprint",
    "final_candidate_sha", "product_bundle_fingerprint", "candidate_frozen_at_ms", "created_after_candidate_freeze", "family_count", "strata",
    "corpus_index_fingerprint", "controls_fingerprint", "oracle_calibration", "reference_solutions_included",
    "execution_limit", "issued_at_ms", "expires_at_ms", "signature"], "signed external holdout manifest");
  const { signature, ...body } = value;
  let signatureValid = false;
  try {
    signatureValid = SIGNATURE.test(signature)
      && verifySignature(null, Buffer.from(canonicalJson(body), "utf8"), createPublicKey(issuer.public_key_pem), Buffer.from(signature, "base64url"));
  } catch { signatureValid = false; }
  exact(value.strata, STRATA, "signed external holdout strata");
  exact(value.oracle_calibration, ["pre_fix_fails", "reference_fix_passes", "independent_alternative_passes", "audited_outside_public_git"],
    "signed external holdout oracle calibration");
  expect(value.schema_version === 1 && value.issuer_id === issuer.issuer_id && value.protected_channel === issuer.protected_channel
    && value.campaign_fingerprint === campaignFingerprint && value.design_fingerprint === designFingerprint
    && value.final_candidate_sha === finalCandidateSha && value.product_bundle_fingerprint === productBundleFingerprint
    && value.candidate_frozen_at_ms === candidateFrozenAtMs && Number.isSafeInteger(candidateFrozenAtMs)
    && value.issued_at_ms >= candidateFrozenAtMs && value.created_after_candidate_freeze === true && value.family_count === 90
    && STRATA.every((stratum) => value.strata[stratum] === 30) && FP.test(value.corpus_index_fingerprint)
    && FP.test(value.controls_fingerprint) && value.reference_solutions_included === false && value.execution_limit === 1
    && value.oracle_calibration.pre_fix_fails === true && value.oracle_calibration.reference_fix_passes === true
    && value.oracle_calibration.independent_alternative_passes === true && value.oracle_calibration.audited_outside_public_git === true
    && Number.isSafeInteger(value.issued_at_ms) && Number.isSafeInteger(value.expires_at_ms)
    && value.issued_at_ms <= now && value.expires_at_ms > now && value.expires_at_ms - value.issued_at_ms <= 7 * 24 * 60 * 60 * 1000
    && signatureValid, "BENCHMARK_V3_HOLDOUT_SIGNATURE", "external manifest binding, calibration, signature, or expiry is invalid");

  const holdoutRoot = path.dirname(path.resolve(manifestPath));
  const custodyInventory = assertPrivateTree(holdoutRoot, issuer.owner_uid);
  const index = readJson(path.join(holdoutRoot, "index.json"), "external holdout index");
  exact(index, ["schema_version", "family_ids", "family_count", "corpus_index_fingerprint"], "external holdout index");
  expect(index.schema_version === 1 && index.family_count === 90 && Array.isArray(index.family_ids)
    && index.family_ids.length === 90 && index.corpus_index_fingerprint === fingerprint(index.family_ids)
    && index.corpus_index_fingerprint === value.corpus_index_fingerprint,
  "BENCHMARK_V3_HOLDOUT_INDEX", "external holdout index is invalid or not signed");
  const families = [];
  for (const familyId of index.family_ids) {
    expect(/^v3-external-holdout-(?:small|medium|high)-[0-9]{2}$/u.test(familyId),
      "BENCHMARK_V3_HOLDOUT_FAMILY", "external holdout family id is invalid");
    const directory = path.join(holdoutRoot, "families", familyId);
    const publicSurface = readJson(path.join(directory, "public.json"), `${familyId}/public`);
    const controlSurface = readJson(path.join(directory, "control.json"), `${familyId}/control`);
    const familyManifest = readJson(path.join(directory, "manifest.json"), `${familyId}/manifest`);
    exact(publicSurface, ["schema_version", "family_id", "split", "stratum", "prompt", "visible_requirements", "contract", "base_source_tip", "public_files"], `${familyId}/public`);
    exact(controlSurface, ["schema_version", "family_id", "oracle", "defect_severity", "hidden_test_files", "allowed_mutation_paths",
      "test_argv", "runtime_key", "runtime_version", "expected_test_count", "provenance"], `${familyId}/control`);
    exact(familyManifest, ["schema_version", "family_id", "public_surface_fingerprint", "control_surface_fingerprint",
      "source_identity_fingerprint", "family_fingerprint"], `${familyId}/manifest`);
    validateFiles(publicSurface.public_files, `${familyId}.public_files`);
    validateFiles(controlSurface.hidden_test_files, `${familyId}.hidden_test_files`);
    exact(publicSurface.contract, ["schema_version", "contract_id", "clauses", "contract_fingerprint"], `${familyId}.contract`);
    exact(controlSurface.provenance, ["kind", "repository", "source_commit", "parent_commit", "source_paths", "license", "license_fingerprint"],
      `${familyId}.provenance`);
    const kinds = publicSurface.contract?.clauses?.map((entry) => entry.kind);
    expect(publicSurface.schema_version === 1 && publicSurface.family_id === familyId && publicSurface.split === "holdout"
      && STRATA.includes(publicSurface.stratum) && Array.isArray(publicSurface.visible_requirements)
      && canonicalJson(kinds) === canonicalJson(["observed-bug", "required-behavior", "preserved-behavior", "boundary-error-cases", "allowed-mutation"])
      && publicSurface.contract.schema_version === 1 && publicSurface.contract.contract_id === `${familyId}-public-contract`
      && publicSurface.contract.clauses.every((entry, index) => entry.clause_id === `REQ-00${index + 1}`
        && typeof entry.text === "string" && entry.text.length > 10)
      && publicSurface.contract.contract_fingerprint === fingerprint({ schema_version: publicSurface.contract.schema_version,
        contract_id: publicSurface.contract.contract_id, clauses: publicSurface.contract.clauses })
      && canonicalJson(publicSurface.visible_requirements) === canonicalJson(publicSurface.contract.clauses.map((entry) => `${entry.kind}: ${entry.text}`))
      && publicSurface.base_source_tip === frozenSource.source_tip && SHA.test(publicSurface.base_source_tip)
      && !Object.hasOwn(controlSurface, "reference_files") && controlSurface.schema_version === 1 && controlSurface.family_id === familyId
      && controlSurface.oracle === "external-hidden-semantic-oracle-and-closed-mutation-set"
      && Number.isSafeInteger(controlSurface.expected_test_count) && controlSurface.expected_test_count > 0
      && Array.isArray(controlSurface.allowed_mutation_paths) && canonicalJson(controlSurface.allowed_mutation_paths)
        === canonicalJson(publicSurface.public_files.map((entry) => entry.path))
      && Array.isArray(controlSurface.test_argv) && controlSurface.hidden_test_files.every((entry) => controlSurface.test_argv.includes(entry.path))
      && controlSurface.provenance.kind === "real-commit-derived" && controlSurface.provenance.repository === "https://github.com/eslint/eslint"
      && canonicalJson(controlSurface.provenance.source_paths) === canonicalJson(controlSurface.allowed_mutation_paths)
      && controlSurface.provenance.license === "MIT" && controlSurface.provenance.license_fingerprint === frozenSource.license_fingerprint
      && SHA.test(controlSurface.provenance?.source_commit) && SHA.test(controlSurface.provenance?.parent_commit)
      && !publicSourceCommits.includes(controlSurface.provenance.source_commit)
      && controlSurface.provenance.source_paths.every((entry) => !publicSourcePaths.includes(entry)),
    "BENCHMARK_V3_HOLDOUT_FAMILY", `${familyId} public contract, private control, or disjointness is invalid`);
    const manifestBody = { ...familyManifest }; delete manifestBody.family_fingerprint;
    expect(familyManifest.public_surface_fingerprint === fingerprint(publicSurface)
      && familyManifest.control_surface_fingerprint === fingerprint(controlSurface)
      && familyManifest.source_identity_fingerprint === fingerprint({ repository: controlSurface.provenance.repository,
        commit: controlSurface.provenance.source_commit })
      && familyManifest.family_fingerprint === fingerprint(manifestBody),
    "BENCHMARK_V3_HOLDOUT_FAMILY", `${familyId} family binding is stale`);
    families.push(Object.freeze({ family_id: familyId, split: "holdout", stratum: publicSurface.stratum,
      public_surface: Object.freeze(publicSurface), control_surface: Object.freeze(controlSurface), manifest: Object.freeze(familyManifest) }));
  }
  expect(STRATA.every((stratum) => families.filter((entry) => entry.stratum === stratum).length === 30)
    && new Set(families.map((entry) => entry.control_surface.provenance.source_commit)).size === 90
    && new Set(families.flatMap((entry) => entry.control_surface.provenance.source_paths)).size
      === families.flatMap((entry) => entry.control_surface.provenance.source_paths).length,
  "BENCHMARK_V3_HOLDOUT_FAMILY", "external holdout strata or source lineages are not independent");
  const controlsFingerprint = fingerprint(families.map((entry) => ({ family_id: entry.family_id,
    control_surface_fingerprint: entry.manifest.control_surface_fingerprint,
    family_fingerprint: entry.manifest.family_fingerprint })));
  expect(controlsFingerprint === value.controls_fingerprint,
    "BENCHMARK_V3_HOLDOUT_CONTROLS", "private controls do not match the signed manifest");
  const expectedInventory = ["manifest.json", "index.json", "families/", ...index.family_ids.flatMap((familyId) => [
    `families/${familyId}/`, `families/${familyId}/public.json`, `families/${familyId}/control.json`, `families/${familyId}/manifest.json`,
  ])].sort();
  expect(canonicalJson(custodyInventory) === canonicalJson(expectedInventory),
    "BENCHMARK_V3_HOLDOUT_CUSTODY", "private holdout custody tree contains an undeclared file or directory");
  const provenance = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "benchmark-v3-holdout-provenance-"));
  try {
    const clone = spawnSync("git", ["clone", "--quiet", "--bare", materializeBenchmarkV3ProvenanceBundle(sourceRoot), provenance],
      { encoding: "utf8", shell: false, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    expect(clone.status === 0 && clone.signal === null && clone.error === undefined,
      "BENCHMARK_V3_HOLDOUT_PROVENANCE", "external holdout provenance clone failed");
    for (const family of families) {
      const control = family.control_surface;
      const parent = spawnSync("git", ["rev-parse", `${control.provenance.source_commit}^`], { cwd: provenance, encoding: "utf8" });
      expect(parent.status === 0 && parent.stdout.trim() === control.provenance.parent_commit,
        "BENCHMARK_V3_HOLDOUT_PROVENANCE", `${family.family_id} source parent binding is invalid`);
      const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", control.provenance.source_commit, frozenSource.source_tip],
        { cwd: provenance, encoding: "utf8" });
      expect(ancestor.status === 0, "BENCHMARK_V3_HOLDOUT_PROVENANCE",
        `${family.family_id} source commit is outside the frozen provenance history`);
      for (const entry of family.public_surface.public_files) {
        const blob = spawnSync("git", ["show", `${control.provenance.parent_commit}:${entry.path}`], { cwd: provenance, encoding: "utf8",
          maxBuffer: 2 * 1024 * 1024 });
        expect(blob.status === 0 && blob.stdout === entry.content,
          "BENCHMARK_V3_HOLDOUT_PROVENANCE", `${family.family_id} public source bytes are not parent bytes`);
      }
      for (const entry of control.hidden_test_files) {
        const blob = spawnSync("git", ["show", `${control.provenance.source_commit}:${entry.path}`], { cwd: provenance, encoding: "utf8",
          maxBuffer: 2 * 1024 * 1024 });
        expect(blob.status === 0 && blob.stdout === entry.content,
          "BENCHMARK_V3_HOLDOUT_PROVENANCE", `${family.family_id} private oracle bytes are not source-commit test bytes`);
      }
    }
  } finally { fs.rmSync(provenance, { recursive: true, force: true }); }
  return Object.freeze({ manifest: Object.freeze(value), families: Object.freeze(families),
    corpus_fingerprint: fingerprint(families.map((entry) => entry.manifest)), holdout_root: holdoutRoot });
}
