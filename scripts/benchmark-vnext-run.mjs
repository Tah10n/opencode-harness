import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ProfileV3Error, fingerprintProfileValue } from "../lib/profile-v3.mjs";
import { buildVnextExecutionPlan, executeVnextFull, executeVnextPlan } from "../lib/benchmark/vnext-runner.mjs";
import { resolveSyntheticOpenCodeExecutableIdentity } from "../lib/benchmark/opencode-adapter.mjs";

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
    planOnly: false,
  };
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (key === "--plan-only") {
      result.planOnly = true;
      continue;
    }
    const next = values[index + 1];
    if (!["--suite", "--estimand", "--model", "--provider", "--variant", "--seed",
      "--timeout-ms"].includes(key)
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
    }[key];
    result[property] = key === "--timeout-ms" ? Number(next) : next;
    index += 1;
  }
  for (const required of ["suite", "estimand", "model", "provider", "seed"]) {
    if (result[required] === null) throw new ProfileV3Error("VNEXT_RUN_ARGUMENT", `--${required.replace(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`)} is required`);
  }
  return result;
}

try {
  const options = parseArguments(process.argv.slice(2));
  const executableIdentity = resolveSyntheticOpenCodeExecutableIdentity();
  if (options.suite === "full" && options.planOnly) {
    throw new ProfileV3Error("VNEXT_FULL_GATE", "full has no plan-only mode; it requires an in-process trusted standard execution");
  }
  const common = {
    repositoryRoot: root,
    estimandId: options.estimand,
    model: options.model,
    provider: options.provider,
    variant: options.variant,
    seed: options.seed,
    timeoutMs: options.timeoutMs,
    executableIdentity: executableIdentity.fingerprint,
  };
  let plan;
  let report;
  if (options.suite === "full") {
    const executed = await executeVnextFull({ ...common, executableIdentity });
    plan = executed.plan;
    report = executed.report;
  } else {
    plan = buildVnextExecutionPlan({ ...common, suiteId: options.suite });
  }
  if (options.planOnly) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    process.exitCode = 0;
  } else {
    if (report === undefined) {
      report = await executeVnextPlan({ repositoryRoot: root, plan, executableIdentity });
    }
    const envelopeSource = {
      schema_version: 1,
      run_kind: "vnext-run-envelope",
      plan,
      report,
    };
    process.stdout.write(`${JSON.stringify({
      ...envelopeSource,
      envelope_fingerprint: fingerprintProfileValue(envelopeSource),
    }, null, 2)}\n`);
    if (report.status !== "complete") process.exitCode = 2;
  }
} catch (error) {
  const code = error instanceof ProfileV3Error ? error.code : "VNEXT_RUN_UNEXPECTED";
  process.stderr.write(`${code}: ${error.message}\n`);
  process.exitCode = 1;
}
