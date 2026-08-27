#!/usr/bin/env node
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createPrivateKey } from "node:crypto";

import { validateBenchmarkV3IssuerRoleSeparation } from "../lib/benchmark/v3-issuer-separation.mjs";
import { verifyBenchmarkV3OperatorRegistryKeys } from "../lib/benchmark/v3-operator-custody.mjs";
import { runBenchmarkV3OperatorProbes } from "../lib/benchmark/v3-operator-probes.mjs";
import { runBenchmarkV3IsolatedSemanticCase } from "../lib/benchmark/v3-operator-semantic.mjs";
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
const semanticFixture = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "benchmark-v3-semantic-smoke-"));
let semantic;
try {
  const repository = path.join(semanticFixture, "repository");
  const runtime = path.join(semanticFixture, "runtime", "fixture", "node_modules", "mocha", "bin");
  fs.mkdirSync(repository, { recursive: true, mode: 0o700 });
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(repository, "test.js"), "// isolated semantic fixture\n", { mode: 0o600 });
  fs.writeFileSync(path.join(runtime, "mocha.js"), [
    "const fs=require('node:fs');",
    "if(process.getuid?.()===0)process.exit(10);",
    "try{fs.readFileSync('/var/lib/opencode-harness/custody/keys/readiness.private.pem');process.exit(11)}catch{}",
    "try{fs.writeFileSync('/workspace/forbidden','x');process.exit(12)}catch{}",
    "process.stdout.write(JSON.stringify({stats:{tests:1,passes:1,failures:0,pending:0}}));",
  ].join(""), { mode: 0o500 });
  semantic = runBenchmarkV3IsolatedSemanticCase({ repository,
    semanticRuntimeRoot: path.join(semanticFixture, "runtime"), runtimeKey: "fixture",
    testArgv: ["test.js"], expectedTestCount: 1 });
} finally { fs.rmSync(semanticFixture, { recursive: true, force: true }); }
if (!semantic.passed || !semantic.isolated_non_root || !semantic.network_unshared) {
  throw new Error(`external semantic calibration isolation smoke failed (${semantic.failure_class ?? "semantic-failure"})`);
}
printOperatorResult({ schema_version: 1, status: "passed", private_keys_tracked: false, roles,
  issuer_separation: separation, probe_fingerprint: probes.probe_fingerprint,
  opencode_executable_fingerprint: probes.opencode_executable_fingerprint,
  isolated_semantic_calibration: true });
