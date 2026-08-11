import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  ContractError,
  canonicalJson,
  fingerprint,
} from "../feedback/contracts.mjs";
import {
  assertConfinedExistingPath,
  atomicWriteImmutable,
  atomicWriteJson,
  ensureConfinedDirectory,
  resolveIdPath,
  resolveInside,
  withExclusiveLock,
} from "../feedback/files.mjs";
import { assertPortableContractPath } from "./contracts.mjs";
import {
  DEFAULT_SYNTHETIC_ARTIFACT_ROOT,
  validateSyntheticRunReportSourceBinding,
} from "./reporting.mjs";
import { validateSyntheticComparisonReport } from "./statistics.mjs";

export const SYNTHETIC_COMPARISON_ARTIFACT_VERSION = 2;

function fail(code, message) {
  throw new ContractError(code, message);
}

function expect(condition, code, message) {
  if (!condition) fail(code, message);
}

function markdownCell(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "\\|")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
}

function markdownCode(value) {
  const text = markdownCell(value);
  const longestRun = Math.max(0, ...(text.match(/`+/gu) ?? []).map((run) => run.length));
  const delimiter = "`".repeat(longestRun + 1);
  const padded = text.startsWith("`")
    || text.endsWith("`")
    || (text.startsWith(" ") && text.endsWith(" ") && text.trim().length > 0);
  return `${delimiter}${padded ? " " : ""}${text}${padded ? " " : ""}${delimiter}`;
}

function metricValue(value) {
  return value === null ? "unavailable" : value;
}

function markdownTable(lines, header, rows) {
  lines.push(
    `| ${header.map(markdownCell).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  );
  for (const row of rows) {
    lines.push(`| ${row.map((entry) => markdownCell(metricValue(entry))).join(" | ")} |`);
  }
}

function renderMarkdownUnchecked(report, comparison) {
  const lines = [
    "# Synthetic paired comparison",
    "",
    `- Run: ${markdownCode(comparison.source.run_id)}`,
    `- Suite: ${markdownCode(comparison.source.suite_id)}`,
    `- Profiles: ${markdownCode(comparison.profiles.baseline.id)} vs ${markdownCode(comparison.profiles.candidate.id)}`,
    `- Model: ${markdownCode(report.execution.model)}`,
    `- Provider: ${markdownCode(report.execution.provider ?? "host-observed-unavailable")}`,
    `- Variant: ${markdownCode(report.execution.variant ?? "host-observed-unavailable")}`,
    `- Evidence complete: ${markdownCode(comparison.source.suite_complete)}`,
    `- Verdict: ${markdownCode(comparison.verdict.status)}`,
    `- Verdict reasons: ${comparison.verdict.reasons.map(markdownCode).join(", ")}`,
    `- Suite manifest fingerprint: ${markdownCode(comparison.source.suite_manifest_fingerprint)}`,
    `- Comparison policy fingerprint: ${markdownCode(comparison.source.comparison_policy_fingerprint)}`,
    `- Profile inventory fingerprint: ${markdownCode(comparison.source.profile_inventory_fingerprint)}`,
    `- Run report fingerprint: ${markdownCode(comparison.source.run_report_fingerprint)}`,
    `- OpenCode executable fingerprint: ${markdownCode(comparison.source.executable_fingerprint)}`,
    `- Seed: ${markdownCode(comparison.source.seed)}`,
    `- Analysis seed: ${markdownCode(comparison.policy.analysis_seed)}`,
    "",
    "## Sample and primary outcome",
    "",
    `- Declared pairs: ${markdownCode(comparison.sample.declared_pairs)}`,
    `- Reported pairs: ${markdownCode(comparison.sample.reported_pairs)}`,
    `- Complete pairs: ${markdownCode(comparison.sample.complete_pairs)}`,
    `- Incomplete pairs: ${markdownCode(comparison.sample.incomplete_pairs)}`,
    `- Complete families: ${markdownCode(comparison.sample.complete_families)} / ${markdownCode(comparison.sample.expected_families)}`,
    `- Complete semantic variants: ${markdownCode(comparison.sample.complete_semantic_variants)} / ${markdownCode(comparison.sample.expected_semantic_variants)}`,
    `- Analysis pairs: ${markdownCode(comparison.sample.analysis_pairs)} (excluded complete pairs: ${markdownCode(comparison.sample.excluded_complete_pairs)})`,
    `- Primary macro delta: ${markdownCode(metricValue(comparison.primary.delta))}`,
    `- Bootstrap 95% CI: ${markdownCode(metricValue(comparison.primary.bootstrap.lower))} to ${markdownCode(metricValue(comparison.primary.bootstrap.upper))}`,
    `- Bootstrap status: ${markdownCode(comparison.primary.bootstrap.status)} (${markdownCode(comparison.primary.bootstrap.resamples)} resamples)`,
    `- Exact family sign flip: ${markdownCode(comparison.primary.family_sign_flip.status)}, p=${markdownCode(metricValue(comparison.primary.family_sign_flip.p_value))}`,
    `- Diagnostic raw-pair McNemar (not used for verdict): ${markdownCode(comparison.diagnostics.mcnemar.status)}, p=${markdownCode(metricValue(comparison.diagnostics.mcnemar.p_value))}`,
    "",
  ];
  markdownTable(lines, [
    "Outcome",
    "Count",
  ], Object.entries(comparison.diagnostics.raw_pair_paired_outcomes));
  lines.push("", "## Family-level primary evidence", "");
  markdownTable(lines, [
    "Family",
    "Semantic variants",
    "Trajectories per variant",
    "Baseline",
    "Candidate",
    "Delta",
  ], comparison.primary.family_sign_flip.family_deltas.map((entry) => [
    entry.family_id,
    entry.semantic_variants,
    entry.trajectories_per_variant,
    entry.baseline_rate,
    entry.candidate_rate,
    entry.delta,
  ]));
  lines.push("", "## Paired rate metrics", "");
  markdownTable(lines, [
    "Metric",
    "Scope",
    "Applicable pairs",
    "Availability",
    "Baseline",
    "Candidate",
    "Delta",
  ], comparison.rates.map((entry) => [
    entry.id,
    entry.pair_scope,
    entry.applicable_pairs,
    entry.availability,
    entry.baseline_rate,
    entry.candidate_rate,
    entry.delta,
  ]));
  lines.push("", "## Count and overhead metrics", "");
  markdownTable(lines, [
    "Metric",
    "Unit",
    "Applicable pairs",
    "Availability",
    "Baseline",
    "Candidate",
    "Delta",
  ], comparison.count_metrics.map((entry) => [
    entry.id,
    entry.unit,
    entry.applicable_pairs,
    entry.availability,
    entry.baseline_mean,
    entry.candidate_mean,
    entry.delta,
  ]));
  lines.push("", "## Guardrails", "");
  markdownTable(lines, [
    "Guardrail",
    "Observed",
    "Operator",
    "Threshold",
    "Status",
  ], comparison.guardrails.map((entry) => [
    entry.id,
    entry.observed,
    entry.operator,
    entry.threshold,
    entry.status,
  ]));
  for (const [key, title] of [
    ["by_family", "Family"],
    ["by_category", "Category"],
    ["by_risk", "Risk"],
  ]) {
    lines.push("", `## ${title} breakdown`, "");
    markdownTable(lines, [
      title,
      "Complete pairs",
      "Family count",
      "Baseline",
      "Candidate",
      "Delta",
    ], comparison.breakdowns[key].map((entry) => [
      entry.id,
      entry.complete_pairs,
      entry.family_count,
      entry.baseline_rate,
      entry.candidate_rate,
      entry.delta,
    ]));
  }
  lines.push(
    "",
    "## Pareto view",
    "",
    `- Quality gain: ${markdownCode(metricValue(comparison.pareto.quality_gain))}`,
    `- Duration overhead: ${markdownCode(metricValue(comparison.pareto.duration_overhead))}`,
    `- Cost overhead: ${markdownCode(metricValue(comparison.pareto.cost_overhead))}`,
    `- New canary/safety regressions: ${markdownCode(comparison.pareto.scope_safety_regressions.new_canary_safety_regressions)}`,
    `- Scope violation rate delta: ${markdownCode(metricValue(comparison.pareto.scope_safety_regressions.scope_violation_rate_delta))}`,
    `- Review-only mutation rate delta: ${markdownCode(metricValue(comparison.pareto.scope_safety_regressions.review_only_mutation_rate_delta))}`,
    "",
    "## Pair execution order",
    "",
  );
  markdownTable(lines, [
    "Family",
    "Semantic variant",
    "Trajectory",
    "Order",
    "Complete",
  ], report.pairs.map((pair) => [
    pair.identity.family_id,
    pair.identity.semantic_variant_id,
    pair.identity.trajectory_repetition,
    pair.order.join(" then "),
    pair.complete,
  ]));
  lines.push("", "## Residual caveats", "");
  if (comparison.residual_caveats.length === 0) {
    lines.push("- none");
  } else {
    for (const caveat of comparison.residual_caveats) lines.push(`- ${markdownCode(caveat)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderSyntheticComparisonMarkdown({
  report,
  comparison,
  policy,
} = {}) {
  validateSyntheticComparisonReport(comparison, { report, policy });
  return renderMarkdownUnchecked(report, comparison);
}

export function encodeSyntheticComparisonCsvCell(value) {
  const stringValue = typeof value === "string";
  let text = value === null || value === undefined ? "" : String(value);
  if (stringValue && /^[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""').replaceAll("\r", " ").replaceAll("\n", " ")}"`;
}

function csvRows(report, comparison) {
  const rows = [[
    "section",
    "id",
    "dimension",
    "baseline",
    "candidate",
    "delta",
    "status",
    "availability",
    "operator",
    "threshold",
    "details",
  ]];
  rows.push([
    "primary",
    comparison.primary.metric,
    comparison.primary.averaging,
    comparison.primary.baseline_rate,
    comparison.primary.candidate_rate,
    comparison.primary.delta,
    comparison.verdict.status,
    "",
    "",
    "",
    comparison.verdict.reasons.join(";"),
  ]);
  for (const [id, value] of Object.entries(comparison.diagnostics.raw_pair_paired_outcomes)) {
    rows.push(["paired_outcome", id, "count", value, "", "", "", "available", "", "", ""]);
  }
  rows.push([
    "statistic",
    "bootstrap_95_ci",
    comparison.primary.bootstrap.method,
    comparison.primary.bootstrap.lower,
    comparison.primary.bootstrap.upper,
    "",
    comparison.primary.bootstrap.status,
    "",
    "",
    "",
    comparison.primary.bootstrap.seed_fingerprint,
  ]);
  rows.push([
    "statistic",
    "exact_family_sign_flip",
    comparison.primary.family_sign_flip.method,
    comparison.primary.family_sign_flip.nonzero_family_deltas,
    comparison.primary.family_sign_flip.enumerations,
    comparison.primary.family_sign_flip.p_value,
    comparison.primary.family_sign_flip.status,
    "",
    "",
    comparison.primary.family_sign_flip.alpha,
    comparison.primary.family_sign_flip.significant,
  ]);
  rows.push([
    "diagnostic",
    "exact_raw_pair_mcnemar",
    "paired_binary_not_used_for_verdict",
    comparison.diagnostics.mcnemar.baseline_only,
    comparison.diagnostics.mcnemar.candidate_only,
    comparison.diagnostics.mcnemar.p_value,
    comparison.diagnostics.mcnemar.status,
    "",
    "",
    comparison.diagnostics.mcnemar.alpha,
    comparison.diagnostics.mcnemar.significant,
  ]);
  for (const entry of comparison.rates) {
    rows.push([
      "rate",
      entry.id,
      entry.pair_scope,
      entry.baseline_rate,
      entry.candidate_rate,
      entry.delta,
      "",
      entry.availability,
      "",
      "",
      entry.applicable_pairs,
    ]);
  }
  for (const entry of comparison.count_metrics) {
    rows.push([
      "count_metric",
      entry.id,
      entry.unit,
      entry.baseline_mean,
      entry.candidate_mean,
      entry.delta,
      "",
      entry.availability,
      "",
      "",
      entry.applicable_pairs,
    ]);
  }
  for (const [key, dimension] of [
    ["by_family", "family"],
    ["by_category", "category"],
    ["by_risk", "risk"],
  ]) {
    for (const entry of comparison.breakdowns[key]) {
      rows.push([
        "breakdown",
        entry.id,
        dimension,
        entry.baseline_rate,
        entry.candidate_rate,
        entry.delta,
        "",
        "available",
        "",
        "",
        entry.complete_pairs,
      ]);
    }
  }
  for (const entry of comparison.guardrails) {
    rows.push([
      "guardrail",
      entry.id,
      "policy",
      "",
      "",
      entry.observed,
      entry.status,
      entry.observed === null ? "unavailable" : "available",
      entry.operator,
      entry.threshold,
      "",
    ]);
  }
  for (const pair of report.pairs) {
    rows.push([
      "pair",
      pair.pair_id,
      `${pair.identity.family_id}:${pair.identity.semantic_variant_id}:t${pair.identity.trajectory_repetition}`,
      pair.baseline.whole_task_success,
      pair.candidate.whole_task_success,
      "",
      pair.complete ? "complete" : "incomplete",
      "",
      "",
      "",
      pair.order.join(" then "),
    ]);
  }
  return rows;
}

function renderCsvUnchecked(report, comparison) {
  return `${csvRows(report, comparison)
    .map((row) => row.map(encodeSyntheticComparisonCsvCell).join(","))
    .join("\n")}\n`;
}

export function renderSyntheticComparisonCsv({
  report,
  comparison,
  policy,
} = {}) {
  validateSyntheticComparisonReport(comparison, { report, policy });
  return renderCsvUnchecked(report, comparison);
}

function sha256Bytes(contents) {
  return `sha256:${createHash("sha256").update(contents, "utf8").digest("hex")}`;
}

function immutableEntries(report, comparison, paths) {
  return [
    {
      id: "comparison-json",
      path: paths.json,
      contents: `${JSON.stringify(comparison, null, 2)}\n`,
    },
    {
      id: "comparison-markdown",
      path: paths.markdown,
      contents: renderMarkdownUnchecked(report, comparison),
    },
    {
      id: "comparison-csv",
      path: paths.csv,
      contents: renderCsvUnchecked(report, comparison),
    },
  ];
}

function reconcileImmutableFiles(entries, { root }) {
  for (const entry of entries) {
    if (!fs.existsSync(entry.path)) continue;
    assertConfinedExistingPath(root, entry.path, { type: "file" });
    expect(
      fs.readFileSync(entry.path, "utf8") === entry.contents,
      "SYNTHETIC_COMPARISON_ARTIFACT_DIVERGENCE",
      "immutable comparison artifact bytes differ from the existing run",
    );
  }
  for (const entry of entries) {
    if (!fs.existsSync(entry.path)) {
      atomicWriteImmutable(entry.path, entry.contents, { basePath: root });
    }
  }
}

export function publishSyntheticComparisonArtifacts({
  sourceRoot,
  contractSourceRoot = sourceRoot,
  report,
  comparison,
  policy,
  relativeRoot = DEFAULT_SYNTHETIC_ARTIFACT_ROOT,
  beforeMarker = null,
} = {}) {
  validateSyntheticRunReportSourceBinding(report, {
    sourceRoot: contractSourceRoot,
  });
  validateSyntheticComparisonReport(comparison, { report, policy });
  expect(
    typeof beforeMarker === "function" || beforeMarker === null,
    "SYNTHETIC_COMPARISON_ARTIFACT_HOOK",
    "beforeMarker must be a function or null",
  );
  assertPortableContractPath(relativeRoot, "relativeRoot");
  const root = fs.realpathSync.native(path.resolve(sourceRoot));
  expect(
    root === path.resolve(sourceRoot),
    "SYNTHETIC_COMPARISON_ARTIFACT_ROOT",
    "sourceRoot must be physically canonical",
  );
  const artifactRoot = resolveInside(root, ...relativeRoot.split("/"));
  ensureConfinedDirectory(root, artifactRoot);
  const runsRoot = resolveInside(artifactRoot, "runs");
  ensureConfinedDirectory(root, runsRoot);
  const runDirectory = resolveIdPath(runsRoot, comparison.source.run_id);
  ensureConfinedDirectory(root, runDirectory);
  const paths = {
    json: resolveInside(runDirectory, "comparison.json"),
    markdown: resolveInside(runDirectory, "comparison.md"),
    csv: resolveInside(runDirectory, "summary.csv"),
    completion: resolveInside(runDirectory, "comparison-completion.json"),
    latest: resolveInside(artifactRoot, "latest-comparison.json"),
    lock: resolveInside(artifactRoot, ".publish.lock"),
  };
  const entries = immutableEntries(report, comparison, paths);
  const comparisonFingerprint = fingerprint(comparison);
  const completion = Object.freeze({
    schema_version: SYNTHETIC_COMPARISON_ARTIFACT_VERSION,
    artifact_kind: "synthetic-comparison-completion",
    run_id: comparison.source.run_id,
    run_report_fingerprint: comparison.source.run_report_fingerprint,
    comparison_policy_fingerprint: comparison.source.comparison_policy_fingerprint,
    comparison_fingerprint: comparisonFingerprint,
    created_at: report.created_at,
    files: Object.freeze(entries.map((entry) => Object.freeze({
      id: entry.id,
      fingerprint: sha256Bytes(entry.contents),
    }))),
  });
  const latest = Object.freeze({
    schema_version: SYNTHETIC_COMPARISON_ARTIFACT_VERSION,
    pointer_kind: "synthetic-comparison-latest",
    run_id: comparison.source.run_id,
    comparison_fingerprint: comparisonFingerprint,
    completion_path: `runs/${comparison.source.run_id}/comparison-completion.json`,
    created_at: report.created_at,
  });
  return withExclusiveLock(paths.lock, () => {
    const completionExists = fs.existsSync(paths.completion);
    if (comparison.source.suite_complete) {
      if (completionExists) {
        assertConfinedExistingPath(root, paths.completion, { type: "file" });
        expect(
          canonicalJson(JSON.parse(fs.readFileSync(paths.completion, "utf8")))
            === canonicalJson(completion),
          "SYNTHETIC_COMPARISON_ARTIFACT_DIVERGENCE",
          "comparison completion marker differs from the existing run",
        );
      }
      reconcileImmutableFiles(entries, { root });
      if (!completionExists) {
        beforeMarker?.({ markerPath: paths.completion });
        atomicWriteJson(paths.completion, completion, {
          immutable: true,
          basePath: root,
        });
      }
      atomicWriteJson(paths.latest, latest, { basePath: root });
    } else {
      expect(
        !completionExists,
        "SYNTHETIC_COMPARISON_ARTIFACT_COMPLETION",
        "incomplete comparison must not have a completion marker",
      );
      reconcileImmutableFiles(entries, { root });
    }
    return Object.freeze({
      status: comparison.source.suite_complete ? "published" : "incomplete-uncommitted",
      comparison_fingerprint: comparisonFingerprint,
      files: Object.freeze({
        json: `${relativeRoot}/runs/${comparison.source.run_id}/comparison.json`,
        markdown: `${relativeRoot}/runs/${comparison.source.run_id}/comparison.md`,
        csv: `${relativeRoot}/runs/${comparison.source.run_id}/summary.csv`,
        completion: comparison.source.suite_complete
          ? `${relativeRoot}/runs/${comparison.source.run_id}/comparison-completion.json`
          : null,
        latest: comparison.source.suite_complete
          ? `${relativeRoot}/latest-comparison.json`
          : null,
      }),
    });
  }, { basePath: root });
}
