import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";

import {
  TRUSTED_TOOLCHAIN_HOST_CONFIG_LIMITS,
  TRUSTED_TOOLCHAIN_HOST_FAMILIES,
  TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION,
  assertTrustedToolchainHostConfigurationLeaseCurrent,
} from "./trusted-toolchain-host-config.mjs";
import {
  ContractError,
  assertArray,
  assertFingerprint,
  assertPlain,
  assertString,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const TRUSTED_TOOLCHAIN_MAP_SCHEMA_VERSION = 1;
export const TRUSTED_TOOLCHAIN_MAP_PATH = ".opencode/quality/toolchains.json";
export const TRUSTED_TOOLCHAIN_RESOLVERS = TRUSTED_TOOLCHAIN_HOST_FAMILIES;
export const TRUSTED_MACOS_FIXED_GIT_PATH = "/usr/local/libexec/opencode-quality-git/bin/git";
export const TRUSTED_MACOS_NPM_SCRIPT_SHELL_PATH = "/usr/local/libexec/opencode-quality-shell/bin/sh";
export const TRUSTED_TOOLCHAIN_LIMITS = Object.freeze({
  max_toolchains: 32,
  max_map_bytes: 128 * 1024,
  max_candidates_per_family: 8,
  max_prefix_arguments: 64,
  max_arguments: 64,
  max_identity_file_bytes: 256 * 1024 * 1024,
  max_runtime_identities: 2048,
  max_distribution_files: 2040,
  max_state_boundary_roots: TRUSTED_TOOLCHAIN_HOST_CONFIG_LIMITS.max_trusted_roots + 2,
});

const BUILT_IN_HOST_CONFIGURATION_CONTENT_FINGERPRINT = fingerprint({ built_in: true, content: null });
const BUILT_IN_HOST_CONFIGURATION_NORMALIZED_FINGERPRINT = fingerprint({ built_in: true, configuration: null });
const BUILT_IN_HOST_CONFIGURATION_FINGERPRINT = fingerprint({
  source_kind: "built_in",
  source_path: null,
  source_identity: null,
  content_fingerprint: BUILT_IN_HOST_CONFIGURATION_CONTENT_FINGERPRINT,
  configuration_fingerprint: BUILT_IN_HOST_CONFIGURATION_NORMALIZED_FINGERPRINT,
  resolution_policy_version: TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION,
});

function comparablePath(value) {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function freezeTransient(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeTransient);
    Object.freeze(value);
  }
  return value;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function overlaps(left, right) {
  return isInside(left, right) || isInside(right, left);
}

function assertLogicalId(value, label) {
  if (typeof value !== "string" || value.includes("\0") || Buffer.byteLength(value, "utf8") > 128
    || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(value)
    || value.includes("/") || value.includes("\\") || path.isAbsolute(value)) {
    throw new ContractError("QUALITY_TOOLCHAIN_ID", `${label} must be a logical ID`);
  }
  return value;
}

function safeAbsolutePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")
    || Buffer.byteLength(value, "utf8") > 4096 || !path.isAbsolute(value)) {
    throw new ContractError("QUALITY_TOOLCHAIN_PATH", `${label} must be an absolute host path`);
  }
  const normalized = path.normalize(value);
  if (normalized !== value) throw new ContractError("QUALITY_TOOLCHAIN_PATH", `${label} must be lexically canonical`);
  return normalized;
}

function validateArgument(value, label) {
  if (typeof value !== "string" || value.includes("\0") || Buffer.byteLength(value, "utf8") > 4096) {
    throw new ContractError("QUALITY_TOOLCHAIN_ARGUMENT", `${label} must be bounded UTF-8 without NUL`);
  }
  return value;
}

function assertNoAliasedComponents(absolute, label, missingCode = "QUALITY_TOOLCHAIN_UNAVAILABLE") {
  const parsed = path.parse(absolute);
  const remainder = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const component of remainder) {
    current = path.join(current, component);
    let stat;
    try {
      stat = fs.lstatSync(current, { bigint: true });
    } catch (error) {
      if (error?.code === "ENOENT") throw new ContractError(missingCode, `${label} does not exist`);
      throw new ContractError("QUALITY_TOOLCHAIN_PATH", `${label} cannot be inspected`);
    }
    if (stat.isSymbolicLink()) {
      throw new ContractError("QUALITY_TOOLCHAIN_ALIAS", `${label} cannot traverse a symlink or junction`);
    }
  }
}

function decimal(value) {
  return BigInt(value).toString(10);
}

function sha256Bytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function rawIdentity(canonicalPath, stat, contentFingerprint) {
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

function captureStateRootBoundary(stateRoot, workspaceRoot, trustedRoots) {
  if (stateRoot === null) return null;
  const absolute = safeAbsolutePath(stateRoot, "trusted toolchain state root");
  const workspace = safeAbsolutePath(workspaceRoot, "trusted toolchain state boundary workspace");
  const roots = uniquePaths(trustedRoots.map((entry, index) => safeAbsolutePath(
    entry,
    `trusted toolchain state boundary trusted_roots[${index}]`,
  ))).sort((left, right) => comparablePath(left).localeCompare(comparablePath(right)));
  assertNoAliasedComponents(absolute, "trusted toolchain state root", "QUALITY_TOOLCHAIN_STATE_UNAVAILABLE");
  const canonical = fs.realpathSync.native(absolute);
  if (comparablePath(canonical) !== comparablePath(absolute)) {
    throw new ContractError("QUALITY_TOOLCHAIN_ALIAS", "trusted toolchain state root cannot resolve through an alias");
  }
  const stat = fs.statSync(canonical, { bigint: true });
  if (!stat.isDirectory()) {
    throw new ContractError("QUALITY_TOOLCHAIN_STATE_UNAVAILABLE", "trusted toolchain state root must be a directory");
  }
  try {
    fs.accessSync(canonical, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
  } catch {
    throw new ContractError("QUALITY_TOOLCHAIN_STATE_UNAVAILABLE", "trusted toolchain state root must remain writable");
  }
  if (overlaps(workspace, canonical) || roots.some((root) => overlaps(root, canonical))) {
    throw new ContractError(
      "QUALITY_TOOLCHAIN_STATE_SCOPE",
      "trusted toolchain state root must remain disjoint from workspace and trusted code roots",
    );
  }
  const body = {
    schema_version: 1,
    canonical_path: canonical,
    device: decimal(stat.dev),
    inode: decimal(stat.ino),
    mode: decimal(stat.mode),
    workspace_root: workspace,
    trusted_roots: roots,
  };
  return freezeTransient({ ...body, fingerprint: fingerprint(body) });
}

function captureFileIdentity(absolute, label, {
  executable = false,
  maxBytes = TRUSTED_TOOLCHAIN_LIMITS.max_identity_file_bytes,
} = {}) {
  assertNoAliasedComponents(absolute, label);
  const canonical = fs.realpathSync.native(absolute);
  if (comparablePath(canonical) !== comparablePath(absolute)) {
    throw new ContractError("QUALITY_TOOLCHAIN_ALIAS", `${label} cannot resolve through a filesystem alias`);
  }
  let descriptor;
  try {
    let flags = fs.constants.O_RDONLY;
    if (process.platform !== "win32" && Number.isInteger(fs.constants.O_NOFOLLOW)) flags |= fs.constants.O_NOFOLLOW;
    descriptor = fs.openSync(canonical, flags);
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) throw new ContractError("QUALITY_TOOLCHAIN_KIND", `${label} must be a regular file`);
    if (before.nlink !== 1n) throw new ContractError("QUALITY_TOOLCHAIN_HARDLINK", `${label} cannot be multiply linked`);
    if (before.size > BigInt(maxBytes)) {
      throw new ContractError("QUALITY_TOOLCHAIN_SIZE", `${label} exceeds its identity hashing bound`);
    }
    if (process.platform !== "win32") {
      const mode = Number(before.mode & 0o777n);
      if ((mode & 0o022) !== 0) throw new ContractError("QUALITY_TOOLCHAIN_MODE", `${label} cannot be group- or world-writable`);
      if (executable && (mode & 0o111) === 0) throw new ContractError("QUALITY_TOOLCHAIN_MODE", `${label} is not executable`);
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    const contentFingerprint = sha256Bytes(bytes);
    const beforeShape = rawIdentity(canonical, before, contentFingerprint);
    const afterShape = rawIdentity(canonical, after, contentFingerprint);
    if (JSON.stringify(beforeShape) !== JSON.stringify(afterShape) || bytes.length !== Number(before.size)) {
      throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY_CHANGED", `${label} changed while its identity was captured`);
    }
    return beforeShape;
  } catch (error) {
    if (error?.code === "ENOENT") throw new ContractError("QUALITY_TOOLCHAIN_UNAVAILABLE", `${label} does not exist`);
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function identity(role, absolute, label, options) {
  return { role, ...captureFileIdentity(absolute, label, options) };
}

function canonicalTrustedDirectory(value, roots, workspaceRoot, label) {
  const absolute = safeAbsolutePath(value, label);
  if (isInside(workspaceRoot, absolute)) {
    throw new ContractError("QUALITY_TOOLCHAIN_PROJECT_LOCAL", `${label} cannot be project-local`);
  }
  if (!roots.some((root) => isInside(root, absolute))) {
    throw new ContractError("QUALITY_TOOLCHAIN_UNTRUSTED_ROOT", `${label} is outside approved host roots`);
  }
  assertNoAliasedComponents(absolute, label);
  const canonical = fs.realpathSync.native(absolute);
  if (comparablePath(canonical) !== comparablePath(absolute) || !fs.statSync(canonical).isDirectory()) {
    throw new ContractError("QUALITY_TOOLCHAIN_ALIAS", `${label} must be a canonical non-aliased directory`);
  }
  return canonical;
}

function assertTrustedComponentPath(value, roots, workspaceRoot, label) {
  const absolute = safeAbsolutePath(value, label);
  if (isInside(workspaceRoot, absolute)) {
    throw new ContractError("QUALITY_TOOLCHAIN_PROJECT_LOCAL", `${label} cannot be project-local`);
  }
  if (!roots.some((root) => isInside(root, absolute))) {
    throw new ContractError("QUALITY_TOOLCHAIN_UNTRUSTED_ROOT", `${label} is outside approved host roots`);
  }
  return absolute;
}

function assertWindowsPrimarySafe(absolute, label) {
  if (process.platform !== "win32") return;
  const extension = path.extname(absolute).toLowerCase();
  if ([".cmd", ".bat"].includes(extension)) {
    throw new ContractError("QUALITY_TOOLCHAIN_LAUNCHER_UNSAFE", `${label} cannot use a Windows command script`);
  }
  if (![".exe", ".com"].includes(extension)) {
    throw new ContractError("QUALITY_TOOLCHAIN_LAUNCHER_UNSAFE", `${label} must use a direct .exe or .com launcher`);
  }
}

function posixShebang(absolute, label) {
  if (process.platform === "win32") return null;
  const descriptor = fs.openSync(absolute, "r");
  try {
    const buffer = Buffer.alloc(4096);
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    if (bytesRead < 2 || buffer[0] !== 0x23 || buffer[1] !== 0x21) return null;
    const newline = buffer.subarray(2, bytesRead).indexOf(0x0a);
    if (newline === -1) {
      throw new ContractError("QUALITY_TOOLCHAIN_LAUNCHER_UNSAFE", `${label} has an unbounded shebang`);
    }
    const raw = buffer.subarray(2, newline + 2).toString("utf8").trim();
    const parts = raw.split(/\s+/u);
    if (parts.length !== 1 || !path.isAbsolute(parts[0])) {
      throw new ContractError("QUALITY_TOOLCHAIN_LAUNCHER_UNSAFE", `${label} must use one absolute shebang interpreter`);
    }
    return safeAbsolutePath(parts[0], `${label} shebang interpreter`);
  } finally {
    fs.closeSync(descriptor);
  }
}

function directPlan(candidatePath, roots, workspaceRoot, label, { rolePrefix = "" } = {}) {
  const primary = assertTrustedComponentPath(candidatePath, roots, workspaceRoot, label);
  assertWindowsPrimarySafe(primary, label);
  const scriptIdentity = identity(
    `${rolePrefix}executable`,
    primary,
    label,
    { executable: true },
  );
  const interpreter = posixShebang(primary, label);
  if (interpreter === null) {
    return {
      executable_path: primary,
      argv_prefix: [],
      identities: [scriptIdentity],
      path_entries: [path.dirname(primary)],
    };
  }
  const trustedInterpreter = assertTrustedComponentPath(
    interpreter,
    roots,
    workspaceRoot,
    `${label} shebang interpreter`,
  );
  return {
    executable_path: trustedInterpreter,
    argv_prefix: [primary],
    identities: [
      identity(`${rolePrefix}interpreter`, trustedInterpreter, `${label} shebang interpreter`, { executable: true }),
      { ...scriptIdentity, role: `${rolePrefix}script` },
    ],
    path_entries: [path.dirname(trustedInterpreter), path.dirname(primary)],
  };
}

function uniquePaths(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = comparablePath(value);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

function builtInCandidates(family) {
  const node = fs.realpathSync.native(process.execPath);
  if (family === "node") return [{ kind: "direct", executable_path: node, built_in: true }];
  if (family !== "npm") return [];
  const nodeRoot = path.dirname(node);
  return [
    path.join(nodeRoot, "node_modules", "npm", "bin", "npm-cli.js"),
    path.resolve(nodeRoot, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    path.resolve(nodeRoot, "..", "node_modules", "npm", "bin", "npm-cli.js"),
  ].map((npmCliPath) => ({
    kind: "npm_cli",
    node_executable_path: node,
    npm_cli_path: npmCliPath,
    state_root: "npm",
    built_in: true,
  }));
}

function managedWorkerNodePlan(configuration, configuredRoots, workspaceRoot, projectRoot) {
  const candidates = [
    ...(configuration?.candidates?.node ?? []),
    ...builtInCandidates("node"),
  ];
  for (const candidate of candidates) {
    const roots = candidate.built_in
      ? trustedBuiltInCandidateRoots("node", candidate)
      : configuredRoots;
    try {
      const plan = resolveCandidate("node", candidate, roots, workspaceRoot, projectRoot,
        configuration ?? { state_roots: {} });
      const identities = plan.identities.map((entry) => ({
        ...entry,
        role: `managed_worker_${entry.role}`,
      }));
      return Object.freeze({
        executable_path: plan.executable_path,
        identities: Object.freeze(identities),
        identity_fingerprint: fingerprint(identities),
      });
    } catch (error) {
      if (error instanceof ContractError && error.code === "QUALITY_TOOLCHAIN_UNAVAILABLE") continue;
      throw error;
    }
  }
  throw new ContractError(
    "QUALITY_TOOLCHAIN_UNAVAILABLE",
    "trusted managed-command worker requires an identity-bound Node runtime",
  );
}

export function trustedBuiltInCandidateRoots(family, candidate) {
  if (!candidate || typeof candidate !== "object" || candidate.built_in !== true
    || !["node", "npm"].includes(family)) {
    throw new ContractError("QUALITY_TOOLCHAIN_UNAVAILABLE", "built-in toolchain candidate metadata is invalid");
  }
  const executablePath = family === "node" ? candidate.executable_path : candidate.node_executable_path;
  const roots = [path.dirname(safeAbsolutePath(executablePath, `trusted built-in ${family} executable`))];
  if (family === "npm") {
    roots.push(path.dirname(safeAbsolutePath(candidate.npm_cli_path, "trusted built-in npm CLI")));
  }
  return Object.freeze(uniquePaths(roots));
}

function selectExactFile(directory, matcher, label) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    throw new ContractError("QUALITY_TOOLCHAIN_LAYOUT_UNSUPPORTED", `${label} directory is unavailable`);
  }
  const matches = entries.filter((entry) => entry.isFile() && matcher.test(entry.name)).map((entry) => entry.name).sort();
  if (matches.length === 0) {
    throw new ContractError("QUALITY_TOOLCHAIN_LAYOUT_UNSUPPORTED", `${label} is missing`);
  }
  if (matches.length !== 1) {
    throw new ContractError("QUALITY_TOOLCHAIN_LAYOUT_AMBIGUOUS", `${label} is ambiguous`);
  }
  return path.join(directory, matches[0]);
}

function walkManifest(root, relative, output) {
  const directory = path.join(root, relative);
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const childRelative = path.join(relative, entry.name);
    const absolute = path.join(root, childRelative);
    const stat = fs.lstatSync(absolute, { bigint: true });
    if (stat.isSymbolicLink()) {
      throw new ContractError("QUALITY_TOOLCHAIN_ALIAS", "distribution manifests cannot contain aliases");
    }
    if (stat.isDirectory()) {
      walkManifest(root, childRelative, output);
    } else if (stat.isFile()) {
      output.push(childRelative);
      if (output.length > TRUSTED_TOOLCHAIN_LIMITS.max_distribution_files) {
        throw new ContractError("QUALITY_TOOLCHAIN_SIZE", "distribution manifest exceeds its file bound");
      }
    } else {
      throw new ContractError("QUALITY_TOOLCHAIN_KIND", "distribution manifests may contain only files and directories");
    }
  }
}

function distributionManifest(distributionRoot, subdirectories, extraFiles, label) {
  const relatives = [];
  for (const subdirectory of subdirectories) {
    const absolute = path.join(distributionRoot, subdirectory);
    if (!fs.existsSync(absolute)) continue;
    if (!fs.statSync(absolute).isDirectory()) {
      throw new ContractError("QUALITY_TOOLCHAIN_LAYOUT_UNSUPPORTED", `${label} ${subdirectory} must be a directory`);
    }
    walkManifest(distributionRoot, subdirectory, relatives);
  }
  for (const extra of extraFiles) {
    const absolute = path.join(distributionRoot, extra);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new ContractError("QUALITY_TOOLCHAIN_LAYOUT_UNSUPPORTED", `${label} ${extra} is missing`);
    }
    relatives.push(extra);
  }
  const unique = [...new Set(relatives.map((entry) => entry.split(path.sep).join("/")))].sort();
  const identities = unique.map((relative, index) => identity(
    `distribution_${index}`,
    path.join(distributionRoot, ...relative.split("/")),
    `${label} distribution file ${relative}`,
  ));
  const manifest = identities.map((entry, index) => ({
    relative_path: unique[index],
    identity: { ...entry, role: undefined },
  })).map((entry) => ({
    relative_path: entry.relative_path,
    canonical_path: entry.identity.canonical_path,
    content_fingerprint: entry.identity.content_fingerprint,
    device: entry.identity.device,
    inode: entry.identity.inode,
    size: entry.identity.size,
    mode: entry.identity.mode,
    modified_ns: entry.identity.modified_ns,
    changed_ns: entry.identity.changed_ns,
  }));
  return {
    identities,
    roles: identities.map((entry) => entry.role),
    fingerprint: fingerprint(manifest),
  };
}

function javaExecutable(javaHome, roots, workspaceRoot, label) {
  const home = canonicalTrustedDirectory(javaHome, roots, workspaceRoot, `${label} JAVA_HOME`);
  const executablePath = path.join(home, "bin", process.platform === "win32" ? "java.exe" : "java");
  const direct = directPlan(executablePath, roots, workspaceRoot, `${label} Java executable`);
  return { home, ...direct };
}

function stateRootFor(candidate, configuration) {
  if (candidate.built_in) {
    if (candidate.state_root === undefined) return null;
    return builtInStateRoot(candidate.state_root);
  }
  if (candidate.state_root === undefined) return null;
  return configuration.state_roots[candidate.state_root];
}

let builtInStateBase = null;
const builtInStateRoots = new Map();

function builtInStateRoot(stateId) {
  if (builtInStateRoots.has(stateId)) return builtInStateRoots.get(stateId);
  if (builtInStateBase === null) {
    const temporaryRoot = fs.realpathSync.native(os.tmpdir());
    builtInStateBase = fs.mkdtempSync(path.join(temporaryRoot, "opencode-quality-toolchain-state-v2-"));
    assertNoAliasedComponents(builtInStateBase, "built-in trusted toolchain state root");
    if (comparablePath(fs.realpathSync.native(builtInStateBase)) !== comparablePath(builtInStateBase)) {
      throw new ContractError("QUALITY_TOOLCHAIN_STATE_UNAVAILABLE", "built-in trusted toolchain state root is aliased");
    }
  }
  const candidate = path.join(builtInStateBase, stateId);
  fs.mkdirSync(candidate, { recursive: false, mode: 0o700 });
  const canonical = fs.realpathSync.native(candidate);
  if (comparablePath(canonical) !== comparablePath(candidate) || !fs.statSync(canonical).isDirectory()) {
    throw new ContractError("QUALITY_TOOLCHAIN_STATE_UNAVAILABLE", "built-in trusted toolchain state root is invalid");
  }
  builtInStateRoots.set(stateId, canonical);
  return canonical;
}

function npmControlPlan(stateRoot) {
  const controlRoot = fs.mkdtempSync(path.join(stateRoot, ".opencode-npm-control-v2-"));
  const canonicalControlRoot = fs.realpathSync.native(controlRoot);
  if (!isInside(stateRoot, canonicalControlRoot)
    || comparablePath(canonicalControlRoot) !== comparablePath(controlRoot)
    || !fs.statSync(canonicalControlRoot).isDirectory()) {
    throw new ContractError("QUALITY_TOOLCHAIN_STATE_UNAVAILABLE", "trusted npm control root is invalid");
  }
  const createEmpty = (name, role) => {
    const candidate = path.join(canonicalControlRoot, name);
    const descriptor = fs.openSync(candidate, "wx", 0o600);
    try {
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    return {
      path: candidate,
      identity: identity(role, candidate, `trusted npm ${name}`),
    };
  };
  const user = createEmpty("user.npmrc", "npm_user_config");
  const global = createEmpty("global.npmrc", "npm_global_config");
  return {
    user_config_path: user.path,
    global_config_path: global.path,
    identities: [user.identity, global.identity],
  };
}

const MAX_IMPLICIT_CONFIGURATION_BYTES = 128 * 1024;
const MAX_PROJECT_CONFIGURATION_ANCESTORS = 32;

function createControlFile(controlRoot, name, role, contents) {
  const candidate = path.join(controlRoot, name);
  const descriptor = fs.openSync(candidate, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, contents, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  return Object.freeze({
    path: candidate,
    identity: identity(role, candidate, `trusted Maven ${name}`),
  });
}

function mavenControlPlan(stateRoot) {
  const controlRoot = fs.mkdtempSync(path.join(stateRoot, ".opencode-maven-control-v3-"));
  const canonicalControlRoot = fs.realpathSync.native(controlRoot);
  if (!isInside(stateRoot, canonicalControlRoot)
    || comparablePath(canonicalControlRoot) !== comparablePath(controlRoot)
    || !fs.statSync(canonicalControlRoot).isDirectory()) {
    throw new ContractError("QUALITY_TOOLCHAIN_STATE_UNAVAILABLE", "trusted Maven control root is invalid");
  }
  const settings = `<?xml version="1.0" encoding="UTF-8"?>\n<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"/>\n`;
  const toolchains = `<?xml version="1.0" encoding="UTF-8"?>\n<toolchains xmlns="http://maven.apache.org/TOOLCHAINS/1.1.0"/>\n`;
  const userSettings = createControlFile(canonicalControlRoot, "user-settings.xml", "maven_control_user_settings", settings);
  const globalSettings = createControlFile(canonicalControlRoot, "global-settings.xml", "maven_control_global_settings", settings);
  const userToolchains = createControlFile(canonicalControlRoot, "user-toolchains.xml", "maven_control_user_toolchains", toolchains);
  const globalToolchains = createControlFile(canonicalControlRoot, "global-toolchains.xml", "maven_control_global_toolchains", toolchains);
  return Object.freeze({
    user_settings_path: userSettings.path,
    global_settings_path: globalSettings.path,
    user_toolchains_path: userToolchains.path,
    global_toolchains_path: globalToolchains.path,
    identities: Object.freeze([
      userSettings.identity,
      globalSettings.identity,
      userToolchains.identity,
      globalToolchains.identity,
    ]),
  });
}

function pathExistsWithoutAliases(candidate, label) {
  const parsed = path.parse(candidate);
  const components = candidate.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const component of components) {
    current = path.join(current, component);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw new ContractError("QUALITY_TOOLCHAIN_CONFIGURATION", `${label} cannot be inspected`);
    }
    if (stat.isSymbolicLink()) {
      throw new ContractError("QUALITY_TOOLCHAIN_ALIAS", `${label} cannot traverse a symlink or junction`);
    }
  }
  return true;
}

function decodeBoundedUtf8(bytes, label) {
  if (bytes.length > MAX_IMPLICIT_CONFIGURATION_BYTES) {
    throw new ContractError("QUALITY_TOOLCHAIN_CONFIGURATION", `${label} exceeds its byte bound`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/u, "");
  } catch {
    throw new ContractError("QUALITY_TOOLCHAIN_CONFIGURATION", `${label} must be valid UTF-8`);
  }
}

function tokenizeMavenConfiguration(text) {
  const tokens = [];
  let token = "";
  let quote = null;
  let escaped = false;
  let comment = false;
  const flush = () => {
    if (token.length > 0) tokens.push(token);
    token = "";
  };
  for (const character of text) {
    if (comment) {
      if (character === "\n") comment = false;
      continue;
    }
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (character === quote) quote = null;
      else token += character;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "#" && token.length === 0) {
      comment = true;
      continue;
    }
    if (/\s/u.test(character)) flush();
    else token += character;
  }
  if (escaped || quote !== null) {
    throw new ContractError("QUALITY_TOOLCHAIN_CONFIGURATION", "Maven project configuration is malformed");
  }
  flush();
  return tokens;
}

function decodeJavaPropertyKey(value) {
  return value.replace(/\\u([0-9a-fA-F]{4})|\\(.)/gu, (_match, hex, escaped) => (
    hex === undefined ? escaped : String.fromCodePoint(Number.parseInt(hex, 16))
  ));
}

function gradlePropertyKeys(text) {
  const logical = text.replace(/\\\r?\n[\t\f ]*/gu, "");
  const keys = [];
  for (const line of logical.split(/\r?\n/u)) {
    const trimmed = line.trimStart();
    if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("!")) continue;
    let escaped = false;
    let end = trimmed.length;
    for (let index = 0; index < trimmed.length; index += 1) {
      const character = trimmed[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === "=" || character === ":" || /\s/u.test(character)) {
        end = index;
        break;
      }
    }
    keys.push(decodeJavaPropertyKey(trimmed.slice(0, end)).toLowerCase());
  }
  return keys;
}

function validateImplicitConfigurationContents(family, role, bytes) {
  const label = `trusted ${family} implicit configuration ${role}`;
  const text = decodeBoundedUtf8(bytes, label);
  if (family === "maven") {
    validateTrustedToolchainArguments("maven", tokenizeMavenConfiguration(text), label);
    return;
  }
  const keys = gradlePropertyKeys(text);
  if (keys.some((key) => GRADLE_RESOLVER_OWNED_PROPERTIES.has(key)
    || (key.startsWith("systemprop.") && GRADLE_RESOLVER_OWNED_PROPERTIES.has(key.slice("systemprop.".length))))) {
    throw new ContractError(
      "QUALITY_TOOLCHAIN_ARGUMENT",
      `${label} cannot override resolver-owned Gradle state or configuration`,
    );
  }
}

function implicitConfigurationBoundary(family, role, candidate, mustBeAbsent = false) {
  const label = `trusted ${family} implicit configuration ${role}`;
  if (!pathExistsWithoutAliases(candidate, label)) {
    return {
      boundary: Object.freeze({ role, path: candidate, state: "absent", identity_fingerprint: null }),
      identity: null,
    };
  }
  if (mustBeAbsent) {
    throw new ContractError(
      "QUALITY_TOOLCHAIN_CONFIGURATION",
      `${label} is an unsupported automatic code-loading surface`,
    );
  }
  const before = captureFileIdentity(candidate, label, { maxBytes: MAX_IMPLICIT_CONFIGURATION_BYTES });
  const bytes = fs.readFileSync(candidate);
  const after = captureFileIdentity(candidate, label, { maxBytes: MAX_IMPLICIT_CONFIGURATION_BYTES });
  if (!fingerprintsEqual(fingerprint(before), fingerprint(after)) || bytes.length !== Number(before.size)) {
    throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY_CHANGED", `${label} changed while it was validated`);
  }
  validateImplicitConfigurationContents(family, role, bytes);
  const boundIdentity = Object.freeze({ role, ...before });
  return {
    boundary: Object.freeze({
      role,
      path: candidate,
      state: "file",
      identity_fingerprint: fingerprint(boundIdentity),
    }),
    identity: boundIdentity,
  };
}

function projectConfigurationAncestors(workspaceRoot, projectRoot) {
  if (!isInside(workspaceRoot, projectRoot)) {
    throw new ContractError("QUALITY_TOOLCHAIN_PATH", "trusted toolchain project root escapes the workspace");
  }
  const ancestors = [];
  let current = projectRoot;
  while (true) {
    ancestors.push(current);
    if (comparablePath(current) === comparablePath(workspaceRoot)) break;
    if (ancestors.length >= MAX_PROJECT_CONFIGURATION_ANCESTORS) {
      throw new ContractError("QUALITY_TOOLCHAIN_SIZE", "trusted project configuration ancestry is too deep");
    }
    const parent = path.dirname(current);
    if (parent === current || !isInside(workspaceRoot, parent)) {
      throw new ContractError("QUALITY_TOOLCHAIN_PATH", "trusted project configuration ancestry is invalid");
    }
    current = parent;
  }
  return ancestors;
}

function implicitConfigurationSpecifications(family, workspaceRoot, projectRoot, stateRoot, distributionRoot) {
  if (family === "maven") {
    return [
      ["maven_project_config", path.join(projectRoot, ".mvn", "maven.config")],
      ["maven_project_extensions", path.join(projectRoot, ".mvn", "extensions.xml"), true],
      ["maven_project_system_properties", path.join(projectRoot, ".mvn", "maven-system.properties"), true],
      ["maven_project_user_properties", path.join(projectRoot, ".mvn", "maven-user.properties"), true],
      ["maven_user_settings", path.join(stateRoot, ".m2", "settings.xml"), true],
      ["maven_user_toolchains", path.join(stateRoot, ".m2", "toolchains.xml"), true],
      ["maven_user_extensions", path.join(stateRoot, ".m2", "extensions.xml"), true],
      ["maven_user_system_properties", path.join(stateRoot, ".m2", "maven-system.properties"), true],
      ["maven_user_properties", path.join(stateRoot, ".m2", "maven-user.properties"), true],
      ["maven_user_home_settings", path.join(stateRoot, "settings.xml"), true],
      ["maven_user_home_toolchains", path.join(stateRoot, "toolchains.xml"), true],
      ["maven_user_home_extensions", path.join(stateRoot, "extensions.xml"), true],
    ];
  }
  if (family === "gradle") {
    return [
      ...projectConfigurationAncestors(workspaceRoot, projectRoot).map((ancestor, index) => (
        [`gradle_project_properties_${index}`, path.join(ancestor, "gradle.properties")]
      )),
      ["gradle_user_properties", path.join(stateRoot, "gradle.properties")],
      ["gradle_user_init_script", path.join(stateRoot, "init.gradle"), true],
      ["gradle_user_init_script_kts", path.join(stateRoot, "init.gradle.kts"), true],
      ["gradle_user_init_directory", path.join(stateRoot, "init.d"), true],
      ["gradle_installation_properties", path.join(distributionRoot, "gradle.properties")],
    ];
  }
  return [];
}

function implicitConfigurationPlan(family, workspaceRoot, projectRoot, stateRoot, distributionRoot) {
  const specifications = implicitConfigurationSpecifications(
    family,
    workspaceRoot,
    projectRoot,
    stateRoot,
    distributionRoot,
  );
  const captured = specifications.map(([role, candidate, mustBeAbsent = false]) => (
    implicitConfigurationBoundary(family, role, candidate, mustBeAbsent)
  ));
  return Object.freeze({
    boundaries: Object.freeze(captured.map((entry) => entry.boundary)),
    identities: Object.freeze(captured.flatMap((entry) => entry.identity === null ? [] : [entry.identity])),
  });
}

function resolveCandidate(family, candidate, roots, workspaceRoot, projectRoot, configuration) {
  if (["node", "python", "go", "cargo"].includes(family)) {
    const direct = directPlan(candidate.executable_path, roots, workspaceRoot, `trusted ${family} executable`);
    return {
      strategy: "direct",
      ...direct,
      state_root: stateRootFor(candidate, configuration),
      java_home: null,
      distribution_root: null,
      distribution_identities: [],
      distribution_manifest_fingerprint: null,
      distribution_manifest_spec: null,
    };
  }
  if (family === "npm") {
    const node = directPlan(candidate.node_executable_path, roots, workspaceRoot, "trusted npm Node executable");
    const cliPath = assertTrustedComponentPath(candidate.npm_cli_path, roots, workspaceRoot, "trusted npm CLI");
    const cliIdentity = identity("launcher_0", cliPath, "trusted npm CLI");
    const stateRoot = stateRootFor(candidate, configuration);
    const controls = npmControlPlan(stateRoot);
    return {
      strategy: "npm_cli",
      executable_path: node.executable_path,
      argv_prefix: [...node.argv_prefix, cliPath],
      identities: [...node.identities, cliIdentity, ...controls.identities],
      path_entries: node.path_entries,
      state_root: stateRoot,
      npm_user_config_path: controls.user_config_path,
      npm_global_config_path: controls.global_config_path,
      java_home: null,
      distribution_root: null,
      distribution_identities: [],
      distribution_manifest_fingerprint: null,
      distribution_manifest_spec: null,
    };
  }
  if (family === "pytest") {
    const python = directPlan(candidate.python_executable_path, roots, workspaceRoot, "trusted pytest Python executable");
    return {
      strategy: "python_module",
      executable_path: python.executable_path,
      argv_prefix: [...python.argv_prefix, "-I", "-m", "pytest"],
      identities: python.identities,
      path_entries: python.path_entries,
      state_root: stateRootFor(candidate, configuration),
      java_home: null,
      distribution_root: null,
      distribution_identities: [],
      distribution_manifest_fingerprint: null,
      distribution_manifest_spec: null,
    };
  }
  if (family === "java") {
    const java = javaExecutable(candidate.java_home, roots, workspaceRoot, "trusted Java");
    return {
      strategy: "direct_java",
      executable_path: java.executable_path,
      argv_prefix: java.argv_prefix,
      identities: java.identities,
      path_entries: java.path_entries,
      state_root: null,
      java_home: java.home,
      distribution_root: null,
      distribution_identities: [],
      distribution_manifest_fingerprint: null,
      distribution_manifest_spec: null,
    };
  }
  if (family === "maven") {
    const java = javaExecutable(candidate.java_home, roots, workspaceRoot, "trusted Maven");
    const distributionRoot = canonicalTrustedDirectory(
      candidate.distribution_root,
      roots,
      workspaceRoot,
      "trusted Maven distribution",
    );
    const bootJar = selectExactFile(path.join(distributionRoot, "boot"), /^plexus-classworlds-[^/\\]+\.jar$/u,
      "Maven plexus-classworlds launcher");
    const m2Conf = path.join(distributionRoot, "bin", "m2.conf");
    const manifestSpec = { subdirectories: ["boot", "lib", "conf"], extra_files: ["bin/m2.conf"] };
    const manifest = distributionManifest(
      distributionRoot,
      manifestSpec.subdirectories,
      manifestSpec.extra_files,
      "Maven",
    );
    const stateRoot = stateRootFor(candidate, configuration);
    const controls = mavenControlPlan(stateRoot);
    const implicitConfiguration = implicitConfigurationPlan(
      "maven",
      workspaceRoot,
      projectRoot,
      stateRoot,
      distributionRoot,
    );
    return {
      strategy: "maven_java_v3",
      executable_path: java.executable_path,
      argv_prefix: [
        ...java.argv_prefix,
        `-Duser.home=${stateRoot}`,
        `-Dclassworlds.conf=${m2Conf}`,
        `-Dmaven.home=${distributionRoot}`,
        `-Dmaven.multiModuleProjectDirectory=${projectRoot}`,
        `-Dmaven.repo.local=${path.join(stateRoot, "repository")}`,
        "-classpath",
        bootJar,
        "org.codehaus.plexus.classworlds.launcher.Launcher",
        "--settings",
        controls.user_settings_path,
        "--global-settings",
        controls.global_settings_path,
        "--toolchains",
        controls.user_toolchains_path,
        "--global-toolchains",
        controls.global_toolchains_path,
      ],
      identities: [
        ...java.identities,
        ...manifest.identities,
        ...controls.identities,
        ...implicitConfiguration.identities,
      ],
      path_entries: java.path_entries,
      state_root: stateRoot,
      java_home: java.home,
      distribution_root: distributionRoot,
      distribution_identities: manifest.roles,
      distribution_manifest_fingerprint: manifest.fingerprint,
      distribution_manifest_spec: manifestSpec,
      implicit_configuration: implicitConfiguration.boundaries,
    };
  }
  if (family === "gradle") {
    const java = javaExecutable(candidate.java_home, roots, workspaceRoot, "trusted Gradle");
    const distributionRoot = canonicalTrustedDirectory(
      candidate.distribution_root,
      roots,
      workspaceRoot,
      "trusted Gradle distribution",
    );
    const launcher = selectExactFile(path.join(distributionRoot, "lib"), /^gradle-launcher-[^/\\]+\.jar$/u,
      "Gradle launcher");
    const manifestSpec = { subdirectories: ["lib", "init.d"], extra_files: [] };
    const manifest = distributionManifest(
      distributionRoot,
      manifestSpec.subdirectories,
      manifestSpec.extra_files,
      "Gradle",
    );
    const agent = candidate.layout === "instrumented_launcher"
      ? selectExactFile(path.join(distributionRoot, "lib", "agents"),
        /^gradle-instrumentation-agent-[^/\\]+\.jar$/u, "Gradle instrumentation agent")
      : null;
    const stateRoot = stateRootFor(candidate, configuration);
    const projectCacheRoot = path.join(stateRoot, "project-cache");
    const implicitConfiguration = implicitConfigurationPlan(
      "gradle",
      workspaceRoot,
      projectRoot,
      stateRoot,
      distributionRoot,
    );
    return {
      strategy: `gradle_java_${candidate.layout}`,
      executable_path: java.executable_path,
      argv_prefix: [
        ...java.argv_prefix,
        ...(agent === null ? [] : [`-javaagent:${agent}`]),
        "-classpath",
        launcher,
        "org.gradle.launcher.GradleMain",
        "--gradle-user-home",
        stateRoot,
        "--project-cache-dir",
        projectCacheRoot,
        `-Dorg.gradle.java.home=${java.home}`,
        `-Dgradle.user.home=${stateRoot}`,
        `-Dorg.gradle.projectcachedir=${projectCacheRoot}`,
        "-Dorg.gradle.daemon=false",
        "--project-dir",
        projectRoot,
        "--no-daemon",
      ],
      identities: [...java.identities, ...manifest.identities, ...implicitConfiguration.identities],
      path_entries: java.path_entries,
      state_root: stateRoot,
      java_home: java.home,
      distribution_root: distributionRoot,
      distribution_identities: manifest.roles,
      distribution_manifest_fingerprint: manifest.fingerprint,
      distribution_manifest_spec: manifestSpec,
      implicit_configuration: implicitConfiguration.boundaries,
    };
  }
  throw new ContractError("QUALITY_TOOLCHAIN_RESOLVER", `unsupported trusted toolchain family ${family}`);
}

function environmentProfile(family, plan, git, npmScriptShell) {
  const stateRoot = plan.state_root;
  const variables = {};
  const removed = new Set(["ENV", "BASH_ENV", "CDPATH", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_DIR", "GIT_WORK_TREE"]);
  if (family === "npm") {
    Object.assign(variables, {
      HOME: stateRoot,
      NPM_CONFIG_AUDIT: "false",
      NPM_CONFIG_CACHE: path.join(stateRoot, "cache"),
      NPM_CONFIG_FUND: "false",
      NPM_CONFIG_GLOBALCONFIG: plan.npm_global_config_path,
      ...(npmScriptShell === null ? {} : { NPM_CONFIG_SCRIPT_SHELL: npmScriptShell.executable_path }),
      NPM_CONFIG_UPDATE_NOTIFIER: "false",
      NPM_CONFIG_USERCONFIG: plan.npm_user_config_path,
    });
    ["NODE_OPTIONS", "NODE_PATH", "NPM_CONFIG_PREFIX"].forEach((entry) => removed.add(entry));
  } else if (["python", "pytest"].includes(family)) {
    Object.assign(variables, {
      PYTHONDONTWRITEBYTECODE: "1",
      PYTHONNOUSERSITE: "1",
      PYTHONSAFEPATH: "1",
      PYTHONUTF8: "1",
    });
    removed.add("PYTHONHOME");
    removed.add("PYTHONPATH");
    if (family === "pytest") variables.PYTEST_DISABLE_PLUGIN_AUTOLOAD = "1";
  } else if (family === "go") {
    Object.assign(variables, {
      GOCACHE: path.join(stateRoot, "build-cache"),
      GOENV: "off",
      GOMODCACHE: path.join(stateRoot, "module-cache"),
      GOPATH: path.join(stateRoot, "gopath"),
      GOTOOLCHAIN: "local",
    });
    ["GOFLAGS", "GONOSUMDB", "GONOPROXY", "GOPRIVATE"].forEach((entry) => removed.add(entry));
  } else if (family === "cargo") {
    variables.CARGO_HOME = stateRoot;
    ["CARGO_ENCODED_RUSTFLAGS", "CARGO_TARGET_DIR", "RUSTC_WRAPPER", "RUSTFLAGS", "RUSTUP_HOME", "RUSTUP_TOOLCHAIN"]
      .forEach((entry) => removed.add(entry));
  } else if (["java", "maven", "gradle"].includes(family)) {
    variables.JAVA_HOME = plan.java_home;
    ["CLASSPATH", "JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "_JAVA_OPTIONS"].forEach((entry) => removed.add(entry));
    if (family === "maven") {
      Object.assign(variables, { HOME: stateRoot, MAVEN_SKIP_RC: "true", MAVEN_USER_HOME: stateRoot });
      removed.add("MAVEN_ARGS");
      removed.add("MAVEN_OPTS");
    }
    if (family === "gradle") {
      variables.GRADLE_USER_HOME = stateRoot;
      removed.add("GRADLE_OPTS");
    }
  } else if (family === "node") {
    removed.add("NODE_OPTIONS");
    removed.add("NODE_PATH");
  }
  const pathEntries = uniquePaths([
    ...plan.path_entries,
    ...(git === null ? [] : [git.directory]),
    ...(npmScriptShell === null ? [] : [npmScriptShell.directory]),
  ]);
  const body = {
    schema_version: 1,
    profile_id: `trusted-${family}-environment-v2`,
    variables: Object.fromEntries(Object.entries(variables).sort(([left], [right]) => left.localeCompare(right))),
    removed_variables: [...removed].sort(),
    path_entries: pathEntries,
    state_root: stateRoot,
  };
  return freezeTransient({ ...body, fingerprint: fingerprint(body) });
}

function resolveGit(configuration, roots, workspaceRoot) {
  const configured = configuration?.auxiliary?.git ?? null;
  if (configured === null) return null;
  const plan = directPlan(configured.executable_path, roots, workspaceRoot, "trusted auxiliary Git", {
    rolePrefix: "auxiliary_git_",
  });
  const identityFingerprint = fingerprint(plan.identities);
  return {
    executable_path: plan.executable_path,
    argv_prefix: plan.argv_prefix,
    identities: plan.identities,
    identity_fingerprint: identityFingerprint,
    directory: path.dirname(plan.executable_path),
  };
}

function fixedGitCandidates() {
  if (process.platform === "win32") {
    return [
      "C:\\Program Files\\Git\\bin\\git.exe",
      "C:\\Program Files\\Git\\cmd\\git.exe",
      "C:\\Program Files (x86)\\Git\\bin\\git.exe",
      "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
    ];
  }
  if (process.platform === "darwin") {
    return [TRUSTED_MACOS_FIXED_GIT_PATH];
  }
  return ["/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git"];
}

export function writableByCurrentPrincipal(candidate, label, accessSync = fs.accessSync) {
  try {
    accessSync(candidate, fs.constants.W_OK);
    return true;
  } catch (error) {
    if (["EACCES", "EPERM", "EROFS"].includes(error?.code)) return false;
    throw new ContractError("QUALITY_TOOLCHAIN_PATH", `${label} effective permissions cannot be inspected`);
  }
}

const PROTECTED_MACOS_FIXED_EXECUTABLE_IO = Object.freeze({
  platform: process.platform,
  realpathSync: fs.realpathSync.native,
  lstatSync: (candidate) => fs.lstatSync(candidate, { bigint: true }),
  writable: writableByCurrentPrincipal,
});

export function assertProtectedMacosFixedExecutable(
  candidate,
  label,
  operations = PROTECTED_MACOS_FIXED_EXECUTABLE_IO,
) {
  if (operations?.platform !== "darwin") return;
  if (typeof operations.realpathSync !== "function" || typeof operations.lstatSync !== "function"
    || typeof operations.writable !== "function") {
    throw new TypeError("protected macOS fixed executable operations are invalid");
  }
  const absolute = safeAbsolutePath(candidate, label);
  const parsed = path.parse(absolute);
  const remainder = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let inspected = parsed.root;
  for (const component of remainder) {
    inspected = path.join(inspected, component);
    if (operations.lstatSync(inspected).isSymbolicLink()) {
      throw new ContractError("QUALITY_TOOLCHAIN_ALIAS", `${label} cannot traverse a symlink or junction`);
    }
  }
  if (operations.realpathSync(absolute) !== absolute) {
    throw new ContractError("QUALITY_TOOLCHAIN_ALIAS", `${label} must use a canonical non-aliased path`);
  }
  let current = absolute;
  let leaf = true;
  while (true) {
    const stat = operations.lstatSync(current);
    if (stat.uid !== 0n
      || (leaf
        ? (!stat.isFile() || stat.nlink !== 1n || (stat.mode & 0o7777n) !== 0o555n)
        : (!stat.isDirectory() || (stat.mode & 0o022n) !== 0n))
      || operations.writable(current, `${label} protected path component`)) {
      throw new ContractError(
        "QUALITY_TOOLCHAIN_UNTRUSTED_ROOT",
        `${label} must be root-owned and protected from the workload principal through its complete ancestry`,
      );
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
    leaf = false;
  }
}

function resolveFixedGit(workspaceRoot) {
  for (const candidate of fixedGitCandidates()) {
    try {
      assertProtectedMacosFixedExecutable(candidate, "trusted fixed auxiliary Git");
      const candidateRoot = process.platform === "win32"
        ? path.resolve(path.dirname(candidate), "..")
        : path.dirname(candidate);
      const canonicalRoot = fs.realpathSync.native(candidateRoot);
      const plan = directPlan(candidate, [canonicalRoot], workspaceRoot, "trusted fixed auxiliary Git", {
        rolePrefix: "auxiliary_git_",
      });
      return {
        executable_path: plan.executable_path,
        argv_prefix: plan.argv_prefix,
        identities: plan.identities,
        identity_fingerprint: fingerprint(plan.identities),
        directory: path.dirname(plan.executable_path),
      };
    } catch (error) {
      const missing = error?.code === "ENOENT"
        || (error instanceof ContractError && error.code === "QUALITY_TOOLCHAIN_UNAVAILABLE");
      const skippableHardlink = process.platform !== "darwin"
        && error instanceof ContractError
        && error.code === "QUALITY_TOOLCHAIN_HARDLINK";
      if (missing || skippableHardlink) continue;
      throw error;
    }
  }
  throw new ContractError("QUALITY_TOOLCHAIN_UNAVAILABLE", "no fixed identity-bound Git executable is available");
}

function resolveFixedNpmScriptShell(workspaceRoot) {
  if (process.platform !== "darwin") return null;
  try {
    assertProtectedMacosFixedExecutable(TRUSTED_MACOS_NPM_SCRIPT_SHELL_PATH, "trusted fixed npm script shell");
    const candidateRoot = fs.realpathSync.native(path.dirname(TRUSTED_MACOS_NPM_SCRIPT_SHELL_PATH));
    const plan = directPlan(
      TRUSTED_MACOS_NPM_SCRIPT_SHELL_PATH,
      [candidateRoot],
      workspaceRoot,
      "trusted fixed npm script shell",
      { rolePrefix: "npm_script_shell_" },
    );
    if (plan.argv_prefix.length !== 0) {
      throw new ContractError(
        "QUALITY_TOOLCHAIN_LAUNCHER_UNSAFE",
        "trusted fixed npm script shell must be a direct executable",
      );
    }
    return {
      executable_path: plan.executable_path,
      identities: plan.identities,
      identity_fingerprint: fingerprint(plan.identities),
      directory: path.dirname(plan.executable_path),
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new ContractError("QUALITY_TOOLCHAIN_UNAVAILABLE", "trusted fixed npm script shell is unavailable");
    }
    throw error;
  }
}

function validatedLease(hostConfigurationLease, family, hostConfiguration) {
  if (hostConfiguration !== undefined && hostConfiguration !== null
    && (typeof hostConfiguration !== "object" || Object.keys(hostConfiguration).length > 0)) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_REQUIRED", "raw host configuration objects are not trusted leases");
  }
  if (hostConfigurationLease === null || hostConfigurationLease === undefined) {
    if (!["node", "npm"].includes(family)) {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_REQUIRED", `trusted ${family} requires explicit host configuration`);
    }
    return {
      source_kind: "built_in",
      source_path: null,
      source_identity: null,
      content_fingerprint: BUILT_IN_HOST_CONFIGURATION_CONTENT_FINGERPRINT,
      configuration_fingerprint: BUILT_IN_HOST_CONFIGURATION_NORMALIZED_FINGERPRINT,
      effective_fingerprint: BUILT_IN_HOST_CONFIGURATION_FINGERPRINT,
      resolution_policy_version: TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION,
      configuration: null,
    };
  }
  return assertTrustedToolchainHostConfigurationLeaseCurrent(hostConfigurationLease);
}

export function validateTrustedToolchainMap(value) {
  assertPlain(value, "trusted toolchain map");
  exact(value, ["schema_version", "map_id", "toolchains"], ["schema_version", "map_id", "toolchains"], "trusted toolchain map");
  if (value.schema_version !== TRUSTED_TOOLCHAIN_MAP_SCHEMA_VERSION) {
    throw new ContractError("QUALITY_TOOLCHAIN_MAP_VERSION", "trusted toolchain map schema_version is unsupported");
  }
  assertString(value.map_id, "trusted toolchain map.map_id", { maxBytes: 128 });
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.map_id)) {
    throw new ContractError("QUALITY_TOOLCHAIN_MAP_ID", "trusted toolchain map.map_id is invalid");
  }
  assertArray(value.toolchains, "trusted toolchain map.toolchains", {
    min: 1,
    max: TRUSTED_TOOLCHAIN_LIMITS.max_toolchains,
  });
  const toolchains = value.toolchains.map((entry, index) => {
    const label = `trusted toolchain map.toolchains[${index}]`;
    assertPlain(entry, label);
    exact(entry, ["executable_id", "resolver"], ["executable_id", "resolver"], label);
    const executableId = assertLogicalId(entry.executable_id, `${label}.executable_id`);
    if (!TRUSTED_TOOLCHAIN_RESOLVERS.includes(entry.resolver)) {
      throw new ContractError("QUALITY_TOOLCHAIN_RESOLVER", `${label}.resolver is unsupported`);
    }
    return { executable_id: executableId, resolver: entry.resolver };
  });
  if (new Set(toolchains.map((entry) => entry.executable_id)).size !== toolchains.length) {
    throw new ContractError("QUALITY_TOOLCHAIN_DUPLICATE", "trusted toolchain executable IDs must be unique");
  }
  return deepFrozenClone({
    schema_version: TRUSTED_TOOLCHAIN_MAP_SCHEMA_VERSION,
    map_id: value.map_id,
    toolchains,
  }, "validated trusted toolchain map");
}

export function parseTrustedToolchainMap(serialized) {
  if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > TRUSTED_TOOLCHAIN_LIMITS.max_map_bytes) {
    throw new ContractError("QUALITY_TOOLCHAIN_MAP_SIZE", "trusted toolchain map must be bounded UTF-8 JSON");
  }
  let value;
  try {
    value = JSON.parse(serialized.replace(/^\uFEFF/u, ""));
  } catch {
    throw new ContractError("QUALITY_TOOLCHAIN_MAP_JSON", "trusted toolchain map must contain valid JSON");
  }
  return validateTrustedToolchainMap(value);
}

export function trustedToolchainMapFingerprint(map) {
  return fingerprint(validateTrustedToolchainMap(map));
}

const MAVEN_RESOLVER_OWNED_PROPERTIES = Object.freeze(new Set([
  "classworlds.conf",
  "maven.ext.class.path",
  "maven.home",
  "maven.installation.conf",
  "maven.installation.extensions",
  "maven.installation.settings",
  "maven.installation.toolchains",
  "maven.multimoduleprojectdirectory",
  "maven.project.conf",
  "maven.project.extensions",
  "maven.project.settings",
  "maven.repo.local",
  "maven.repo.local.head",
  "maven.repo.local.tail",
  "maven.settings.security",
  "maven.user.conf",
  "maven.user.extensions",
  "maven.user.settings",
  "maven.user.toolchains",
  "user.home",
]));

const GRADLE_RESOLVER_OWNED_PROPERTIES = Object.freeze(new Set([
  "gradle.user.home",
  "org.gradle.daemon",
  "org.gradle.java.home",
  "org.gradle.jvmargs",
  "org.gradle.projectcachedir",
]));

const MAVEN_RESOLVER_OWNED_OPTIONS = Object.freeze([
  "-f",
  "--file",
  "-s",
  "--settings",
  "-gs",
  "--global-settings",
  "-t",
  "--toolchains",
  "-gt",
  "--global-toolchains",
]);

const NPM_RESOLVER_OWNED_OPTIONS = Object.freeze([
  "--cache",
  "--globalconfig",
  "--prefix",
  "--script-shell",
  "--scriptshell",
  "--userconfig",
]);

const GRADLE_RESOLVER_OWNED_OPTIONS = Object.freeze([
  "-g",
  "--gradle-user-home",
  "--project-cache-dir",
  "-I",
  "--init-script",
  "-c",
  "--settings-file",
  "-p",
  "--project-dir",
  "-b",
  "--build-file",
  "--include-build",
]);

const RESOLVER_OPTION_EXACT_EXCEPTIONS = Object.freeze(new Set([
  "-fae",
  "-ff",
  "-fn",
]));

function optionIsPresent(argv, options) {
  return argv.some((argument) => options.some((option) => (
    argument === option
    || argument.startsWith(`${option}=`)
    || (!option.startsWith("--")
      && argument.startsWith(option)
      && argument.length > option.length
      && !RESOLVER_OPTION_EXACT_EXCEPTIONS.has(argument))
  )));
}

function definedSystemPropertyKeys(argv, { longOption }) {
  const keys = [];
  const record = (definition) => {
    if (typeof definition !== "string" || definition.length === 0) return;
    keys.push(definition.split("=", 1)[0].toLowerCase());
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "-D" || argument === longOption) {
      record(argv[index + 1]);
    } else if (argument.startsWith("-D") && argument.length > 2) {
      record(argument.slice(2));
    } else if (argument.startsWith(`${longOption}=`)) {
      record(argument.slice(longOption.length + 1));
    }
  }
  return keys;
}

function overridesResolverOwnedProperty(argv, family) {
  const blocked = family === "maven" ? MAVEN_RESOLVER_OWNED_PROPERTIES : GRADLE_RESOLVER_OWNED_PROPERTIES;
  const longOption = family === "maven" ? "--define" : "--system-prop";
  return definedSystemPropertyKeys(argv, { longOption }).some((key) => blocked.has(key));
}

export function validateTrustedToolchainArguments(family, argv, label = "trusted toolchain argv") {
  if (!TRUSTED_TOOLCHAIN_RESOLVERS.includes(family)) {
    throw new ContractError("QUALITY_TOOLCHAIN_RESOLVER", `${label} family is unsupported`);
  }
  assertArray(argv, label, { max: TRUSTED_TOOLCHAIN_LIMITS.max_arguments });
  argv.forEach((entry, index) => validateArgument(entry, `${label}[${index}]`));
  const lowered = argv.map((entry) => entry.toLowerCase());
  if (["java", "maven", "gradle"].includes(family) && argv.some((entry) => entry.startsWith("@"))) {
    throw new ContractError("QUALITY_TOOLCHAIN_ARGUMENT", `${label} cannot use Java argument files`);
  }
  if (family === "node" && lowered.some((entry) => ["-e", "--eval", "-p", "--print"].some(
    (flag) => entry === flag || entry.startsWith(`${flag}=`) || (flag.length === 2 && entry.startsWith(flag)),
  ))) {
    throw new ContractError("QUALITY_TOOLCHAIN_ARGUMENT", `${label} cannot supply source text to Node`);
  }
  if (family === "python" && lowered.some((entry) => entry === "-c" || entry.startsWith("-c"))) {
    throw new ContractError("QUALITY_TOOLCHAIN_ARGUMENT", `${label} cannot supply source text to Python`);
  }
  if (family === "npm") {
    if (!["run", "test"].includes(lowered[0])) {
      throw new ContractError("QUALITY_TOOLCHAIN_ARGUMENT", `${label} npm invocation must use a project-owned run or test script`);
    }
    const separator = lowered.indexOf("--");
    const npmOptions = lowered
      .slice(0, separator < 0 ? lowered.length : separator)
      .map((entry) => entry.replaceAll("_", "-"));
    if (optionIsPresent(npmOptions, NPM_RESOLVER_OWNED_OPTIONS)) {
      throw new ContractError("QUALITY_TOOLCHAIN_ARGUMENT", `${label} cannot override resolver-owned npm controls`);
    }
  }
  if (family === "maven" && (
    optionIsPresent(argv, MAVEN_RESOLVER_OWNED_OPTIONS)
    || overridesResolverOwnedProperty(argv, family)
  )) {
    throw new ContractError("QUALITY_TOOLCHAIN_ARGUMENT", `${label} cannot override resolver-owned Maven state or configuration`);
  }
  if (family === "gradle" && (
    optionIsPresent(argv, GRADLE_RESOLVER_OWNED_OPTIONS)
    || overridesResolverOwnedProperty(argv, family)
    || lowered.some((entry) => entry === "--daemon" || entry === "--no-daemon")
  )) {
    throw new ContractError("QUALITY_TOOLCHAIN_ARGUMENT", `${label} cannot override resolver-owned Gradle state or configuration`);
  }
  return argv;
}

export function resolveTrustedToolchainInvocation({
  toolchainMap,
  executableId,
  argv = [],
  workspaceRoot,
  projectRoot = workspaceRoot,
  hostConfigurationLease = null,
  hostConfiguration = undefined,
}) {
  const map = validateTrustedToolchainMap(toolchainMap);
  const id = assertLogicalId(executableId, "trusted toolchain executableId");
  const mapping = map.toolchains.find((entry) => entry.executable_id === id);
  if (!mapping) throw new ContractError("QUALITY_TOOLCHAIN_UNKNOWN", `trusted toolchain map has no executable ID ${id}`);
  validateTrustedToolchainArguments(mapping.resolver, argv);
  const root = fs.realpathSync.native(path.resolve(workspaceRoot));
  const requestedProjectRoot = path.resolve(projectRoot);
  let project;
  try {
    project = fs.realpathSync.native(requestedProjectRoot);
  } catch {
    throw new ContractError("QUALITY_TOOLCHAIN_PATH", "trusted toolchain project root is unavailable");
  }
  if (comparablePath(project) !== comparablePath(requestedProjectRoot) || !isInside(root, project)) {
    throw new ContractError("QUALITY_TOOLCHAIN_PATH", "trusted toolchain project root must be canonical and workspace-contained");
  }
  const lease = validatedLease(hostConfigurationLease, mapping.resolver, hostConfiguration);
  const configuration = lease.configuration;
  const configuredCandidates = configuration?.candidates?.[mapping.resolver] ?? [];
  const candidates = [
    ...configuredCandidates,
    ...(["node", "npm"].includes(mapping.resolver) ? builtInCandidates(mapping.resolver) : []),
  ];
  if (candidates.length === 0) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_REQUIRED", `trusted ${mapping.resolver} has no explicit host candidate`);
  }
  const configuredRoots = configuration?.trusted_roots ?? [];
  const git = configuration === null ? resolveFixedGit(root) : resolveGit(configuration, configuredRoots, root);
  if (git === null) {
    throw new ContractError("QUALITY_TOOLCHAIN_UNAVAILABLE", "explicit host configuration must identity-bind auxiliary Git");
  }
  const npmScriptShell = mapping.resolver === "npm" ? resolveFixedNpmScriptShell(root) : null;
  const managedWorker = managedWorkerNodePlan(configuration, configuredRoots, root, project);
  for (const candidate of candidates) {
    const roots = candidate.built_in
      ? trustedBuiltInCandidateRoots(mapping.resolver, candidate)
      : configuredRoots;
    const stateBoundaryRoots = uniquePaths([...configuredRoots, ...roots]);
    try {
      const plan = resolveCandidate(
        mapping.resolver,
        candidate,
        roots,
        root,
        project,
        configuration ?? { state_roots: {} },
      );
      const identities = [
        ...plan.identities,
        ...(git?.identities ?? []),
        ...(npmScriptShell?.identities ?? []),
        ...managedWorker.identities,
      ];
      if (identities.length > TRUSTED_TOOLCHAIN_LIMITS.max_runtime_identities) {
        throw new ContractError("QUALITY_TOOLCHAIN_SIZE", "trusted toolchain runtime identity set is oversized");
      }
      const identityFingerprint = fingerprint(identities);
      const environment = environmentProfile(mapping.resolver, plan, git, npmScriptShell);
      const stateRootBoundary = captureStateRootBoundary(plan.state_root, root, stateBoundaryRoots);
      const runtimeMetadata = {
        shell: false,
        strategy: plan.strategy,
        project_root: project,
        state_root: plan.state_root,
        state_root_boundary: stateRootBoundary,
        java_home: plan.java_home,
        distribution_root: plan.distribution_root,
        distribution_identity_roles: plan.distribution_identities,
        distribution_manifest_fingerprint: plan.distribution_manifest_fingerprint,
        distribution_manifest_spec: plan.distribution_manifest_spec,
        implicit_configuration: plan.implicit_configuration ?? [],
        managed_worker_executable_path: managedWorker.executable_path,
        managed_worker_identity_fingerprint: managedWorker.identity_fingerprint,
        git: git === null ? null : {
          executable_path: git.executable_path,
          argv_prefix: git.argv_prefix,
          directory: git.directory,
          identity_fingerprint: git.identity_fingerprint,
        },
        npm_script_shell: npmScriptShell === null ? null : {
          executable_path: npmScriptShell.executable_path,
          directory: npmScriptShell.directory,
          identity_fingerprint: npmScriptShell.identity_fingerprint,
        },
      };
      const runtimeMetadataFingerprint = fingerprint(runtimeMetadata);
      return freezeTransient({
        executable_id: id,
        resolver: mapping.resolver,
        strategy: plan.strategy,
        executable_path: plan.executable_path,
        argv_prefix: [...plan.argv_prefix],
        identities,
        identity_fingerprint: identityFingerprint,
        map_fingerprint: trustedToolchainMapFingerprint(map),
        toolchain_host_configuration_source_kind: lease.source_kind,
        toolchain_host_configuration_source_path: lease.source_path,
        toolchain_host_configuration_content_fingerprint: lease.content_fingerprint,
        toolchain_host_configuration_normalized_fingerprint: lease.configuration_fingerprint,
        toolchain_host_configuration_fingerprint: lease.effective_fingerprint,
        toolchain_host_configuration_source_identity: lease.source_identity,
        toolchain_resolution_policy_version: TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION,
        environment_profile: environment,
        environment_fingerprint: environment.fingerprint,
        runtime_metadata: runtimeMetadata,
        runtime_metadata_fingerprint: runtimeMetadataFingerprint,
        managed_worker_executable_path: managedWorker.executable_path,
        managed_worker_identity_fingerprint: managedWorker.identity_fingerprint,
      });
    } catch (error) {
      if (error instanceof ContractError && error.code === "QUALITY_TOOLCHAIN_UNAVAILABLE") continue;
      throw error;
    }
  }
  throw new ContractError("QUALITY_TOOLCHAIN_UNAVAILABLE", `no trusted ${mapping.resolver} installation is available`);
}

export const resolveTrustedToolchain = resolveTrustedToolchainInvocation;

function assertIdentityShape(identityValue, label) {
  assertPlain(identityValue, label);
  exact(identityValue, [
    "role", "canonical_path", "device", "inode", "size", "mode", "modified_ns", "changed_ns", "content_fingerprint",
  ], [
    "role", "canonical_path", "device", "inode", "size", "mode", "modified_ns", "changed_ns", "content_fingerprint",
  ], label);
  assertString(identityValue.role, `${label}.role`, { maxBytes: 128 });
  safeAbsolutePath(identityValue.canonical_path, `${label}.canonical_path`);
  for (const key of ["device", "inode", "size", "mode", "modified_ns", "changed_ns"]) {
    if (typeof identityValue[key] !== "string" || !/^\d+$/u.test(identityValue[key])) {
      throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY", `${label}.${key} must be a decimal string`);
    }
  }
  assertFingerprint(identityValue.content_fingerprint, `${label}.content_fingerprint`);
}

function executableIdentityRole(role) {
  return role === "executable" || role === "interpreter" || role === "auxiliary_git_executable"
    || role === "auxiliary_git_interpreter" || role === "managed_worker_executable"
    || role === "managed_worker_interpreter" || role === "npm_script_shell_executable"
    || role === "npm_script_shell_interpreter";
}

const ENVIRONMENT_VARIABLE_KEYS = Object.freeze({
  node: [],
  npm: [
    "HOME", "NPM_CONFIG_AUDIT", "NPM_CONFIG_CACHE", "NPM_CONFIG_FUND", "NPM_CONFIG_GLOBALCONFIG",
    "NPM_CONFIG_UPDATE_NOTIFIER", "NPM_CONFIG_USERCONFIG",
  ],
  python: ["PYTHONDONTWRITEBYTECODE", "PYTHONNOUSERSITE", "PYTHONSAFEPATH", "PYTHONUTF8"],
  pytest: ["PYTEST_DISABLE_PLUGIN_AUTOLOAD", "PYTHONDONTWRITEBYTECODE", "PYTHONNOUSERSITE", "PYTHONSAFEPATH", "PYTHONUTF8"],
  go: ["GOCACHE", "GOENV", "GOMODCACHE", "GOPATH", "GOTOOLCHAIN"],
  cargo: ["CARGO_HOME"],
  java: ["JAVA_HOME"],
  maven: ["HOME", "JAVA_HOME", "MAVEN_SKIP_RC", "MAVEN_USER_HOME"],
  gradle: ["GRADLE_USER_HOME", "JAVA_HOME"],
});

function assertRuntimeMetadata(invocation) {
  const metadata = invocation.runtime_metadata;
  assertPlain(metadata, "trusted toolchain invocation.runtime_metadata");
  exact(metadata, [
    "shell", "strategy", "project_root", "state_root", "state_root_boundary", "java_home", "distribution_root", "distribution_identity_roles",
    "distribution_manifest_fingerprint", "distribution_manifest_spec", "implicit_configuration",
    "managed_worker_executable_path", "managed_worker_identity_fingerprint", "git", "npm_script_shell",
  ], [
    "shell", "strategy", "project_root", "state_root", "state_root_boundary", "java_home", "distribution_root", "distribution_identity_roles",
    "distribution_manifest_fingerprint", "distribution_manifest_spec", "implicit_configuration",
    "managed_worker_executable_path", "managed_worker_identity_fingerprint", "git", "npm_script_shell",
  ], "trusted toolchain invocation.runtime_metadata");
  if (metadata.shell !== false || metadata.strategy !== invocation.strategy) {
    throw new ContractError("QUALITY_TOOLCHAIN_LAUNCHER_UNSAFE", "trusted toolchain invocation must use its resolver-owned shell:false strategy");
  }
  safeAbsolutePath(metadata.project_root, "trusted toolchain invocation.runtime_metadata.project_root");
  safeAbsolutePath(
    metadata.managed_worker_executable_path,
    "trusted toolchain invocation.runtime_metadata.managed_worker_executable_path",
  );
  assertFingerprint(
    metadata.managed_worker_identity_fingerprint,
    "trusted toolchain invocation.runtime_metadata.managed_worker_identity_fingerprint",
  );
  for (const [key, value] of [["state_root", metadata.state_root], ["java_home", metadata.java_home],
    ["distribution_root", metadata.distribution_root]]) {
    if (value !== null) safeAbsolutePath(value, `trusted toolchain invocation.runtime_metadata.${key}`);
  }
  if (metadata.state_root === null) {
    if (metadata.state_root_boundary !== null) {
      throw new ContractError("QUALITY_TOOLCHAIN_STATE_CHANGED", "stateless toolchain cannot carry a state-root boundary");
    }
  } else {
    const boundary = metadata.state_root_boundary;
    assertPlain(boundary, "trusted toolchain invocation.runtime_metadata.state_root_boundary");
    exact(boundary, [
      "schema_version", "canonical_path", "device", "inode", "mode", "workspace_root", "trusted_roots", "fingerprint",
    ], [
      "schema_version", "canonical_path", "device", "inode", "mode", "workspace_root", "trusted_roots", "fingerprint",
    ], "trusted toolchain invocation.runtime_metadata.state_root_boundary");
    if (boundary.schema_version !== 1 || boundary.canonical_path !== metadata.state_root) {
      throw new ContractError("QUALITY_TOOLCHAIN_STATE_CHANGED", "trusted state-root boundary identity is inconsistent");
    }
    for (const key of ["device", "inode", "mode"]) {
      if (typeof boundary[key] !== "string" || !/^\d+$/u.test(boundary[key])) {
        throw new ContractError("QUALITY_TOOLCHAIN_STATE_CHANGED", `trusted state-root boundary ${key} is invalid`);
      }
    }
    safeAbsolutePath(boundary.workspace_root, "trusted state-root boundary workspace_root");
    assertArray(boundary.trusted_roots, "trusted state-root boundary trusted_roots", {
      max: TRUSTED_TOOLCHAIN_LIMITS.max_state_boundary_roots,
    });
    boundary.trusted_roots.forEach((entry, index) => safeAbsolutePath(
      entry,
      `trusted state-root boundary trusted_roots[${index}]`,
    ));
    if (new Set(boundary.trusted_roots.map(comparablePath)).size !== boundary.trusted_roots.length) {
      throw new ContractError("QUALITY_TOOLCHAIN_STATE_CHANGED", "trusted state-root boundary roots must be unique");
    }
    assertFingerprint(boundary.fingerprint, "trusted state-root boundary fingerprint");
    const body = { ...boundary };
    delete body.fingerprint;
    if (!fingerprintsEqual(boundary.fingerprint, fingerprint(body))) {
      throw new ContractError("QUALITY_TOOLCHAIN_STATE_CHANGED", "trusted state-root boundary fingerprint is invalid");
    }
    if (!isInside(boundary.workspace_root, metadata.project_root)) {
      throw new ContractError("QUALITY_TOOLCHAIN_PATH", "trusted project root escapes its workspace boundary");
    }
  }
  assertArray(metadata.distribution_identity_roles,
    "trusted toolchain invocation.runtime_metadata.distribution_identity_roles", {
      max: TRUSTED_TOOLCHAIN_LIMITS.max_distribution_files,
    });
  if (new Set(metadata.distribution_identity_roles).size !== metadata.distribution_identity_roles.length
    || metadata.distribution_identity_roles.some((role) => typeof role !== "string")) {
    throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY", "trusted distribution roles must be unique strings");
  }
  if (metadata.distribution_manifest_fingerprint !== null) {
    assertFingerprint(metadata.distribution_manifest_fingerprint, "trusted distribution manifest fingerprint");
  }
  const expectedManifestSpec = invocation.resolver === "maven"
    ? { subdirectories: ["boot", "lib", "conf"], extra_files: ["bin/m2.conf"] }
    : invocation.resolver === "gradle"
      ? { subdirectories: ["lib", "init.d"], extra_files: [] }
      : null;
  if (JSON.stringify(metadata.distribution_manifest_spec) !== JSON.stringify(expectedManifestSpec)
    || (expectedManifestSpec === null) !== (metadata.distribution_manifest_fingerprint === null)
    || (expectedManifestSpec === null) !== (metadata.distribution_root === null)) {
    throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY", "trusted distribution manifest scope is invalid");
  }
  assertArray(
    metadata.implicit_configuration,
    "trusted toolchain invocation.runtime_metadata.implicit_configuration",
    { max: MAX_PROJECT_CONFIGURATION_ANCESTORS + 8 },
  );
  const workspaceRoot = metadata.state_root_boundary?.workspace_root ?? metadata.project_root;
  const expectedImplicitSpecifications = implicitConfigurationSpecifications(
    invocation.resolver,
    workspaceRoot,
    metadata.project_root,
    metadata.state_root,
    metadata.distribution_root,
  );
  const expectedImplicitRoles = expectedImplicitSpecifications.map(([role]) => role);
  if (JSON.stringify(metadata.implicit_configuration.map((entry) => entry?.role))
    !== JSON.stringify(expectedImplicitRoles)) {
    throw new ContractError(
      "QUALITY_TOOLCHAIN_CONFIGURATION",
      "trusted toolchain implicit configuration inventory is incomplete",
    );
  }
  metadata.implicit_configuration.forEach((entry, index) => {
    const label = `trusted toolchain invocation.runtime_metadata.implicit_configuration[${index}]`;
    assertPlain(entry, label);
    exact(entry, ["role", "path", "state", "identity_fingerprint"], [
      "role", "path", "state", "identity_fingerprint",
    ], label);
    assertString(entry.role, `${label}.role`, { maxBytes: 128 });
    safeAbsolutePath(entry.path, `${label}.path`);
    const [expectedRole, expectedPath, mustBeAbsent = false] = expectedImplicitSpecifications[index];
    if (entry.role !== expectedRole || comparablePath(entry.path) !== comparablePath(expectedPath)) {
      throw new ContractError("QUALITY_TOOLCHAIN_CONFIGURATION", `${label} path is not resolver-owned`);
    }
    if (!["absent", "file"].includes(entry.state)) {
      throw new ContractError("QUALITY_TOOLCHAIN_CONFIGURATION", `${label}.state is invalid`);
    }
    if (mustBeAbsent && entry.state !== "absent") {
      throw new ContractError("QUALITY_TOOLCHAIN_CONFIGURATION", `${label} must remain absent`);
    }
    const matchingIdentity = invocation.identities.find((identityValue) => (
      identityValue.role === entry.role && comparablePath(identityValue.canonical_path) === comparablePath(entry.path)
    ));
    if (entry.state === "file") {
      assertFingerprint(entry.identity_fingerprint, `${label}.identity_fingerprint`);
      if (matchingIdentity === undefined
        || !fingerprintsEqual(entry.identity_fingerprint, fingerprint(matchingIdentity))) {
        throw new ContractError("QUALITY_TOOLCHAIN_CONFIGURATION", `${label} is not identity-bound`);
      }
    } else if (entry.identity_fingerprint !== null || matchingIdentity !== undefined) {
      throw new ContractError("QUALITY_TOOLCHAIN_CONFIGURATION", `${label} absence metadata is inconsistent`);
    }
  });
  if (metadata.git === null) {
    throw new ContractError("QUALITY_TOOLCHAIN_UNAVAILABLE", "trusted project invocation requires identity-bound Git");
  }
  assertPlain(metadata.git, "trusted toolchain invocation.runtime_metadata.git");
  exact(metadata.git, ["executable_path", "argv_prefix", "directory", "identity_fingerprint"],
    ["executable_path", "argv_prefix", "directory", "identity_fingerprint"],
    "trusted toolchain invocation.runtime_metadata.git");
  const gitExecutable = safeAbsolutePath(metadata.git.executable_path,
    "trusted toolchain invocation.runtime_metadata.git.executable_path");
  const gitDirectory = safeAbsolutePath(metadata.git.directory,
    "trusted toolchain invocation.runtime_metadata.git.directory");
  if (comparablePath(gitDirectory) !== comparablePath(path.dirname(gitExecutable))) {
    throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY", "trusted Git directory is not derived from its executable");
  }
  assertArray(metadata.git.argv_prefix, "trusted toolchain invocation.runtime_metadata.git.argv_prefix", { max: 1 });
  metadata.git.argv_prefix.forEach((entry, index) => validateArgument(entry,
    `trusted toolchain invocation.runtime_metadata.git.argv_prefix[${index}]`));
  assertFingerprint(metadata.git.identity_fingerprint, "trusted Git identity fingerprint");
  const gitIdentities = invocation.identities.filter((entry) => entry.role.startsWith("auxiliary_git_"));
  if (gitIdentities.length === 0 || !gitIdentities.some((entry) => executableIdentityRole(entry.role)
    && comparablePath(entry.canonical_path) === comparablePath(gitExecutable))
    || !fingerprintsEqual(metadata.git.identity_fingerprint, fingerprint(gitIdentities))) {
    throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY", "trusted Git runtime metadata is not identity-bound");
  }
  const requiresNpmScriptShell = invocation.resolver === "npm" && process.platform === "darwin";
  if ((metadata.npm_script_shell !== null) !== requiresNpmScriptShell) {
    throw new ContractError(
      "QUALITY_TOOLCHAIN_LAUNCHER_UNSAFE",
      "trusted npm script shell metadata does not match the platform policy",
    );
  }
  if (metadata.npm_script_shell !== null) {
    const shell = metadata.npm_script_shell;
    assertPlain(shell, "trusted toolchain invocation.runtime_metadata.npm_script_shell");
    exact(shell, ["executable_path", "directory", "identity_fingerprint"], [
      "executable_path", "directory", "identity_fingerprint",
    ], "trusted toolchain invocation.runtime_metadata.npm_script_shell");
    const shellExecutable = safeAbsolutePath(
      shell.executable_path,
      "trusted toolchain invocation.runtime_metadata.npm_script_shell.executable_path",
    );
    const shellDirectory = safeAbsolutePath(
      shell.directory,
      "trusted toolchain invocation.runtime_metadata.npm_script_shell.directory",
    );
    if (shellExecutable !== TRUSTED_MACOS_NPM_SCRIPT_SHELL_PATH
      || comparablePath(shellDirectory) !== comparablePath(path.dirname(shellExecutable))) {
      throw new ContractError("QUALITY_TOOLCHAIN_LAUNCHER_UNSAFE", "trusted npm script shell path is not fixed");
    }
    assertFingerprint(shell.identity_fingerprint, "trusted npm script shell identity fingerprint");
    const shellIdentities = invocation.identities.filter((entry) => entry.role.startsWith("npm_script_shell_"));
    if (shellIdentities.length === 0 || !shellIdentities.some((entry) => executableIdentityRole(entry.role)
      && comparablePath(entry.canonical_path) === comparablePath(shellExecutable))
      || !fingerprintsEqual(shell.identity_fingerprint, fingerprint(shellIdentities))) {
      throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY", "trusted npm script shell is not identity-bound");
    }
  }
}

function assertEnvironmentProfile(invocation) {
  const profile = invocation.environment_profile;
  assertPlain(profile, "trusted toolchain invocation.environment_profile");
  exact(profile, ["schema_version", "profile_id", "variables", "removed_variables", "path_entries", "state_root", "fingerprint"],
    ["schema_version", "profile_id", "variables", "removed_variables", "path_entries", "state_root", "fingerprint"],
    "trusted toolchain invocation.environment_profile");
  if (profile.schema_version !== 1 || profile.profile_id !== `trusted-${invocation.resolver}-environment-v2`) {
    throw new ContractError("QUALITY_TOOLCHAIN_ENVIRONMENT", "trusted toolchain environment profile identity is invalid");
  }
  assertPlain(profile.variables, "trusted toolchain invocation.environment_profile.variables");
  const actualKeys = Object.keys(profile.variables).sort();
  const expectedKeys = [
    ...ENVIRONMENT_VARIABLE_KEYS[invocation.resolver],
    ...(invocation.runtime_metadata.npm_script_shell === null ? [] : ["NPM_CONFIG_SCRIPT_SHELL"]),
  ].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new ContractError("QUALITY_TOOLCHAIN_ENVIRONMENT", "trusted toolchain environment variables are not resolver-owned");
  }
  for (const [key, value] of Object.entries(profile.variables)) {
    validateArgument(value, `trusted toolchain invocation.environment_profile.variables.${key}`);
  }
  assertArray(profile.removed_variables, "trusted toolchain invocation.environment_profile.removed_variables", { max: 64 });
  if (new Set(profile.removed_variables).size !== profile.removed_variables.length
    || profile.removed_variables.some((entry) => typeof entry !== "string" || entry.length === 0)
    || profile.removed_variables.some((entry) => actualKeys.includes(entry))) {
    throw new ContractError("QUALITY_TOOLCHAIN_ENVIRONMENT", "trusted toolchain removed-variable policy is invalid");
  }
  assertArray(profile.path_entries, "trusted toolchain invocation.environment_profile.path_entries", { min: 1, max: 16 });
  profile.path_entries.forEach((entry, index) => safeAbsolutePath(entry,
    `trusted toolchain invocation.environment_profile.path_entries[${index}]`));
  if (new Set(profile.path_entries.map(comparablePath)).size !== profile.path_entries.length
    || !profile.path_entries.some((entry) => comparablePath(entry) === comparablePath(path.dirname(invocation.executable_path)))
    || !profile.path_entries.some((entry) => comparablePath(entry) === comparablePath(invocation.runtime_metadata.git.directory))
    || (invocation.runtime_metadata.npm_script_shell !== null
      && !profile.path_entries.some((entry) => comparablePath(entry)
        === comparablePath(invocation.runtime_metadata.npm_script_shell.directory)))) {
    throw new ContractError("QUALITY_TOOLCHAIN_ENVIRONMENT", "trusted toolchain PATH entries are incomplete or duplicated");
  }
  if (profile.state_root !== invocation.runtime_metadata.state_root) {
    throw new ContractError("QUALITY_TOOLCHAIN_ENVIRONMENT", "trusted toolchain state root metadata is inconsistent");
  }
}

function assertStrategyShape(invocation) {
  const prefix = invocation.argv_prefix;
  if (invocation.resolver === "npm") {
    const launcher = invocation.identities.find((entry) => entry.role === "launcher_0")?.canonical_path;
    if (launcher === undefined || !prefix.includes(launcher)) {
      throw new ContractError("QUALITY_TOOLCHAIN_LAUNCHER_UNSAFE", "trusted npm invocation is missing its identity-bound CLI");
    }
    const shell = invocation.runtime_metadata.npm_script_shell;
    if (shell !== null && invocation.environment_profile.variables.NPM_CONFIG_SCRIPT_SHELL !== shell.executable_path) {
      throw new ContractError(
        "QUALITY_TOOLCHAIN_LAUNCHER_UNSAFE",
        "trusted npm invocation is missing its fixed script shell control",
      );
    }
  }
  if (invocation.resolver === "pytest"
    && JSON.stringify(prefix.slice(-3)) !== JSON.stringify(["-I", "-m", "pytest"])) {
    throw new ContractError("QUALITY_TOOLCHAIN_LAUNCHER_UNSAFE", "trusted pytest invocation must use fixed isolated python -I -m pytest");
  }
  if (invocation.resolver === "maven"
    && (!prefix.includes("org.codehaus.plexus.classworlds.launcher.Launcher")
      || !prefix.includes(`-Duser.home=${invocation.runtime_metadata.state_root}`)
      || !prefix.includes(`-Dmaven.multiModuleProjectDirectory=${invocation.runtime_metadata.project_root}`))) {
    throw new ContractError("QUALITY_TOOLCHAIN_LAUNCHER_UNSAFE", "trusted Maven invocation must use direct Java classworlds");
  }
  if (invocation.resolver === "maven") {
    for (const [option, role] of [
      ["--settings", "maven_control_user_settings"],
      ["--global-settings", "maven_control_global_settings"],
      ["--toolchains", "maven_control_user_toolchains"],
      ["--global-toolchains", "maven_control_global_toolchains"],
    ]) {
      const controlPath = invocation.identities.find((entry) => entry.role === role)?.canonical_path;
      const optionIndex = prefix.indexOf(option);
      if (controlPath === undefined || optionIndex < 0 || prefix[optionIndex + 1] !== controlPath) {
        throw new ContractError("QUALITY_TOOLCHAIN_LAUNCHER_UNSAFE", "trusted Maven invocation is missing sealed configuration controls");
      }
    }
  }
  if (invocation.resolver === "gradle"
    && (!prefix.includes("org.gradle.launcher.GradleMain")
      || prefix.at(-1) !== "--no-daemon"
      || prefix[prefix.indexOf("--gradle-user-home") + 1] !== invocation.runtime_metadata.state_root
      || prefix[prefix.indexOf("--project-cache-dir") + 1]
        !== path.join(invocation.runtime_metadata.state_root, "project-cache")
      || !prefix.includes(`-Dorg.gradle.java.home=${invocation.runtime_metadata.java_home}`)
      || !prefix.includes(`-Dgradle.user.home=${invocation.runtime_metadata.state_root}`)
      || !prefix.includes(`-Dorg.gradle.projectcachedir=${path.join(invocation.runtime_metadata.state_root, "project-cache")}`)
      || !prefix.includes("-Dorg.gradle.daemon=false")
      || prefix.indexOf("--project-dir") < 0
      || prefix[prefix.indexOf("--project-dir") + 1] !== invocation.runtime_metadata.project_root)) {
    throw new ContractError("QUALITY_TOOLCHAIN_LAUNCHER_UNSAFE", "trusted Gradle invocation must use direct Java GradleMain");
  }
}

export function assertTrustedToolchainInvocationCurrent(invocation) {
  assertPlain(invocation, "trusted toolchain invocation");
  const keys = [
    "executable_id", "resolver", "strategy", "executable_path", "argv_prefix", "identities", "identity_fingerprint",
    "managed_worker_executable_path", "managed_worker_identity_fingerprint",
    "map_fingerprint", "toolchain_host_configuration_source_kind", "toolchain_host_configuration_source_path",
    "toolchain_host_configuration_content_fingerprint", "toolchain_host_configuration_normalized_fingerprint",
    "toolchain_host_configuration_fingerprint", "toolchain_host_configuration_source_identity",
    "toolchain_resolution_policy_version", "environment_profile", "environment_fingerprint", "runtime_metadata",
    "runtime_metadata_fingerprint",
  ];
  exact(invocation, keys, keys, "trusted toolchain invocation");
  assertLogicalId(invocation.executable_id, "trusted toolchain invocation.executable_id");
  if (!TRUSTED_TOOLCHAIN_RESOLVERS.includes(invocation.resolver)) {
    throw new ContractError("QUALITY_TOOLCHAIN_RESOLVER", "trusted toolchain invocation.resolver is unsupported");
  }
  const executablePath = safeAbsolutePath(invocation.executable_path, "trusted toolchain invocation.executable_path");
  const managedWorkerExecutablePath = safeAbsolutePath(
    invocation.managed_worker_executable_path,
    "trusted toolchain invocation.managed_worker_executable_path",
  );
  assertArray(invocation.argv_prefix, "trusted toolchain invocation.argv_prefix", {
    max: TRUSTED_TOOLCHAIN_LIMITS.max_prefix_arguments,
  });
  invocation.argv_prefix.forEach((entry, index) => validateArgument(entry, `trusted toolchain invocation.argv_prefix[${index}]`));
  assertArray(invocation.identities, "trusted toolchain invocation.identities", {
    min: 1,
    max: TRUSTED_TOOLCHAIN_LIMITS.max_runtime_identities,
  });
  invocation.identities.forEach((entry, index) => assertIdentityShape(entry, `trusted toolchain invocation.identities[${index}]`));
  const executableIdentity = invocation.identities.find((entry) => executableIdentityRole(entry.role)
    && comparablePath(entry.canonical_path) === comparablePath(executablePath));
  if (executableIdentity === undefined) {
    throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY", "trusted toolchain executable path is not identity-bound");
  }
  const managedWorkerIdentities = invocation.identities.filter((entry) => entry.role.startsWith("managed_worker_"));
  if (!managedWorkerIdentities.some((entry) => executableIdentityRole(entry.role)
    && comparablePath(entry.canonical_path) === comparablePath(managedWorkerExecutablePath))) {
    throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY", "trusted managed-command worker runtime is not identity-bound");
  }
  assertFingerprint(
    invocation.managed_worker_identity_fingerprint,
    "trusted toolchain invocation.managed_worker_identity_fingerprint",
  );
  if (!fingerprintsEqual(invocation.managed_worker_identity_fingerprint, fingerprint(managedWorkerIdentities))) {
    throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY", "trusted managed-command worker identity fingerprint is invalid");
  }
  assertFingerprint(invocation.identity_fingerprint, "trusted toolchain invocation.identity_fingerprint");
  assertFingerprint(invocation.map_fingerprint, "trusted toolchain invocation.map_fingerprint");
  assertFingerprint(invocation.toolchain_host_configuration_fingerprint,
    "trusted toolchain invocation.toolchain_host_configuration_fingerprint");
  assertFingerprint(invocation.toolchain_host_configuration_content_fingerprint,
    "trusted toolchain invocation.toolchain_host_configuration_content_fingerprint");
  assertFingerprint(invocation.toolchain_host_configuration_normalized_fingerprint,
    "trusted toolchain invocation.toolchain_host_configuration_normalized_fingerprint");
  if (!["built_in", "host_file"].includes(invocation.toolchain_host_configuration_source_kind)) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_DRIFT", "trusted toolchain host source kind is invalid");
  }
  if (invocation.toolchain_host_configuration_source_path !== null) {
    safeAbsolutePath(invocation.toolchain_host_configuration_source_path,
      "trusted toolchain invocation.toolchain_host_configuration_source_path");
  }
  if (invocation.toolchain_resolution_policy_version !== TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_POLICY", "trusted toolchain invocation policy is stale");
  }
  const expectedHostFingerprint = fingerprint({
    source_kind: invocation.toolchain_host_configuration_source_kind,
    source_path: invocation.toolchain_host_configuration_source_path,
    source_identity: invocation.toolchain_host_configuration_source_identity,
    content_fingerprint: invocation.toolchain_host_configuration_content_fingerprint,
    configuration_fingerprint: invocation.toolchain_host_configuration_normalized_fingerprint,
    resolution_policy_version: invocation.toolchain_resolution_policy_version,
  });
  if (!fingerprintsEqual(invocation.toolchain_host_configuration_fingerprint, expectedHostFingerprint)) {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_DRIFT", "trusted toolchain host configuration fingerprint is invalid");
  }
  if (!fingerprintsEqual(invocation.identity_fingerprint, fingerprint(invocation.identities))) {
    throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY", "trusted toolchain identity fingerprint is invalid");
  }
  assertRuntimeMetadata(invocation);
  if (invocation.runtime_metadata.managed_worker_executable_path !== invocation.managed_worker_executable_path
    || invocation.runtime_metadata.managed_worker_identity_fingerprint !== invocation.managed_worker_identity_fingerprint) {
    throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY", "trusted managed-command worker runtime metadata is inconsistent");
  }
  assertFingerprint(invocation.runtime_metadata_fingerprint, "trusted toolchain invocation.runtime_metadata_fingerprint");
  if (!fingerprintsEqual(invocation.runtime_metadata_fingerprint, fingerprint(invocation.runtime_metadata))) {
    throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY", "trusted toolchain runtime metadata fingerprint is invalid");
  }
  assertStrategyShape(invocation);
  if (invocation.runtime_metadata.state_root_boundary !== null) {
    const expectedBoundary = invocation.runtime_metadata.state_root_boundary;
    let currentBoundary;
    try {
      currentBoundary = captureStateRootBoundary(
        invocation.runtime_metadata.state_root,
        expectedBoundary.workspace_root,
        expectedBoundary.trusted_roots,
      );
    } catch {
      throw new ContractError(
        "QUALITY_TOOLCHAIN_STATE_CHANGED",
        "trusted toolchain state-root boundary changed before spawn",
      );
    }
    if (!fingerprintsEqual(expectedBoundary.fingerprint, currentBoundary.fingerprint)) {
      throw new ContractError(
        "QUALITY_TOOLCHAIN_STATE_CHANGED",
        "trusted toolchain state-root identity changed before spawn",
      );
    }
  }
  const current = invocation.identities.map((entry, index) => ({
    role: entry.role,
    ...captureFileIdentity(entry.canonical_path, `trusted toolchain identity ${index}`, {
      executable: executableIdentityRole(entry.role),
    }),
  }));
  if (!fingerprintsEqual(invocation.identity_fingerprint, fingerprint(current))) {
    throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY_CHANGED", "trusted toolchain identity changed before spawn");
  }
  for (const boundary of invocation.runtime_metadata.implicit_configuration) {
    if (boundary.state !== "absent") continue;
    try {
      if (pathExistsWithoutAliases(boundary.path, `trusted implicit configuration ${boundary.role}`)) {
        throw new Error("implicit configuration appeared");
      }
    } catch {
      throw new ContractError(
        "QUALITY_TOOLCHAIN_IDENTITY_CHANGED",
        `trusted implicit configuration ${boundary.role} appeared or became aliased before spawn`,
      );
    }
  }
  if (invocation.toolchain_host_configuration_source_identity !== null) {
    const source = invocation.toolchain_host_configuration_source_identity;
    assertPlain(source, "trusted toolchain host configuration source identity");
    if (invocation.toolchain_host_configuration_source_kind !== "host_file"
      || invocation.toolchain_host_configuration_source_path !== source.canonical_path
      || invocation.toolchain_host_configuration_content_fingerprint !== source.content_fingerprint) {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_DRIFT", "trusted toolchain host source metadata is inconsistent");
    }
    const currentSource = captureFileIdentity(source.canonical_path, "trusted toolchain host configuration source", {
      maxBytes: 128 * 1024,
    });
    if (!fingerprintsEqual(fingerprint(source), fingerprint(currentSource))) {
      throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_DRIFT", "trusted toolchain host configuration source changed");
    }
  } else if (invocation.toolchain_host_configuration_source_kind !== "built_in") {
    throw new ContractError("QUALITY_TOOLCHAIN_HOST_CONFIG_DRIFT", "host-file configuration requires a source identity");
  } else if (invocation.toolchain_host_configuration_source_path !== null) {
    try {
      fs.lstatSync(invocation.toolchain_host_configuration_source_path);
      throw new ContractError(
        "QUALITY_TOOLCHAIN_HOST_CONFIG_DRIFT",
        "optional trusted toolchain host configuration appeared after resolution",
      );
    } catch (error) {
      if (error instanceof ContractError) throw error;
      if (error?.code !== "ENOENT") {
        throw new ContractError(
          "QUALITY_TOOLCHAIN_HOST_CONFIG_DRIFT",
          "optional trusted toolchain host configuration absence cannot be revalidated",
        );
      }
    }
  }
  assertEnvironmentProfile(invocation);
  assertFingerprint(invocation.environment_fingerprint, "trusted toolchain invocation.environment_fingerprint");
  const environmentBody = { ...invocation.environment_profile };
  delete environmentBody.fingerprint;
  if (!fingerprintsEqual(invocation.environment_profile.fingerprint, fingerprint(environmentBody))
    || !fingerprintsEqual(invocation.environment_fingerprint, invocation.environment_profile.fingerprint)) {
    throw new ContractError("QUALITY_TOOLCHAIN_ENVIRONMENT", "trusted toolchain environment profile fingerprint is invalid");
  }
  const distributionRoles = invocation.runtime_metadata.distribution_identity_roles;
  if (invocation.runtime_metadata.distribution_manifest_fingerprint !== null) {
    const manifestIdentities = invocation.identities.filter((entry) => distributionRoles.includes(entry.role));
    const manifest = manifestIdentities.map((entry, index) => ({
      relative_path: path.relative(invocation.runtime_metadata.distribution_root, entry.canonical_path).split(path.sep).join("/"),
      canonical_path: entry.canonical_path,
      content_fingerprint: entry.content_fingerprint,
      device: entry.device,
      inode: entry.inode,
      size: entry.size,
      mode: entry.mode,
      modified_ns: entry.modified_ns,
      changed_ns: entry.changed_ns,
    })).sort((left, right) => left.relative_path.localeCompare(right.relative_path));
    if (manifest.length !== distributionRoles.length) {
      throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY", "trusted distribution identity roles are incomplete");
    }
    if (!fingerprintsEqual(invocation.runtime_metadata.distribution_manifest_fingerprint, fingerprint(manifest))) {
      throw new ContractError("QUALITY_TOOLCHAIN_IDENTITY", "trusted distribution manifest fingerprint is invalid");
    }
    let currentManifest;
    try {
      currentManifest = distributionManifest(
        invocation.runtime_metadata.distribution_root,
        invocation.runtime_metadata.distribution_manifest_spec.subdirectories,
        invocation.runtime_metadata.distribution_manifest_spec.extra_files,
        invocation.resolver === "maven" ? "Maven" : "Gradle",
      );
    } catch {
      throw new ContractError(
        "QUALITY_TOOLCHAIN_IDENTITY_CHANGED",
        "trusted distribution membership changed before spawn",
      );
    }
    if (!fingerprintsEqual(
      invocation.runtime_metadata.distribution_manifest_fingerprint,
      currentManifest.fingerprint,
    )) {
      throw new ContractError(
        "QUALITY_TOOLCHAIN_IDENTITY_CHANGED",
        "trusted distribution membership changed before spawn",
      );
    }
  }
  return invocation;
}

export function assertTrustedToolchainCommandBinding(invocation, file, args) {
  const actualFile = safeAbsolutePath(file, "trusted command executable");
  const expectedFile = safeAbsolutePath(
    invocation?.executable_path,
    "trusted command expected executable",
  );
  if (comparablePath(actualFile) !== comparablePath(expectedFile)) {
    throw new ContractError(
      "QUALITY_TOOLCHAIN_INVOCATION_MISMATCH",
      "trusted command executable does not match the identity-bound invocation",
    );
  }
  assertArray(args, "trusted command arguments", { max: TRUSTED_TOOLCHAIN_LIMITS.max_arguments
    + TRUSTED_TOOLCHAIN_LIMITS.max_prefix_arguments });
  args.forEach((entry, index) => validateArgument(entry, `trusted command arguments[${index}]`));
  const prefix = invocation.argv_prefix;
  if (args.length < prefix.length
    || prefix.some((entry, index) => args[index] !== entry)) {
    throw new ContractError(
      "QUALITY_TOOLCHAIN_INVOCATION_MISMATCH",
      "trusted command arguments do not preserve the identity-bound launcher prefix",
    );
  }
  return true;
}

export const assertTrustedToolchainIdentity = assertTrustedToolchainInvocationCurrent;

export function loadTrustedToolchainMap(workspaceRoot, { relativePath = TRUSTED_TOOLCHAIN_MAP_PATH } = {}) {
  const root = fs.realpathSync.native(path.resolve(workspaceRoot));
  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized !== TRUSTED_TOOLCHAIN_MAP_PATH) {
    throw new ContractError("QUALITY_TOOLCHAIN_MAP_PATH", `trusted toolchain map path must be ${TRUSTED_TOOLCHAIN_MAP_PATH}`);
  }
  const candidate = path.resolve(root, ...normalized.split("/"));
  if (!isInside(root, candidate)) throw new ContractError("QUALITY_TOOLCHAIN_MAP_PATH", "trusted toolchain map escapes the worktree");
  try {
    assertNoAliasedComponents(candidate, "trusted toolchain map");
  } catch (error) {
    if (error instanceof ContractError && error.code === "QUALITY_TOOLCHAIN_UNAVAILABLE") {
      throw new ContractError("QUALITY_TOOLCHAIN_MAP_MISSING", `missing ${TRUSTED_TOOLCHAIN_MAP_PATH}`);
    }
    throw error;
  }
  const canonical = fs.realpathSync.native(candidate);
  if (comparablePath(canonical) !== comparablePath(candidate)) {
    throw new ContractError("QUALITY_TOOLCHAIN_MAP_PATH", "trusted toolchain map cannot be a symlink or junction");
  }
  let descriptor;
  try {
    descriptor = fs.openSync(canonical, "r");
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n) {
      throw new ContractError("QUALITY_TOOLCHAIN_MAP_PATH", "trusted toolchain map must be a singly-linked regular file");
    }
    if (before.size > BigInt(TRUSTED_TOOLCHAIN_LIMITS.max_map_bytes)) {
      throw new ContractError("QUALITY_TOOLCHAIN_MAP_SIZE", "trusted toolchain map must be bounded UTF-8 JSON");
    }
    const bounded = Buffer.alloc(TRUSTED_TOOLCHAIN_LIMITS.max_map_bytes + 1);
    let bytesRead = 0;
    while (bytesRead < bounded.length) {
      const count = fs.readSync(descriptor, bounded, bytesRead, bounded.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    const after = fs.fstatSync(descriptor, { bigint: true });
    const shape = (stat) => [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs]
      .map((entry) => decimal(entry));
    if (bytesRead > TRUSTED_TOOLCHAIN_LIMITS.max_map_bytes) {
      throw new ContractError("QUALITY_TOOLCHAIN_MAP_SIZE", "trusted toolchain map must be bounded UTF-8 JSON");
    }
    if (JSON.stringify(shape(before)) !== JSON.stringify(shape(after)) || bytesRead !== Number(before.size)) {
      throw new ContractError("QUALITY_TOOLCHAIN_MAP_RACE", "trusted toolchain map changed while it was read");
    }
    let serialized;
    try {
      serialized = new TextDecoder("utf-8", { fatal: true }).decode(bounded.subarray(0, bytesRead));
    } catch {
      throw new ContractError("QUALITY_TOOLCHAIN_MAP_JSON", "trusted toolchain map must contain valid UTF-8 JSON");
    }
    const map = parseTrustedToolchainMap(serialized);
    return Object.freeze({ relative_path: normalized, map, fingerprint: trustedToolchainMapFingerprint(map) });
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}
