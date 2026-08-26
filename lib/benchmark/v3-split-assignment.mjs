import { createHash } from "node:crypto";

import { canonicalJson, fingerprint } from "../feedback/contracts.mjs";

// The third allocation is a public exclusion reserve, never a confirmatory
// split.  Keeping its identities committed prevents accidental reuse while the
// real holdout remains external and is created only after candidate freeze.
const SPLITS = Object.freeze(["development", "validation", "reserved"]);

function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function deviation(values) {
  const center = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - center) ** 2)));
}
function hash(seed, ...parts) {
  return createHash("sha256").update([seed, ...parts].join("\0")).digest("hex");
}
function numericDistribution(entries, field) {
  const all = entries.map((entry) => entry[field]);
  const center = mean(all);
  const scale = deviation(all);
  return Object.freeze(Object.fromEntries(SPLITS.map((split) => {
    const splitMean = mean(entries.filter((entry) => entry.split === split).map((entry) => entry[field]));
    return [split, Object.freeze({ mean: splitMean, standardized_mean_deviation: scale === 0 ? 0 : Math.abs(splitMean - center) / scale })];
  })));
}
function runtimeDistribution(entries) {
  const versions = [...new Set(entries.map((entry) => entry.runtime_version))].sort();
  const overall = new Map(versions.map((version) => [version, entries.filter((entry) => entry.runtime_version === version).length / entries.length]));
  return Object.freeze(Object.fromEntries(SPLITS.map((split) => {
    const subset = entries.filter((entry) => entry.split === split);
    const totalVariation = versions.reduce((sum, version) => (
      sum + Math.abs(subset.filter((entry) => entry.runtime_version === version).length / subset.length - overall.get(version))
    ), 0) / 2;
    return [split, Object.freeze({ total_variation_distance: totalVariation })];
  })));
}

function quantileLabelings() {
  const values = [];
  for (let firstDevelopment = 0; firstDevelopment < 7; firstDevelopment += 1) {
    for (let secondDevelopment = firstDevelopment + 1; secondDevelopment < 7; secondDevelopment += 1) {
      const remaining = Array.from({ length: 7 }, (_, index) => index)
        .filter((index) => index !== firstDevelopment && index !== secondDevelopment);
      for (let firstValidation = 0; firstValidation < remaining.length; firstValidation += 1) {
        for (let secondValidation = firstValidation + 1; secondValidation < remaining.length; secondValidation += 1) {
          const labels = Array(7).fill("reserved");
          labels[firstDevelopment] = "development";
          labels[secondDevelopment] = "development";
          labels[remaining[firstValidation]] = "validation";
          labels[remaining[secondValidation]] = "validation";
          values.push(Object.freeze(labels));
        }
      }
    }
  }
  return Object.freeze(values);
}
const QUANTILE_LABELINGS = quantileLabelings();

function partialBalanceScore(assigned, population) {
  const numeric = ["patch_size_bytes", "file_count", "commit_age_rank"];
  const centers = Object.fromEntries(numeric.map((field) => [field, mean(population.map((entry) => entry[field]))]));
  const scales = Object.fromEntries(numeric.map((field) => [field, deviation(population.map((entry) => entry[field])) || 1]));
  const versions = [...new Set(population.map((entry) => entry.runtime_version))];
  const proportions = Object.fromEntries(versions.map((version) => [version,
    population.filter((entry) => entry.runtime_version === version).length / population.length]));
  let score = 0;
  for (const split of SPLITS) {
    const subset = assigned.filter((entry) => entry.split === split);
    for (const field of numeric) score += ((mean(subset.map((entry) => entry[field])) - centers[field]) / scales[field]) ** 2;
    const runtimeDistance = versions.reduce((sum, version) => (
      sum + Math.abs(subset.filter((entry) => entry.runtime_version === version).length / subset.length - proportions[version])
    ), 0) / 2;
    score += 16 * runtimeDistance ** 2;
  }
  return score;
}

export function assignBenchmarkV3Splits(entries, seed) {
  if (!Array.isArray(entries) || entries.length !== 210 || typeof seed !== "string" || seed.length === 0) {
    throw new Error("BENCHMARK_V3_SPLIT_ASSIGNMENT: input is invalid");
  }
  const assigned = [];
  for (const stratum of ["small", "medium", "high"]) {
    const stratumEntries = entries.filter((entry) => entry.stratum === stratum)
      .sort((left, right) => left.complexity_score - right.complexity_score || left.source_commit.localeCompare(right.source_commit));
    if (stratumEntries.length !== 70) throw new Error(`BENCHMARK_V3_SPLIT_ASSIGNMENT: ${stratum} count is invalid`);
    for (let offset = 0; offset < stratumEntries.length; offset += 7) {
      const quantileIndex = offset / 7;
      const quantile = stratumEntries.slice(offset, offset + 7)
        .sort((left, right) => hash(seed, stratum, quantileIndex, left.source_commit)
          .localeCompare(hash(seed, stratum, quantileIndex, right.source_commit)));
      const candidates = QUANTILE_LABELINGS.map((labels) => {
        const additions = quantile.map((entry, index) => Object.freeze({
          ...entry, split: labels[index], complexity_quantile: quantileIndex + 1,
        }));
        return Object.freeze({ additions, score: partialBalanceScore([...assigned, ...additions], entries),
          tie: hash(seed, stratum, quantileIndex, ...additions.map((entry) => `${entry.source_commit}:${entry.split}`)) });
      }).sort((left, right) => left.score - right.score || left.tie.localeCompare(right.tie));
      assigned.push(...candidates[0].additions);
    }
  }
  const quantileCounts = Object.fromEntries(["small", "medium", "high"].flatMap((stratum) => (
    Array.from({ length: 10 }, (_, index) => {
      const key = `${stratum}-q${index + 1}`;
      const subset = assigned.filter((entry) => entry.stratum === stratum && entry.complexity_quantile === index + 1);
      return [key, Object.fromEntries(SPLITS.map((split) => [split, subset.filter((entry) => entry.split === split).length]))];
    })
  )));
  const distribution = Object.freeze({
    complexity_quantiles: Object.freeze(quantileCounts),
    complexity_score: numericDistribution(assigned, "complexity_score"),
    patch_size_bytes: numericDistribution(assigned, "patch_size_bytes"),
    file_count: numericDistribution(assigned, "file_count"),
    commit_age_rank: numericDistribution(assigned, "commit_age_rank"),
    runtime_version: runtimeDistribution(assigned),
  });
  const body = Object.freeze({
    schema_version: 1,
    algorithm: "frozen-seeded-development-validation-reserve-v2",
    corpus_generation_seed: seed,
    quantile_size: 7,
    entries: Object.freeze(assigned.sort((left, right) => left.source_commit.localeCompare(right.source_commit))),
    distribution,
  });
  return Object.freeze({ ...body, assignment_fingerprint: fingerprint(body) });
}

export function verifyBenchmarkV3SplitDistribution(assignment) {
  const invalid = (reason) => Object.freeze({ passed: false, reason });
  if (assignment === null || typeof assignment !== "object" || !Array.isArray(assignment.entries)
    || assignment.entries.length !== 210 || typeof assignment.corpus_generation_seed !== "string") return invalid("assignment-shape");
  const entryKeys = ["commit_age_rank", "committed_at", "complexity_quantile", "complexity_score", "file_count",
    "patch_size_bytes", "runtime_version", "source_commit", "split", "stratum"];
  const validEntries = assignment.entries.every((entry) => entry !== null && typeof entry === "object"
    && canonicalJson(Object.keys(entry).sort()) === canonicalJson(entryKeys)
    && /^[0-9a-f]{40}$/u.test(entry.source_commit) && ["small", "medium", "high"].includes(entry.stratum)
    && SPLITS.includes(entry.split) && Number.isInteger(entry.complexity_quantile)
    && entry.complexity_quantile >= 1 && entry.complexity_quantile <= 10
    && ["complexity_score", "patch_size_bytes", "file_count", "committed_at", "commit_age_rank"]
      .every((field) => Number.isSafeInteger(entry[field]) && entry[field] >= 0)
    && typeof entry.runtime_version === "string" && entry.runtime_version.length > 0);
  if (!validEntries || new Set(assignment.entries.map((entry) => entry.source_commit)).size !== 210) return invalid("assignment-entries");
  const inputs = assignment.entries.map(({ split: _split, complexity_quantile: _quantile, ...entry }) => entry);
  let replay;
  try { replay = assignBenchmarkV3Splits(inputs, assignment.corpus_generation_seed); } catch { return invalid("assignment-replay"); }
  const { assignment_fingerprint: _claimedFingerprint, ...claimedBody } = assignment;
  if (assignment.algorithm !== replay.algorithm || assignment.quantile_size !== replay.quantile_size
    || assignment.assignment_fingerprint !== fingerprint(claimedBody)
    || assignment.assignment_fingerprint !== replay.assignment_fingerprint
    || canonicalJson(assignment.entries) !== canonicalJson(replay.entries)
    || canonicalJson(assignment.distribution) !== canonicalJson(replay.distribution)) return invalid("assignment-replay-mismatch");
  const exactQuantiles = Object.values(replay.distribution.complexity_quantiles).every((counts) => (
    counts.development === 2 && counts.validation === 2 && counts.reserved === 3
  ));
  const numericMaximums = Object.fromEntries(["complexity_score", "patch_size_bytes", "file_count", "commit_age_rank"].map((field) => [
    field,
    Math.max(...Object.values(replay.distribution[field]).map((entry) => entry.standardized_mean_deviation)),
  ]));
  const runtimeMaximum = Math.max(...Object.values(replay.distribution.runtime_version).map((entry) => entry.total_variation_distance));
  const passed = exactQuantiles
    && numericMaximums.complexity_score <= 0.2
    && numericMaximums.patch_size_bytes <= 0.35
    && numericMaximums.file_count <= 0.35
    && numericMaximums.commit_age_rank <= 0.35
    && runtimeMaximum <= 0.25;
  return Object.freeze({ passed, exact_complexity_quantile_balance: exactQuantiles,
    maximum_standardized_mean_deviation: Object.freeze(numericMaximums), maximum_runtime_total_variation_distance: runtimeMaximum });
}
