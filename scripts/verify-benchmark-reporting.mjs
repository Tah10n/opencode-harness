import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadSyntheticContracts } from "../lib/benchmark/contracts.mjs";
import { fingerprint } from "../lib/feedback/contracts.mjs";
import {
  loadSyntheticTemplateSet,
  renderSyntheticInstance,
} from "../lib/benchmark/renderer.mjs";
import {
  publishSyntheticRunArtifacts,
  renderSyntheticRunCsv,
  renderSyntheticRunMarkdown,
  validateSyntheticRunReport,
  validateSyntheticRunReportSourceBinding,
} from "../lib/benchmark/reporting.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fp(value) {
  return fingerprint({ fixture: value });
}

function modelBindingFingerprint({
  provider,
  model,
  variant,
}) {
  return fingerprint({
    schema: "synthetic-model-binding-v1",
    provider,
    model,
    variant,
  });
}

function passedOutcome() {
  return { status: "passed", passed: true, violations: [] };
}

function successfulResult(profileId, profileFingerprint, suffix) {
  return {
    profile_id: profileId,
    profile_fingerprint: profileFingerprint,
    operational_run_id: `op-${suffix}`,
    execution_status: "completed",
    termination_reason: "verified",
    reason: null,
    cli_version: "1.17.0",
    adapter_completed_correctly: true,
    agent_reported_success: true,
    termination_acceptable: true,
    visible_check: passedOutcome(),
    hidden_check: passedOutcome(),
    workspace_policy: passedOutcome(),
    trace_policy: passedOutcome(),
    teardown: passedOutcome(),
    cleanup: passedOutcome(),
    hidden_safety_failed: false,
    evidence_complete: true,
    whole_task_success: true,
    defect_escape_v2: false,
    fingerprints: {
      adapter: fp("adapter"),
      initial_workspace: fp("initial"),
      final_workspace: fp(`final-${suffix}`),
      trace: fp(`trace-${suffix}`),
    },
    metrics: {
      tool_call_count: 3,
      subagent_call_count: 0,
      context_read_count: null,
      permission_request_count: null,
      dangerous_command_count: 0,
      network_action_count: 0,
      hidden_access_attempt_count: 0,
      workspace_mutation_count: 1,
      fix_command_count: 1,
      repository_instruction_action_count: 0,
      secret_write_count: 0,
      duration_ms: 10,
      cost_usd: null,
      availability: {
        context_reads: "unavailable",
        permission_requests: "unavailable",
        network_actions: "available",
        cost: "unavailable",
      },
    },
    operational_trace_id: `trace-${suffix}`,
  };
}

function pairId(identity) {
  return fingerprint({
    schema: "synthetic-pair-identity-v1",
    family_id: identity.family_id,
    generated_fixture_fingerprint: identity.generated_fixture_fingerprint,
    repetition: identity.repetition,
  });
}

function bindPairToInstance(pair, instance) {
  pair.identity = {
    family_id: instance.family_id,
    category: instance.category,
    risk: instance.risk,
    generated_fixture_fingerprint: instance.generated_fixture_fingerprint,
    repetition: instance.repetition,
  };
  pair.pair_id = pairId(pair.identity);
  pair.binding.public_fixture_fingerprint = instance.public_fixture_fingerprint;
  pair.binding.hidden_fixture_fingerprint = instance.hidden_fixture_fingerprint;
}

function completeReport(contracts, templateSet, runId = "reporting-self-test") {
  const baselineFingerprint = fp("profile-plain");
  const candidateFingerprint = fp("profile-instrumented");
  const suite = contracts.suites.find((entry) => entry.id === "smoke");
  assert(suite);
  const seed = "reporting-self-test";
  const pairs = suite.family_ids.flatMap((familyId, familyIndex) => Array.from(
    { length: suite.repetitions },
    (_, repetitionIndex) => {
      const repetition = repetitionIndex + 1;
      const instance = renderSyntheticInstance({
        contracts,
        templateSet,
        familyId,
        seed,
        repetition,
      });
      const identity = {
        family_id: instance.family_id,
        category: instance.category,
        risk: instance.risk,
        generated_fixture_fingerprint: instance.generated_fixture_fingerprint,
        repetition: instance.repetition,
      };
      return {
        pair_id: pairId(identity),
        identity,
        order: (familyIndex + repetition) % 2 === 0
          ? ["plain", "instrumented"]
          : ["instrumented", "plain"],
        binding: {
          public_fixture_fingerprint: instance.public_fixture_fingerprint,
          hidden_fixture_fingerprint: instance.hidden_fixture_fingerprint,
          effective_public_input_fingerprint: fp(`input-${familyId}-${repetition}`),
          initial_public_manifest_fingerprint: fp(`initial-${familyId}-${repetition}`),
          model_fingerprint: modelBindingFingerprint({
            provider: "fixture",
            model: "fixture/model",
            variant: null,
          }),
          timeout_ms: 60_000,
          limits_fingerprint: fp("limits"),
          adapter_protocol_version: 2,
        },
        complete: true,
        incomplete_reasons: [],
        baseline: successfulResult(
          "plain",
          baselineFingerprint,
          `${familyId}-${repetition}-plain`,
        ),
        candidate: successfulResult(
          "instrumented",
          candidateFingerprint,
          `${familyId}-${repetition}-instrumented`,
        ),
      };
    },
  ));
  return {
    schema_version: 2,
    report_kind: "synthetic-paired-run",
    run_id: runId,
    generation_id: "generation-reporting-self-test",
    created_at: "2026-01-01T00:00:00.000Z",
    suite: {
      id: "smoke",
      manifest_fingerprint: contracts.fingerprints.suites,
      template_set_fingerprint: fingerprint(templateSet),
      comparison_policy_fingerprint: contracts.fingerprints.comparison_policy,
      profile_inventory_fingerprint: contracts.fingerprints.inventory,
      seed,
      repetitions: suite.repetitions,
      declared_pair_count: pairs.length,
    },
    execution: {
      provider: "fixture",
      model: "fixture/model",
      variant: null,
      timeout_ms: 60_000,
      limits_fingerprint: fp("limits"),
      adapter_protocol_version: 2,
      model_tool_availability: {
        opencode: "available",
        model: "available",
        cost: "unavailable",
      },
    },
    profiles: {
      baseline: { id: "plain", fingerprint: baselineFingerprint },
      candidate: { id: "instrumented", fingerprint: candidateFingerprint },
    },
    complete: true,
    incomplete_reasons: [],
    pair_count: pairs.length,
    pairs,
    residual_caveats: [
      "context-reads-unavailable",
      "cost-unavailable",
      "permission-requests-unavailable",
    ],
  };
}

function incompleteReport(contracts, templateSet) {
  const report = structuredClone(completeReport(
    contracts,
    templateSet,
    "reporting-incomplete-test",
  ));
  const candidate = report.pairs[0].candidate;
  Object.assign(candidate, {
    execution_status: "blocked_external_state",
    termination_reason: "blocked_external_state",
    reason: "opencode_not_found",
    cli_version: null,
    adapter_completed_correctly: false,
    agent_reported_success: null,
    termination_acceptable: false,
    trace_policy: {
      status: "incomplete",
      passed: null,
      violations: ["trace_evidence_incomplete"],
    },
    evidence_complete: false,
    whole_task_success: false,
    fingerprints: {
      ...candidate.fingerprints,
      adapter: null,
    },
    metrics: {
      ...candidate.metrics,
      tool_call_count: null,
      subagent_call_count: null,
      dangerous_command_count: null,
      network_action_count: null,
      hidden_access_attempt_count: null,
      workspace_mutation_count: null,
      fix_command_count: null,
      repository_instruction_action_count: null,
      secret_write_count: null,
      duration_ms: null,
      availability: {
        ...candidate.metrics.availability,
        network_actions: "unavailable",
      },
    },
  });
  report.pairs[0].complete = false;
  report.pairs[0].incomplete_reasons = ["candidate-evidence-incomplete"];
  report.complete = false;
  report.incomplete_reasons = ["pair-evidence-incomplete"];
  return report;
}

function mustReject(value, code) {
  assert.throws(
    () => validateSyntheticRunReport(value),
    (error) => error?.code === code,
  );
}

function preseedRunFiles(root, report, contents, count) {
  const runRoot = path.join(root, "reports", "runs", report.run_id);
  fs.mkdirSync(runRoot, { recursive: true });
  const entries = [
    ["report.json", `${JSON.stringify(report, null, 2)}\n`],
    ["report.md", contents.markdown],
    ["pairs.csv", contents.csv],
  ];
  for (const [name, value] of entries.slice(0, count)) {
    fs.writeFileSync(path.join(runRoot, name), value, "utf8");
  }
  return runRoot;
}

export function verifyBenchmarkReporting({ root = defaultRoot } = {}) {
  const contracts = loadSyntheticContracts(root);
  const templateSet = loadSyntheticTemplateSet(root, contracts);
  const report = completeReport(contracts, templateSet);
  const publishRun = (options) => publishSyntheticRunArtifacts({
    ...options,
    contractSourceRoot: root,
  });
  assert.equal(validateSyntheticRunReport(report), report);
  assert.equal(validateSyntheticRunReportSourceBinding(report, {
    sourceRoot: root,
  }), report);
  const reordered = structuredClone(report);
  reordered.pairs.reverse();
  assert.equal(validateSyntheticRunReportSourceBinding(reordered, {
    sourceRoot: root,
  }), reordered);
  const mustRejectSourceBinding = (value) => {
    assert.throws(
      () => validateSyntheticRunReportSourceBinding(value, { sourceRoot: root }),
      (error) => error?.code === "SYNTHETIC_REPORT_SOURCE_BINDING",
    );
  };
  const substitutedPair = structuredClone(report);
  const smokeSuite = contracts.suites.find((entry) => entry.id === "smoke");
  const substitutedFamily = contracts.families.find(
    (entry) => !smokeSuite.family_ids.includes(entry.id),
  );
  const substitutedInstance = renderSyntheticInstance({
    contracts,
    templateSet,
    familyId: substitutedFamily.id,
    seed: report.suite.seed,
    repetition: 1,
  });
  bindPairToInstance(substitutedPair.pairs[0], substitutedInstance);
  mustRejectSourceBinding(substitutedPair);
  const unknownFamily = structuredClone(report);
  unknownFamily.pairs[0].identity.family_id = "unknown-family";
  unknownFamily.pairs[0].pair_id = pairId(unknownFamily.pairs[0].identity);
  mustRejectSourceBinding(unknownFamily);
  const repeatedFamily = structuredClone(report);
  repeatedFamily.pairs[1].identity = {
    ...repeatedFamily.pairs[0].identity,
    generated_fixture_fingerprint: fp("repeated-family-distinct-fixture"),
  };
  repeatedFamily.pairs[1].pair_id = pairId(repeatedFamily.pairs[1].identity);
  repeatedFamily.pairs[1].binding.public_fixture_fingerprint = fp("repeated-public");
  repeatedFamily.pairs[1].binding.hidden_fixture_fingerprint = fp("repeated-hidden");
  mustRejectSourceBinding(repeatedFamily);
  for (const fingerprintKey of [
    "manifest_fingerprint",
    "template_set_fingerprint",
    "profile_inventory_fingerprint",
  ]) {
    const staleSource = structuredClone(report);
    staleSource.suite[fingerprintKey] = fp(`stale-${fingerprintKey}`);
    mustRejectSourceBinding(staleSource);
  }
  const markdown = renderSyntheticRunMarkdown(report);
  const csv = renderSyntheticRunCsv(report);
  assert(markdown.includes("instrumented then plain"));
  assert(csv.includes('"candidate_whole_task_success"'));
  const privateInstance = renderSyntheticInstance({
    contracts,
    templateSet,
    familyId: report.pairs[0].identity.family_id,
    seed: report.suite.seed,
    repetition: report.pairs[0].identity.repetition,
  });
  for (const forbidden of [
    privateInstance.prompt,
    privateInstance.hidden_files[0].path,
    "completion text",
    "C:\\",
    "/tmp/",
  ]) {
    assert(!`${JSON.stringify(report)}${markdown}${csv}`.includes(forbidden));
  }

  mustReject({ ...report, statistics: {} }, "SYNTHETIC_REPORT_SHAPE");
  const absolutePath = structuredClone(report);
  absolutePath.execution.model = "C:\\private\\model";
  for (const pair of absolutePath.pairs) {
    pair.binding.model_fingerprint = modelBindingFingerprint(absolutePath.execution);
  }
  mustReject(absolutePath, "SYNTHETIC_REPORT_PRIVACY");
  for (const unixPath of [
    "/workspace/private/model",
    "/private/model",
    "/mnt/private/model",
  ]) {
    const unixAbsolutePath = structuredClone(report);
    unixAbsolutePath.execution.model = unixPath;
    for (const pair of unixAbsolutePath.pairs) {
      pair.binding.model_fingerprint = modelBindingFingerprint(unixAbsolutePath.execution);
    }
    mustReject(unixAbsolutePath, "SYNTHETIC_REPORT_PRIVACY");
  }
  const unsafeExecutionStatus = structuredClone(report);
  unsafeExecutionStatus.pairs[0].candidate.execution_status = "failed";
  mustReject(unsafeExecutionStatus, "SYNTHETIC_REPORT_SEMANTICS");
  const staleModelBinding = structuredClone(report);
  staleModelBinding.pairs[0].binding.model_fingerprint = fp("stale-model");
  mustReject(staleModelBinding, "SYNTHETIC_REPORT_BINDING");
  const markdownInjection = structuredClone(report);
  markdownInjection.execution.model = "x` ![pixel](https://example.invalid/pixel) `";
  for (const pair of markdownInjection.pairs) {
    pair.binding.model_fingerprint = modelBindingFingerprint(markdownInjection.execution);
  }
  const injectionMarkdown = renderSyntheticRunMarkdown(markdownInjection);
  assert(injectionMarkdown.includes("- Model: `` x` ![pixel](https://example.invalid/pixel) ` ``"));
  assert(!injectionMarkdown.includes("- Model: `x` ![pixel]"));
  const inconsistentWhole = structuredClone(report);
  inconsistentWhole.pairs[0].candidate.hidden_check = {
    status: "failed",
    passed: false,
    violations: ["hidden_failure"],
  };
  mustReject(inconsistentWhole, "SYNTHETIC_REPORT_SEMANTICS");
  const duplicatePair = structuredClone(report);
  duplicatePair.pairs.push(structuredClone(duplicatePair.pairs[0]));
  duplicatePair.pair_count = duplicatePair.pairs.length;
  duplicatePair.suite.declared_pair_count = duplicatePair.pairs.length;
  mustReject(duplicatePair, "SYNTHETIC_REPORT_DUPLICATE_PAIR");

  const completeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-report-complete-"));
  const interruptedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-report-interrupted-"));
  const incompleteRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-report-incomplete-"));
  const partialOneRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-report-partial-one-"));
  const partialTwoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-report-partial-two-"));
  const divergentRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-report-divergent-"));
  const markerDivergentRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bench-report-marker-divergent-"));
  try {
    let markerHookCalled = false;
    const published = publishRun({
      sourceRoot: completeRoot,
      relativeRoot: "reports",
      report,
      beforeMarker({ markerPath }) {
        markerHookCalled = true;
        const runDirectory = path.dirname(markerPath);
        assert.equal(fs.existsSync(path.join(runDirectory, "report.json")), true);
        assert.equal(fs.existsSync(path.join(runDirectory, "report.md")), true);
        assert.equal(fs.existsSync(path.join(runDirectory, "pairs.csv")), true);
        assert.equal(fs.existsSync(markerPath), false);
      },
    });
    assert.equal(markerHookCalled, true);
    assert.equal(published.status, "published");
    assert.equal(fs.existsSync(path.join(completeRoot, "reports", "runs", report.run_id, "completion.json")), true);
    assert.equal(fs.existsSync(path.join(completeRoot, "reports", "latest.json")), true);
    assert.equal(
      publishRun({
        sourceRoot: completeRoot,
        relativeRoot: "reports",
        report,
      }).report_fingerprint,
      published.report_fingerprint,
    );
    const divergent = structuredClone(report);
    divergent.created_at = "2026-01-01T00:00:01.000Z";
    assert.throws(
      () => publishRun({
        sourceRoot: completeRoot,
        relativeRoot: "reports",
        report: divergent,
      }),
      (error) => error?.code === "SYNTHETIC_ARTIFACT_DIVERGENCE",
    );

    const interrupted = completeReport(
      contracts,
      templateSet,
      "reporting-interrupted-test",
    );
    assert.throws(
      () => publishRun({
        sourceRoot: interruptedRoot,
        relativeRoot: "reports",
        report: interrupted,
        beforeMarker() {
          throw new Error("marker-interruption");
        },
      }),
      /marker-interruption/u,
    );
    const interruptedRunRoot = path.join(interruptedRoot, "reports", "runs", interrupted.run_id);
    for (const filename of ["report.json", "report.md", "pairs.csv"]) {
      assert.equal(fs.existsSync(path.join(interruptedRunRoot, filename)), true);
    }
    assert.equal(fs.existsSync(path.join(interruptedRunRoot, "completion.json")), false);
    assert.equal(fs.existsSync(path.join(interruptedRoot, "reports", "latest.json")), false);
    const recovered = publishRun({
      sourceRoot: interruptedRoot,
      relativeRoot: "reports",
      report: interrupted,
    });
    assert.equal(recovered.status, "published");
    assert.equal(fs.existsSync(path.join(interruptedRunRoot, "completion.json")), true);
    assert.equal(fs.existsSync(path.join(interruptedRoot, "reports", "latest.json")), true);

    const expectedContents = { markdown, csv };
    const partialOneRunRoot = preseedRunFiles(partialOneRoot, report, expectedContents, 1);
    const partialOneRecovered = publishRun({
      sourceRoot: partialOneRoot,
      relativeRoot: "reports",
      report,
    });
    assert.equal(partialOneRecovered.status, "published");
    assert.equal(fs.existsSync(path.join(partialOneRunRoot, "pairs.csv")), true);
    assert.equal(fs.existsSync(path.join(partialOneRunRoot, "completion.json")), true);

    const partialTwoRunRoot = preseedRunFiles(partialTwoRoot, report, expectedContents, 2);
    const partialTwoRecovered = publishRun({
      sourceRoot: partialTwoRoot,
      relativeRoot: "reports",
      report,
    });
    assert.equal(partialTwoRecovered.status, "published");
    assert.equal(fs.existsSync(path.join(partialTwoRunRoot, "pairs.csv")), true);
    assert.equal(fs.existsSync(path.join(partialTwoRunRoot, "completion.json")), true);

    const divergentRunRoot = preseedRunFiles(divergentRoot, report, expectedContents, 1);
    fs.writeFileSync(path.join(divergentRunRoot, "report.json"), "{\"divergent\":true}\n", "utf8");
    assert.throws(
      () => publishRun({
        sourceRoot: divergentRoot,
        relativeRoot: "reports",
        report,
      }),
      (error) => error?.code === "SYNTHETIC_ARTIFACT_DIVERGENCE",
    );

    const markerDivergentRunRoot = preseedRunFiles(
      markerDivergentRoot,
      report,
      expectedContents,
      0,
    );
    fs.writeFileSync(
      path.join(markerDivergentRunRoot, "completion.json"),
      "{\"artifact_kind\":\"divergent\"}\n",
      "utf8",
    );
    assert.throws(
      () => publishRun({
        sourceRoot: markerDivergentRoot,
        relativeRoot: "reports",
        report,
      }),
      (error) => error?.code === "SYNTHETIC_ARTIFACT_DIVERGENCE",
    );
    for (const name of ["report.json", "report.md", "pairs.csv"]) {
      assert.equal(fs.existsSync(path.join(markerDivergentRunRoot, name)), false);
    }

    const incomplete = incompleteReport(contracts, templateSet);
    assert.equal(validateSyntheticRunReport(incomplete), incomplete);
    const incompletePublished = publishRun({
      sourceRoot: incompleteRoot,
      relativeRoot: "reports",
      report: incomplete,
    });
    assert.equal(incompletePublished.status, "incomplete-uncommitted");
    assert.equal(incompletePublished.files.completion, null);
    assert.equal(fs.existsSync(path.join(incompleteRoot, "reports", "runs", incomplete.run_id, "report.json")), true);
    assert.equal(fs.existsSync(path.join(incompleteRoot, "reports", "runs", incomplete.run_id, "completion.json")), false);
    assert.equal(fs.existsSync(path.join(incompleteRoot, "reports", "latest.json")), false);
  } finally {
    fs.rmSync(completeRoot, { recursive: true, force: true });
    fs.rmSync(interruptedRoot, { recursive: true, force: true });
    fs.rmSync(incompleteRoot, { recursive: true, force: true });
    fs.rmSync(partialOneRoot, { recursive: true, force: true });
    fs.rmSync(partialTwoRoot, { recursive: true, force: true });
    fs.rmSync(divergentRoot, { recursive: true, force: true });
    fs.rmSync(markerDivergentRoot, { recursive: true, force: true });
  }
  return {
    formats: 5,
    semantic_rejections: 15,
    publication_modes: 5,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = verifyBenchmarkReporting();
  console.log(`Synthetic benchmark reporting verification passed (${result.formats} formats; ${result.semantic_rejections} semantic/privacy rejections; ${result.publication_modes} publication modes).`);
}
