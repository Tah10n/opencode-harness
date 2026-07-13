import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateStaticEvidence } from "../lib/feedback/acceptance.mjs";
import {
  ACCEPTANCE_SCHEMA_VERSION,
  EVIDENCE_PRODUCERS,
  ContractError,
  assertIsoTimestamp,
} from "../lib/feedback/contracts.mjs";
import {
  atomicWriteJson,
  ensureConfinedDirectory,
  resolveHarnessRoot,
  resolveInside,
} from "../lib/feedback/files.mjs";
import {
  materializeRepositorySnapshot,
  recoverMaterializedRepositorySnapshot,
  repositoryStateFingerprint,
} from "../lib/feedback/evidence.mjs";
import { assertPersistenceSafe, assertSafePersistenceId } from "../lib/feedback/privacy.mjs";
import {
  ProcessTreeTeardownError,
  runManagedCommand,
} from "../lib/feedback/process-tree.mjs";

export { materializeRepositorySnapshot, repositoryStateFingerprint } from "../lib/feedback/evidence.mjs";

function fail(code, message) {
  throw new ContractError(code, message);
}

function defaultVerifyRunner(workspaceRoot) {
  return runManagedCommand({
    file: process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npm",
    args: process.platform === "win32" ? ["/d", "/s", "/c", "npm run verify"] : ["run", "verify"],
    cwd: workspaceRoot,
    timeout: 10 * 60 * 1000,
    maxOutputChars: 4 * 1024 * 1024,
    teardownConfirmationMs: 5000,
  });
}

function timestampValue(clock) {
  const value = clock();
  const timestamp = value instanceof Date ? value.toISOString() : String(value);
  assertIsoTimestamp(timestamp, "static evidence created_at");
  return timestamp;
}

function timestampSlug(timestamp) {
  return timestamp.replace(/[-:]/g, "").replace(/\.\d+(?=Z|[+-])/, "").replace("+", "p").replace(/(?<!^)\-/g, "m");
}

export async function captureStaticEvidence({
  workspaceRoot,
  candidateId,
  runVerify = defaultVerifyRunner,
  clock = () => new Date(),
  idFactory = () => randomUUID(),
  fingerprintRepository = repositoryStateFingerprint,
  materializeSnapshot = materializeRepositorySnapshot,
  monotonicNow = () => process.hrtime.bigint(),
} = {}) {
  if (typeof workspaceRoot !== "string" || workspaceRoot.trim() === "") {
    fail("STATIC_EVIDENCE_WORKSPACE", "workspaceRoot must be a non-empty path");
  }
  const resolvedRoot = path.resolve(workspaceRoot);
  assertSafePersistenceId(candidateId, "candidateId");
  const snapshot = materializeSnapshot(resolvedRoot);
  if (
    !snapshot
    || typeof snapshot.snapshotRoot !== "string"
    || typeof snapshot.repositoryFingerprint !== "string"
    || typeof snapshot.verifyIntegrity !== "function"
    || typeof snapshot.cleanup !== "function"
  ) {
    fail("STATIC_EVIDENCE_SNAPSHOT", "materializeSnapshot returned an invalid snapshot handle");
  }
  const beforeFingerprint = snapshot.repositoryFingerprint;
  const startedAt = monotonicNow();
  let result;
  let cleanupFailed = false;
  let snapshotStable = true;
  let fatalProcessError = null;
  try {
    snapshot.verifyIntegrity();
    result = await runVerify(snapshot.snapshotRoot);
  } catch (error) {
    if (error instanceof ProcessTreeTeardownError) fatalProcessError = error;
    else result = { status: null, signal: null, error };
  } finally {
    try {
      snapshot.verifyIntegrity();
    } catch {
      snapshotStable = false;
    }
    let cleanupError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        snapshot.cleanup();
        cleanupError = null;
        break;
      } catch (error) {
        cleanupError = error;
      }
    }
    if (cleanupError !== null) {
      try {
        cleanupFailed = !recoverMaterializedRepositorySnapshot(snapshot);
      } catch {
        cleanupFailed = true;
      }
    }
  }
  if (cleanupFailed) {
    const recoveryEntry = path.basename(path.dirname(path.resolve(snapshot.snapshotRoot)));
    fail("STATIC_EVIDENCE_CLEANUP", `temporary snapshot cleanup failed; remove OS temporary entry ${recoveryEntry}`);
  }
  if (fatalProcessError !== null) {
    fail("STATIC_EVIDENCE_TEARDOWN_UNVERIFIED", "verification process tree teardown was not verified; no evidence was published");
  }
  if (result?.timed_out || result?.error?.code === "ETIMEDOUT") {
    fail("STATIC_EVIDENCE_TIMEOUT", "verification timed out after verified process-tree teardown; no evidence was published");
  }
  const endedAt = monotonicNow();
  const afterFingerprint = fingerprintRepository(resolvedRoot);
  const durationMs = Math.max(0, Math.round(Number(endedAt - startedAt) / 1_000_000));
  const commandCompleted = snapshotStable && !cleanupFailed && !result?.error && result?.signal === null && Number.isInteger(result?.status);
  const repositoryStable = beforeFingerprint === afterFingerprint;
  const evidence = {
    schema_version: ACCEPTANCE_SCHEMA_VERSION,
    producer_id: EVIDENCE_PRODUCERS.staticVerification,
    source: "local_verify",
    candidate_id: candidateId,
    repository_fingerprint: beforeFingerprint,
    command_id: "npm-run-verify",
    passed: commandCompleted && result.status === 0 && repositoryStable,
    complete: commandCompleted && repositoryStable,
    created_at: timestampValue(clock),
    duration_ms: durationMs,
  };
  validateStaticEvidence(evidence);
  assertPersistenceSafe(evidence, { label: "static evidence" });
  const harnessRoot = resolveHarnessRoot(resolvedRoot);
  const evidenceDirectory = resolveInside(harnessRoot, "evidence");
  ensureConfinedDirectory(harnessRoot, evidenceDirectory);
  const collisionId = assertSafePersistenceId(idFactory("static-evidence"), "static evidence id");
  const outputPath = resolveInside(
    evidenceDirectory,
    `${timestampSlug(evidence.created_at)}-${candidateId}-${collisionId}.json`,
  );
  atomicWriteJson(outputPath, evidence, { immutable: true, basePath: harnessRoot });
  return { evidence, outputPath };
}

function parseCandidateId(argv) {
  if (argv.length === 2 && argv[0] === "--candidate-id") return argv[1];
  fail("STATIC_EVIDENCE_USAGE", "usage: node scripts/capture-static-evidence.mjs --candidate-id <id>");
}

function isMainModule() {
  return process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
}

if (isMainModule()) {
  try {
    const candidateId = parseCandidateId(process.argv.slice(2));
    const result = await captureStaticEvidence({ workspaceRoot: process.cwd(), candidateId });
    console.log(`Static verification evidence: ${path.relative(process.cwd(), result.outputPath).replaceAll("\\", "/")}`);
    if (!result.evidence.passed) process.exitCode = 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
