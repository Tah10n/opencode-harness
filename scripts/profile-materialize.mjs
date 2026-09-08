import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { materializeNativeTemplate } from "../lib/native-template.mjs";

function argumentError(message) {
  return Object.assign(new Error(`PROFILE_V3_ARGUMENT: ${message}`), { code: "PROFILE_V3_ARGUMENT" });
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArguments(values) {
  const result = { profile: null, output: null, dryRun: false, force: false, allowDirty: false, native: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--native") result.native = true;
    else if (value === "--dry-run") result.dryRun = true;
    else if (value === "--force") result.force = true;
    else if (value === "--allow-dirty") result.allowDirty = true;
    else if (value === "--profile" || value === "--output") {
      const next = values[index + 1];
      if (typeof next !== "string" || next.startsWith("--")) {
        throw argumentError(`${value} requires a value`);
      }
      result[value.slice(2)] = next;
      index += 1;
    } else {
      throw argumentError(`unknown argument ${value}`);
    }
  }
  if (result.profile === null || result.output === null) {
    throw argumentError("--profile and --output are required");
  }
  return result;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.native && (options.profile !== 'core' || options.force || options.allowDirty)) {
    throw argumentError('--native supports core only, without --force or --allow-dirty');
  }
  const result = options.native ? materializeNativeTemplate({
    repositoryRoot: root,
    outputDirectory: options.output,
    dryRun: options.dryRun,
  }) : (await import("../lib/profile-v3.mjs")).materializeProfileBundleV3({
    repositoryRoot: root,
    bundleId: options.profile,
    outputDirectory: options.output,
    dryRun: options.dryRun,
    overwrite: options.force,
    allowDirty: options.allowDirty,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const code = typeof error.code === "string" && error.code.startsWith("PROFILE_V3_") ? error.code : "PROFILE_V3_UNEXPECTED";
  process.stderr.write(`${code}: ${error.message}\n`);
  process.exitCode = 1;
}
