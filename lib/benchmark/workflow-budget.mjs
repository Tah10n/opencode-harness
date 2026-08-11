import { ContractError } from "../feedback/contracts.mjs";
import { syntheticAdapterWorkerTimeoutMs } from "./runner.mjs";

export const SYNTHETIC_MODEL_JOB_TIMEOUT_MINUTES = 300;
export const SYNTHETIC_MODEL_JOB_TIMEOUT_MS = SYNTHETIC_MODEL_JOB_TIMEOUT_MINUTES * 60_000;
export const SYNTHETIC_MODEL_JOB_RESERVE_MS = 15 * 60_000;
export const SYNTHETIC_ARTIFACT_OVERHEAD_MS = 20 * 60_000;
export const SYNTHETIC_MERGE_JOB_TIMEOUT_MINUTES = 60;
export const SYNTHETIC_MERGE_JOB_TIMEOUT_MS = SYNTHETIC_MERGE_JOB_TIMEOUT_MINUTES * 60_000;
export const SYNTHETIC_MERGE_OVERHEAD_MS = 20 * 60_000;
export const SYNTHETIC_MERGE_JOB_RESERVE_MS = 10 * 60_000;

function expect(condition, message) {
  if (!condition) throw new ContractError("SYNTHETIC_WORKFLOW_BUDGET", message);
}

export function syntheticMergeJobBudget() {
  expect(
    SYNTHETIC_MERGE_OVERHEAD_MS
      <= SYNTHETIC_MERGE_JOB_TIMEOUT_MS - SYNTHETIC_MERGE_JOB_RESERVE_MS,
    "merge overhead exceeds the merge job budget",
  );
  return Object.freeze({
    merge_overhead_ms: SYNTHETIC_MERGE_OVERHEAD_MS,
    job_timeout_ms: SYNTHETIC_MERGE_JOB_TIMEOUT_MS,
    reserve_ms: SYNTHETIC_MERGE_JOB_RESERVE_MS,
  });
}

export function syntheticModelJobBudget({
  pairCount,
  timeoutMs,
  jobTimeoutMinutes = SYNTHETIC_MODEL_JOB_TIMEOUT_MINUTES,
} = {}) {
  expect(Number.isSafeInteger(pairCount) && pairCount >= 1 && pairCount <= 160, "pairCount is invalid");
  expect(Number.isSafeInteger(jobTimeoutMinutes) && jobTimeoutMinutes >= 1 && jobTimeoutMinutes <= 360, "job timeout is invalid");
  const agentRunCount = pairCount * 2;
  const workerTimeoutMs = syntheticAdapterWorkerTimeoutMs(timeoutMs);
  const serialWorkerBudgetMs = agentRunCount * workerTimeoutMs;
  const requiredMs = serialWorkerBudgetMs + SYNTHETIC_ARTIFACT_OVERHEAD_MS;
  const jobTimeoutMs = jobTimeoutMinutes * 60_000;
  const admissibleMs = jobTimeoutMs - SYNTHETIC_MODEL_JOB_RESERVE_MS;
  expect(
    requiredMs <= admissibleMs,
    `configuration requires ${requiredMs}ms but only ${admissibleMs}ms is available before the job reserve`,
  );
  return Object.freeze({
    pair_count: pairCount,
    agent_run_count: agentRunCount,
    worker_timeout_ms: workerTimeoutMs,
    serial_worker_budget_ms: serialWorkerBudgetMs,
    artifact_overhead_ms: SYNTHETIC_ARTIFACT_OVERHEAD_MS,
    required_ms: requiredMs,
    job_timeout_ms: jobTimeoutMs,
    reserve_ms: SYNTHETIC_MODEL_JOB_RESERVE_MS,
  });
}
