#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createPrivateKey } from "node:crypto";

import { validateBenchmarkV3IssuerRoleSeparation } from "../lib/benchmark/v3-issuer-separation.mjs";
import { verifyBenchmarkV3OperatorRegistryKeys } from "../lib/benchmark/v3-operator-custody.mjs";
import { runBenchmarkV3OperatorProbes } from "../lib/benchmark/v3-operator-probes.mjs";
import { absoluteOperatorArgument, parseBenchmarkV3OperatorArguments, printOperatorResult } from "../lib/benchmark/v3-operator-cli.mjs";

const values = parseBenchmarkV3OperatorArguments(process.argv.slice(2));
const sourceRoot = path.resolve(values.get("source-root") ?? process.cwd());
const sourceFiles = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: sourceRoot, encoding: "buffer", shell: false, windowsHide: true,
});
if (sourceFiles.status !== 0 || sourceFiles.signal !== null || sourceFiles.error !== undefined) {
  throw new Error("source inventory is unavailable");
}
const privateKeyFiles = sourceFiles.stdout.toString("utf8").split("\0").filter(Boolean).filter((file) => {
  const candidate = path.join(sourceRoot, file);
  try {
    const stat = fs.lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) return false;
    createPrivateKey(fs.readFileSync(candidate));
    return true;
  } catch { return false; }
});
if (privateKeyFiles.length !== 0) {
  throw new Error("source inventory contains parseable private key material");
}
const roles = verifyBenchmarkV3OperatorRegistryKeys({ sourceRoot,
  custodyRoot: absoluteOperatorArgument(values, "custody-root"), ownerUid: 0 });
const separation = validateBenchmarkV3IssuerRoleSeparation(sourceRoot);
const probes = await runBenchmarkV3OperatorProbes({ sourceRoot,
  opencodeExecutable: absoluteOperatorArgument(values, "opencode") });
printOperatorResult({ schema_version: 1, status: "passed", private_keys_tracked: false, roles,
  issuer_separation: separation, probe_fingerprint: probes.probe_fingerprint,
  opencode_executable_fingerprint: probes.opencode_executable_fingerprint });
