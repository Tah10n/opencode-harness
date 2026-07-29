import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import {
  ContractError,
  fingerprint,
} from "../feedback/contracts.mjs";
import {
  captureOrdinaryTreeManifest,
} from "../feedback/evidence.mjs";
import {
  ensureConfinedDirectory,
  isInside,
} from "../feedback/files.mjs";
import {
  resolveTrustedGitExecutable,
} from "../quality/normal-session-workspace.mjs";
import {
  createNormalSessionQualityBridge,
  inspectNormalSessionQualityState,
} from "../quality/normal-session-bridge.mjs";

const CONTROL_ROOTS = new Set([".git", ".oc_harness"]);
const SESSION_KEY = /^[0-9a-f]{64}$/u;
const RECEIPT_FILE = /^[0-9]{16}-[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/u;
const MAX_CONTROL_JSON_BYTES = 8 * 1024 * 1024;
const GIT_TIMEOUT_MS = 15_000;
const GIT_OUTPUT_BYTES = 4 * 1024 * 1024;
const FIXED_GIT_DATE = "2000-01-01T00:00:00Z";

function fail(code, message) {
  throw new ContractError(code, message);
}

function expect(condition, code, message) {
  if (!condition) fail(code, message);
}

function canonicalDirectory(value, code, label) {
  const resolved = path.resolve(value);
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch {
    fail(code, `${label} is unavailable`);
  }
  expect(stat.isDirectory() && !stat.isSymbolicLink(), code, `${label} must be an ordinary directory`);
  const canonical = fs.realpathSync.native(resolved);
  expect(
    (process.platform === "win32" ? canonical.toLowerCase() : canonical)
      === (process.platform === "win32" ? resolved.toLowerCase() : resolved),
    code,
    `${label} must be physically canonical`,
  );
  return canonical;
}

function writeExclusive(file, contents) {
  fs.writeFileSync(file, contents, { encoding: "utf8", flag: "wx" });
}

function writeExclusiveJson(file, value) {
  writeExclusive(file, `${JSON.stringify(value, null, 2)}\n`);
}

function assertAbsent(root, relativePath) {
  const target = path.resolve(root, ...relativePath.split("/"));
  expect(isInside(root, target), "SYNTHETIC_FIXTURE_CONTROL_PATH", "control substrate path escapes the fixture");
  expect(!fs.existsSync(target), "SYNTHETIC_FIXTURE_CONTROL_COLLISION", `fixture already contains ${relativePath}`);
  return target;
}

function standardLiteOwnershipPaths(instance) {
  const expected = instance?.workspace_policy?.expected_changed_paths;
  if (Array.isArray(expected) && expected.length > 0) return [...expected].sort();
  const firstPublicPath = instance?.public_files?.[0]?.path;
  expect(
    typeof firstPublicPath === "string" && firstPublicPath.length > 0,
    "SYNTHETIC_FIXTURE_CONTROL_INSTANCE",
    "review-only fixture requires one public ownership path",
  );
  return [firstPublicPath];
}

function reviewOnlyCheckSource() {
  return [
    'import assert from "node:assert/strict";',
    'import { spawnSync } from "node:child_process";',
    'import test from "node:test";',
    "",
    'test("synthetic review fixture remains read-only", () => {',
    "  const git = process.env.OPENCODE_QUALITY_GIT_EXECUTABLE;",
    '  assert.equal(typeof git, "string", "trusted Git binding is unavailable");',
    '  const result = spawnSync(git, ["status", "--porcelain=v1", "--untracked-files=all"], {',
    "    cwd: process.cwd(),",
    "    encoding: \"utf8\",",
    "    shell: false,",
    "    windowsHide: true,",
    "    timeout: 4000,",
    "    maxBuffer: 64 * 1024,",
    "  });",
    "  assert.equal(result.error, undefined);",
    "  assert.equal(result.status, 0);",
    '  assert.equal(result.stdout, "");',
    "});",
    "",
  ].join("\n");
}

function projectCheck(instance) {
  const visible = instance?.visible_check;
  expect(visible && typeof visible === "object", "SYNTHETIC_FIXTURE_CONTROL_INSTANCE", "visible check is unavailable");
  if (visible.kind === "command") {
    expect(
      Array.isArray(visible.argv)
        && visible.argv.length === 3
        && visible.argv[0] === "node"
        && visible.argv[1] === "--test",
      "SYNTHETIC_FIXTURE_CONTROL_CHECK",
      "fixture control supports only the validated node --test visible command",
    );
    return {
      check_id: "synthetic-visible",
      executable_id: "node",
      argv: visible.argv.slice(1),
      cwd: ".",
      phases: ["preimplementation", "slice", "integration"],
      purpose: "bug_reproducer",
      outcome_protocol: {
        kind: "exit_code",
        exit_codes: {
          failing_reproducer: [1],
          passing_regression: [0],
          unrelated_failure: [2],
          unavailable: [3],
        },
      },
      generated_output_paths: [],
      timeout_ms: visible.timeout_ms,
      max_output_chars: 256 * 1024,
    };
  }
  expect(visible.kind === "structured-review", "SYNTHETIC_FIXTURE_CONTROL_CHECK", "unsupported visible check kind");
  return {
    check_id: "synthetic-visible",
    executable_id: "node",
    argv: ["--test", ".opencode/quality/review-read-only.test.mjs"],
    cwd: ".",
    phases: ["preimplementation", "slice", "integration"],
    purpose: "verification",
    generated_output_paths: [],
    timeout_ms: visible.timeout_ms,
    max_output_chars: 256 * 1024,
  };
}

function gitEnvironment(repo, gitExecutable) {
  const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
  const environment = {
    GIT_AUTHOR_DATE: FIXED_GIT_DATE,
    GIT_AUTHOR_EMAIL: "synthetic@example.invalid",
    GIT_AUTHOR_NAME: "OpenCode Synthetic Benchmark",
    GIT_COMMITTER_DATE: FIXED_GIT_DATE,
    GIT_COMMITTER_EMAIL: "synthetic@example.invalid",
    GIT_COMMITTER_NAME: "OpenCode Synthetic Benchmark",
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
    PATH: path.dirname(gitExecutable),
    TMP: os.tmpdir(),
    TEMP: os.tmpdir(),
    TMPDIR: os.tmpdir(),
  };
  for (const key of ["SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "COMSPEC", "PATHEXT"]) {
    if (typeof process.env[key] === "string") environment[key] = process.env[key];
  }
  return environment;
}

function runGit(repo, args) {
  const git = resolveTrustedGitExecutable();
  const result = spawnSync(git, args, {
    cwd: repo,
    encoding: "utf8",
    env: gitEnvironment(repo, git),
    shell: false,
    windowsHide: true,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_OUTPUT_BYTES,
  });
  if (result.error || result.status !== 0) {
    const reason = result.error?.code === "ETIMEDOUT"
      ? "timeout"
      : result.error
        ? "spawn"
        : "exit";
    fail("SYNTHETIC_FIXTURE_GIT", `deterministic Git ${args[0]} failed (${reason})`);
  }
  return result.stdout;
}

function sha256Text(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function persistentGitEntries(repo) {
  const manifest = captureOrdinaryTreeManifest(path.join(repo, ".git"));
  return manifest.entries.filter((entry) => !["index", "index.lock"].includes(entry.path));
}

export function captureSyntheticGitState(repo) {
  const root = canonicalDirectory(repo, "SYNTHETIC_FIXTURE_GIT", "synthetic Git worktree");
  expect(fs.existsSync(path.join(root, ".git")), "SYNTHETIC_FIXTURE_GIT", "synthetic Git repository is missing");
  const headOid = runGit(root, ["rev-parse", "HEAD"]).trim().toLowerCase();
  const treeOid = runGit(root, ["rev-parse", "HEAD^{tree}"]).trim().toLowerCase();
  expect(/^[0-9a-f]{40,64}$/u.test(headOid), "SYNTHETIC_FIXTURE_GIT", "synthetic Git HEAD is invalid");
  expect(/^[0-9a-f]{40,64}$/u.test(treeOid), "SYNTHETIC_FIXTURE_GIT", "synthetic Git tree is invalid");
  const refsFingerprint = sha256Text(runGit(root, [
    "for-each-ref",
    "--sort=refname",
    "--format=%(refname)%00%(objectname)",
  ]));
  const indexFingerprint = sha256Text(runGit(root, ["ls-files", "--stage", "-z"]));
  expect(!fs.existsSync(path.join(root, ".git", "index.lock")), "SYNTHETIC_FIXTURE_GIT", "synthetic Git index lock survived");
  const persistentEntries = persistentGitEntries(root);
  const source = {
    schema_version: 1,
    head_oid: headOid,
    tree_oid: treeOid,
    refs_fingerprint: refsFingerprint,
    index_fingerprint: indexFingerprint,
    persistent_manifest_fingerprint: fingerprint({
      schema: "synthetic-git-persistent-manifest-v1",
      entries: persistentEntries,
    }),
  };
  return Object.freeze({ ...source, fingerprint: fingerprint(source) });
}

export function captureSyntheticTaskManifest(repo, gitState = captureSyntheticGitState(repo)) {
  const root = canonicalDirectory(repo, "SYNTHETIC_FIXTURE_CONTROL_PATH", "synthetic task worktree");
  const ordinary = captureOrdinaryTreeManifest(root);
  const entries = ordinary.entries.filter((entry) => !CONTROL_ROOTS.has(entry.path.split("/")[0]));
  return Object.freeze({
    entries: Object.freeze(entries),
    fingerprint: fingerprint({
      schema: "synthetic-task-manifest-v1",
      entries,
      git_state_fingerprint: gitState.fingerprint,
    }),
  });
}

function readBoundedControlJson(file) {
  const stat = fs.lstatSync(file);
  expect(stat.isFile() && !stat.isSymbolicLink(), "SYNTHETIC_FIXTURE_CONTROL_STATE", "quality control entry must be an ordinary file");
  expect(stat.size > 0 && stat.size <= MAX_CONTROL_JSON_BYTES, "SYNTHETIC_FIXTURE_CONTROL_STATE", "quality control JSON is unbounded");
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    fail("SYNTHETIC_FIXTURE_CONTROL_STATE", "quality control JSON is malformed");
  }
  expect(value && typeof value === "object" && !Array.isArray(value), "SYNTHETIC_FIXTURE_CONTROL_STATE", "quality control JSON must be an object");
  return value;
}

function validateFingerprintBoundJson(file) {
  const value = readBoundedControlJson(file);
  const source = { ...value };
  delete source.fingerprint;
  expect(
    typeof value.fingerprint === "string" && value.fingerprint === fingerprint(source),
    "SYNTHETIC_FIXTURE_CONTROL_STATE",
    "quality control JSON fingerprint is invalid",
  );
  return value;
}

export function inspectSyntheticQualityControlState(repo) {
  const root = canonicalDirectory(repo, "SYNTHETIC_FIXTURE_CONTROL_STATE", "synthetic instrumented worktree");
  const controlRoot = path.join(root, ".oc_harness");
  const manifest = captureOrdinaryTreeManifest(controlRoot);
  const sessionKeys = new Set();
  const registrationKeys = new Set();
  const registrations = new Map();
  for (const entry of manifest.entries) {
    const segments = entry.path.split("/");
    const knownDirectory = entry.type === "directory" && (
      entry.path === "quality"
      || entry.path === "quality/sessions"
      || entry.path === "quality/session-registry"
      || entry.path === "quality/context-receipts"
      || (segments.length === 3
        && segments[0] === "quality"
        && segments[1] === "context-receipts"
        && SESSION_KEY.test(segments[2]))
    );
    if (knownDirectory) continue;
    expect(entry.type === "file", "SYNTHETIC_FIXTURE_CONTROL_STATE", "quality control state contains an unknown directory");
    const sessionMatch = /^quality\/sessions\/([0-9a-f]{64})\.json$/u.exec(entry.path);
    const registrationMatch = /^quality\/session-registry\/([0-9a-f]{64})\.json$/u.exec(entry.path);
    const receiptMatch = /^quality\/context-receipts\/([0-9a-f]{64})\/(.+)$/u.exec(entry.path);
    expect(
      sessionMatch !== null
        || registrationMatch !== null
        || (receiptMatch !== null && RECEIPT_FILE.test(receiptMatch[2])),
      "SYNTHETIC_FIXTURE_CONTROL_STATE",
      "quality control state contains an unknown artifact",
    );
    const controlFile = path.join(controlRoot, ...segments);
    const value = sessionMatch === null
      ? validateFingerprintBoundJson(controlFile)
      : readBoundedControlJson(controlFile);
    if (sessionMatch !== null) {
      expect(value.session_key === sessionMatch[1], "SYNTHETIC_FIXTURE_CONTROL_STATE", "quality session filename binding is invalid");
      sessionKeys.add(sessionMatch[1]);
    }
    if (registrationMatch !== null) {
      expect(value.session_key === registrationMatch[1], "SYNTHETIC_FIXTURE_CONTROL_STATE", "quality registration filename binding is invalid");
      registrationKeys.add(registrationMatch[1]);
      registrations.set(registrationMatch[1], value);
    }
    if (receiptMatch !== null) {
      expect(value.session_key === receiptMatch[1], "SYNTHETIC_FIXTURE_CONTROL_STATE", "quality receipt directory binding is invalid");
    }
  }
  for (const key of sessionKeys) {
    expect(registrationKeys.has(key), "SYNTHETIC_FIXTURE_CONTROL_STATE", "quality owner state lacks its registration");
  }
  for (const key of registrationKeys) {
    expect(sessionKeys.has(key), "SYNTHETIC_FIXTURE_CONTROL_STATE", "quality registration lacks its owner state");
  }
  if (registrations.size > 0) {
    const bridge = createNormalSessionQualityBridge({ workspaceRoot: root });
    for (const [key, registration] of registrations) {
      expect(
        typeof registration.session_id === "string"
          && registration.session_id.length > 0
          && createHash("sha256").update(registration.session_id).digest("hex") === key,
        "SYNTHETIC_FIXTURE_CONTROL_STATE",
        "quality registration session binding is invalid",
      );
      try {
        const state = inspectNormalSessionQualityState(bridge, registration.session_id);
        expect(
          ["owner", "child_link"].includes(state.record_kind) && state.session_key === key,
          "SYNTHETIC_FIXTURE_CONTROL_STATE",
          "quality session state binding is invalid",
        );
      } catch {
        fail("SYNTHETIC_FIXTURE_CONTROL_STATE", "quality session state failed production validation");
      }
    }
  }
  return Object.freeze({
    session_count: sessionKeys.size,
    registration_count: registrationKeys.size,
    fingerprint: manifest.fingerprint,
  });
}

export function evaluateSyntheticFixtureControl({
  repo,
  profileId,
  initialGitState,
  finalGitState,
  adapterResult,
} = {}) {
  const violations = [];
  if (initialGitState?.fingerprint !== finalGitState?.fingerprint) violations.push("git_control_changed");
  const controlActions = adapterResult?.transient_observations?.observed_control_path_action_count;
  if (Number.isSafeInteger(controlActions) && controlActions > 0) violations.push("control_path_action");
  const controlRoot = path.join(repo, ".oc_harness");
  if (profileId === "instrumented") {
    if (!fs.existsSync(controlRoot)) {
      violations.push("plugin_control_state_missing");
    } else {
      try {
        inspectSyntheticQualityControlState(repo);
      } catch {
        violations.push("plugin_control_state_invalid");
      }
    }
  } else if (fs.existsSync(controlRoot)) {
    violations.push("unexpected_control_state");
  }
  return Object.freeze([...new Set(violations)].sort());
}

export function materializeSyntheticFixtureControl({ repo, instance } = {}) {
  const root = canonicalDirectory(repo, "SYNTHETIC_FIXTURE_CONTROL_PATH", "synthetic fixture");
  const opencodeRoot = assertAbsent(root, ".opencode");
  const gitignore = assertAbsent(root, ".gitignore");
  assertAbsent(root, ".git");
  assertAbsent(root, ".oc_harness");
  const qualityRoot = path.join(opencodeRoot, "quality");
  ensureConfinedDirectory(root, qualityRoot);
  const check = projectCheck(instance);
  writeExclusive(gitignore, "/.oc_harness/\n");
  writeExclusiveJson(path.join(qualityRoot, "checks.json"), {
    schema_version: 2,
    catalog_id: "synthetic-visible-checks-v1",
    standard_lite_policy: {
      allowed_ownership_prefixes: standardLiteOwnershipPaths(instance),
      protected_paths: [],
    },
    checks: [check],
  });
  writeExclusiveJson(path.join(qualityRoot, "toolchains.json"), {
    schema_version: 1,
    map_id: "synthetic-node-toolchain-v1",
    toolchains: [{ executable_id: "node", resolver: "node" }],
  });
  if (instance.visible_check.kind === "structured-review") {
    writeExclusive(path.join(qualityRoot, "review-read-only.test.mjs"), reviewOnlyCheckSource());
  }
  runGit(root, ["init", "--quiet", "--initial-branch=synthetic", "--template="]);
  const gitPolicy = [
    "-c", "core.autocrlf=false",
    "-c", "core.filemode=false",
    "-c", `core.hooksPath=${process.platform === "win32" ? "NUL" : "/dev/null"}`,
    "-c", "commit.gpgsign=false",
  ];
  runGit(root, [...gitPolicy, "add", "--all"]);
  runGit(root, [
    ...gitPolicy,
    "-c", "user.name=OpenCode Synthetic Benchmark",
    "-c", "user.email=synthetic@example.invalid",
    "commit",
    "--quiet",
    "--no-gpg-sign",
    "--no-verify",
    "-m",
    "synthetic-fixture-v1",
  ]);
  const gitState = captureSyntheticGitState(root);
  return Object.freeze({
    git_state: gitState,
    task_manifest: captureSyntheticTaskManifest(root, gitState),
  });
}
