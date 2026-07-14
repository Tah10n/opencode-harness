import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createTraceStore } from "../lib/feedback/index.mjs";
import { loadScenarioCorpus } from "../lib/feedback/manifests.mjs";
import { createQualityOutcomes } from "../lib/quality/acceptance-contracts.mjs";
import { qualityLiveCheckCatalog } from "../lib/quality/live-scenarios.mjs";
import { validateEngineeringQualityRunBundle } from "../lib/quality/run-bundle.mjs";
import { fingerprint } from "../lib/quality/validation.mjs";
import { runScenarioProfile } from "./evaluate-live.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const START_COMMIT = "0a1d56605b9b8923ac27c3b3b405b38177ca7741";

function mapping(classification, overrides = {}) {
  return {
    classification,
    check_ids: [],
    mechanism_ids: [],
    evidence_refs: [],
    rationale: null,
    blocked_reason: null,
    external_dependency: null,
    ...overrides,
  };
}

function dossierPatch(scenarioId, { narrowed = false } = {}) {
  const baseline = `${scenarioId}-baseline`;
  const visible = `${scenarioId}-visible`;
  const integration = `${scenarioId}-integration`;
  const hidden = `${scenarioId}-hidden-evaluation`;
  const integrationObligations = [{
    id: "TEST-integration",
    check_id: integration,
    kind: "command",
    phase: "integration",
    scope_ids: ["AREA-label"],
    command_or_mechanism: "runner-hidden-integration",
    required: true,
    trusted_producer: "opencode-harness-quality-runner",
  }];
  const baselineObligations = narrowed ? [] : [{
    id: "TEST-baseline",
    check_id: baseline,
    kind: "command",
    phase: "preimplementation",
    scope_ids: ["AREA-label"],
    command_or_mechanism: "runner-setup-verification",
    required: true,
    trusted_producer: "opencode-harness-quality-runner",
  }];
  return {
    task_shape: {
      summary: "bounded-one-file-label-fix",
      starting_commit: START_COMMIT,
      worktree_state: "clean",
      instruction_sources: ["AGENTS.md"],
      skill_ids: ["global-quality-gates"],
      constraints: ["one-owned-file"],
      non_goals: ["dependency-addition", "delegation"],
    },
    behavior_contract: {
      status: "defined",
      requested_behavior: "uppercase-label-with-empty-fallback",
      positive_behavior: ["non-empty-label-is-uppercase"],
      negative_behavior: ["lowercase-output-is-rejected"],
      boundary_behavior: ["empty-label-uses-fallback"],
      error_behavior: ["string-coercion-remains-defined"],
      ordering_and_side_effects: ["formatter-remains-pure"],
      preserved_behavior: ["string-coercion"],
      compatibility_requirements: ["node-24"],
      security_requirements: ["bounded-write-scope"],
      completion_requirements: ["visible-and-hidden-verification"],
    },
    compatibility_contract: {
      status: "defined",
      default_decision: "preserve",
      rationale: "public formatter signature and coercion remain stable",
      evidence_refs: [{ kind: "file", value: "src/label.mjs" }],
    },
    public_contracts: [{
      id: "CONTRACT-label",
      kind: "public_api",
      path: "src/label.mjs",
      owner: "fixture",
      compatibility_decision: "preserve",
      evidence_refs: [{ kind: "file", value: "src/label.mjs" }],
    }],
    system_boundaries: [{
      id: "SYSBOUNDARY-caller",
      category: "caller",
      path: "src/label.mjs",
      status: "resolved",
      rationale: "export is the bounded entry",
      evidence_refs: [{ kind: "file", value: "src/label.mjs" }],
    }],
    affected_areas: [{
      id: "AREA-label",
      path: "src/label.mjs",
      node_kind: "file",
      reason: "single-public-formatter",
      confidence: "observed",
      evidence_refs: [{ kind: "file", value: "src/label.mjs" }],
    }],
    entry_points: [{
      id: "ENTRY-label",
      path: "src/label.mjs",
      symbol: "label",
      reason: "public-formatter-export",
      evidence_refs: [{ kind: "file", value: "src/label.mjs" }],
    }],
    call_paths: [],
    data_shapes: [],
    invariants: [{
      id: "INV-string-coercion",
      statement: "input-remains-string-coercible",
      scope_ids: ["AREA-label"],
      mapping: mapping("applicable_directly_tested", { check_ids: [visible] }),
    }],
    edge_cases: [{
      id: "EDGE-empty-fallback",
      category: "null_absent_empty_malformed_unsupported",
      condition: "trimmed-input-is-empty",
      expected_behavior: "returns-UNTITLED",
      scope_ids: ["AREA-label"],
      mapping: mapping("applicable_verified_by_other_mechanism", { mechanism_ids: [hidden] }),
    }],
    failure_modes: [{
      id: "FAIL-lowercase-regression",
      category: "unexpected_valid_state",
      trigger: "normalization-keeps-lowercase",
      impact: "documented-display-contract-breaks",
      expected_handling: "integration-check-rejects",
      scope_ids: ["AREA-label"],
      mapping: mapping("applicable_directly_tested", { check_ids: [integration] }),
    }],
    premortem_matrix: [
      {
        id: "PREMORTEM-input",
        category: "null_absent_empty_malformed_unsupported",
        subject_ids: ["EDGE-empty-fallback"],
        mapping: mapping("applicable_verified_by_other_mechanism", { mechanism_ids: [hidden] }),
      },
      {
        id: "PREMORTEM-state",
        category: "unexpected_valid_state",
        subject_ids: ["FAIL-lowercase-regression"],
        mapping: mapping("applicable_directly_tested", { check_ids: [integration] }),
      },
    ],
    counterexamples: [],
    test_obligations: [
      ...baselineObligations,
      {
        id: "TEST-visible",
        check_id: visible,
        kind: "command",
        phase: "slice",
        scope_ids: ["AREA-label"],
        command_or_mechanism: "node --test test/visible.test.mjs",
        required: true,
        trusted_producer: "opencode-harness-quality-runner",
      },
      ...integrationObligations,
    ],
    specialized_checks: [],
    assumptions: [],
    unknowns: [],
    subagent_handoffs: [],
    implementation_slices: [{
      id: "SLICE-label",
      owner: "fixture-adapter",
      intent: "implementation",
      write_scope: ["src/label.mjs"],
      concurrent_group: null,
      depends_on_slice_ids: [],
      invariant_ids: ["INV-string-coercion"],
      verification_check_ids: [visible, integration],
    }],
    impact_graph: null,
    architecture_assessment: {
      policy_id: null,
      status: "not_configured",
      evaluation_id: null,
      violation_ids: [],
      notes: null,
    },
    context_coverage: {
      status: "complete",
      affected_area_ids: ["AREA-label"],
      covered_area_ids: ["AREA-label"],
      truncated_area_ids: [],
      accepted_gap_ids: [],
      evidence_refs: [{ kind: "file", value: "src/label.mjs" }],
    },
    verification_plan: {
      baseline_check_ids: narrowed ? [] : [baseline],
      slice_check_ids: [visible],
      integration_check_ids: [integration],
      architecture_check_ids: [],
      regression_check_ids: [integration],
      hidden_check_ids: [],
      truncated_check_ids: [],
      evidence_refs: [{ kind: "check", value: visible }],
    },
    rollback_recovery: {
      rollback_expectation: "no persistent state changes",
      recovery_expectation: "retry reads the same input",
      mapping: mapping("not_applicable", { rationale: "pure formatter has no persistence" }),
    },
    plan_challenge: {
      architect_result_id: null,
      reviewer_result_id: null,
      blockers: [],
      evidence_refs: [],
    },
    gate_state: { status: "not_evaluated", gate_id: null, reason_codes: [] },
    verification_boundary: {
      check_ids: narrowed ? [visible, integration] : [baseline, visible, integration],
      mechanism_ids: [hidden],
      ownership_paths: ["src/label.mjs"],
      integration_check_ids: [integration],
    },
  };
}

export async function createDeterministicQualityRun({
  profileRole,
  narrowed = false,
  runIdentity = null,
} = {}) {
  assert(["baseline", "candidate"].includes(profileRole), "profileRole must be baseline or candidate");
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opencode-quality-live-runner-${profileRole}-`));
  const scenario = loadScenarioCorpus({ root }).scenarios
    .find((entry) => entry.id === "quality-small-local-control");
  assert(scenario, "quality-small-local-control scenario missing");
  const repositoryFingerprint = fingerprint({ repository: "quality-live-runner-fixture" });
  const profileFingerprint = fingerprint({ profile: profileRole, narrowed, repositoryFingerprint });
  let generatedId = 0;
  const traceStore = createTraceStore({
    workspaceRoot,
    ...(runIdentity === null ? {} : {
      idFactory: (kind) => kind === "run"
        ? runIdentity
        : `${kind}-${profileRole}-${++generatedId}`,
    }),
  });
  const checkCatalog = qualityLiveCheckCatalog(scenario.id, "standard-lite");
  const executeFixtureChecks = async (_scenario, phase, commands, repo) => {
    if (phase === "setup") return [];
    const moduleUrl = `${pathToFileURL(path.join(repo, "src", "label.mjs")).href}?phase=${phase}&v=${Date.now()}`;
    const { label } = await import(moduleUrl);
    const passed = phase === "visible"
      ? label("hello") === "HELLO"
      : label("") === "UNTITLED" && fs.existsSync(path.join(repo, ".live-hidden", "quality-small-local-control.test.mjs"));
    return commands.map((command, index) => ({
      check_id: `${phase}-fixture-${index}`,
      status: passed ? "passed" : "failed",
      exit_code: passed ? 0 : 1,
      stdout_chars: 0,
      stderr_chars: 0,
    }));
  };
  const qualityAdapter = async ({ context, onTrace, workingDirectory }) => {
    assert.equal(workingDirectory, context.repo, "adapter cwd is not bound to the isolated fixture");
    const inspected = await onTrace("quality_inspect", {});
    assert.deepEqual(inspected.ownership_paths, ["src/label.mjs"]);
    const created = await onTrace("quality_create_dossier", {
      dossier_id: `dossier-quality-live-${profileRole}-${narrowed ? "narrow" : "full"}`,
      task_id: "task-root",
      risk_class: "standard-lite",
      mode: "standard-lite",
      task_type: "maintenance",
      user_visible_goal: "Correct the bounded label formatter.",
      starting_commit: START_COMMIT,
      created_at: "2026-07-13T12:00:00.000Z",
    });
    await onTrace("quality_update_dossier", {
      expected_revision: created.revision,
      updated_at: "2026-07-13T12:01:00.000Z",
      patch: dossierPatch(scenario.id, { narrowed }),
    });
    await onTrace("quality_finalize_dossier", { finalized_at: "2026-07-13T12:02:00.000Z" });
    await onTrace("quality_authorize_action", {
      kind: "edit",
      intent: "implementation",
      writable: true,
      write_scope: ["src/label.mjs"],
    });
    await onTrace("emit", {
      event_type: "edit",
      summary: "Implement the bounded label contract.",
      status: "completed",
      files_written: [{ path: "src/label.mjs", summary: "Uppercase output and empty fallback." }],
    });
    fs.writeFileSync(
      path.join(context.repo, "src", "label.mjs"),
      "export function label(value) {\n  const normalized = String(value).trim();\n  return normalized ? normalized.toUpperCase() : \"UNTITLED\";\n}\n",
      "utf8",
    );
    return { passed: true, profile_fingerprint: profileFingerprint, tool: "deterministic-fixture-adapter" };
  };
  try {
    const result = await runScenarioProfile({
      adapterUrl: "fixture://quality-live-runner",
      scenario,
      repetition: 1,
      profileRun: {
        profile_role: profileRole,
        profile: `quality-live-${profileRole}`,
        repository_fingerprint: repositoryFingerprint,
        profile_fingerprint: profileFingerprint,
      },
      evaluationRunId: `quality-live-runner-${profileRole}-${narrowed ? "narrow" : "full"}`,
      traceStore,
      sourceRoot: root,
      runAdapterModuleFn: qualityAdapter,
      executeChecksFn: executeFixtureChecks,
    });
    const runDir = path.join(workspaceRoot, ".oc_harness", "runs", result.operational_run_id);
    assert(fs.existsSync(runDir), `deterministic quality run was not published: ${JSON.stringify(result)}`);
    const bundle = validateEngineeringQualityRunBundle(runDir);
    return {
      workspaceRoot,
      runDir,
      result,
      bundle,
      checkCatalog,
      cleanup: () => fs.rmSync(workspaceRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    if (narrowed && error?.code === "QUALITY_ACCEPTANCE_TARGET_UNIVERSE") {
      const runsRoot = path.join(workspaceRoot, ".oc_harness", "runs");
      const runDirs = fs.existsSync(runsRoot)
        ? fs.readdirSync(runsRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => path.join(runsRoot, entry.name))
        : [];
      assert.equal(runDirs.length, 1, "narrowed production run did not leave exactly one atomically published bundle");
      return {
        workspaceRoot,
        runDir: runDirs[0],
        result: null,
        bundle: validateEngineeringQualityRunBundle(runDirs[0]),
        checkCatalog,
        expectedFailure: error.code,
        cleanup: () => fs.rmSync(workspaceRoot, { recursive: true, force: true }),
      };
    }
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  const run = await createDeterministicQualityRun({ profileRole: "candidate" });
  try {
    assert.equal(run.result.status, "passed", JSON.stringify(run.result.incomplete_evidence));
    assert(run.result.quality_outcomes?.complete, "runner did not derive complete quality outcomes");
    assert.equal(run.bundle.gate.status, "passed");
    const targets = [
      ...run.result.quality_outcomes.required_check_ids,
      ...run.result.quality_outcomes.required_mechanism_ids,
    ];
    assert.equal(new Set(targets).size, targets.length, "canonical runner target IDs are not unique");
    assert(targets.includes("quality-small-local-control-integration"));
    assert(targets.includes("quality-small-local-control-hidden-evaluation"));
    assert.equal(run.bundle.manifest.scenario_id, run.bundle.run.scenario_id);
    assert.equal(run.bundle.manifest.profile_role, run.bundle.run.profile_role);
    assert.equal(run.bundle.manifest.risk, run.bundle.run.risk);
    assert.equal(run.bundle.manifest.harness_fingerprint, run.bundle.run.harness_fingerprint);
    assert.equal(run.bundle.manifest.run_fingerprint, fingerprint(run.bundle.run));
    const tampered = structuredClone(run.bundle);
    assert.throws(
      () => createQualityOutcomes({ run_bundle: tampered, check_catalog: run.checkCatalog }),
      /QUALITY_BUNDLE_VALIDATION_REQUIRED/u,
      "unvalidated evidence clone was accepted",
    );

    const runPath = path.join(run.runDir, "run.json");
    const manifestPath = path.join(run.runDir, "quality", "manifest.json");
    const originalRunText = fs.readFileSync(runPath, "utf8");
    const originalManifestText = fs.readFileSync(manifestPath, "utf8");
    try {
      const profileMutatedRun = JSON.parse(originalRunText);
      profileMutatedRun.profile_role = "baseline";
      fs.writeFileSync(runPath, `${JSON.stringify(profileMutatedRun, null, 2)}\n`, "utf8");
      assert.throws(
        () => validateEngineeringQualityRunBundle(run.runDir),
        /QUALITY_BUNDLE_RUN_FINGERPRINT/u,
        "post-publication run.json profile_role mutation was accepted",
      );

      fs.writeFileSync(runPath, originalRunText, "utf8");
      const riskMutatedRun = JSON.parse(originalRunText);
      riskMutatedRun.risk = "high";
      const riskMutatedManifest = JSON.parse(originalManifestText);
      riskMutatedManifest.risk = "high";
      riskMutatedManifest.run_fingerprint = fingerprint(riskMutatedRun);
      const manifestFingerprintInput = { ...riskMutatedManifest };
      delete manifestFingerprintInput.fingerprint;
      riskMutatedManifest.fingerprint = fingerprint(manifestFingerprintInput);
      fs.writeFileSync(runPath, `${JSON.stringify(riskMutatedRun, null, 2)}\n`, "utf8");
      fs.writeFileSync(manifestPath, `${JSON.stringify(riskMutatedManifest, null, 2)}\n`, "utf8");
      assert.throws(
        () => validateEngineeringQualityRunBundle(run.runDir),
        /QUALITY_BUNDLE_RISK/u,
        "runner risk downgrade or dossier-risk mismatch was accepted",
      );
    } finally {
      fs.writeFileSync(runPath, originalRunText, "utf8");
      fs.writeFileSync(manifestPath, originalManifestText, "utf8");
    }
    console.log("Model-neutral quality live-runner integration checks passed (real sidecar/coordinator/runner path; no LLM or network).");
  } finally {
    run.cleanup();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
