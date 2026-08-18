import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ProfileV3Error } from "../lib/profile-v3.mjs";
import { executeVnextStandard } from "../lib/benchmark/vnext-runner.mjs";
import { resolveSyntheticOpenCodeExecutableIdentity } from "../lib/benchmark/opencode-adapter.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArguments(values) {
  const result = { estimand: null, model: null, provider: null, variant: null, seed: null, timeoutMs: 300_000 };
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    const next = values[index + 1];
    if (!["--estimand", "--model", "--provider", "--variant", "--seed", "--timeout-ms"].includes(key)
      || typeof next !== "string" || next.startsWith("--")) {
      throw new ProfileV3Error("VNEXT_PROMOTION_ARGUMENT", `invalid argument ${key}`);
    }
    const property = {
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
  for (const required of ["estimand", "model", "provider", "seed"]) {
    if (result[required] === null) {
      throw new ProfileV3Error("VNEXT_PROMOTION_ARGUMENT", `--${required} is required`);
    }
  }
  return result;
}

try {
  const options = parseArguments(process.argv.slice(2));
  const executableIdentity = resolveSyntheticOpenCodeExecutableIdentity();
  if (executableIdentity === null) {
    throw new ProfileV3Error("VNEXT_EXECUTABLE_UNAVAILABLE", "OpenCode executable identity is unavailable");
  }
  const result = await executeVnextStandard({
    repositoryRoot: root,
    estimandId: options.estimand,
    model: options.model,
    provider: options.provider,
    variant: options.variant,
    seed: options.seed,
    timeoutMs: options.timeoutMs,
    executableIdentity,
  });
  process.stdout.write(`${JSON.stringify({
    schema_version: 1,
    promotion_kind: "vnext-in-process-standard-promotion-result",
    run_envelope: result.envelope,
    decision: result.decision,
  }, null, 2)}\n`);
  if (!result.decision.promotable) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${error instanceof ProfileV3Error ? error.code : "VNEXT_PROMOTION_UNEXPECTED"}: ${error.message}\n`);
  process.exitCode = 1;
}
