import { ContractError, assertSafeId, canonicalJson, fingerprint } from "../feedback/contracts.mjs";
import { validateBenchmarkV3CandidateBudget, validateBenchmarkV3Design } from "./v3-design.mjs";

const FP = /^sha256:[0-9a-f]{64}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const STAGES = Object.freeze(["acceptance", "development", "validation", "holdout"]);
const EVENT_TYPES = new Set(["acceptance-probe", "infrastructure-failure-before-scoring", "development-execution", "validation-execution", "holdout-execution"]);
const METRIC_KEYS = Object.freeze([
  "paired_delta", "new_critical_regressions", "new_unclassified_semantic_regressions", "new_high_medium_upper_ci", "small_delta_lower_ci",
  "timeout_delta", "median_duration_ratio", "mean_duration_ratio", "activation_rate",
  "candidate_tokens", "duration_ms", "candidate_attempt_count", "retried_family_count",
]);

function fail(code, message) { throw new ContractError(code, message); }
function expect(condition, code, message) { if (!condition) fail(code, message); }
function exact(value, keys, label) {
  expect(value && typeof value === "object" && !Array.isArray(value), "BENCHMARK_V3_LEDGER_SHAPE", `${label} must be an object`);
  expect(canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()), "BENCHMARK_V3_LEDGER_SHAPE", `${label} keys are invalid`);
}
function seal(source) {
  const { ledger_fingerprint: _stale, ...current } = source;
  return Object.freeze({ ...current, ledger_fingerprint: fingerprint(current) });
}
function finite(value, label) { expect(typeof value === "number" && Number.isFinite(value), "BENCHMARK_V3_LEDGER_VALUE", `${label} is invalid`); }

function validateRegistration(registration, index) {
  exact(registration, ["candidate_id", "architecture_fingerprint", "product_bundle_fingerprint", "source_sha", "registered_before_baseline", "development_execution_count"], `registrations[${index}]`);
  assertSafeId(registration.candidate_id, `registrations[${index}].candidate_id`);
  expect(FP.test(registration.architecture_fingerprint) && FP.test(registration.product_bundle_fingerprint)
    && SHA.test(registration.source_sha) && registration.registered_before_baseline === true
    && registration.development_execution_count === 0, "BENCHMARK_V3_LEDGER_REGISTRATION", "candidate registration is invalid");
  return Object.freeze({ ...registration });
}

function validateMetrics(metrics, label) {
  exact(metrics, METRIC_KEYS, label);
  for (const key of METRIC_KEYS) finite(metrics[key], `${label}.${key}`);
  expect(Number.isSafeInteger(metrics.new_critical_regressions) && metrics.new_critical_regressions >= 0
    && Number.isSafeInteger(metrics.new_unclassified_semantic_regressions) && metrics.new_unclassified_semantic_regressions >= 0
    && Number.isSafeInteger(metrics.candidate_tokens) && metrics.candidate_tokens >= 0
    && Number.isSafeInteger(metrics.candidate_attempt_count) && metrics.candidate_attempt_count >= 0
    && Number.isSafeInteger(metrics.retried_family_count) && metrics.retried_family_count >= 0
    && metrics.duration_ms >= 0 && metrics.activation_rate >= 0 && metrics.activation_rate <= 1,
  "BENCHMARK_V3_LEDGER_VALUE", `${label} bounded metrics are invalid`);
  return Object.freeze({ ...metrics });
}

function validateEvent(event, index) {
  exact(event, [
    "event_id", "event_type", "candidate_id", "attempt_id", "retry_of_attempt_id", "stage",
    "source_sha", "model", "provider", "variant", "seed", "bindings_fingerprint",
    "architecture_fingerprint", "product_bundle_fingerprint", "scored_outcome", "status",
    "result_fingerprint", "metrics",
  ], `events[${index}]`);
  for (const key of ["event_id", "candidate_id", "attempt_id", "model", "provider", "variant", "seed", "status"]) assertSafeId(event[key], `events[${index}].${key}`);
  if (event.retry_of_attempt_id !== null) assertSafeId(event.retry_of_attempt_id, `events[${index}].retry_of_attempt_id`);
  expect(EVENT_TYPES.has(event.event_type) && STAGES.includes(event.stage), "BENCHMARK_V3_LEDGER_EVENT", "event type or stage is invalid");
  expect(SHA.test(event.source_sha) && FP.test(event.bindings_fingerprint) && FP.test(event.architecture_fingerprint) && FP.test(event.product_bundle_fingerprint), "BENCHMARK_V3_LEDGER_EVENT", "event binding is invalid");
  const expectedStage = { "acceptance-probe": "acceptance", "development-execution": "development", "validation-execution": "validation", "holdout-execution": "holdout" }[event.event_type];
  if (expectedStage !== undefined) expect(event.stage === expectedStage, "BENCHMARK_V3_LEDGER_STAGE", "event type is mislabeled");
  if (event.event_type === "infrastructure-failure-before-scoring") {
    expect(event.scored_outcome === false && event.status === "infrastructure-failure" && event.result_fingerprint === null && event.metrics === null,
      "BENCHMARK_V3_LEDGER_INFRASTRUCTURE", "infrastructure failure cannot carry a scored result");
  } else if (event.event_type === "acceptance-probe") {
    expect(event.scored_outcome === false && ["accepted", "rejected"].includes(event.status) && FP.test(event.result_fingerprint) && event.metrics === null,
      "BENCHMARK_V3_LEDGER_ACCEPTANCE", "acceptance probe is invalid");
  } else {
    expect(event.scored_outcome === true && event.status === "scored" && FP.test(event.result_fingerprint), "BENCHMARK_V3_LEDGER_SCORING", "execution event lacks a bound scored result");
    validateMetrics(event.metrics, `events[${index}].metrics`);
  }
  return Object.freeze({ ...event, metrics: event.metrics === null ? null : Object.freeze({ ...event.metrics }) });
}

function stageEvents(events, candidateId, stage) { return events.filter((event) => event.candidate_id === candidateId && event.stage === stage); }

function validateState(state, design) {
  validateBenchmarkV3Design(design);
  exact(state, ["schema_version", "design_fingerprint", "campaign_fingerprint", "registrations", "events", "selected_candidate_id", "final_candidate_sha", "ledger_fingerprint"], "ledger");
  expect(state.schema_version === 2 && FP.test(state.design_fingerprint) && FP.test(state.campaign_fingerprint), "BENCHMARK_V3_LEDGER_STATE", "ledger header is invalid");
  const { ledger_fingerprint: declared, ...source } = state;
  expect(declared === fingerprint(source), "BENCHMARK_V3_LEDGER_STATE", "ledger fingerprint is stale");
  const registrations = state.registrations.map(validateRegistration);
  validateBenchmarkV3CandidateBudget(design, registrations);
  const registrationById = new Map(registrations.map((entry) => [entry.candidate_id, entry]));
  const events = state.events.map(validateEvent);
  expect(new Set(events.map((entry) => entry.event_id)).size === events.length && new Set(events.map((entry) => entry.attempt_id)).size === events.length,
    "BENCHMARK_V3_LEDGER_DUPLICATE", "event or attempt IDs are reused");
  const eventByAttempt = new Map();
  let highestStage = 0;
  for (const event of events) {
    const registration = registrationById.get(event.candidate_id);
    expect(registration !== undefined && registration.source_sha === event.source_sha
      && registration.architecture_fingerprint === event.architecture_fingerprint
      && registration.product_bundle_fingerprint === event.product_bundle_fingerprint,
    "BENCHMARK_V3_LEDGER_RELABEL", "event relabels or rebinds a candidate");
    const stageIndex = STAGES.indexOf(event.stage);
    expect(stageIndex >= highestStage, "BENCHMARK_V3_LEDGER_ORDER", "stage order regressed");
    highestStage = stageIndex;
    const priorForStage = stageEvents(events.slice(0, events.indexOf(event)), event.candidate_id, event.stage);
    expect(priorForStage.length <= 1, "BENCHMARK_V3_LEDGER_RETRY", "candidate/stage exceeds the initial attempt plus one retry");
    if (event.retry_of_attempt_id === null) {
      expect(priorForStage.length === 0, "BENCHMARK_V3_LEDGER_RETRY", "multiple unlinked initial attempts are forbidden");
    } else {
      const original = eventByAttempt.get(event.retry_of_attempt_id);
      expect(priorForStage.length === 1 && original === priorForStage[0]
        && original.event_type === "infrastructure-failure-before-scoring" && original.retry_of_attempt_id === null,
      "BENCHMARK_V3_LEDGER_RETRY", "retry must directly close the single initial infrastructure failure");
      for (const key of ["candidate_id", "stage", "source_sha", "model", "provider", "variant", "seed", "bindings_fingerprint", "architecture_fingerprint", "product_bundle_fingerprint"]) {
        expect(event[key] === original[key], "BENCHMARK_V3_LEDGER_RETRY_BINDING", `retry changed ${key}`);
      }
    }
    if (event.stage === "development") {
      expect(events.some((prior) => prior.candidate_id === event.candidate_id && prior.event_type === "acceptance-probe" && prior.status === "accepted"),
        "BENCHMARK_V3_LEDGER_ACCEPTANCE", "development requires an accepted acceptance probe");
    }
    if (event.stage === "validation") expect(state.selected_candidate_id === event.candidate_id, "BENCHMARK_V3_LEDGER_SELECTION", "validation candidate is not selected");
    if (event.stage === "holdout") expect(state.final_candidate_sha === event.source_sha && state.selected_candidate_id === event.candidate_id, "BENCHMARK_V3_LEDGER_HOLDOUT", "holdout candidate is not frozen");
    eventByAttempt.set(event.attempt_id, event);
  }
  const development = events.filter((event) => event.event_type === "development-execution");
  for (const registration of registrations) expect(development.filter((event) => event.candidate_id === registration.candidate_id).length <= 1,
    "BENCHMARK_V3_LEDGER_REUSE", "candidate has more than one scored development execution");
  if (state.selected_candidate_id !== null) {
    expect(registrationById.has(state.selected_candidate_id) && development.length === registrations.length
      && registrations.every((entry) => development.some((event) => event.candidate_id === entry.candidate_id)),
    "BENCHMARK_V3_LEDGER_SELECTION", "selection requires exactly one scored development result for every registered candidate");
  }
  const validations = events.filter((event) => event.event_type === "validation-execution");
  expect(validations.length <= 1, "BENCHMARK_V3_LEDGER_REUSE", "validation was reused");
  if (state.final_candidate_sha !== null) expect(SHA.test(state.final_candidate_sha) && state.selected_candidate_id !== null
    && registrationById.get(state.selected_candidate_id).source_sha === state.final_candidate_sha && validations.length === 1,
  "BENCHMARK_V3_LEDGER_FREEZE", "final candidate SHA is premature or invalid");
  expect(events.filter((event) => event.event_type === "holdout-execution").length <= 1, "BENCHMARK_V3_LEDGER_REUSE", "holdout was reused");
  return Object.freeze({ registrations, events });
}

export function createBenchmarkV3Ledger({ design, designFingerprint, campaignFingerprint, registrations }) {
  validateBenchmarkV3Design(design);
  expect(FP.test(designFingerprint) && FP.test(campaignFingerprint) && Array.isArray(registrations), "BENCHMARK_V3_LEDGER_STATE", "ledger header is invalid");
  const normalized = registrations.map(validateRegistration);
  validateBenchmarkV3CandidateBudget(design, normalized);
  return seal({ schema_version: 2, design_fingerprint: designFingerprint, campaign_fingerprint: campaignFingerprint, registrations: Object.freeze(normalized), events: Object.freeze([]), selected_candidate_id: null, final_candidate_sha: null });
}

export function appendBenchmarkV3LedgerEvent(state, design, event) {
  validateState(state, design);
  const normalized = validateEvent(event, state.events.length);
  const next = seal({ ...state, events: Object.freeze([...state.events, normalized]) });
  validateState(next, design);
  return next;
}

export function selectBenchmarkV3Candidate(state, design) {
  validateState(state, design);
  expect(state.selected_candidate_id === null, "BENCHMARK_V3_LEDGER_SELECTION", "selection is already frozen");
  const scored = state.events.filter((event) => event.event_type === "development-execution");
  expect(scored.length === state.registrations.length && state.registrations.every((entry) => scored.some((event) => event.candidate_id === entry.candidate_id)),
    "BENCHMARK_V3_LEDGER_SELECTION", "selection requires one bound scored result per candidate");
  const selected = [...scored].sort((left, right) => (
    right.metrics.paired_delta - left.metrics.paired_delta
      || left.metrics.new_high_medium_upper_ci - right.metrics.new_high_medium_upper_ci
      || left.metrics.mean_duration_ratio - right.metrics.mean_duration_ratio
      || left.candidate_id.localeCompare(right.candidate_id)
  ))[0].candidate_id;
  const next = seal({ ...state, selected_candidate_id: selected });
  validateState(next, design);
  return next;
}

export function freezeBenchmarkV3FinalCandidate(state, design) {
  validateState(state, design);
  expect(state.selected_candidate_id !== null && state.final_candidate_sha === null
    && state.events.some((event) => event.event_type === "validation-execution"), "BENCHMARK_V3_LEDGER_FREEZE", "candidate cannot be frozen before validation");
  const sourceSha = state.registrations.find((entry) => entry.candidate_id === state.selected_candidate_id).source_sha;
  const next = seal({ ...state, final_candidate_sha: sourceSha });
  validateState(next, design);
  return next;
}

export function validateBenchmarkV3Ledger(state, design) {
  validateState(state, design);
  return Object.freeze({ status: "validated", event_count: state.events.length, architecture_slots_consumed: state.registrations.length,
    infrastructure_failure_count: state.events.filter((event) => event.event_type === "infrastructure-failure-before-scoring").length,
    scored_execution_count: state.events.filter((event) => event.scored_outcome).length,
    selected_candidate_id: state.selected_candidate_id, final_candidate_sha: state.final_candidate_sha });
}
