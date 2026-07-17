import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import {
  WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
  diffContentBoundWorkspaces,
  diffDeclaredWorkspaceOutputs,
  observeContentBoundWorkspace,
  observeContentBoundWorkspaceWithSourceAttestation,
  resolveTrustedGitExecutable,
  trustedGitCandidatesForPlatform,
  validateContentBoundWorkspace,
} from "../lib/quality/normal-session-workspace.mjs";
import { TRUSTED_MACOS_FIXED_GIT_PATH } from "../lib/quality/trusted-toolchains.mjs";
import {
  assertMilestone2RunContextStable,
  captureMilestone2RunContext,
} from "../lib/quality/milestone-run-context.mjs";
import { ContractError } from "../lib/quality/validation.mjs";

function expectCode(callback, code) {
  assert.throws(callback, (error) => error instanceof ContractError && error.code === code, `expected ${code}`);
}

assert.deepEqual(
  trustedGitCandidatesForPlatform("darwin"),
  [TRUSTED_MACOS_FIXED_GIT_PATH],
  "macOS workspace observation must use only the protected fixed Git executable",
);
assert.equal(
  trustedGitCandidatesForPlatform("darwin").includes("/usr/bin/git"),
  false,
  "macOS workspace observation must not fall back to the ambient developer-tool shim",
);
const workspaceObservationSource = fs.readFileSync(
  new URL("../lib/quality/normal-session-workspace.mjs", import.meta.url),
  "utf8",
);
const trustedGitResolverStart = workspaceObservationSource.indexOf("export function resolveTrustedGitExecutable");
const trustedGitResolverEnd = workspaceObservationSource.indexOf("function safeGitEnvironment", trustedGitResolverStart);
const trustedGitResolverSource = workspaceObservationSource.slice(trustedGitResolverStart, trustedGitResolverEnd);
assert(
  trustedGitResolverStart >= 0
    && trustedGitResolverEnd > trustedGitResolverStart
    && trustedGitResolverSource.includes('assertProtectedMacosFixedExecutable(candidate, "trusted fixed workspace Git")'),
  "macOS workspace Git resolution must enforce the protected executable contract",
);

function runGit(root, args) {
  const result = spawnSync(resolveTrustedGitExecutable(), args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    },
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr}`);
  }
  return result.stdout;
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, "utf8");
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-workspace-v3-"));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-workspace-v3-outside-"));
const portableClone = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-workspace-v3-clone-parent-"));
try {
  runGit(root, ["init", "--quiet"]);
  write(path.join(root, ".gitignore"), [
    "node_modules/",
    ".env",
    "coverage/",
    "build/bundle.js",
    "ignored-source/",
    "declared-report/",
    "*.log",
    "*.tmp",
    "",
  ].join("\n"));
  write(path.join(root, "src", "main.txt"), "main v1\n");
  write(path.join(root, "src", "assume.txt"), "assume v1\n");
  write(path.join(root, "src", "skip.txt"), "skip v1\n");
  write(path.join(root, "index.txt"), "index v1\n");
  write(path.join(root, "tracked-report.txt"), "tracked report v1\n");
  runGit(root, ["add", ".gitignore", "src/main.txt", "src/assume.txt", "src/skip.txt", "index.txt", "tracked-report.txt"]);
  runGit(root, [
    "-c", "user.name=OpenCode Harness",
    "-c", "user.email=harness@example.invalid",
    "commit", "--quiet", "-m", "fixture",
  ]);

  const initialCapture = observeContentBoundWorkspaceWithSourceAttestation(root, "workspace-v3-fixture", []);
  const initial = initialCapture.snapshot;
  assert.equal(initial.schema_version, WORKSPACE_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(initial.entries.length, 0);
  assert.equal(initial.dirty, false);
  assert.equal(initial.index_entry_count, 6);
  assert.doesNotThrow(() => validateContentBoundWorkspace(initial));
  assert.match(initial.source_fingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.match(initial.declared_outputs_fingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.match(initialCapture.source_attestation_fingerprint, /^sha256:[a-f0-9]{64}$/u);

  const clonedRoot = path.join(portableClone, "workspace");
  runGit(root, ["clone", "--quiet", root, clonedRoot]);
  const clonedCapture = observeContentBoundWorkspaceWithSourceAttestation(clonedRoot, "different-local-salt", []);
  assert.equal(
    clonedCapture.source_attestation_fingerprint,
    initialCapture.source_attestation_fingerprint,
    "portable source attestation must survive different filesystem identities and local salts",
  );

  const stableMilestoneContext = captureMilestone2RunContext({
    workspaceRoot: root,
    localJobId: "workspace-observation-fixture",
    environment: {},
  });

  write(path.join(root, ".env"), "SECRET_SHOULD_NEVER_BE_HASHED=one\n");
  write(path.join(root, "coverage", "summary.json"), "{\"covered\":1}\n");
  write(path.join(root, "build", "bundle.js"), "generated build v1\n");
  write(path.join(root, "ignored.log"), "large ignored log\n");
  const ignoredBeforeNodeModulesCapture = observeContentBoundWorkspaceWithSourceAttestation(
    root,
    "workspace-v3-fixture",
    [],
  );
  const ignoredBeforeNodeModules = ignoredBeforeNodeModulesCapture.snapshot;
  assert.equal(ignoredBeforeNodeModules.source_fingerprint, initial.source_fingerprint);

  const dependencyRoot = path.join(root, "node_modules", "huge-package");
  fs.mkdirSync(dependencyRoot, { recursive: true });
  for (let index = 0; index < 4105; index += 1) {
    fs.writeFileSync(path.join(dependencyRoot, `ignored-${index}.js`), `module.exports=${index};\n`, "utf8");
  }
  fs.writeFileSync(path.join(root, ".env"), "SECRET_SHOULD_NEVER_BE_HASHED=two\n", "utf8");
  fs.writeFileSync(path.join(root, "coverage", "summary.json"), "{\"covered\":2}\n", "utf8");
  fs.writeFileSync(path.join(root, "build", "bundle.js"), "generated build v2\n", "utf8");
  const ignoredAfterNodeModulesCapture = observeContentBoundWorkspaceWithSourceAttestation(
    root,
    "workspace-v3-fixture",
    [],
  );
  const ignoredAfterNodeModules = ignoredAfterNodeModulesCapture.snapshot;
  assert.equal(
    ignoredAfterNodeModules.source_fingerprint,
    ignoredBeforeNodeModules.source_fingerprint,
    "ignored node_modules, .env, coverage, and build output must not enter the default source snapshot",
  );
  assert.equal(
    ignoredAfterNodeModulesCapture.source_attestation_fingerprint,
    ignoredBeforeNodeModulesCapture.source_attestation_fingerprint,
    "ignored generated and secret-like paths must not contaminate portable source attestation",
  );
  assert.deepEqual(diffContentBoundWorkspaces(ignoredBeforeNodeModules, ignoredAfterNodeModules), []);
  assert.doesNotThrow(() => assertMilestone2RunContextStable(stableMilestoneContext, {
    workspaceRoot: root,
    localJobId: "workspace-observation-fixture",
    environment: {},
  }));

  fs.writeFileSync(path.join(root, "src", "main.txt"), "main v2\n", "utf8");
  const sourceMutation = observeContentBoundWorkspaceWithSourceAttestation(root, "workspace-v3-fixture", []);
  assert.notEqual(
    sourceMutation.source_attestation_fingerprint,
    ignoredAfterNodeModulesCapture.source_attestation_fingerprint,
    "portable source attestation must change for source mutations",
  );
  assert.throws(
    () => assertMilestone2RunContextStable(stableMilestoneContext, {
      workspaceRoot: root,
      localJobId: "workspace-observation-fixture",
      environment: {},
    }),
    (error) => error?.code === "MILESTONE_SOURCE_CHANGED_DURING_RUN",
  );
  fs.writeFileSync(path.join(root, "src", "main.txt"), "main v1\n", "utf8");

  write(path.join(root, "build", "source.js"), "nonignored build source v1\n");
  write(path.join(root, "dist", "source.js"), "nonignored dist source v1\n");
  const nonignoredOutputNamedBefore = observeContentBoundWorkspace(root, "workspace-v3-fixture", []);
  assert.deepEqual(
    nonignoredOutputNamedBefore.entries.map((entry) => entry.path),
    ["build/source.js", "dist/source.js"],
    "Git-reported nonignored paths must not be dropped by build/dist name heuristics",
  );
  fs.writeFileSync(path.join(root, "build", "source.js"), "nonignored build source v2\n", "utf8");
  fs.writeFileSync(path.join(root, "dist", "source.js"), "nonignored dist source v2\n", "utf8");
  const nonignoredOutputNamedAfter = observeContentBoundWorkspace(root, "workspace-v3-fixture", []);
  assert.deepEqual(
    diffContentBoundWorkspaces(nonignoredOutputNamedBefore, nonignoredOutputNamedAfter),
    ["build/source.js", "dist/source.js"],
  );

  write(path.join(root, ".env.local"), "NONIGNORED_SECRET_MUST_FAIL_CLOSED=one\n");
  expectCode(
    () => observeContentBoundWorkspace(root, "workspace-v3-fixture", []),
    "QUALITY_WORKSPACE_SENSITIVE_PATH",
  );
  fs.unlinkSync(path.join(root, ".env.local"));

  runGit(root, ["update-index", "--assume-unchanged", "src/assume.txt"]);
  runGit(root, ["update-index", "--skip-worktree", "src/skip.txt"]);
  const hiddenBefore = observeContentBoundWorkspace(root, "workspace-v3-fixture", []);
  fs.writeFileSync(path.join(root, "src", "assume.txt"), "assume v2 hidden\n", "utf8");
  fs.writeFileSync(path.join(root, "src", "skip.txt"), "skip v2 hidden\n", "utf8");
  const hiddenAfter = observeContentBoundWorkspace(root, "workspace-v3-fixture", []);
  const hiddenChanges = diffContentBoundWorkspaces(hiddenBefore, hiddenAfter);
  assert(hiddenChanges.includes("src/assume.txt"), "assume-unchanged content must stay observed");
  assert(hiddenChanges.includes("src/skip.txt"), "skip-worktree content must stay observed");

  write(path.join(root, "ignored-source", "owned.txt"), "ignored owned v1\n");
  const ownedBefore = observeContentBoundWorkspace(root, "workspace-v3-fixture", {
    ownershipPaths: ["ignored-source"],
    generatedOutputPaths: [],
  });
  fs.writeFileSync(path.join(root, "ignored-source", "owned.txt"), "ignored owned v2\n", "utf8");
  const ownedAfter = observeContentBoundWorkspace(root, "workspace-v3-fixture", {
    ownershipPaths: ["ignored-source"],
    generatedOutputPaths: [],
  });
  assert.deepEqual(diffContentBoundWorkspaces(ownedBefore, ownedAfter), ["ignored-source/owned.txt"]);

  const declaredBefore = observeContentBoundWorkspace(root, "workspace-v3-fixture", {
    ownershipPaths: [],
    generatedOutputPaths: ["declared-report"],
  });
  write(path.join(root, "declared-report", "result.json"), "{\"result\":1}\n");
  const declaredAfter = observeContentBoundWorkspace(root, "workspace-v3-fixture", {
    ownershipPaths: [],
    generatedOutputPaths: ["declared-report"],
  });
  assert.equal(
    declaredBefore.source_fingerprint,
    declaredAfter.source_fingerprint,
    "declared generated output must not contaminate the source fingerprint",
  );
  assert.notEqual(declaredBefore.declared_outputs_fingerprint, declaredAfter.declared_outputs_fingerprint);
  assert.deepEqual(diffContentBoundWorkspaces(declaredBefore, declaredAfter), []);
  assert.deepEqual(diffDeclaredWorkspaceOutputs(declaredBefore, declaredAfter), [
    "declared-report",
    "declared-report/result.json",
  ]);

  const trackedOutputBefore = observeContentBoundWorkspace(root, "workspace-v3-fixture", {
    ownershipPaths: [],
    generatedOutputPaths: ["tracked-report.txt"],
  });
  fs.writeFileSync(path.join(root, "tracked-report.txt"), "tracked report v2\n", "utf8");
  const trackedOutputAfter = observeContentBoundWorkspace(root, "workspace-v3-fixture", {
    ownershipPaths: [],
    generatedOutputPaths: ["tracked-report.txt"],
  });
  assert.equal(trackedOutputBefore.source_fingerprint, trackedOutputAfter.source_fingerprint);
  assert.deepEqual(diffContentBoundWorkspaces(trackedOutputBefore, trackedOutputAfter), []);
  assert.deepEqual(diffDeclaredWorkspaceOutputs(trackedOutputBefore, trackedOutputAfter), ["tracked-report.txt"]);

  write(path.join(outside, "outside.txt"), "outside\n");
  fs.mkdirSync(path.join(root, "owned-links"));
  fs.symlinkSync(outside, path.join(root, "owned-links", "escape"), process.platform === "win32" ? "junction" : "dir");
  expectCode(() => observeContentBoundWorkspace(root, "workspace-v3-fixture", {
    ownershipPaths: ["owned-links"],
    generatedOutputPaths: [],
  }), "QUALITY_WORKSPACE_ALIAS");
  fs.unlinkSync(path.join(root, "owned-links", "escape"));
  fs.rmdirSync(path.join(root, "owned-links"));

  fs.mkdirSync(path.join(root, "owned-hardlinks"));
  const hardlinkTarget = path.join(root, "owned-hardlinks", "target.txt");
  write(hardlinkTarget, "hardlink content\n");
  fs.linkSync(hardlinkTarget, path.join(root, "owned-hardlinks", "alias.txt"));
  expectCode(() => observeContentBoundWorkspace(root, "workspace-v3-fixture", {
    ownershipPaths: ["owned-hardlinks"],
    generatedOutputPaths: [],
  }), "QUALITY_WORKSPACE_HARDLINK");
  fs.unlinkSync(path.join(root, "owned-hardlinks", "alias.txt"));
  fs.unlinkSync(hardlinkTarget);
  fs.rmdirSync(path.join(root, "owned-hardlinks"));

  write(path.join(root, "race.txt"), "race before\n");
  const originalReadFileSync = fs.readFileSync;
  let descriptorReadCount = 0;
  let injectedRace = false;
  fs.readFileSync = function readFileSyncWithInjectedRace(target, ...args) {
    const bytes = originalReadFileSync.call(this, target, ...args);
    if (typeof target === "number") {
      descriptorReadCount += 1;
      if (descriptorReadCount === 2) {
        fs.appendFileSync(path.join(root, "race.txt"), "race during read\n", "utf8");
        injectedRace = true;
      }
    }
    return bytes;
  };
  try {
    expectCode(() => observeContentBoundWorkspace(root, "workspace-v3-fixture", {
      ownershipPaths: ["race.txt"],
      generatedOutputPaths: [],
    }), "QUALITY_WORKSPACE_OBSERVATION_RACE");
    assert.equal(injectedRace, true, "race injection must reach the source descriptor read");
  } finally {
    fs.readFileSync = originalReadFileSync;
  }

  const indexBefore = observeContentBoundWorkspace(root, "workspace-v3-fixture", []);
  fs.writeFileSync(path.join(root, "index.txt"), "index v2 staged\n", "utf8");
  runGit(root, ["add", "index.txt"]);
  const indexAfter = observeContentBoundWorkspace(root, "workspace-v3-fixture", []);
  expectCode(() => diffContentBoundWorkspaces(indexBefore, indexAfter), "QUALITY_WORKSPACE_INDEX_CHANGED");
  assert.notEqual(indexBefore.index_fingerprint, indexAfter.index_fingerprint);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
  fs.rmSync(portableClone, { recursive: true, force: true });
}

console.log("Content-bound workspace observation v3 checks passed.");
