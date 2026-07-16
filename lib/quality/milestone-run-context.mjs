import path from "node:path";
import process from "node:process";

import { observeContentBoundWorkspaceWithSourceAttestation } from "./normal-session-workspace.mjs";
import { fingerprint } from "./validation.mjs";

function boundedEnvironmentString(environment, name, { required = false, maxBytes = 256 } = {}) {
  const value = environment[name];
  if (value === undefined || value === "") {
    if (required) throw new Error(`${name} is required for the milestone run binding`);
    return null;
  }
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > maxBytes || value.includes("\0")) {
    throw new Error(`${name} is invalid for the milestone run binding`);
  }
  return value;
}

function positiveInteger(value, label) {
  if (!/^[1-9][0-9]*$/u.test(value)) throw new Error(`${label} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} exceeds the safe integer range`);
  return parsed;
}

export function captureMilestone2RunContext({
  workspaceRoot,
  localJobId,
  environment = process.env,
} = {}) {
  const root = path.resolve(workspaceRoot);
  const observation = observeContentBoundWorkspaceWithSourceAttestation(root);
  const snapshot = observation.snapshot;
  const githubActions = environment.GITHUB_ACTIONS === "true";
  const explicitProvider = boundedEnvironmentString(environment, "OPENCODE_MILESTONE_PROVIDER");
  const provider = githubActions ? "github_actions" : (explicitProvider ?? "local");
  if (!githubActions && !["local", "installed_host"].includes(provider)) {
    throw new Error("OPENCODE_MILESTONE_PROVIDER must be local or installed_host outside GitHub Actions");
  }
  if (githubActions) {
    const declaredHead = boundedEnvironmentString(environment, "GITHUB_SHA", { required: true, maxBytes: 40 });
    if (declaredHead.toLowerCase() !== snapshot.head_sha) {
      throw new Error("GITHUB_SHA does not match the observed workspace HEAD");
    }
  }
  const runId = githubActions
    ? boundedEnvironmentString(environment, "GITHUB_RUN_ID", { required: true })
    : (boundedEnvironmentString(environment, "OPENCODE_MILESTONE_RUN_ID")
      ?? `local-${snapshot.head_sha}-${observation.source_attestation_fingerprint.slice("sha256:".length, "sha256:".length + 16)}`);
  const runAttempt = githubActions
    ? positiveInteger(
      boundedEnvironmentString(environment, "GITHUB_RUN_ATTEMPT", { required: true }),
      "GITHUB_RUN_ATTEMPT",
    )
    : 1;
  const jobId = githubActions
    ? boundedEnvironmentString(environment, "GITHUB_JOB", { required: true })
    : (boundedEnvironmentString(environment, "OPENCODE_MILESTONE_JOB_ID") ?? localJobId);
  if (typeof jobId !== "string" || jobId.length === 0 || Buffer.byteLength(jobId, "utf8") > 256) {
    throw new Error("milestone local job ID is invalid");
  }
  const repository = githubActions
    ? boundedEnvironmentString(environment, "GITHUB_REPOSITORY", { required: true })
    : boundedEnvironmentString(environment, "OPENCODE_MILESTONE_REPOSITORY");
  return Object.freeze({
    head_sha: snapshot.head_sha,
    workspace_fingerprint: snapshot.source_fingerprint,
    run_binding: Object.freeze({
      provider,
      run_id: runId,
      run_attempt: runAttempt,
      job_id: jobId,
      repository,
      source_attestation_fingerprint: observation.source_attestation_fingerprint,
    }),
  });
}

export function assertMilestone2RunContextStable(expected, options = {}) {
  const current = captureMilestone2RunContext(options);
  if (expected === null || typeof expected !== "object" || Array.isArray(expected)
    || milestone2SourceStabilityFingerprint(expected) !== milestone2SourceStabilityFingerprint(current)) {
    throw Object.assign(
      new Error("milestone source changed during the verification run"),
      { code: "MILESTONE_SOURCE_CHANGED_DURING_RUN" },
    );
  }
  return current;
}

export function milestone2SourceStabilityFingerprint(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || value.run_binding === null || typeof value.run_binding !== "object" || Array.isArray(value.run_binding)) {
    throw new TypeError("milestone source stability value is invalid");
  }
  // workspace_fingerprint intentionally includes machine-local Git-index and
  // filesystem identity. Source stability instead binds HEAD plus the portable
  // content attestation carried by the complete run binding.
  return fingerprint({
    head_sha: value.head_sha,
    run_binding: value.run_binding,
  });
}

export function milestone2SharedRunFingerprint(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || value.run_binding === null || typeof value.run_binding !== "object" || Array.isArray(value.run_binding)) {
    throw new TypeError("milestone shared run value is invalid");
  }
  return fingerprint({
    provider: value.run_binding.provider,
    run_id: value.run_binding.run_id,
    run_attempt: value.run_binding.run_attempt,
    repository: value.run_binding.repository,
    head_sha: value.head_sha,
    source_attestation_fingerprint: value.run_binding.source_attestation_fingerprint,
  });
}

export function assertMilestone2BundleMatchesRunContext(bundle, runContext) {
  if (milestone2SharedRunFingerprint(bundle) !== milestone2SharedRunFingerprint(runContext)) {
    throw Object.assign(
      new Error(`${bundle?.dimension_id ?? "milestone"} bundle does not match the current repository HEAD and run`),
      { code: "MILESTONE_BUNDLE_RUN_CONTEXT_MISMATCH" },
    );
  }
  return bundle;
}
