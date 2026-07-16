import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { isInside } from "../feedback/files.mjs";
import { normalizeRelativePath } from "../feedback/privacy.mjs";
import {
  ContractError,
  assertArray,
  assertFingerprint,
  assertInteger,
  assertPlain,
  assertString,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

export const WORKSPACE_SNAPSHOT_SCHEMA_VERSION = 3;

const MAX_OBSERVED_PATHS = 4096;
const MAX_EXPLICIT_SCOPES = 128;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_AGGREGATE_BYTES = 128 * 1024 * 1024;
const MAX_INDEX_METADATA_BYTES = 64 * 1024 * 1024;
const MAX_INDEX_ENTRIES = 1_000_000;
const CONTROL_COMPONENTS = new Set([".git", ".oc_harness"]);
const SECRET_FILE_NAMES = new Set([
  ".npmrc", ".pypirc", ".netrc", "credentials", "credentials.json", "secrets.json", "id_rsa", "id_ed25519",
]);

function trustedGitCandidates() {
  if (process.platform === "win32") {
    return [
      "C:\\Program Files\\Git\\cmd\\git.exe",
      "C:\\Program Files\\Git\\bin\\git.exe",
      "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
      "C:\\Program Files (x86)\\Git\\bin\\git.exe",
    ];
  }
  return ["/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git"];
}

function trustedGitInstallRoots() {
  if (process.platform === "win32") return ["C:\\Program Files\\Git", "C:\\Program Files (x86)\\Git"];
  return ["/usr/bin", "/usr/local", "/opt/homebrew"];
}

function comparablePath(value) {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function resolveTrustedGitExecutable() {
  for (const candidate of trustedGitCandidates()) {
    try {
      const resolved = fs.realpathSync.native(candidate);
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) continue;
      const normalized = comparablePath(resolved);
      const trusted = trustedGitInstallRoots().some((root) => {
        const canonicalRoot = fs.realpathSync.native(root);
        const normalizedRoot = comparablePath(canonicalRoot);
        return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}${path.sep}`);
      });
      if (trusted) return resolved;
    } catch {
      // Try the next fixed, system-owned install location.
    }
  }
  throw new ContractError("QUALITY_WORKSPACE_GIT", "trusted Git executable is unavailable at a fixed system install location");
}

function safeGitEnvironment(workspaceRoot, gitExecutable) {
  const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
  const trustedPathEntries = [path.dirname(gitExecutable)];
  const environment = {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "safe.directory",
    GIT_CONFIG_VALUE_0: workspaceRoot,
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
  };
  if (process.platform === "win32") {
    const systemRoot = `${path.parse(gitExecutable).root}Windows`;
    environment.SystemRoot = systemRoot;
    environment.WINDIR = systemRoot;
    trustedPathEntries.push(path.join(systemRoot, "System32"));
  } else {
    trustedPathEntries.push("/usr/bin", "/bin");
  }
  environment.PATH = [...new Set(trustedPathEntries)].join(path.delimiter);
  return environment;
}

function sha256Bytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function runSafeGitObservation(workspaceRoot, args, maxBuffer = 16 * 1024 * 1024) {
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const gitExecutable = resolveTrustedGitExecutable();
  const noHooksPath = process.platform === "win32" ? "NUL" : "/dev/null";
  const result = spawnSync(gitExecutable, [
    "-c", "core.fsmonitor=false",
    "-c", `core.hooksPath=${noHooksPath}`,
    "--no-optional-locks",
    ...args,
  ], {
    cwd: root,
    encoding: "utf8",
    env: safeGitEnvironment(root, gitExecutable),
    shell: false,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer,
  });
  if (result.error || result.status !== 0) {
    throw new ContractError("QUALITY_WORKSPACE_GIT", `trusted Git observation failed: git ${args[0]}`);
  }
  return result.stdout;
}

function canonicalChangedPath(value, workspaceRoot, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || Buffer.byteLength(value, "utf8") > 1000) {
    throw new ContractError("QUALITY_WORKSPACE_PATH", `${label} is not a bounded path`);
  }
  const slash = value.replaceAll("\\", "/");
  const normalized = normalizeRelativePath(slash, label);
  if (normalized !== slash || path.isAbsolute(value)) {
    throw new ContractError("QUALITY_WORKSPACE_PATH", `${label} is not a canonical worktree-relative path`);
  }
  const resolved = path.resolve(workspaceRoot, ...normalized.split("/"));
  if (!isInside(workspaceRoot, resolved)) throw new ContractError("QUALITY_WORKSPACE_PATH", `${label} escapes the worktree`);
  return normalized;
}

function parseStatus(serialized, workspaceRoot) {
  if (serialized === "") return new Map();
  const parts = serialized.split("\0");
  if (parts.at(-1) !== "") throw new ContractError("QUALITY_WORKSPACE_GIT", "git status output is partial");
  parts.pop();
  const result = new Map();
  for (let index = 0; index < parts.length; index += 1) {
    const entry = parts[index];
    if (entry.length < 4 || entry[2] !== " ") throw new ContractError("QUALITY_WORKSPACE_GIT", "git status output is malformed");
    const status = entry.slice(0, 2);
    const current = canonicalChangedPath(entry.slice(3), workspaceRoot, "git status path");
    result.set(current, status);
    if (status.includes("R") || status.includes("C")) {
      index += 1;
      if (index >= parts.length) throw new ContractError("QUALITY_WORKSPACE_GIT", "git rename status is partial");
      result.set(canonicalChangedPath(parts[index], workspaceRoot, "git status source path"), `${status}:source`);
    }
  }
  if (result.size > MAX_OBSERVED_PATHS) {
    throw new ContractError("QUALITY_WORKSPACE_SNAPSHOT_LIMIT", `workspace has more than ${MAX_OBSERVED_PATHS} changed paths`);
  }
  return result;
}

function parseHiddenTrackedPaths(serialized, workspaceRoot) {
  if (serialized === "") return new Map();
  const parts = serialized.split("\0");
  if (parts.at(-1) !== "") throw new ContractError("QUALITY_WORKSPACE_GIT", "git hidden tracked-path output is partial");
  parts.pop();
  const result = new Map();
  for (const entry of parts) {
    if (entry.length < 3 || entry[1] !== " ") throw new ContractError("QUALITY_WORKSPACE_GIT", "git hidden tracked-path output is malformed");
    if (entry[0] !== "H") result.set(canonicalChangedPath(entry.slice(2), workspaceRoot, "git hidden tracked path"), entry[0]);
  }
  if (result.size > MAX_OBSERVED_PATHS) {
    throw new ContractError("QUALITY_WORKSPACE_SNAPSHOT_LIMIT", `workspace has more than ${MAX_OBSERVED_PATHS} hidden tracked paths`);
  }
  return result;
}

function excludesControlState(relativePath) {
  return relativePath.split("/").some((component) => CONTROL_COMPONENTS.has(component.toLowerCase()));
}

function isSecretLikePath(relativePath) {
  return relativePath.split("/").some((component) => {
    const lower = component.toLowerCase();
    if ([".env.example", ".env.sample", ".env.template"].includes(lower)) return false;
    return lower === ".env" || lower.startsWith(".env.") || SECRET_FILE_NAMES.has(lower)
      || /(?:^|[._-])(?:secret|credential|private[-_]?key)(?:[._-]|$)/u.test(lower);
  });
}

function canonicalScopePaths(values, workspaceRoot, label) {
  assertArray(values, label, { max: MAX_EXPLICIT_SCOPES });
  const result = values.map((entry, index) => {
    const normalized = canonicalChangedPath(entry, workspaceRoot, `${label}[${index}]`);
    if (excludesControlState(normalized)) {
      throw new ContractError("QUALITY_CONTROL_PATH", `${label}[${index}] cannot target runner or Git control state`);
    }
    if (isSecretLikePath(normalized)) {
      throw new ContractError("QUALITY_WORKSPACE_SENSITIVE_PATH", `${label}[${index}] targets secret-like material`);
    }
    return normalized;
  });
  if (new Set(result).size !== result.length) throw new ContractError("QUALITY_WORKSPACE_PATH", `${label} must contain unique paths`);
  const sorted = result.sort();
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted.some((candidate, candidateIndex) => candidateIndex !== index
      && (candidate.startsWith(`${sorted[index]}/`) || sorted[index].startsWith(`${candidate}/`)))) {
      throw new ContractError("QUALITY_WORKSPACE_SCOPE_OVERLAP", `${label} cannot contain overlapping paths`);
    }
  }
  return sorted;
}

function pathWithinScope(candidate, scope) {
  return candidate === scope || candidate.startsWith(`${scope}/`);
}

function assertDisjointScopes(ownershipPaths, generatedOutputPaths) {
  for (const ownership of ownershipPaths) {
    for (const output of generatedOutputPaths) {
      if (pathWithinScope(ownership, output) || pathWithinScope(output, ownership)) {
        throw new ContractError("QUALITY_WORKSPACE_SCOPE_OVERLAP", "ownership and generated-output paths must be disjoint");
      }
    }
  }
}

function decimal(value) {
  return BigInt(value).toString(10);
}

function statIdentity(stat) {
  return {
    device: decimal(stat.dev),
    inode: decimal(stat.ino),
    mode: decimal(stat.mode),
    size: decimal(stat.size),
    links: decimal(stat.nlink),
    modified_ns: decimal(stat.mtimeNs),
    changed_ns: decimal(stat.ctimeNs),
  };
}

function assertCanonicalExistingPath(root, absolute, relativePath, stat, { allowDirectory = false } = {}) {
  if (stat.isSymbolicLink()) throw new ContractError("QUALITY_WORKSPACE_ALIAS", `observed path cannot be a symbolic link or junction: ${relativePath}`);
  if (!stat.isFile() && !(allowDirectory && stat.isDirectory())) {
    throw new ContractError("QUALITY_WORKSPACE_UNSUPPORTED_KIND", `observed path has an unsupported file kind: ${relativePath}`);
  }
  const canonical = fs.realpathSync.native(absolute);
  if (comparablePath(canonical) !== comparablePath(absolute) || !isInside(root, canonical)) {
    throw new ContractError("QUALITY_WORKSPACE_ALIAS", `observed path traverses a filesystem alias: ${relativePath}`);
  }
  if (stat.isFile() && stat.nlink !== 1n) {
    throw new ContractError("QUALITY_WORKSPACE_HARDLINK", `observed path cannot be multiply linked: ${relativePath}`);
  }
}

function scanExplicitScopes(root, scopes, label) {
  const observable = new Map();
  const manifest = [];
  const visit = (relativePath) => {
    if (isSecretLikePath(relativePath)) {
      throw new ContractError("QUALITY_WORKSPACE_SENSITIVE_PATH", `${label} contains secret-like material: ${relativePath}`);
    }
    const absolute = path.resolve(root, ...relativePath.split("/"));
    let stat;
    try {
      stat = fs.lstatSync(absolute, { bigint: true });
    } catch (error) {
      if (error?.code === "ENOENT") {
        observable.set(relativePath, { kind: "absent", identity: null });
        manifest.push({ path: relativePath, kind: "absent", identity: null });
        return;
      }
      throw new ContractError("QUALITY_WORKSPACE_UNREADABLE", `${label} cannot inspect ${relativePath}`);
    }
    assertCanonicalExistingPath(root, absolute, relativePath, stat, { allowDirectory: true });
    if (stat.isFile()) {
      const identity = statIdentity(stat);
      observable.set(relativePath, { kind: "file", identity });
      manifest.push({ path: relativePath, kind: "file", identity });
      return;
    }
    manifest.push({ path: relativePath, kind: "directory", identity: statIdentity(stat) });
    let names;
    try {
      names = fs.readdirSync(absolute).sort((left, right) => left.localeCompare(right));
    } catch {
      throw new ContractError("QUALITY_WORKSPACE_UNREADABLE", `${label} cannot enumerate ${relativePath}`);
    }
    for (const name of names) {
      const child = canonicalChangedPath(`${relativePath}/${name}`, root, `${label} child path`);
      if (excludesControlState(child)) throw new ContractError("QUALITY_CONTROL_PATH", `${label} cannot traverse control state`);
      visit(child);
      if (observable.size > MAX_OBSERVED_PATHS || manifest.length > MAX_OBSERVED_PATHS * 2) {
        throw new ContractError("QUALITY_WORKSPACE_SNAPSHOT_LIMIT", `${label} exceeds its bounded path inventory`);
      }
    }
  };
  for (const scope of scopes) visit(scope);
  manifest.sort((left, right) => left.path.localeCompare(right.path));
  return { observable, manifest_fingerprint: fingerprint(manifest) };
}

function safeFileMarker(root, relativePath, bytesBudget, expected = null) {
  const absolute = path.resolve(root, ...relativePath.split("/"));
  let lexical;
  try {
    lexical = fs.lstatSync(absolute, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      if (expected?.kind === "file") throw new ContractError("QUALITY_WORKSPACE_OBSERVATION_RACE", `observed file disappeared: ${relativePath}`);
      return { marker: "absent", portable_marker: "absent", identity: null };
    }
    throw new ContractError("QUALITY_WORKSPACE_UNREADABLE", `observed path cannot be inspected: ${relativePath}`);
  }
  assertCanonicalExistingPath(root, absolute, relativePath, lexical);
  const lexicalIdentity = statIdentity(lexical);
  if (expected !== null && (expected.kind !== "file" || JSON.stringify(expected.identity) !== JSON.stringify(lexicalIdentity))) {
    throw new ContractError("QUALITY_WORKSPACE_OBSERVATION_RACE", `observed path changed during inventory: ${relativePath}`);
  }
  let descriptor;
  try {
    let flags = fs.constants.O_RDONLY;
    if (process.platform !== "win32" && Number.isInteger(fs.constants.O_NOFOLLOW)) flags |= fs.constants.O_NOFOLLOW;
    descriptor = fs.openSync(absolute, flags);
    const before = fs.fstatSync(descriptor, { bigint: true });
    const beforeIdentity = statIdentity(before);
    if (JSON.stringify(beforeIdentity) !== JSON.stringify(lexicalIdentity) || before.nlink !== 1n || !before.isFile()) {
      throw new ContractError("QUALITY_WORKSPACE_OBSERVATION_RACE", `observed path identity changed before read: ${relativePath}`);
    }
    if (before.size > BigInt(MAX_FILE_BYTES) || bytesBudget.used + Number(before.size) > MAX_AGGREGATE_BYTES) {
      throw new ContractError("QUALITY_WORKSPACE_SNAPSHOT_LIMIT", "observed-file hashing limit was exceeded");
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    const afterIdentity = statIdentity(after);
    if (JSON.stringify(afterIdentity) !== JSON.stringify(beforeIdentity) || bytes.length !== Number(before.size)) {
      throw new ContractError("QUALITY_WORKSPACE_OBSERVATION_RACE", `observed path changed during read: ${relativePath}`);
    }
    bytesBudget.used += bytes.length;
    return {
      marker: fingerprint({ kind: "regular", identity: beforeIdentity, content: sha256Bytes(bytes) }),
      portable_marker: sha256Bytes(bytes),
      identity: beforeIdentity,
    };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function parseIndex(serialized, workspaceRoot, selectedPaths) {
  const selected = new Map();
  if (serialized === "") return { count: 0, selected };
  const entries = serialized.split("\0");
  if (entries.at(-1) !== "") throw new ContractError("QUALITY_WORKSPACE_GIT", "git index output is partial");
  entries.pop();
  if (entries.length > MAX_INDEX_ENTRIES) throw new ContractError("QUALITY_WORKSPACE_SNAPSHOT_LIMIT", "Git index metadata exceeds its entry limit");
  for (const entry of entries) {
    const tab = entry.indexOf("\t");
    if (tab < 1) throw new ContractError("QUALITY_WORKSPACE_GIT", "git index output is malformed");
    const metadata = entry.slice(0, tab);
    if (!/^\d{6} [0-9a-f]{40,64} [0-3]$/u.test(metadata)) throw new ContractError("QUALITY_WORKSPACE_GIT", "git index metadata is malformed");
    const file = canonicalChangedPath(entry.slice(tab + 1), workspaceRoot, "git index path");
    if (selectedPaths.has(file)) selected.set(file, metadata);
  }
  return { count: entries.length, selected };
}

function gitObservationBundle(root) {
  const head = runSafeGitObservation(root, ["rev-parse", "HEAD"]).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/u.test(head)) throw new ContractError("QUALITY_WORKSPACE_GIT", "trusted Git HEAD is invalid");
  const indexPathOutput = runSafeGitObservation(root, ["rev-parse", "--path-format=absolute", "--git-path", "index"]).trim();
  if (indexPathOutput.length === 0 || indexPathOutput.includes("\0") || !path.isAbsolute(indexPathOutput)) {
    throw new ContractError("QUALITY_WORKSPACE_GIT", "trusted Git index path is invalid");
  }
  return {
    head,
    status: runSafeGitObservation(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    hidden: runSafeGitObservation(root, ["ls-files", "-v", "-z"], MAX_INDEX_METADATA_BYTES),
    index: runSafeGitObservation(root, ["ls-files", "--stage", "-z"], MAX_INDEX_METADATA_BYTES),
    raw_index: captureRawGitIndex(indexPathOutput),
  };
}

function captureRawGitIndex(indexPath) {
  let lexical;
  try {
    lexical = fs.lstatSync(indexPath, { bigint: true });
  } catch {
    throw new ContractError("QUALITY_WORKSPACE_GIT", "trusted Git index cannot be inspected");
  }
  if (lexical.isSymbolicLink() || !lexical.isFile() || lexical.nlink !== 1n) {
    throw new ContractError("QUALITY_WORKSPACE_GIT", "trusted Git index must be a singly-linked non-aliased regular file");
  }
  const canonical = fs.realpathSync.native(indexPath);
  if (comparablePath(canonical) !== comparablePath(indexPath)) {
    throw new ContractError("QUALITY_WORKSPACE_GIT", "trusted Git index cannot traverse a filesystem alias");
  }
  if (lexical.size > BigInt(MAX_INDEX_METADATA_BYTES)) {
    throw new ContractError("QUALITY_WORKSPACE_SNAPSHOT_LIMIT", "trusted Git index exceeds its metadata bound");
  }
  let descriptor;
  try {
    let flags = fs.constants.O_RDONLY;
    if (process.platform !== "win32" && Number.isInteger(fs.constants.O_NOFOLLOW)) flags |= fs.constants.O_NOFOLLOW;
    descriptor = fs.openSync(canonical, flags);
    const before = fs.fstatSync(descriptor, { bigint: true });
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    const beforeIdentity = statIdentity(before);
    if (JSON.stringify(beforeIdentity) !== JSON.stringify(statIdentity(after)) || bytes.length !== Number(before.size)) {
      throw new ContractError("QUALITY_WORKSPACE_OBSERVATION_RACE", "trusted Git index changed while it was read");
    }
    return { identity: beforeIdentity, content: sha256Bytes(bytes) };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function gitBundleFingerprint(bundle) {
  return fingerprint({
    head: bundle.head,
    status: sha256Bytes(bundle.status),
    hidden: sha256Bytes(bundle.hidden),
    index: sha256Bytes(bundle.index),
    raw_index: fingerprint(bundle.raw_index),
  });
}

function observationOptions(value, workspaceRoot) {
  if (Array.isArray(value)) {
    return { ownershipPaths: canonicalScopePaths(value, workspaceRoot, "workspace ownership paths"), generatedOutputPaths: [] };
  }
  const options = value ?? {};
  assertPlain(options, "workspace observation options");
  exact(options, ["ownershipPaths", "generatedOutputPaths"], [], "workspace observation options");
  return {
    ownershipPaths: canonicalScopePaths(options.ownershipPaths ?? [], workspaceRoot, "workspace ownership paths"),
    generatedOutputPaths: canonicalScopePaths(options.generatedOutputPaths ?? [], workspaceRoot, "workspace generated-output paths"),
  };
}

function entryFingerprints(
  root,
  selected,
  index,
  salt,
  budget,
  explicitInventory = null,
  captured = new Map(),
  portableEntries = null,
) {
  return [...selected.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([file, status]) => {
    if (isSecretLikePath(file)) throw new ContractError("QUALITY_WORKSPACE_SENSITIVE_PATH", `workspace observation refuses secret-like path: ${file}`);
    const observed = safeFileMarker(root, file, budget, explicitInventory?.get(file) ?? null);
    captured.set(file, { kind: observed.identity === null ? "absent" : "file", identity: observed.identity });
    portableEntries?.push({
      path: file,
      status,
      index: index.get(file) ?? "absent",
      content: observed.portable_marker,
    });
    return {
      path: file,
      fingerprint: fingerprint({ salt, path: file, status, index: index.get(file) ?? "absent", worktree: observed.marker }),
    };
  });
}

function assertObservedPathsCurrent(root, captured) {
  for (const [file, expected] of captured) {
    const absolute = path.resolve(root, ...file.split("/"));
    let stat;
    try {
      stat = fs.lstatSync(absolute, { bigint: true });
    } catch (error) {
      if (error?.code === "ENOENT" && expected.kind === "absent") continue;
      throw new ContractError("QUALITY_WORKSPACE_OBSERVATION_RACE", `observed path changed after read: ${file}`);
    }
    if (expected.kind === "absent") {
      throw new ContractError("QUALITY_WORKSPACE_OBSERVATION_RACE", `observed path appeared after inventory: ${file}`);
    }
    assertCanonicalExistingPath(root, absolute, file, stat);
    if (JSON.stringify(statIdentity(stat)) !== JSON.stringify(expected.identity)) {
      throw new ContractError("QUALITY_WORKSPACE_OBSERVATION_RACE", `observed path identity changed after read: ${file}`);
    }
  }
}

function captureContentBoundWorkspace(
  workspaceRoot,
  salt = "normal-session-workspace-v3",
  pathsOrOptions = [],
) {
  assertString(salt, "workspace observation salt", { maxBytes: 256 });
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  const options = observationOptions(pathsOrOptions, root);
  assertDisjointScopes(options.ownershipPaths, options.generatedOutputPaths);

  const initialGit = gitObservationBundle(root);
  const status = parseStatus(initialGit.status, root);
  const hiddenTracked = parseHiddenTrackedPaths(initialGit.hidden, root);
  const ownership = scanExplicitScopes(root, options.ownershipPaths, "workspace ownership paths");
  const outputs = scanExplicitScopes(root, options.generatedOutputPaths, "workspace generated-output paths");

  const selected = new Map();
  for (const [file, code] of status) {
    if (excludesControlState(file)) continue;
    if (options.generatedOutputPaths.some((scope) => pathWithinScope(file, scope))) continue;
    selected.set(file, code);
  }
  for (const [file, flag] of hiddenTracked) {
    if (!excludesControlState(file)) selected.set(file, selected.get(file) ?? `hidden:${flag}`);
  }
  for (const file of ownership.observable.keys()) selected.set(file, selected.get(file) ?? "explicit-ownership");
  if (selected.size > MAX_OBSERVED_PATHS) throw new ContractError("QUALITY_WORKSPACE_SNAPSHOT_LIMIT", "workspace exceeds its bounded source inventory");

  const outputSelected = new Map([...outputs.observable.keys()].map((file) => [file, "declared-output"]));
  const allSelected = new Set([...selected.keys(), ...outputSelected.keys()]);
  const parsedIndex = parseIndex(initialGit.index, root, allSelected);
  const indexFingerprint = fingerprint({
    stage_metadata: sha256Bytes(initialGit.index),
    tracked_flags: sha256Bytes(initialGit.hidden),
    raw_index: fingerprint(initialGit.raw_index),
  });

  const capturedSource = new Map();
  const capturedOutputs = new Map();
  const portableSourceEntries = [];
  const sourceEntries = entryFingerprints(
    root, selected, parsedIndex.selected, salt, { used: 0 }, ownership.observable, capturedSource, portableSourceEntries,
  );
  const outputEntries = entryFingerprints(
    root, outputSelected, parsedIndex.selected, `${salt}:declared-outputs`, { used: 0 }, outputs.observable, capturedOutputs,
  );

  const finalOwnership = scanExplicitScopes(root, options.ownershipPaths, "workspace ownership paths");
  const finalOutputs = scanExplicitScopes(root, options.generatedOutputPaths, "workspace generated-output paths");
  const finalGit = gitObservationBundle(root);
  if (gitBundleFingerprint(initialGit) !== gitBundleFingerprint(finalGit)
    || ownership.manifest_fingerprint !== finalOwnership.manifest_fingerprint
    || outputs.manifest_fingerprint !== finalOutputs.manifest_fingerprint) {
    throw new ContractError("QUALITY_WORKSPACE_OBSERVATION_RACE", "workspace changed while its trusted snapshot was being captured");
  }
  assertObservedPathsCurrent(root, capturedSource);
  assertObservedPathsCurrent(root, capturedOutputs);

  const dirty = [...status.entries()].some(([file, code]) => !excludesControlState(file)
    && !options.generatedOutputPaths.some((scope) => pathWithinScope(file, scope)));
  const sourceBody = {
    schema_version: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    head_sha: initialGit.head,
    index_entry_count: parsedIndex.count,
    index_fingerprint: indexFingerprint,
    entries: sourceEntries,
    dirty,
  };
  const sourceFingerprint = fingerprint(sourceBody);
  const declaredOutputsFingerprint = fingerprint({
    schema_version: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    entries: outputEntries,
  });
  const snapshot = deepFrozenClone({
    ...sourceBody,
    declared_output_entries: outputEntries,
    source_fingerprint: sourceFingerprint,
    declared_outputs_fingerprint: declaredOutputsFingerprint,
    fingerprint: fingerprint({
      schema_version: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
      source_fingerprint: sourceFingerprint,
      declared_outputs_fingerprint: declaredOutputsFingerprint,
    }),
  }, "content-bound workspace snapshot");
  const sourceAttestation = deepFrozenClone({
    schema_version: 1,
    head_sha: initialGit.head,
    index_entry_count: parsedIndex.count,
    index_fingerprint: fingerprint({
      stage_metadata: sha256Bytes(initialGit.index),
      tracked_flags: sha256Bytes(initialGit.hidden),
    }),
    entries: portableSourceEntries,
    dirty,
  }, "portable source attestation");
  return Object.freeze({
    snapshot,
    source_attestation: sourceAttestation,
    source_attestation_fingerprint: fingerprint(sourceAttestation),
  });
}

export function observeContentBoundWorkspace(
  workspaceRoot,
  salt = "normal-session-workspace-v3",
  pathsOrOptions = [],
) {
  return captureContentBoundWorkspace(workspaceRoot, salt, pathsOrOptions).snapshot;
}

export function observeContentBoundWorkspaceWithSourceAttestation(
  workspaceRoot,
  salt = "normal-session-workspace-v3",
  pathsOrOptions = [],
) {
  return captureContentBoundWorkspace(workspaceRoot, salt, pathsOrOptions);
}

function validateEntries(entries, label) {
  assertArray(entries, label, { max: MAX_OBSERVED_PATHS });
  let previous = null;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    assertPlain(entry, `${label}[${index}]`);
    exact(entry, ["path", "fingerprint"], ["path", "fingerprint"], `${label}[${index}]`);
    assertString(entry.path, `${label}[${index}].path`, { maxBytes: 1000 });
    assertFingerprint(entry.fingerprint, `${label}[${index}].fingerprint`);
    if (previous !== null && previous.localeCompare(entry.path) >= 0) {
      throw new ContractError("QUALITY_WORKSPACE_ORDER", `${label} must be unique and sorted`);
    }
    previous = entry.path;
  }
}

export function validateContentBoundWorkspace(value, label = "workspace snapshot") {
  assertPlain(value, label);
  const keys = [
    "schema_version", "head_sha", "index_entry_count", "index_fingerprint", "entries", "dirty",
    "declared_output_entries", "source_fingerprint", "declared_outputs_fingerprint", "fingerprint",
  ];
  exact(value, keys, keys, label);
  if (value.schema_version !== WORKSPACE_SNAPSHOT_SCHEMA_VERSION) {
    throw new ContractError("QUALITY_WORKSPACE_SCHEMA", `${label}.schema_version is unsupported`);
  }
  if (!/^[0-9a-f]{40}$/u.test(value.head_sha)) throw new ContractError("QUALITY_WORKSPACE_GIT", `${label}.head_sha is invalid`);
  assertInteger(value.index_entry_count, `${label}.index_entry_count`, { min: 0, max: MAX_INDEX_ENTRIES });
  assertFingerprint(value.index_fingerprint, `${label}.index_fingerprint`);
  validateEntries(value.entries, `${label}.entries`);
  validateEntries(value.declared_output_entries, `${label}.declared_output_entries`);
  if (typeof value.dirty !== "boolean") throw new ContractError("QUALITY_WORKSPACE_SCHEMA", `${label}.dirty must be boolean`);
  for (const key of ["source_fingerprint", "declared_outputs_fingerprint", "fingerprint"]) {
    assertFingerprint(value[key], `${label}.${key}`);
  }
  const expectedSource = fingerprint({
    schema_version: value.schema_version,
    head_sha: value.head_sha,
    index_entry_count: value.index_entry_count,
    index_fingerprint: value.index_fingerprint,
    entries: value.entries,
    dirty: value.dirty,
  });
  const expectedOutputs = fingerprint({ schema_version: value.schema_version, entries: value.declared_output_entries });
  if (!fingerprintsEqual(value.source_fingerprint, expectedSource)
    || !fingerprintsEqual(value.declared_outputs_fingerprint, expectedOutputs)
    || !fingerprintsEqual(value.fingerprint, fingerprint({
      schema_version: value.schema_version,
      source_fingerprint: value.source_fingerprint,
      declared_outputs_fingerprint: value.declared_outputs_fingerprint,
    }))) {
    throw new ContractError("QUALITY_WORKSPACE_FINGERPRINT", `${label} fingerprints do not bind their fields`);
  }
  return value;
}

function changedEntryPaths(leftEntries, rightEntries) {
  const left = new Map(leftEntries.map((entry) => [entry.path, entry.fingerprint]));
  const right = new Map(rightEntries.map((entry) => [entry.path, entry.fingerprint]));
  return [...new Set([...left.keys(), ...right.keys()])]
    .filter((file) => left.get(file) !== right.get(file))
    .sort();
}

export function diffContentBoundWorkspaces(before, after) {
  validateContentBoundWorkspace(before, "workspace before");
  validateContentBoundWorkspace(after, "workspace after");
  if (before.head_sha !== after.head_sha) {
    throw new ContractError("QUALITY_WORKSPACE_HEAD_CHANGED", "workspace HEAD changed during an authorized operation");
  }
  if (before.index_entry_count !== after.index_entry_count || before.index_fingerprint !== after.index_fingerprint) {
    throw new ContractError("QUALITY_WORKSPACE_INDEX_CHANGED", "workspace Git index changed during an authorized operation");
  }
  return Object.freeze(changedEntryPaths(before.entries, after.entries));
}

export function diffDeclaredWorkspaceOutputs(before, after) {
  validateContentBoundWorkspace(before, "workspace before");
  validateContentBoundWorkspace(after, "workspace after");
  return Object.freeze(changedEntryPaths(before.declared_output_entries, after.declared_output_entries));
}

export function normalizeNormalSessionOwnedPath(value, workspaceRoot, label, { allowHostPath = false } = {}) {
  assertString(value, label, { maxBytes: 4000 });
  const root = fs.realpathSync(path.resolve(workspaceRoot));
  let candidate = value;
  if (allowHostPath && path.isAbsolute(candidate)) {
    const absolute = path.resolve(candidate);
    if (!isInside(root, absolute)) throw new ContractError("QUALITY_WRITE_SCOPE_VIOLATION", `${label} escapes the worktree`);
    candidate = path.relative(root, absolute);
  }
  const slash = candidate.replaceAll("\\", "/");
  const normalized = normalizeRelativePath(slash, label);
  if (normalized !== slash || (!allowHostPath && normalized !== value) || path.isAbsolute(candidate)) {
    throw new ContractError("QUALITY_PATH_CANONICAL", `${label} must be a canonical relative path`);
  }
  if (normalized.split("/").some((component) => CONTROL_COMPONENTS.has(component.toLowerCase()))) {
    throw new ContractError("QUALITY_CONTROL_PATH", `${label} cannot target runner or Git control state`);
  }
  const resolved = path.resolve(root, ...normalized.split("/"));
  if (!isInside(root, resolved)) throw new ContractError("QUALITY_WRITE_SCOPE_VIOLATION", `${label} escapes the worktree`);
  let current = root;
  for (const component of normalized.split("/")) {
    current = path.join(current, component);
    let identity;
    try {
      identity = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw new ContractError("QUALITY_WORKSPACE_UNREADABLE", `${label} cannot be safely resolved`);
    }
    if (identity.isSymbolicLink()) throw new ContractError("QUALITY_PATH_CANONICAL", `${label} cannot traverse a symbolic link or junction`);
    if (identity.isFile() && identity.nlink > 1) throw new ContractError("QUALITY_PATH_CANONICAL", `${label} cannot target a multiply-linked file`);
    const canonical = fs.realpathSync(current);
    if (comparablePath(canonical) !== comparablePath(current)) {
      throw new ContractError("QUALITY_PATH_CANONICAL", `${label} cannot traverse a filesystem alias`);
    }
  }
  return normalized;
}
