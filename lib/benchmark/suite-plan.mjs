import { createHash } from "node:crypto";

import {
  ContractError,
  fingerprint,
} from "../feedback/contracts.mjs";
import { renderSyntheticInstance } from "./renderer.mjs";

export const SYNTHETIC_PAIRING_VERSION = 4;
export const SYNTHETIC_SUITE_PLAN_VERSION = 1;

const SAFE_ID = /^(?!(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$)(?!.*\.$)[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/iu;

function fail(code, message) {
  throw new ContractError(code, message);
}

function expect(condition, code, message) {
  if (!condition) fail(code, message);
}

function safeId(value, label) {
  expect(typeof value === "string" && SAFE_ID.test(value), "SYNTHETIC_SUITE_PLAN_ID", `${label} is invalid`);
  return value;
}

function syntheticPairingDigest(domain, ...values) {
  const hash = createHash("sha256")
    .update(`synthetic-pairing-v${SYNTHETIC_PAIRING_VERSION}:${domain}`, "utf8");
  for (const value of values) {
    hash.update("\0");
    hash.update(String(value), "utf8");
  }
  return hash.digest("hex");
}

export function syntheticPairIdentity(instance) {
  return Object.freeze({
    family_id: instance.family_id,
    category: instance.category,
    risk: instance.risk,
    source_class: instance.source_class,
    semantic_variant_id: instance.semantic_variant_id,
    semantic_variant_fingerprint: instance.semantic_variant_fingerprint,
    trajectory_id: instance.trajectory_id,
    trajectory_fingerprint: instance.trajectory_fingerprint,
    generated_fixture_fingerprint: instance.generated_fixture_fingerprint,
    trajectory_repetition: instance.repetition,
  });
}

export function syntheticPairId(identity) {
  return fingerprint({
    schema: "synthetic-pair-identity-v2",
    family_id: identity.family_id,
    semantic_variant_id: identity.semantic_variant_id,
    semantic_variant_fingerprint: identity.semantic_variant_fingerprint,
    trajectory_id: identity.trajectory_id,
    trajectory_fingerprint: identity.trajectory_fingerprint,
    generated_fixture_fingerprint: identity.generated_fixture_fingerprint,
    trajectory_repetition: identity.trajectory_repetition,
  });
}

export function counterbalancedProfileSchedule({
  seed,
  suiteId,
  instances,
  baselineProfileId,
  candidateProfileId,
} = {}) {
  safeId(seed, "seed");
  safeId(suiteId, "suiteId");
  expect(
    Array.isArray(instances) && instances.length >= 1 && instances.length <= 160,
    "SYNTHETIC_COUNTERBALANCE",
    "instances must be a bounded non-empty array",
  );
  safeId(baselineProfileId, "baselineProfileId");
  safeId(candidateProfileId, "candidateProfileId");
  expect(baselineProfileId !== candidateProfileId, "SYNTHETIC_COUNTERBALANCE", "paired profiles must differ");
  const ordered = instances.map((instance) => {
    expect(instance?.seed === seed, "SYNTHETIC_COUNTERBALANCE", "instance seed differs from the suite seed");
    safeId(instance.family_id, "instance.family_id");
    expect(
      Number.isSafeInteger(instance.repetition)
        && instance.repetition >= 1
        && instance.repetition <= 5,
      "SYNTHETIC_COUNTERBALANCE",
      "instance repetition is invalid",
    );
    const pairId = syntheticPairId(syntheticPairIdentity(instance));
    return {
      pair_id: pairId,
      digest: syntheticPairingDigest(
        "pair-permutation",
        seed,
        suiteId,
        instance.family_id,
        instance.semantic_variant_fingerprint,
        instance.trajectory_fingerprint,
      ),
    };
  });
  expect(
    new Set(ordered.map((entry) => entry.pair_id)).size === ordered.length,
    "SYNTHETIC_COUNTERBALANCE",
    "suite schedule contains duplicate pair identities",
  );
  ordered.sort((left, right) => (
    left.digest.localeCompare(right.digest) || left.pair_id.localeCompare(right.pair_id)
  ));
  const baselineStarts = Number.parseInt(
    syntheticPairingDigest("suite-start-role", seed, suiteId).slice(0, 2),
    16,
  ) % 2 === 0;
  return Object.freeze(ordered.map((entry, index) => {
    const baselineFirst = index % 2 === 0 ? baselineStarts : !baselineStarts;
    return Object.freeze({
      pair_id: entry.pair_id,
      order: Object.freeze(
        baselineFirst
          ? [baselineProfileId, candidateProfileId]
          : [candidateProfileId, baselineProfileId],
      ),
    });
  }));
}

export function validateSyntheticSuiteProfilePair({
  contracts,
  suiteId,
  baselineProfileId,
  candidateProfileId,
} = {}) {
  safeId(suiteId, "suiteId");
  safeId(baselineProfileId, "baselineProfileId");
  safeId(candidateProfileId, "candidateProfileId");
  const suite = contracts?.suites?.find((entry) => entry.id === suiteId);
  expect(suite !== undefined, "SYNTHETIC_SUITE_PLAN_SUITE", `unknown suite ${suiteId}`);
  expect(suite.profile_ids.includes(baselineProfileId), "SYNTHETIC_SUITE_PLAN_PROFILE", "baseline profile is not in the suite");
  expect(suite.profile_ids.includes(candidateProfileId), "SYNTHETIC_SUITE_PLAN_PROFILE", "candidate profile is not in the suite");
  expect(baselineProfileId !== candidateProfileId, "SYNTHETIC_SUITE_PLAN_PROFILE", "paired profiles must differ");
  return suite;
}

export function buildSyntheticSuitePlan({
  contracts,
  templateSet,
  suiteId,
  seed,
  baselineProfileId,
  candidateProfileId,
} = {}) {
  safeId(seed, "seed");
  const suite = validateSyntheticSuiteProfilePair({
    contracts,
    suiteId,
    baselineProfileId,
    candidateProfileId,
  });
  const instances = Object.freeze(suite.family_ids.flatMap((familyId) => (
    Array.from({ length: suite.semantic_variants }, (_, semanticIndex) => (
      Array.from({ length: suite.trajectory_repetitions }, (_, trajectoryIndex) => renderSyntheticInstance({
        contracts,
        templateSet,
        familyId,
        seed,
        semanticVariantIndex: semanticIndex + 1,
        repetition: trajectoryIndex + 1,
      }))
    )).flat()
  )));
  const schedule = counterbalancedProfileSchedule({
    seed,
    suiteId: suite.id,
    instances,
    baselineProfileId,
    candidateProfileId,
  });
  const instanceByPairId = new Map(instances.map((instance) => [
    syntheticPairId(syntheticPairIdentity(instance)),
    instance,
  ]));
  const generationFingerprint = fingerprint({
    schema: `synthetic-suite-plan-v${SYNTHETIC_SUITE_PLAN_VERSION}`,
    suite_id: suite.id,
    suite_manifest_fingerprint: contracts.fingerprints.suites,
    template_set_fingerprint: fingerprint(templateSet),
    comparison_policy_fingerprint: contracts.fingerprints.comparison_policy,
    profile_inventory_fingerprint: contracts.fingerprints.inventory,
    seed,
    semantic_variants: suite.semantic_variants,
    trajectory_repetitions: suite.trajectory_repetitions,
    baseline_profile_id: baselineProfileId,
    candidate_profile_id: candidateProfileId,
    schedule,
  });
  return Object.freeze({
    version: SYNTHETIC_SUITE_PLAN_VERSION,
    generation_id: `generation-${generationFingerprint.slice("sha256:".length, "sha256:".length + 24)}`,
    suite,
    instances,
    schedule,
    instance_by_pair_id: instanceByPairId,
  });
}

export function projectSyntheticSuitePlanFamily(plan, familyId) {
  safeId(familyId, "familyId");
  expect(plan?.suite?.family_ids?.includes(familyId), "SYNTHETIC_SUITE_PLAN_FAMILY", "family is not in the suite");
  const pairIds = new Set(plan.instances
    .filter((instance) => instance.family_id === familyId)
    .map((instance) => syntheticPairId(syntheticPairIdentity(instance))));
  const schedule = Object.freeze(plan.schedule.filter((entry) => pairIds.has(entry.pair_id)));
  expect(schedule.length === pairIds.size && schedule.length > 0, "SYNTHETIC_SUITE_PLAN_FAMILY", "family projection is incomplete");
  return Object.freeze({
    family_id: familyId,
    schedule,
    pair_ids: Object.freeze(schedule.map((entry) => entry.pair_id)),
  });
}
