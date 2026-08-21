import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const PROFILE_INVENTORY_V3_PATH = "profiles/inventory.v3.json";
export const MATERIALIZED_MANIFEST_NAME = ".opencode-profile-manifest.json";
export const MATERIALIZED_MANIFEST_SCHEMA_VERSION = 1;
export const MATERIALIZED_FINGERPRINT_ALGORITHM = "sha256:profile-path-bytes-v1";
export const MATERIALIZED_HOST_CONFIG_PATH = "plugins/quality-toolchains.host.v1.json";
export const V3_BUNDLE_IDS = Object.freeze(["core", "core-v2", "deep", "assurance", "lab"]);
export const V3_RUNTIME_PROFILE_IDS = Object.freeze(["core", "core-v2", "deep", "assurance"]);
export const ASSURANCE_FACADE_TOOL_IDS = Object.freeze([
  "quality_assurance_start",
  "quality_assurance_inspect",
  "quality_assurance_advance",
  "quality_assurance_authorize",
]);

const WINDOWS_RESERVED_SEGMENT = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

export class ProfileV3Error extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "ProfileV3Error";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProfileV3Error(code, message);
}

function plain(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("PROFILE_V3_SHAPE", `${label} must be an object`);
  }
  return value;
}

function string(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    fail("PROFILE_V3_SHAPE", `${label} must be a non-empty string`);
  }
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) fail("PROFILE_V3_SHAPE", `${label} must be an array`);
  return value;
}

function unique(values, label) {
  if (new Set(values).size !== values.length) {
    fail("PROFILE_V3_DUPLICATE", `${label} must not contain duplicates`);
  }
}

function exactSet(actual, expected, label) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    fail("PROFILE_V3_SET", `${label} must equal ${right.join(", ")}`);
  }
}

export function normalizePortablePath(value, label = "path") {
  string(value, label);
  if (value !== value.normalize("NFC")) {
    fail("PROFILE_V3_PATH", `${label} must use Unicode NFC`);
  }
  if (value.includes("\\") || path.posix.isAbsolute(value)
    || /^[a-z]:/iu.test(value) || value.startsWith("//")) {
    fail("PROFILE_V3_PATH", `${label} must be a relative POSIX path`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === ".."
    || segment.endsWith(".") || segment.endsWith(" ") || CONTROL_CHARACTER.test(segment)
    || WINDOWS_RESERVED_SEGMENT.test(segment))) {
    fail("PROFILE_V3_PATH", `${label} contains an unsafe or non-portable segment`);
  }
  return segments.join("/");
}

function portableCollisionKey(value) {
  return normalizePortablePath(value).normalize("NFC").toLocaleLowerCase("en-US");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Bytes(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function repositoryCommit(root) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  const value = result.status === 0 ? result.stdout.trim() : "";
  if (!/^[0-9a-f]{40}$/u.test(value)) {
    fail("PROFILE_V3_SOURCE_SHA", "repository commit identity is unavailable");
  }
  return value;
}

function repositoryIsClean(root) {
  const result = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) {
    fail("PROFILE_V3_SOURCE_STATE", "repository cleanliness is unavailable");
  }
  return result.stdout.length === 0;
}

function repositoryTrackedFiles(root) {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "buffer",
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) {
    fail("PROFILE_V3_SOURCE_STATE", "repository tracked-file inventory is unavailable");
  }
  return new Set(result.stdout.toString("utf8").split("\0").filter(Boolean));
}

export function fingerprintProfileValue(value) {
  return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}

function readJson(filePath, label) {
  let body;
  try {
    body = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, "");
  } catch (error) {
    fail("PROFILE_V3_READ", `${label} is unreadable: ${error.message}`);
  }
  try {
    return JSON.parse(body);
  } catch (error) {
    fail("PROFILE_V3_JSON", `${label} is invalid JSON: ${error.message}`);
  }
}

function resolveInside(root, relativePath, label) {
  const normalized = normalizePortablePath(relativePath, label);
  const absolute = path.resolve(root, ...normalized.split("/"));
  const relative = path.relative(root, absolute);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail("PROFILE_V3_PATH", `${label} escapes the repository root`);
  }
  return { normalized, absolute };
}

function sourceIdentity(root, relativePath, label) {
  const resolved = resolveInside(root, relativePath, label);
  let stat;
  try {
    stat = fs.lstatSync(resolved.absolute);
  } catch (error) {
    fail("PROFILE_V3_SOURCE", `${label} is missing: ${error.message}`);
  }
  if (stat.isSymbolicLink()) fail("PROFILE_V3_SOURCE_LINK", `${label} must not be a symbolic link`);
  if (!stat.isFile() && !stat.isDirectory()) {
    fail("PROFILE_V3_SOURCE_TYPE", `${label} must be a regular file or directory`);
  }
  if (stat.isFile() && stat.nlink !== 1) {
    fail("PROFILE_V3_SOURCE_LINK", `${label} must be a single-link regular file`);
  }
  const physical = fs.realpathSync.native(resolved.absolute);
  const relativePhysical = path.relative(root, physical);
  if (relativePhysical === ".." || relativePhysical.startsWith(`..${path.sep}`) || path.isAbsolute(relativePhysical)) {
    fail("PROFILE_V3_SOURCE_ESCAPE", `${label} resolves outside the repository`);
  }
  return { ...resolved, stat, physical };
}

function pathIsPrefix(prefix, value) {
  return value === prefix || value.startsWith(`${prefix}/`);
}

function validateBundleEntry(entry, label) {
  plain(entry, label);
  const keys = Object.keys(entry).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["source", "target"])) {
    fail("PROFILE_V3_ENTRY", `${label} must contain only source and target`);
  }
  return {
    source: normalizePortablePath(entry.source, `${label}.source`),
    target: normalizePortablePath(entry.target, `${label}.target`),
  };
}

function validateBundleTargetSet(bundle, baseBundle) {
  if (baseBundle === null) return;
  const childTargets = new Set(bundle.entries.map((entry) => entry.target));
  for (const entry of baseBundle.entries) {
    if (!childTargets.has(entry.target)) {
      fail("PROFILE_V3_BUNDLE_CLOSURE", `${bundle.id} must retain inherited target ${entry.target}`);
    }
  }
}

function validateInventoryShape(inventory) {
  plain(inventory, "inventory");
  if (inventory.schema_version !== 3) fail("PROFILE_V3_VERSION", "inventory schema_version must be 3");
  if (inventory.default_runtime_profile_id !== "core") {
    fail("PROFILE_V3_DEFAULT", "core must be the default runtime profile");
  }
  plain(inventory.prompt_budget, "prompt_budget");
  if (inventory.prompt_budget.hard_cap_characters !== 8000
    || inventory.prompt_budget.target_characters > 7000
    || inventory.prompt_budget.encoding !== "utf-8-code-points") {
    fail("PROFILE_V3_PROMPT_BUDGET", "prompt budget contract is invalid");
  }

  const profiles = array(inventory.profiles, "profiles");
  const profileIds = profiles.map((entry, index) => string(plain(entry, `profiles[${index}]`).id, `profiles[${index}].id`));
  unique(profileIds, "profile IDs");
  exactSet(profileIds, ["plain", "core", "core-v2", "deep", "assurance", "profile-only", "instrumented"], "profile IDs");
  const runtimeIds = profiles.filter((entry) => entry.runtime === true).map((entry) => entry.id);
  exactSet(runtimeIds, V3_RUNTIME_PROFILE_IDS, "runtime profile IDs");
  const defaultProfile = profiles.find((entry) => entry.id === "core");
  if (defaultProfile.status !== "development-default" || defaultProfile.quality_surface !== "none") {
    fail("PROFILE_V3_DEFAULT", "core must remain the unpromoted development default with no quality surface");
  }
  const coreV2 = profiles.find((entry) => entry.id === "core-v2");
  if (coreV2.status !== "validation-candidate" || coreV2.primary_role_id !== "build"
    || coreV2.quality_surface !== "none" || coreV2.delegation_limit !== 0) {
    fail("PROFILE_V3_CORE_V2", "core-v2 must remain a non-default validation candidate with a single host-owned remediation pass");
  }
  const deep = profiles.find((entry) => entry.id === "deep");
  if (deep.status !== "development-candidate" || deep.quality_surface !== "none" || deep.delegation_limit > 3) {
    fail("PROFILE_V3_DEEP", "deep must remain an unpromoted development candidate with no quality surface");
  }
  const assurance = profiles.find((entry) => entry.id === "assurance");
  if (assurance.status !== "deprecated-research-only" || assurance.quality_surface !== "assurance-facade-v1") {
    fail("PROFILE_V3_ASSURANCE", "legacy assurance must remain research-only through the compatibility facade");
  }

  const facade = array(inventory.facades, "facades").find((entry) => entry.id === "assurance-facade-v1");
  if (!facade) fail("PROFILE_V3_FACADE", "assurance facade is missing");
  exactSet(facade.model_visible_tool_ids, ASSURANCE_FACADE_TOOL_IDS, "assurance facade tool IDs");
  if (facade.legacy_dispatch_tool_count !== 17 || facade.legacy_visibility !== "compatibility-plugin-only") {
    fail("PROFILE_V3_FACADE", "legacy assurance surface must remain compatibility-only");
  }

  const components = array(inventory.components, "components");
  const componentIds = components.map((entry) => entry.id);
  unique(componentIds, "component IDs");
  exactSet(componentIds, [
    "core-rules",
    "targeted-verification",
    "risk-gated-specialized-visible-contract-remediation",
    "independent-final-review",
    "deep-context",
    "assurance-controls",
  ], "component IDs");
  const interventionVectorFingerprints = [];
  for (const component of components) {
    const vector = plain(component.intervention_vector, `${component.id}.intervention_vector`);
    exactSet(Object.keys(vector), ["prompt_fragments", "roles", "tools", "permissions"], `${component.id} intervention vector keys`);
    for (const key of ["prompt_fragments", "roles", "tools", "permissions"]) {
      const values = array(vector[key], `${component.id}.intervention_vector.${key}`);
      unique(values, `${component.id}.intervention_vector.${key}`);
      if (values.some((entry) => typeof entry !== "string" || entry.length === 0)) {
        fail("PROFILE_V3_COMPONENT", `${component.id} intervention vector contains an invalid ${key} entry`);
      }
    }
    if (!component.intervention_vector.prompt_fragments.includes(component.intervention_path)) {
      fail("PROFILE_V3_COMPONENT", `${component.id} prompt fragments must include its intervention path`);
    }
    interventionVectorFingerprints.push(fingerprintProfileValue(vector));
  }
  unique(interventionVectorFingerprints, "component intervention vectors");
  for (const profile of profiles) {
    array(profile.component_ids, `${profile.id}.component_ids`);
    for (const componentId of profile.component_ids) {
      if (!componentIds.includes(componentId)) {
        fail("PROFILE_V3_REFERENCE", `${profile.id} references unknown component ${componentId}`);
      }
    }
  }

  const bundles = array(inventory.adoption_bundles, "adoption_bundles");
  const bundleIds = bundles.map((entry) => entry.id);
  unique(bundleIds, "bundle IDs");
  exactSet(bundleIds, V3_BUNDLE_IDS, "bundle IDs");
  const byId = new Map();
  for (const [index, rawBundle] of bundles.entries()) {
    const bundle = plain(rawBundle, `adoption_bundles[${index}]`);
    bundle.entries = array(bundle.entries, `${bundle.id}.entries`).map(
      (entry, entryIndex) => validateBundleEntry(entry, `${bundle.id}.entries[${entryIndex}]`),
    );
    unique(bundle.entries.map((entry) => entry.target), `${bundle.id} targets`);
    unique(bundle.entries.map((entry) => portableCollisionKey(entry.target)), `${bundle.id} portable targets`);
    bundle.forbidden_prefixes = array(bundle.forbidden_prefixes, `${bundle.id}.forbidden_prefixes`).map(
      (entry, prefixIndex) => normalizePortablePath(entry, `${bundle.id}.forbidden_prefixes[${prefixIndex}]`),
    );
    byId.set(bundle.id, bundle);
  }
  for (const bundle of bundles) {
    const baseBundle = bundle.base_bundle_id === null ? null : byId.get(bundle.base_bundle_id);
    if (bundle.base_bundle_id !== null && !baseBundle) {
      fail("PROFILE_V3_BUNDLE_BASE", `${bundle.id} references unknown base bundle`);
    }
    validateBundleTargetSet(bundle, baseBundle);
  }
  if (byId.get("core").base_bundle_id !== null || byId.get("core-v2").base_bundle_id !== "core"
    || byId.get("deep").base_bundle_id !== "core"
    || byId.get("assurance").base_bundle_id !== "deep" || byId.get("lab").base_bundle_id !== null) {
    fail("PROFILE_V3_BUNDLE_BASE", "bundle semantic inheritance is invalid");
  }
  return inventory;
}

export function loadProfileInventoryV3(repositoryRoot) {
  const root = fs.realpathSync.native(path.resolve(repositoryRoot));
  const inventoryPath = resolveInside(root, PROFILE_INVENTORY_V3_PATH, "inventory path").absolute;
  const inventory = validateInventoryShape(readJson(inventoryPath, PROFILE_INVENTORY_V3_PATH));
  return Object.freeze({
    root,
    inventory,
    inventory_path: inventoryPath,
    fingerprint: fingerprintProfileValue(inventory),
  });
}

function flattenSourceFiles(root, source, target, forbiddenPrefixes, result) {
  const identity = sourceIdentity(root, source, `bundle source ${source}`);
  if (forbiddenPrefixes.some((prefix) => pathIsPrefix(prefix, target))) return;
  if (identity.stat.isFile()) {
    result.push(Object.freeze({ source, target, absolute_source: identity.absolute }));
    return;
  }
  for (const name of fs.readdirSync(identity.absolute).sort()) {
    const childSource = path.posix.join(source, name);
    const childTarget = path.posix.join(target, name);
    flattenSourceFiles(root, childSource, childTarget, forbiddenPrefixes, result);
  }
}

function assertNoTargetCollisions(files, bundleId) {
  const exact = new Set();
  const portable = new Map();
  for (const file of files) {
    if (exact.has(file.target)) fail("PROFILE_V3_TARGET_COLLISION", `${bundleId} duplicates ${file.target}`);
    exact.add(file.target);
    const key = portableCollisionKey(file.target);
    if (portable.has(key)) {
      fail("PROFILE_V3_PORTABLE_COLLISION", `${bundleId} collides at ${file.target} and ${portable.get(key)}`);
    }
    portable.set(key, file.target);
  }
}

export function resolveProfileBundleV3(repositoryRoot, bundleId) {
  string(bundleId, "bundle ID");
  const loaded = loadProfileInventoryV3(repositoryRoot);
  const bundle = loaded.inventory.adoption_bundles.find((entry) => entry.id === bundleId);
  if (!bundle) fail("PROFILE_V3_BUNDLE_UNKNOWN", `unknown bundle ${bundleId}`);
  const files = [];
  for (const entry of bundle.entries) {
    flattenSourceFiles(loaded.root, entry.source, entry.target, bundle.forbidden_prefixes, files);
  }
  files.sort((left, right) => left.target.localeCompare(right.target));
  assertNoTargetCollisions(files, bundle.id);
  for (const file of files) {
    if (bundle.forbidden_prefixes.some((prefix) => pathIsPrefix(prefix, file.target))) {
      fail("PROFILE_V3_FORBIDDEN", `${bundle.id} contains forbidden path ${file.target}`);
    }
  }
  return Object.freeze({ ...loaded, bundle, files: Object.freeze(files) });
}

function readStableSourceFile(root, file) {
  const before = sourceIdentity(root, file.source, `bundle source ${file.source}`);
  if (!before.stat.isFile()) fail("PROFILE_V3_SOURCE_TYPE", `${file.source} changed type during materialization`);
  const bytes = fs.readFileSync(before.absolute);
  const after = sourceIdentity(root, file.source, `bundle source ${file.source}`);
  if (!after.stat.isFile() || before.physical !== after.physical
    || before.stat.dev !== after.stat.dev || before.stat.ino !== after.stat.ino
    || before.stat.size !== after.stat.size || before.stat.mtimeMs !== after.stat.mtimeMs) {
    fail("PROFILE_V3_SOURCE_RACE", `${file.source} changed during materialization`);
  }
  return bytes;
}

export function buildProfileBundleManifest(repositoryRoot, bundleId) {
  const resolved = resolveProfileBundleV3(repositoryRoot, bundleId);
  const trackedFiles = repositoryTrackedFiles(resolved.root);
  const files = resolved.files.map((file) => {
    const bytes = readStableSourceFile(resolved.root, file);
    return Object.freeze({
      path: file.target,
      size: bytes.byteLength,
      sha256: sha256Bytes(bytes),
    });
  });
  const manifestBody = {
    schema_version: MATERIALIZED_MANIFEST_SCHEMA_VERSION,
    managed_by: "opencode-harness-profile-materializer",
    fingerprint_algorithm: MATERIALIZED_FINGERPRINT_ALGORITHM,
    inventory_id: resolved.inventory.inventory_id,
    inventory_fingerprint: resolved.fingerprint,
    source_sha: repositoryCommit(resolved.root),
    source_git_clean: repositoryIsClean(resolved.root),
    source_all_tracked: resolved.files.every((file) => trackedFiles.has(file.source)),
    source_tree_fingerprint: fingerprintProfileValue({
      domain: "sha256:profile-source-tree-v1",
      files,
    }),
    bundle_id: resolved.bundle.id,
    runtime_profile_id: resolved.bundle.runtime_profile_id,
    file_count: files.length,
    total_bytes: files.reduce((total, entry) => total + entry.size, 0),
    files,
  };
  return Object.freeze({
    resolved,
    manifest: Object.freeze({
      ...manifestBody,
      bundle_fingerprint: fingerprintProfileValue({
        domain: MATERIALIZED_FINGERPRINT_ALGORITHM,
        manifest: manifestBody,
      }),
    }),
  });
}

function validateManagedDestination(destination, bundleId) {
  const stat = fs.lstatSync(destination);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail("PROFILE_V3_DESTINATION", "existing output must be a managed regular directory");
  }
  const manifestPath = path.join(destination, MATERIALIZED_MANIFEST_NAME);
  const manifest = readJson(manifestPath, "existing materialized manifest");
  if (manifest.schema_version !== MATERIALIZED_MANIFEST_SCHEMA_VERSION
    || manifest.managed_by !== "opencode-harness-profile-materializer"
    || manifest.bundle_id !== bundleId || !Array.isArray(manifest.files)) {
    fail("PROFILE_V3_OVERWRITE", "existing output is not a compatible managed bundle");
  }
  const expectedFiles = new Set([MATERIALIZED_MANIFEST_NAME, ...manifest.files.map((entry) => (
    normalizePortablePath(entry.path, "existing manifest path")
  ))]);
  const hostConfigPath = resolveInside(destination, MATERIALIZED_HOST_CONFIG_PATH, "host configuration").absolute;
  if (fs.existsSync(hostConfigPath)) {
    const hostConfigStat = fs.lstatSync(hostConfigPath, { bigint: true });
    if (hostConfigStat.isSymbolicLink() || !hostConfigStat.isFile() || hostConfigStat.nlink !== 1n) {
      fail("PROFILE_V3_OVERWRITE_LINK", "host configuration must be a single-link regular file");
    }
    if (process.platform !== "win32" && (Number(hostConfigStat.mode) & 0o022) !== 0) {
      fail("PROFILE_V3_OVERWRITE_MODE", "host configuration cannot be group- or world-writable");
    }
    expectedFiles.add(MATERIALIZED_HOST_CONFIG_PATH);
  }
  const actualFiles = [];
  const visit = (absolute, relative) => {
    const current = fs.lstatSync(absolute);
    if (current.isSymbolicLink()) fail("PROFILE_V3_OVERWRITE_LINK", `managed output contains link ${relative}`);
    if (current.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) {
        visit(path.join(absolute, name), relative.length === 0 ? name : path.posix.join(relative, name));
      }
    } else if (current.isFile()) {
      actualFiles.push(normalizePortablePath(relative, "managed output path"));
    } else {
      fail("PROFILE_V3_OVERWRITE_TYPE", `managed output contains special file ${relative}`);
    }
  };
  visit(destination, "");
  exactSet(actualFiles, expectedFiles, "managed output files");
  for (const entry of manifest.files) {
    const target = resolveInside(destination, entry.path, "managed output file").absolute;
    const bytes = fs.readFileSync(target);
    if (bytes.byteLength !== entry.size || sha256Bytes(bytes) !== entry.sha256) {
      fail("PROFILE_V3_OVERWRITE_DRIFT", `managed output changed at ${entry.path}`);
    }
  }
}

function readPreservedHostConfiguration(destination, destinationExists) {
  if (!destinationExists) return null;
  const source = resolveInside(destination, MATERIALIZED_HOST_CONFIG_PATH, "host configuration").absolute;
  if (!fs.existsSync(source)) return null;
  const pathBefore = fs.lstatSync(source, { bigint: true });
  if (pathBefore.isSymbolicLink() || !pathBefore.isFile() || pathBefore.nlink !== 1n
    || (process.platform !== "win32" && (Number(pathBefore.mode) & 0o022) !== 0)) {
    fail("PROFILE_V3_OVERWRITE_LINK", "host configuration must be a single-link regular file");
  }
  const descriptor = fs.openSync(source, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  let bytes;
  let before;
  let after;
  try {
    before = fs.fstatSync(descriptor, { bigint: true });
    bytes = fs.readFileSync(descriptor);
    after = fs.fstatSync(descriptor, { bigint: true });
  } finally {
    fs.closeSync(descriptor);
  }
  const pathAfter = fs.lstatSync(source, { bigint: true });
  if (!before.isFile() || before.nlink !== 1n || !after.isFile()
    || before.dev !== after.dev || before.ino !== after.ino
    || before.size !== after.size || before.mtimeNs !== after.mtimeNs
    || pathAfter.dev !== after.dev || pathAfter.ino !== after.ino
    || pathBefore.dev !== after.dev || pathBefore.ino !== after.ino) {
    fail("PROFILE_V3_SOURCE_RACE", "host configuration changed during replacement");
  }
  return Object.freeze({
    bytes,
    dev: after.dev,
    ino: after.ino,
    size: after.size,
    mtime_ns: after.mtimeNs,
    mode: after.mode,
    sha256: sha256Bytes(bytes),
  });
}

function revalidatePreservedHostConfiguration(destination, preserved) {
  const current = readPreservedHostConfiguration(destination, true);
  if (current === null || current.dev !== preserved.dev || current.ino !== preserved.ino
    || current.size !== preserved.size || current.mtime_ns !== preserved.mtime_ns
    || current.mode !== preserved.mode || current.sha256 !== preserved.sha256
    || !current.bytes.equals(preserved.bytes)) {
    fail("PROFILE_V3_HOST_CONFIG_CONFLICT", "host configuration changed before bundle publication");
  }
}

function writeExclusiveFile(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const flags = fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY
    | (fs.constants.O_NOFOLLOW ?? 0);
  const descriptor = fs.openSync(filePath, flags, 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function transactionPath(parent, baseName) {
  return path.join(parent, `.${baseName}.materialize.lock`);
}

function transactionMember(parent, name, expectedPrefix, label) {
  if (typeof name !== "string" || name.length <= expectedPrefix.length
    || !name.startsWith(expectedPrefix) || name.includes("/") || name.includes("\\")) {
    fail("PROFILE_V3_RECOVERY", `${label} is not a confined transaction member`);
  }
  return path.join(parent, name);
}

function transactionOwnerIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    fail("PROFILE_V3_RECOVERY", "materialization owner PID is invalid");
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    fail("PROFILE_V3_RECOVERY", `materialization owner liveness is unavailable: ${error.message}`);
  }
}

function removeTransactionStaging(staging) {
  if (!fs.existsSync(staging)) return;
  const stat = fs.lstatSync(staging);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail("PROFILE_V3_RECOVERY", "transaction staging is not a regular directory");
  }
  fs.rmSync(staging, { recursive: true, force: false });
}

function recoverMaterializationTransaction(parent, baseName, bundleId) {
  const lockPath = transactionPath(parent, baseName);
  if (!fs.existsSync(lockPath)) return Object.freeze({ status: "not-needed" });
  const lockStat = fs.lstatSync(lockPath);
  if (lockStat.isSymbolicLink() || !lockStat.isFile()) {
    fail("PROFILE_V3_RECOVERY", "materialization lock is not a regular file");
  }
  const transaction = readJson(lockPath, "materialization recovery record");
  if (transaction.schema_version !== 2 || transaction.bundle_id !== bundleId
    || transaction.destination_name !== baseName
    || typeof transaction.destination_was_present !== "boolean"
    || typeof transaction.transaction_id !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(transaction.transaction_id)
    || !Number.isSafeInteger(transaction.created_at_ms) || transaction.created_at_ms <= 0) {
    fail("PROFILE_V3_RECOVERY", "materialization recovery record is incompatible");
  }
  if (transactionOwnerIsAlive(transaction.owner_pid)) {
    fail("PROFILE_V3_BUSY", "another materializer process owns the live transaction");
  }
  const expectedStagingName = `.${baseName}.staging-${transaction.transaction_id}`;
  const expectedBackupName = `.${baseName}.backup-${transaction.transaction_id}`;
  if (transaction.staging_name !== expectedStagingName
    || (transaction.backup_name !== null && transaction.backup_name !== expectedBackupName)) {
    fail("PROFILE_V3_RECOVERY", "materialization transaction members do not match its identity");
  }
  const staging = transactionMember(
    parent,
    transaction.staging_name,
    `.${baseName}.staging-`,
    "transaction staging",
  );
  const backup = transaction.backup_name === null ? null : transactionMember(
    parent,
    transaction.backup_name,
    `.${baseName}.backup-`,
    "transaction backup",
  );
  const destination = path.join(parent, baseName);
  const destinationExists = fs.existsSync(destination);
  const backupExists = backup !== null && fs.existsSync(backup);
  if (destinationExists) {
    validateManagedDestination(destination, bundleId);
    if (backupExists) validateManagedDestination(backup, bundleId);
  } else if (backupExists) {
    validateManagedDestination(backup, bundleId);
    fs.renameSync(backup, destination);
  } else if (transaction.destination_was_present) {
    fail("PROFILE_V3_RECOVERY", "interrupted replacement lost both destination and backup");
  }
  removeTransactionStaging(staging);
  fs.unlinkSync(lockPath);
  return Object.freeze({
    status: "recovered",
    restored_backup: !destinationExists && backupExists,
  });
}

export function materializeProfileBundleV3({
  repositoryRoot,
  bundleId,
  outputDirectory,
  dryRun = false,
  overwrite = false,
  allowDirty = false,
  testBeforeDestinationCommit = null,
  testRenameOperation = null,
}) {
  if (typeof dryRun !== "boolean" || typeof overwrite !== "boolean" || typeof allowDirty !== "boolean"
    || (testBeforeDestinationCommit !== null && typeof testBeforeDestinationCommit !== "function")
    || (testRenameOperation !== null && typeof testRenameOperation !== "function")) {
    fail("PROFILE_V3_ARGUMENT", "materializer arguments are invalid");
  }
  const renameOperation = testRenameOperation ?? fs.renameSync;
  const prepared = buildProfileBundleManifest(repositoryRoot, bundleId);
  if ((!prepared.manifest.source_git_clean || !prepared.manifest.source_all_tracked) && !allowDirty) {
    fail("PROFILE_V3_SOURCE_DIRTY", "materialization requires a clean tracked source; --allow-dirty is development-only");
  }
  const requestedDestination = path.resolve(string(outputDirectory, "output directory"));
  const requestedParent = path.dirname(requestedDestination);
  if (!fs.existsSync(requestedParent) && !dryRun) {
    fs.mkdirSync(requestedParent, { recursive: true });
  }
  const parent = fs.existsSync(requestedParent)
    ? fs.realpathSync.native(requestedParent)
    : requestedParent;
  const destination = path.join(parent, path.basename(requestedDestination));
  const baseName = path.basename(destination);
  if (!dryRun) recoverMaterializationTransaction(parent, baseName, bundleId);
  const destinationExists = fs.existsSync(destination);
  if (destinationExists && !overwrite) {
    fail("PROFILE_V3_OVERWRITE", "output already exists; pass --force only for a verified managed bundle");
  }
  if (destinationExists) validateManagedDestination(destination, bundleId);
  const preservedHostConfiguration = bundleId === "assurance"
    ? readPreservedHostConfiguration(destination, destinationExists)
    : null;
  if (dryRun) {
    return Object.freeze({
      status: "dry-run",
      output_directory: destination,
      would_replace_managed_bundle: destinationExists,
      manifest: prepared.manifest,
    });
  }

  const lockPath = transactionPath(parent, baseName);
  const transactionId = crypto.randomUUID();
  const staging = path.join(parent, `.${baseName}.staging-${transactionId}`);
  let backup = destinationExists
    ? path.join(parent, `.${baseName}.backup-${transactionId}`)
    : null;
  let recoveryRequired = false;
  writeExclusiveFile(lockPath, Buffer.from(`${JSON.stringify({
    schema_version: 2,
    transaction_id: transactionId,
    owner_pid: process.pid,
    created_at_ms: Date.now(),
    bundle_id: bundleId,
    destination_name: baseName,
    destination_was_present: destinationExists,
    staging_name: path.basename(staging),
    backup_name: backup === null ? null : path.basename(backup),
  })}\n`, "utf8"));
  fs.mkdirSync(staging, { mode: 0o700 });
  try {
    for (const file of prepared.resolved.files) {
      const bytes = readStableSourceFile(prepared.resolved.root, file);
      const expected = prepared.manifest.files.find((entry) => entry.path === file.target);
      if (bytes.byteLength !== expected.size || sha256Bytes(bytes) !== expected.sha256) {
        fail("PROFILE_V3_SOURCE_RACE", `${file.source} changed after preflight`);
      }
      writeExclusiveFile(resolveInside(staging, file.target, "materialized target").absolute, bytes);
    }
    writeExclusiveFile(
      path.join(staging, MATERIALIZED_MANIFEST_NAME),
      Buffer.from(`${JSON.stringify(prepared.manifest, null, 2)}\n`, "utf8"),
    );
    if (preservedHostConfiguration !== null) {
      writeExclusiveFile(
        resolveInside(staging, MATERIALIZED_HOST_CONFIG_PATH, "preserved host configuration").absolute,
        preservedHostConfiguration.bytes,
      );
    }
    if (destinationExists) {
      if (testBeforeDestinationCommit !== null) testBeforeDestinationCommit();
      validateManagedDestination(destination, bundleId);
      if (preservedHostConfiguration !== null) {
        revalidatePreservedHostConfiguration(destination, preservedHostConfiguration);
      }
      if (fs.existsSync(backup)) fail("PROFILE_V3_BACKUP", "transaction backup target already exists");
      recoveryRequired = true;
      renameOperation(destination, backup);
    }
    try {
      renameOperation(staging, destination);
      recoveryRequired = false;
    } catch (error) {
      if (backup !== null && !fs.existsSync(destination) && fs.existsSync(backup)) {
        renameOperation(backup, destination);
        backup = null;
        recoveryRequired = false;
      }
      throw error;
    }
    return Object.freeze({
      status: "materialized",
      output_directory: destination,
      backup_directory: backup,
      manifest: prepared.manifest,
    });
  } finally {
    if (!recoveryRequired) {
      removeTransactionStaging(staging);
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    }
  }
}

export function loadProfileV3Pointers(repositoryRoot) {
  const loaded = loadProfileInventoryV3(repositoryRoot);
  const pointers = {};
  for (const bundleId of V3_BUNDLE_IDS) {
    const relativePath = `adoption/${bundleId}.v3.json`;
    const pointer = readJson(resolveInside(loaded.root, relativePath, "adoption pointer").absolute, relativePath);
    if (pointer.schema_version !== 3 || pointer.inventory_path !== PROFILE_INVENTORY_V3_PATH
      || pointer.bundle_id !== bundleId || pointer.view !== `adoption_bundles.${bundleId}`) {
      fail("PROFILE_V3_POINTER", `${relativePath} does not match the canonical inventory view`);
    }
    pointers[bundleId] = pointer;
  }
  return Object.freeze({ ...loaded, pointers: Object.freeze(pointers) });
}
