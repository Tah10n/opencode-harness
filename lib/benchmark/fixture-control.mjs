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
  assertPortableContractPath,
} from "./contracts.mjs";
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
  inspectNormalSessionRegistration,
  inspectNormalSessionQualityReceipt,
  inspectNormalSessionQualityState,
} from "../quality/normal-session-bridge.mjs";
import {
  loadProjectCheckCatalog,
} from "../quality/project-check-catalog.mjs";
import {
  loadTrustedToolchainMap,
} from "../quality/trusted-toolchains.mjs";
import {
  engineeringDossierAnalysisFingerprint,
  wholeSystemContextReportAnalysisFingerprint,
} from "../quality/whole-system-context-report.mjs";

const CONTROL_ROOTS = new Set([".git", ".oc_harness"]);
const BENCHMARK_CHECK_CATALOG_PATH = ".git/opencode-harness/quality/checks.json";
const BENCHMARK_TOOLCHAIN_MAP_PATH = ".git/opencode-harness/quality/toolchains.json";
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

function projectCheck(instance, fixtureRoot) {
  const visible = instance?.visible_check;
  expect(visible && typeof visible === "object", "SYNTHETIC_FIXTURE_CONTROL_INSTANCE", "visible check is unavailable");
  if (visible.kind === "command") {
    expect(
      Array.isArray(visible.argv)
        && visible.argv.length >= 3
        && visible.argv.length <= 10
        && visible.argv[0] === "node"
        && visible.argv[1] === "--test",
      "SYNTHETIC_FIXTURE_CONTROL_CHECK",
      "fixture control supports only the validated node --test visible command",
    );
    const declaredPublicFiles = new Map((instance.public_files ?? []).map((file) => [file.path, file]));
    const seenPaths = new Set();
    for (let index = 2; index < visible.argv.length; index += 1) {
      const relativePath = visible.argv[index];
      try {
        assertPortableContractPath(relativePath, `visible check argv[${index}]`);
      } catch {
        fail(
          "SYNTHETIC_FIXTURE_CONTROL_CHECK",
          "visible check test paths must be normalized repository-relative POSIX paths",
        );
      }
      expect(
        !relativePath.startsWith("-")
          && relativePath.startsWith("test/")
          && relativePath.endsWith(".test.mjs")
          && !/[?*\[\]{}]/u.test(relativePath),
        "SYNTHETIC_FIXTURE_CONTROL_CHECK",
        "visible check arguments must remain inside the public test surface and cannot be options or globs",
      );
      expect(
        !seenPaths.has(relativePath),
        "SYNTHETIC_FIXTURE_CONTROL_CHECK",
        "visible check cannot contain duplicate test paths",
      );
      seenPaths.add(relativePath);
      const declared = declaredPublicFiles.get(relativePath);
      expect(
        declared !== undefined,
        "SYNTHETIC_FIXTURE_CONTROL_CHECK",
        `visible check path is not an exact renderer-created public test file: ${relativePath}`,
      );
      const target = path.resolve(fixtureRoot, ...relativePath.split("/"));
      let identity;
      try {
        identity = fs.lstatSync(target);
      } catch {
        fail("SYNTHETIC_FIXTURE_CONTROL_CHECK", `visible check test file is unavailable: ${relativePath}`);
      }
      expect(
        identity.isFile() && !identity.isSymbolicLink(),
        "SYNTHETIC_FIXTURE_CONTROL_CHECK",
        `visible check path must be an ordinary public test file: ${relativePath}`,
      );
      const physical = fs.realpathSync.native(target);
      expect(
        physical === target && fs.readFileSync(target, "utf8") === declared.content,
        "SYNTHETIC_FIXTURE_CONTROL_CHECK",
        `visible check test file differs from the renderer-created public file: ${relativePath}`,
      );
    }
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
    argv: ["--test", ".git/opencode-harness/quality/review-read-only.test.mjs"],
    cwd: ".",
    phases: ["preimplementation", "slice", "integration"],
    purpose: "verification",
    generated_output_paths: [],
    timeout_ms: visible.timeout_ms,
    max_output_chars: 256 * 1024,
  };
}

export function syntheticVisiblePreflightChecks(check) {
  if (check?.check_id !== "synthetic-visible" || check?.purpose !== "bug_reproducer"
    || check?.argv?.[0] !== "--test" || check.argv.length < 3) return Object.freeze([]);
  const testPaths = check.argv.slice(1);
  const common = {
    executable_id: check.executable_id,
    cwd: check.cwd,
    phases: [...check.phases],
    generated_output_paths: [...check.generated_output_paths],
    timeout_ms: check.timeout_ms,
    max_output_chars: check.max_output_chars,
  };
  return Object.freeze([
    ...testPaths.map((testPath, index) => Object.freeze({
      check: Object.freeze({ check_id: `synthetic-visible-syntax-${index + 1}`, ...common,
        argv: Object.freeze(["--check", testPath]), purpose: "verification" }),
      role: "syntax",
    })),
    Object.freeze({
      check: Object.freeze({ check_id: "synthetic-visible-primary", ...common,
        argv: Object.freeze(["--test", testPaths[0]]), purpose: "bug_reproducer",
        outcome_protocol: check.outcome_protocol }),
      expected_outcome: "failing_reproducer",
      role: "primary",
    }),
    ...testPaths.slice(1).map((testPath, index) => Object.freeze({
      check: Object.freeze({ check_id: `synthetic-visible-auxiliary-${index + 1}`, ...common,
        argv: Object.freeze(["--test", testPath]), purpose: "verification" }),
      role: "auxiliary",
    })),
  ]);
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
  return manifest.entries.filter(
    (entry) => !["index", "index.lock", "opencode"].includes(entry.path),
  );
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

function semanticRecommendedActionValue(value) {
  if (Array.isArray(value)) return value.map((entry) => semanticRecommendedActionValue(entry));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/^expected(?:_[a-z][a-z0-9]*)*_revision$/u.test(key))
    .map(([key, entry]) => [key, semanticRecommendedActionValue(entry)]));
}

export function syntheticRecommendedActionFingerprint(action) {
  return fingerprint(semanticRecommendedActionValue(action));
}

function boundedRecommendedAction(action) {
  if (action === null || typeof action !== "object" || Array.isArray(action)) return null;
  if (typeof action.tool_id !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,127}$/u.test(action.tool_id)) return null;
  const targetAgent = action.target_agent === undefined
    ? null
    : typeof action.target_agent === "string" && /^[A-Za-z][A-Za-z0-9._-]{0,127}$/u.test(action.target_agent)
      ? action.target_agent
      : null;
  if (action.target_agent !== undefined && targetAgent === null) return null;
  return Object.freeze({
    tool_id: action.tool_id,
    target_agent: targetAgent,
    // The host never exposes the action payload here, but it must still be able
    // to distinguish useful progress through two actions that use the same
    // tool (for example, consecutive context_read calls for different paths).
    // The action comes from the validated runner-owned inspection receipt and
    // is already bounded by the control-state file limit.
    fingerprint: syntheticRecommendedActionFingerprint({
      tool_id: action.tool_id,
      target_agent: targetAgent,
      request: action.request ?? null,
      request_requirements: action.request_requirements ?? null,
      assignment: action.assignment ?? null,
    }),
  });
}

export function inspectSyntheticQualityControlState(repo, {
  includeSessionId = false,
  includeRecommendedAction = false,
} = {}) {
  const root = canonicalDirectory(repo, "SYNTHETIC_FIXTURE_CONTROL_STATE", "synthetic instrumented worktree");
  const controlRoot = path.join(root, ".oc_harness");
  const manifest = captureOrdinaryTreeManifest(controlRoot);
  const sessionKeys = new Set();
  const registrationKeys = new Set();
  const registrations = new Map();
  const sessionStates = new Map();
  const ownerStates = [];
  const ownerInspections = new Map();
  const settledRunnerAssignedAgentIds = [];
  let childSessionCount = 0;
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
      sessionStates.set(sessionMatch[1], value);
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
  let bridge = null;
  if (registrations.size > 0) {
    bridge = createNormalSessionQualityBridge({
      workspaceRoot: root,
      projectCatalogLoader: (workspaceRoot) => loadProjectCheckCatalog(
        workspaceRoot,
        { relativePath: BENCHMARK_CHECK_CATALOG_PATH },
      ),
      toolchainMapLoader: (workspaceRoot) => loadTrustedToolchainMap(
        workspaceRoot,
        { relativePath: BENCHMARK_TOOLCHAIN_MAP_PATH },
      ),
    });
    for (const [key, registration] of registrations) {
      expect(
        typeof registration.session_id === "string"
          && registration.session_id.length > 0
          && createHash("sha256").update(registration.session_id).digest("hex") === key,
        "SYNTHETIC_FIXTURE_CONTROL_STATE",
        "quality registration session binding is invalid",
      );
      try {
        const validatedRegistration = inspectNormalSessionRegistration(
          bridge,
          registration.session_id,
          { required: true },
        );
        expect(
          validatedRegistration.session_key === key,
          "SYNTHETIC_FIXTURE_CONTROL_STATE",
          "quality registration failed production validation",
        );
        if (sessionKeys.has(key)) {
          const state = inspectNormalSessionQualityState(bridge, registration.session_id);
          expect(
            ["owner", "child_link"].includes(state.record_kind) && state.session_key === key,
            "SYNTHETIC_FIXTURE_CONTROL_STATE",
            "quality session state binding is invalid",
          );
          if (state.record_kind === "owner") {
            const inspection = inspectNormalSessionQualityReceipt(bridge, registration.session_id);
            expect(
              inspection.run_id === state.run_id && inspection.task_id === state.task_id,
              "SYNTHETIC_FIXTURE_CONTROL_STATE",
              "quality owner inspection identity is invalid",
            );
            ownerInspections.set(key, inspection);
            ownerStates.push(inspection.lifecycle === state.lifecycle
              ? state
              : Object.freeze({ ...state, lifecycle: inspection.lifecycle }));
          } else {
            childSessionCount += 1;
            if (state.status === "closed") {
              settledRunnerAssignedAgentIds.push(state.authorized_agent);
            }
          }
        }
      } catch {
        fail("SYNTHETIC_FIXTURE_CONTROL_STATE", "quality session state failed production validation");
      }
    }
  }
  const lifecycleCounts = Object.fromEntries(
    [...new Set(ownerStates.map((state) => state.lifecycle))]
      .sort()
      .map((lifecycle) => [
        lifecycle,
        ownerStates.filter((state) => state.lifecycle === lifecycle).length,
      ]),
  );
  const ownerArtifacts = ownerStates.map((state) => sessionStates.get(state.session_key));
  const soleOwner = ownerStates.length === 1 ? ownerStates[0] : null;
  const outstandingCapabilities = soleOwner === null
    ? []
    : soleOwner.capabilities.filter((entry) => entry.consumed === false);
  const contextDecisionReasonCodes = soleOwner?.context_decision?.reasons === undefined
    ? []
    : [...new Set(soleOwner.context_decision.reasons.map((entry) => entry.code))]
      .sort()
      .slice(0, 32);
  const contributionRoles = soleOwner === null
    ? []
    : [...new Set(soleOwner.contributions.map((entry) => entry.role))].sort();
  const registrationOnlyCount = [...registrationKeys]
    .filter((key) => !sessionKeys.has(key)).length;
  const classification = registrationKeys.size === 0
    ? "absent"
    : ownerStates.length === 0 && sessionKeys.size === 0
      ? "registration_only"
      : ownerStates.length === 1
          && ownerStates[0].lifecycle === "attested"
          && childSessionCount + 1 === sessionKeys.size
        ? "attested"
        : "started_incomplete";
  const ownerSessionId = ownerStates.length === 1
    ? registrations.get(ownerStates[0].session_key)?.session_id ?? null
    : ownerStates.length === 0 && sessionKeys.size === 0 && registrations.size === 1
      ? registrations.values().next().value.session_id
      : null;
  let recommendedAction = null;
  if (includeRecommendedAction && soleOwner !== null && ownerSessionId !== null && bridge !== null) {
    try {
      const inspection = ownerInspections.get(soleOwner.session_key);
      expect(
        inspection !== undefined,
        "SYNTHETIC_FIXTURE_CONTROL_STATE",
        "quality owner inspection is unavailable",
      );
      recommendedAction = boundedRecommendedAction(inspection.recommended_next_actions?.[0] ?? null);
    } catch {
      fail("SYNTHETIC_FIXTURE_CONTROL_STATE", "quality continuation action failed production validation");
    }
  }
  return Object.freeze({
    classification,
    session_count: sessionKeys.size,
    registration_count: registrationKeys.size,
    registration_only_count: registrationOnlyCount,
    owner_session_count: ownerStates.length,
    child_session_count: childSessionCount,
    settled_runner_assigned_agent_ids: Object.freeze(settledRunnerAssignedAgentIds.sort()),
    attested_owner_count: ownerStates.filter((state) => state.lifecycle === "attested").length,
    verified_owner_count: ownerStates.filter((state) => state.lifecycle === "verified").length,
    failed_owner_count: ownerStates.filter((state) => state.lifecycle === "failed").length,
    reviewer_evidence_owner_count: ownerArtifacts.filter(
      (state) => state?.reviewer_reconciliation_evidence !== null,
    ).length,
    reconciled_owner_count: ownerArtifacts.filter(
      (state) => state?.context_reconciliation?.status === "passed",
    ).length,
    lifecycle_counts: Object.freeze(lifecycleCounts),
    lifecycle: soleOwner?.lifecycle ?? null,
    state_revision: soleOwner?.state_revision ?? null,
    risk_class: soleOwner?.dossier?.risk_class ?? null,
    dossier_revision: soleOwner?.dossier?.revision ?? null,
    dossier_analysis_fingerprint: soleOwner === null
      ? null
      : engineeringDossierAnalysisFingerprint(soleOwner.dossier),
    impact_graph_fingerprint: soleOwner?.dossier?.impact_graph?.fingerprint ?? null,
    context_strategy_id: soleOwner?.context_strategy?.strategy_id ?? null,
    context_report_revision: soleOwner?.context_report?.revision ?? null,
    context_report_analysis_fingerprint: soleOwner?.context_report === null || soleOwner?.context_report === undefined
      ? null
      : wholeSystemContextReportAnalysisFingerprint(soleOwner.context_report),
    context_report_status: soleOwner?.context_report?.status ?? null,
    context_decision_status: soleOwner?.context_decision?.status ?? null,
    context_decision_reason_count: soleOwner?.context_decision?.reasons.length ?? 0,
    context_decision_reason_codes: Object.freeze(contextDecisionReasonCodes),
    context_receipt_count: soleOwner?.context_receipt_ids.length ?? 0,
    contribution_roles: Object.freeze(contributionRoles),
    gate_status: soleOwner?.gate?.status ?? null,
    mutation_revision: soleOwner?.mutation_revision ?? null,
    outstanding_capability_count: outstandingCapabilities.length,
    outstanding_capability_kind: outstandingCapabilities.length === 1
      ? outstandingCapabilities[0].kind
      : null,
    pending_mutation_count: soleOwner?.pending_mutations.length ?? 0,
    active_task_target_agent: soleOwner?.active_task_launch?.target_agent ?? null,
    active_task_phase: soleOwner?.active_task_launch?.phase ?? null,
    verification_complete: soleOwner?.verification?.complete === true,
    context_reconciliation_status: soleOwner?.context_reconciliation?.status ?? null,
    fingerprint: manifest.fingerprint,
    ...(includeSessionId ? { session_id: ownerSessionId } : {}),
    ...(includeRecommendedAction ? {
      recommended_action_tool_id: recommendedAction?.tool_id ?? null,
      recommended_action_target_agent: recommendedAction?.target_agent ?? null,
      recommended_action_fingerprint: recommendedAction?.fingerprint ?? null,
    } : {}),
  });
}

export function inspectSyntheticQualityContinuationState(repo) {
  const state = inspectSyntheticQualityControlState(repo, {
    includeSessionId: true,
    includeRecommendedAction: true,
  });
  return Object.freeze({
    classification: state.classification,
    registration_count: state.registration_count,
    owner_session_count: state.owner_session_count,
    attested_owner_count: state.attested_owner_count,
    failed_owner_count: state.failed_owner_count,
    lifecycle: state.lifecycle,
    state_revision: state.state_revision,
    risk_class: state.risk_class,
    dossier_revision: state.dossier_revision,
    dossier_analysis_fingerprint: state.dossier_analysis_fingerprint,
    impact_graph_fingerprint: state.impact_graph_fingerprint,
    context_strategy_id: state.context_strategy_id,
    context_report_revision: state.context_report_revision,
    context_report_analysis_fingerprint: state.context_report_analysis_fingerprint,
    context_report_status: state.context_report_status,
    context_decision_status: state.context_decision_status,
    context_decision_reason_count: state.context_decision_reason_count,
    context_decision_reason_codes: state.context_decision_reason_codes,
    context_receipt_count: state.context_receipt_count,
    contribution_roles: state.contribution_roles,
    gate_status: state.gate_status,
    mutation_revision: state.mutation_revision,
    outstanding_capability_count: state.outstanding_capability_count,
    outstanding_capability_kind: state.outstanding_capability_kind,
    pending_mutation_count: state.pending_mutation_count,
    active_task_target_agent: state.active_task_target_agent,
    active_task_phase: state.active_task_phase,
    verification_complete: state.verification_complete,
    context_reconciliation_status: state.context_reconciliation_status,
    recommended_action_tool_id: state.recommended_action_tool_id,
    recommended_action_target_agent: state.recommended_action_target_agent,
    recommended_action_fingerprint: state.recommended_action_fingerprint,
    session_id: state.session_id,
    fingerprint: state.fingerprint,
  });
}

export function evaluateSyntheticFixtureControl({
  repo,
  profileId,
  taskScopeMode,
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
        const state = inspectSyntheticQualityControlState(repo);
        if (taskScopeMode === "read-only" && state.classification === "registration_only") {
          if (state.registration_count !== 1 || state.registration_only_count !== 1) {
            violations.push("plugin_quality_registration_count_invalid");
          }
        } else if (state.owner_session_count === 0) {
          violations.push("plugin_quality_session_missing");
        } else if (state.owner_session_count !== 1) {
          violations.push("plugin_quality_owner_count_invalid");
        } else if (state.attested_owner_count !== 1 || state.failed_owner_count !== 0) {
          violations.push("plugin_quality_lifecycle_incomplete");
          if (state.failed_owner_count !== 0) {
            violations.push("plugin_quality_lifecycle_failed");
          } else if (state.verified_owner_count !== 1) {
            violations.push("plugin_quality_verification_incomplete");
          } else if (state.reviewer_evidence_owner_count !== 1) {
            violations.push("plugin_quality_reviewer_evidence_missing");
          } else if (state.reconciled_owner_count !== 1) {
            violations.push("plugin_quality_reconciliation_missing");
          } else {
            violations.push("plugin_quality_attestation_missing");
          }
        }
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
  assertAbsent(root, ".opencode-harness");
  const gitignore = assertAbsent(root, ".gitignore");
  assertAbsent(root, ".git");
  assertAbsent(root, ".oc_harness");
  const check = projectCheck(instance, root);
  writeExclusive(gitignore, "/.oc_harness/\n");
  runGit(root, ["init", "--quiet", "--initial-branch=synthetic", "--template="]);
  const benchmarkControlRoot = assertAbsent(root, ".git/opencode-harness");
  const qualityRoot = path.join(benchmarkControlRoot, "quality");
  ensureConfinedDirectory(root, qualityRoot);
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
