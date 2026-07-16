import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  TRUSTED_TOOLCHAIN_HOST_CONFIG_FILENAME,
  loadTrustedToolchainHostConfigurationLease,
} from "../lib/quality/trusted-toolchain-host-config.mjs";
import {
  TRUSTED_TOOLCHAIN_LIMITS,
  TRUSTED_TOOLCHAIN_MAP_PATH,
  TRUSTED_TOOLCHAIN_RESOLVERS,
  TRUSTED_MACOS_NPM_SCRIPT_SHELL_PATH,
  assertProtectedMacosFixedExecutable,
  assertTrustedToolchainCommandBinding,
  assertTrustedToolchainInvocationCurrent,
  loadTrustedToolchainMap,
  parseTrustedToolchainMap,
  resolveTrustedToolchainInvocation,
  trustedBuiltInCandidateRoots,
  trustedToolchainMapFingerprint,
  validateTrustedToolchainArguments,
  validateTrustedToolchainMap,
} from "../lib/quality/trusted-toolchains.mjs";
import { ContractError } from "../lib/quality/validation.mjs";

const repositoryRoot = fs.realpathSync(new URL("..", import.meta.url));
const trustedToolchainsSource = fs.readFileSync(
  new URL("../lib/quality/trusted-toolchains.mjs", import.meta.url),
  "utf8",
);
const fixedMacosGitCandidate = trustedToolchainsSource.indexOf(
  'return ["/usr/local/libexec/opencode-quality-git/bin/git"];',
);
const protectedMacosToolStart = trustedToolchainsSource.indexOf("function assertProtectedMacosFixedExecutable");
const resolveFixedGitStart = trustedToolchainsSource.indexOf("function resolveFixedGit");
const resolveFixedGitEnd = trustedToolchainsSource.indexOf("function validatedLease", resolveFixedGitStart);
const resolveFixedGitSource = trustedToolchainsSource.slice(resolveFixedGitStart, resolveFixedGitEnd);
assert(fixedMacosGitCandidate >= 0
  && resolveFixedGitStart > fixedMacosGitCandidate
  && resolveFixedGitEnd > resolveFixedGitStart
  && !resolveFixedGitSource.includes("QUALITY_TOOLCHAIN_ALIAS")
  && resolveFixedGitSource.includes('process.platform !== "darwin"'),
"macOS fixed Git must use the exact protected path and must not hide alias drift with a fallback");
const protectedMacosToolSource = trustedToolchainsSource.slice(protectedMacosToolStart, resolveFixedGitStart);
assert(protectedMacosToolStart >= 0
  && resolveFixedGitStart > protectedMacosToolStart
  && protectedMacosToolSource.includes("stat.uid !== 0n")
  && protectedMacosToolSource.includes("stat.nlink !== 1n")
  && protectedMacosToolSource.includes("0o7777n) !== 0o555n")
  && protectedMacosToolSource.includes("0o022n) !== 0n")
  && protectedMacosToolSource.includes("operations.writable")
  && resolveFixedGitSource.includes('assertProtectedMacosFixedExecutable(candidate, "trusted fixed auxiliary Git")'),
"macOS fixed host executables must fail closed on wrong ownership, mode, links, or writable ancestry");
assert.equal(
  TRUSTED_MACOS_NPM_SCRIPT_SHELL_PATH,
  "/usr/local/libexec/opencode-quality-shell/bin/sh",
  "macOS npm must use the exact protected fixed script shell",
);
const resolveFixedNpmShellStart = trustedToolchainsSource.indexOf("function resolveFixedNpmScriptShell");
const resolveFixedNpmShellEnd = trustedToolchainsSource.indexOf("function validatedLease", resolveFixedNpmShellStart);
const resolveFixedNpmShellSource = trustedToolchainsSource.slice(resolveFixedNpmShellStart, resolveFixedNpmShellEnd);
assert(resolveFixedNpmShellStart >= 0
  && resolveFixedNpmShellEnd > resolveFixedNpmShellStart
  && resolveFixedNpmShellSource.includes("TRUSTED_MACOS_NPM_SCRIPT_SHELL_PATH")
  && resolveFixedNpmShellSource.includes("assertProtectedMacosFixedExecutable")
  && resolveFixedNpmShellSource.includes('rolePrefix: "npm_script_shell_"'),
"macOS npm script shell must be direct and identity-bound");
const mavenResolverOwnedProperties = Object.freeze([
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
]);

function expectCode(callback, code) {
  assert.throws(callback, (error) => error instanceof ContractError && error.code === code, `expected ${code}`);
}

function protectedMacosFixture({
  leafOwner = 0n,
  leafMode = 0o555n,
  leafLinks = 1n,
  parentOwner = 0n,
  parentMode = 0o755n,
  writable = null,
  alias = null,
  realpathAlias = false,
} = {}) {
  const leaf = path.join(path.parse(repositoryRoot).root, "opencode-protected-fixture", "bin", "sh");
  const parent = path.dirname(leaf);
  const comparable = (value) => process.platform === "win32" ? value.toLowerCase() : value;
  const same = (left, right) => left !== null && right !== null && comparable(left) === comparable(right);
  return {
    leaf,
    parent,
    operations: {
      platform: "darwin",
      realpathSync: (candidate) => realpathAlias && same(candidate, leaf)
        ? path.join(parent, "aliased-sh")
        : candidate,
      lstatSync: (candidate) => {
        const isLeaf = same(candidate, leaf);
        const isParent = same(candidate, parent);
        return {
          uid: isLeaf ? leafOwner : isParent ? parentOwner : 0n,
          nlink: isLeaf ? leafLinks : 1n,
          mode: isLeaf ? leafMode : isParent ? parentMode : 0o755n,
          isFile: () => isLeaf,
          isDirectory: () => !isLeaf,
          isSymbolicLink: () => same(candidate, alias),
        };
      },
      writable: (candidate) => same(candidate, writable),
    },
  };
}

const protectedFixture = protectedMacosFixture();
assert.doesNotThrow(() => assertProtectedMacosFixedExecutable(
  protectedFixture.leaf,
  "protected fixture",
  protectedFixture.operations,
));
for (const [overrides, code] of [
  [{ leafOwner: 501n }, "QUALITY_TOOLCHAIN_UNTRUSTED_ROOT"],
  [{ leafMode: 0o755n }, "QUALITY_TOOLCHAIN_UNTRUSTED_ROOT"],
  [{ leafLinks: 2n }, "QUALITY_TOOLCHAIN_UNTRUSTED_ROOT"],
  [{ writable: protectedFixture.leaf }, "QUALITY_TOOLCHAIN_UNTRUSTED_ROOT"],
  [{ parentOwner: 501n }, "QUALITY_TOOLCHAIN_UNTRUSTED_ROOT"],
  [{ parentMode: 0o777n }, "QUALITY_TOOLCHAIN_UNTRUSTED_ROOT"],
  [{ writable: protectedFixture.parent }, "QUALITY_TOOLCHAIN_UNTRUSTED_ROOT"],
  [{ alias: protectedFixture.parent }, "QUALITY_TOOLCHAIN_ALIAS"],
  [{ realpathAlias: true }, "QUALITY_TOOLCHAIN_ALIAS"],
]) {
  const fixture = protectedMacosFixture(overrides);
  expectCode(
    () => assertProtectedMacosFixedExecutable(fixture.leaf, "protected fixture", fixture.operations),
    code,
  );
}

function map(toolchains = [
  { executable_id: "node", resolver: "node" },
  { executable_id: "npm", resolver: "npm" },
]) {
  return { schema_version: 1, map_id: "fixture-toolchains-v1", toolchains };
}

const siblingLayoutPrefix = path.join(fs.realpathSync(os.tmpdir()), "trusted-toolchain-sibling-layout");
const siblingNode = path.join(siblingLayoutPrefix, "bin", executableName("node"));
const siblingNpmCli = path.join(siblingLayoutPrefix, "lib", "node_modules", "npm", "bin", "npm-cli.js");
const siblingRoots = trustedBuiltInCandidateRoots("npm", {
  kind: "npm_cli",
  node_executable_path: siblingNode,
  npm_cli_path: siblingNpmCli,
  state_root: "npm",
  built_in: true,
});
assert.deepEqual(siblingRoots, [path.dirname(siblingNode), path.dirname(siblingNpmCli)]);
assert(path.relative(siblingRoots[1], siblingNpmCli) === "npm-cli.js");

function writeData(file, contents = "trusted fixture\n") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, "utf8");
  if (process.platform !== "win32") fs.chmodSync(file, 0o644);
}

function writeExecutable(file, contents = "trusted executable fixture\n") {
  writeData(file, contents);
  if (process.platform !== "win32") fs.chmodSync(file, 0o755);
}

function executableName(name) {
  return process.platform === "win32" ? `${name}.exe` : name;
}

function baseConfiguration({ hostRoot, stateRoot, paths }) {
  return {
    schema_version: 1,
    configuration_id: "resolver-fixture-v1",
    trusted_roots: [hostRoot],
    state_roots: {
      npm: path.join(stateRoot, "npm"),
      python: path.join(stateRoot, "python"),
      go: path.join(stateRoot, "go"),
      cargo: path.join(stateRoot, "cargo"),
      maven: path.join(stateRoot, "maven"),
      gradle: path.join(stateRoot, "gradle"),
    },
    candidates: {
      node: [{ kind: "direct", executable_path: paths.node }],
      npm: [{
        kind: "npm_cli",
        node_executable_path: paths.node,
        npm_cli_path: paths.npmCli,
        state_root: "npm",
      }],
      python: [{ kind: "direct", executable_path: paths.python }],
      pytest: [{ kind: "python_module", python_executable_path: paths.python, state_root: "python" }],
      go: [{ kind: "direct", executable_path: paths.go, state_root: "go" }],
      cargo: [{ kind: "direct", executable_path: paths.cargo, state_root: "cargo" }],
      java: [{ kind: "direct", java_home: paths.javaHome }],
      maven: [{
        kind: "maven_java_v3",
        java_home: paths.javaHome,
        distribution_root: paths.mavenRoot,
        state_root: "maven",
      }],
      gradle: [{
        kind: "gradle_java",
        layout: "legacy_launcher",
        java_home: paths.javaHome,
        distribution_root: paths.gradleRoot,
        state_root: "gradle",
      }],
    },
    auxiliary: { git: { kind: "direct", executable_path: paths.git } },
  };
}

function singleMap(family) {
  return map([{ executable_id: `fixture-${family}`, resolver: family }]);
}

function resolveFamily(family, lease, workspaceRoot, argv = ["--version"], projectRoot = workspaceRoot) {
  return resolveTrustedToolchainInvocation({
    toolchainMap: singleMap(family),
    executableId: `fixture-${family}`,
    argv,
    workspaceRoot,
    projectRoot,
    hostConfigurationLease: lease,
  });
}

const schema = JSON.parse(fs.readFileSync(
  path.join(repositoryRoot, "quality", "schemas", "toolchain-map.schema.json"),
  "utf8",
));
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.schema_version.const, 1);
assert.equal(schema.properties.toolchains.items.additionalProperties, false);
assert.deepEqual(schema.properties.toolchains.items.properties.resolver.enum, TRUSTED_TOOLCHAIN_RESOLVERS);
assert.match(schema.$comment, /host configuration/u);

const validated = validateTrustedToolchainMap(map());
assert(Object.isFrozen(validated));
assert.match(trustedToolchainMapFingerprint(validated), /^sha256:[a-f0-9]{64}$/u);
expectCode(() => parseTrustedToolchainMap("{"), "QUALITY_TOOLCHAIN_MAP_JSON");
expectCode(() => validateTrustedToolchainMap({ ...map(), executable_path: process.execPath }), "CONTRACT_UNKNOWN_FIELD");
expectCode(() => validateTrustedToolchainMap({ ...map(), schema_version: 2 }), "QUALITY_TOOLCHAIN_MAP_VERSION");
expectCode(() => validateTrustedToolchainMap(map([
  { executable_id: "node", resolver: "node", path: process.execPath },
])), "CONTRACT_UNKNOWN_FIELD");
expectCode(() => validateTrustedToolchainMap(map([
  { executable_id: "node", resolver: "node" },
  { executable_id: "node", resolver: "npm" },
])), "QUALITY_TOOLCHAIN_DUPLICATE");
expectCode(() => validateTrustedToolchainMap(map([{ executable_id: "node", resolver: "ruby" }])),
  "QUALITY_TOOLCHAIN_RESOLVER");
expectCode(() => validateTrustedToolchainMap(map([{ executable_id: "../node", resolver: "node" }])),
  "QUALITY_TOOLCHAIN_ID");

assert.doesNotThrow(() => validateTrustedToolchainArguments("node", ["--version"]));
assert.doesNotThrow(() => validateTrustedToolchainArguments("npm", ["run", "verify"]));
assert.doesNotThrow(() => validateTrustedToolchainArguments("npm", ["run", "verify", "--", "--script-shell=fixture"]));
for (const option of ["--script-shell=/tmp/poison", "--script_shell=/tmp/poison", "--scriptshell=/tmp/poison"]) {
  expectCode(
    () => validateTrustedToolchainArguments("npm", ["run", option, "verify"]),
    "QUALITY_TOOLCHAIN_ARGUMENT",
  );
}
assert.doesNotThrow(() => validateTrustedToolchainArguments("pytest", ["-c", "pytest.ini"]),
  "pytest -c is a configuration option, not Python source text");
assert.doesNotThrow(() => validateTrustedToolchainArguments("go", ["test", "./...", "literal&|^!%PATH%"]));
assert.doesNotThrow(() => validateTrustedToolchainArguments("gradle", ["test"]));
assert.doesNotThrow(() => validateTrustedToolchainArguments("gradle", ["-i", "--offline", "test"]),
  "Gradle info/offline flags are not resolver state overrides");
assert.doesNotThrow(() => validateTrustedToolchainArguments("maven", ["-fae", "-DskipTests=true", "verify"]),
  "Maven failure policy and unrelated project properties remain supported");
expectCode(() => validateTrustedToolchainArguments("node", ["--eval=process.exit(0)"]), "QUALITY_TOOLCHAIN_ARGUMENT");
expectCode(() => validateTrustedToolchainArguments("python", ["-c", "print(1)"]), "QUALITY_TOOLCHAIN_ARGUMENT");
expectCode(() => validateTrustedToolchainArguments("npm", ["exec", "package"]), "QUALITY_TOOLCHAIN_ARGUMENT");
expectCode(() => validateTrustedToolchainArguments("maven", ["-Duser.home=project-state", "test"]),
  "QUALITY_TOOLCHAIN_ARGUMENT");
expectCode(() => validateTrustedToolchainArguments("maven", ["-D", "user.home=project-state", "test"]),
  "QUALITY_TOOLCHAIN_ARGUMENT");
expectCode(() => validateTrustedToolchainArguments("maven", ["--define", "user.home=project-state", "test"]),
  "QUALITY_TOOLCHAIN_ARGUMENT");
expectCode(() => validateTrustedToolchainArguments("maven", ["--define=user.home=project-state", "test"]),
  "QUALITY_TOOLCHAIN_ARGUMENT");
expectCode(() => validateTrustedToolchainArguments("gradle", ["--daemon", "test"]), "QUALITY_TOOLCHAIN_ARGUMENT");
expectCode(() => validateTrustedToolchainArguments("gradle", ["-Dorg.gradle.daemon=true", "test"]),
  "QUALITY_TOOLCHAIN_ARGUMENT");
for (const family of ["java", "maven", "gradle"]) {
  expectCode(() => validateTrustedToolchainArguments(family, ["@project/override.args"]),
    "QUALITY_TOOLCHAIN_ARGUMENT");
}

for (const argv of [
  ["-Dmaven.repo.local=.m2/repository", "test"],
  ["-D", "maven.repo.local=.m2/repository", "test"],
  ["--define=maven.repo.local=.m2/repository", "test"],
  ["--define", "maven.ext.class.path=.m2/extension.jar", "test"],
  ["--settings", ".m2/settings.xml", "test"],
  ["--settings=.m2/settings.xml", "test"],
  ["-s.m2/settings.xml", "test"],
  ["--global-settings", ".m2/global-settings.xml", "test"],
  ["-gs.m2/global-settings.xml", "test"],
  ["--toolchains", ".m2/toolchains.xml", "test"],
  ["-t.m2/toolchains.xml", "test"],
  ["--global-toolchains=.m2/global-toolchains.xml", "test"],
  ["-gt.m2/global-toolchains.xml", "test"],
  ["--file", "external/pom.xml", "test"],
  ["-fexternal/pom.xml", "test"],
]) {
  expectCode(() => validateTrustedToolchainArguments("maven", argv), "QUALITY_TOOLCHAIN_ARGUMENT");
}
for (const property of mavenResolverOwnedProperties) {
  expectCode(
    () => validateTrustedToolchainArguments("maven", [`-D${property}=project-controlled`, "test"]),
    "QUALITY_TOOLCHAIN_ARGUMENT",
  );
  expectCode(
    () => validateTrustedToolchainArguments("maven", ["--define", `${property}=project-controlled`, "test"]),
    "QUALITY_TOOLCHAIN_ARGUMENT",
  );
}

for (const argv of [
  ["--gradle-user-home", ".gradle", "test"],
  ["--gradle-user-home=.gradle", "test"],
  ["-g.gradle", "test"],
  ["-Dgradle.user.home=.gradle", "test"],
  ["-D", "gradle.user.home=.gradle", "test"],
  ["--system-prop=gradle.user.home=.gradle", "test"],
  ["--system-prop", "org.gradle.java.home=.jdk", "test"],
  ["-Dorg.gradle.projectcachedir=.gradle/project-cache", "test"],
  ["--system-prop=org.gradle.projectcachedir=.gradle/project-cache", "test"],
  ["-Dorg.gradle.jvmargs=-javaagent:project-agent.jar", "test"],
  ["--project-cache-dir=.gradle/project-cache", "test"],
  ["--init-script", ".gradle/init.gradle", "test"],
  ["-I.gradle/init.gradle", "test"],
  ["--settings-file=.gradle/settings.gradle", "test"],
  ["-c.gradle/settings.gradle", "test"],
  ["--project-dir", "external", "test"],
  ["-pexternal", "test"],
  ["--build-file=external.gradle", "test"],
  ["-bexternal.gradle", "test"],
  ["--include-build", "../external", "test"],
]) {
  expectCode(() => validateTrustedToolchainArguments("gradle", argv), "QUALITY_TOOLCHAIN_ARGUMENT");
}

const oldPath = process.env.PATH;
try {
  process.env.PATH = path.join(repositoryRoot, "node_modules", ".bin");
  const nodeInvocation = resolveTrustedToolchainInvocation({
    toolchainMap: map(),
    executableId: "node",
    argv: ["--version"],
    workspaceRoot: repositoryRoot,
  });
  assert.equal(nodeInvocation.executable_path, fs.realpathSync.native(process.execPath));
  assert.equal(nodeInvocation.strategy, "direct");
  assert.equal(nodeInvocation.runtime_metadata.shell, false);
  assert.notEqual(nodeInvocation.runtime_metadata.git, null);
  assert(nodeInvocation.identities.some((entry) => entry.role === "auxiliary_git_executable"));
  assert(nodeInvocation.environment_profile.path_entries.includes(nodeInvocation.runtime_metadata.git.directory));
  assert(!nodeInvocation.environment_profile.path_entries.includes(process.env.PATH),
    "built-in Git resolution must not inherit ambient PATH");
  assert.doesNotThrow(() => assertTrustedToolchainInvocationCurrent(nodeInvocation));
  assert.equal(assertTrustedToolchainCommandBinding(
    nodeInvocation,
    nodeInvocation.executable_path,
    [...nodeInvocation.argv_prefix, "--version"],
  ), true);
  expectCode(() => assertTrustedToolchainCommandBinding(
    nodeInvocation,
    path.join(path.dirname(nodeInvocation.executable_path), executableName("not-the-bound-node")),
    [...nodeInvocation.argv_prefix, "--version"],
  ), "QUALITY_TOOLCHAIN_INVOCATION_MISMATCH");

  const npmInvocation = resolveTrustedToolchainInvocation({
    toolchainMap: map(),
    executableId: "npm",
    argv: ["test"],
    workspaceRoot: repositoryRoot,
  });
  assert.equal(npmInvocation.executable_path, fs.realpathSync.native(process.execPath));
  assert.equal(npmInvocation.strategy, "npm_cli");
  assert(npmInvocation.argv_prefix[0].endsWith("npm-cli.js"));
  assert.notEqual(npmInvocation.runtime_metadata.git, null);
  assert(npmInvocation.identities.some((entry) => entry.role === "auxiliary_git_executable"));
  if (process.platform === "darwin") {
    assert.equal(npmInvocation.runtime_metadata.npm_script_shell.executable_path,
      TRUSTED_MACOS_NPM_SCRIPT_SHELL_PATH);
    assert.equal(npmInvocation.environment_profile.variables.NPM_CONFIG_SCRIPT_SHELL,
      TRUSTED_MACOS_NPM_SCRIPT_SHELL_PATH);
    assert(npmInvocation.identities.some((entry) => entry.role === "npm_script_shell_executable"));
    assert(npmInvocation.environment_profile.path_entries.includes(
      path.dirname(TRUSTED_MACOS_NPM_SCRIPT_SHELL_PATH),
    ));
  } else {
    assert.equal(npmInvocation.runtime_metadata.npm_script_shell, null);
    assert.equal(npmInvocation.environment_profile.variables.NPM_CONFIG_SCRIPT_SHELL, undefined);
  }
  assert.doesNotThrow(() => assertTrustedToolchainInvocationCurrent(npmInvocation));
  expectCode(() => assertTrustedToolchainCommandBinding(
    npmInvocation,
    npmInvocation.executable_path,
    ["forged-npm-cli.js", "test"],
  ), "QUALITY_TOOLCHAIN_INVOCATION_MISMATCH");
} finally {
  if (oldPath === undefined) delete process.env.PATH;
  else process.env.PATH = oldPath;
}

expectCode(() => resolveTrustedToolchainInvocation({
  toolchainMap: singleMap("python"),
  executableId: "fixture-python",
  argv: ["--version"],
  workspaceRoot: repositoryRoot,
}), "QUALITY_TOOLCHAIN_HOST_CONFIG_REQUIRED");
expectCode(() => resolveTrustedToolchainInvocation({
  toolchainMap: singleMap("python"),
  executableId: "fixture-python",
  argv: ["--version"],
  workspaceRoot: repositoryRoot,
  hostConfiguration: { trusted_roots: [] },
}), "QUALITY_TOOLCHAIN_HOST_CONFIG_REQUIRED");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-toolchains-v2-"));
const workspaceRoot = path.join(tempRoot, "workspace");
const configRoot = path.join(tempRoot, "installed-plugin");
const hostRoot = path.join(tempRoot, "trusted-code");
const stateRoot = path.join(tempRoot, "mutable-state");
for (const directory of [workspaceRoot, configRoot, hostRoot, stateRoot]) fs.mkdirSync(directory, { recursive: true });
for (const stateId of ["npm", "python", "go", "cargo", "maven", "gradle"]) {
  fs.mkdirSync(path.join(stateRoot, stateId));
}
const anchor = path.join(configRoot, "global-quality-plugin.mjs");
writeExecutable(anchor, "export default {};\n");
const source = path.join(configRoot, TRUSTED_TOOLCHAIN_HOST_CONFIG_FILENAME);
const paths = {
  node: path.join(hostRoot, "bin", executableName("node")),
  npmCli: path.join(hostRoot, "lib", "npm-cli.js"),
  python: path.join(hostRoot, "bin", executableName("python")),
  go: path.join(hostRoot, "bin", executableName("go")),
  cargo: path.join(hostRoot, "bin", executableName("cargo")),
  git: path.join(hostRoot, "bin", executableName("git")),
  javaHome: path.join(hostRoot, "jdk"),
  mavenRoot: path.join(hostRoot, "maven"),
  gradleRoot: path.join(hostRoot, "gradle"),
};
for (const executable of [paths.node, paths.python, paths.go, paths.cargo, paths.git]) writeExecutable(executable);
writeData(paths.npmCli, "console.log('npm fixture');\n");
writeExecutable(path.join(paths.javaHome, "bin", executableName("java")));
writeData(path.join(paths.mavenRoot, "boot", "plexus-classworlds-2.8.0.jar"));
writeData(path.join(paths.mavenRoot, "bin", "m2.conf"));
writeData(path.join(paths.mavenRoot, "lib", "maven-core.jar"));
writeData(path.join(paths.mavenRoot, "lib", "plugins", "maven-plugin.jar"));
writeData(path.join(paths.gradleRoot, "lib", "gradle-launcher-8.14.jar"));
writeData(path.join(paths.gradleRoot, "lib", "gradle-core.jar"));
writeData(path.join(paths.gradleRoot, "lib", "plugins", "gradle-plugin.jar"));

function writeConfiguration(value) {
  fs.writeFileSync(source, `${JSON.stringify(value)}\n`, "utf8");
  if (process.platform !== "win32") fs.chmodSync(source, 0o600);
}

function loadLease() {
  return loadTrustedToolchainHostConfigurationLease({
    anchorUrl: pathToFileURL(anchor),
    workspaceRoot,
    required: true,
  });
}

try {
  fs.mkdirSync(path.join(workspaceRoot, ".opencode", "quality"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, ".opencode", "quality", "toolchains.json"), `${JSON.stringify(map())}\n`);
  const loaded = loadTrustedToolchainMap(workspaceRoot);
  assert.equal(loaded.relative_path, TRUSTED_TOOLCHAIN_MAP_PATH);
  assert.equal(loaded.fingerprint, trustedToolchainMapFingerprint(loaded.map));
  fs.writeFileSync(
    path.join(workspaceRoot, ".opencode", "quality", "toolchains.json"),
    Buffer.alloc(TRUSTED_TOOLCHAIN_LIMITS.max_map_bytes + 1, 0x20),
  );
  expectCode(() => loadTrustedToolchainMap(workspaceRoot), "QUALITY_TOOLCHAIN_MAP_SIZE");

  const configuration = baseConfiguration({
    hostRoot: fs.realpathSync.native(hostRoot),
    stateRoot: fs.realpathSync.native(stateRoot),
    paths,
  });
  const overlappingBuiltInRoot = fs.realpathSync.native(os.tmpdir());
  const overlapConfigRoot = path.join(tempRoot, "overlap-config");
  const overlapAnchor = path.join(overlapConfigRoot, "global-quality-plugin.mjs");
  const overlapSource = path.join(overlapConfigRoot, TRUSTED_TOOLCHAIN_HOST_CONFIG_FILENAME);
  writeExecutable(overlapAnchor, "export default {};\n");
  writeData(overlapSource, `${JSON.stringify({
    schema_version: 1,
    configuration_id: "built-in-state-overlap-v1",
    trusted_roots: [overlappingBuiltInRoot],
    state_roots: {},
    candidates: {},
    auxiliary: { git: { kind: "direct", executable_path: paths.git } },
  })}\n`);
  const overlappingLease = loadTrustedToolchainHostConfigurationLease({
    anchorUrl: pathToFileURL(overlapAnchor),
    workspaceRoot: repositoryRoot,
    required: true,
  });
  expectCode(() => resolveTrustedToolchainInvocation({
    toolchainMap: singleMap("npm"),
    executableId: "fixture-npm",
    argv: ["test"],
    workspaceRoot: repositoryRoot,
    hostConfigurationLease: overlappingLease,
  }), "QUALITY_TOOLCHAIN_STATE_SCOPE");

  const absentLease = loadTrustedToolchainHostConfigurationLease({
    anchorUrl: pathToFileURL(anchor),
    workspaceRoot,
    required: false,
  });
  const absentInvocation = resolveTrustedToolchainInvocation({
    toolchainMap: map(),
    executableId: "node",
    argv: ["--version"],
    workspaceRoot,
    hostConfigurationLease: absentLease,
  });
  writeConfiguration(configuration);
  expectCode(
    () => assertTrustedToolchainInvocationCurrent(absentInvocation),
    "QUALITY_TOOLCHAIN_HOST_CONFIG_DRIFT",
  );
  const lease = loadLease();
  const expectedStrategies = {
    node: "direct",
    npm: "npm_cli",
    python: "direct",
    pytest: "python_module",
    go: "direct",
    cargo: "direct",
    java: "direct_java",
    maven: "maven_java_v3",
    gradle: "gradle_java_legacy_launcher",
  };
  const invocations = {};
  for (const family of TRUSTED_TOOLCHAIN_RESOLVERS) {
    const argv = family === "npm" ? ["run", "verify"] : family === "pytest" ? ["-c", "pytest.ini"] : ["--version"];
    const invocation = resolveFamily(family, lease, workspaceRoot, argv);
    invocations[family] = invocation;
    assert.equal(invocation.strategy, expectedStrategies[family]);
    assert.equal(invocation.runtime_metadata.shell, false);
    assert.equal(invocation.toolchain_host_configuration_fingerprint, lease.effective_fingerprint);
    assert.equal(invocation.environment_profile.profile_id, `trusted-${family}-environment-v2`);
    assert.equal(invocation.environment_fingerprint, invocation.environment_profile.fingerprint);
    if (invocation.runtime_metadata.state_root === null) {
      assert.equal(invocation.runtime_metadata.state_root_boundary, null);
    } else {
      assert.equal(
        invocation.runtime_metadata.state_root_boundary.canonical_path,
        invocation.runtime_metadata.state_root,
      );
      assert.match(invocation.runtime_metadata.state_root_boundary.fingerprint, /^sha256:/u);
    }
    assert.equal(invocation.runtime_metadata.git.executable_path, paths.git);
    assert.equal(invocation.managed_worker_executable_path, paths.node);
    assert.equal(invocation.runtime_metadata.managed_worker_executable_path, paths.node);
    assert.equal(
      invocation.runtime_metadata.managed_worker_identity_fingerprint,
      invocation.managed_worker_identity_fingerprint,
    );
    assert.match(invocation.managed_worker_identity_fingerprint, /^sha256:/u);
    assert(invocation.environment_profile.path_entries.includes(path.dirname(paths.git)));
    assert(invocation.identities.some((entry) => entry.role === "auxiliary_git_executable"));
    assert(invocation.identities.some((entry) => entry.role === "managed_worker_executable"
      && entry.canonical_path === paths.node));
    assert.doesNotThrow(() => assertTrustedToolchainInvocationCurrent(invocation));
  }

  assert.deepEqual(invocations.python.environment_profile.variables, {
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONNOUSERSITE: "1",
    PYTHONSAFEPATH: "1",
    PYTHONUTF8: "1",
  });
  assert.equal(invocations.pytest.environment_profile.variables.PYTEST_DISABLE_PLUGIN_AUTOLOAD, "1");
  assert.deepEqual(invocations.pytest.argv_prefix.slice(-3), ["-I", "-m", "pytest"]);
  writeData(path.join(workspaceRoot, "pytest.py"), "raise RuntimeError('workspace shadow must not load')\n");
  const shadowResistantPytest = resolveFamily("pytest", lease, workspaceRoot, ["-c", "pytest.ini"]);
  assert.deepEqual(shadowResistantPytest.argv_prefix.slice(-3), ["-I", "-m", "pytest"]);
  fs.unlinkSync(path.join(workspaceRoot, "pytest.py"));
  assert.equal(invocations.go.environment_profile.variables.GOENV, "off");
  assert.equal(invocations.go.environment_profile.variables.GOTOOLCHAIN, "local");
  assert.equal(invocations.cargo.environment_profile.variables.CARGO_HOME, path.join(stateRoot, "cargo"));
  assert.equal(invocations.java.environment_profile.variables.JAVA_HOME, paths.javaHome);
  assert.equal(invocations.maven.environment_profile.variables.MAVEN_SKIP_RC, "true");
  assert.equal(invocations.gradle.environment_profile.variables.GRADLE_USER_HOME, path.join(stateRoot, "gradle"));
  assert(invocations.maven.argv_prefix.includes("org.codehaus.plexus.classworlds.launcher.Launcher"));
  assert(invocations.maven.argv_prefix.includes(`-Duser.home=${path.join(stateRoot, "maven")}`));
  assert(invocations.gradle.argv_prefix.includes("org.gradle.launcher.GradleMain"));
  assert.equal(invocations.gradle.argv_prefix.at(-1), "--no-daemon");
  assert.deepEqual(
    invocations.gradle.argv_prefix.slice(
      invocations.gradle.argv_prefix.indexOf("org.gradle.launcher.GradleMain") + 1,
    ),
    [
      "--gradle-user-home",
      path.join(stateRoot, "gradle"),
      "--project-cache-dir",
      path.join(stateRoot, "gradle", "project-cache"),
      `-Dorg.gradle.java.home=${paths.javaHome}`,
      `-Dgradle.user.home=${path.join(stateRoot, "gradle")}`,
      `-Dorg.gradle.projectcachedir=${path.join(stateRoot, "gradle", "project-cache")}`,
      "-Dorg.gradle.daemon=false",
      "--project-dir",
      workspaceRoot,
      "--no-daemon",
    ],
    "Gradle state and launcher controls must have fixed highest-precedence arguments",
  );
  assert.equal(invocations.maven.executable_path, path.join(paths.javaHome, "bin", executableName("java")));
  assert.equal(invocations.gradle.executable_path, path.join(paths.javaHome, "bin", executableName("java")));
  assert(!invocations.maven.argv_prefix.some((entry) => /mvn(?:\.cmd|\.bat)?$/iu.test(entry)));
  assert(!invocations.gradle.argv_prefix
    .slice(0, invocations.gradle.argv_prefix.indexOf("org.gradle.launcher.GradleMain"))
    .some((entry) => /gradle(?:\.cmd|\.bat)?$/iu.test(entry)));
  assert.match(invocations.maven.runtime_metadata.distribution_manifest_fingerprint, /^sha256:/u);
  assert.match(invocations.gradle.runtime_metadata.distribution_manifest_fingerprint, /^sha256:/u);
  assert.deepEqual(invocations.maven.runtime_metadata.distribution_manifest_spec, {
    subdirectories: ["boot", "lib", "conf"],
    extra_files: ["bin/m2.conf"],
  });
  assert.deepEqual(invocations.gradle.runtime_metadata.distribution_manifest_spec, {
    subdirectories: ["lib", "init.d"],
    extra_files: [],
  });
  assert.deepEqual(
    invocations.maven.runtime_metadata.implicit_configuration.map((entry) => [entry.role, entry.state]),
    [
      ["maven_project_config", "absent"],
      ["maven_project_extensions", "absent"],
      ["maven_project_system_properties", "absent"],
      ["maven_project_user_properties", "absent"],
      ["maven_user_settings", "absent"],
      ["maven_user_toolchains", "absent"],
      ["maven_user_extensions", "absent"],
      ["maven_user_system_properties", "absent"],
      ["maven_user_properties", "absent"],
      ["maven_user_home_settings", "absent"],
      ["maven_user_home_toolchains", "absent"],
      ["maven_user_home_extensions", "absent"],
    ],
  );
  assert.deepEqual(
    invocations.gradle.runtime_metadata.implicit_configuration.map((entry) => [entry.role, entry.state]),
    [
      ["gradle_project_properties_0", "absent"],
      ["gradle_user_properties", "absent"],
      ["gradle_user_init_script", "absent"],
      ["gradle_user_init_script_kts", "absent"],
      ["gradle_user_init_directory", "absent"],
      ["gradle_installation_properties", "absent"],
    ],
  );
  for (const [option, role] of [
    ["--settings", "maven_control_user_settings"],
    ["--global-settings", "maven_control_global_settings"],
    ["--toolchains", "maven_control_user_toolchains"],
    ["--global-toolchains", "maven_control_global_toolchains"],
  ]) {
    const control = invocations.maven.identities.find((entry) => entry.role === role);
    assert(control, `missing Maven control identity ${role}`);
    assert.equal(invocations.maven.argv_prefix[invocations.maven.argv_prefix.indexOf(option) + 1], control.canonical_path);
  }
  assert.match(invocations.maven.runtime_metadata_fingerprint, /^sha256:/u);
  assert.match(invocations.gradle.runtime_metadata_fingerprint, /^sha256:/u);

  const mavenProjectConfig = path.join(workspaceRoot, ".mvn", "maven.config");
  const gradleProjectProperties = path.join(workspaceRoot, "gradle.properties");
  const gradleUserProperties = path.join(stateRoot, "gradle", "gradle.properties");
  writeData(mavenProjectConfig, "-DskipTests=true\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(invocations.maven), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  fs.unlinkSync(mavenProjectConfig);
  writeData(gradleProjectProperties, "org.gradle.warning.mode=all\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(invocations.gradle), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  fs.unlinkSync(gradleProjectProperties);
  writeData(gradleUserProperties, "org.gradle.warning.mode=all\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(invocations.gradle), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  fs.unlinkSync(gradleUserProperties);

  writeData(mavenProjectConfig, "@project/override.args\n");
  expectCode(() => resolveFamily("maven", lease, workspaceRoot), "QUALITY_TOOLCHAIN_ARGUMENT");
  fs.unlinkSync(mavenProjectConfig);
  for (const property of mavenResolverOwnedProperties) {
    writeData(mavenProjectConfig, `-D${property}=project-controlled\n`);
    expectCode(() => resolveFamily("maven", lease, workspaceRoot), "QUALITY_TOOLCHAIN_ARGUMENT");
    fs.unlinkSync(mavenProjectConfig);
  }
  writeData(gradleProjectProperties, "org\\u002egradle\\u002eprojectcachedir=.gradle/poison\n");
  expectCode(() => resolveFamily("gradle", lease, workspaceRoot), "QUALITY_TOOLCHAIN_ARGUMENT");
  fs.unlinkSync(gradleProjectProperties);
  writeData(gradleUserProperties, "systemProp.org.gradle.java.home=.jdk\n");
  expectCode(() => resolveFamily("gradle", lease, workspaceRoot), "QUALITY_TOOLCHAIN_ARGUMENT");
  fs.unlinkSync(gradleUserProperties);
  const gradleUserInitScript = path.join(stateRoot, "gradle", "init.gradle");
  writeData(gradleUserInitScript, "throw new GradleException('poison')\n");
  expectCode(() => resolveFamily("gradle", lease, workspaceRoot), "QUALITY_TOOLCHAIN_CONFIGURATION");
  fs.unlinkSync(gradleUserInitScript);

  writeData(mavenProjectConfig, "-DskipTests=true\n");
  const boundMavenConfiguration = resolveFamily("maven", lease, workspaceRoot);
  assert.equal(boundMavenConfiguration.runtime_metadata.implicit_configuration[0].state, "file");
  assert(boundMavenConfiguration.identities.some((entry) => entry.role === "maven_project_config"));
  assert.doesNotThrow(() => assertTrustedToolchainInvocationCurrent(boundMavenConfiguration));
  writeData(mavenProjectConfig, "-DskipTests=false\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(boundMavenConfiguration), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  fs.unlinkSync(mavenProjectConfig);

  writeData(gradleProjectProperties, "org.gradle.warning.mode=all\n");
  const boundGradleConfiguration = resolveFamily("gradle", lease, workspaceRoot);
  assert.equal(boundGradleConfiguration.runtime_metadata.implicit_configuration[0].state, "file");
  assert(boundGradleConfiguration.identities.some((entry) => entry.role === "gradle_project_properties_0"));
  assert.doesNotThrow(() => assertTrustedToolchainInvocationCurrent(boundGradleConfiguration));
  writeData(gradleProjectProperties, "org.gradle.warning.mode=none\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(boundGradleConfiguration), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  fs.unlinkSync(gradleProjectProperties);

  const nestedGradleParent = path.join(workspaceRoot, "nested-build");
  const nestedGradleProject = path.join(nestedGradleParent, "app");
  fs.mkdirSync(nestedGradleProject, { recursive: true });
  const nestedGradle = resolveFamily("gradle", lease, workspaceRoot, ["tasks"], nestedGradleProject);
  assert.equal(
    nestedGradle.argv_prefix[nestedGradle.argv_prefix.indexOf("--project-dir") + 1],
    fs.realpathSync.native(nestedGradleProject),
  );
  assert.deepEqual(
    nestedGradle.runtime_metadata.implicit_configuration
      .filter((entry) => entry.role.startsWith("gradle_project_properties_"))
      .map((entry) => [entry.role, entry.path]),
    [
      ["gradle_project_properties_0", path.join(nestedGradleProject, "gradle.properties")],
      ["gradle_project_properties_1", path.join(nestedGradleParent, "gradle.properties")],
      ["gradle_project_properties_2", path.join(workspaceRoot, "gradle.properties")],
    ],
    "nested Gradle project ancestry must be exhaustively absence-bound",
  );
  const nestedParentProperties = path.join(nestedGradleParent, "gradle.properties");
  writeData(nestedParentProperties, "org.gradle.warning.mode=all\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(nestedGradle), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  const boundNestedGradle = resolveFamily("gradle", lease, workspaceRoot, ["tasks"], nestedGradleProject);
  assert(boundNestedGradle.identities.some((entry) => entry.role === "gradle_project_properties_1"));
  writeData(nestedParentProperties, "org.gradle.warning.mode=none\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(boundNestedGradle), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  fs.unlinkSync(nestedParentProperties);

  const gradleInstallationProperties = path.join(paths.gradleRoot, "gradle.properties");
  writeData(gradleInstallationProperties, "org.gradle.warning.mode=all\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(invocations.gradle), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  const boundGradleInstallation = resolveFamily("gradle", lease, workspaceRoot);
  assert(boundGradleInstallation.identities.some((entry) => entry.role === "gradle_installation_properties"));
  writeData(gradleInstallationProperties, "org.gradle.warning.mode=none\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(boundGradleInstallation), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  writeData(gradleInstallationProperties, "org.gradle.jvmargs=-javaagent:poison.jar\n");
  expectCode(() => resolveFamily("gradle", lease, workspaceRoot), "QUALITY_TOOLCHAIN_ARGUMENT");
  fs.unlinkSync(gradleInstallationProperties);

  const gradleInstallationInit = path.join(paths.gradleRoot, "init.d", "bound.init.gradle");
  writeData(gradleInstallationInit, "// identity-bound installation init script\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(invocations.gradle), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  const boundGradleInit = resolveFamily("gradle", lease, workspaceRoot);
  assert(boundGradleInit.runtime_metadata.distribution_manifest_spec.subdirectories.includes("init.d"));
  writeData(gradleInstallationInit, "throw new GradleException('mutated')\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(boundGradleInit), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  fs.rmSync(path.dirname(gradleInstallationInit), { recursive: true, force: true });

  const mavenAutomaticConfigurations = [
    path.join(workspaceRoot, ".mvn", "extensions.xml"),
    path.join(workspaceRoot, ".mvn", "maven-system.properties"),
    path.join(workspaceRoot, ".mvn", "maven-user.properties"),
    path.join(stateRoot, "maven", ".m2", "settings.xml"),
    path.join(stateRoot, "maven", ".m2", "toolchains.xml"),
    path.join(stateRoot, "maven", ".m2", "extensions.xml"),
    path.join(stateRoot, "maven", ".m2", "maven-system.properties"),
    path.join(stateRoot, "maven", ".m2", "maven-user.properties"),
    path.join(stateRoot, "maven", "settings.xml"),
    path.join(stateRoot, "maven", "toolchains.xml"),
    path.join(stateRoot, "maven", "extensions.xml"),
  ];
  for (const automaticConfiguration of mavenAutomaticConfigurations) {
    writeData(automaticConfiguration, "<poison/>\n");
    expectCode(() => resolveFamily("maven", lease, workspaceRoot), "QUALITY_TOOLCHAIN_CONFIGURATION");
    fs.unlinkSync(automaticConfiguration);
  }
  const appearedMavenSettings = path.join(stateRoot, "maven", ".m2", "settings.xml");
  writeData(appearedMavenSettings, "<settings/>\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(invocations.maven), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  fs.unlinkSync(appearedMavenSettings);
  const appearedMavenProjectProperties = path.join(workspaceRoot, ".mvn", "maven-system.properties");
  writeData(appearedMavenProjectProperties, "maven.user.extensions=project-controlled\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(invocations.maven), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  fs.unlinkSync(appearedMavenProjectProperties);

  const mavenInstallationSettings = path.join(paths.mavenRoot, "conf", "settings.xml");
  writeData(mavenInstallationSettings, "<settings/>\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(invocations.maven), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  const boundMavenInstallation = resolveFamily("maven", lease, workspaceRoot);
  writeData(mavenInstallationSettings, "<settings><mirrors/></settings>\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(boundMavenInstallation), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  fs.rmSync(path.dirname(mavenInstallationSettings), { recursive: true, force: true });

  const boundMavenControl = resolveFamily("maven", lease, workspaceRoot);
  const userSettingsControl = boundMavenControl.identities.find((entry) => (
    entry.role === "maven_control_user_settings"
  ));
  assert(userSettingsControl, "Maven user settings control is not identity-bound");
  writeData(userSettingsControl.canonical_path, "<settings><mirrors/></settings>\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(boundMavenControl), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");

  const stalePolicyInvocation = structuredClone(invocations.node);
  stalePolicyInvocation.toolchain_resolution_policy_version = "trusted-toolchain-resolution-v2";
  expectCode(() => assertTrustedToolchainInvocationCurrent(stalePolicyInvocation), "QUALITY_TOOLCHAIN_HOST_CONFIG_POLICY");
  const tamperedRuntimeMetadata = structuredClone(invocations.node);
  tamperedRuntimeMetadata.runtime_metadata.project_root = nestedGradleProject;
  expectCode(() => assertTrustedToolchainInvocationCurrent(tamperedRuntimeMetadata), "QUALITY_TOOLCHAIN_IDENTITY");

  const tamperedGitMetadata = structuredClone(invocations.node);
  tamperedGitMetadata.runtime_metadata.git.executable_path = paths.node;
  expectCode(() => assertTrustedToolchainInvocationCurrent(tamperedGitMetadata), "QUALITY_TOOLCHAIN_IDENTITY");
  const tamperedEnvironment = structuredClone(invocations.node);
  tamperedEnvironment.environment_profile.variables.PATH = process.env.PATH ?? "ambient";
  expectCode(() => assertTrustedToolchainInvocationCurrent(tamperedEnvironment), "QUALITY_TOOLCHAIN_ENVIRONMENT");
  const tamperedHostFingerprint = structuredClone(invocations.node);
  tamperedHostFingerprint.toolchain_host_configuration_normalized_fingerprint = `sha256:${"0".repeat(64)}`;
  expectCode(() => assertTrustedToolchainInvocationCurrent(tamperedHostFingerprint),
    "QUALITY_TOOLCHAIN_HOST_CONFIG_DRIFT");

  const goStateRoot = path.join(stateRoot, "go");
  const originalGoStateRoot = path.join(stateRoot, "go-original-boundary");
  fs.renameSync(goStateRoot, originalGoStateRoot);
  try {
    fs.symlinkSync(workspaceRoot, goStateRoot, process.platform === "win32" ? "junction" : "dir");
    expectCode(
      () => assertTrustedToolchainInvocationCurrent(invocations.go),
      "QUALITY_TOOLCHAIN_STATE_CHANGED",
    );
  } finally {
    try { fs.unlinkSync(goStateRoot); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    fs.renameSync(originalGoStateRoot, goStateRoot);
  }

  const literal = "literal&|^!%PATH%";
  const literalInvocation = resolveFamily("go", lease, workspaceRoot, ["test", literal]);
  assert.equal(literalInvocation.runtime_metadata.shell, false);
  assert(!literalInvocation.argv_prefix.includes(literal), "project arguments stay separate from resolver-owned argv_prefix");

  const addedMavenRuntime = path.join(paths.mavenRoot, "lib", "added-after-resolution.jar");
  writeData(addedMavenRuntime, "added Maven runtime membership\n");
  expectCode(
    () => assertTrustedToolchainInvocationCurrent(invocations.maven),
    "QUALITY_TOOLCHAIN_IDENTITY_CHANGED",
  );
  fs.unlinkSync(addedMavenRuntime);

  writeExecutable(paths.python, "changed Python identity\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(invocations.python), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  writeExecutable(paths.python);

  writeExecutable(paths.node, "changed managed worker Node identity\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(invocations.python), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  writeExecutable(paths.node);

  writeExecutable(paths.git, "changed Git identity\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(invocations.node), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  writeExecutable(paths.git);

  const mavenCore = path.join(paths.mavenRoot, "lib", "maven-core.jar");
  writeData(mavenCore, "changed Maven runtime identity\n");
  expectCode(() => assertTrustedToolchainInvocationCurrent(invocations.maven), "QUALITY_TOOLCHAIN_IDENTITY_CHANGED");
  writeData(mavenCore);

  const gradleAgent = path.join(paths.gradleRoot, "lib", "agents", "gradle-instrumentation-agent-8.14.jar");
  const maximumRootConfiguration = structuredClone(configuration);
  for (let index = 1; index < 32; index += 1) {
    const extraRoot = path.join(tempRoot, `trusted-code-extra-${index}`);
    fs.mkdirSync(extraRoot);
    maximumRootConfiguration.trusted_roots.push(extraRoot);
  }
  writeConfiguration(maximumRootConfiguration);
  const maximumRootInvocation = resolveFamily("go", loadLease(), workspaceRoot);
  assert.equal(maximumRootInvocation.runtime_metadata.state_root_boundary.trusted_roots.length, 32);
  assert.doesNotThrow(() => assertTrustedToolchainInvocationCurrent(maximumRootInvocation));
  const maximumRootBuiltInNpm = structuredClone(maximumRootConfiguration);
  maximumRootBuiltInNpm.candidates.npm = [];
  writeConfiguration(maximumRootBuiltInNpm);
  const maximumRootBuiltInNpmInvocation = resolveFamily("npm", loadLease(), workspaceRoot, ["test"]);
  assert(maximumRootBuiltInNpmInvocation.runtime_metadata.state_root_boundary.trusted_roots.length > 32);
  assert(maximumRootBuiltInNpmInvocation.runtime_metadata.state_root_boundary.trusted_roots.length
    <= TRUSTED_TOOLCHAIN_LIMITS.max_state_boundary_roots);
  assert.doesNotThrow(() => assertTrustedToolchainInvocationCurrent(maximumRootBuiltInNpmInvocation));

  writeData(gradleAgent);
  const instrumentedGradle = structuredClone(configuration);
  instrumentedGradle.candidates.gradle[0].layout = "instrumented_launcher";
  writeConfiguration(instrumentedGradle);
  const instrumentedInvocation = resolveFamily("gradle", loadLease(), workspaceRoot);
  assert.equal(instrumentedInvocation.strategy, "gradle_java_instrumented_launcher");
  assert(instrumentedInvocation.argv_prefix.includes(`-javaagent:${gradleAgent}`));
  assert.doesNotThrow(() => assertTrustedToolchainInvocationCurrent(instrumentedInvocation));

  const unknownGradle = structuredClone(configuration);
  unknownGradle.candidates.gradle[0].layout = "future_launcher";
  writeConfiguration(unknownGradle);
  expectCode(() => loadLease(), "QUALITY_TOOLCHAIN_HOST_CONFIG_STRATEGY");

  const missingMaven = structuredClone(configuration);
  const missingRoot = path.join(hostRoot, "maven-missing");
  fs.mkdirSync(path.join(missingRoot, "boot"), { recursive: true });
  fs.mkdirSync(path.join(missingRoot, "bin"), { recursive: true });
  writeData(path.join(missingRoot, "bin", "m2.conf"));
  missingMaven.candidates.maven[0].distribution_root = missingRoot;
  writeConfiguration(missingMaven);
  expectCode(() => resolveFamily("maven", loadLease(), workspaceRoot), "QUALITY_TOOLCHAIN_LAYOUT_UNSUPPORTED");

  writeData(path.join(missingRoot, "boot", "plexus-classworlds-a.jar"));
  writeData(path.join(missingRoot, "boot", "plexus-classworlds-b.jar"));
  writeConfiguration(missingMaven);
  expectCode(() => resolveFamily("maven", loadLease(), workspaceRoot), "QUALITY_TOOLCHAIN_LAYOUT_AMBIGUOUS");

  const ambiguousGradle = structuredClone(configuration);
  const ambiguousGradleRoot = path.join(hostRoot, "gradle-ambiguous");
  writeData(path.join(ambiguousGradleRoot, "lib", "gradle-launcher-a.jar"));
  writeData(path.join(ambiguousGradleRoot, "lib", "gradle-launcher-b.jar"));
  ambiguousGradle.candidates.gradle[0].distribution_root = ambiguousGradleRoot;
  writeConfiguration(ambiguousGradle);
  expectCode(() => resolveFamily("gradle", loadLease(), workspaceRoot), "QUALITY_TOOLCHAIN_LAYOUT_AMBIGUOUS");

  const cargoOriginal = path.join(hostRoot, "bin", executableName("cargo-original"));
  writeExecutable(cargoOriginal);
  const cargoHardlink = path.join(hostRoot, "bin", executableName("cargo-hardlink"));
  fs.linkSync(cargoOriginal, cargoHardlink);
  const hardlinked = structuredClone(configuration);
  hardlinked.candidates.cargo[0].executable_path = cargoHardlink;
  writeConfiguration(hardlinked);
  expectCode(() => resolveFamily("cargo", loadLease(), workspaceRoot), "QUALITY_TOOLCHAIN_HARDLINK");

  if (process.platform === "win32") {
    const commandScript = path.join(hostRoot, "bin", "python.cmd");
    writeData(commandScript, "@exit /b 0\r\n");
    const unsafe = structuredClone(configuration);
    unsafe.candidates.python[0].executable_path = commandScript;
    writeConfiguration(unsafe);
    expectCode(() => resolveFamily("python", loadLease(), workspaceRoot), "QUALITY_TOOLCHAIN_LAUNCHER_UNSAFE");
  } else {
    const interpreter = path.join(hostRoot, "bin", "fixture-interpreter");
    const script = path.join(hostRoot, "bin", "scripted-go");
    writeExecutable(interpreter);
    writeExecutable(script, `#!${interpreter}\nfixture\n`);
    const scripted = structuredClone(configuration);
    scripted.candidates.go[0].executable_path = script;
    writeConfiguration(scripted);
    const scriptedInvocation = resolveFamily("go", loadLease(), workspaceRoot);
    assert.equal(scriptedInvocation.executable_path, interpreter);
    assert.deepEqual(scriptedInvocation.argv_prefix, [script]);
    assert(scriptedInvocation.identities.some((entry) => entry.role === "interpreter"));
    assert(scriptedInvocation.identities.some((entry) => entry.role === "script"));
  }

  const linkedReal = path.join(tempRoot, "linked-real");
  fs.mkdirSync(linkedReal);
  const linkedExecutable = path.join(linkedReal, executableName("go"));
  writeExecutable(linkedExecutable);
  const linkedDirectory = path.join(hostRoot, "linked");
  let aliasCreated = false;
  try {
    fs.symlinkSync(linkedReal, linkedDirectory, process.platform === "win32" ? "junction" : "dir");
    aliasCreated = true;
  } catch (error) {
    if (error?.code !== "EPERM") throw error;
  }
  if (aliasCreated) {
    const aliased = structuredClone(configuration);
    aliased.candidates.go[0].executable_path = path.join(linkedDirectory, path.basename(linkedExecutable));
    writeConfiguration(aliased);
    expectCode(() => resolveFamily("go", loadLease(), workspaceRoot), "QUALITY_TOOLCHAIN_ALIAS");
  }

  const missingGit = structuredClone(configuration);
  missingGit.auxiliary = {};
  writeConfiguration(missingGit);
  expectCode(() => resolveFamily("python", loadLease(), workspaceRoot), "QUALITY_TOOLCHAIN_UNAVAILABLE");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("Trusted logical map, fixed host lease, all resolver families, environment profiles, and runtime identities passed.");
