import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ContractError,
  assertExactKeys,
  assertSafeId,
  fingerprint,
} from "../feedback/contracts.mjs";
import {
  assertConfinedExistingPath,
  assertConfinedTree,
  ensureConfinedDirectory,
  isInside,
} from "../feedback/files.mjs";
import {
  TRUSTED_TOOLCHAIN_HOST_CONFIG_FILENAME,
  loadTrustedToolchainHostConfigurationLease,
} from "../quality/trusted-toolchain-host-config.mjs";
import {
  resolveFixedAuxiliaryGitExecutable,
  resolveTrustedToolchainInvocation,
} from "../quality/trusted-toolchains.mjs";
import {
  assertPortableContractPath,
  loadSyntheticContracts,
  resolveRepositoryEntry,
} from "./contracts.mjs";
import { createConfinedTemporaryDirectory } from "./isolation.mjs";

export const SYNTHETIC_PROFILE_MANIFEST_VERSION = 1;
export const SYNTHETIC_PROFILE_MANIFEST_NAME = "runtime-profile.v1.json";

const MAX_PROFILE_MANIFEST_BYTES = 256 * 1024;
const MAX_AUTH_SOURCE_BYTES = 64 * 1024;
const MAX_AUTH_PROJECTION_BYTES = 32 * 1024;
const MAX_AUTH_SECRET_CHARS = 16 * 1024;
const MAX_AUTH_METADATA_ENTRIES = 32;
const SYNTHETIC_HOST_TOOLCHAIN_CONFIGURATION_ID = "synthetic-benchmark-host-toolchains-v1";
export const SYNTHETIC_MODEL_RUNTIME_ENVIRONMENT_KEYS = Object.freeze([
  "AI_GATEWAY_API_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "AWS_ACCESS_KEY_ID",
  "AWS_BEARER_TOKEN_BEDROCK",
  "AWS_DEFAULT_REGION",
  "AWS_REGION",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_API_VERSION",
  "AZURE_OPENAI_ENDPOINT",
  "CEREBRAS_API_KEY",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "COHERE_API_KEY",
  "DATABRICKS_HOST",
  "DATABRICKS_TOKEN",
  "DEEPSEEK_API_KEY",
  "FIREWORKS_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_LOCATION",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENROUTER_API_KEY",
  "OPENCODE_AUTH_CONTENT",
  "PERPLEXITY_API_KEY",
  "TOGETHER_AI_API_KEY",
  "TOGETHER_API_KEY",
  "VERCEL_AI_GATEWAY_API_KEY",
  "XAI_API_KEY",
]);
const HOST_RUNTIME_ENVIRONMENT_KEYS = new Set([
  "COMSPEC",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "NODE_EXTRA_CA_CERTS",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "PATH",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL",
  "PROCESSOR_REVISION",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "TERM",
  "TZ",
  "WINDIR",
]);
const MODEL_RUNTIME_ENVIRONMENT_KEYS = new Set(
  SYNTHETIC_MODEL_RUNTIME_ENVIRONMENT_KEYS.filter(
    (key) => key !== "OPENCODE_AUTH_CONTENT",
  ),
);
const CONTROLLED_OPENCODE_ENVIRONMENT = Object.freeze({
  OPENCODE_AUTO_SHARE: "false",
  OPENCODE_DISABLE_AUTOUPDATE: "true",
  OPENCODE_DISABLE_CLAUDE_CODE: "true",
  OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: "true",
  OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "true",
  OPENCODE_DISABLE_DEFAULT_PLUGINS: "false",
  OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
  OPENCODE_DISABLE_MODELS_FETCH: "true",
  OPENCODE_ENABLE_EXA: "false",
});
const OPENCODE_GENERATED_CONFIG_ENTRIES = new Set([
  ".gitignore",
  "bun.lock",
  "bun.lockb",
  "node_modules",
  "package-lock.json",
  "package.json",
]);
const MODEL_VISIBLE_FORBIDDEN_TEXT = Object.freeze([
  /\bprofile-only\b/iu,
  /\binstrumented\b/iu,
  /\bprofile\s+mode\b/iu,
  /\b(?:control|treatment|evaluation)\s+arm\b/iu,
  /synthetic\s+benchmark/iu,
  /benchmark\s+final/iu,
  /NON-NEGOTIABLE ROOT ORDER/u,
  /OWNED_PUBLIC_PATH_REPLACE_BEFORE_TASK/u,
  /\bagent_outcome\b/u,
]);

export function assertNeutralSyntheticModelVisibleValue(value, label = "model-visible surface") {
  const seen = new Set();
  function inspect(current, currentLabel) {
    if (typeof current === "string") {
      for (const forbidden of MODEL_VISIBLE_FORBIDDEN_TEXT) {
        expect(
          !forbidden.test(current),
          "SYNTHETIC_PROFILE_PROMPT_LEAK",
          `${currentLabel} exposes evaluator-owned text`,
        );
      }
      return;
    }
    if (current === null || typeof current !== "object" || seen.has(current)) return;
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((entry, index) => inspect(entry, `${currentLabel}[${index}]`));
      return;
    }
    for (const [key, nested] of Object.entries(current)) {
      inspect(key, `${currentLabel} key`);
      inspect(nested, `${currentLabel}.${key}`);
    }
  }
  inspect(value, label);
  return true;
}
function fail(code, message) {
  throw new ContractError(code, message);
}

function expect(condition, code, message) {
  if (!condition) fail(code, message);
}

function plainObject(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}

function environmentValue(source, requestedKey) {
  const matches = Object.entries(source ?? {})
    .filter(([key]) => key.toUpperCase() === requestedKey);
  expect(
    matches.length <= 1,
    "SYNTHETIC_PROFILE_AUTH",
    "host authentication environment is ambiguous",
  );
  if (matches.length === 0) return null;
  const value = matches[0][1];
  expect(
    typeof value === "string",
    "SYNTHETIC_PROFILE_AUTH",
    "host authentication environment is invalid",
  );
  return value;
}

export function normalizeSyntheticOpenCodeProviderId(value) {
  expect(
    typeof value === "string",
    "SYNTHETIC_PROFILE_AUTH",
    "provider authentication selection is invalid",
  );
  const normalized = value.replace(/\/+$/u, "");
  expect(
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(normalized),
    "SYNTHETIC_PROFILE_AUTH",
    "provider authentication selection is invalid",
  );
  return normalized;
}

function boundedAuthString(value, {
  max = MAX_AUTH_SECRET_CHARS,
  nullable = false,
} = {}) {
  if (nullable && value === undefined) return undefined;
  expect(
    typeof value === "string" && value.length <= max,
    "SYNTHETIC_PROFILE_AUTH",
    "selected provider authentication is invalid",
  );
  return value;
}

function projectedMetadata(value) {
  if (value === undefined) return undefined;
  expect(
    plainObject(value)
      && Object.keys(value).length <= MAX_AUTH_METADATA_ENTRIES,
    "SYNTHETIC_PROFILE_AUTH",
    "selected provider authentication is invalid",
  );
  const projected = Object.create(null);
  for (const [key, entry] of Object.entries(value)) {
    expect(
      key.length > 0
        && key.length <= 128
        && typeof entry === "string"
        && entry.length <= 2_048,
      "SYNTHETIC_PROFILE_AUTH",
      "selected provider authentication is invalid",
    );
    projected[key] = entry;
  }
  return projected;
}

function projectAuthRecord(value) {
  expect(
    plainObject(value) && typeof value.type === "string",
    "SYNTHETIC_PROFILE_AUTH",
    "selected provider authentication is invalid",
  );
  if (value.type === "oauth") {
    const projected = {
      type: "oauth",
      refresh: boundedAuthString(value.refresh),
      access: boundedAuthString(value.access),
    };
    expect(
      Number.isSafeInteger(value.expires) && value.expires >= 0,
      "SYNTHETIC_PROFILE_AUTH",
      "selected provider authentication is invalid",
    );
    projected.expires = value.expires;
    const accountId = boundedAuthString(value.accountId, { max: 512, nullable: true });
    const enterpriseUrl = boundedAuthString(value.enterpriseUrl, {
      max: 2_048,
      nullable: true,
    });
    if (accountId !== undefined) projected.accountId = accountId;
    if (enterpriseUrl !== undefined) projected.enterpriseUrl = enterpriseUrl;
    return projected;
  }
  if (value.type === "api") {
    const projected = {
      type: "api",
      key: boundedAuthString(value.key),
    };
    const metadata = projectedMetadata(value.metadata);
    if (metadata !== undefined) projected.metadata = metadata;
    return projected;
  }
  if (value.type === "wellknown") {
    return {
      type: "wellknown",
      key: boundedAuthString(value.key),
      token: boundedAuthString(value.token),
    };
  }
  fail(
    "SYNTHETIC_PROFILE_AUTH",
    "selected provider authentication is invalid",
  );
}

function parseAuthSource(content) {
  expect(
    typeof content === "string"
      && Buffer.byteLength(content, "utf8") > 0
      && Buffer.byteLength(content, "utf8") <= MAX_AUTH_SOURCE_BYTES,
    "SYNTHETIC_PROFILE_AUTH",
    "host authentication source is invalid",
  );
  try {
    const parsed = JSON.parse(content);
    expect(
      plainObject(parsed),
      "SYNTHETIC_PROFILE_AUTH",
      "host authentication source is invalid",
    );
    return parsed;
  } catch (error) {
    if (error instanceof ContractError) throw error;
    fail(
      "SYNTHETIC_PROFILE_AUTH",
      "host authentication source is invalid",
    );
  }
}

function readOrdinaryBoundedAuthFile(filePath) {
  let descriptor;
  try {
    const identity = fs.lstatSync(filePath);
    expect(
      identity.isFile()
        && !identity.isSymbolicLink()
        && identity.size > 0
        && identity.size <= MAX_AUTH_SOURCE_BYTES,
      "SYNTHETIC_PROFILE_AUTH",
      "host authentication file is invalid",
    );
    const flags = fs.constants.O_RDONLY
      | (fs.constants.O_NOFOLLOW ?? 0);
    descriptor = fs.openSync(filePath, flags);
    const openedIdentity = fs.fstatSync(descriptor);
    expect(
      openedIdentity.isFile()
        && openedIdentity.size > 0
        && openedIdentity.size <= MAX_AUTH_SOURCE_BYTES,
      "SYNTHETIC_PROFILE_AUTH",
      "host authentication file is invalid",
    );
    const bytes = fs.readFileSync(descriptor);
    expect(
      bytes.length > 0 && bytes.length <= MAX_AUTH_SOURCE_BYTES,
      "SYNTHETIC_PROFILE_AUTH",
      "host authentication file is invalid",
    );
    return bytes.toString("utf8");
  } catch (error) {
    if (error instanceof ContractError) throw error;
    fail(
      "SYNTHETIC_PROFILE_AUTH",
      "host authentication file is invalid",
    );
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function hostAuthFileCandidates(sourceEnvironment) {
  const candidates = [];
  const append = (base, ...segments) => {
    if (typeof base !== "string" || base.length === 0 || !path.isAbsolute(base)) return;
    const candidate = path.resolve(base, ...segments);
    if (!candidates.some((entry) => comparablePath(entry) === comparablePath(candidate))) {
      candidates.push(candidate);
    }
  };
  append(environmentValue(sourceEnvironment, "XDG_DATA_HOME"), "opencode", "auth.json");
  const homeKeys = process.platform === "win32"
    ? ["USERPROFILE", "HOME"]
    : ["HOME", "USERPROFILE"];
  for (const key of homeKeys) {
    append(
      environmentValue(sourceEnvironment, key),
      ".local",
      "share",
      "opencode",
      "auth.json",
    );
  }
  append(environmentValue(sourceEnvironment, "LOCALAPPDATA"), "opencode", "auth.json");
  return candidates;
}

export function resolveSyntheticOpenCodeAuthContent({
  providerId,
  sourceEnvironment = process.env,
} = {}) {
  const normalizedProvider = normalizeSyntheticOpenCodeProviderId(providerId);
  const explicitContent = environmentValue(
    sourceEnvironment,
    "OPENCODE_AUTH_CONTENT",
  );
  let source = null;
  if (explicitContent !== null && explicitContent.trim().length > 0) {
    source = parseAuthSource(explicitContent);
  } else {
    for (const candidate of hostAuthFileCandidates(sourceEnvironment)) {
      if (!fs.existsSync(candidate)) continue;
      source = parseAuthSource(readOrdinaryBoundedAuthFile(candidate));
      break;
    }
  }
  if (source === null) return null;
  return projectSyntheticOpenCodeAuthContent({
    providerId: normalizedProvider,
    authContent: JSON.stringify(source),
  });
}

export function projectSyntheticOpenCodeAuthContent({
  providerId,
  authContent,
} = {}) {
  const normalizedProvider = normalizeSyntheticOpenCodeProviderId(providerId);
  const source = parseAuthSource(authContent);

  const matchingEntries = Object.entries(source)
    .filter(([key]) => {
      try {
        return normalizeSyntheticOpenCodeProviderId(key).toLowerCase()
          === normalizedProvider.toLowerCase();
      } catch {
        return false;
      }
    });
  expect(
    matchingEntries.length <= 1,
    "SYNTHETIC_PROFILE_AUTH",
    "provider authentication selection is ambiguous",
  );
  if (matchingEntries.length === 0) return null;
  const projected = JSON.stringify({
    [normalizedProvider]: projectAuthRecord(matchingEntries[0][1]),
  });
  expect(
    Buffer.byteLength(projected, "utf8") <= MAX_AUTH_PROJECTION_BYTES,
    "SYNTHETIC_PROFILE_AUTH",
    "selected provider authentication is invalid",
  );
  return projected;
}

function sha256File(filePath) {
  return `sha256:${createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
}

function comparablePath(value) {
  let normalized = path.normalize(value);
  if (process.platform === "win32" && normalized.startsWith("\\\\?\\UNC\\")) {
    normalized = `\\\\${normalized.slice(8)}`;
  } else if (process.platform === "win32" && normalized.startsWith("\\\\?\\")) {
    normalized = normalized.slice(4);
  }
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function listOrdinaryFiles(root, current = root, output = [], {
  excludeGeneratedConfigEntries = false,
} = {}) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(current, entry.name);
    const identity = fs.lstatSync(absolute);
    if (identity.isSymbolicLink()) fail("SYNTHETIC_PROFILE_SYMLINK", "profile sources must not contain symlinks");
    if (
      excludeGeneratedConfigEntries
      && current === root
      && OPENCODE_GENERATED_CONFIG_ENTRIES.has(entry.name)
    ) {
      expect(
        identity.isDirectory() || identity.isFile(),
        "SYNTHETIC_PROFILE_FILE_TYPE",
        "OpenCode-generated profile entries must be ordinary files or directories",
      );
      continue;
    }
    if (identity.isDirectory()) {
      listOrdinaryFiles(root, absolute, output, { excludeGeneratedConfigEntries });
    } else if (identity.isFile()) {
      output.push({
        path: path.relative(root, absolute).replaceAll("\\", "/"),
        fingerprint: sha256File(absolute),
      });
    } else {
      fail("SYNTHETIC_PROFILE_FILE_TYPE", "profile sources must contain only ordinary files and directories");
    }
  }
  return output;
}

export function assertNeutralSyntheticModelVisiblePrompt(configDirectory) {
  const roots = ["agents", "skills", "instructions"]
    .map((entry) => path.join(configDirectory, entry))
    .filter((entry) => fs.existsSync(entry));
  for (const root of roots) {
    for (const entry of listOrdinaryFiles(root)) {
      const file = path.join(root, entry.path.replaceAll("/", path.sep));
      const contents = fs.readFileSync(file, "utf8");
      assertNeutralSyntheticModelVisibleValue(contents, `model-visible prompt ${entry.path}`);
    }
  }
  return true;
}

function sourceEvidenceForFile(sourceRoot, relativePath, kind, id) {
  const source = resolveRepositoryEntry(sourceRoot, relativePath, { expectedKind: "file" });
  return {
    kind,
    id,
    source_path: relativePath,
    files: [{ path: path.basename(relativePath), fingerprint: sha256File(source) }],
  };
}

function resolveCanonicalQualityPlugin(sourceRoot) {
  const plugin = path.join(
    sourceRoot,
    "lib",
    "benchmark",
    "opencode-engineering-dossier-plugin.mjs",
  );
  assertConfinedExistingPath(sourceRoot, plugin, { type: "file" });
  const physical = fs.realpathSync.native(plugin);
  expect(
    isInside(sourceRoot, physical),
    "SYNTHETIC_PROFILE_PLUGIN",
    "canonical quality plugin resolves outside the repository",
  );
  return physical;
}

function resolveCanonicalContextBridgePlugin(sourceRoot) {
  const plugin = path.join(
    sourceRoot,
    "lib",
    "benchmark",
    "opencode-context-bridge-plugin.mjs",
  );
  assertConfinedExistingPath(sourceRoot, plugin, { type: "file" });
  const physical = fs.realpathSync.native(plugin);
  expect(
    isInside(sourceRoot, physical),
    "SYNTHETIC_PROFILE_PLUGIN",
    "synthetic context plugin resolves outside the repository",
  );
  return physical;
}

function sourceEvidenceForDirectory(sourceRoot, relativePath, kind, id) {
  assertPortableContractPath(relativePath, `${kind} source path`);
  const source = resolveRepositoryEntry(sourceRoot, relativePath, { expectedKind: "directory" });
  assertConfinedTree(sourceRoot, source);
  return {
    kind,
    id,
    source_path: relativePath,
    files: listOrdinaryFiles(source),
  };
}

function parseRuntimeConfig(configPath) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    expect(
      config && typeof config === "object" && !Array.isArray(config),
      "SYNTHETIC_PROFILE_CONFIG",
      "materialized OpenCode configuration must be a JSON object",
    );
    return config;
  } catch (error) {
    if (error instanceof ContractError) throw error;
    fail("SYNTHETIC_PROFILE_CONFIG", `materialized OpenCode configuration is invalid: ${error.message}`);
  }
}

function normalizedInstructionPath(configDirectory, value) {
  expect(
    typeof value === "string" && path.isAbsolute(value),
    "SYNTHETIC_PROFILE_CONFIG",
    "materialized instructions must use absolute runtime paths",
  );
  const resolved = path.resolve(value);
  expect(
    isInside(configDirectory, resolved),
    "SYNTHETIC_PROFILE_CONFIG",
    "materialized instruction resolves outside the isolated config directory",
  );
  assertConfinedExistingPath(configDirectory, resolved, { type: "file" });
  const relative = path.relative(configDirectory, resolved).replaceAll("\\", "/");
  assertPortableContractPath(relative, "materialized instruction path");
  return relative;
}

function runtimeSurfaceEvidence(configDirectory, configPath, sourceEntries) {
  const config = parseRuntimeConfig(configPath);
  const normalizedConfig = structuredClone(config);
  if (Object.hasOwn(normalizedConfig, "instructions")) {
    expect(
      Array.isArray(normalizedConfig.instructions),
      "SYNTHETIC_PROFILE_CONFIG",
      "materialized instructions must be an array",
    );
    normalizedConfig.instructions = normalizedConfig.instructions.map(
      (entry) => normalizedInstructionPath(configDirectory, entry),
    );
  }

  const expectedPlugins = sourceEntries.filter((entry) => entry.kind === "plugin");
  const pluginSources = [];
  if (Object.hasOwn(normalizedConfig, "plugin")) {
    expect(
      Array.isArray(normalizedConfig.plugin)
        && normalizedConfig.plugin.length === expectedPlugins.length,
      "SYNTHETIC_PROFILE_PLUGIN",
      "materialized plugin list does not match the selected profile",
    );
    normalizedConfig.plugin = normalizedConfig.plugin.map((entry, index) => {
      let pluginPath;
      try {
        const pluginUrl = new URL(entry);
        expect(
          pluginUrl.protocol === "file:",
          "SYNTHETIC_PROFILE_PLUGIN",
          "materialized plugins must use file URLs",
        );
        pluginPath = fileURLToPath(pluginUrl);
      } catch (error) {
        if (error instanceof ContractError) throw error;
        fail("SYNTHETIC_PROFILE_PLUGIN", "materialized plugin URL is invalid");
      }
      const identity = fs.lstatSync(pluginPath);
      expect(
        identity.isFile() && !identity.isSymbolicLink(),
        "SYNTHETIC_PROFILE_PLUGIN",
        "materialized plugin source must be an ordinary file",
      );
      const expectedPlugin = expectedPlugins[index];
      expect(
        expectedPlugin.files.length === 1,
        "SYNTHETIC_PROFILE_PLUGIN",
        "plugin source evidence must contain exactly one file",
      );
      const actualFingerprint = sha256File(pluginPath);
      expect(
        actualFingerprint === expectedPlugin.files[0].fingerprint,
        "SYNTHETIC_PROFILE_FINGERPRINT",
        "materialized plugin source changed after profile creation",
      );
      const evidence = {
        id: expectedPlugin.id,
        source_path: expectedPlugin.source_path,
        fingerprint: actualFingerprint,
      };
      pluginSources.push(evidence);
      return evidence;
    });
  } else {
    expect(
      expectedPlugins.length === 0,
      "SYNTHETIC_PROFILE_PLUGIN",
      "selected profile plugin is absent from the materialized configuration",
    );
  }

  const configRelativePath = path.relative(configDirectory, configPath).replaceAll("\\", "/");
  const materializedFiles = listOrdinaryFiles(
    configDirectory,
    configDirectory,
    [],
    { excludeGeneratedConfigEntries: true },
  )
    .filter((entry) => entry.path !== configRelativePath);
  return {
    schema_version: 1,
    effective_config: normalizedConfig,
    materialized_files: materializedFiles,
    plugin_sources: pluginSources,
  };
}

function copyOrdinaryFile(sourceRoot, relativePath, destination) {
  const source = resolveRepositoryEntry(sourceRoot, relativePath, { expectedKind: "file" });
  ensureConfinedDirectory(path.dirname(path.dirname(destination)), path.dirname(destination));
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
}

function primaryAgentWithoutLocalBashPermission(source, relativePath) {
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/u);
  expect(
    lines[0] === "---",
    "SYNTHETIC_PROFILE_AGENT_PERMISSION",
    `${relativePath} must start with YAML frontmatter`,
  );
  const frontmatterEnd = lines.indexOf("---", 1);
  expect(
    frontmatterEnd > 1,
    "SYNTHETIC_PROFILE_AGENT_PERMISSION",
    `${relativePath} has incomplete YAML frontmatter`,
  );
  const permissionIndex = lines.slice(1, frontmatterEnd)
    .findIndex((line) => line === "permission:") + 1;
  expect(
    permissionIndex > 0,
    "SYNTHETIC_PROFILE_AGENT_PERMISSION",
    `${relativePath} lacks an explicit permission block`,
  );
  let permissionEnd = frontmatterEnd;
  for (let index = permissionIndex + 1; index < frontmatterEnd; index += 1) {
    if (/^\S/u.test(lines[index])) {
      permissionEnd = index;
      break;
    }
  }
  const bashOffsets = lines
    .slice(permissionIndex + 1, permissionEnd)
    .map((line, index) => ({ line, index: permissionIndex + 1 + index }))
    .filter((entry) => entry.line === "  bash:");
  expect(
    bashOffsets.length === 1,
    "SYNTHETIC_PROFILE_AGENT_PERMISSION",
    `${relativePath} must contain exactly one permission.bash block`,
  );
  const bashStart = bashOffsets[0].index;
  let bashEnd = permissionEnd;
  for (let index = bashStart + 1; index < permissionEnd; index += 1) {
    if (/^  \S/u.test(lines[index])) {
      bashEnd = index;
      break;
    }
  }
  lines.splice(bashStart, bashEnd - bashStart);
  return lines.join(lineEnding);
}

function copyBenchmarkAgentFile(sourceRoot, role, destination) {
  if (role.kind !== "repository-primary") {
    copyOrdinaryFile(sourceRoot, role.prompt_path, destination);
    return;
  }
  const source = resolveRepositoryEntry(sourceRoot, role.prompt_path, { expectedKind: "file" });
  ensureConfinedDirectory(path.dirname(path.dirname(destination)), path.dirname(destination));
  const content = primaryAgentWithoutLocalBashPermission(
    fs.readFileSync(source, "utf8"),
    role.prompt_path,
  );
  fs.writeFileSync(destination, content, { encoding: "utf8", flag: "wx" });
}

function copyOrdinaryDirectory(sourceRoot, relativePath, destination, profileRoot) {
  const source = resolveRepositoryEntry(sourceRoot, relativePath, { expectedKind: "directory" });
  assertConfinedTree(sourceRoot, source);
  ensureConfinedDirectory(profileRoot, path.dirname(destination));
  fs.cpSync(source, destination, { recursive: true, errorOnExist: true });
  assertConfinedTree(profileRoot, destination);
}

function safeBenchmarkPermission(sourceRoot, profileId) {
  const sourceConfigPath = resolveRepositoryEntry(sourceRoot, "opencode.json", {
    expectedKind: "file",
  });
  const sourceConfig = JSON.parse(fs.readFileSync(sourceConfigPath, "utf8"));
  const permission = structuredClone(sourceConfig.permission ?? {});
  permission.external_directory = "deny";
  permission.edit = "allow";
  permission.webfetch = "deny";
  permission.websearch = "deny";
  permission["oc_learning_*"] = "deny";
  permission["quality_*"] = profileId === "instrumented" ? "allow" : "deny";
  permission.bash = {
    ...(permission.bash ?? {}),
    "node --test": "allow",
    "node --test *": "allow",
  };
  return permission;
}

function materializeSyntheticHostToolchainConfiguration({
  sourceRoot,
  configDirectory,
}) {
  const nodeExecutable = fs.realpathSync.native(process.execPath);
  const nodeName = path.basename(nodeExecutable).toLowerCase();
  expect(
    ["node", "node.exe"].includes(nodeName),
    "SYNTHETIC_PROFILE_TOOLCHAIN",
    "synthetic profile materialization must run under a real Node executable",
  );
  const gitExecutable = resolveFixedAuxiliaryGitExecutable(sourceRoot);
  const trustedRoots = [...new Map([
    fs.realpathSync.native(path.dirname(nodeExecutable)),
    fs.realpathSync.native(path.dirname(gitExecutable)),
  ].map((entry) => [comparablePath(entry), entry])).values()]
    .sort((left, right) => comparablePath(left).localeCompare(comparablePath(right)));
  const configuration = {
    schema_version: 1,
    configuration_id: SYNTHETIC_HOST_TOOLCHAIN_CONFIGURATION_ID,
    trusted_roots: trustedRoots,
    state_roots: {},
    candidates: {
      node: [{ kind: "direct", executable_path: nodeExecutable }],
    },
    auxiliary: {
      git: { kind: "direct", executable_path: gitExecutable },
    },
  };
  const configurationPath = path.join(
    configDirectory,
    TRUSTED_TOOLCHAIN_HOST_CONFIG_FILENAME,
  );
  fs.writeFileSync(configurationPath, `${JSON.stringify(configuration, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  if (process.platform !== "win32") {
    const configurationMode = fs.lstatSync(configurationPath).mode & 0o777;
    expect(
      configurationMode === 0o600,
      "SYNTHETIC_PROFILE_TOOLCHAIN",
      "synthetic host toolchain configuration must be owner-readable and owner-writable only",
    );
  }
  const lease = loadTrustedToolchainHostConfigurationLease({
    anchorUrl: pathToFileURL(configurationPath),
    workspaceRoot: sourceRoot,
    required: true,
  });
  resolveTrustedToolchainInvocation({
    toolchainMap: {
      schema_version: 1,
      map_id: "synthetic-benchmark-host-preflight-v1",
      toolchains: [{ executable_id: "node", resolver: "node" }],
    },
    executableId: "node",
    argv: ["--test"],
    workspaceRoot: sourceRoot,
    hostConfigurationLease: lease,
  });
  return configurationPath;
}

function buildProfileEvidence({
  contracts,
  profile,
  policy,
  roles,
  skills,
  sources,
  runtimeSurface,
}) {
  return {
    schema_version: SYNTHETIC_PROFILE_MANIFEST_VERSION,
    inventory_fingerprint: contracts.fingerprints.inventory,
    profiles_fingerprint: contracts.fingerprints.profiles,
    profile: structuredClone(profile),
    permission_policy: structuredClone(policy),
    roles: roles.map((entry) => structuredClone(entry)),
    skills: skills.map((entry) => structuredClone(entry)),
    source_entries: sources,
    overlay_fingerprint: null,
    runtime_surface: runtimeSurface,
  };
}

function manifestDirectories() {
  return {
    home: "home",
    config: "config/opencode",
    data: "data",
    cache: "cache",
    state: "state",
    appdata: "appdata",
    local_appdata: "local-appdata",
    temporary: "tmp",
  };
}

function assertFingerprint(value, label) {
  expect(
    typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value),
    "SYNTHETIC_PROFILE_FINGERPRINT",
    `${label} must be a sha256 fingerprint`,
  );
  return value;
}

function parseManifest(manifestPath) {
  const identity = fs.lstatSync(manifestPath);
  expect(identity.isFile() && !identity.isSymbolicLink(), "SYNTHETIC_PROFILE_MANIFEST", "profile manifest must be an ordinary file");
  expect(identity.size > 0 && identity.size <= MAX_PROFILE_MANIFEST_BYTES, "SYNTHETIC_PROFILE_MANIFEST", "profile manifest exceeds its byte limit");
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail("SYNTHETIC_PROFILE_MANIFEST", `profile manifest must be valid JSON: ${error.message}`);
  }
}

export function materializeSyntheticProfile({
  sourceRoot,
  profileId,
} = {}) {
  assertSafeId(profileId, "profileId");
  const canonicalSourceRoot = fs.realpathSync.native(path.resolve(sourceRoot));
  const contracts = loadSyntheticContracts(canonicalSourceRoot);
  const profile = contracts.inventory.profiles.find((entry) => entry.id === profileId);
  expect(profile !== undefined, "SYNTHETIC_PROFILE_UNKNOWN", `unknown synthetic profile: ${profileId}`);
  const policy = contracts.inventory.permission_policies.find(
    (entry) => entry.id === profile.permission_policy_id,
  );
  expect(policy !== undefined, "SYNTHETIC_PROFILE_POLICY", `profile permission policy is unavailable: ${profile.permission_policy_id}`);
  const roleIndex = new Map(contracts.inventory.roles.map((entry) => [entry.id, entry]));
  const skillIndex = new Map(contracts.inventory.skills.map((entry) => [entry.id, entry]));
  const roles = profile.role_ids.map((roleId) => roleIndex.get(roleId));
  const skills = profile.skill_ids.map((skillId) => skillIndex.get(skillId));
  expect(roles.every(Boolean) && skills.every(Boolean), "SYNTHETIC_PROFILE_REFERENCE", "profile references unresolved roles or skills");

  const sources = [];
  for (const role of roles) {
    if (role.prompt_path !== null) {
      sources.push(sourceEvidenceForFile(canonicalSourceRoot, role.prompt_path, "agent", role.id));
    }
  }
  for (const skill of skills) {
    const skillDirectory = path.posix.dirname(skill.path);
    sources.push(sourceEvidenceForDirectory(canonicalSourceRoot, skillDirectory, "skill", skill.id));
  }
  const pluginPaths = [];
  if (profileId === "instrumented") {
    const qualityPluginPath = resolveCanonicalQualityPlugin(canonicalSourceRoot);
    pluginPaths.push(qualityPluginPath);
    sources.push({
      kind: "plugin",
      id: "engineering-dossier",
      source_path: "lib/benchmark/opencode-engineering-dossier-plugin.mjs",
      files: [{
        path: "opencode-engineering-dossier-plugin.mjs",
        fingerprint: sha256File(qualityPluginPath),
      }],
    });
    const contextPluginPath = resolveCanonicalContextBridgePlugin(canonicalSourceRoot);
    assertConfinedExistingPath(canonicalSourceRoot, contextPluginPath, { type: "file" });
    sources.push(sourceEvidenceForFile(
      canonicalSourceRoot,
      "lib/benchmark/opencode-context-bridge-plugin.mjs",
      "plugin-dependency",
      "context-bridge",
    ));
  }
  const credentialFirewallRelativePath = "lib/benchmark/opencode-model-env-firewall.mjs";
  const credentialFirewallPath = resolveRepositoryEntry(
    canonicalSourceRoot,
    credentialFirewallRelativePath,
    { expectedKind: "file" },
  );
  pluginPaths.push(credentialFirewallPath);
  sources.push(sourceEvidenceForFile(
    canonicalSourceRoot,
    credentialFirewallRelativePath,
    "plugin",
    "credential-firewall",
  ));

  const temporaryRoot = createConfinedTemporaryDirectory(
    "opencode-runtime-",
    {
      contractCode: "SYNTHETIC_PROFILE_TEMP_ROOT",
      contractMessage: "profile environment must be a canonical temporary directory",
    },
  );
  const directories = manifestDirectories();
  try {
    for (const relativePath of Object.values(directories)) {
      ensureConfinedDirectory(temporaryRoot, path.join(temporaryRoot, relativePath));
    }
    const configDirectory = path.join(temporaryRoot, directories.config);
    if (profileId === "instrumented") {
      materializeSyntheticHostToolchainConfiguration({
        sourceRoot: canonicalSourceRoot,
        configDirectory,
      });
    }
    for (const role of roles) {
      if (role.prompt_path === null) continue;
      copyBenchmarkAgentFile(
        canonicalSourceRoot,
        role,
        path.join(configDirectory, "agents", `${role.id}.md`),
      );
    }
    for (const skill of skills) {
      copyOrdinaryDirectory(
        canonicalSourceRoot,
        path.posix.dirname(skill.path),
        path.join(configDirectory, "skills", skill.id),
        temporaryRoot,
      );
    }
    assertNeutralSyntheticModelVisiblePrompt(configDirectory);
    const config = {
      $schema: "https://opencode.ai/config.json",
      default_agent: profile.primary_role_id,
      permission: safeBenchmarkPermission(canonicalSourceRoot, profileId),
      snapshot: false,
    };
    config.plugin = pluginPaths.map((pluginPath) => pathToFileURL(pluginPath).href);
    const configPath = path.join(temporaryRoot, "opencode.json");
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    const runtimeSurface = runtimeSurfaceEvidence(configDirectory, configPath, sources);
    const profileEvidence = buildProfileEvidence({
      contracts,
      profile,
      policy,
      roles,
      skills,
      sources,
      runtimeSurface,
    });
    const profileFingerprint = fingerprint(profileEvidence);
    const manifest = {
      schema_version: SYNTHETIC_PROFILE_MANIFEST_VERSION,
      profile_id: profile.id,
      primary_agent_id: profile.primary_role_id,
      profile_fingerprint: profileFingerprint,
      profile_evidence: profileEvidence,
      config_path: "opencode.json",
      directories,
      copied_entry_count: sources.length,
      runtime_config_fingerprint: sha256File(configPath),
    };
    const manifestPath = path.join(temporaryRoot, SYNTHETIC_PROFILE_MANIFEST_NAME);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    assertConfinedTree(temporaryRoot, temporaryRoot);
    return Object.freeze({
      root: temporaryRoot,
      manifestPath,
      configPath,
      configDirectory,
      profileId: profile.id,
      primaryAgentId: profile.primary_role_id,
      profileFingerprint,
      profileEvidence: Object.freeze(profileEvidence),
    });
  } catch (error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

export function readSyntheticProfileManifest(manifestPath) {
  expect(
    typeof manifestPath === "string" && path.isAbsolute(manifestPath),
    "SYNTHETIC_PROFILE_MANIFEST",
    "profile manifest path must be absolute",
  );
  const resolvedManifest = path.resolve(manifestPath);
  expect(
    path.basename(resolvedManifest) === SYNTHETIC_PROFILE_MANIFEST_NAME,
    "SYNTHETIC_PROFILE_MANIFEST",
    `profile manifest must be named ${SYNTHETIC_PROFILE_MANIFEST_NAME}`,
  );
  const root = path.dirname(resolvedManifest);
  const canonicalRoot = fs.realpathSync.native(root);
  expect(
    comparablePath(canonicalRoot) === comparablePath(root),
    "SYNTHETIC_PROFILE_MANIFEST",
    "profile root must be physically canonical",
  );
  assertConfinedExistingPath(canonicalRoot, resolvedManifest, { type: "file" });
  assertConfinedTree(canonicalRoot, canonicalRoot);
  const manifest = parseManifest(resolvedManifest);
  assertExactKeys(manifest, {
    allowed: [
      "schema_version",
      "profile_id",
      "primary_agent_id",
      "profile_fingerprint",
      "profile_evidence",
      "config_path",
      "directories",
      "copied_entry_count",
      "runtime_config_fingerprint",
    ],
    required: [
      "schema_version",
      "profile_id",
      "primary_agent_id",
      "profile_fingerprint",
      "profile_evidence",
      "config_path",
      "directories",
      "copied_entry_count",
      "runtime_config_fingerprint",
    ],
  }, "synthetic profile manifest");
  expect(
    manifest.schema_version === SYNTHETIC_PROFILE_MANIFEST_VERSION,
    "SYNTHETIC_PROFILE_MANIFEST",
    "profile manifest schema version is unsupported",
  );
  assertSafeId(manifest.profile_id, "profile manifest.profile_id");
  assertSafeId(manifest.primary_agent_id, "profile manifest.primary_agent_id");
  assertFingerprint(manifest.profile_fingerprint, "profile manifest.profile_fingerprint");
  assertFingerprint(manifest.runtime_config_fingerprint, "profile manifest.runtime_config_fingerprint");
  expect(
    manifest.profile_fingerprint === fingerprint(manifest.profile_evidence),
    "SYNTHETIC_PROFILE_FINGERPRINT",
    "profile manifest evidence does not match its fingerprint",
  );
  assertPortableContractPath(manifest.config_path, "profile manifest.config_path");
  assertExactKeys(manifest.directories, {
    allowed: Object.keys(manifestDirectories()),
    required: Object.keys(manifestDirectories()),
  }, "profile manifest.directories");
  const resolvedDirectories = {};
  for (const [id, relativePath] of Object.entries(manifest.directories)) {
    assertPortableContractPath(relativePath, `profile manifest.directories.${id}`);
    const absolute = path.resolve(canonicalRoot, ...relativePath.split("/"));
    expect(isInside(canonicalRoot, absolute), "SYNTHETIC_PROFILE_MANIFEST", "profile directory escapes its root");
    assertConfinedExistingPath(canonicalRoot, absolute, { type: "directory" });
    resolvedDirectories[id] = absolute;
  }
  const configPath = path.resolve(canonicalRoot, ...manifest.config_path.split("/"));
  assertConfinedExistingPath(canonicalRoot, configPath, { type: "file" });
  expect(
    sha256File(configPath) === manifest.runtime_config_fingerprint,
    "SYNTHETIC_PROFILE_CONFIG_STALE",
    "materialized OpenCode configuration does not match its manifest",
  );
  expect(
    manifest.profile_evidence
      && typeof manifest.profile_evidence === "object"
      && !Array.isArray(manifest.profile_evidence)
      && manifest.profile_evidence.runtime_surface
      && typeof manifest.profile_evidence.runtime_surface === "object"
      && !Array.isArray(manifest.profile_evidence.runtime_surface),
    "SYNTHETIC_PROFILE_FINGERPRINT",
    "profile runtime surface evidence is missing",
  );
  const actualRuntimeSurface = runtimeSurfaceEvidence(
    resolvedDirectories.config,
    configPath,
    manifest.profile_evidence.source_entries ?? [],
  );
  expect(
    fingerprint(actualRuntimeSurface) === fingerprint(manifest.profile_evidence.runtime_surface),
    "SYNTHETIC_PROFILE_FINGERPRINT",
    "materialized profile bytes do not match the bound runtime surface",
  );
  expect(
    Number.isSafeInteger(manifest.copied_entry_count) && manifest.copied_entry_count >= 0,
    "SYNTHETIC_PROFILE_MANIFEST",
    "profile copied_entry_count must be a non-negative integer",
  );
  return Object.freeze({
    root: canonicalRoot,
    manifestPath: resolvedManifest,
    configPath,
    configDirectory: resolvedDirectories.config,
    directories: Object.freeze(resolvedDirectories),
    profileId: manifest.profile_id,
    primaryAgentId: manifest.primary_agent_id,
    profileFingerprint: manifest.profile_fingerprint,
    profileEvidence: Object.freeze(manifest.profile_evidence),
  });
}

export function assertSyntheticProfileRuntimeBinding(materialized, expectedOpenCodeVersion) {
  expect(
    materialized
      && typeof materialized === "object"
      && typeof materialized.root === "string"
      && typeof materialized.configPath === "string"
      && typeof materialized.configDirectory === "string"
      && materialized.profileEvidence
      && typeof materialized.profileEvidence === "object",
    "SYNTHETIC_PROFILE_RUNTIME",
    "materialized profile runtime binding is invalid",
  );
  expect(
    typeof expectedOpenCodeVersion === "string"
      && /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9._-]+)?$/u.test(expectedOpenCodeVersion),
    "SYNTHETIC_PROFILE_RUNTIME",
    "OpenCode bootstrap version is invalid",
  );
  assertConfinedExistingPath(materialized.root, materialized.configPath, { type: "file" });
  assertConfinedExistingPath(materialized.root, materialized.configDirectory, { type: "directory" });
  const actualRuntimeSurface = runtimeSurfaceEvidence(
    materialized.configDirectory,
    materialized.configPath,
    materialized.profileEvidence.source_entries ?? [],
  );
  expect(
    fingerprint(actualRuntimeSurface) === fingerprint(materialized.profileEvidence.runtime_surface),
    "SYNTHETIC_PROFILE_FINGERPRINT",
    "OpenCode bootstrap changed fingerprint-bound profile bytes",
  );
  const pluginPackagePath = path.join(
    materialized.configDirectory,
    "node_modules",
    "@opencode-ai",
    "plugin",
    "package.json",
  );
  assertConfinedExistingPath(materialized.configDirectory, pluginPackagePath, { type: "file" });
  const packageIdentity = fs.lstatSync(pluginPackagePath);
  expect(
    packageIdentity.size > 0 && packageIdentity.size <= 64 * 1024,
    "SYNTHETIC_PROFILE_RUNTIME",
    "installed OpenCode plugin package metadata is unbounded",
  );
  let packageMetadata;
  try {
    packageMetadata = JSON.parse(fs.readFileSync(pluginPackagePath, "utf8"));
  } catch {
    fail("SYNTHETIC_PROFILE_RUNTIME", "installed OpenCode plugin package metadata is invalid");
  }
  expect(
    packageMetadata?.name === "@opencode-ai/plugin"
      && packageMetadata.version === expectedOpenCodeVersion,
    "SYNTHETIC_PROFILE_RUNTIME",
    "installed OpenCode plugin package does not match the selected CLI",
  );
  return true;
}

export function isolatedSyntheticProfileEnvironment(
  materialized,
  source = process.env,
  { includeModelCredentials = true } = {},
) {
  expect(
    typeof includeModelCredentials === "boolean",
    "SYNTHETIC_PROFILE_ENVIRONMENT",
    "model credential inclusion must be boolean",
  );
  const environment = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    const normalizedKey = key.toUpperCase();
    if (
      typeof value === "string"
      && (HOST_RUNTIME_ENVIRONMENT_KEYS.has(normalizedKey)
        || (includeModelCredentials
          && MODEL_RUNTIME_ENVIRONMENT_KEYS.has(normalizedKey)))
    ) {
      environment[key] = value;
    }
  }
  Object.assign(environment, {
    HOME: materialized.directories.home,
    USERPROFILE: materialized.directories.home,
    XDG_CONFIG_HOME: path.dirname(materialized.directories.config),
    XDG_DATA_HOME: materialized.directories.data,
    XDG_CACHE_HOME: materialized.directories.cache,
    XDG_STATE_HOME: materialized.directories.state,
    APPDATA: materialized.directories.appdata,
    LOCALAPPDATA: materialized.directories.local_appdata,
    TMP: materialized.directories.temporary,
    TEMP: materialized.directories.temporary,
    TMPDIR: materialized.directories.temporary,
    OPENCODE_CONFIG: materialized.configPath,
    OPENCODE_CONFIG_DIR: materialized.configDirectory,
    ...CONTROLLED_OPENCODE_ENVIRONMENT,
    CI: "1",
  });
  return Object.freeze(environment);
}

export function cleanupSyntheticProfile(materialized) {
  const root = typeof materialized === "string" ? materialized : materialized?.root;
  expect(typeof root === "string" && path.isAbsolute(root), "SYNTHETIC_PROFILE_CLEANUP", "profile cleanup root must be absolute");
  const canonicalTemporaryRoot = fs.realpathSync.native(path.resolve(os.tmpdir()));
  const canonicalRoot = fs.realpathSync.native(path.resolve(root));
  expect(
    isInside(canonicalTemporaryRoot, canonicalRoot)
      && path.basename(canonicalRoot).startsWith("opencode-runtime-"),
    "SYNTHETIC_PROFILE_CLEANUP",
    "profile cleanup is confined to an owned runtime temporary root",
  );
  fs.rmSync(canonicalRoot, { recursive: true, force: true });
}
