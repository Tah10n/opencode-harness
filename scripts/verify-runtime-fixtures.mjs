import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EVIDENCE_PRODUCERS, fingerprint } from "../lib/feedback/contracts.mjs";
import { permissionProfileFingerprint, runtimeOutputsFingerprint } from "../lib/feedback/evidence.mjs";
import { collectResolvedPermissionSurface, extractPermissionSurface } from "../lib/feedback/permission-surface.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verifier = path.join(root, "scripts", "verify-runtime.mjs");
const safeFixture = path.join(root, "fixtures", "runtime-debug");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-runtime-"));
const unsafeFixture = path.join(tempDir, "runtime-debug-unsafe");
const structuredSafeFixture = path.join(tempDir, "runtime-debug-structured-safe");
const structuredUnsafeFixture = path.join(tempDir, "runtime-debug-structured-unsafe");
const jsonSafeFixture = path.join(tempDir, "runtime-debug-json-safe");
const nestedSafeFixture = path.join(tempDir, "runtime-debug-nested-safe");
const malformedEvidenceFixture = path.join(tempDir, "runtime-debug-malformed-evidence");
const extraAgentFixture = path.join(tempDir, "runtime-debug-extra-agent");
const missingAgentDebugFixture = path.join(tempDir, "runtime-debug-missing-agent-output");
const missingInventoryFixture = path.join(tempDir, "runtime-debug-missing-inventory");
const emptyInventoryFixture = path.join(tempDir, "runtime-debug-empty-inventory");
const malformedInventoryFixture = path.join(tempDir, "runtime-debug-malformed-inventory");
const duplicateInventoryFixture = path.join(tempDir, "runtime-debug-duplicate-inventory");
const unsafeInventoryFixture = path.join(tempDir, "runtime-debug-unsafe-inventory");
const oversizedInventoryFixture = path.join(tempDir, "runtime-debug-oversized-inventory");
const tooManyAgentsFixture = path.join(tempDir, "runtime-debug-too-many-agents");
const unsupportedModeFixture = path.join(tempDir, "runtime-debug-unsupported-agent-mode");
const wrongRequiredModeFixture = path.join(tempDir, "runtime-debug-wrong-required-agent-mode");
const strayInventoryTextFixture = path.join(tempDir, "runtime-debug-stray-inventory-text");
const missingRequiredAgentFixture = path.join(tempDir, "runtime-debug-missing-required-agent");
const extraDangerousAgentFixture = path.join(tempDir, "runtime-debug-extra-dangerous-agent");
const extraExactLearningAgentFixture = path.join(tempDir, "runtime-debug-extra-exact-learning-agent");
const extraMalformedAgentFixture = path.join(tempDir, "runtime-debug-extra-malformed-agent");
const requiredAgentNames = ["orchestrator", "orchestrator-deep", "review-orchestrator", "explore", "architect", "general", "reviewer", "diagnose", "verifier", "researcher", "improver"];
const agentModes = new Map([
  ["orchestrator", "primary"],
  ["orchestrator-deep", "primary"],
  ["review-orchestrator", "primary"],
]);
const failures = [];
const expectedUnsafeCodes = [
  "HARNESS-R004",
  "HARNESS-R006",
  "HARNESS-R007",
  "HARNESS-R009",
  "HARNESS-R010",
  "HARNESS-R011",
  "HARNESS-R012",
  "HARNESS-R013",
  "HARNESS-R014",
  "HARNESS-R015",
  "HARNESS-R016",
  "HARNESS-R017",
  "HARNESS-R018",
];
const expectedReviewOrchestratorUnsafeEvidence = [
  "opencode debug agent review-orchestrator expected only context_read: allow",
  "opencode debug agent review-orchestrator expected only edit: deny",
  "opencode debug agent review-orchestrator unexpectedly exposes websearch: allow",
  "opencode debug agent review-orchestrator unexpectedly exposes webfetch: allow",
  "opencode debug agent review-orchestrator unexpectedly exposes oc_learning_*: ask",
  "opencode debug agent review-orchestrator expected only task.*: deny",
  "opencode debug agent review-orchestrator expected only task.explore: allow",
  "opencode debug agent review-orchestrator expected only task.reviewer: allow",
  "opencode debug agent review-orchestrator expected only task.researcher: allow",
  "opencode debug agent review-orchestrator expected only task.verifier: allow",
  "opencode debug agent review-orchestrator unexpectedly exposes task.general: allow",
  "opencode debug agent review-orchestrator unexpectedly exposes task.architect: allow",
  "opencode debug agent review-orchestrator unexpectedly exposes task.diagnose: allow",
  "opencode debug agent review-orchestrator unexpectedly exposes task.improver: allow",
];

function runFixture(fixtureDir, { args = [], env = {} } = {}) {
  return spawnSync(process.execPath, [verifier, "--fixture-dir", fixtureDir, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function fail(message) {
  failures.push(message);
}

function outputOf(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function permissionEntry(permission, action) {
  return { permission, action };
}

function permissionLine(permission, action) {
  return JSON.stringify(permissionEntry(permission, action));
}

function cliAgentList(names = requiredAgentNames) {
  return `${names.map((name) => `${name} (${agentModes.get(name) ?? "subagent"})\n ${JSON.stringify([])}`).join("\n")}\n`;
}

function writeCliAgentList(dir, names = requiredAgentNames) {
  fs.writeFileSync(path.join(dir, "agent-list.txt"), cliAgentList(names), "utf8");
}

function expectFailure(result, code, label) {
  const output = outputOf(result);
  if (result.status === 0 || !output.includes(code)) {
    fail(`${label} must fail with ${code}\n${output}`);
  }
}

function writeStructuredFixture(dir, options = {}) {
  fs.mkdirSync(dir, { recursive: true });
  writeCliAgentList(dir);
  fs.writeFileSync(
    path.join(dir, "debug-config.txt"),
    [
      permissionLine("default_agent", "orchestrator"),
      ...(options.unsafe ? [permissionLine("default_agent", "general")] : []),
      permissionLine("oc_learning_*", "deny"),
      ...(options.unsafe ? [permissionLine("oc_learning_*", "allow")] : []),
      "",
    ].join("\n"),
  );

  const contextTools = ["context_outline", "context_files", "context_search", "context_read"];
  const contextLines = contextTools.map((tool) => permissionLine(tool, "allow"));

  for (const agent of ["orchestrator", "orchestrator-deep", "explore", "architect", "diagnose", "verifier"]) {
    const lines = [...contextLines];
    if (options.unsafe && agent === "architect") {
      lines.push(permissionLine("context_read", "deny"));
    }
    if (["explore", "architect", "diagnose", "verifier"].includes(agent)) {
      lines.unshift(permissionLine("edit", "deny"));
    }
    if (options.unsafe && agent === "verifier") {
      lines.push(permissionLine("websearch", "allow"));
      lines.push(permissionLine("webfetch", "allow"));
    }
    fs.writeFileSync(path.join(dir, `debug-agent-${agent}.txt`), `${lines.join("\n")}\n`);
  }

  const reviewTaskLines = [
    permissionLine("task.*", "deny"),
    permissionLine("task.explore", "allow"),
    permissionLine("task.reviewer", "allow"),
    permissionLine("task.researcher", "allow"),
    permissionLine("task.verifier", "allow"),
  ];
  const reviewOrchestratorLines = [permissionLine("edit", "deny"), ...contextLines, ...reviewTaskLines];
  if (options.unsafe) {
    reviewOrchestratorLines.push(permissionLine("context_read", "deny"));
    reviewOrchestratorLines.push(permissionLine("edit", "allow"));
    reviewOrchestratorLines.push(permissionLine("websearch", "allow"));
    reviewOrchestratorLines.push(permissionLine("webfetch", "allow"));
    reviewOrchestratorLines.push(permissionLine("oc_learning_*", "ask"));
    reviewOrchestratorLines.push(permissionLine("task.*", "allow"));
    reviewOrchestratorLines.push(permissionLine("task.explore", "deny"));
    reviewOrchestratorLines.push(permissionLine("task.reviewer", "deny"));
    reviewOrchestratorLines.push(permissionLine("task.researcher", "deny"));
    reviewOrchestratorLines.push(permissionLine("task.verifier", "deny"));
    reviewOrchestratorLines.push(permissionLine("task.general", "allow"));
    reviewOrchestratorLines.push(permissionLine("task.architect", "allow"));
    reviewOrchestratorLines.push(permissionLine("task.diagnose", "allow"));
    reviewOrchestratorLines.push(permissionLine("task.improver", "allow"));
  }
  fs.writeFileSync(path.join(dir, "debug-agent-review-orchestrator.txt"), `${reviewOrchestratorLines.join("\n")}\n`);

  const generalLines = [permissionLine("edit", "allow"), permissionLine("webfetch", "deny"), permissionLine("websearch", "deny")];
  if (options.unsafe) {
    generalLines.push(permissionLine("edit", "deny"));
  }
  fs.writeFileSync(path.join(dir, "debug-agent-general.txt"), `${generalLines.join("\n")}\n`);

  const reviewerLines = options.unsafe
    ? [
        JSON.stringify({ permission: "edit", note: "missing action should not be paired with another object" }),
        permissionLine("edit", "deny"),
        permissionLine("edit", "allow"),
        permissionLine("bash", "deny"),
        ...contextLines,
      ]
    : [permissionLine("edit", "deny"), ...contextLines];
  fs.writeFileSync(path.join(dir, "debug-agent-reviewer.txt"), `${reviewerLines.join("\n")}\n`);

  fs.writeFileSync(
    path.join(dir, "debug-agent-researcher.txt"),
    [
      permissionLine("edit", "deny"),
      permissionLine("websearch", "allow"),
      ...(options.unsafe ? [permissionLine("websearch", "deny")] : []),
      JSON.stringify({ action: "allow", permission: "webfetch" }),
      ...(options.unsafe ? [permissionLine("webfetch", "deny")] : []),
      "",
    ].join("\n"),
  );

  fs.writeFileSync(
    path.join(dir, "debug-agent-improver.txt"),
    [
      permissionLine("edit", "deny"),
      JSON.stringify({ action: "ask", permission: "oc_learning_*" }),
      ...(options.unsafe ? [permissionLine("oc_learning_*", "allow")] : []),
      "",
    ].join("\n"),
  );

  if (options.unsafe) {
    fs.appendFileSync(
      path.join(dir, "debug-agent-orchestrator.txt"),
      `${JSON.stringify({ action: "ask", permission: "oc_learning_*" })}\n`,
    );
  }
}

function writeJsonSafeFixture(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "agent-list.txt"),
    `${JSON.stringify({ agents: requiredAgentNames.map((name) => ({ name, mode: agentModes.get(name) ?? "subagent" })) }, null, 2)}\n`,
    "utf8",
  );

  const contextPermissions = [
    permissionEntry("context_outline", "allow"),
    permissionEntry("context_files", "allow"),
    permissionEntry("context_search", "allow"),
    permissionEntry("context_read", "allow"),
  ];
  const inheritedWebThenDeny = [
    permissionEntry("websearch", "allow"),
    permissionEntry("webfetch", "allow"),
    permissionEntry("websearch", "deny"),
    permissionEntry("webfetch", "deny"),
  ];
  const nestedDecoys = {
    nested: {
      permission: [
        permissionEntry("websearch", "allow"),
        permissionEntry("webfetch", "allow"),
        permissionEntry("oc_learning_*", "ask"),
        permissionEntry("edit", "allow"),
      ],
    },
  };
  const writeJson = (name, permissions, extra = {}) => {
    fs.writeFileSync(
      path.join(dir, `${name}.txt`),
      `${JSON.stringify({ ...extra, permission: permissions, ...nestedDecoys }, null, 2)}\n`,
    );
  };

  fs.writeFileSync(
    path.join(dir, "debug-config.txt"),
    `${JSON.stringify(
      {
        default_agent: "orchestrator",
        permission: { "oc_learning_*": "deny" },
        ...nestedDecoys,
      },
      null,
      2,
    )}\n`,
  );

  for (const agent of ["orchestrator", "orchestrator-deep"]) {
    writeJson(`debug-agent-${agent}`, [...contextPermissions, ...inheritedWebThenDeny]);
  }
  writeJson("debug-agent-review-orchestrator", [
    permissionEntry("edit", "deny"),
    ...contextPermissions,
    ...inheritedWebThenDeny,
    permissionEntry("oc_learning_*", "deny"),
    permissionEntry("task.*", "deny"),
    permissionEntry("task.explore", "allow"),
    permissionEntry("task.reviewer", "allow"),
    permissionEntry("task.researcher", "allow"),
    permissionEntry("task.verifier", "allow"),
  ]);
  for (const agent of ["explore", "architect", "reviewer", "diagnose", "verifier"]) {
    writeJson(`debug-agent-${agent}`, [permissionEntry("edit", "deny"), ...contextPermissions, ...inheritedWebThenDeny]);
  }

  writeJson("debug-agent-general", [
    permissionEntry("oc_learning_*", "deny"),
    permissionEntry("edit", "deny"),
    permissionEntry("edit", "allow"),
    ...inheritedWebThenDeny,
  ]);
  writeJson("debug-agent-researcher", [
    permissionEntry("oc_learning_*", "deny"),
    permissionEntry("edit", "deny"),
    permissionEntry("websearch", "allow"),
    permissionEntry("webfetch", "allow"),
  ]);
  writeJson("debug-agent-improver", [
    permissionEntry("oc_learning_*", "deny"),
    permissionEntry("edit", "deny"),
    ...inheritedWebThenDeny,
    permissionEntry("oc_learning_*", "ask"),
  ]);
}

function writeSubjectEvidence(file, candidateId, repositoryFingerprint) {
  fs.writeFileSync(file, `${JSON.stringify({
    schema_version: 1,
    producer_id: EVIDENCE_PRODUCERS.staticVerification,
    source: "local_verify",
    candidate_id: candidateId,
    repository_fingerprint: repositoryFingerprint,
    command_id: "npm-run-verify",
    passed: true,
    complete: true,
    created_at: "2026-07-10T09:00:00.000Z",
    duration_ms: 25,
  }, null, 2)}\n`, "utf8");
}

function onlyEvidenceSnapshot(evidenceWorkspace) {
  const evidenceDir = path.join(evidenceWorkspace, ".oc_harness", "evidence");
  const evidenceFiles = fs.readdirSync(evidenceDir).filter((name) => name.endsWith(".json"));
  if (evidenceFiles.length !== 1) {
    fail(`runtime permission evidence should write exactly one JSON snapshot, got ${evidenceFiles.length}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(path.join(evidenceDir, evidenceFiles[0]), "utf8"));
}

try {
  const safe = runFixture(safeFixture);
  if (safe.status !== 0) {
    fail(`safe runtime fixture should pass, exited ${safe.status}\n${outputOf(safe)}`);
  }

  fs.cpSync(safeFixture, missingInventoryFixture, { recursive: true });
  fs.rmSync(path.join(missingInventoryFixture, "agent-list.txt"));
  expectFailure(runFixture(missingInventoryFixture), "HARNESS-R001", "missing agent inventory fixture");

  fs.cpSync(safeFixture, emptyInventoryFixture, { recursive: true });
  fs.writeFileSync(path.join(emptyInventoryFixture, "agent-list.txt"), "\n", "utf8");
  expectFailure(runFixture(emptyInventoryFixture), "HARNESS-R022", "empty agent inventory fixture");

  fs.cpSync(safeFixture, malformedInventoryFixture, { recursive: true });
  fs.writeFileSync(path.join(malformedInventoryFixture, "agent-list.txt"), "not an OpenCode agent inventory\n", "utf8");
  expectFailure(runFixture(malformedInventoryFixture), "HARNESS-R022", "malformed agent inventory fixture");

  fs.cpSync(safeFixture, duplicateInventoryFixture, { recursive: true });
  writeCliAgentList(duplicateInventoryFixture, [...requiredAgentNames, requiredAgentNames[0]]);
  expectFailure(runFixture(duplicateInventoryFixture), "HARNESS-R022", "duplicate agent inventory fixture");

  fs.cpSync(safeFixture, unsafeInventoryFixture, { recursive: true });
  fs.writeFileSync(
    path.join(unsafeInventoryFixture, "agent-list.txt"),
    `${cliAgentList(requiredAgentNames)}bad/name (subagent)\n []\n`,
    "utf8",
  );
  expectFailure(runFixture(unsafeInventoryFixture), "HARNESS-R022", "unsafe-name agent inventory fixture");

  fs.cpSync(safeFixture, oversizedInventoryFixture, { recursive: true });
  fs.writeFileSync(path.join(oversizedInventoryFixture, "agent-list.txt"), "x".repeat((2 * 1024 * 1024) + 1), "utf8");
  expectFailure(runFixture(oversizedInventoryFixture), "HARNESS-R022", "oversized agent inventory fixture");

  fs.cpSync(safeFixture, tooManyAgentsFixture, { recursive: true });
  writeCliAgentList(
    tooManyAgentsFixture,
    [...requiredAgentNames, ...Array.from({ length: 118 }, (_, index) => `extra-${index}`)],
  );
  expectFailure(runFixture(tooManyAgentsFixture), "HARNESS-R022", "over-count agent inventory fixture");

  fs.cpSync(safeFixture, unsupportedModeFixture, { recursive: true });
  fs.writeFileSync(
    path.join(unsupportedModeFixture, "agent-list.txt"),
    cliAgentList(requiredAgentNames).replace("architect (subagent)", "architect (unknown)"),
    "utf8",
  );
  expectFailure(runFixture(unsupportedModeFixture), "HARNESS-R022", "unsupported agent mode fixture");

  fs.cpSync(safeFixture, wrongRequiredModeFixture, { recursive: true });
  fs.writeFileSync(
    path.join(wrongRequiredModeFixture, "agent-list.txt"),
    cliAgentList(requiredAgentNames).replace("architect (subagent)", "architect (primary)"),
    "utf8",
  );
  expectFailure(runFixture(wrongRequiredModeFixture), "HARNESS-R024", "wrong required agent mode fixture");

  fs.cpSync(safeFixture, strayInventoryTextFixture, { recursive: true });
  fs.writeFileSync(
    path.join(strayInventoryTextFixture, "agent-list.txt"),
    `${cliAgentList(requiredAgentNames)}unexpected trailing text\n`,
    "utf8",
  );
  expectFailure(runFixture(strayInventoryTextFixture), "HARNESS-R022", "stray agent inventory text fixture");

  fs.cpSync(safeFixture, missingRequiredAgentFixture, { recursive: true });
  writeCliAgentList(missingRequiredAgentFixture, requiredAgentNames.filter((name) => name !== "verifier"));
  expectFailure(runFixture(missingRequiredAgentFixture), "HARNESS-R023", "missing required agent fixture");

  fs.cpSync(safeFixture, missingAgentDebugFixture, { recursive: true });
  writeCliAgentList(missingAgentDebugFixture, [...requiredAgentNames, "unexpected-agent"]);
  expectFailure(runFixture(missingAgentDebugFixture), "HARNESS-R001", "missing discovered-agent debug output fixture");

  const evidenceWorkspace = path.join(tempDir, "evidence-workspace");
  fs.mkdirSync(evidenceWorkspace);
  const subjectFingerprint = fingerprint({ repository: "fixture-subject" });
  const subjectEvidencePath = path.join(tempDir, "baseline-static-evidence.json");
  writeSubjectEvidence(subjectEvidencePath, "baseline", subjectFingerprint);

  const missingSubject = runFixture(safeFixture, {
    args: ["--evidence-profile", "baseline"],
    env: { HARNESS_EVIDENCE_WORKSPACE: evidenceWorkspace },
  });
  if (missingSubject.status === 0 || !outputOf(missingSubject).includes("HARNESS-R020")) {
    fail(`runtime evidence must require a bound static subject\n${outputOf(missingSubject)}`);
  }
  const mismatchedSubjectPath = path.join(tempDir, "mismatched-static-evidence.json");
  writeSubjectEvidence(mismatchedSubjectPath, "candidate", subjectFingerprint);
  const mismatchedSubject = runFixture(safeFixture, {
    args: ["--evidence-profile", "baseline", "--subject-evidence", mismatchedSubjectPath],
    env: { HARNESS_EVIDENCE_WORKSPACE: evidenceWorkspace },
  });
  if (mismatchedSubject.status === 0 || !outputOf(mismatchedSubject).includes("HARNESS-R020")) {
    fail(`runtime evidence must reject a label-only subject mismatch\n${outputOf(mismatchedSubject)}`);
  }

  let baselineSnapshot = null;
  const evidenceRun = runFixture(safeFixture, {
    args: ["--evidence-profile", "baseline", "--subject-evidence", subjectEvidencePath],
    env: {
      HARNESS_EVIDENCE_WORKSPACE: evidenceWorkspace,
      HARNESS_EVIDENCE_TIMESTAMP: "2026-07-10T10:00:00.000Z",
    },
  });
  if (evidenceRun.status !== 0) {
    fail(`runtime permission evidence fixture should pass, exited ${evidenceRun.status}\n${outputOf(evidenceRun)}`);
  } else {
    const snapshot = onlyEvidenceSnapshot(evidenceWorkspace);
    if (snapshot) {
      baselineSnapshot = snapshot;
      if (snapshot.producer_id !== EVIDENCE_PRODUCERS.runtimePermissionSnapshot || snapshot.profile_id !== "baseline" || snapshot.source !== "fixture" || snapshot.complete !== true) {
        fail("runtime permission evidence snapshot has invalid provenance or completeness fields");
      }
      if (snapshot.subject_fingerprint !== subjectFingerprint) {
        fail("runtime permission evidence snapshot is not bound to its static subject");
      }
      if (snapshot.surface_fingerprint !== fingerprint(snapshot.permissions)) {
        fail("runtime permission evidence snapshot fingerprint does not match normalized permissions");
      }
      if (snapshot.profile_fingerprint !== permissionProfileFingerprint({
        subjectFingerprint: snapshot.subject_fingerprint,
        runtimeFingerprint: snapshot.runtime_fingerprint,
        surfaceFingerprint: snapshot.surface_fingerprint,
      })) {
        fail("runtime permission evidence profile fingerprint is not content-derived");
      }
      if (!/^sha256:[0-9a-f]{64}$/.test(snapshot.runtime_fingerprint) || snapshot.incomplete_scopes.length !== 0) {
        fail("runtime permission evidence must record a complete raw-runtime digest and no incomplete scopes");
      }
      const serialized = JSON.stringify(snapshot);
      if (serialized.includes(root) || serialized.includes(safeFixture) || serialized.includes("debug-agent")) {
        fail("runtime permission evidence snapshot persisted a machine path or raw debug output");
      }
      if (Object.values(snapshot.permissions).some((value) => !["allow", "ask", "deny"].includes(value))) {
        fail("runtime permission evidence snapshot contains a non-normalized permission value");
      }
    }
  }

  fs.cpSync(safeFixture, extraAgentFixture, { recursive: true });
  writeCliAgentList(extraAgentFixture, [...requiredAgentNames, "unexpected-agent"]);
  fs.writeFileSync(
    path.join(extraAgentFixture, "debug-agent-unexpected-agent.txt"),
    "agent: unexpected-agent\npermission:\n  custom_runtime_tool: deny\n",
    "utf8",
  );
  const extraAgentEvidenceWorkspace = path.join(tempDir, "extra-agent-evidence-workspace");
  fs.mkdirSync(extraAgentEvidenceWorkspace);
  const extraAgentEvidence = runFixture(extraAgentFixture, {
    args: ["--evidence-profile", "baseline", "--subject-evidence", subjectEvidencePath],
    env: {
      HARNESS_EVIDENCE_WORKSPACE: extraAgentEvidenceWorkspace,
      HARNESS_EVIDENCE_TIMESTAMP: "2026-07-10T10:00:30.000Z",
    },
  });
  if (extraAgentEvidence.status !== 0) {
    fail(`unexpected discovered agent evidence should pass, exited ${extraAgentEvidence.status}\n${outputOf(extraAgentEvidence)}`);
  } else {
    const snapshot = onlyEvidenceSnapshot(extraAgentEvidenceWorkspace);
    if (
      !snapshot
      || snapshot.complete !== true
      || snapshot.permissions["agent.unexpected-agent.custom_runtime_tool"] !== "deny"
      || snapshot.incomplete_scopes.length !== 0
    ) {
      fail("permission evidence must include the complete scope of every discovered additional agent");
    }
    if (baselineSnapshot && snapshot?.runtime_fingerprint === baselineSnapshot.runtime_fingerprint) {
      fail("runtime evidence fingerprint must bind the discovered additional agent output");
    }
  }

  const extraAgentPrimaryFixture = path.join(tempDir, "runtime-debug-extra-agent-primary");
  fs.cpSync(extraAgentFixture, extraAgentPrimaryFixture, { recursive: true });
  fs.writeFileSync(
    path.join(extraAgentPrimaryFixture, "agent-list.txt"),
    fs.readFileSync(path.join(extraAgentPrimaryFixture, "agent-list.txt"), "utf8")
      .replace("unexpected-agent (subagent)", "unexpected-agent (primary)"),
    "utf8",
  );
  const extraAgentPrimaryEvidenceWorkspace = path.join(tempDir, "extra-agent-primary-evidence-workspace");
  fs.mkdirSync(extraAgentPrimaryEvidenceWorkspace);
  const extraAgentPrimaryEvidence = runFixture(extraAgentPrimaryFixture, {
    args: ["--evidence-profile", "baseline", "--subject-evidence", subjectEvidencePath],
    env: {
      HARNESS_EVIDENCE_WORKSPACE: extraAgentPrimaryEvidenceWorkspace,
      HARNESS_EVIDENCE_TIMESTAMP: "2026-07-10T10:00:31.000Z",
    },
  });
  if (extraAgentPrimaryEvidence.status !== 0) {
    fail(`unknown primary agent evidence should pass when its permissions are safe\n${outputOf(extraAgentPrimaryEvidence)}`);
  } else {
    const subagentSnapshot = onlyEvidenceSnapshot(extraAgentEvidenceWorkspace);
    const primarySnapshot = onlyEvidenceSnapshot(extraAgentPrimaryEvidenceWorkspace);
    if (subagentSnapshot?.runtime_fingerprint === primarySnapshot?.runtime_fingerprint) {
      fail("runtime evidence fingerprint must bind every discovered agent mode");
    }
  }

  fs.cpSync(safeFixture, extraDangerousAgentFixture, { recursive: true });
  writeCliAgentList(extraDangerousAgentFixture, [...requiredAgentNames, "unexpected-agent"]);
  fs.writeFileSync(
    path.join(extraDangerousAgentFixture, "debug-agent-unexpected-agent.txt"),
    "permission:\n  websearch: allow\n  webfetch: allow\n  oc_learning_*: allow\n",
    "utf8",
  );
  const extraDangerous = runFixture(extraDangerousAgentFixture);
  for (const code of ["HARNESS-R013", "HARNESS-R014", "HARNESS-R015"]) {
    if (extraDangerous.status === 0 || !outputOf(extraDangerous).includes(code)) {
      fail(`unknown extra agent must not bypass ${code}\n${outputOf(extraDangerous)}`);
    }
  }

  fs.cpSync(safeFixture, extraExactLearningAgentFixture, { recursive: true });
  writeCliAgentList(extraExactLearningAgentFixture, [...requiredAgentNames, "unexpected-agent"]);
  fs.writeFileSync(
    path.join(extraExactLearningAgentFixture, "debug-agent-unexpected-agent.txt"),
    "permission:\n  oc_learning_*: deny\n  oc_learning_memory_add: allow\n  websearch: deny\n  webfetch: deny\n",
    "utf8",
  );
  const extraExactLearning = runFixture(extraExactLearningAgentFixture);
  expectFailure(extraExactLearning, "HARNESS-R013", "exact oc_learning grant on an unknown agent");

  fs.cpSync(safeFixture, extraMalformedAgentFixture, { recursive: true });
  writeCliAgentList(extraMalformedAgentFixture, [...requiredAgentNames, "unexpected-agent"]);
  fs.writeFileSync(
    path.join(extraMalformedAgentFixture, "debug-agent-unexpected-agent.txt"),
    "permission:\n  custom_runtime_tool: sometimes\n  malformed entry\n",
    "utf8",
  );
  const extraMalformedEvidenceWorkspace = path.join(tempDir, "extra-malformed-evidence-workspace");
  fs.mkdirSync(extraMalformedEvidenceWorkspace);
  const extraMalformedEvidence = runFixture(extraMalformedAgentFixture, {
    args: ["--evidence-profile", "baseline", "--subject-evidence", subjectEvidencePath],
    env: {
      HARNESS_EVIDENCE_WORKSPACE: extraMalformedEvidenceWorkspace,
      HARNESS_EVIDENCE_TIMESTAMP: "2026-07-10T10:00:32.000Z",
    },
  });
  if (extraMalformedEvidence.status === 0 || !outputOf(extraMalformedEvidence).includes("HARNESS-R021")) {
    fail(`malformed extra-agent output must fail closed in evidence mode\n${outputOf(extraMalformedEvidence)}`);
  }

  writeStructuredFixture(structuredSafeFixture);
  const structuredSafe = runFixture(structuredSafeFixture);
  if (structuredSafe.status !== 0) {
    fail(`structured safe runtime fixture should pass, exited ${structuredSafe.status}\n${outputOf(structuredSafe)}`);
  }

  writeJsonSafeFixture(jsonSafeFixture);
  const jsonSafe = runFixture(jsonSafeFixture);
  if (jsonSafe.status !== 0) {
    fail(`JSON safe runtime fixture should pass, exited ${jsonSafe.status}\n${outputOf(jsonSafe)}`);
  }

  const streamSurface = extractPermissionSurface([
    permissionLine("bash", "deny").replace("}", ',"pattern":"git status"}'),
    permissionLine("bash", "allow").replace("}", ',"pattern":"git status"}'),
    permissionLine("external_directory", "ask").replace("}", ',"pattern":"../shared"}'),
  ].join("\n"));
  const streamBashKey = Object.keys(streamSurface.permissions).find((key) => key.startsWith("bash."));
  const streamExternalKey = Object.keys(streamSurface.permissions).find((key) => key.startsWith("external_directory."));
  if (!streamSurface.complete || streamSurface.permissions[streamBashKey] !== "allow" || streamSurface.permissions[streamExternalKey] !== "ask") {
    fail("JSON permission-entry stream must flatten nested patterns and apply last-rule-wins");
  }

  const objectSurface = extractPermissionSurface(JSON.stringify({
    permission: {
      bash: { "*": "deny", "git status": "ask" },
      external_directory: { "*": "deny", "../shared": "ask" },
      root_tool: "allow",
      task: { "*": "deny", reviewer: "allow" },
    },
  }));
  if (!objectSurface.complete || Object.keys(objectSurface.permissions).length !== 7) {
    fail("JSON permission object must flatten every nested bash, external_directory, root tool, and task leaf");
  }

  const unknownSurface = extractPermissionSurface(JSON.stringify({
    permission: { safe_tool: "deny", previously_unlisted_tool: "sometimes" },
  }));
  if (unknownSurface.complete || unknownSurface.permissions.previously_unlisted_tool !== undefined || unknownSurface.permissions.safe_tool !== "deny") {
    fail("unknown permission actions must make evidence incomplete without synthesizing deny");
  }

  const protoObjectSurface = extractPermissionSurface('{"permission":{"__proto__":"allow","safe_tool":"deny"}}');
  if (
    !protoObjectSurface.complete
    || !Object.hasOwn(protoObjectSurface.permissions, "__proto__")
    || protoObjectSurface.permissions.__proto__ !== "allow"
    || protoObjectSurface.permissions.safe_tool !== "deny"
  ) {
    fail("JSON permission objects must preserve an own __proto__ permission leaf");
  }
  const protoStreamSurface = extractPermissionSurface('{"permission":"__proto__","action":"ask"}\n');
  if (!protoStreamSurface.complete || !Object.hasOwn(protoStreamSurface.permissions, "__proto__") || protoStreamSurface.permissions.__proto__ !== "ask") {
    fail("JSON permission streams must preserve an own __proto__ permission leaf");
  }
  const protoAgentOutputs = new Map([["__proto__", '{"permission":{"safe_tool":"deny"}}']]);
  const protoAgentFingerprint = runtimeOutputsFingerprint({
    configOutput: "{}",
    agentOutputs: protoAgentOutputs,
    agentInventory: [{ name: "__proto__", mode: "subagent" }],
  });
  const changedProtoAgentFingerprint = runtimeOutputsFingerprint({
    configOutput: "{}",
    agentOutputs: new Map([["__proto__", '{"permission":{"safe_tool":"ask"}}']]),
    agentInventory: [{ name: "__proto__", mode: "subagent" }],
  });
  const protoAgentSurface = collectResolvedPermissionSurface({
    configOutput: '{"permission":{"root":"deny"}}',
    agentOutputs: protoAgentOutputs,
    agentNames: ["__proto__"],
  });
  if (
    protoAgentFingerprint === changedProtoAgentFingerprint
    || protoAgentSurface.permissions["agent.__proto__.safe_tool"] !== "deny"
  ) {
    fail("runtime fingerprints and permission surfaces must preserve a __proto__ agent scope");
  }

  fs.cpSync(safeFixture, nestedSafeFixture, { recursive: true });
  const nestedConfigPath = path.join(nestedSafeFixture, "debug-config.txt");
  fs.writeFileSync(
    nestedConfigPath,
    fs.readFileSync(nestedConfigPath, "utf8").replace(
      "  external_directory: ask",
      '  external_directory:\n    "*": deny\n    "../shared": ask\n  bash:\n    "*": deny\n    "git status": ask',
    ),
    "utf8",
  );
  fs.appendFileSync(path.join(nestedSafeFixture, "debug-agent-general.txt"), "  custom_runtime_tool: deny\n", "utf8");
  const nestedEvidenceWorkspace = path.join(tempDir, "nested-evidence-workspace");
  fs.mkdirSync(nestedEvidenceWorkspace);
  const nestedEvidence = runFixture(nestedSafeFixture, {
    args: ["--evidence-profile", "baseline", "--subject-evidence", subjectEvidencePath],
    env: {
      HARNESS_EVIDENCE_WORKSPACE: nestedEvidenceWorkspace,
      HARNESS_EVIDENCE_TIMESTAMP: "2026-07-10T10:01:00.000Z",
    },
  });
  if (nestedEvidence.status !== 0) {
    fail(`nested permission evidence fixture should pass, exited ${nestedEvidence.status}\n${outputOf(nestedEvidence)}`);
  } else {
    const snapshot = onlyEvidenceSnapshot(nestedEvidenceWorkspace);
    const keys = snapshot ? Object.keys(snapshot.permissions) : [];
    for (const prefix of ["config.bash.", "config.external_directory.", "agent.general.custom_runtime_tool", "agent.review-orchestrator.task."]) {
      if (!keys.some((key) => key.startsWith(prefix))) fail(`complete permission evidence omitted nested or unlisted key prefix ${prefix}`);
    }
  }

  fs.cpSync(nestedSafeFixture, malformedEvidenceFixture, { recursive: true });
  fs.appendFileSync(
    path.join(malformedEvidenceFixture, "debug-agent-general.txt"),
    "permission:\n  previously_unlisted_tool: sometimes\n  malformed entry\n",
    "utf8",
  );
  const malformedEvidenceWorkspace = path.join(tempDir, "malformed-evidence-workspace");
  fs.mkdirSync(malformedEvidenceWorkspace);
  const malformedEvidence = runFixture(malformedEvidenceFixture, {
    args: ["--evidence-profile", "baseline", "--subject-evidence", subjectEvidencePath],
    env: {
      HARNESS_EVIDENCE_WORKSPACE: malformedEvidenceWorkspace,
      HARNESS_EVIDENCE_TIMESTAMP: "2026-07-10T10:02:00.000Z",
    },
  });
  if (malformedEvidence.status === 0 || !outputOf(malformedEvidence).includes("HARNESS-R021")) {
    fail(`malformed or unknown permission evidence must be incomplete\n${outputOf(malformedEvidence)}`);
  }
  const incompleteSnapshot = onlyEvidenceSnapshot(malformedEvidenceWorkspace);
  if (
    !incompleteSnapshot
    || incompleteSnapshot.complete !== false
    || !incompleteSnapshot.incomplete_scopes.includes("agent.general")
    || Object.keys(incompleteSnapshot.permissions).some((key) => key.includes("previously_unlisted_tool"))
  ) {
    fail("incomplete permission snapshot must name its scope and must not synthesize an unknown action");
  }

  fs.cpSync(safeFixture, unsafeFixture, { recursive: true });

  fs.appendFileSync(path.join(unsafeFixture, "debug-config.txt"), '\n  "oc_learning_*": allow\n');
  fs.appendFileSync(path.join(unsafeFixture, "debug-config.txt"), '\n  default_agent: general\n');

  const reviewerFixture = path.join(unsafeFixture, "debug-agent-reviewer.txt");
  fs.writeFileSync(
    reviewerFixture,
    fs.readFileSync(reviewerFixture, "utf8").replace("edit: deny", "edit: deny\n  edit: allow\n  bash: deny"),
  );

  fs.appendFileSync(path.join(unsafeFixture, "debug-agent-architect.txt"), "\n  context_read: deny\n");
  fs.appendFileSync(
    path.join(unsafeFixture, "debug-agent-review-orchestrator.txt"),
    "\n  context_read: deny\n  edit: allow\n  websearch: allow\n  webfetch: allow\n  \"oc_learning_*\": ask\n  task:\n    \"*\": allow\n    explore: deny\n    reviewer: deny\n    researcher: deny\n    verifier: deny\n    general: allow\n    architect: allow\n    diagnose: allow\n    improver: allow\n",
  );
  fs.appendFileSync(path.join(unsafeFixture, "debug-agent-verifier.txt"), "\n  websearch: allow\n  webfetch: allow\n");
  fs.appendFileSync(path.join(unsafeFixture, "debug-agent-researcher.txt"), "\n  websearch: deny\n  webfetch: deny\n");
  fs.appendFileSync(path.join(unsafeFixture, "debug-agent-general.txt"), "\n  edit: deny\n");
  fs.appendFileSync(path.join(unsafeFixture, "debug-agent-improver.txt"), '\n  "oc_learning_*": allow\n');

  const orchestratorFixture = path.join(unsafeFixture, "debug-agent-orchestrator.txt");
  fs.appendFileSync(orchestratorFixture, '\n  "oc_learning_*": ask\n');

  const unsafe = runFixture(unsafeFixture);
  const unsafeOutput = outputOf(unsafe);
  if (unsafe.status === 0) {
    fail("unsafe runtime fixture should fail, but it passed");
  }
  for (const code of expectedUnsafeCodes) {
    if (!unsafeOutput.includes(code)) {
      fail(`unsafe runtime fixture should report ${code}\n${unsafeOutput}`);
    }
  }
  for (const evidence of expectedReviewOrchestratorUnsafeEvidence) {
    if (!unsafeOutput.includes(evidence)) {
      fail(`unsafe runtime fixture should prove review-orchestrator boundary: ${evidence}\n${unsafeOutput}`);
    }
  }

  writeStructuredFixture(structuredUnsafeFixture, { unsafe: true });
  const structuredUnsafe = runFixture(structuredUnsafeFixture);
  const structuredUnsafeOutput = outputOf(structuredUnsafe);
  if (structuredUnsafe.status === 0) {
    fail("structured unsafe runtime fixture should fail, but it passed");
  }
  for (const code of expectedUnsafeCodes) {
    if (!structuredUnsafeOutput.includes(code)) {
      fail(`structured unsafe runtime fixture should report ${code}\n${structuredUnsafeOutput}`);
    }
  }
  for (const evidence of expectedReviewOrchestratorUnsafeEvidence) {
    if (!structuredUnsafeOutput.includes(evidence)) {
      fail(`structured unsafe fixture should prove review-orchestrator boundary: ${evidence}\n${structuredUnsafeOutput}`);
    }
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Harness runtime fixture verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Harness runtime fixture verification passed.");
