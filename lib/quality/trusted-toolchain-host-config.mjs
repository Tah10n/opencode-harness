import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  ContractError,
  assertArray,
  assertPlain,
  assertString,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const TRUSTED_TOOLCHAIN_HOST_CONFIG_SCHEMA_VERSION = 1;
export const TRUSTED_TOOLCHAIN_HOST_CONFIG_FILENAME = "quality-toolchains.host.v1.json";
export const TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION = "trusted-toolchain-resolution-v4";
export const TRUSTED_TOOLCHAIN_HOST_FAMILIES = Object.freeze([
  "node", "npm", "python", "pytest", "go", "cargo", "java", "maven", "gradle",
]);
export const TRUSTED_TOOLCHAIN_STATE_ROOT_IDS = Object.freeze([
  "npm", "python", "go", "cargo", "maven", "gradle",
]);
export const TRUSTED_TOOLCHAIN_HOST_CONFIG_LIMITS = Object.freeze({
  max_bytes: 128 * 1024,
  max_trusted_roots: 32,
  max_state_roots: 16,
  max_candidates_per_family: 8,
  max_path_bytes: 4096,
  max_id_bytes: 128,
});

function comparablePath(value) {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function frozenTransientClone(value) {
  const clone = structuredClone(value);
  const freeze = (entry) => {
    if (entry && typeof entry === "object") {
      Object.values(entry).forEach(freeze);
      Object.freeze(entry);
    }
    return entry;
  };
  return freeze(clone);
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function overlaps(left, right) {
  return isInside(left, right) || isInside(right, left);
}

function decimal(value) {
  return BigInt(value).toString(10);
}

function sha256Bytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function safeAbsolutePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")
    || Buffer.byteLength(value, "utf8") > TRUSTED_TOOLCHAIN_HOST_CONFIG_LIMITS.max_path_bytes
    || !path.isAbsolute(value)) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_PATH", `${label} must be a bounded absolute host path`);
  }
  const normalized = path.normalize(value);
  if (normalized !== value) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_PATH", `${label} must be lexically canonical`);
  }
  return normalized;
}

function assertNoAliasedComponents(absolute, label, missingCode) {
  const parsed = path.parse(absolute);
  const components = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const component of components) {
    current = path.join(current, component);
    let stat;
    try {
      stat = fs.lstatSync(current, { bigint: true });
    } catch (error) {
      if (error?.code === "ENOENT") throw new ContractError(missingCode, `${label} does not exist`);
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_PATH", `${label} cannot be inspected`);
    }
    if (stat.isSymbolicLink()) {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_ALIAS", `${label} cannot traverse a symlink or junction`);
    }
  }
}

function canonicalDirectory(value, label, { workspaceRoot = null, state = false } = {}) {
  const absolute = safeAbsolutePath(value, label);
  assertNoAliasedComponents(absolute, label, state
    ? "QUALITY_TOOLCHAIN_STATE_UNAVAILABLE"
    : "QUALITY_TOOLCHAIN_HOST_CONFIG_ROOT");
  const canonical = fs.realpathSync.native(absolute);
  if (comparablePath(canonical) !== comparablePath(absolute)) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_ALIAS", `${label} cannot resolve through an alias`);
  }
  const stat = fs.statSync(canonical, { bigint: true });
  if (!stat.isDirectory()) {
    throw new ContractError(state ? "QUALITY_TOOLCHAIN_STATE_UNAVAILABLE" : "QUALITY_TOOLCHAIN_HOST_CONFIG_ROOT",
      `${label} must be a directory`);
  }
  if (workspaceRoot !== null && overlaps(workspaceRoot, canonical)) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_SCOPE", `${label} must be disjoint from the workspace`);
  }
  if (state) {
    try {
      fs.accessSync(canonical, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
    } catch {
      throw new ContractError("QUALITY_TOOLCHAIN_STATE_UNAVAILABLE", `${label} must be readable and writable`);
    }
  }
  return canonical;
}

function validateCandidate(family, candidate, label) {
  assertPlain(candidate, label);
  const direct = ["node", "python", "go", "cargo"].includes(family);
  if (direct) {
    const allowed = ["kind", "executable_path"];
    const required = [...allowed];
    if (["go", "cargo"].includes(family)) {
      allowed.push("state_root");
      required.push("state_root");
    }
    exact(candidate, allowed, required, label);
    if (candidate.kind !== "direct") {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_STRATEGY", `${label}.kind must be direct`);
    }
    const normalized = {
      kind: candidate.kind,
      executable_path: safeAbsolutePath(candidate.executable_path, `${label}.executable_path`),
    };
    if (["go", "cargo"].includes(family)) {
      if (candidate.state_root !== family) {
        throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_STATE", `${label}.state_root must be ${family}`);
      }
      normalized.state_root = candidate.state_root;
    }
    return normalized;
  }
  if (family === "npm") {
    exact(candidate, ["kind", "node_executable_path", "npm_cli_path", "state_root"],
      ["kind", "node_executable_path", "npm_cli_path", "state_root"], label);
    if (candidate.kind !== "npm_cli" || candidate.state_root !== "npm") {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_STRATEGY", `${label} must use npm_cli with npm state`);
    }
    return {
      kind: candidate.kind,
      node_executable_path: safeAbsolutePath(candidate.node_executable_path, `${label}.node_executable_path`),
      npm_cli_path: safeAbsolutePath(candidate.npm_cli_path, `${label}.npm_cli_path`),
      state_root: candidate.state_root,
    };
  }
  if (family === "pytest") {
    exact(candidate, ["kind", "python_executable_path", "state_root"],
      ["kind", "python_executable_path", "state_root"], label);
    if (candidate.kind !== "python_module" || candidate.state_root !== "python") {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_STRATEGY", `${label} must use python_module with python state`);
    }
    return {
      kind: candidate.kind,
      python_executable_path: safeAbsolutePath(candidate.python_executable_path, `${label}.python_executable_path`),
      state_root: candidate.state_root,
    };
  }
  if (family === "java") {
    exact(candidate, ["kind", "java_home"], ["kind", "java_home"], label);
    if (candidate.kind !== "direct") {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_STRATEGY", `${label}.kind must be direct`);
    }
    return { kind: candidate.kind, java_home: safeAbsolutePath(candidate.java_home, `${label}.java_home`) };
  }
  if (family === "maven") {
    exact(candidate, ["kind", "java_home", "distribution_root", "state_root"],
      ["kind", "java_home", "distribution_root", "state_root"], label);
    if (candidate.kind !== "maven_java_v3" || candidate.state_root !== "maven") {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_STRATEGY", `${label} must use maven_java_v3 with maven state`);
    }
    return {
      kind: candidate.kind,
      java_home: safeAbsolutePath(candidate.java_home, `${label}.java_home`),
      distribution_root: safeAbsolutePath(candidate.distribution_root, `${label}.distribution_root`),
      state_root: candidate.state_root,
    };
  }
  if (family === "gradle") {
    exact(candidate, ["kind", "layout", "java_home", "distribution_root", "state_root"],
      ["kind", "layout", "java_home", "distribution_root", "state_root"], label);
    if (candidate.kind !== "gradle_java" || candidate.state_root !== "gradle"
      || !["legacy_launcher", "instrumented_launcher"].includes(candidate.layout)) {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_STRATEGY", `${label} has an unsupported Gradle strategy`);
    }
    return {
      kind: candidate.kind,
      layout: candidate.layout,
      java_home: safeAbsolutePath(candidate.java_home, `${label}.java_home`),
      distribution_root: safeAbsolutePath(candidate.distribution_root, `${label}.distribution_root`),
      state_root: candidate.state_root,
    };
  }
  throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_STRATEGY", `${label} family is unsupported`);
}

export function validateTrustedToolchainHostConfiguration(value, { workspaceRoot } = {}) {
  const workspace = canonicalDirectory(path.resolve(workspaceRoot), "trusted toolchain workspace");
  assertPlain(value, "trusted toolchain host configuration");
  exact(value, ["schema_version", "configuration_id", "trusted_roots", "state_roots", "candidates", "auxiliary"],
    ["schema_version", "configuration_id", "trusted_roots", "state_roots", "candidates"],
    "trusted toolchain host configuration");
  if (value.schema_version !== TRUSTED_TOOLCHAIN_HOST_CONFIG_SCHEMA_VERSION) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_VERSION", "trusted toolchain host configuration schema is unsupported");
  }
  assertString(value.configuration_id, "trusted toolchain host configuration.configuration_id", {
    maxBytes: TRUSTED_TOOLCHAIN_HOST_CONFIG_LIMITS.max_id_bytes,
  });
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.configuration_id)) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_ID", "trusted toolchain host configuration ID is invalid");
  }

  assertArray(value.trusted_roots, "trusted toolchain host configuration.trusted_roots", {
    min: 1,
    max: TRUSTED_TOOLCHAIN_HOST_CONFIG_LIMITS.max_trusted_roots,
  });
  const trustedRoots = value.trusted_roots.map((entry, index) => canonicalDirectory(
    entry,
    `trusted toolchain host configuration.trusted_roots[${index}]`,
    { workspaceRoot: workspace },
  ));
  if (new Set(trustedRoots.map(comparablePath)).size !== trustedRoots.length) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_ROOT", "trusted roots must be unique");
  }

  assertPlain(value.state_roots, "trusted toolchain host configuration.state_roots");
  exact(value.state_roots, TRUSTED_TOOLCHAIN_STATE_ROOT_IDS, [], "trusted toolchain host configuration.state_roots");
  if (Object.keys(value.state_roots).length > TRUSTED_TOOLCHAIN_HOST_CONFIG_LIMITS.max_state_roots) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_STATE", "trusted toolchain state roots exceed their bound");
  }
  const stateRoots = {};
  for (const [stateId, statePath] of Object.entries(value.state_roots)) {
    const canonical = canonicalDirectory(
      statePath,
      `trusted toolchain host configuration.state_roots.${stateId}`,
      { workspaceRoot: workspace, state: true },
    );
    if (trustedRoots.some((root) => overlaps(root, canonical))) {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_SCOPE", "mutable state roots must be disjoint from trusted code roots");
    }
    stateRoots[stateId] = canonical;
  }
  if (new Set(Object.values(stateRoots).map(comparablePath)).size !== Object.keys(stateRoots).length) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_STATE", "state roots must be unique");
  }
  const stateRootEntries = Object.entries(stateRoots);
  for (let leftIndex = 0; leftIndex < stateRootEntries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < stateRootEntries.length; rightIndex += 1) {
      const [leftId, leftRoot] = stateRootEntries[leftIndex];
      const [rightId, rightRoot] = stateRootEntries[rightIndex];
      if (overlaps(leftRoot, rightRoot)) {
        throw new ContractError(
          "QUALITY_TOOLCHAIN_HOST_CONFIG_STATE",
          `state roots ${leftId} and ${rightId} must be pairwise disjoint`,
        );
      }
    }
  }

  assertPlain(value.candidates, "trusted toolchain host configuration.candidates");
  exact(value.candidates, TRUSTED_TOOLCHAIN_HOST_FAMILIES, [], "trusted toolchain host configuration.candidates");
  const candidates = {};
  for (const family of TRUSTED_TOOLCHAIN_HOST_FAMILIES) {
    const entries = value.candidates[family] ?? [];
    assertArray(entries, `trusted toolchain host configuration.candidates.${family}`, {
      max: TRUSTED_TOOLCHAIN_HOST_CONFIG_LIMITS.max_candidates_per_family,
    });
    candidates[family] = entries.map((entry, index) => validateCandidate(
      family,
      entry,
      `trusted toolchain host configuration.candidates.${family}[${index}]`,
    ));
    for (const candidate of candidates[family]) {
      if (candidate.state_root !== undefined && stateRoots[candidate.state_root] === undefined) {
        throw new ContractError("QUALITY_TOOLCHAIN_STATE_UNAVAILABLE", `missing state root ${candidate.state_root}`);
      }
    }
  }

  const auxiliary = value.auxiliary ?? {};
  assertPlain(auxiliary, "trusted toolchain host configuration.auxiliary");
  exact(auxiliary, ["git"], [], "trusted toolchain host configuration.auxiliary");
  let git = null;
  if (auxiliary.git !== undefined) {
    assertPlain(auxiliary.git, "trusted toolchain host configuration.auxiliary.git");
    exact(auxiliary.git, ["kind", "executable_path"], ["kind", "executable_path"],
      "trusted toolchain host configuration.auxiliary.git");
    if (auxiliary.git.kind !== "direct") {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_STRATEGY", "auxiliary Git must use direct strategy");
    }
    git = {
      kind: auxiliary.git.kind,
      executable_path: safeAbsolutePath(
        auxiliary.git.executable_path,
        "trusted toolchain host configuration.auxiliary.git.executable_path",
      ),
    };
  }

  return frozenTransientClone({
    schema_version: TRUSTED_TOOLCHAIN_HOST_CONFIG_SCHEMA_VERSION,
    configuration_id: value.configuration_id,
    trusted_roots: trustedRoots,
    state_roots: stateRoots,
    candidates,
    auxiliary: { git },
  });
}

export function parseTrustedToolchainHostConfiguration(serialized, options) {
  if (typeof serialized !== "string"
    || Buffer.byteLength(serialized, "utf8") > TRUSTED_TOOLCHAIN_HOST_CONFIG_LIMITS.max_bytes) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_SIZE", "trusted toolchain host configuration is oversized");
  }
  let value;
  try {
    value = JSON.parse(serialized.replace(/^\uFEFF/u, ""));
  } catch {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_JSON", "trusted toolchain host configuration must be valid JSON");
  }
  return validateTrustedToolchainHostConfiguration(value, options);
}

function sourceIdentity(canonicalPath, stat, contentFingerprint) {
  return {
    canonical_path: canonicalPath,
    device: decimal(stat.dev),
    inode: decimal(stat.ino),
    size: decimal(stat.size),
    mode: decimal(stat.mode),
    modified_ns: decimal(stat.mtimeNs),
    changed_ns: decimal(stat.ctimeNs),
    content_fingerprint: contentFingerprint,
  };
}

function identityShape(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.uid, stat.size, stat.mtimeNs, stat.ctimeNs]
    .map((entry) => decimal(entry));
}

function readHostSource(sourcePath, workspaceRoot, { required, afterRead } = {}) {
  if (isInside(workspaceRoot, sourcePath)) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_SCOPE", "host configuration source must be outside the workspace");
  }
  try {
    assertNoAliasedComponents(sourcePath, "trusted toolchain host configuration source",
      "QUALITY_TOOLCHAIN_HOST_CONFIG_MISSING");
  } catch (error) {
    if (!required && error instanceof ContractError && error.code === "QUALITY_TOOLCHAIN_HOST_CONFIG_MISSING") {
      const contentFingerprint = fingerprint({ absent: true });
      return {
        source_kind: "built_in",
        source_path: sourcePath,
        source_identity: null,
        content_fingerprint: contentFingerprint,
        configuration: null,
        configuration_fingerprint: fingerprint({ built_in: true }),
      };
    }
    throw error;
  }
  const canonical = fs.realpathSync.native(sourcePath);
  if (comparablePath(canonical) !== comparablePath(sourcePath)) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_ALIAS", "host configuration source cannot resolve through an alias");
  }
  let descriptor;
  try {
    let flags = fs.constants.O_RDONLY;
    if (process.platform !== "win32" && Number.isInteger(fs.constants.O_NOFOLLOW)) flags |= fs.constants.O_NOFOLLOW;
    descriptor = fs.openSync(canonical, flags);
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_KIND", "host configuration source must be a regular file");
    }
    if (before.nlink !== 1n) {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_HARDLINK", "host configuration source must be singly linked");
    }
    if (before.size > BigInt(TRUSTED_TOOLCHAIN_HOST_CONFIG_LIMITS.max_bytes)) {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_SIZE", "trusted toolchain host configuration is oversized");
    }
    if (process.platform !== "win32") {
      const mode = Number(before.mode & 0o777n);
      if ((mode & 0o022) !== 0) {
        throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_MODE", "host configuration source cannot be group- or world-writable");
      }
      if (typeof process.getuid === "function" && before.uid !== BigInt(process.getuid())) {
        throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_OWNER", "host configuration source must be owned by the current user");
      }
    }
    const bounded = Buffer.alloc(TRUSTED_TOOLCHAIN_HOST_CONFIG_LIMITS.max_bytes + 1);
    let bytesRead = 0;
    while (bytesRead < bounded.length) {
      const count = fs.readSync(descriptor, bounded, bytesRead, bounded.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    afterRead?.({ sourcePath: canonical, descriptor });
    const after = fs.fstatSync(descriptor, { bigint: true });
    let pathAfter;
    try {
      pathAfter = fs.lstatSync(canonical, { bigint: true });
    } catch {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_RACE", "host configuration path changed while it was read");
    }
    if (bytesRead > TRUSTED_TOOLCHAIN_HOST_CONFIG_LIMITS.max_bytes) {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_SIZE", "trusted toolchain host configuration is oversized");
    }
    if (pathAfter.isSymbolicLink()
      || JSON.stringify(identityShape(before)) !== JSON.stringify(identityShape(after))
      || JSON.stringify(identityShape(after)) !== JSON.stringify(identityShape(pathAfter))
      || bytesRead !== Number(before.size)) {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_RACE", "host configuration changed while it was read");
    }
    let serialized;
    try {
      serialized = new TextDecoder("utf-8", { fatal: true }).decode(bounded.subarray(0, bytesRead));
    } catch {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_JSON", "host configuration must contain valid UTF-8 JSON");
    }
    const contentFingerprint = sha256Bytes(bounded.subarray(0, bytesRead));
    const configuration = parseTrustedToolchainHostConfiguration(serialized, { workspaceRoot });
    return {
      source_kind: "host_file",
      source_path: canonical,
      source_identity: sourceIdentity(canonical, before, contentFingerprint),
      content_fingerprint: contentFingerprint,
      configuration,
      configuration_fingerprint: fingerprint(configuration),
    };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function anchorPath(anchorUrl) {
  let value;
  try {
    value = anchorUrl instanceof URL ? fileURLToPath(anchorUrl) : fileURLToPath(new URL(anchorUrl));
  } catch {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_ANCHOR", "host configuration anchor must be a file URL");
  }
  const absolute = safeAbsolutePath(path.resolve(value), "trusted toolchain host configuration anchor");
  assertNoAliasedComponents(absolute, "trusted toolchain host configuration anchor",
    "QUALITY_TOOLCHAIN_HOST_CONFIG_ANCHOR");
  const canonical = fs.realpathSync.native(absolute);
  if (comparablePath(canonical) !== comparablePath(absolute) || !fs.statSync(canonical).isFile()) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_ANCHOR", "host configuration anchor must be a non-aliased file");
  }
  return canonical;
}

function leaseBody(snapshot) {
  const effectiveFingerprint = fingerprint({
    source_kind: snapshot.source_kind,
    source_path: snapshot.source_path,
    source_identity: snapshot.source_identity,
    content_fingerprint: snapshot.content_fingerprint,
    configuration_fingerprint: snapshot.configuration_fingerprint,
    resolution_policy_version: TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION,
  });
  return { ...snapshot, effective_fingerprint: effectiveFingerprint };
}

export function loadTrustedToolchainHostConfigurationLease({
  anchorUrl,
  workspaceRoot,
  required = false,
  testHooks = {},
}) {
  if (typeof required !== "boolean") {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_REQUIRED", "host configuration required flag must be boolean");
  }
  assertPlain(testHooks, "trusted toolchain host configuration test hooks");
  exact(testHooks, ["afterRead"], [], "trusted toolchain host configuration test hooks");
  if (testHooks.afterRead !== undefined && typeof testHooks.afterRead !== "function") {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_HOOK", "afterRead test hook must be a function");
  }
  const anchor = anchorPath(anchorUrl);
  const workspace = canonicalDirectory(path.resolve(workspaceRoot), "trusted toolchain workspace");
  const sourcePath = path.join(path.dirname(anchor), TRUSTED_TOOLCHAIN_HOST_CONFIG_FILENAME);
  const initial = leaseBody(readHostSource(sourcePath, workspace, {
    required,
    afterRead: testHooks.afterRead,
  }));
  const lease = {
    source_kind: initial.source_kind,
    source_path: initial.source_path,
    source_identity: initial.source_identity === null ? null : frozenTransientClone(initial.source_identity),
    content_fingerprint: initial.content_fingerprint,
    configuration: initial.configuration,
    configuration_fingerprint: initial.configuration_fingerprint,
    effective_fingerprint: initial.effective_fingerprint,
    resolution_policy_version: TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION,
    reloadAndAssertCurrent() {
      const current = leaseBody(readHostSource(sourcePath, workspace, { required }));
      if (!fingerprintsEqual(initial.effective_fingerprint, current.effective_fingerprint)) {
        throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_DRIFT", "trusted toolchain host configuration changed after lease creation");
      }
      return lease;
    },
  };
  return Object.freeze(lease);
}

export function assertTrustedToolchainHostConfigurationLeaseCurrent(lease) {
  if (!lease || typeof lease !== "object" || typeof lease.reloadAndAssertCurrent !== "function") {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_REQUIRED", "a trusted host configuration lease is required");
  }
  if (lease.resolution_policy_version !== TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_POLICY", "trusted host configuration policy is stale");
  }
  return lease.reloadAndAssertCurrent();
}
