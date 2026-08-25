#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import {
  CORE_CHECK_CATALOG_PATH,
  loadCoreVerificationCatalog,
  snapshotCoreWorkspace,
  verifyCoreWorkspaceMutation,
} from "./core-verification-runtime.mjs";

function parseArguments(values) {
  const separator = values.indexOf("--");
  if (separator === -1 || separator === values.length - 1) {
    throw new Error("usage: opencode-core --workspace PATH [--catalog PATH] [--opencode PATH] -- OPENCODE_ARGS...");
  }
  const options = { workspace: null, catalog: CORE_CHECK_CATALOG_PATH, opencode: "opencode", receiptFd: null };
  for (let index = 0; index < separator; index += 1) {
    const name = values[index];
    if (!["--workspace", "--catalog", "--opencode", "--receipt-fd"].includes(name) || index + 1 >= separator) {
      throw new Error(`invalid launcher option: ${name}`);
    }
    if (name === "--receipt-fd") {
      const descriptor = Number(values[index + 1]);
      if (descriptor !== 3) throw new Error("--receipt-fd is invalid");
      options.receiptFd = descriptor;
    } else options[name.slice(2)] = values[index + 1];
    index += 1;
  }
  if (options.workspace === null) throw new Error("--workspace is required");
  return { ...options, opencodeArgs: values.slice(separator + 1) };
}

try {
  const options = parseArguments(process.argv.slice(2));
  const workspace = path.resolve(options.workspace);
  const catalog = loadCoreVerificationCatalog(workspace, { catalogPath: options.catalog });
  const before = snapshotCoreWorkspace(workspace);
  const child = spawnSync(options.opencode, options.opencodeArgs, {
    cwd: workspace,
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: options.receiptFd === null ? "inherit" : ["inherit", "inherit", "inherit", "ignore"],
  });
  if (child.error !== undefined || child.signal !== null || child.status !== 0) {
    process.exitCode = Number.isSafeInteger(child.status) && child.status !== 0 ? child.status : 21;
  } else {
    const after = snapshotCoreWorkspace(workspace);
    const verification = verifyCoreWorkspaceMutation({ catalog, before, after });
    const receipt = `${JSON.stringify({
      schema_version: 1,
      catalog_fingerprint: catalog.catalog_fingerprint,
      catalog_status: catalog.catalog_status,
      decision: verification.decision,
      activation: verification.observation,
      check: verification.check,
    })}\n`;
    if (options.receiptFd === null) process.stderr.write(`[opencode-harness-core] ${receipt}`);
    else fs.writeSync(options.receiptFd, receipt, null, "utf8");
    process.exitCode = verification.decision.allowed ? 0 : 20;
  }
} catch (error) {
  process.stderr.write(`[opencode-harness-core] ${error.message}\n`);
  process.exitCode = 21;
}
