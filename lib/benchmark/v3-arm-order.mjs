import { ContractError, canonicalJson, fingerprint } from "../feedback/contracts.mjs";

const FP = /^sha256:[0-9a-f]{64}$/u;
const SPLITS = Object.freeze(["development", "validation", "holdout"]);
const STRATA = Object.freeze(["small", "medium", "high"]);

function fail(code, message) { throw new ContractError(code, message); }
function expect(condition, code, message) { if (!condition) fail(code, message); }
function exact(value, keys, label) {
  expect(value && typeof value === "object" && !Array.isArray(value)
    && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()),
  "BENCHMARK_V3_ARM_ORDER_SHAPE", `${label} shape is invalid`);
}

export function validateBenchmarkV3ArmOrderPolicy(policy) {
  exact(policy, ["schema_version", "algorithm", "seed", "development", "validation", "holdout"], "arm order policy");
  expect(policy.schema_version === 1 && policy.algorithm === "stratum-balanced-hash-rank-v1"
    && policy.seed === "benchmark-v3-frozen-arm-order-2026-08-27",
  "BENCHMARK_V3_ARM_ORDER_POLICY", "arm order algorithm or seed is invalid");
  exact(policy.development, ["mode", "reason"], "arm order policy.development");
  exact(policy.validation, ["mode", "balance_unit"], "arm order policy.validation");
  exact(policy.holdout, ["mode", "balance_unit"], "arm order policy.holdout");
  expect(policy.development.mode === "baseline-first"
    && policy.development.reason === "opportunity-gate-before-candidate"
    && policy.validation.mode === "balanced-counterbalanced"
    && policy.validation.balance_unit === "within-stratum"
    && policy.holdout.mode === "balanced-counterbalanced"
    && policy.holdout.balance_unit === "within-stratum",
  "BENCHMARK_V3_ARM_ORDER_POLICY", "split arm order policy is invalid");
  return Object.freeze({ policy_fingerprint: fingerprint(policy) });
}

export function buildBenchmarkV3ArmOrderSchedule({ policy, split, families }) {
  const validation = validateBenchmarkV3ArmOrderPolicy(policy);
  expect(SPLITS.includes(split) && Array.isArray(families) && families.length > 0,
    "BENCHMARK_V3_ARM_ORDER_ARGUMENT", "split or families are invalid");
  const normalized = families.map((family) => {
    exact(family, ["family_id", "stratum"], "schedule family");
    expect(typeof family.family_id === "string" && family.family_id.length > 0 && STRATA.includes(family.stratum),
      "BENCHMARK_V3_ARM_ORDER_ARGUMENT", "schedule family identity is invalid");
    return Object.freeze({ family_id: family.family_id, stratum: family.stratum });
  });
  expect(new Set(normalized.map((entry) => entry.family_id)).size === normalized.length,
    "BENCHMARK_V3_ARM_ORDER_ARGUMENT", "schedule family identities are duplicated");
  const mode = policy[split].mode;
  const orders = new Map();
  if (mode === "baseline-first") {
    for (const family of normalized) orders.set(family.family_id, "baseline-first");
  } else {
    for (const stratum of STRATA) {
      const members = normalized.filter((entry) => entry.stratum === stratum)
        .sort((left, right) => fingerprint({ algorithm: policy.algorithm, seed: policy.seed, split,
          stratum, family_id: left.family_id }).localeCompare(fingerprint({ algorithm: policy.algorithm,
          seed: policy.seed, split, stratum, family_id: right.family_id })) || left.family_id.localeCompare(right.family_id));
      expect(members.length > 0 && members.length % 2 === 0,
        "BENCHMARK_V3_ARM_ORDER_BALANCE", `${split}.${stratum} must have an even positive family count`);
      members.forEach((family, index) => orders.set(family.family_id,
        index < members.length / 2 ? "baseline-first" : "candidate-first"));
    }
  }
  const entries = normalized.map((family, index) => {
    const order = orders.get(family.family_id);
    const body = { family_id: family.family_id, stratum: family.stratum, position: index + 1,
      order, arms: order === "baseline-first" ? ["baseline", "candidate"] : ["candidate", "baseline"] };
    return Object.freeze({ ...body, entry_fingerprint: fingerprint(body) });
  });
  if (mode === "balanced-counterbalanced") {
    for (const stratum of STRATA) {
      const members = entries.filter((entry) => entry.stratum === stratum);
      expect(members.filter((entry) => entry.order === "baseline-first").length === members.length / 2
        && members.filter((entry) => entry.order === "candidate-first").length === members.length / 2,
      "BENCHMARK_V3_ARM_ORDER_BALANCE", `${split}.${stratum} is not balanced`);
    }
  }
  const body = { schema_version: 1, split, mode, algorithm: policy.algorithm, seed: policy.seed,
    policy_fingerprint: validation.policy_fingerprint, entries };
  return Object.freeze({ ...body, schedule_fingerprint: fingerprint(body) });
}

export function validateBenchmarkV3ArmOrderSchedule(schedule, { policy, split, families }) {
  const expected = buildBenchmarkV3ArmOrderSchedule({ policy, split, families });
  expect(canonicalJson(schedule) === canonicalJson(expected), "BENCHMARK_V3_ARM_ORDER_STALE",
    "arm order schedule differs from the frozen deterministic schedule");
  expect(FP.test(schedule.schedule_fingerprint), "BENCHMARK_V3_ARM_ORDER_STALE", "schedule fingerprint is invalid");
  return expected;
}
