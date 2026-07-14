import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { ContractError, createAdapterInstrumentation, createTraceStore } from "../lib/feedback/index.mjs";
import { materializeStagedRunArtifacts } from "../lib/feedback/trace-store.mjs";
import { evaluateTraceAssertions } from "../lib/feedback/trace-assertions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tests = [];

function test(name, callback) {
  tests.push({ name, callback });
}

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "opencode-trace-store-"));
}

function deterministicStore(workspaceRoot, limits = {}) {
  const ids = new Map();
  let tick = 0;
  return createTraceStore({
    workspaceRoot,
    idFactory: (kind) => {
      const next = (ids.get(kind) ?? 0) + 1;
      ids.set(kind, next);
      return `${kind}-${next}`;
    },
    clock: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)),
    limits,
  });
}

function runPath(workspaceRoot, runId, ...segments) {
  return path.join(workspaceRoot, ".oc_harness", "runs", runId, ...segments);
}

function baseEvent(overrides = {}) {
  return {
    task_id: "task-root",
    parent_task_id: null,
    agent: "orchestrator",
    event_type: "task_start",
    summary: "Start deterministic trace test.",
    tool_or_command: null,
    permission_decision: "not_applicable",
    files_read: [],
    files_written: [],
    evidence_refs: [],
    verification: null,
    status: "completed",
    risk: "high",
    termination_reason: null,
    hypothesis: null,
    expected_observation: null,
    actual_observation: null,
    context_snapshot: null,
    verifier_codes: [],
    strategy_id: "strategy-main",
    ...overrides,
  };
}

function verificationInput(overrides = {}) {
  return {
    status: "passed",
    summary: "Deterministic checks passed.",
    checks: [
      {
        code: "TRACE-CHECK-1",
        status: "passed",
        summary: "Trace lifecycle passed.",
        evidence_refs: [{ kind: "file", value: "scripts/verify-trace-store.mjs" }],
      },
    ],
    evidence_refs: [{ kind: "check", value: "TRACE-CHECK-1" }],
    incomplete_reasons: [],
    ...overrides,
  };
}

function taskEndEvent(overrides = {}) {
  return baseEvent({
    event_type: "task_end",
    summary: "Trace run verified.",
    status: "completed",
    termination_reason: "verified",
    verification: { status: "passed", summary: "Final checks passed.", verifier_codes: ["TRACE-CHECK-1"] },
    verifier_codes: ["TRACE-CHECK-1"],
    ...overrides,
  });
}

function finalizeMinimalRun(store, runId) {
  store.createRun({ run_id: runId, strategy_id: "strategy-main" });
  store.appendEvent(runId, baseEvent());
  store.recordVerification(runId, verificationInput());
  store.appendEvent(runId, taskEndEvent());
  store.finalizeRun(runId, {
    status: "completed",
    termination_reason: "verified",
    summary: "Staged bundle verified.",
    evidence_refs: [],
  });
}

function resultInput(overrides = {}) {
  return {
    status: "completed",
    assigned_scope: "Implement the bounded trace slice.",
    summary: "Trace slice completed.",
    evidence: ["scripts/verify-trace-store.mjs"],
    files_changed: ["lib/feedback/trace-store.mjs"],
    verification: "Targeted lifecycle checks passed.",
    decision_unblocked: "Runner integration can consume the trace API.",
    uncertainty: "No live adapter was invoked.",
    risks: ["Host adapters remain an external boundary."],
    next_step: "Integrate the live runner.",
    termination_reason: "verified",
    ...overrides,
  };
}

function legacyEvent(runId, overrides = {}) {
  return {
    schema_version: 1,
    run_id: runId,
    task_id: "task-root",
    parent_task_id: null,
    agent: "orchestrator",
    event_type: "task_start",
    timestamp: "2026-01-01T00:00:00Z",
    summary: "Start legacy trace inspection.",
    tool_or_command: null,
    permission_decision: "not_applicable",
    files_read: ["src/app.js"],
    files_written: [],
    evidence_refs: ["docs/evidence.md"],
    verification: null,
    token_or_cost_hint: null,
    status: "completed",
    termination_reason: null,
    risk: "standard",
    ...overrides,
  };
}

function writeJsonLines(file, entries) {
  fs.writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
}

function assertContractError(callback, code) {
  assert.throws(callback, (error) => error instanceof ContractError && (!code || error.code === code));
}

test("full deterministic run lifecycle persists and reads every artifact", () => {
  const ws = workspace();
  try {
    const store = deterministicStore(ws);
    const run = store.createRun({
      run_id: "run-lifecycle",
      parent_run_id: null,
      scenario_id: "runner-self-test",
      profile_role: "baseline",
      harness_fingerprint: "sha256-demo",
      model: "deterministic-model",
      model_parameters: { temperature: 0, seed: 7, reasoning_effort: "low" },
      task_class: "implementation",
      strategy_id: "strategy-main",
      risk: "high",
      unavailable_metadata: [],
    });
    assert.equal(run.started_at, "2026-01-01T00:00:00.000Z");
    assert.equal(run.lifecycle, "active");

    const start = store.appendEvent(run.run_id, baseEvent());
    assert.equal(start.event_id, "event-1");
    assert.equal(start.sequence, 1);

    const receipt = store.recordContextReceipt(run.run_id, {
      task_id: "task-root",
      source_kind: "files",
      summary: "Read the trace contract and implementation boundary.",
      relative_paths: ["docs/trace-contract.md", "lib/feedback/contracts.mjs"],
      snapshot_fingerprint: "sha256-context",
    });
    assert.equal(receipt.receipt_id, "receipt-1");

    const created = store.createJob(run.run_id, {
      task_id: "task-child",
      parent_task_id: "task-root",
      agent: "general",
      assigned_scope: "Implement trace store files.",
      write_scope: ["lib/feedback/trace-store.mjs"],
      risk: "high",
    });
    assert.equal(created.status.state, "created");
    assert.equal(store.transitionJob(run.run_id, "task-child", { state: "running" }).state, "running");
    const completed = store.completeJob(run.run_id, "task-child", { state: "completed", result: resultInput() });
    assert.equal(completed.status.state, "completed");
    assert.equal(completed.status.started_at, "2026-01-01T00:00:04.000Z");
    assert.deepEqual(
      Object.keys(completed.result).filter((key) => [
        "status", "assigned_scope", "summary", "evidence", "files_changed", "verification", "decision_unblocked",
        "uncertainty", "risks", "next_step", "termination_reason",
      ].includes(key)).sort(),
      ["assigned_scope", "decision_unblocked", "evidence", "files_changed", "next_step", "risks", "status", "summary", "termination_reason", "uncertainty", "verification"],
    );

    store.appendEvent(run.run_id, baseEvent({
      event_type: "verification",
      summary: "Verification passed.",
      verification: { status: "passed", summary: "All targeted checks passed.", verifier_codes: ["TRACE-CHECK-1"] },
      verifier_codes: ["TRACE-CHECK-1"],
    }));
    const verification = store.recordVerification(run.run_id, verificationInput());
    assert.equal(verification.status, "passed");
    store.appendEvent(run.run_id, taskEndEvent());
    const finalized = store.finalizeRun(run.run_id, {
      status: "completed",
      termination_reason: "verified",
      summary: "Operational trace lifecycle verified.",
      evidence_refs: [{ kind: "check", value: "TRACE-CHECK-1" }],
    });
    assert.equal(finalized.run.lifecycle, "final");
    assert.equal(finalized.outcome.verification_status, "passed");

    const inspected = store.inspectRun(run.run_id);
    assert.equal(inspected.complete, true);
    assert.equal(inspected.legacy_events_present, false);
    assert.equal(inspected.events.length, 3);
    assert.equal(inspected.context_receipts.length, 1);
    assert.equal(inspected.jobs.length, 1);
    assert.equal(inspected.jobs[0].result.status, "completed");
    for (const file of [
      "run.json", "events.jsonl", "context-receipts.jsonl", "verification.json", "outcome.json",
      path.join("jobs", "task-child", "request.json"), path.join("jobs", "task-child", "status.json"), path.join("jobs", "task-child", "result.json"),
    ]) assert.equal(fs.existsSync(runPath(ws, run.run_id, file)), true, file);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("injected factories deterministically own generated run, event, receipt, and task IDs", () => {
  const ws = workspace();
  try {
    const store = deterministicStore(ws);
    const run = store.createRun();
    assert.equal(run.run_id, "run-1");
    assert.equal(run.started_at, "2026-01-01T00:00:00.000Z");
    assert.equal(store.appendEvent(run.run_id, baseEvent({ strategy_id: null, risk: "standard" })).event_id, "event-1");
    assert.equal(store.recordContextReceipt(run.run_id, {
      task_id: "task-root",
      source_kind: "file",
      summary: "Read one relative file.",
      relative_paths: ["src/app.js"],
      snapshot_fingerprint: "sha256-context",
    }).receipt_id, "receipt-1");
    assert.equal(store.createJob(run.run_id, { agent: "general", assigned_scope: "Bounded generated task." }).request.task_id, "task-1");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("v2 events contain every mandatory field with runner-owned identity", () => {
  const ws = workspace();
  try {
    const store = deterministicStore(ws);
    store.createRun({ run_id: "run-v2", strategy_id: "strategy-main", risk: "critical" });
    const event = store.appendEvent("run-v2", baseEvent({
      risk: "critical",
      files_read: [{ path: "src/app.js", summary: "Read the target function." }],
      evidence_refs: [{ kind: "file", value: "src/app.js" }],
      hypothesis: "The target function mishandles an empty value.",
      expected_observation: "A hidden edge check should fail before the fix.",
      actual_observation: "The observed edge check failed.",
      context_snapshot: { snapshot_id: "snapshot-1", fingerprint: "sha256-snapshot", stale: false },
    }));
    const expected = [
      "schema_version", "event_id", "sequence", "run_id", "task_id", "parent_task_id", "agent", "event_type", "timestamp",
      "summary", "tool_or_command", "permission_decision", "files_read", "files_written", "evidence_refs", "verification",
      "status", "risk", "termination_reason", "hypothesis", "expected_observation", "actual_observation", "context_snapshot",
      "verifier_codes", "strategy_id", "truncation",
      "finding",
    ].sort();
    assert.deepEqual(Object.keys(event).sort(), expected);
    assert.equal(event.schema_version, 2);
    assert.equal(event.sequence, 1);
    assert.equal(event.risk, "critical");
    assert.equal(event.files_read[0].path, "src/app.js");
    assert.equal(event.finding, null);
    assertContractError(() => store.appendEvent("run-v2", { ...baseEvent(), event_id: "adapter-owned" }), "CONTRACT_UNKNOWN_FIELD");
    assertContractError(() => store.appendEvent("run-v2", { ...baseEvent(), sequence: 50 }), "CONTRACT_UNKNOWN_FIELD");
    assertContractError(() => store.appendEvent("run-v2", { ...baseEvent(), timestamp: "2020-01-01T00:00:00Z" }), "CONTRACT_UNKNOWN_FIELD");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("adapter instrumentation is frozen, identity-bound, and lifecycle-capable", () => {
  const ws = workspace();
  try {
    const store = deterministicStore(ws);
    store.createRun({ run_id: "run-adapter", strategy_id: "adapter-strategy", risk: "high" });
    const trace = createAdapterInstrumentation(store, {
      run_id: "run-adapter",
      task_id: "task-adapter",
      parent_task_id: null,
      agent: "general",
      risk: "high",
      strategy_id: "adapter-strategy",
    });
    assert.equal(Object.isFrozen(trace), true);
    const event = trace.emit({ event_type: "tool_call", summary: "Inspected one relative file.", status: "completed", tool_or_command: "context_read" });
    assert.equal(event.task_id, "task-adapter");
    assert.equal(event.agent, "general");
    trace.recordContextReceipt({ source_kind: "file", summary: "Read one file.", relative_paths: ["src/app.js"], snapshot_fingerprint: "sha256-adapter" });
    trace.createJob({ task_id: "task-delegated", agent: "reviewer", assigned_scope: "Review the trace boundary.", write_scope: [] });
    trace.transitionJob("task-delegated", { state: "running" });
    trace.completeJob("task-delegated", { state: "completed", result: resultInput({ status: "no-findings", files_changed: [] }) });
    assertContractError(() => trace.emit({ ...baseEvent(), task_id: "override" }), "CONTRACT_UNKNOWN_FIELD");
    const inspected = store.inspectRun("run-adapter");
    assert.equal(inspected.events[0].task_id, "task-adapter");
    assert.equal(inspected.jobs[0].request.parent_task_id, "task-adapter");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("valid legacy v1 events are returned unchanged and explicitly tagged", () => {
  const ws = workspace();
  try {
    const store = deterministicStore(ws);
    store.createRun({ run_id: "run-legacy" });
    const legacy = legacyEvent("run-legacy");
    writeJsonLines(runPath(ws, "run-legacy", "events.jsonl"), [legacy]);
    const before = fs.readFileSync(runPath(ws, "run-legacy", "events.jsonl"), "utf8");
    const inspected = store.inspectRun("run-legacy");
    assert.equal(inspected.legacy_events_present, true);
    assert.deepEqual(inspected.events, [legacy]);
    assert.equal(fs.readFileSync(runPath(ws, "run-legacy", "events.jsonl"), "utf8"), before);
    assertContractError(() => store.appendEvent("run-legacy", baseEvent()), "TRACE_LEGACY_APPEND");

    store.createRun({ run_id: "run-legacy-local" });
    const local = legacyEvent("run-legacy-local", { permission_decision: "allowed_by_policy", risk: "medium" });
    writeJsonLines(runPath(ws, "run-legacy-local", "events.jsonl"), [local]);
    assert.deepEqual(store.inspectRun("run-legacy-local").events, [local]);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("malformed, unsafe, and mixed legacy streams fail closed", () => {
  const ws = workspace();
  try {
    const store = deterministicStore(ws);
    store.createRun({ run_id: "run-legacy-bad" });
    const malformed = legacyEvent("run-legacy-bad");
    delete malformed.status;
    writeJsonLines(runPath(ws, "run-legacy-bad", "events.jsonl"), [malformed]);
    assertContractError(() => store.inspectRun("run-legacy-bad"), "CONTRACT_MISSING_FIELD");

    store.createRun({ run_id: "run-legacy-path" });
    writeJsonLines(runPath(ws, "run-legacy-path", "events.jsonl"), [legacyEvent("run-legacy-path", { files_read: ["C:\\Users\\private\\app.js"] })]);
    assertContractError(() => store.inspectRun("run-legacy-path"), "PRIVACY_PATH");

    store.createRun({ run_id: "run-mixed" });
    const v2 = store.appendEvent("run-mixed", baseEvent());
    writeJsonLines(runPath(ws, "run-mixed", "events.jsonl"), [legacyEvent("run-mixed"), v2]);
    assertContractError(() => store.inspectRun("run-mixed"), "TRACE_MIXED_SCHEMA");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("sequence gaps and duplicate event IDs are rejected during inspection", () => {
  const ws = workspace();
  try {
    const store = deterministicStore(ws);
    store.createRun({ run_id: "run-sequence" });
    const first = store.appendEvent("run-sequence", baseEvent());
    const second = store.appendEvent("run-sequence", baseEvent({ event_type: "context_read", summary: "Read context." }));
    const eventsFile = runPath(ws, "run-sequence", "events.jsonl");
    writeJsonLines(eventsFile, [first, { ...second, sequence: 3 }]);
    assertContractError(() => store.inspectRun("run-sequence"), "TRACE_SEQUENCE");
    writeJsonLines(eventsFile, [first, { ...second, event_id: first.event_id }]);
    assertContractError(() => store.inspectRun("run-sequence"), "TRACE_EVENT_DUPLICATE");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("immutable artifacts, invalid transitions, and terminal runs reject writes", () => {
  const ws = workspace();
  try {
    const store = deterministicStore(ws);
    store.createRun({ run_id: "run-immutable" });
    store.createJob("run-immutable", { task_id: "task-child", agent: "general", assigned_scope: "Do bounded work." });
    assertContractError(() => store.createJob("run-immutable", { task_id: "task-child", agent: "general", assigned_scope: "Duplicate." }), "TRACE_JOB_EXISTS");
    assertContractError(() => store.transitionJob("run-immutable", "task-child", { state: "failed" }), "TRACE_JOB_RESULT_REQUIRED");
    store.transitionJob("run-immutable", "task-child", { state: "running" });
    assertContractError(() => store.transitionJob("run-immutable", "task-child", { state: "running" }), "TRACE_JOB_TRANSITION");
    store.completeJob("run-immutable", "task-child", { state: "completed", result: resultInput() });
    assertContractError(() => store.completeJob("run-immutable", "task-child", { state: "completed", result: resultInput() }), "TRACE_JOB_TRANSITION");
    store.recordVerification("run-immutable", verificationInput());
    assertContractError(() => store.recordVerification("run-immutable", verificationInput()), "FILES_IMMUTABLE_EXISTS");
    store.appendEvent("run-immutable", taskEndEvent({ summary: "Done." }));
    store.finalizeRun("run-immutable", { status: "completed", termination_reason: "verified", summary: "Done.", evidence_refs: [] });
    assertContractError(() => store.finalizeRun("run-immutable", { status: "completed", termination_reason: "verified", summary: "Done.", evidence_refs: [] }), "TRACE_FINALIZED");
    assertContractError(() => store.appendEvent("run-immutable", baseEvent()), "TRACE_FINALIZED");
    assertContractError(() => store.recordContextReceipt("run-immutable", { task_id: "task-root", source_kind: "file", summary: "Late.", relative_paths: ["src/app.js"], snapshot_fingerprint: "late" }), "TRACE_FINALIZED");
    assertContractError(() => store.createJob("run-immutable", { task_id: "task-late", agent: "general", assigned_scope: "Late." }), "TRACE_FINALIZED");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("finalization requires immutable verification evidence", () => {
  const ws = workspace();
  try {
    const store = deterministicStore(ws);
    store.createRun({ run_id: "run-no-verification" });
    assertContractError(
      () => store.finalizeRun("run-no-verification", { status: "failed", termination_reason: "verification_failed", summary: "No verification.", evidence_refs: [] }),
      "TRACE_VERIFICATION_REQUIRED",
    );
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("an interrupted final outcome publication is recoverable and never looks complete", () => {
  const ws = workspace();
  try {
    const store = deterministicStore(ws);
    store.createRun({ run_id: "run-recovery" });
    store.recordVerification("run-recovery", verificationInput());
    store.appendEvent("run-recovery", taskEndEvent());
    const input = { status: "completed", termination_reason: "verified", summary: "Recovered outcome.", evidence_refs: [] };
    store.finalizeRun("run-recovery", input);
    const outcome = runPath(ws, "run-recovery", "outcome.json");
    const pending = runPath(ws, "run-recovery", ".outcome.pending.json");
    fs.renameSync(outcome, pending);
    assert.equal(store.inspectRun("run-recovery").complete, false);
    const recovered = store.finalizeRun("run-recovery", input);
    assert.equal(recovered.outcome.status, "completed");
    assert.equal(store.inspectRun("run-recovery").complete, true);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("IDs and Windows/POSIX paths cannot escape the operational root", () => {
  const ws = workspace();
  try {
    const store = deterministicStore(ws);
    assertContractError(() => store.createRun({ run_id: "../escape" }), "CONTRACT_ID");
    assertContractError(() => store.inspectRun("..\\escape"), "CONTRACT_ID");
    store.createRun({ run_id: "run-paths" });
    assertContractError(() => store.appendEvent("run-paths", baseEvent({ task_id: "../task" })), "CONTRACT_ID");
    assertContractError(() => store.appendEvent("run-paths", baseEvent({ files_read: [{ path: "C:\\Users\\private\\file.js", summary: "Read." }] })), "PRIVACY_PATH");
    assertContractError(() => store.appendEvent("run-paths", baseEvent({ files_written: [{ path: "/home/private/file.js", summary: "Write." }] })), "PRIVACY_PATH");
    assertContractError(() => store.recordContextReceipt("run-paths", { task_id: "task-root", source_kind: "file", summary: "Read.", relative_paths: ["../outside"], snapshot_fingerprint: "x" }), "PRIVACY_PATH");
    assertContractError(() => store.createJob("run-paths", { task_id: "../job", agent: "general", assigned_scope: "Unsafe." }), "CONTRACT_ID");
    assert.equal(fs.existsSync(path.join(ws, "escape")), false);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("sensitive strings redact, oversized summaries truncate, and raw fields reject", () => {
  const ws = workspace();
  try {
    const store = deterministicStore(ws);
    store.createRun({ run_id: "run-privacy" });
    const token = store.appendEvent("run-privacy", baseEvent({ summary: "FAKE_TOKEN=example-value" }));
    assert.equal(token.summary, "[redacted]");
    assert.deepEqual(token.truncation.summary.redactions, ["secret_assignment"]);
    const sensitiveCases = [
      ['TOKEN="quoted-fragment-must-not-persist"', "secret_assignment", "quoted-fragment-must-not-persist"],
      ["Authorization: Bearer bearer-fragment-must-not-persist", "bearer_token", "bearer-fragment-must-not-persist"],
      ["Provider sk-proj-providerfragment123", "token_pattern", "providerfragment123"],
    ];
    for (const [summary, reason] of sensitiveCases) {
      const event = store.appendEvent("run-privacy", baseEvent({ summary }));
      assert.equal(event.summary, "[redacted]");
      assert(event.truncation.summary.redactions.includes(reason));
    }
    const privateKey = store.appendEvent("run-privacy", baseEvent({ summary: "-----BEGIN PRIVATE KEY----- fake" }));
    assert.equal(privateKey.summary, "[redacted]");
    const oversized = store.appendEvent("run-privacy", baseEvent({ summary: "x".repeat(700) }));
    assert.equal(oversized.summary.length, 500);
    assert.equal(oversized.truncation.summary.truncated, true);
    assertContractError(() => store.appendEvent("run-privacy", { ...baseEvent(), stdout: "raw output" }), "PRIVACY_FORBIDDEN_FIELD");
    assertContractError(() => store.appendEvent("run-privacy", { ...baseEvent(), stderr: "raw error" }), "PRIVACY_FORBIDDEN_FIELD");
    assertContractError(() => store.appendEvent("run-privacy", { ...baseEvent(), transcript: "raw transcript" }), "PRIVACY_FORBIDDEN_FIELD");
    assertContractError(() => store.appendEvent("run-privacy", baseEvent({ context_snapshot: { snapshot_id: "snapshot-1", fingerprint: "safe", stale: false, arbitrary: { transcript: "raw" } } })), "PRIVACY_FORBIDDEN_FIELD");
    for (const unsafeId of ["AKIA1234567890ABCDEF", "github_pat_11AA22BB33CC44DD", "AIzaSyA1234567890abcdefghijk"]) {
      assertContractError(() => store.appendEvent("run-privacy", baseEvent({ task_id: unsafeId })), "PRIVACY_ID");
      assertContractError(() => store.appendEvent("run-privacy", baseEvent({ verifier_codes: [unsafeId] })), "PRIVACY_ID");
      assertContractError(() => store.appendEvent("run-privacy", baseEvent({ context_snapshot: { snapshot_id: unsafeId, fingerprint: "safe", stale: false } })), "PRIVACY_ID");
    }
    store.createJob("run-privacy", { task_id: "task-privacy", agent: "general", assigned_scope: "Check privacy." });
    assertContractError(() => store.completeJob("run-privacy", "task-privacy", { state: "failed", result: { ...resultInput({ status: "failed", termination_reason: "verification_failed" }), transcript: "raw" } }), "PRIVACY_FORBIDDEN_FIELD");
    assertContractError(() => store.createRun({ run_id: "run-model-extra", model_parameters: { temperature: 0, arbitrary: true } }), "CONTRACT_UNKNOWN_FIELD");
    const persisted = fs.readFileSync(runPath(ws, "run-privacy", "events.jsonl"), "utf8");
    assert.equal(persisted.includes("example-value"), false);
    for (const [, , fragment] of sensitiveCases) assert.equal(persisted.includes(fragment), false);
    assert.equal(persisted.includes("BEGIN PRIVATE KEY"), false);
    assert.equal(store.inspectRun("run-privacy").events.length, 6);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("review findings require bounded structured evidence and old v2 events remain readable", () => {
  const ws = workspace();
  try {
    const store = deterministicStore(ws);
    store.createRun({ run_id: "run-findings" });
    assertContractError(() => store.appendEvent("run-findings", baseEvent({ event_type: "review_finding" })), "TRACE_FINDING_REQUIRED");
    const finding = store.appendEvent("run-findings", baseEvent({
      event_type: "review_finding",
      summary: "Found an off-by-one defect.",
      finding: {
        finding_id: "REV-TEST-1",
        severity: "P2",
        file: "src/app.js",
        start_line: 10,
        end_line: 11,
        code: "OFF_BY_ONE",
      },
    }));
    assert.equal(finding.finding.file, "src/app.js");
    assertContractError(() => store.appendEvent("run-findings", baseEvent({ finding: finding.finding })), "TRACE_FINDING_UNEXPECTED");

    const eventsFile = runPath(ws, "run-findings", "events.jsonl");
    const oldV2 = { ...finding };
    delete oldV2.finding;
    writeJsonLines(eventsFile, [oldV2]);
    assert.equal(Object.hasOwn(store.inspectRun("run-findings").events[0], "finding"), false);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("trace quotas reject limit plus one before mutating persisted state", () => {
  const ws = workspace();
  const activeWs = workspace();
  try {
    const store = deterministicStore(ws, { events: 2, receipts: 2, jobs: 2, activeJobs: 2 });
    store.createRun({ run_id: "run-quotas" });
    store.appendEvent("run-quotas", baseEvent());
    store.appendEvent("run-quotas", baseEvent({ event_type: "context_read", summary: "Read bounded context." }));
    const beforeEvents = fs.readFileSync(runPath(ws, "run-quotas", "events.jsonl"), "utf8");
    for (let attempt = 0; attempt < 25; attempt += 1) {
      assertContractError(() => store.appendEvent("run-quotas", baseEvent({ summary: `Flood attempt ${attempt}.` })), "TRACE_QUOTA_EVENTS");
    }
    assert.equal(fs.readFileSync(runPath(ws, "run-quotas", "events.jsonl"), "utf8"), beforeEvents);

    for (let index = 1; index <= 2; index += 1) store.recordContextReceipt("run-quotas", {
      task_id: "task-root",
      source_kind: "file",
      summary: `Receipt ${index}.`,
      relative_paths: ["src/app.js"],
      snapshot_fingerprint: `snapshot-${index}`,
    });
    const beforeReceipts = fs.readFileSync(runPath(ws, "run-quotas", "context-receipts.jsonl"), "utf8");
    assertContractError(() => store.recordContextReceipt("run-quotas", {
      task_id: "task-root", source_kind: "file", summary: "Overflow.", relative_paths: ["src/app.js"], snapshot_fingerprint: "overflow",
    }), "TRACE_QUOTA_RECEIPTS");
    assert.equal(fs.readFileSync(runPath(ws, "run-quotas", "context-receipts.jsonl"), "utf8"), beforeReceipts);

    store.createJob("run-quotas", { task_id: "task-1", agent: "general", assigned_scope: "One." });
    store.createJob("run-quotas", { task_id: "task-2", agent: "general", assigned_scope: "Two." });
    assertContractError(() => store.createJob("run-quotas", { task_id: "task-3", agent: "general", assigned_scope: "Three." }), "TRACE_QUOTA_JOBS");
    assert.equal(fs.existsSync(runPath(ws, "run-quotas", "jobs", "task-3")), false);

    const activeStore = deterministicStore(activeWs, { jobs: 2, activeJobs: 1 });
    activeStore.createRun({ run_id: "run-active-quota" });
    activeStore.createJob("run-active-quota", { task_id: "task-1", agent: "general", assigned_scope: "One active job." });
    assertContractError(() => activeStore.createJob("run-active-quota", { task_id: "task-2", agent: "general", assigned_scope: "Too many active jobs." }), "TRACE_QUOTA_ACTIVE_JOBS");
    assert.equal(fs.existsSync(runPath(activeWs, "run-active-quota", "jobs", "task-2")), false);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
    fs.rmSync(activeWs, { recursive: true, force: true });
  }
});

test("record and total byte quotas bound oversized and flood-like inputs", () => {
  const recordWs = workspace();
  const totalWs = workspace();
  const staleTempWs = workspace();
  try {
    const recordStore = deterministicStore(recordWs, { recordBytes: 1500 });
    recordStore.createRun({ run_id: "run-record-bytes" });
    assertContractError(() => recordStore.appendEvent("run-record-bytes", baseEvent({
      files_read: Array.from({ length: 50 }, (_, index) => ({ path: `src/file-${index}.js`, summary: "x".repeat(240) })),
    })), "TRACE_QUOTA_RECORD_BYTES");
    assert.equal(fs.readFileSync(runPath(recordWs, "run-record-bytes", "events.jsonl"), "utf8"), "");

    const totalStore = deterministicStore(totalWs, { totalBytes: 7000 });
    totalStore.createRun({ run_id: "run-total-bytes" });
    let quotaReached = false;
    for (let index = 0; index < 100; index += 1) {
      try {
        totalStore.appendEvent("run-total-bytes", baseEvent({ summary: `Bounded event ${index} ${"x".repeat(200)}` }));
      } catch (error) {
        assert.equal(error.code, "TRACE_QUOTA_TOTAL_BYTES");
        quotaReached = true;
        break;
      }
    }
    assert.equal(quotaReached, true);

    const staleTempStore = deterministicStore(staleTempWs, { totalBytes: 4000 });
    staleTempStore.createRun({ run_id: "run-stale-temp" });
    fs.writeFileSync(runPath(staleTempWs, "run-stale-temp", ".orphaned-write.tmp"), "x".repeat(4000), "utf8");
    assertContractError(() => staleTempStore.inspectRun("run-stale-temp"), "TRACE_QUOTA_TOTAL_BYTES");
  } finally {
    fs.rmSync(recordWs, { recursive: true, force: true });
    fs.rmSync(totalWs, { recursive: true, force: true });
    fs.rmSync(staleTempWs, { recursive: true, force: true });
  }
});

test("verification and finalization reject contradictory or incomplete lifecycle evidence", () => {
  const ws = workspace();
  try {
    const store = deterministicStore(ws);
    store.createRun({ run_id: "run-empty-verification" });
    assertContractError(() => store.recordVerification("run-empty-verification", verificationInput({ checks: [] })), "TRACE_VERIFICATION_EMPTY");
    assert.equal(fs.existsSync(runPath(ws, "run-empty-verification", "verification.json")), false);

    store.createRun({ run_id: "run-aggregate" });
    assertContractError(() => store.recordVerification("run-aggregate", verificationInput({
      checks: [{ code: "FAIL", status: "failed", summary: "Failed.", evidence_refs: [] }],
    })), "TRACE_VERIFICATION_AGGREGATE");

    store.createRun({ run_id: "run-truncated" });
    assertContractError(() => store.recordVerification("run-truncated", verificationInput({
      checks: Array.from({ length: 51 }, (_, index) => ({ code: `CHECK-${index}`, status: "passed", summary: "Passed.", evidence_refs: [] })),
    })), "TRACE_VERIFICATION_TRUNCATED");

    store.createRun({ run_id: "run-active-job" });
    store.createJob("run-active-job", { task_id: "task-active", agent: "general", assigned_scope: "Still active." });
    store.recordVerification("run-active-job", verificationInput());
    store.appendEvent("run-active-job", taskEndEvent());
    assertContractError(() => store.finalizeRun("run-active-job", {
      status: "completed", termination_reason: "verified", summary: "Contradictory.", evidence_refs: [],
    }), "TRACE_JOBS_ACTIVE");

    store.createRun({ run_id: "run-task-end-mismatch" });
    store.recordVerification("run-task-end-mismatch", verificationInput());
    store.appendEvent("run-task-end-mismatch", taskEndEvent({ status: "blocked", termination_reason: "blocked_permission" }));
    assertContractError(() => store.finalizeRun("run-task-end-mismatch", {
      status: "completed", termination_reason: "verified", summary: "Mismatch.", evidence_refs: [],
    }), "TRACE_TASK_END_MISMATCH");

    store.createRun({ run_id: "run-no-task-end" });
    store.recordVerification("run-no-task-end", verificationInput());
    assertContractError(() => store.finalizeRun("run-no-task-end", {
      status: "completed", termination_reason: "verified", summary: "Missing end.", evidence_refs: [],
    }), "TRACE_TASK_END_REQUIRED");

    store.createRun({ run_id: "run-outcome-consistency" });
    store.recordVerification("run-outcome-consistency", verificationInput());
    store.appendEvent("run-outcome-consistency", taskEndEvent({
      status: "failed",
      termination_reason: "verification_failed",
    }));
    assertContractError(() => store.finalizeRun("run-outcome-consistency", {
      status: "failed", termination_reason: "verification_failed", summary: "Passed checks cannot fail verification.", evidence_refs: [],
    }), "TRACE_OUTCOME_CONSISTENCY");

    store.createRun({ run_id: "run-nested-code-mismatch" });
    store.recordVerification("run-nested-code-mismatch", verificationInput());
    store.appendEvent("run-nested-code-mismatch", taskEndEvent({
      verification: { status: "passed", summary: "Contradictory nested codes.", verifier_codes: ["WRONG-CODE"] },
    }));
    assertContractError(() => store.finalizeRun("run-nested-code-mismatch", {
      status: "completed", termination_reason: "verified", summary: "Codes disagree.", evidence_refs: [],
    }), "TRACE_TASK_END_VERIFICATION");

    for (const [runId, status, terminationReason] of [
      ["run-blocked-verified", "blocked", "verified"],
      ["run-unsafe-verified", "unsafe", "verified"],
      ["run-failed-done", "failed", "done"],
    ]) {
      store.createRun({ run_id: runId });
      store.recordVerification(runId, verificationInput());
      store.appendEvent(runId, taskEndEvent({ status, termination_reason: terminationReason }));
      assertContractError(() => store.finalizeRun(runId, {
        status, termination_reason: terminationReason, summary: "Invalid terminal mapping.", evidence_refs: [],
      }), "TRACE_OUTCOME_CONSISTENCY");
    }
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("persisted job lifecycle preserves real non-overlapping running intervals", () => {
  const ws = workspace();
  try {
    const store = deterministicStore(ws);
    store.createRun({ run_id: "run-job-intervals" });
    for (const taskId of ["job-one", "job-two"]) {
      store.createJob("run-job-intervals", {
        task_id: taskId,
        agent: "general",
        assigned_scope: `Run ${taskId}.`,
        write_scope: ["src/shared.mjs"],
      });
      store.transitionJob("run-job-intervals", taskId, { state: "running" });
      store.completeJob("run-job-intervals", taskId, { state: "completed", result: resultInput() });
    }
    const snapshot = store.inspectRun("run-job-intervals");
    assert(snapshot.jobs.every((job) => job.status.started_at !== null));
    const [assertionResult] = evaluateTraceAssertions(
      [{ assertion_id: "real-store-no-overlap", op: "no_overlapping_job_write_scopes" }],
      snapshot,
    );
    assert.equal(assertionResult.status, "passed");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("buffered trace journal performs no workspace writes before finalized batch commit", () => {
  const ws = workspace();
  try {
    const durable = deterministicStore(ws);
    const buffered = durable.createBufferedStore();
    buffered.createRun({ run_id: "run-buffered", strategy_id: "strategy-main" });
    buffered.appendEvent("run-buffered", baseEvent());
    buffered.recordContextReceipt("run-buffered", {
      task_id: "task-root",
      source_kind: "file",
      summary: "Buffered context receipt.",
      relative_paths: ["src/app.js"],
      snapshot_fingerprint: "sha256-buffered-context",
    });
    buffered.createJob("run-buffered", {
      task_id: "buffered-job",
      agent: "general",
      assigned_scope: "Exercise buffered lifecycle.",
      write_scope: ["src/app.js"],
    });
    buffered.transitionJob("run-buffered", "buffered-job", { state: "running" });
    buffered.completeJob("run-buffered", "buffered-job", { state: "completed", result: resultInput() });
    buffered.recordVerification("run-buffered", verificationInput());
    buffered.appendEvent("run-buffered", taskEndEvent());
    buffered.finalizeRun("run-buffered", {
      status: "completed",
      termination_reason: "verified",
      summary: "Buffered run verified.",
      evidence_refs: [],
    });
    assert.equal(fs.existsSync(path.join(ws, ".oc_harness")), false, "buffered journal wrote to the durable workspace before commit");
    const committed = durable.commitBufferedRun(buffered, "run-buffered");
    assert.equal(committed.complete, true);
    assert.equal(durable.inspectRun("run-buffered").events.length, 2);
    assert.equal(durable.inspectRun("run-buffered").jobs[0].status.started_at !== null, true);
    durable.discardBufferedStore(buffered);

    const abandoned = durable.createBufferedStore();
    abandoned.createRun({ run_id: "run-abandoned" });
    durable.discardBufferedStore(abandoned);
    assertContractError(() => durable.inspectRun("run-abandoned"), "TRACE_RUN_MISSING");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("staging cleanup failure occurs before durable buffered publication", () => {
  const ws = workspace();
  const originalRmSync = fs.rmSync;
  let injectedPath = null;
  try {
    const durable = deterministicStore(ws);
    const buffered = durable.createBufferedStore();
    buffered.createRun({ run_id: "run-cleanup-failure", strategy_id: "strategy-main" });
    buffered.appendEvent("run-cleanup-failure", baseEvent());
    buffered.recordVerification("run-cleanup-failure", verificationInput());
    buffered.appendEvent("run-cleanup-failure", taskEndEvent());
    buffered.finalizeRun("run-cleanup-failure", {
      status: "completed",
      termination_reason: "verified",
      summary: "Cleanup ordering test.",
      evidence_refs: [],
    });
    let injected = false;
    fs.rmSync = (targetPath, options) => {
      if (!injected && path.basename(String(targetPath)).startsWith("opencode-harness-trace-stage-")) {
        injected = true;
        injectedPath = String(targetPath);
        throw new Error("injected staging cleanup failure");
      }
      return originalRmSync(targetPath, options);
    };
    assert.throws(() => durable.commitBufferedRun(buffered, "run-cleanup-failure"), /injected staging cleanup failure/);
    assert.equal(injected, true);
    assertContractError(() => durable.inspectRun("run-cleanup-failure"), "TRACE_RUN_MISSING");
  } finally {
    fs.rmSync = originalRmSync;
    originalRmSync(ws, { recursive: true, force: true });
  }
  assert.equal(injectedPath === null || fs.existsSync(injectedPath), false);
});

test("idempotent buffered publication is not masked by staging cleanup failure", () => {
  const ws = workspace();
  const originalRmSync = fs.rmSync;
  let injectedPath = null;
  try {
    const durable = deterministicStore(ws);
    const buffered = durable.createBufferedStore();
    finalizeMinimalRun(buffered, "run-idempotent-cleanup");
    const first = durable.commitBufferedRun(buffered, "run-idempotent-cleanup");
    assert.equal(first.complete, true);

    let injected = false;
    fs.rmSync = (targetPath, options) => {
      if (!injected && path.basename(String(targetPath)).startsWith("opencode-harness-trace-stage-")) {
        injected = true;
        injectedPath = String(targetPath);
        throw new Error("injected idempotent staging cleanup failure");
      }
      return originalRmSync(targetPath, options);
    };
    const second = durable.commitBufferedRun(buffered, "run-idempotent-cleanup");
    assert.equal(injected, true);
    assert.equal(second.complete, true);
    assert.equal(durable.inspectRun("run-idempotent-cleanup").complete, true);
    durable.discardBufferedStore(buffered);
  } finally {
    fs.rmSync = originalRmSync;
    originalRmSync(ws, { recursive: true, force: true });
    if (injectedPath !== null) originalRmSync(injectedPath, { recursive: true, force: true });
  }
});

test("completed buffered run can be materialized into a private staging store without durable publication", () => {
  const ws = workspace();
  try {
    const durable = deterministicStore(ws);
    const buffered = durable.createBufferedStore();
    finalizeMinimalRun(buffered, "run-buffered-stage");
    const staged = durable.createStagedRunFromBuffered(buffered, "run-buffered-stage");
    assert.equal(staged.inspectRun("run-buffered-stage").complete, true);
    assertContractError(() => durable.inspectRun("run-buffered-stage"), "TRACE_RUN_MISSING");
    durable.discardStagingStore(staged);
    durable.discardBufferedStore(buffered);

    const incomplete = durable.createBufferedStore();
    incomplete.createRun({ run_id: "run-buffered-incomplete" });
    assertContractError(
      () => durable.createStagedRunFromBuffered(incomplete, "run-buffered-incomplete"),
      "TRACE_STAGING_INCOMPLETE",
    );
    durable.discardBufferedStore(incomplete);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("private staging seam publishes trace and quality artifacts as one idempotent bundle", () => {
  const ws = workspace();
  try {
    const durable = deterministicStore(ws);
    const staged = durable.createStagingStore();
    finalizeMinimalRun(staged, "run-quality-bundle");
    const gate = {
      schema_version: 1,
      gate_id: "gate-quality-bundle",
      run_id: "run-quality-bundle",
      status: "passed",
      verifier_code: "QUALITY-GATE-PASSED",
    };
    const materialized = materializeStagedRunArtifacts(staged, "run-quality-bundle", [
      { relative_path: "quality/gate.json", value: gate },
    ]);
    assert.equal(materialized[0].relative_path, "quality/gate.json");
    assert.equal(fs.existsSync(runPath(ws, "run-quality-bundle")), false);

    let validatedImport = false;
    assert.throws(() => durable.commitStagedRun(staged, "run-quality-bundle", {
      validateImport: ({ run_dir: runDir }) => {
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(runDir, "quality", "gate.json"), "utf8")), gate);
        validatedImport = true;
      },
      afterPublish: () => {
        throw new Error("injected acknowledgement failure");
      },
    }), /injected acknowledgement failure/);
    assert.equal(validatedImport, true);
    assert.equal(durable.inspectRun("run-quality-bundle").complete, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(runPath(ws, "run-quality-bundle", "quality", "gate.json"), "utf8")), gate);

    const retry = durable.commitStagedRun(staged, "run-quality-bundle");
    assert.equal(retry.complete, true);
    assert.deepEqual(materializeStagedRunArtifacts(staged, "run-quality-bundle", [
      { relative_path: "quality/gate.json", value: gate },
    ]), materialized);
    assertContractError(() => materializeStagedRunArtifacts(staged, "run-quality-bundle", [
      { relative_path: "quality/gate.json", value: { ...gate, status: "blocked" } },
    ]), "TRACE_STAGING_ARTIFACT_CONFLICT");
    durable.discardStagingStore(staged);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("private staging seam rejects unsafe paths, unsafe values, and conflicting run contents", () => {
  const ws = workspace();
  try {
    const durable = deterministicStore(ws);
    const first = durable.createStagingStore();
    finalizeMinimalRun(first, "run-quality-conflict");
    materializeStagedRunArtifacts(first, "run-quality-conflict", [
      { relative_path: "quality/gate.json", value: { gate_id: "gate-first", status: "passed" } },
    ]);
    durable.commitStagedRun(first, "run-quality-conflict");

    const second = durable.createStagingStore();
    finalizeMinimalRun(second, "run-quality-conflict");
    materializeStagedRunArtifacts(second, "run-quality-conflict", [
      { relative_path: "quality/gate.json", value: { gate_id: "gate-second", status: "passed" } },
    ]);
    assertContractError(() => durable.commitStagedRun(second, "run-quality-conflict"), "TRACE_STAGING_CONFLICT");
    assertContractError(() => materializeStagedRunArtifacts(second, "run-quality-conflict", [
      { relative_path: "../gate.json", value: { status: "passed" } },
    ]), "PRIVACY_PATH");
    assertContractError(() => materializeStagedRunArtifacts(second, "run-quality-conflict", [
      { relative_path: "quality/unsafe.json", value: { raw_prompt: "do-not-persist" } },
    ]), "PRIVACY_FORBIDDEN_FIELD");
    durable.discardStagingStore(first);
    durable.discardStagingStore(second);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("exclusive run lock rejects concurrent mutation and inspect does not mutate", () => {
  const ws = workspace();
  try {
    const store = deterministicStore(ws);
    store.createRun({ run_id: "run-lock" });
    const directory = runPath(ws, "run-lock");
    const before = fs.readdirSync(directory).sort();
    store.inspectRun("run-lock");
    assert.deepEqual(fs.readdirSync(directory).sort(), before);
    const lock = path.join(directory, ".write.lock");
    fs.writeFileSync(lock, "held", "utf8");
    assertContractError(() => store.appendEvent("run-lock", baseEvent()), "FILES_LOCKED");
    fs.unlinkSync(lock);
    assert.equal(store.appendEvent("run-lock", baseEvent()).sequence, 1);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test("CLI create, emit, and inspect expose only the public index boundary", () => {
  const ws = workspace();
  try {
    const cli = path.join(root, "scripts", "trace-run.mjs");
    const create = spawnSync(process.execPath, [cli, "create", "--workspace", ws, "--json", JSON.stringify({ run_id: "run-cli", risk: "standard" })], { encoding: "utf8" });
    assert.equal(create.status, 0, create.stderr);
    assert.equal(JSON.parse(create.stdout).run_id, "run-cli");
    const emit = spawnSync(process.execPath, [cli, "emit", "--workspace", ws, "--run-id", "run-cli", "--json", JSON.stringify(baseEvent({ strategy_id: null, risk: "standard" }))], { encoding: "utf8" });
    assert.equal(emit.status, 0, emit.stderr);
    assert.equal(JSON.parse(emit.stdout).sequence, 1);
    const inspect = spawnSync(process.execPath, [cli, "inspect", "--workspace", ws, "--run-id", "run-cli"], { encoding: "utf8" });
    assert.equal(inspect.status, 0, inspect.stderr);
    assert.equal(JSON.parse(inspect.stdout).events.length, 1);
    const rejected = spawnSync(process.execPath, [cli, "emit", "--workspace", ws, "--run-id", "run-cli", "--json", JSON.stringify({ ...baseEvent(), stdout: "raw" })], { encoding: "utf8" });
    assert.notEqual(rejected.status, 0);
    assert.equal(rejected.stderr.includes("raw"), false);
    const cliSource = fs.readFileSync(cli, "utf8");
    assert.equal(cliSource.includes("../lib/feedback/index.mjs"), true);
    assert.equal(cliSource.includes("trace-store.mjs"), false);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

let passed = 0;
for (const { name, callback } of tests) {
  try {
    callback();
    passed += 1;
  } catch (error) {
    process.stderr.write(`Trace store self-test failed: ${name}\n${error.stack ?? error}\n`);
    process.exit(1);
  }
}

console.log(`Trace store self-tests passed (${passed} tests).`);
