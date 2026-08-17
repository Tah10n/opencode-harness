import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ProfileV3Error } from "../lib/profile-v3.mjs";
import {
  blockedVnextRunReport,
  buildVnextExecutionPlan,
  loadVnextAdapterModule,
  validateVnextAdapterReport,
} from "../lib/benchmark/vnext-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArguments(values) {
  const result = {
    suite: null,
    estimand: null,
    model: null,
    provider: null,
    variant: null,
    seed: null,
    timeoutMs: 300_000,
    executableIdentity: null,
    adapter: null,
  };
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    const next = values[index + 1];
    if (!["--suite", "--estimand", "--model", "--provider", "--variant", "--seed",
      "--timeout-ms", "--executable-identity", "--adapter"].includes(key)
      || typeof next !== "string" || next.startsWith("--")) {
      throw new ProfileV3Error("VNEXT_RUN_ARGUMENT", `invalid argument ${key}`);
    }
    const property = {
      "--suite": "suite",
      "--estimand": "estimand",
      "--model": "model",
      "--provider": "provider",
      "--variant": "variant",
      "--seed": "seed",
      "--timeout-ms": "timeoutMs",
      "--executable-identity": "executableIdentity",
      "--adapter": "adapter",
    }[key];
    result[property] = key === "--timeout-ms" ? Number(next) : next;
    index += 1;
  }
  for (const required of ["suite", "estimand", "model", "provider", "seed", "executableIdentity"]) {
    if (result[required] === null) throw new ProfileV3Error("VNEXT_RUN_ARGUMENT", `--${required.replace(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`)} is required`);
  }
  return result;
}

try {
  const options = parseArguments(process.argv.slice(2));
  const loadedAdapter = options.adapter === null
    ? null
    : await loadVnextAdapterModule(root, path.resolve(options.adapter));
  const plan = buildVnextExecutionPlan({
    repositoryRoot: root,
    suiteId: options.suite,
    estimandId: options.estimand,
    model: options.model,
    provider: options.provider,
    variant: options.variant,
    seed: options.seed,
    timeoutMs: options.timeoutMs,
    executableIdentity: options.executableIdentity,
    adapterFingerprint: loadedAdapter?.fingerprint ?? "unconfigured",
  });
  if (options.adapter === null) {
    process.stdout.write(`${JSON.stringify(blockedVnextRunReport(
      plan,
      "vnext_execution_adapter_not_configured",
    ), null, 2)}\n`);
    process.exitCode = 2;
  } else {
    const adapter = loadedAdapter.module;
    if (typeof adapter.runVnextPlan !== "function") {
      throw new ProfileV3Error("VNEXT_ADAPTER_API", "adapter must export runVnextPlan(plan)");
    }
    const report = validateVnextAdapterReport(plan, await adapter.runVnextPlan(plan));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.status !== "complete") process.exitCode = 2;
  }
} catch (error) {
  const code = error instanceof ProfileV3Error ? error.code : "VNEXT_RUN_UNEXPECTED";
  process.stderr.write(`${code}: ${error.message}\n`);
  process.exitCode = 1;
}
