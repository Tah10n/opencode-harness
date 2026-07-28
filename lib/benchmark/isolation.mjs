import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ContractError } from "../feedback/contracts.mjs";
import {
  assertConfinedExistingPath,
  assertConfinedTree,
  assertNoSymlinkEscape,
  ensureConfinedDirectory,
  isInside,
} from "../feedback/files.mjs";
import { changedOrdinaryTreePaths } from "../feedback/evidence.mjs";

const canonicalTemporaryRoot = fs.realpathSync.native(path.resolve(os.tmpdir()));
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;

function fail(code, message) {
  throw new ContractError(code, message);
}

function assertSafeSegment(value, label, code) {
  if (typeof value !== "string" || !SAFE_SEGMENT.test(value)) {
    fail(code, `${label} must be a bounded path-safe identifier`);
  }
}

function lstatExists(targetPath) {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function createConfinedTemporaryDirectory(prefix, {
  contractCode = "ISOLATION_TEMP_ROOT",
  contractMessage = "temporary root must be physically canonical",
} = {}) {
  assertSafeSegment(prefix, "temporary directory prefix", contractCode);
  const prefixPath = path.resolve(canonicalTemporaryRoot, prefix);
  if (!isInside(canonicalTemporaryRoot, prefixPath)) {
    fail(contractCode, "temporary directory prefix must remain inside the canonical temporary root");
  }
  const temporaryRoot = fs.mkdtempSync(path.join(canonicalTemporaryRoot, prefix));
  const canonicalTemporaryDirectory = fs.realpathSync.native(temporaryRoot);
  if (
    canonicalTemporaryDirectory !== temporaryRoot
    || !isInside(canonicalTemporaryRoot, canonicalTemporaryDirectory)
  ) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    fail(contractCode, contractMessage);
  }
  return temporaryRoot;
}

export function prepareIsolatedFixture({
  scenarioId,
  fixturePath,
  profileId,
  sourceRoot,
  temporaryPrefix = "opencode-isolated",
  fixtureContractCode = "ISOLATION_FIXTURE",
  temporaryRootContractCode = "ISOLATION_TEMP_ROOT",
}) {
  assertSafeSegment(scenarioId, "scenarioId", fixtureContractCode);
  assertSafeSegment(profileId, "profileId", fixtureContractCode);
  assertSafeSegment(temporaryPrefix, "temporaryPrefix", fixtureContractCode);
  if (typeof fixturePath !== "string" || fixturePath.length === 0) {
    fail(fixtureContractCode, `validated fixture is unavailable for ${scenarioId}`);
  }

  const resolvedSourceRoot = path.resolve(sourceRoot);
  const source = path.resolve(resolvedSourceRoot, fixturePath);
  if (!isInside(resolvedSourceRoot, source)) {
    fail(fixtureContractCode, `validated fixture is unavailable for ${scenarioId}`);
  }
  try {
    assertConfinedTree(resolvedSourceRoot, source);
  } catch {
    fail(fixtureContractCode, `validated fixture is not a physically confined ordinary tree for ${scenarioId}`);
  }

  const temporaryRoot = createConfinedTemporaryDirectory(
    `${temporaryPrefix}-${scenarioId}-${profileId}-`,
    {
      contractCode: temporaryRootContractCode,
      contractMessage: "isolated temporary root must be physically canonical",
    },
  );
  const repo = path.join(temporaryRoot, "repo");
  try {
    fs.cpSync(source, repo, { recursive: true, errorOnExist: true });
    assertConfinedTree(temporaryRoot, repo);
    return Object.freeze({ temporaryRoot, repo });
  } catch (error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

export function stageIsolatedFiles({
  scenarioId,
  files,
  repo,
  sourceRoot,
  pathContractCode = "ISOLATION_HIDDEN_PATH",
  collisionContractCode = "ISOLATION_HIDDEN_COLLISION",
}) {
  assertSafeSegment(scenarioId, "scenarioId", pathContractCode);
  if (!Array.isArray(files)) fail(pathContractCode, "files must be an array");

  const resolvedSourceRoot = path.resolve(sourceRoot);
  const resolvedRepo = path.resolve(repo);
  for (const entry of files) {
    if (!entry || typeof entry.source !== "string" || typeof entry.target !== "string") {
      fail(pathContractCode, `hidden file entry is invalid for ${scenarioId}`);
    }
    const source = path.resolve(resolvedSourceRoot, entry.source);
    const target = path.resolve(resolvedRepo, entry.target);
    if (!isInside(resolvedSourceRoot, source) || !isInside(resolvedRepo, target)) {
      fail(pathContractCode, `hidden file path is invalid for ${scenarioId}`);
    }
    assertConfinedExistingPath(resolvedSourceRoot, source, { type: "file" });
    if (lstatExists(target)) {
      fail(collisionContractCode, `hidden target already exists for ${scenarioId}`);
    }
    assertNoSymlinkEscape(resolvedRepo, target);
    ensureConfinedDirectory(resolvedRepo, path.dirname(target));
    assertNoSymlinkEscape(resolvedRepo, target);
    assertConfinedExistingPath(resolvedSourceRoot, source, { type: "file" });
    if (lstatExists(target)) {
      fail(collisionContractCode, `hidden target already exists for ${scenarioId}`);
    }
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    assertConfinedExistingPath(resolvedRepo, target, { type: "file" });
  }
}

export function evaluateWorkspacePolicy({ workspacePolicy, beforeManifest, afterManifest }) {
  if (!workspacePolicy || typeof workspacePolicy.mode !== "string") {
    fail("ISOLATION_WORKSPACE_POLICY", "workspace policy is required");
  }
  const allowedPaths = new Set(workspacePolicy.mode === "allowlist"
    ? workspacePolicy.allowed_paths
    : []);
  const changedPaths = changedOrdinaryTreePaths(beforeManifest, afterManifest);
  const unexpectedPaths = changedPaths.filter((relativePath) => !allowedPaths.has(relativePath));
  return Object.freeze({
    passed: unexpectedPaths.length === 0,
    changedPaths: Object.freeze(changedPaths),
    unexpectedPaths: Object.freeze(unexpectedPaths),
  });
}
