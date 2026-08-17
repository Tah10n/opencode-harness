import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ProfileV3Error } from "../lib/profile-v3.mjs";
import { buildVnextPromotionDecisionFromRun } from "../lib/benchmark/vnext-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  const values = process.argv.slice(2);
  if (values.length !== 2 || values[0] !== "--run") {
    throw new ProfileV3Error("VNEXT_PROMOTION_ARGUMENT", "usage: --run <vnext-run-envelope.json>");
  }
  const lexical = path.resolve(values[1]);
  const relative = path.relative(root, lexical);
  const stat = fs.lstatSync(lexical);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
    || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new ProfileV3Error("VNEXT_PROMOTION_PATH", "run envelope must be a repository-confined single-link file");
  }
  const decision = buildVnextPromotionDecisionFromRun({
    repositoryRoot: root,
    envelope: JSON.parse(fs.readFileSync(lexical, "utf8")),
  });
  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
  if (!decision.promotable) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${error instanceof ProfileV3Error ? error.code : "VNEXT_PROMOTION_UNEXPECTED"}: ${error.message}\n`);
  process.exitCode = 1;
}
