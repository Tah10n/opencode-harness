import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  committedWhitespaceRequestFromEnvironment,
  verifyCommittedWhitespace,
} from "../lib/quality/whitespace.mjs";
import { fingerprint } from "../lib/quality/validation.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-whitespace-"));
const cli = fileURLToPath(new URL("./verify-committed-whitespace.mjs", import.meta.url));
const tests = [];

function test(name, callback) {
  tests.push({ name, callback });
}

function git(repo, ...args) {
  const result = spawnSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed:\n${result.stderr}`);
  return result.stdout.trim();
}

function repository(name, initialText = "export const value = 1;\n") {
  const repo = path.join(tempRoot, name);
  fs.mkdirSync(repo);
  git(repo, "init", "--quiet");
  git(repo, "config", "user.name", "Whitespace Fixture");
  git(repo, "config", "user.email", "fixture@example.invalid");
  fs.writeFileSync(path.join(repo, "sample.mjs"), initialText, "utf8");
  git(repo, "add", "sample.mjs");
  git(repo, "commit", "--quiet", "-m", "initial");
  return repo;
}

function head(repo) {
  return git(repo, "rev-parse", "HEAD");
}

function assertReceipt(receipt, status, reason = null) {
  assert.equal(receipt.status, status);
  assert.equal(receipt.reason, reason);
  assert.match(receipt.evidence_fingerprint, /^sha256:[0-9a-f]{64}$/u);
  const { evidence_fingerprint: ignored, ...input } = receipt;
  assert.equal(receipt.evidence_fingerprint, fingerprint(input));
  assert.ok(receipt.commands.every((command) => Array.isArray(command.argv) && "status" in command));
}

function hasArgv(receipt, expected) {
  return receipt.commands.some((entry) => JSON.stringify(entry.argv.slice(1)) === JSON.stringify(expected));
}

test("clean local repositories check the current committed diff", () => {
  const repo = repository("clean-local");
  const receipt = verifyCommittedWhitespace({ cwd: repo });
  assertReceipt(receipt, "passed");
  assert.equal(receipt.head_sha, head(repo));
  assert.equal(receipt.working_tree_state, "clean");
  assert.ok(hasArgv(receipt, ["show", "--check", "--format=", "HEAD"]));
});

test("normal bridge CLI invocation accepts the explicit JSON output flag", () => {
  const repo = repository("bridge-cli-json");
  const result = spawnSync(process.execPath, [cli, "--json", "--mode", "local", "--cwd", repo], {
    cwd: repo,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: {},
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "passed");
});

test("staged whitespace errors fail both local diff surfaces", () => {
  const repo = repository("staged-error");
  fs.writeFileSync(path.join(repo, "sample.mjs"), "export const value = 2; \n", "utf8");
  git(repo, "add", "sample.mjs");
  const receipt = verifyCommittedWhitespace({ cwd: repo, mode: "local" });
  assertReceipt(receipt, "failed", "whitespace_error");
  assert.equal(receipt.working_tree_state, "dirty");
  assert.ok(hasArgv(receipt, ["diff", "--check"]));
  assert.ok(hasArgv(receipt, ["diff", "--cached", "--check"]));
});

test("clean worktrees fail on whitespace errors in HEAD", () => {
  const repo = repository("committed-error");
  fs.writeFileSync(path.join(repo, "bad.mjs"), "export const bad = true; \t\n", "utf8");
  git(repo, "add", "bad.mjs");
  git(repo, "commit", "--quiet", "-m", "bad whitespace");
  const receipt = verifyCommittedWhitespace({ cwd: repo, mode: "local" });
  assertReceipt(receipt, "failed", "whitespace_error");
  assert.ok(hasArgv(receipt, ["show", "--check", "--format=", "HEAD"]));
});

test("pull requests check the merge-base range across multiple commits", () => {
  const repo = repository("pull-request");
  const baseSha = head(repo);
  fs.writeFileSync(path.join(repo, "bad.mjs"), "export const bad = true; \n", "utf8");
  git(repo, "add", "bad.mjs");
  git(repo, "commit", "--quiet", "-m", "first feature commit");
  fs.writeFileSync(path.join(repo, "second.mjs"), "export const second = true;\n", "utf8");
  git(repo, "add", "second.mjs");
  git(repo, "commit", "--quiet", "-m", "second feature commit");

  const receipt = verifyCommittedWhitespace({ cwd: repo, mode: "pull_request", baseSha });
  assertReceipt(receipt, "failed", "whitespace_error");
  assert.equal(receipt.base_sha, baseSha);
  assert.equal(receipt.merge_base_sha, baseSha);
  assert.equal(receipt.range, `${baseSha}..HEAD`);
  assert.equal(receipt.resolved_range, `${baseSha}..${head(repo)}`);
  assert.ok(hasArgv(receipt, ["diff", "--check", `${baseSha}..HEAD`]));
});

test("all-zero initial pushes check HEAD directly", () => {
  const repo = repository("initial-push", "export const initial = true; \n");
  const receipt = verifyCommittedWhitespace({
    cwd: repo,
    mode: "push",
    beforeSha: "0".repeat(40),
  });
  assertReceipt(receipt, "failed", "whitespace_error");
  assert.equal(receipt.before_sha, "0".repeat(40));
  assert.equal(receipt.range, null);
  assert.ok(hasArgv(receipt, ["show", "--check", "--format=", "HEAD"]));
});

test("normal pushes check before..HEAD", () => {
  const repo = repository("normal-push");
  const beforeSha = head(repo);
  fs.writeFileSync(path.join(repo, "bad.mjs"), "export const pushed = true; \n", "utf8");
  git(repo, "add", "bad.mjs");
  git(repo, "commit", "--quiet", "-m", "push commit");
  const receipt = verifyCommittedWhitespace({ cwd: repo, mode: "push", beforeSha });
  assertReceipt(receipt, "failed", "whitespace_error");
  assert.equal(receipt.range, `${beforeSha}..HEAD`);
  assert.equal(receipt.resolved_range, `${beforeSha}..${head(repo)}`);
});

test("missing or invalid CI metadata is incomplete", () => {
  const repo = repository("missing-metadata");
  assertReceipt(
    verifyCommittedWhitespace({ cwd: repo, mode: "pull_request" }),
    "incomplete",
    "missing_base_sha",
  );
  assertReceipt(
    verifyCommittedWhitespace({ cwd: repo, mode: "push", beforeSha: "HEAD~1" }),
    "incomplete",
    "invalid_before_sha",
  );
  assertReceipt(
    verifyCommittedWhitespace({ cwd: repo, mode: "push", beforeSha: "f".repeat(40) }),
    "incomplete",
    "before_unavailable",
  );

  const cliResult = spawnSync(process.execPath, [cli, "--mode", "push", "--cwd", repo], {
    cwd: repo,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: {},
  });
  assert.equal(cliResult.status, 2, cliResult.stderr);
  assert.equal(JSON.parse(cliResult.stdout).reason, "missing_before_sha");
});

test("unavailable Git is incomplete rather than passing", () => {
  const repo = repository("unavailable-git");
  const receipt = verifyCommittedWhitespace({
    cwd: repo,
    gitCommand: `git-does-not-exist-${process.pid}`,
  });
  assertReceipt(receipt, "incomplete", "git_unavailable");
  assert.equal(receipt.commands[0].status, null);
  assert.equal(receipt.commands[0].error_code, "ENOENT");
});

test("environment inference preserves explicit CI boundaries", () => {
  const base = "a".repeat(40);
  const before = "b".repeat(40);
  assert.deepEqual(committedWhitespaceRequestFromEnvironment({
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_BASE_SHA: base,
  }), { mode: "pull_request", baseSha: base, beforeSha: null });
  assert.deepEqual(committedWhitespaceRequestFromEnvironment({
    GITHUB_EVENT_NAME: "push",
    GITHUB_EVENT_BEFORE: before,
  }), { mode: "push", baseSha: null, beforeSha: before });
});

let failures = 0;
try {
  for (const entry of tests) {
    try {
      entry.callback();
      process.stdout.write(`ok - ${entry.name}\n`);
    } catch (error) {
      failures += 1;
      process.stderr.write(`not ok - ${entry.name}\n${error?.stack ?? error}\n`);
    }
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

if (failures > 0) process.exitCode = 1;
else process.stdout.write(`Committed whitespace fixtures passed (${tests.length} cases).\n`);
