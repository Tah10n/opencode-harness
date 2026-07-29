import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  encodeSyntheticComparisonCsvCell,
  publishSyntheticComparisonArtifacts,
  renderSyntheticComparisonCsv,
  renderSyntheticComparisonMarkdown,
} from "../lib/benchmark/comparison-reporting.mjs";
import { loadSyntheticContracts } from "../lib/benchmark/contracts.mjs";
import { analyzeSyntheticRunReport } from "../lib/benchmark/statistics.mjs";
import { createStatisticsFixtureReport } from "./verify-benchmark-statistics.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function notRunOutcome(reason) {
  return { status: "not_run", passed: null, violations: [reason] };
}

function incompleteReport(contracts, sourceRoot) {
  const report = structuredClone(createStatisticsFixtureReport(contracts, {
    mode: "better",
    sourceRoot,
  }));
  const pair = report.pairs[0];
  const candidate = pair.candidate;
  Object.assign(candidate, {
    execution_status: "blocked_external_state",
    termination_reason: "blocked_external_state",
    reason: "opencode_not_found",
    cli_version: null,
    adapter_completed_correctly: false,
    agent_reported_success: null,
    termination_acceptable: false,
    visible_check: notRunOutcome("visible_check_not_run"),
    hidden_check: notRunOutcome("hidden_check_not_run"),
    workspace_policy: notRunOutcome("workspace_check_not_run"),
    trace_policy: {
      status: "incomplete",
      passed: null,
      violations: ["trace_evidence_incomplete"],
    },
    hidden_safety_failed: false,
    evidence_complete: false,
    whole_task_success: false,
    defect_escape_v2: false,
    fingerprints: {
      adapter: null,
      initial_workspace: candidate.fingerprints.initial_workspace,
      final_workspace: candidate.fingerprints.final_workspace,
      trace: null,
    },
    metrics: {
      tool_call_count: null,
      subagent_call_count: null,
      context_read_count: null,
      permission_request_count: null,
      dangerous_command_count: null,
      network_action_count: null,
      hidden_access_attempt_count: null,
      workspace_mutation_count: null,
      fix_command_count: null,
      repository_instruction_action_count: null,
      secret_write_count: null,
      duration_ms: null,
      cost_usd: null,
      availability: {
        context_reads: "unavailable",
        permission_requests: "unavailable",
        network_actions: "unavailable",
        cost: "unavailable",
      },
    },
    operational_trace_id: null,
  });
  pair.complete = false;
  pair.incomplete_reasons = ["candidate-evidence-incomplete"];
  report.complete = false;
  report.incomplete_reasons = ["pair-evidence-incomplete"];
  report.run_id = "statistics-standard-better-incomplete";
  return report;
}

function preseedComparisonFiles(root, report, contents, count) {
  const runRoot = path.join(root, "reports", "runs", report.run_id);
  fs.mkdirSync(runRoot, { recursive: true });
  const entries = [
    ["comparison.json", `${JSON.stringify(contents.comparison, null, 2)}\n`],
    ["comparison.md", contents.markdown],
    ["summary.csv", contents.csv],
  ];
  for (const [name, value] of entries.slice(0, count)) {
    fs.writeFileSync(path.join(runRoot, name), value, "utf8");
  }
  return runRoot;
}

export function verifyBenchmarkComparisonReporting({ root = defaultRoot } = {}) {
  const contracts = loadSyntheticContracts(root);
  const fixtureReport = (options) => createStatisticsFixtureReport(contracts, {
    ...options,
    sourceRoot: root,
  });
  const analyzeReport = (sourceReport) => analyzeSyntheticRunReport({
    report: sourceReport,
    policy: contracts.comparison_policy,
    contractSourceRoot: root,
  });
  const publishComparison = (options) => publishSyntheticComparisonArtifacts({
    ...options,
    contractSourceRoot: root,
  });
  const report = fixtureReport({ mode: "better" });
  const comparison = analyzeReport(report);
  const markdown = renderSyntheticComparisonMarkdown({
    report,
    comparison,
    policy: contracts.comparison_policy,
  });
  const csv = renderSyntheticComparisonCsv({
    report,
    comparison,
    policy: contracts.comparison_policy,
  });
  assert(markdown.includes("# Synthetic paired comparison"));
  assert(markdown.includes("## Pareto view"));
  assert(markdown.includes("## Pair execution order"));
  assert(markdown.includes("candidate_better"));
  assert(csv.startsWith("\"section\",\"id\",\"dimension\""));
  assert(csv.includes("\"bootstrap_95_ci\""));
  assert(csv.includes("\"guardrail\""));
  assert.equal(encodeSyntheticComparisonCsvCell(-0.05), "\"-0.05\"");
  assert.equal(encodeSyntheticComparisonCsvCell("=2+3"), "\"'=2+3\"");
  const worseReport = fixtureReport({ mode: "worse" });
  const worseComparison = analyzeReport(worseReport);
  const worseCsv = renderSyntheticComparisonCsv({
    report: worseReport,
    comparison: worseComparison,
    policy: contracts.comparison_policy,
  });
  assert(worseComparison.primary.delta < 0);
  assert(worseCsv.includes(`"${worseComparison.primary.delta}"`));
  assert(!worseCsv.includes(`"'${worseComparison.primary.delta}"`));

  const completeRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "synthetic-comparison-complete-")));
  const interruptedRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "synthetic-comparison-interrupted-")));
  const incompleteRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "synthetic-comparison-incomplete-")));
  const partialOneRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "synthetic-comparison-partial-one-")));
  const partialTwoRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "synthetic-comparison-partial-two-")));
  const divergentRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "synthetic-comparison-divergent-")));
  const markerDivergentRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "synthetic-comparison-marker-divergent-")));
  try {
    const published = publishComparison({
      sourceRoot: completeRoot,
      relativeRoot: "reports",
      report,
      comparison,
      policy: contracts.comparison_policy,
    });
    assert.equal(published.status, "published");
    assert.equal(
      fs.existsSync(path.join(completeRoot, published.files.completion)),
      true,
    );
    assert.equal(fs.existsSync(path.join(completeRoot, published.files.latest)), true);
    assert.equal(
      publishComparison({
        sourceRoot: completeRoot,
        relativeRoot: "reports",
        report,
        comparison,
        policy: contracts.comparison_policy,
      }).comparison_fingerprint,
      published.comparison_fingerprint,
    );

    const divergentReport = structuredClone(report);
    divergentReport.created_at = "2026-01-03T00:00:00.000Z";
    const divergentComparison = analyzeReport(divergentReport);
    assert.throws(
      () => publishComparison({
        sourceRoot: completeRoot,
        relativeRoot: "reports",
        report: divergentReport,
        comparison: divergentComparison,
        policy: contracts.comparison_policy,
      }),
      (error) => error?.code === "SYNTHETIC_COMPARISON_ARTIFACT_DIVERGENCE",
    );

    assert.throws(
      () => publishComparison({
        sourceRoot: interruptedRoot,
        relativeRoot: "reports",
        report,
        comparison,
        policy: contracts.comparison_policy,
        beforeMarker() {
          throw new Error("simulated comparison marker interruption");
        },
      }),
      /simulated comparison marker interruption/u,
    );
    const interruptedRunRoot = path.join(
      interruptedRoot,
      "reports",
      "runs",
      report.run_id,
    );
    assert.equal(fs.existsSync(path.join(interruptedRunRoot, "comparison.json")), true);
    assert.equal(fs.existsSync(path.join(interruptedRunRoot, "comparison-completion.json")), false);
    const recovered = publishComparison({
      sourceRoot: interruptedRoot,
      relativeRoot: "reports",
      report,
      comparison,
      policy: contracts.comparison_policy,
    });
    assert.equal(recovered.status, "published");
    assert.equal(fs.existsSync(path.join(interruptedRunRoot, "comparison-completion.json")), true);

    const expectedContents = { comparison, markdown, csv };
    const partialOneRunRoot = preseedComparisonFiles(
      partialOneRoot,
      report,
      expectedContents,
      1,
    );
    const partialOneRecovered = publishComparison({
      sourceRoot: partialOneRoot,
      relativeRoot: "reports",
      report,
      comparison,
      policy: contracts.comparison_policy,
    });
    assert.equal(partialOneRecovered.status, "published");
    assert.equal(fs.existsSync(path.join(partialOneRunRoot, "summary.csv")), true);
    assert.equal(
      fs.existsSync(path.join(partialOneRunRoot, "comparison-completion.json")),
      true,
    );

    const partialTwoRunRoot = preseedComparisonFiles(
      partialTwoRoot,
      report,
      expectedContents,
      2,
    );
    const partialTwoRecovered = publishComparison({
      sourceRoot: partialTwoRoot,
      relativeRoot: "reports",
      report,
      comparison,
      policy: contracts.comparison_policy,
    });
    assert.equal(partialTwoRecovered.status, "published");
    assert.equal(fs.existsSync(path.join(partialTwoRunRoot, "summary.csv")), true);
    assert.equal(
      fs.existsSync(path.join(partialTwoRunRoot, "comparison-completion.json")),
      true,
    );

    const divergentRunRoot = preseedComparisonFiles(
      divergentRoot,
      report,
      expectedContents,
      1,
    );
    fs.writeFileSync(
      path.join(divergentRunRoot, "comparison.json"),
      "{\"divergent\":true}\n",
      "utf8",
    );
    assert.throws(
      () => publishComparison({
        sourceRoot: divergentRoot,
        relativeRoot: "reports",
        report,
        comparison,
        policy: contracts.comparison_policy,
      }),
      (error) => error?.code === "SYNTHETIC_COMPARISON_ARTIFACT_DIVERGENCE",
    );

    const markerDivergentRunRoot = preseedComparisonFiles(
      markerDivergentRoot,
      report,
      expectedContents,
      0,
    );
    fs.writeFileSync(
      path.join(markerDivergentRunRoot, "comparison-completion.json"),
      "{\"artifact_kind\":\"divergent\"}\n",
      "utf8",
    );
    assert.throws(
      () => publishComparison({
        sourceRoot: markerDivergentRoot,
        relativeRoot: "reports",
        report,
        comparison,
        policy: contracts.comparison_policy,
      }),
      (error) => error?.code === "SYNTHETIC_COMPARISON_ARTIFACT_DIVERGENCE",
    );
    for (const name of ["comparison.json", "comparison.md", "summary.csv"]) {
      assert.equal(fs.existsSync(path.join(markerDivergentRunRoot, name)), false);
    }

    const incomplete = incompleteReport(contracts, root);
    const incompleteComparison = analyzeReport(incomplete);
    const incompletePublished = publishComparison({
      sourceRoot: incompleteRoot,
      relativeRoot: "reports",
      report: incomplete,
      comparison: incompleteComparison,
      policy: contracts.comparison_policy,
    });
    assert.equal(incompletePublished.status, "incomplete-uncommitted");
    assert.equal(incompletePublished.files.completion, null);
    assert.equal(
      fs.existsSync(path.join(
        incompleteRoot,
        "reports",
        "runs",
        incomplete.run_id,
        "comparison.json",
      )),
      true,
    );
    assert.equal(fs.existsSync(path.join(incompleteRoot, "reports", "latest-comparison.json")), false);
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
    formats: 3,
    publication_modes: 5,
    comparison_verdict: comparison.verdict.status,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = verifyBenchmarkComparisonReporting();
  console.log(
    `Synthetic comparison reporting verified (${result.formats} formats; ${result.publication_modes} publication modes; ${result.comparison_verdict}).`,
  );
}
