import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

import { ContractError, canonicalJson, fingerprint } from "../feedback/contracts.mjs";
import { verifyBenchmarkV3SplitDistribution } from "./v3-split-assignment.mjs";

export const V3_SPLIT_COUNTS = Object.freeze({ development: 60, validation: 60 });
export const V3_EXTERNAL_HOLDOUT_COUNT = 90;
const STRATUM_COUNTS = Object.freeze({ development: 20, validation: 20 });
const STRATA = Object.freeze(["small", "medium", "high"]);
const FP = /^sha256:[0-9a-f]{64}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\0]+$/u;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u;
const SEMANTIC_RUNTIME_KEY = /^eslint-v(?:(?:7|10)|(?:4|5|6|8|9)\.[0-9]+)$/u;

function fail(code, message) { throw new ContractError(code, message); }
function expect(condition, code, message) { if (!condition) fail(code, message); }
export function isBenchmarkV3SemanticRuntimeKey(value) {
  return typeof value === "string" && SEMANTIC_RUNTIME_KEY.test(value);
}
function readJson(file, label) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { fail("BENCHMARK_V3_CORPUS_JSON", `${label} is invalid`); } }
function exact(value, keys, label) {
  expect(value && typeof value === "object" && !Array.isArray(value), "BENCHMARK_V3_CORPUS_SHAPE", `${label} must be an object`);
  expect(canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()), "BENCHMARK_V3_CORPUS_SHAPE", `${label} keys are invalid`);
}
function run(command, args, options = {}) { return spawnSync(command, args, { encoding: "utf8", shell: false, windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...options }); }
function passed(result) { return result.error === undefined && result.signal === null && result.status === 0; }
function validateFiles(files, label, maximumCount = 4, maximumBytes = 256 * 1024) {
  expect(Array.isArray(files) && files.length >= 1 && files.length <= maximumCount, "BENCHMARK_V3_CORPUS_FILES", `${label} count is invalid`);
  const normalized = files.map((entry, index) => {
    exact(entry, ["path", "content"], `${label}[${index}]`);
    expect(typeof entry.path === "string" && SAFE_PATH.test(entry.path) && typeof entry.content === "string"
      && Buffer.byteLength(entry.content) <= maximumBytes, "BENCHMARK_V3_CORPUS_FILES", `${label}[${index}] is invalid`);
    return Object.freeze({ ...entry });
  });
  expect(new Set(normalized.map((entry) => entry.path)).size === normalized.length, "BENCHMARK_V3_CORPUS_FILES", `${label} paths are duplicated`);
  return Object.freeze(normalized);
}
function stageFiles(root, files) {
  for (const entry of files) {
    const target = path.resolve(root, ...entry.path.split("/"));
    const relative = path.relative(root, target);
    expect(relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), "BENCHMARK_V3_CORPUS_PATH", "staged path escapes the workspace");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.content, "utf8");
  }
}
function sha256File(file) { return `sha256:${createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`; }
function mochaEntrypoint(nodeModules) {
  const candidates = [path.join(nodeModules, "mocha", "bin", "mocha.js"), path.join(nodeModules, "mocha", "bin", "mocha")];
  return candidates.find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile()) ?? candidates[0];
}
function directoryContentFingerprint(directory) {
  const root = fs.realpathSync.native(directory);
  const hash = createHash("sha256");
  let fileCount = 0;
  const visit = (current, prefix = "") => {
    for (const name of fs.readdirSync(current).sort()) {
      const relative = prefix === "" ? name : `${prefix}/${name}`;
      const target = path.join(current, name);
      const stat = fs.lstatSync(target);
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        hash.update(`${JSON.stringify([relative, "directory", stat.mode & 0o7777])}\n`);
        visit(target, relative);
      } else if (stat.isFile() && !stat.isSymbolicLink()) {
        const bytes = fs.readFileSync(target);
        hash.update(`${JSON.stringify([relative, "file", stat.mode & 0o7777, bytes.length, createHash("sha256").update(bytes).digest("hex")])}\n`);
        fileCount += 1;
      } else if (stat.isSymbolicLink()) {
        const link = fs.readlinkSync(target);
        const resolved = path.resolve(path.dirname(target), link);
        const inside = path.relative(root, resolved);
        expect(inside !== ".." && !inside.startsWith(`..${path.sep}`) && !path.isAbsolute(inside),
          "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "semantic runtime symlink escapes its node_modules tree");
        hash.update(`${JSON.stringify([relative, "symlink", stat.mode & 0o7777, link])}\n`);
      } else fail("BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "semantic runtime contains an unsupported filesystem entry");
    }
  };
  visit(root);
  return Object.freeze({ fingerprint: `sha256:${hash.digest("hex")}`, file_count: fileCount });
}

function parseSemanticVersion(value) {
  const match = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u.exec(value);
  if (!match) return null;
  return Object.freeze({ major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [] });
}

function compareSemanticVersions(left, right) {
  for (const key of ["major", "minor", "patch"]) if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) return 0;
    return left.prerelease.length === 0 ? 1 : -1;
  }
  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index += 1) {
    if (left.prerelease[index] === undefined) return -1;
    if (right.prerelease[index] === undefined) return 1;
    if (left.prerelease[index] === right.prerelease[index]) continue;
    const leftNumeric = /^(?:0|[1-9][0-9]*)$/u.test(left.prerelease[index]);
    const rightNumeric = /^(?:0|[1-9][0-9]*)$/u.test(right.prerelease[index]);
    if (leftNumeric && rightNumeric) return Number(left.prerelease[index]) < Number(right.prerelease[index]) ? -1 : 1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return left.prerelease[index] < right.prerelease[index] ? -1 : 1;
  }
  return 0;
}

function satisfiesSemanticVersion(versionValue, rangeValue) {
  const version = parseSemanticVersion(versionValue);
  if (!version || typeof rangeValue !== "string") return false;
  const alternatives = rangeValue.split("||").map((entry) => entry.trim());
  return alternatives.some((alternative) => {
    const wildcard = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.[xX*]$/u.exec(alternative);
    if (wildcard) return version.prerelease.length === 0
      && version.major === Number(wildcard[1]) && version.minor === Number(wildcard[2]);
    const match = /^(\^|~|>=|>|<=|<)?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z.-]+))?$/u.exec(alternative);
    if (!match) return false;
    const operator = match[1] ?? "=";
    const floor = parseSemanticVersion(`${match[2]}.${match[3]}.${match[4]}${match[5] ? `-${match[5]}` : ""}`);
    const comparison = compareSemanticVersions(version, floor);
    if (version.prerelease.length > 0 && (floor.prerelease.length === 0
      || version.major !== floor.major || version.minor !== floor.minor || version.patch !== floor.patch)) return false;
    if (operator === "=") return comparison === 0;
    if (operator === ">=") return comparison >= 0;
    if (operator === ">") return comparison > 0;
    if (operator === "<=") return comparison <= 0;
    if (operator === "<") return comparison < 0;
    const ceiling = operator === "~"
      ? { major: floor.major, minor: floor.minor + 1, patch: 0, prerelease: [] }
      : floor.major > 0
        ? { major: floor.major + 1, minor: 0, patch: 0, prerelease: [] }
        : floor.minor > 0
          ? { major: 0, minor: floor.minor + 1, patch: 0, prerelease: [] }
          : { major: 0, minor: 0, patch: floor.patch + 1, prerelease: [] };
    return comparison >= 0 && compareSemanticVersions(version, ceiling) < 0;
  });
}

function directLockDeclaration(lockValue, section, name) {
  if (!lockValue.packages) return null;
  return lockValue.packages[""]?.[section]?.[name] ?? null;
}

function semanticRuntimeDependencyInventory(directory, packageFile, lockFile) {
  const packageValue = readJson(packageFile, "semantic runtime package.json");
  const lockValue = readJson(lockFile, "semantic runtime package-lock.json");
  expect(typeof packageValue.name === "string" && packageValue.name.length <= 214 && PACKAGE_NAME.test(packageValue.name)
    && typeof packageValue.version === "string"
    && Number.isSafeInteger(lockValue.lockfileVersion), "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME",
  "semantic runtime dependency manifests are invalid");
  expect(lockValue.name === packageValue.name && lockValue.version === packageValue.version,
    "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "semantic runtime root package does not match the lockfile");
  const required = { ...(packageValue.dependencies ?? {}), ...(packageValue.devDependencies ?? {}) };
  const optional = { ...(packageValue.optionalDependencies ?? {}) };
  const sections = new Map();
  for (const [section, dependencies] of [["dependencies", packageValue.dependencies ?? {}],
    ["devDependencies", packageValue.devDependencies ?? {}], ["optionalDependencies", optional]]) {
    expect(dependencies && typeof dependencies === "object" && !Array.isArray(dependencies)
      && Object.entries(dependencies).every(([name, entry]) => name.length <= 214 && PACKAGE_NAME.test(name)
        && typeof entry === "string"),
    "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", `semantic runtime ${section} are invalid`);
    for (const name of Object.keys(dependencies)) sections.set(name, section);
  }
  if (lockValue.packages) expect(lockValue.packages[""]?.name === packageValue.name
    && lockValue.packages[""]?.version === packageValue.version,
  "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "semantic runtime root package does not match the lockfile");
  const entries = [];
  for (const [name, declared] of Object.entries({ ...required, ...optional }).sort(([left], [right]) => left.localeCompare(right))) {
    const lockDeclaration = directLockDeclaration(lockValue, sections.get(name), name);
    expect(!lockValue.packages || lockDeclaration === declared,
      "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", `${name} declaration does not match the lockfile`);
    if (name === packageValue.name && declared === "file:.") {
      const installedSelf = path.join(directory, "node_modules", ...name.split("/"));
      const lockedSelf = lockValue.packages?.[`node_modules/${name}`] ?? lockValue.dependencies?.[name] ?? null;
      const v3Binding = lockedSelf?.link === true && lockedSelf.resolved === "";
      const v1Binding = !lockValue.packages && lockedSelf?.version === declared;
      expect((v3Binding || v1Binding) && fs.existsSync(installedSelf)
        && fs.realpathSync.native(installedSelf) === fs.realpathSync.native(directory),
      "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "semantic runtime self dependency does not match the lockfile and root link");
      entries.push(Object.freeze({ name, declared, version: packageValue.version,
        package_sha256: sha256File(packageFile), optional: false, root_package: true }));
      continue;
    }
    const installedPackageFile = path.join(directory, "node_modules", ...name.split("/"), "package.json");
    if (!fs.existsSync(installedPackageFile)) {
      expect(Object.hasOwn(optional, name), "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", `${name} dependency is missing`);
      entries.push(Object.freeze({ name, declared, version: null, package_sha256: null, optional: true, root_package: false }));
      continue;
    }
    const installedStat = fs.statSync(installedPackageFile);
    expect(installedStat.isFile(), "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", `${name} dependency manifest is invalid`);
    const installed = readJson(installedPackageFile, `${name} installed dependency`);
    const locked = lockValue.packages?.[`node_modules/${name}`] ?? lockValue.dependencies?.[name] ?? null;
    expect(locked && typeof locked === "object", "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", `${name} is absent from the lockfile`);
    const alias = /^npm:((?:@[^/]+\/)?[^@/]+)@(.+)$/u.exec(declared);
    let expectedName = alias?.[1] ?? name;
    expect(expectedName.length <= 214 && PACKAGE_NAME.test(expectedName),
      "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", `${name} dependency alias name is invalid`);
    let lockedVersion = locked.version;
    let satisfiesDeclaration = false;
    if (declared.startsWith("file:")) {
      const relativeTarget = declared.slice(5);
      const expectedTarget = path.resolve(directory, relativeTarget);
      const relative = path.relative(directory, expectedTarget);
      expect(relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
      "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", `${name} local dependency lock binding is invalid`);
      const targetPackageFile = path.join(expectedTarget, "package.json");
      const targetLock = lockValue.packages?.[relativeTarget] ?? null;
      const v3Binding = locked.link === true && locked.resolved === relativeTarget && typeof targetLock?.version === "string";
      const v1Binding = !lockValue.packages && locked.version === declared;
      expect((v3Binding || v1Binding)
        && fs.realpathSync.native(path.dirname(installedPackageFile)) === fs.realpathSync.native(expectedTarget)
        && fs.statSync(targetPackageFile).isFile(),
      "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", `${name} local dependency target is invalid`);
      lockedVersion = targetLock?.version ?? installed.version;
      satisfiesDeclaration = true;
    } else satisfiesDeclaration = satisfiesSemanticVersion(installed.version, alias?.[2] ?? declared);
    expect(installed.name === expectedName && typeof installed.version === "string"
      && lockedVersion === installed.version && satisfiesDeclaration,
    "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", `${name} installed dependency does not match its declaration and lockfile`);
    entries.push(Object.freeze({ name, declared, version: installed.version,
      package_sha256: sha256File(installedPackageFile), optional: Object.hasOwn(optional, name), root_package: false }));
  }
  return Object.freeze({ schema_version: 1, name: packageValue.name, version: packageValue.version,
    lockfile_version: lockValue.lockfileVersion, dependencies: Object.freeze(entries) });
}

export function fingerprintBenchmarkV3SemanticRuntimeKey(semanticRuntimeRoot, key) {
  expect(typeof semanticRuntimeRoot === "string" && path.isAbsolute(semanticRuntimeRoot), "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "semantic runtime root is invalid");
  expect(isBenchmarkV3SemanticRuntimeKey(key), "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "semantic runtime key is invalid");
  const root = fs.realpathSync.native(semanticRuntimeRoot);
  const directory = path.join(root, key);
  const packageFile = path.join(directory, "package.json");
  const lockFile = path.join(directory, "package-lock.json");
  const mocha = mochaEntrypoint(path.join(directory, "node_modules"));
  expect(fs.statSync(packageFile).isFile() && fs.statSync(lockFile).isFile() && fs.statSync(mocha).isFile(), "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", `${key} runtime is incomplete`);
  const inventory = semanticRuntimeDependencyInventory(directory, packageFile, lockFile);
  const installed = directoryContentFingerprint(directory);
  const entry = Object.freeze({ key, package_sha256: sha256File(packageFile), lock_sha256: sha256File(lockFile),
    inventory_fingerprint: fingerprint(inventory), installed_tree_fingerprint: installed.fingerprint,
    installed_file_count: installed.file_count });
  return Object.freeze({ ...entry, key_fingerprint: fingerprint(entry) });
}

export function discoverBenchmarkV3SemanticRuntimeKeys(semanticRuntimeRoot) {
  expect(typeof semanticRuntimeRoot === "string" && path.isAbsolute(semanticRuntimeRoot),
    "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "semantic runtime root is invalid");
  const root = fs.realpathSync.native(semanticRuntimeRoot);
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const named = entries.filter((entry) => entry.name.startsWith("eslint-v"));
  expect(named.length > 0 && named.every((entry) => entry.isDirectory() && !entry.isSymbolicLink()
    && isBenchmarkV3SemanticRuntimeKey(entry.name)),
  "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "semantic runtime root contains an invalid named runtime");
  return Object.freeze(named.map((entry) => entry.name).sort());
}

export function fingerprintBenchmarkV3SemanticRuntime(semanticRuntimeRoot, requiredKeys) {
  expect(typeof semanticRuntimeRoot === "string" && path.isAbsolute(semanticRuntimeRoot), "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "semantic runtime root is invalid");
  const root = fs.realpathSync.native(semanticRuntimeRoot);
  const entries = [];
  for (const key of [...new Set(requiredKeys)].sort()) {
    entries.push(fingerprintBenchmarkV3SemanticRuntimeKey(root, key));
  }
  return Object.freeze({ root, entries: Object.freeze(entries), runtime_fingerprint: fingerprint(entries) });
}

export function materializeBenchmarkV3ProvenanceBundle(sourceRoot, sourceValue = null) {
  const source = sourceValue ?? readJson(path.join(sourceRoot, "benchmarks", "v3", "corpus", "SOURCE.json"), "SOURCE.json");
  const file = process.env[source.provenance_bundle.local_environment_variable];
  expect(typeof file === "string" && path.isAbsolute(file) && fs.existsSync(file),
    "BENCHMARK_V3_CORPUS_BUNDLE_UNAVAILABLE", `set ${source.provenance_bundle.local_environment_variable} to the excluded provenance bundle`);
  const resolved = fs.realpathSync.native(file);
  const stat = fs.lstatSync(resolved);
  expect(stat.isFile() && !stat.isSymbolicLink() && stat.size === source.provenance_bundle.size
    && sha256File(resolved) === source.provenance_bundle.sha256,
  "BENCHMARK_V3_CORPUS_BUNDLE", "external provenance bundle bytes do not match the frozen manifest");
  return resolved;
}

export function captureBenchmarkV3Workspace(workspaceRoot) {
  const root = fs.realpathSync.native(workspaceRoot);
  const entries = [];
  const visit = (directory, prefix = "") => {
    for (const name of fs.readdirSync(directory).sort()) {
      if (prefix === "" && [".git", "node_modules"].includes(name)) continue;
      const relative = prefix === "" ? name : `${prefix}/${name}`;
      const target = path.join(directory, name);
      const stat = fs.lstatSync(target);
      expect(!stat.isSymbolicLink() && (stat.isDirectory() || (stat.isFile() && stat.nlink === 1)), "BENCHMARK_V3_CORPUS_WORKSPACE", "workspace contains an unsupported entry");
      if (stat.isDirectory()) visit(target, relative);
      else entries.push(Object.freeze({ path: relative, sha256: sha256File(target), size: stat.size, mode: stat.mode & 0o7777 }));
    }
  };
  visit(root);
  return Object.freeze({ entries: Object.freeze(entries), fingerprint: fingerprint(entries) });
}

export function materializeBenchmarkV3Workspace(sourceRoot, family) {
  const bundle = materializeBenchmarkV3ProvenanceBundle(sourceRoot);
  const workspace = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "benchmark-v3-attempt-"));
  expect(passed(run("git", ["clone", "--quiet", "--no-checkout", bundle, workspace])), "BENCHMARK_V3_CORPUS_WORKSPACE", "provenance workspace clone failed");
  expect(passed(run("git", ["checkout", "--quiet", family.control_surface.provenance.parent_commit], { cwd: workspace })), "BENCHMARK_V3_CORPUS_WORKSPACE", "provenance parent checkout failed");
  fs.rmSync(path.join(workspace, ".git"), { recursive: true, force: true });
  for (const hidden of family.control_surface.hidden_test_files) fs.rmSync(path.join(workspace, ...hidden.path.split("/")), { force: true });
  stageFiles(workspace, family.public_surface.public_files);
  return fs.realpathSync.native(workspace);
}

export function evaluateBenchmarkV3Workspace(workspaceRoot, controlSurface, {
  beforeSnapshot, semanticRuntimeRoot, expectedRuntimeKeyFingerprint, revalidateRuntimeKey = true,
} = {}) {
  expect(beforeSnapshot?.entries && FP.test(beforeSnapshot.fingerprint), "BENCHMARK_V3_CORPUS_ORACLE", "pre-attempt workspace snapshot is required");
  expect(typeof semanticRuntimeRoot === "string" && path.isAbsolute(semanticRuntimeRoot), "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "semantic runtime root is required");
  const root = fs.realpathSync.native(workspaceRoot);
  const runtime = fs.realpathSync.native(semanticRuntimeRoot);
  expect(FP.test(expectedRuntimeKeyFingerprint ?? ""), "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "semantic runtime key is not bound");
  if (revalidateRuntimeKey) expect(fingerprintBenchmarkV3SemanticRuntimeKey(runtime, controlSurface.runtime_key).key_fingerprint === expectedRuntimeKeyFingerprint,
    "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "semantic runtime key changed after the gate");
  const afterSnapshot = captureBenchmarkV3Workspace(root);
  const beforeMap = new Map(beforeSnapshot.entries.map((entry) => [entry.path, `${entry.sha256}:${entry.size}:${entry.mode}`]));
  const afterMap = new Map(afterSnapshot.entries.map((entry) => [entry.path, `${entry.sha256}:${entry.size}:${entry.mode}`]));
  const changedPaths = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].filter((entry) => beforeMap.get(entry) !== afterMap.get(entry)).sort();
  const allowed = new Set(controlSurface.allowed_mutation_paths);
  const scopeViolations = changedPaths.filter((entry) => !allowed.has(entry));
  const nodeModulesSource = path.join(runtime, controlSurface.runtime_key, "node_modules");
  const mocha = mochaEntrypoint(nodeModulesSource);
  expect(fs.statSync(nodeModulesSource).isDirectory() && fs.statSync(mocha).isFile(), "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "verified semantic runtime lacks mocha dependencies");
  const nodeModulesTarget = path.join(root, "node_modules");
  expect(!fs.existsSync(nodeModulesTarget), "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "attempt workspace unexpectedly contains dependencies");
  let result;
  try {
    stageFiles(root, controlSurface.hidden_test_files);
    fs.symlinkSync(nodeModulesSource, nodeModulesTarget, "dir");
    result = run(process.execPath, [mocha, "--reporter", "json", ...controlSurface.test_argv], { cwd: root,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? os.tmpdir(), LANG: "C", LC_ALL: "C", NODE_ENV: "test" }, timeout: 120_000 });
  } finally {
    fs.rmSync(nodeModulesTarget, { force: true });
    for (const hidden of controlSurface.hidden_test_files) fs.rmSync(path.join(root, ...hidden.path.split("/")), { force: true });
  }
  let report = null; try { report = JSON.parse(result.stdout); } catch { report = null; }
  const stats = report?.stats;
  const authenticTestCount = Number.isSafeInteger(stats?.tests) && stats.tests > 0
    && Number.isSafeInteger(stats?.passes) && Number.isSafeInteger(stats?.failures) && Number.isSafeInteger(stats?.pending)
    && stats.passes + stats.failures + stats.pending === stats.tests;
  const semanticPassed = passed(result) && authenticTestCount && stats.passes === stats.tests && stats.failures === 0 && stats.pending === 0;
  const accepted = semanticPassed && scopeViolations.length === 0;
  const evidence = Object.freeze({ semantic_passed: semanticPassed, process_status: Number.isInteger(result.status) ? result.status : null,
    process_signal: result.signal ?? null, timed_out: result.error?.code === "ETIMEDOUT",
    test_count: authenticTestCount ? stats.tests : null, changed_paths: Object.freeze(changedPaths),
    scope_violations: Object.freeze(scopeViolations), before_fingerprint: beforeSnapshot.fingerprint, after_fingerprint: afterSnapshot.fingerprint });
  return Object.freeze({ passed: accepted, semantic_passed: semanticPassed, scope_violation: scopeViolations.length > 0,
    defect_severity: accepted ? "none" : controlSurface.defect_severity, ...evidence, result_fingerprint: fingerprint(evidence) });
}

function verifyProvenanceBundle(sourceRoot, source, families) {
  const bundle = materializeBenchmarkV3ProvenanceBundle(sourceRoot, source);
  expect(passed(run("git", ["bundle", "verify", bundle])), "BENCHMARK_V3_CORPUS_BUNDLE", "provenance bundle is incomplete or invalid");
  const repository = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "v3-provenance-"));
  try {
    expect(passed(run("git", ["clone", "--quiet", "--bare", bundle, repository])), "BENCHMARK_V3_CORPUS_BUNDLE", "provenance bundle could not be cloned");
    const license = run("git", ["show", `${source.source_tip}:LICENSE`], { cwd: repository });
    expect(passed(license) && fingerprint(license.stdout) === source.license_fingerprint, "BENCHMARK_V3_CORPUS_SOURCE", "bundled source license drifted");
    for (const family of families) {
      const control = family.control_surface;
      const provenance = control.provenance;
      const parent = run("git", ["rev-parse", `${provenance.source_commit}^`], { cwd: repository });
      expect(passed(parent) && parent.stdout.trim() === provenance.parent_commit, "BENCHMARK_V3_CORPUS_PROVENANCE", `${family.family_id} parent binding is false`);
      expect(passed(run("git", ["merge-base", "--is-ancestor", provenance.source_commit, source.source_tip], { cwd: repository })), "BENCHMARK_V3_CORPUS_PROVENANCE", `${family.family_id} commit is outside the frozen source history`);
      for (const entry of family.public_surface.public_files) {
        const blob = run("git", ["show", `${provenance.parent_commit}:${entry.path}`], { cwd: repository });
        expect(passed(blob) && blob.stdout === entry.content, "BENCHMARK_V3_CORPUS_PROVENANCE", `${family.family_id} public bytes are not parent bytes`);
      }
      for (const entry of [...control.reference_files, ...control.hidden_test_files]) {
        const blob = run("git", ["show", `${provenance.source_commit}:${entry.path}`], { cwd: repository });
        expect(passed(blob) && blob.stdout === entry.content, "BENCHMARK_V3_CORPUS_PROVENANCE", `${family.family_id} hidden bytes are not source commit bytes`);
      }
      const hiddenTestPaths = new Set(control.hidden_test_files.map((entry) => entry.path));
      for (const sourcePath of provenance.source_paths.filter((entry) => /^lib\/rules\/.+\.js$/u.test(entry))) {
        const preservationTestPath = sourcePath.replace(/^lib\/rules\//u, "tests/lib/rules/");
        const preservationTest = run("git", ["cat-file", "-e", `${provenance.source_commit}:${preservationTestPath}`], { cwd: repository });
        expect(!passed(preservationTest) || hiddenTestPaths.has(preservationTestPath), "BENCHMARK_V3_CORPUS_REQUIREMENTS",
          `${family.family_id} omits the upstream preservation suite for ${sourcePath}`);
      }
      const paths = [...provenance.source_paths, ...control.hidden_test_files.map((entry) => entry.path)];
      const patch = run("git", ["diff", "--binary", provenance.parent_commit, provenance.source_commit, "--", ...paths], { cwd: repository });
      expect(passed(patch) && fingerprint(patch.stdout) === provenance.patch_fingerprint, "BENCHMARK_V3_CORPUS_PROVENANCE", `${family.family_id} patch binding is stale`);
      const requirement = run("git", ["show", "-s", "--format=%B", provenance.source_commit], { cwd: repository });
      const authored = requirement.stdout.trim();
      expect(passed(requirement) && fingerprint(authored) === provenance.visible_requirement_fingerprint,
      "BENCHMARK_V3_CORPUS_REQUIREMENTS", `${family.family_id} visible authored requirement is incomplete or stale`);
      const observed = family.public_surface.contract.clauses.find((entry) => entry.kind === "observed-bug");
      const boundary = family.public_surface.contract.clauses.find((entry) => entry.kind === "boundary-error-cases");
      const publicTestDelta = run("git", ["diff", "--no-ext-diff", "--unified=3", provenance.parent_commit,
        provenance.source_commit, "--", ...control.hidden_test_files.map((entry) => entry.path)], { cwd: repository });
      expect(observed?.text === `Observed upstream behavior defect:\n${authored}` && passed(publicTestDelta)
        && boundary?.text === `Public behavioral examples (test-only diff, not implementation):\n${publicTestDelta.stdout.trim()}`,
      "BENCHMARK_V3_CORPUS_REQUIREMENTS", `${family.family_id} public behavioral evidence is incomplete or stale`);
      const serializedPublic = canonicalJson({ prompt: family.public_surface.prompt,
        clauses: family.public_surface.contract.clauses.filter((entry) => entry.kind !== "boundary-error-cases") });
      for (const targetPaths of [provenance.source_paths]) {
        const leakedDiff = run("git", ["diff", "--no-ext-diff", "--unified=0", provenance.parent_commit, provenance.source_commit, "--", ...targetPaths], { cwd: repository });
        expect(passed(leakedDiff), "BENCHMARK_V3_CORPUS_REQUIREMENTS", `${family.family_id} leakage source diff is unavailable`);
        const codeLines = leakedDiff.stdout.split("\n").filter((line) => /^\+(?!\+\+)/u.test(line))
          .map((line) => line.slice(1).trim()).filter((line) => line.length >= 24 && /[(){}[\]"'`:=]/u.test(line));
        expect(codeLines.every((line) => !serializedPublic.includes(line)), "BENCHMARK_V3_CORPUS_HIDDEN",
          `${family.family_id} public contract leaks hidden test or reference-patch code`);
      }
    }
  } finally { fs.rmSync(repository, { recursive: true, force: true }); }
}

export function loadBenchmarkV3Corpus(sourceRoot, { executeOracles = false, semanticRuntimeRoot = null, verifyProvenance = false } = {}) {
  const corpusRoot = path.join(sourceRoot, "benchmarks", "v3", "corpus");
  const generator = readJson(path.join(sourceRoot, "benchmarks", "v3", "generator-contract.v1.json"), "generator-contract.v1.json");
  exact(generator, ["schema_version", "generator_version", "corpus_generation_seed", "model_sampling_seed", "split_assignment_algorithm", "split_assignment_fingerprint", "seed_freeze", "split_source_commitments", "rendered_instance_requirements", "promotion_policy", "public_corpus_splits", "external_holdout_family_count", "sealed_holdout_policy", "current_rendered_instances", "current_promotion_eligible_instances"], "generator-contract.v1.json");
  expect(generator.schema_version === 1 && generator.generator_version === "benchmark-v3-generator/3"
    && typeof generator.corpus_generation_seed === "string" && generator.corpus_generation_seed.length > 0
    && generator.model_sampling_seed === "optional-or-unsupported"
    && generator.split_assignment_algorithm === "frozen-seeded-development-validation-reserve-v2"
    && FP.test(generator.split_assignment_fingerprint)
    && generator.seed_freeze?.development_and_validation_frozen_before_first_candidate === true
    && generator.seed_freeze?.baseline_outcomes_may_influence_generation_or_selection === false
    && ["development", "validation", "reserved"].every((split) => FP.test(generator.seed_freeze[split]) && SHA.test(generator.split_source_commitments?.[split]))
    && canonicalJson(generator.rendered_instance_requirements) === canonicalJson(["public_behavior_contract", "hidden_oracle_contract", "pre_fix_failure_witness", "reference_fix_success_witness", "license_provenance_record", "family_cluster_identity"])
    && generator.promotion_policy === "public-instances-never-confirmatory"
    && canonicalJson(generator.public_corpus_splits) === canonicalJson(["development", "validation"])
    && generator.external_holdout_family_count === V3_EXTERNAL_HOLDOUT_COUNT
    && generator.sealed_holdout_policy === "outside-public-git-sampling-frame-precommitted-before-baseline-materialized-after-candidate-freeze"
    && generator.current_rendered_instances === 120 && generator.current_promotion_eligible_instances === 0,
  "BENCHMARK_V3_CORPUS_GENERATOR", "versioned generator contract is invalid");
  const splitAssignment = readJson(path.join(sourceRoot, "benchmarks", "v3", "split-assignment.v1.json"), "split-assignment.v1.json");
  const assignmentBody = { ...splitAssignment }; delete assignmentBody.assignment_fingerprint;
  expect(splitAssignment.schema_version === 1 && splitAssignment.algorithm === generator.split_assignment_algorithm
    && splitAssignment.corpus_generation_seed === generator.corpus_generation_seed
    && splitAssignment.assignment_fingerprint === fingerprint(assignmentBody)
    && splitAssignment.assignment_fingerprint === generator.split_assignment_fingerprint
    && Array.isArray(splitAssignment.entries) && splitAssignment.entries.length === 210
    && ["development", "validation", "reserved"].every((split) => generator.seed_freeze[split]
      === fingerprint(splitAssignment.entries.filter((entry) => entry.split === split).map((entry) => entry.source_commit).sort()))
    && verifyBenchmarkV3SplitDistribution(splitAssignment).passed,
  "BENCHMARK_V3_CORPUS_GENERATOR", "seeded split assignment or distribution is invalid");
  const exclusions = readJson(path.join(sourceRoot, "benchmarks", "v3", "exclusions.v1.json"), "exclusions.v1.json");
  exact(exclusions, ["schema_version", "frozen_archive_sha", "prior_campaign", "v2_registry_fingerprints", "forbidden_source_repositories", "identity_rule"], "exclusions.v1.json");
  expect(exclusions.schema_version === 1 && SHA.test(exclusions.frozen_archive_sha) && exclusions.prior_campaign === "P0-P52-on-benchmark-v2"
    && Array.isArray(exclusions.v2_registry_fingerprints) && exclusions.v2_registry_fingerprints.length === 3
    && exclusions.v2_registry_fingerprints.every((entry) => FP.test(entry)) && Array.isArray(exclusions.forbidden_source_repositories), "BENCHMARK_V3_CORPUS_EXCLUSION", "frozen exclusion manifest is invalid");
  const source = readJson(path.join(corpusRoot, "SOURCE.json"), "SOURCE.json");
  exact(source, ["schema_version", "repository", "source_tip", "source_commit", "license", "spdx_license", "license_fingerprint", "provenance_bundle", "third_party_notices", "materializer", "derivation"], "SOURCE.json");
  exact(source.provenance_bundle, ["sha256", "size", "redistribution_status", "local_environment_variable"], "SOURCE.json.provenance_bundle");
  expect(source.schema_version === 1 && source.repository === "https://github.com/eslint/eslint" && SHA.test(source.source_tip)
    && source.source_commit === source.source_tip && source.license === "MIT" && source.spdx_license === "MIT"
    && FP.test(source.license_fingerprint) && FP.test(source.provenance_bundle.sha256)
    && source.provenance_bundle.size === 43987615
    && source.provenance_bundle.redistribution_status === "excluded-from-git-and-release-assets"
    && source.provenance_bundle.local_environment_variable === "BENCHMARK_V3_PROVENANCE_BUNDLE"
    && source.third_party_notices === "THIRD_PARTY_NOTICES.md"
    && source.materializer === "scripts/materialize-benchmark-v3-provenance.mjs"
    && source.derivation === "unique-real-eslint-development-validation-lineages-with-behavioral-contracts-and-hidden-semantic-oracles"
    && source.license_fingerprint === fingerprint(fs.readFileSync(path.join(corpusRoot, "THIRD_PARTY_LICENSE.txt"), "utf8"))
    && fs.readFileSync(path.join(corpusRoot, source.third_party_notices), "utf8").includes(source.source_commit)
    && !exclusions.forbidden_source_repositories.includes(source.repository), "BENCHMARK_V3_CORPUS_SOURCE", "source provenance is invalid or overlaps prior corpora");
  const index = readJson(path.join(corpusRoot, "index.json"), "index.json");
  exact(index, ["schema_version", "family_ids", "family_count", "corpus_index_fingerprint"], "index.json");
  expect(index.schema_version === 1 && index.family_count === 120 && Array.isArray(index.family_ids) && index.family_ids.length === 120
    && index.corpus_index_fingerprint === fingerprint(index.family_ids), "BENCHMARK_V3_CORPUS_INDEX", "corpus index is invalid");
  const families = [];
  for (const familyId of index.family_ids) {
    expect(typeof familyId === "string" && /^v3-(?:development|validation)-(?:small|medium|high)-[0-9]{2}$/u.test(familyId), "BENCHMARK_V3_CORPUS_ID", "family ID is invalid");
    const [, split, stratum] = familyId.split("-");
    const directory = path.join(corpusRoot, split, familyId);
    const publicSurface = readJson(path.join(directory, "public.json"), `${familyId}/public.json`);
    const controlSurface = readJson(path.join(directory, "control.json"), `${familyId}/control.json`);
    const manifest = readJson(path.join(directory, "manifest.json"), `${familyId}/manifest.json`);
    exact(publicSurface, ["schema_version", "family_id", "split", "stratum", "prompt", "visible_requirements", "contract", "base_source_tip", "public_files"], `${familyId}/public`);
    exact(controlSurface, ["schema_version", "family_id", "oracle", "defect_severity", "reference_files", "hidden_test_files", "allowed_mutation_paths", "test_argv", "runtime_key", "runtime_version", "provenance", "requirement_coverage"], `${familyId}/control`);
    exact(manifest, ["schema_version", "family_id", "split", "stratum", "semantic_kernel_id", "public_surface_fingerprint", "control_surface_fingerprint", "source_identity_fingerprint", "family_fingerprint"], `${familyId}/manifest`);
    const publicFiles = validateFiles(publicSurface.public_files, `${familyId}.public_files`);
    const referenceFiles = validateFiles(controlSurface.reference_files, `${familyId}.reference_files`);
    const hiddenTests = validateFiles(controlSurface.hidden_test_files, `${familyId}.hidden_test_files`);
    expect(publicSurface.schema_version === 1 && publicSurface.family_id === familyId && publicSurface.split === split && publicSurface.stratum === stratum
      && publicSurface.base_source_tip === source.source_tip && typeof publicSurface.prompt === "string" && publicSurface.prompt.length > 20
      && Array.isArray(publicSurface.visible_requirements) && publicSurface.visible_requirements.length === 5,
    "BENCHMARK_V3_CORPUS_PUBLIC", `${familyId} public surface is invalid`);
    exact(publicSurface.contract, ["schema_version", "contract_id", "clauses", "contract_fingerprint"], `${familyId}.contract`);
    const contractBody = { ...publicSurface.contract }; delete contractBody.contract_fingerprint;
    expect(publicSurface.contract.schema_version === 1 && publicSurface.contract.contract_id === `${familyId}-public-contract`
      && Array.isArray(publicSurface.contract.clauses) && publicSurface.contract.clauses.length === 5
      && publicSurface.contract.clauses.every((clause, index) => clause.clause_id === `REQ-00${index + 1}` && typeof clause.text === "string" && clause.text.length > 10)
      && canonicalJson(publicSurface.contract.clauses.map((entry) => entry.kind)) === canonicalJson([
        "observed-bug", "required-behavior", "preserved-behavior", "boundary-error-cases", "allowed-mutation",
      ])
      && canonicalJson(publicSurface.visible_requirements) === canonicalJson(publicSurface.contract.clauses.map((entry) => `${entry.kind}: ${entry.text}`))
      && publicSurface.contract.contract_fingerprint === fingerprint(contractBody), "BENCHMARK_V3_CORPUS_REQUIREMENTS", `${familyId} public contract is invalid`);
    exact(controlSurface.provenance, ["kind", "repository", "source_commit", "parent_commit", "source_paths", "patch_fingerprint", "visible_requirement_fingerprint", "license", "license_fingerprint"], `${familyId}.provenance`);
    expect(controlSurface.schema_version === 1 && controlSurface.family_id === familyId && controlSurface.oracle === "upstream-eslint-rule-test-and-closed-mutation-set"
      && controlSurface.defect_severity === "unclassified" && /^eslint-v(?:(?:7|10)|(?:6|8|9)\.[0-9]+)$/u.test(controlSurface.runtime_key)
      && /^[0-9]+\.[0-9]+$/u.test(controlSurface.runtime_version) && controlSurface.provenance.kind === "real-commit-derived"
      && controlSurface.provenance.repository === source.repository && SHA.test(controlSurface.provenance.source_commit) && SHA.test(controlSurface.provenance.parent_commit)
      && controlSurface.provenance.license === "MIT" && controlSurface.provenance.license_fingerprint === source.license_fingerprint
      && FP.test(controlSurface.provenance.patch_fingerprint) && FP.test(controlSurface.provenance.visible_requirement_fingerprint), "BENCHMARK_V3_CORPUS_PROVENANCE", `${familyId} provenance is invalid`);
    const paths = publicFiles.map((entry) => entry.path);
    expect(canonicalJson(paths) === canonicalJson(referenceFiles.map((entry) => entry.path)) && canonicalJson(paths) === canonicalJson(controlSurface.allowed_mutation_paths)
      && canonicalJson(paths) === canonicalJson(controlSurface.provenance.source_paths) && Array.isArray(controlSurface.test_argv) && controlSurface.test_argv.length >= 3
      && hiddenTests.every((entry) => controlSurface.test_argv.includes(entry.path)), "BENCHMARK_V3_CORPUS_PATH", `${familyId} source/test paths drifted`);
    exact(controlSurface.requirement_coverage, ["schema_version", "contract_fingerprint", "contract_completeness", "hidden_test_witnesses", "runner_witnesses"], `${familyId}.requirement_coverage`);
    const coverage = controlSurface.requirement_coverage;
    const witnessedClauses = new Set([...(coverage.hidden_test_witnesses ?? []), ...(coverage.runner_witnesses ?? [])].flatMap((entry) => entry.clause_ids ?? []));
    expect(coverage.schema_version === 1 && coverage.contract_fingerprint === publicSurface.contract.contract_fingerprint
      && coverage.contract_completeness === "self-contained-behavioral-v1"
      && Array.isArray(coverage.hidden_test_witnesses) && coverage.hidden_test_witnesses.length === hiddenTests.length
      && coverage.hidden_test_witnesses.every((entry, index) => entry.hidden_test_fingerprint === fingerprint(hiddenTests[index].content)
        && canonicalJson(entry.clause_ids) === canonicalJson(["REQ-002", "REQ-003", "REQ-004"]))
      && Array.isArray(coverage.runner_witnesses) && coverage.runner_witnesses.length === 1
      && coverage.runner_witnesses[0].witness_id === "semantic-oracle-and-closed-mutation-set"
      && canonicalJson(coverage.runner_witnesses[0].clause_ids) === canonicalJson(["REQ-001", "REQ-002", "REQ-003", "REQ-004", "REQ-005"])
      && canonicalJson([...witnessedClauses].sort()) === canonicalJson(["REQ-001", "REQ-002", "REQ-003", "REQ-004", "REQ-005"]),
    "BENCHMARK_V3_CORPUS_REQUIREMENTS", `${familyId} requirement coverage is incomplete or stale`);
    const manifestBody = { ...manifest }; delete manifestBody.family_fingerprint;
    expect(manifest.schema_version === 1 && manifest.family_id === familyId && manifest.split === split && manifest.stratum === stratum
      && manifest.semantic_kernel_id === `eslint-change-${controlSurface.provenance.source_commit}` && manifest.public_surface_fingerprint === fingerprint(publicSurface)
      && manifest.control_surface_fingerprint === fingerprint(controlSurface) && manifest.source_identity_fingerprint === fingerprint({ repository: source.repository, commit: controlSurface.provenance.source_commit })
      && manifest.family_fingerprint === fingerprint(manifestBody), "BENCHMARK_V3_CORPUS_BINDING", `${familyId} manifest is stale`);
    const serializedPublic = canonicalJson(publicSurface);
    expect(!referenceFiles.some((entry) => serializedPublic.includes(entry.content)) && !hiddenTests.some((entry) => serializedPublic.includes(entry.content))
      && !serializedPublic.includes(controlSurface.provenance.source_commit), "BENCHMARK_V3_CORPUS_HIDDEN", `${familyId} control bytes leaked to the public surface`);
    families.push(Object.freeze({ family_id: familyId, split, stratum, public_surface: Object.freeze(publicSurface), control_surface: Object.freeze(controlSurface), manifest: Object.freeze(manifest) }));
  }
  for (const key of ["family_id", "semantic_kernel_id", "source_identity_fingerprint", "family_fingerprint"]) {
    expect(new Set(families.map((entry) => key === "family_id" ? entry.family_id : entry.manifest[key])).size === 120, "BENCHMARK_V3_CORPUS_DISJOINT", `${key} is not globally unique`);
  }
  const assignmentByCommit = new Map(splitAssignment.entries.map((entry) => [entry.source_commit, entry]));
  expect(assignmentByCommit.size === 210 && families.every((family) => {
    const assigned = assignmentByCommit.get(family.control_surface.provenance.source_commit);
    return assigned?.split === family.split && assigned.stratum === family.stratum
      && assigned.runtime_version === family.control_surface.runtime_version;
  }), "BENCHMARK_V3_CORPUS_GENERATOR", "rendered corpus does not match the frozen split assignment");
  const allSourcePaths = families.flatMap((entry) => entry.control_surface.provenance.source_paths);
  expect(new Set(allSourcePaths).size === allSourcePaths.length, "BENCHMARK_V3_CORPUS_DISJOINT", "rule lineages are reused across family clusters");
  const splitCounts = Object.fromEntries(Object.keys(V3_SPLIT_COUNTS).map((split) => [split, families.filter((entry) => entry.split === split).length]));
  expect(canonicalJson(splitCounts) === canonicalJson(V3_SPLIT_COUNTS), "BENCHMARK_V3_CORPUS_COUNT", "split counts are invalid");
  for (const [split, count] of Object.entries(V3_SPLIT_COUNTS)) for (const stratum of STRATA) {
    expect(families.filter((entry) => entry.split === split && entry.stratum === stratum).length === STRATUM_COUNTS[split], "BENCHMARK_V3_CORPUS_COUNT", `${split}/${stratum} count is invalid`);
    expect(families.filter((entry) => entry.split === split && entry.control_surface.provenance.kind === "real-commit-derived").length / count >= 0.25,
      "BENCHMARK_V3_CORPUS_PROVENANCE", `${split} real-derived share is below 25%`);
  }
  if (verifyProvenance || executeOracles) verifyProvenanceBundle(sourceRoot, source, families);
  let semanticOracleExpectations = Object.freeze([]);
  if (executeOracles) {
    expect(semanticRuntimeRoot !== null, "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "semantic oracle execution requires a frozen runtime root");
    const runtime = fingerprintBenchmarkV3SemanticRuntime(semanticRuntimeRoot, families.map((entry) => entry.control_surface.runtime_key));
    const runtimeByKey = new Map(runtime.entries.map((entry) => [entry.key, entry.key_fingerprint]));
    const workspace = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "benchmark-v3-oracle-"));
    try {
      expect(passed(run("git", ["clone", "--quiet", "--no-checkout", materializeBenchmarkV3ProvenanceBundle(sourceRoot, source), workspace])),
        "BENCHMARK_V3_CORPUS_ORACLE", "semantic oracle workspace clone failed");
      const expectations = [];
      for (const family of families) {
        expect(passed(run("git", ["checkout", "--quiet", "--force", family.control_surface.provenance.parent_commit], { cwd: workspace })),
          "BENCHMARK_V3_CORPUS_ORACLE", `${family.family_id} parent checkout failed`);
        expect(passed(run("git", ["clean", "-fdx", "--quiet"], { cwd: workspace })),
          "BENCHMARK_V3_CORPUS_ORACLE", `${family.family_id} parent cleanup failed`);
        for (const hidden of family.control_surface.hidden_test_files) fs.rmSync(path.join(workspace, ...hidden.path.split("/")), { force: true });
        stageFiles(workspace, family.public_surface.public_files);
        let before = captureBenchmarkV3Workspace(workspace);
        const baselineOracle = evaluateBenchmarkV3Workspace(workspace, family.control_surface, { beforeSnapshot: before, semanticRuntimeRoot,
          expectedRuntimeKeyFingerprint: runtimeByKey.get(family.control_surface.runtime_key), revalidateRuntimeKey: false });
        expect(baselineOracle.passed === false && Number.isSafeInteger(baselineOracle.test_count),
          "BENCHMARK_V3_CORPUS_ORACLE", `${family.family_id} baseline unexpectedly passes the upstream test`);
        stageFiles(workspace, family.control_surface.reference_files);
        before = captureBenchmarkV3Workspace(workspace);
        const referenceOracle = evaluateBenchmarkV3Workspace(workspace, family.control_surface, { beforeSnapshot: before, semanticRuntimeRoot,
          expectedRuntimeKeyFingerprint: runtimeByKey.get(family.control_surface.runtime_key), revalidateRuntimeKey: false });
        expect(referenceOracle.passed === true && referenceOracle.test_count === baselineOracle.test_count,
          "BENCHMARK_V3_CORPUS_ORACLE", `${family.family_id} reference repair failed the upstream test`);
        expectations.push(Object.freeze({ family_id: family.family_id, test_count: referenceOracle.test_count }));
      }
      expect(fingerprintBenchmarkV3SemanticRuntime(semanticRuntimeRoot, families.map((entry) => entry.control_surface.runtime_key)).runtime_fingerprint
        === runtime.runtime_fingerprint, "BENCHMARK_V3_CORPUS_ORACLE_RUNTIME", "semantic runtime changed during trusted oracle verification");
      semanticOracleExpectations = Object.freeze(expectations);
    } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
  }
  return Object.freeze({ source: Object.freeze(source), generator: Object.freeze(generator), split_assignment: Object.freeze(splitAssignment), families: Object.freeze(families),
    semantic_oracle_expectations: semanticOracleExpectations,
    development_execution_eligible: true,
    promotion_eligible: false, promotion_blocker: "external-sealed-holdout-required-after-validation-and-candidate-freeze",
    confirmatory_eligible: false,
    corpus_fingerprint: fingerprint(families.map((entry) => entry.manifest)) });
}

export function validateBenchmarkV3Corpus(sourceRoot, options = {}) {
  const loaded = loadBenchmarkV3Corpus(sourceRoot, options);
  const splitDistribution = verifyBenchmarkV3SplitDistribution(loaded.split_assignment);
  return Object.freeze({ status: "validated", family_count: loaded.families.length, split_counts: V3_SPLIT_COUNTS, real_commit_derived_counts: V3_SPLIT_COUNTS,
    unique_source_commit_count: new Set(loaded.families.map((entry) => entry.control_surface.provenance.source_commit)).size,
    corpus_fingerprint: loaded.corpus_fingerprint, provenance_bundle_sha256: loaded.source.provenance_bundle.sha256,
    generator_version: loaded.generator.generator_version, corpus_generation_seed: loaded.generator.corpus_generation_seed,
    split_assignment_fingerprint: loaded.split_assignment.assignment_fingerprint, split_distribution: splitDistribution,
    promotion_eligible: loaded.promotion_eligible, promotion_blocker: loaded.promotion_blocker, oracle_execution: options.executeOracles === true });
}
