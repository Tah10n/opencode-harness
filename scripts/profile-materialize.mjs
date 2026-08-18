import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  ProfileV3Error,
  materializeProfileBundleV3,
} from "../lib/profile-v3.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArguments(values) {
  const result = { profile: null, output: null, dryRun: false, force: false, allowDirty: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--dry-run") result.dryRun = true;
    else if (value === "--force") result.force = true;
    else if (value === "--allow-dirty") result.allowDirty = true;
    else if (value === "--profile" || value === "--output") {
      const next = values[index + 1];
      if (typeof next !== "string" || next.startsWith("--")) {
        throw new ProfileV3Error("PROFILE_V3_ARGUMENT", `${value} requires a value`);
      }
      result[value.slice(2)] = next;
      index += 1;
    } else {
      throw new ProfileV3Error("PROFILE_V3_ARGUMENT", `unknown argument ${value}`);
    }
  }
  if (result.profile === null || result.output === null) {
    throw new ProfileV3Error("PROFILE_V3_ARGUMENT", "--profile and --output are required");
  }
  return result;
}

try {
  const options = parseArguments(process.argv.slice(2));
  const result = materializeProfileBundleV3({
    repositoryRoot: root,
    bundleId: options.profile,
    outputDirectory: options.output,
    dryRun: options.dryRun,
    overwrite: options.force,
    allowDirty: options.allowDirty,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const code = error instanceof ProfileV3Error ? error.code : "PROFILE_V3_UNEXPECTED";
  process.stderr.write(`${code}: ${error.message}\n`);
  process.exitCode = 1;
}
