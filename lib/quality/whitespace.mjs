import { spawnSync } from "node:child_process";

import { fingerprint } from "./validation.mjs";

export const COMMITTED_WHITESPACE_SCHEMA_VERSION = 1;
export const COMMITTED_WHITESPACE_PRODUCER = "opencode-harness/committed-whitespace-v1";
export const COMMITTED_WHITESPACE_MODES = Object.freeze(["local", "pull_request", "push"]);

const FULL_COMMIT = /^[0-9a-f]{40}$/u;
const ZERO_COMMIT = "0".repeat(40);

function commandEvidence(command, args, result) {
  const stdout = typeof result?.stdout === "string" ? result.stdout : "";
  const stderr = typeof result?.stderr === "string" ? result.stderr : "";
  return {
    argv: [command, ...args],
    status: Number.isInteger(result?.status) ? result.status : null,
    signal: typeof result?.signal === "string" ? result.signal : null,
    error_code: typeof result?.error?.code === "string" ? result.error.code : null,
    stdout_fingerprint: fingerprint(stdout),
    stderr_fingerprint: fingerprint(stderr),
  };
}

function createReceipt(mode) {
  return {
    schema_version: COMMITTED_WHITESPACE_SCHEMA_VERSION,
    producer: COMMITTED_WHITESPACE_PRODUCER,
    mode,
    status: "incomplete",
    reason: null,
    head_sha: null,
    base_sha: null,
    before_sha: null,
    merge_base_sha: null,
    range: null,
    resolved_range: null,
    working_tree_state: null,
    commands: [],
  };
}

function sealReceipt(receipt, status, reason = null) {
  const value = { ...receipt, status, reason };
  return Object.freeze({ ...value, evidence_fingerprint: fingerprint(value) });
}

function normalizeOutput(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validCommit(value) {
  return typeof value === "string" && FULL_COMMIT.test(value);
}

function validResult(result) {
  return result.evidence.status !== null && result.evidence.error_code === null;
}

function successfulResult(result) {
  return validResult(result) && result.evidence.status === 0;
}

/**
 * Run Git with an argv array. The injected runner makes the decision engine
 * deterministic in fixtures; the default never invokes a command shell.
 */
function createGitRunner({ cwd, gitCommand, spawnSyncImpl, receipt }) {
  return (args) => {
    let result;
    try {
      result = spawnSyncImpl(gitCommand, args, {
        cwd,
        encoding: "utf8",
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      result = { status: null, signal: null, stdout: "", stderr: "", error };
    }
    const evidence = commandEvidence(gitCommand, args, result);
    receipt.commands.push(evidence);
    return { evidence, stdout: normalizeOutput(result?.stdout) };
  };
}

function finishCheck(receipt, result) {
  if (!validResult(result)) return sealReceipt(receipt, "incomplete", "git_unavailable");
  if (result.evidence.status !== 0) return sealReceipt(receipt, "failed", "whitespace_error");
  return sealReceipt(receipt, "passed");
}

function checkHead(runGit, receipt) {
  const result = runGit(["rev-parse", "--verify", "HEAD^{commit}"]);
  if (!successfulResult(result) || !validCommit(result.stdout)) {
    return sealReceipt(receipt, "incomplete", validResult(result) ? "head_unavailable" : "git_unavailable");
  }
  receipt.head_sha = result.stdout;
  return null;
}

function verifyCommitExists(runGit, commit) {
  const result = runGit(["rev-parse", "--verify", `${commit}^{commit}`]);
  return successfulResult(result) && result.stdout === commit;
}

function verifyLocal(runGit, receipt) {
  const unstaged = runGit(["diff", "--quiet", "--no-ext-diff"]);
  const staged = runGit(["diff", "--cached", "--quiet", "--no-ext-diff"]);
  if (!validResult(unstaged) || !validResult(staged)) {
    return sealReceipt(receipt, "incomplete", "working_tree_state_unavailable");
  }
  if (![0, 1].includes(unstaged.evidence.status) || ![0, 1].includes(staged.evidence.status)) {
    return sealReceipt(receipt, "incomplete", "working_tree_state_unavailable");
  }

  const dirty = unstaged.evidence.status === 1 || staged.evidence.status === 1;
  receipt.working_tree_state = dirty ? "dirty" : "clean";
  if (!dirty) {
    const result = runGit(["show", "--check", "--format=", "HEAD"]);
    return finishCheck(receipt, result);
  }

  const unstagedCheck = runGit(["diff", "--check"]);
  const stagedCheck = runGit(["diff", "--cached", "--check"]);
  if (!validResult(unstagedCheck) || !validResult(stagedCheck)) {
    return sealReceipt(receipt, "incomplete", "git_unavailable");
  }
  if (unstagedCheck.evidence.status !== 0 || stagedCheck.evidence.status !== 0) {
    return sealReceipt(receipt, "failed", "whitespace_error");
  }
  return sealReceipt(receipt, "passed");
}

function verifyPullRequest(runGit, receipt, baseSha) {
  if (baseSha === null || baseSha === undefined || baseSha === "") {
    return sealReceipt(receipt, "incomplete", "missing_base_sha");
  }
  if (!validCommit(baseSha)) {
    return sealReceipt(receipt, "incomplete", "invalid_base_sha");
  }
  receipt.base_sha = baseSha;
  if (!verifyCommitExists(runGit, baseSha)) {
    return sealReceipt(receipt, "incomplete", "base_unavailable");
  }

  const mergeBase = runGit(["merge-base", baseSha, "HEAD"]);
  if (!successfulResult(mergeBase) || !validCommit(mergeBase.stdout)) {
    return sealReceipt(receipt, "incomplete", "merge_base_unavailable");
  }
  receipt.merge_base_sha = mergeBase.stdout;
  receipt.range = `${receipt.merge_base_sha}..HEAD`;
  receipt.resolved_range = `${receipt.merge_base_sha}..${receipt.head_sha}`;
  return finishCheck(receipt, runGit(["diff", "--check", receipt.range]));
}

function verifyPush(runGit, receipt, beforeSha) {
  if (beforeSha === null || beforeSha === undefined || beforeSha === "") {
    return sealReceipt(receipt, "incomplete", "missing_before_sha");
  }
  if (!validCommit(beforeSha)) {
    return sealReceipt(receipt, "incomplete", "invalid_before_sha");
  }
  receipt.before_sha = beforeSha;

  if (beforeSha === ZERO_COMMIT) {
    return finishCheck(receipt, runGit(["show", "--check", "--format=", "HEAD"]));
  }
  if (!verifyCommitExists(runGit, beforeSha)) {
    return sealReceipt(receipt, "incomplete", "before_unavailable");
  }
  receipt.range = `${beforeSha}..HEAD`;
  receipt.resolved_range = `${beforeSha}..${receipt.head_sha}`;
  return finishCheck(receipt, runGit(["diff", "--check", receipt.range]));
}

/**
 * Verify the exact whitespace surface represented by a local worktree, a pull
 * request, or a push. Missing Git objects and CI metadata are incomplete rather
 * than successful, so callers cannot accidentally convert missing evidence to
 * a pass.
 */
export function verifyCommittedWhitespace({
  cwd = process.cwd(),
  mode = "local",
  baseSha = null,
  beforeSha = null,
  gitCommand = "git",
  spawnSyncImpl = spawnSync,
} = {}) {
  const receipt = createReceipt(mode);
  if (!COMMITTED_WHITESPACE_MODES.includes(mode)) {
    return sealReceipt(receipt, "incomplete", "invalid_mode");
  }
  const runGit = createGitRunner({ cwd, gitCommand, spawnSyncImpl, receipt });
  const headFailure = checkHead(runGit, receipt);
  if (headFailure) return headFailure;

  if (mode === "local") return verifyLocal(runGit, receipt);
  if (mode === "pull_request") return verifyPullRequest(runGit, receipt, baseSha);
  return verifyPush(runGit, receipt, beforeSha);
}

export function committedWhitespaceRequestFromEnvironment(env = process.env) {
  const eventName = env.GITHUB_EVENT_NAME ?? null;
  const inferredMode = ["pull_request", "pull_request_target"].includes(eventName)
    ? "pull_request"
    : eventName === "push"
      ? "push"
      : "local";
  return {
    mode: env.OPENCODE_HARNESS_WHITESPACE_MODE ?? inferredMode,
    baseSha: env.OPENCODE_HARNESS_WHITESPACE_BASE_SHA ?? env.GITHUB_BASE_SHA ?? null,
    beforeSha: env.OPENCODE_HARNESS_WHITESPACE_BEFORE_SHA ?? env.GITHUB_EVENT_BEFORE ?? null,
  };
}
