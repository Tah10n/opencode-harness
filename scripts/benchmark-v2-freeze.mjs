import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  buildBenchmarkV2FreezeManifest,
  writeBenchmarkV2FreezeManifest,
} from "../lib/benchmark/v2-freeze.mjs";
import { resolveSyntheticOpenCodeExecutableIdentity } from "../lib/benchmark/opencode-adapter.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parse(values) {
  const options = {
    round: null,
    workflowRunId: null,
    saltFile: ".oc_harness/benchmark-v2/private/holdout-salt.v2.txt",
    model: null,
    provider: null,
    variant: null,
    timeoutMs: 300_000,
    candidateProfileId: "P33",
    inspectOnly: false,
  };
  const mapping = {
    "--round": "round",
    "--workflow-run-id": "workflowRunId",
    "--salt-file": "saltFile",
    "--model": "model",
    "--provider": "provider",
    "--variant": "variant",
    "--timeout-ms": "timeoutMs",
    "--candidate-profile": "candidateProfileId",
  };
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (key === "--inspect-only") {
      options.inspectOnly = true;
      continue;
    }
    const property = mapping[key];
    const next = values[index + 1];
    if (property === undefined || typeof next !== "string" || next.startsWith("--")) throw new Error(`invalid argument ${key}`);
    options[property] = ["round", "timeoutMs"].includes(property) ? Number(next) : next;
    index += 1;
  }
  for (const key of ["round", "workflowRunId", "model", "provider", "variant"]) {
    if (options[key] === null) throw new Error(`missing ${key}`);
  }
  if (path.isAbsolute(options.saltFile) || options.saltFile.includes("\\")) throw new Error("salt file must be workspace-relative");
  return options;
}

try {
  const options = parse(process.argv.slice(2));
  const saltPath = path.resolve(root, ...options.saltFile.split("/"));
  const relativeSaltPath = path.relative(root, saltPath).split(path.sep).join("/");
  const stat = fs.lstatSync(saltPath);
  if (relativeSaltPath !== options.saltFile || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== 65) {
    throw new Error("salt file is unsafe or invalid");
  }
  const salt = fs.readFileSync(saltPath, "utf8").trim();
  const executableIdentity = resolveSyntheticOpenCodeExecutableIdentity();
  if (executableIdentity === null) throw new Error("OpenCode executable identity is unavailable");
  const manifest = buildBenchmarkV2FreezeManifest({
    repositoryRoot: root,
    salt,
    ...options,
    executableFingerprint: executableIdentity.fingerprint,
  });
  if (options.inspectOnly) {
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } else {
    const manifestPath = writeBenchmarkV2FreezeManifest(root, manifest, { salt });
    process.stdout.write(`${JSON.stringify({
      status: "frozen-pre-selection",
      manifest_path: manifestPath,
      freeze_fingerprint: manifest.freeze_fingerprint,
      holdout_seed: manifest.holdout_seed,
    }, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${error.code ?? "BENCHMARK_V2_FREEZE_UNEXPECTED"}: ${error.message}\n`);
  process.exitCode = 1;
}
