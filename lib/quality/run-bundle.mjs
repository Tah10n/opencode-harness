import fs from "node:fs";
import path from "node:path";

import {
  RISK_LEVELS,
  assertEnum,
  assertSafeId,
  canonicalJson,
} from "../feedback/contracts.mjs";
import { assertPersistenceSafe } from "../feedback/privacy.mjs";
import {
  materializeStagedRunArtifacts,
  validateStoredRun,
} from "../feedback/trace-store.mjs";
import { validateQualityAttestation } from "./attestation.mjs";
import { validateArchitectureEvaluation } from "./architecture.mjs";
import { validateEngineeringDossier } from "./dossier.mjs";
import {
  validateIntegratedVerificationEvidence,
  verificationTraceEventFingerprint,
} from "./verification-evidence.mjs";
import {
  validateEngineeringGateDecision,
  validateEngineeringPreimplementationEvidence,
} from "./gate.mjs";
import { snapshotEngineeringQualitySession } from "./session.mjs";
import {
  ContractError,
  assertArray,
  assertFingerprint,
  assertInteger,
  assertSchemaVersion,
  deepFrozenClone,
  exact,
  fingerprint,
  fingerprintsEqual,
} from "./validation.mjs";

const BUNDLE_SCHEMA_VERSION = 2;
const QUALITY_PROFILE_ROLES = Object.freeze(["baseline", "candidate"]);
const VALIDATED_RUN_BUNDLES = new WeakSet();
const REQUIRED_BUNDLE_PATHS = Object.freeze([
  "quality/attestation.json",
  "quality/dossier.json",
  "quality/gate.json",
]);
const OPTIONAL_BUNDLE_PATHS = Object.freeze([
  "quality/architecture-evaluation.json",
  "quality/post-architecture-evaluation.json",
  "quality/preimplementation-evidence.json",
  "quality/integrated-verification-evidence.json",
]);
const ALL_BUNDLE_PATHS = Object.freeze([...REQUIRED_BUNDLE_PATHS, ...OPTIONAL_BUNDLE_PATHS]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function manifestFingerprintInput(manifest) {
  const copy = { ...manifest };
  delete copy.fingerprint;
  return copy;
}

function validateBundleManifest(value) {
  const keys = [
    "schema_version",
    "run_id",
    "task_id",
    "scenario_id",
    "profile_role",
    "risk",
    "harness_fingerprint",
    "run_fingerprint",
    "artifacts",
    "total_bytes",
    "fingerprint",
  ];
  exact(value, keys, keys, "quality bundle manifest");
  assertSchemaVersion(value.schema_version, BUNDLE_SCHEMA_VERSION, "quality bundle manifest");
  assertSafeId(value.run_id, "quality bundle manifest.run_id");
  assertSafeId(value.task_id, "quality bundle manifest.task_id");
  assertSafeId(value.scenario_id, "quality bundle manifest.scenario_id");
  assertEnum(value.profile_role, QUALITY_PROFILE_ROLES, "quality bundle manifest.profile_role");
  assertEnum(value.risk, RISK_LEVELS, "quality bundle manifest.risk");
  assertFingerprint(value.harness_fingerprint, "quality bundle manifest.harness_fingerprint");
  assertFingerprint(value.run_fingerprint, "quality bundle manifest.run_fingerprint");
  assertArray(value.artifacts, "quality bundle manifest.artifacts", {
    min: REQUIRED_BUNDLE_PATHS.length,
    max: ALL_BUNDLE_PATHS.length,
    item: (entry, label) => {
      exact(entry, ["relative_path", "schema_version", "fingerprint", "bytes"], [
        "relative_path",
        "schema_version",
        "fingerprint",
        "bytes",
      ], label);
      if (!ALL_BUNDLE_PATHS.includes(entry.relative_path)) {
        throw new ContractError("QUALITY_BUNDLE_PATH", `${label}.relative_path is not a canonical bundle artifact`);
      }
      assertInteger(entry.schema_version, `${label}.schema_version`, { min: 1 });
      assertFingerprint(entry.fingerprint, `${label}.fingerprint`);
      assertInteger(entry.bytes, `${label}.bytes`, { min: 1 });
    },
  });
  const paths = value.artifacts.map((entry) => entry.relative_path).sort();
  if (new Set(paths).size !== paths.length || REQUIRED_BUNDLE_PATHS.some((entry) => !paths.includes(entry))) {
    throw new ContractError("QUALITY_BUNDLE_CARDINALITY", "quality bundle must bind each required artifact exactly once");
  }
  assertInteger(value.total_bytes, "quality bundle manifest.total_bytes", { min: 1 });
  const summed = value.artifacts.reduce((total, entry) => total + entry.bytes, 0);
  if (summed !== value.total_bytes) throw new ContractError("QUALITY_BUNDLE_BYTES", "quality bundle byte total mismatch");
  assertFingerprint(value.fingerprint, "quality bundle manifest.fingerprint");
  if (!fingerprintsEqual(value.fingerprint, fingerprint(manifestFingerprintInput(value)))) {
    throw new ContractError("QUALITY_BUNDLE_FINGERPRINT", "quality bundle manifest fingerprint mismatch");
  }
  return value;
}

function artifactDescriptor(relativePath, value) {
  return {
    relative_path: relativePath,
    schema_version: value.schema_version,
    fingerprint: value.fingerprint,
    bytes: Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`, "utf8"),
  };
}

function createBundleManifest(snapshot, run) {
  validateStoredRun(run);
  if (run.lifecycle !== "final") {
    throw new ContractError("QUALITY_BUNDLE_RUN", "quality bundle publication requires a finalized runner trace");
  }
  if (run.run_id !== snapshot.store.run_id) {
    throw new ContractError("QUALITY_BUNDLE_RUN", "quality session and runner trace identities do not match");
  }
  const artifacts = [
    artifactDescriptor("quality/dossier.json", snapshot.store.dossier),
    artifactDescriptor("quality/gate.json", snapshot.store.gate),
    artifactDescriptor("quality/attestation.json", snapshot.attestation),
    ...(snapshot.store.preimplementation_evidence === null
      ? []
      : [artifactDescriptor(
        "quality/preimplementation-evidence.json",
        snapshot.store.preimplementation_evidence,
      )]),
    ...(snapshot.store.architecture_evaluation === null
      ? []
      : [artifactDescriptor("quality/architecture-evaluation.json", snapshot.store.architecture_evaluation)]),
    ...(snapshot.store.post_architecture_evaluation === null
      ? []
      : [artifactDescriptor(
        "quality/post-architecture-evaluation.json",
        snapshot.store.post_architecture_evaluation,
      )]),
    ...(snapshot.store.integrated_verification_evidence === null
      ? []
      : [artifactDescriptor(
        "quality/integrated-verification-evidence.json",
        snapshot.store.integrated_verification_evidence,
      )]),
  ].sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  const source = {
    schema_version: BUNDLE_SCHEMA_VERSION,
    run_id: snapshot.store.run_id,
    task_id: snapshot.store.task_id,
    scenario_id: run.scenario_id,
    profile_role: run.profile_role,
    risk: run.risk,
    harness_fingerprint: run.harness_fingerprint,
    run_fingerprint: fingerprint(run),
    artifacts,
    total_bytes: artifacts.reduce((total, entry) => total + entry.bytes, 0),
  };
  const manifest = { ...source, fingerprint: fingerprint(source) };
  validateBundleManifest(manifest);
  return deepFrozenClone(manifest, "quality bundle manifest");
}

function assertQualityDirectoryExact(runDir, manifest) {
  const qualityDir = path.join(runDir, "quality");
  const entries = fs.readdirSync(qualityDir, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) {
    throw new ContractError("QUALITY_BUNDLE_TYPE", "quality bundle may contain only regular files");
  }
  const actual = entries.map((entry) => `quality/${entry.name}`).sort();
  const expected = [...manifest.artifacts.map((entry) => entry.relative_path), "quality/manifest.json"].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new ContractError("QUALITY_BUNDLE_CARDINALITY", "quality directory contains missing or unexpected artifacts");
  }
}

export function validateEngineeringQualityRunBundle(runDir) {
  if (typeof runDir !== "string" || !fs.statSync(runDir).isDirectory()) {
    throw new ContractError("QUALITY_BUNDLE_RUN", "runDir must be an existing directory");
  }
  const run = readJson(path.join(runDir, "run.json"));
  validateStoredRun(run);
  const dossier = readJson(path.join(runDir, "quality", "dossier.json"));
  const gate = readJson(path.join(runDir, "quality", "gate.json"));
  const attestation = readJson(path.join(runDir, "quality", "attestation.json"));
  const manifest = readJson(path.join(runDir, "quality", "manifest.json"));
  validateBundleManifest(manifest);
  assertQualityDirectoryExact(runDir, manifest);
  const architectureDescriptor = manifest.artifacts.find((entry) => entry.relative_path === "quality/architecture-evaluation.json");
  const architectureEvaluation = architectureDescriptor
    ? readJson(path.join(runDir, "quality", "architecture-evaluation.json"))
    : null;
  const postArchitectureDescriptor = manifest.artifacts.find(
    (entry) => entry.relative_path === "quality/post-architecture-evaluation.json",
  );
  const postArchitectureEvaluation = postArchitectureDescriptor
    ? readJson(path.join(runDir, "quality", "post-architecture-evaluation.json"))
    : null;
  const preimplementationDescriptor = manifest.artifacts.find(
    (entry) => entry.relative_path === "quality/preimplementation-evidence.json",
  );
  const preimplementationEvidence = preimplementationDescriptor
    ? readJson(path.join(runDir, "quality", "preimplementation-evidence.json"))
    : null;
  const integratedVerificationDescriptor = manifest.artifacts.find(
    (entry) => entry.relative_path === "quality/integrated-verification-evidence.json",
  );
  const integratedVerificationEvidence = integratedVerificationDescriptor
    ? readJson(path.join(runDir, "quality", "integrated-verification-evidence.json"))
    : null;
  validateEngineeringDossier(dossier, { requireFinalized: true });
  validateEngineeringGateDecision(gate);
  validateQualityAttestation(attestation);
  if (preimplementationEvidence !== null) validateEngineeringPreimplementationEvidence(preimplementationEvidence);
  if (architectureEvaluation !== null) validateArchitectureEvaluation(architectureEvaluation);
  if (postArchitectureEvaluation !== null) validateArchitectureEvaluation(postArchitectureEvaluation);
  if (integratedVerificationEvidence !== null) validateIntegratedVerificationEvidence(integratedVerificationEvidence);
  for (const value of [
    run,
    dossier,
    gate,
    attestation,
    manifest,
    architectureEvaluation,
    postArchitectureEvaluation,
    preimplementationEvidence,
    integratedVerificationEvidence,
  ].filter(Boolean)) {
    assertPersistenceSafe(value, { label: "quality run bundle artifact" });
  }
  if (run.lifecycle !== "final") {
    throw new ContractError("QUALITY_BUNDLE_RUN", "quality bundle runner trace is not finalized");
  }
  if (!fingerprintsEqual(manifest.run_fingerprint, fingerprint(run))) {
    throw new ContractError("QUALITY_BUNDLE_RUN_FINGERPRINT", "quality bundle run.json fingerprint mismatch");
  }
  if (
    run.run_id !== manifest.run_id
    || run.scenario_id !== manifest.scenario_id
    || run.profile_role !== manifest.profile_role
    || run.risk !== manifest.risk
    || run.harness_fingerprint !== manifest.harness_fingerprint
  ) {
    throw new ContractError("QUALITY_BUNDLE_PROVENANCE", "quality bundle runner provenance does not match its manifest");
  }
  const expectedDossierRisk = run.risk === "standard" ? "standard-lite" : run.risk;
  if (dossier.risk_class !== expectedDossierRisk || gate.risk_class !== expectedDossierRisk) {
    throw new ContractError("QUALITY_BUNDLE_RISK", "quality bundle runner risk does not match dossier and gate risk");
  }
  if (run.run_id !== manifest.run_id || run.run_id !== attestation.run_id) {
    throw new ContractError("QUALITY_BUNDLE_RUN", "quality bundle run identity mismatch");
  }
  if (manifest.task_id !== dossier.task_id || manifest.task_id !== gate.task_id || manifest.task_id !== attestation.task_id) {
    throw new ContractError("QUALITY_BUNDLE_TASK", "quality bundle task identity mismatch");
  }
  if (
    gate.dossier_id !== dossier.dossier_id
    || gate.dossier_fingerprint !== dossier.fingerprint
    || attestation.dossier_id !== dossier.dossier_id
    || attestation.dossier_fingerprint !== dossier.fingerprint
    || attestation.gate_id !== gate.gate_id
    || attestation.gate_fingerprint !== gate.fingerprint
    || attestation.gate_status !== gate.status
    || gate.architecture_evaluation_fingerprint !== (architectureEvaluation?.fingerprint ?? null)
    || gate.preimplementation_evidence_fingerprint !== (preimplementationEvidence?.fingerprint ?? null)
    || (
      preimplementationEvidence !== null
      && (
        preimplementationEvidence.dossier_id !== dossier.dossier_id
        || preimplementationEvidence.dossier_fingerprint !== dossier.fingerprint
      )
    )
    || attestation.post_architecture_evaluation_fingerprint !== (postArchitectureEvaluation?.fingerprint ?? null)
    || attestation.integrated_verification_evidence_fingerprint !== (integratedVerificationEvidence?.fingerprint ?? null)
    || (
      integratedVerificationEvidence !== null
      && (
        integratedVerificationEvidence.run_id !== run.run_id
        || integratedVerificationEvidence.task_id !== manifest.task_id
        || integratedVerificationEvidence.dossier_id !== dossier.dossier_id
        || integratedVerificationEvidence.dossier_fingerprint !== dossier.fingerprint
        || integratedVerificationEvidence.gate_id !== gate.gate_id
        || integratedVerificationEvidence.gate_fingerprint !== gate.fingerprint
        || integratedVerificationEvidence.check_catalog_fingerprint !== gate.check_catalog_fingerprint
        || integratedVerificationEvidence.workspace_fingerprint !== attestation.final_workspace_fingerprint
        || integratedVerificationEvidence.trace_event_sequence !== attestation.integrated_verification_sequence
      )
    )
    || (gate.status === "passed" && integratedVerificationEvidence === null)
    || (
      architectureEvaluation !== null
      && architectureEvaluation.policy_id !== null
      && (
        postArchitectureEvaluation === null
        || postArchitectureEvaluation.policy_id !== architectureEvaluation.policy_id
        || postArchitectureEvaluation.policy_fingerprint !== architectureEvaluation.policy_fingerprint
        || postArchitectureEvaluation.baseline_graph_id !== dossier.impact_graph?.graph_id
        || postArchitectureEvaluation.baseline_graph_fingerprint !== dossier.impact_graph?.fingerprint
      )
    )
    || (architectureEvaluation === null && postArchitectureEvaluation !== null)
  ) {
    throw new ContractError("QUALITY_BUNDLE_BINDING", "quality artifact fingerprint chain does not match");
  }
  const valuesByPath = new Map([
    ["quality/dossier.json", dossier],
    ["quality/gate.json", gate],
    ["quality/attestation.json", attestation],
    ...(preimplementationEvidence === null
      ? []
      : [["quality/preimplementation-evidence.json", preimplementationEvidence]]),
    ...(architectureEvaluation === null ? [] : [["quality/architecture-evaluation.json", architectureEvaluation]]),
    ...(postArchitectureEvaluation === null
      ? []
      : [["quality/post-architecture-evaluation.json", postArchitectureEvaluation]]),
    ...(integratedVerificationEvidence === null
      ? []
      : [["quality/integrated-verification-evidence.json", integratedVerificationEvidence]]),
  ]);
  for (const descriptor of manifest.artifacts) {
    const value = valuesByPath.get(descriptor.relative_path);
    if (!value || value.schema_version !== descriptor.schema_version || value.fingerprint !== descriptor.fingerprint) {
      throw new ContractError("QUALITY_BUNDLE_MANIFEST", `manifest identity mismatch: ${descriptor.relative_path}`);
    }
    const bytes = fs.statSync(path.join(runDir, ...descriptor.relative_path.split("/"))).size;
    if (bytes !== descriptor.bytes) throw new ContractError("QUALITY_BUNDLE_BYTES", `manifest byte mismatch: ${descriptor.relative_path}`);
  }
  const eventsText = fs.readFileSync(path.join(runDir, "events.jsonl"), "utf8");
  const events = eventsText.trimEnd() === "" ? [] : eventsText.trimEnd().split(/\r?\n/).map(JSON.parse);
  const gateEvent = events.find((event) => event.sequence === attestation.gate_trace_sequence);
  const expectedCode = gate.status === "passed" ? "QUALITY-GATE-PASSED" : "QUALITY-GATE-BLOCKED";
  if (
    !gateEvent
    || !gateEvent.evidence_refs?.some((entry) => entry.kind === "file" && entry.value === "quality/gate.json")
    || !gateEvent.verifier_codes?.includes(expectedCode)
  ) {
    throw new ContractError("QUALITY_BUNDLE_TRACE_LINK", "runner trace does not contain the authoritative gate link");
  }
  if (integratedVerificationEvidence !== null) {
    const verificationEvent = events.find(
      (event) => event.sequence === integratedVerificationEvidence.trace_event_sequence,
    );
    if (
      !verificationEvent
      || verificationEvent.event_id !== integratedVerificationEvidence.trace_event_id
      || verificationEvent.timestamp !== integratedVerificationEvidence.trace_event_timestamp
      || verificationTraceEventFingerprint(verificationEvent)
        !== integratedVerificationEvidence.trace_event_fingerprint
    ) {
      throw new ContractError(
        "QUALITY_BUNDLE_TRACE_LINK",
        "runner trace does not contain the exact integrated verification event",
      );
    }
    const targetIds = [
      ...integratedVerificationEvidence.check_receipts.map((entry) => entry.check_id),
      ...integratedVerificationEvidence.mechanism_receipts.map((entry) => entry.mechanism_id),
    ];
    if (targetIds.some((id) => (
      !verificationEvent.verifier_codes.includes(id)
      || !verificationEvent.verification.verifier_codes.includes(id)
    ))) {
      throw new ContractError("QUALITY_BUNDLE_TRACE_LINK", "integrated verification event omits an execution target");
    }
    const verification = readJson(path.join(runDir, "verification.json"));
    const passedChecks = new Set(
      verification.checks?.filter((entry) => entry.status === "passed").map((entry) => entry.code) ?? [],
    );
    if (
      verification.status !== "passed"
      || targetIds.some((id) => !passedChecks.has(id))
    ) {
      throw new ContractError(
        "QUALITY_BUNDLE_VERIFICATION_LINK",
        "verification.json does not confirm every integrated check receipt",
      );
    }
  }
  const verification = readJson(path.join(runDir, "verification.json"));
  const validated = deepFrozenClone({
    run,
    events,
    verification,
    dossier,
    gate,
    architecture_evaluation: architectureEvaluation,
    post_architecture_evaluation: postArchitectureEvaluation,
    preimplementation_evidence: preimplementationEvidence,
    integrated_verification_evidence: integratedVerificationEvidence,
    attestation,
    manifest,
  }, "validated quality run bundle");
  VALIDATED_RUN_BUNDLES.add(validated);
  return validated;
}

export function assertValidatedEngineeringQualityRunBundle(value) {
  if (!value || typeof value !== "object" || !VALIDATED_RUN_BUNDLES.has(value)) {
    throw new ContractError(
      "QUALITY_BUNDLE_VALIDATION_REQUIRED",
      "quality acceptance requires the exact result of validateEngineeringQualityRunBundle",
    );
  }
  return value;
}

export function isValidatedEngineeringQualityRunBundle(value) {
  return Boolean(value && typeof value === "object" && VALIDATED_RUN_BUNDLES.has(value));
}

export function publishEngineeringQualityRunBundle({
  durable_trace_store,
  staged_trace_store,
  session,
  before_publish = null,
  after_publish = null,
}) {
  if (!durable_trace_store || typeof durable_trace_store.commitStagedRun !== "function") {
    throw new ContractError("QUALITY_BUNDLE_STORE", "durable_trace_store must support staged commits");
  }
  if (!staged_trace_store || typeof staged_trace_store.inspectRun !== "function") {
    throw new ContractError("QUALITY_BUNDLE_STORE", "staged_trace_store must be a staging trace store");
  }
  if (before_publish !== null && typeof before_publish !== "function") throw new ContractError("QUALITY_BUNDLE_HOOK", "before_publish must be a function");
  if (after_publish !== null && typeof after_publish !== "function") throw new ContractError("QUALITY_BUNDLE_HOOK", "after_publish must be a function");
  const snapshot = snapshotEngineeringQualitySession(session);
  const stagedRun = staged_trace_store.inspectRun(snapshot.store.run_id).run;
  const manifest = createBundleManifest(snapshot, stagedRun);
  let validatedBundle = null;
  materializeStagedRunArtifacts(staged_trace_store, snapshot.store.run_id, [
    { relative_path: "quality/dossier.json", value: snapshot.store.dossier },
    { relative_path: "quality/gate.json", value: snapshot.store.gate },
    { relative_path: "quality/attestation.json", value: snapshot.attestation },
    ...(snapshot.store.preimplementation_evidence === null
      ? []
      : [{
        relative_path: "quality/preimplementation-evidence.json",
        value: snapshot.store.preimplementation_evidence,
      }]),
    ...(snapshot.store.architecture_evaluation === null
      ? []
      : [{ relative_path: "quality/architecture-evaluation.json", value: snapshot.store.architecture_evaluation }]),
    ...(snapshot.store.post_architecture_evaluation === null
      ? []
      : [{
        relative_path: "quality/post-architecture-evaluation.json",
        value: snapshot.store.post_architecture_evaluation,
      }]),
    ...(snapshot.store.integrated_verification_evidence === null
      ? []
      : [{
        relative_path: "quality/integrated-verification-evidence.json",
        value: snapshot.store.integrated_verification_evidence,
      }]),
    { relative_path: "quality/manifest.json", value: manifest },
  ]);
  const committed = durable_trace_store.commitStagedRun(staged_trace_store, snapshot.store.run_id, {
    validateImport: ({ run_dir: runDir }) => {
      validatedBundle = validateEngineeringQualityRunBundle(runDir);
    },
    beforePublish: before_publish,
    afterPublish: after_publish,
  });
  return Object.freeze({ committed, manifest, validated_bundle: validatedBundle });
}
