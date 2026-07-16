import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  TRUSTED_TOOLCHAIN_HOST_CONFIG_FILENAME,
  TRUSTED_TOOLCHAIN_HOST_CONFIG_LIMITS,
  TRUSTED_TOOLCHAIN_HOST_CONFIG_SCHEMA_VERSION,
  TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION,
  assertTrustedToolchainHostConfigurationLeaseCurrent,
  loadTrustedToolchainHostConfigurationLease,
  parseTrustedToolchainHostConfiguration,
  validateTrustedToolchainHostConfiguration,
} from "../lib/quality/trusted-toolchain-host-config.mjs";
import { ContractError } from "../lib/quality/validation.mjs";

const repositoryRoot = fs.realpathSync(new URL("..", import.meta.url));

function expectCode(callback, code) {
  assert.throws(callback, (error) => error instanceof ContractError && error.code === code, `expected ${code}`);
}

function writeFile(file, contents, mode = 0o600) {
  fs.writeFileSync(file, contents, "utf8");
  if (process.platform !== "win32") fs.chmodSync(file, mode);
}

function fixtureConfiguration({ hostRoot, stateRoot }) {
  return {
    schema_version: TRUSTED_TOOLCHAIN_HOST_CONFIG_SCHEMA_VERSION,
    configuration_id: "host-fixture-v1",
    trusted_roots: [hostRoot],
    state_roots: {
      npm: path.join(stateRoot, "npm"),
      python: path.join(stateRoot, "python"),
      go: path.join(stateRoot, "go"),
      cargo: path.join(stateRoot, "cargo"),
      maven: path.join(stateRoot, "maven"),
      gradle: path.join(stateRoot, "gradle"),
    },
    candidates: {},
    auxiliary: {},
  };
}

const schema = JSON.parse(fs.readFileSync(
  path.join(repositoryRoot, "quality", "schemas", "toolchain-host-configuration.schema.json"),
  "utf8",
));
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.schema_version.const, TRUSTED_TOOLCHAIN_HOST_CONFIG_SCHEMA_VERSION);
assert.equal(schema.properties.candidates.additionalProperties, false);
assert.equal(schema.$defs.mavenCandidate.properties.kind.const, "maven_java_v3");
assert.deepEqual(schema.$defs.gradleCandidate.properties.layout.enum, ["legacy_launcher", "instrumented_launcher"]);
assert.match(schema.$comment, /never project input/u);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-toolchain-host-config-"));
const workspace = path.join(tempRoot, "workspace");
const configRoot = path.join(tempRoot, "installed-plugin");
const hostRoot = path.join(tempRoot, "trusted-code");
const stateRoot = path.join(tempRoot, "mutable-state");
for (const directory of [workspace, configRoot, hostRoot, stateRoot]) {
  fs.mkdirSync(directory, { recursive: true });
}
for (const stateId of ["npm", "python", "go", "cargo", "maven", "gradle"]) {
  fs.mkdirSync(path.join(stateRoot, stateId));
}
const anchor = path.join(configRoot, "global-quality-plugin.mjs");
writeFile(anchor, "export default {};\n", 0o700);
const anchorUrl = pathToFileURL(anchor);
const source = path.join(configRoot, TRUSTED_TOOLCHAIN_HOST_CONFIG_FILENAME);
const configuration = fixtureConfiguration({
  hostRoot: fs.realpathSync.native(hostRoot),
  stateRoot: fs.realpathSync.native(stateRoot),
});
const serialized = `${JSON.stringify(configuration)}\n`;

try {
  expectCode(() => loadTrustedToolchainHostConfigurationLease({
    anchorUrl,
    workspaceRoot: workspace,
    required: true,
  }), "QUALITY_TOOLCHAIN_HOST_CONFIG_MISSING");

  const absentLease = loadTrustedToolchainHostConfigurationLease({
    anchorUrl,
    workspaceRoot: workspace,
    required: false,
  });
  assert.equal(absentLease.source_kind, "built_in");
  assert.equal(absentLease.configuration, null);
  assert.equal(absentLease.resolution_policy_version, TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION);
  assert.doesNotThrow(() => assertTrustedToolchainHostConfigurationLeaseCurrent(absentLease));

  writeFile(source, serialized);
  expectCode(() => absentLease.reloadAndAssertCurrent(), "QUALITY_TOOLCHAIN_HOST_CONFIG_DRIFT");

  const validated = validateTrustedToolchainHostConfiguration(configuration, { workspaceRoot: workspace });
  assert(Object.isFrozen(validated));
  assert.equal(validated.configuration_id, configuration.configuration_id);
  assert.equal(validated.trusted_roots[0], fs.realpathSync.native(hostRoot));
  assert.equal(validated.state_roots.npm, fs.realpathSync.native(path.join(stateRoot, "npm")));
  assert.deepEqual(parseTrustedToolchainHostConfiguration(serialized, { workspaceRoot: workspace }), validated);

  const lease = loadTrustedToolchainHostConfigurationLease({
    anchorUrl,
    workspaceRoot: workspace,
    required: true,
  });
  assert.equal(lease.source_kind, "host_file");
  assert.equal(lease.source_path, fs.realpathSync.native(source));
  assert.match(lease.content_fingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.match(lease.effective_fingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(lease.source_identity.canonical_path, lease.source_path);
  assert.doesNotThrow(() => lease.reloadAndAssertCurrent());

  expectCode(() => parseTrustedToolchainHostConfiguration("{", { workspaceRoot: workspace }),
    "QUALITY_TOOLCHAIN_HOST_CONFIG_JSON");
  expectCode(() => parseTrustedToolchainHostConfiguration(
    " ".repeat(TRUSTED_TOOLCHAIN_HOST_CONFIG_LIMITS.max_bytes + 1),
    { workspaceRoot: workspace },
  ), "QUALITY_TOOLCHAIN_HOST_CONFIG_SIZE");
  expectCode(() => validateTrustedToolchainHostConfiguration({
    ...configuration,
    environment: { PATH: hostRoot },
  }, { workspaceRoot: workspace }), "CONTRACT_UNKNOWN_FIELD");
  expectCode(() => validateTrustedToolchainHostConfiguration({
    ...configuration,
    trusted_roots: [fs.realpathSync.native(workspace)],
  }, { workspaceRoot: workspace }), "QUALITY_TOOLCHAIN_HOST_CONFIG_SCOPE");
  expectCode(() => validateTrustedToolchainHostConfiguration({
    ...configuration,
    state_roots: { ...configuration.state_roots, npm: fs.realpathSync.native(hostRoot) },
  }, { workspaceRoot: workspace }), "QUALITY_TOOLCHAIN_HOST_CONFIG_SCOPE");
  const nestedStateRoot = path.join(configuration.state_roots.npm, "nested-gradle-state");
  fs.mkdirSync(nestedStateRoot);
  expectCode(() => validateTrustedToolchainHostConfiguration({
    ...configuration,
    state_roots: { ...configuration.state_roots, gradle: nestedStateRoot },
  }, { workspaceRoot: workspace }), "QUALITY_TOOLCHAIN_HOST_CONFIG_STATE");
  expectCode(() => validateTrustedToolchainHostConfiguration({
    ...configuration,
    state_roots: {
      ...configuration.state_roots,
      npm: nestedStateRoot,
      gradle: configuration.state_roots.npm,
    },
  }, { workspaceRoot: workspace }), "QUALITY_TOOLCHAIN_HOST_CONFIG_STATE");
  expectCode(() => validateTrustedToolchainHostConfiguration({
    ...configuration,
    state_roots: { ...configuration.state_roots, gradle: configuration.state_roots.npm },
  }, { workspaceRoot: workspace }), "QUALITY_TOOLCHAIN_HOST_CONFIG_STATE");
  if (process.platform === "win32") {
    expectCode(() => validateTrustedToolchainHostConfiguration({
      ...configuration,
      state_roots: {
        ...configuration.state_roots,
        gradle: path.join(configuration.state_roots.npm.toUpperCase(), "nested-gradle-state"),
      },
    }, { workspaceRoot: workspace }), "QUALITY_TOOLCHAIN_HOST_CONFIG_STATE");
  }

  const workspaceAnchor = path.join(workspace, "plugin.mjs");
  writeFile(workspaceAnchor, "export default {};\n", 0o700);
  writeFile(path.join(workspace, TRUSTED_TOOLCHAIN_HOST_CONFIG_FILENAME), serialized);
  expectCode(() => loadTrustedToolchainHostConfigurationLease({
    anchorUrl: pathToFileURL(workspaceAnchor),
    workspaceRoot: workspace,
    required: true,
  }), "QUALITY_TOOLCHAIN_HOST_CONFIG_SCOPE");

  const raceRoot = path.join(tempRoot, "race-plugin");
  fs.mkdirSync(raceRoot);
  const raceAnchor = path.join(raceRoot, "plugin.mjs");
  const raceSource = path.join(raceRoot, TRUSTED_TOOLCHAIN_HOST_CONFIG_FILENAME);
  writeFile(raceAnchor, "export default {};\n", 0o700);
  writeFile(raceSource, serialized);
  expectCode(() => loadTrustedToolchainHostConfigurationLease({
    anchorUrl: pathToFileURL(raceAnchor),
    workspaceRoot: workspace,
    required: true,
    testHooks: {
      afterRead: () => fs.appendFileSync(raceSource, " ", "utf8"),
    },
  }), "QUALITY_TOOLCHAIN_HOST_CONFIG_RACE");

  const replacement = path.join(configRoot, "previous-host-config.json");
  fs.renameSync(source, replacement);
  writeFile(source, serialized);
  expectCode(() => lease.reloadAndAssertCurrent(), "QUALITY_TOOLCHAIN_HOST_CONFIG_DRIFT");
  fs.rmSync(replacement);

  const hardlinkOriginal = path.join(configRoot, "hardlink-original.json");
  fs.renameSync(source, hardlinkOriginal);
  fs.linkSync(hardlinkOriginal, source);
  expectCode(() => loadTrustedToolchainHostConfigurationLease({
    anchorUrl,
    workspaceRoot: workspace,
    required: true,
  }), "QUALITY_TOOLCHAIN_HOST_CONFIG_HARDLINK");
  fs.rmSync(source);
  fs.renameSync(hardlinkOriginal, source);

  const aliasTarget = path.join(configRoot, "alias-target.json");
  fs.renameSync(source, aliasTarget);
  let aliasCreated = false;
  try {
    fs.symlinkSync(aliasTarget, source, "file");
    aliasCreated = true;
  } catch (error) {
    if (error?.code !== "EPERM") throw error;
  }
  if (aliasCreated) {
    expectCode(() => loadTrustedToolchainHostConfigurationLease({
      anchorUrl,
      workspaceRoot: workspace,
      required: true,
    }), "QUALITY_TOOLCHAIN_HOST_CONFIG_ALIAS");
    fs.rmSync(source);
  }
  fs.renameSync(aliasTarget, source);

  if (process.platform !== "win32") {
    fs.chmodSync(source, 0o666);
    expectCode(() => loadTrustedToolchainHostConfigurationLease({
      anchorUrl,
      workspaceRoot: workspace,
      required: true,
    }), "QUALITY_TOOLCHAIN_HOST_CONFIG_MODE");
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("Trusted toolchain fixed-source host configuration lease checks passed.");
