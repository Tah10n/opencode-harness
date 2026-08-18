import fs from "node:fs";
import path from "node:path";

import { materializeProfileBundleV3 } from "../../lib/profile-v3.mjs";

const [repositoryRoot, outputDirectory, failureMode = "double-failure"] = process.argv.slice(2);
if (!repositoryRoot || !outputDirectory || !["double-failure", "ambiguous-backup"].includes(failureMode)) {
  throw new Error("repository root, output directory, and a valid failure mode are required");
}

const destination = fs.realpathSync.native(path.resolve(outputDirectory));
const baseName = path.basename(destination);
let publishRejected = false;
let rollbackRejected = false;
let ambiguousBackupRejected = false;
const renameCalls = [];

const injectedRenameSync = (source, target) => {
  const sourceName = path.basename(String(source));
  const targetName = path.basename(String(target));
  renameCalls.push({ source: String(source), target: String(target) });
  if (failureMode === "ambiguous-backup"
    && path.resolve(String(source)) === destination
    && targetName.startsWith(`.${baseName}.backup-`)) {
    fs.renameSync(source, target);
    ambiguousBackupRejected = true;
    throw new Error("injected ambiguous backup rename failure");
  }
  if (failureMode === "double-failure"
    && path.resolve(String(target)) === destination
    && sourceName.startsWith(`.${baseName}.staging-`)) {
    publishRejected = true;
    throw new Error("injected staging publish failure");
  }
  if (failureMode === "double-failure"
    && path.resolve(String(target)) === destination
    && sourceName.startsWith(`.${baseName}.backup-`)) {
    rollbackRejected = true;
    throw new Error("injected backup rollback failure");
  }
  return fs.renameSync(source, target);
};

let failed = false;
let caughtMessage = null;
try {
  materializeProfileBundleV3({
    repositoryRoot,
    bundleId: "core",
    outputDirectory: destination,
    overwrite: true,
    allowDirty: true,
    testRenameOperation: injectedRenameSync,
  });
} catch (error) {
  caughtMessage = String(error?.message);
  failed = failureMode === "double-failure"
    ? /injected backup rollback failure/u.test(caughtMessage)
    : /injected ambiguous backup rename failure/u.test(caughtMessage);
}

const expectedFailuresObserved = failureMode === "double-failure"
  ? publishRejected && rollbackRejected
  : ambiguousBackupRejected;
if (!failed || !expectedFailuresObserved) {
  throw new Error(`rename failure path was not exercised: ${JSON.stringify({
    failureMode,
    failed,
    publishRejected,
    rollbackRejected,
    ambiguousBackupRejected,
    caughtMessage,
    renameCalls,
  })}`);
}
