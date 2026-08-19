import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateBenchmarkV2FreezeManifest } from "../lib/benchmark/v2-freeze.mjs";
import { resolveSyntheticOpenCodeExecutableIdentity } from "../lib/benchmark/opencode-adapter.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const values = process.argv.slice(2);
if (values.length !== 4 || values[0] !== "--manifest" || values[2] !== "--fingerprint") {
  throw new Error("usage: --manifest <workspace-relative-json> --fingerprint <sha256>");
}
const relativePath = values[1];
const expectedFingerprint = values[3];
if (relativePath.startsWith("/") || relativePath.includes("\\") || !/^sha256:[0-9a-f]{64}$/u.test(expectedFingerprint)) {
  throw new Error("freeze manifest path or fingerprint is invalid");
}
const target = path.resolve(root, ...relativePath.split("/"));
const relative = path.relative(root, target).split(path.sep).join("/");
const stat = fs.lstatSync(target);
if (relative !== relativePath || !relative.startsWith(".oc_harness/benchmark-v2/freezes/")
  || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 2 || stat.size > 1024 * 1024) {
  throw new Error("freeze manifest path is unsafe or unbounded");
}
const saltPath = path.join(root, ".oc_harness", "benchmark-v2", "private", "holdout-salt.v2.txt");
const saltStat = fs.lstatSync(saltPath);
if (!saltStat.isFile() || saltStat.isSymbolicLink() || saltStat.nlink !== 1 || saltStat.size !== 65) {
  throw new Error("salt preimage is unsafe or invalid");
}
const manifest = JSON.parse(fs.readFileSync(target, "utf8"));
const salt = fs.readFileSync(saltPath, "utf8").trim();
const executableIdentity = resolveSyntheticOpenCodeExecutableIdentity();
if (executableIdentity === null) throw new Error("OpenCode executable identity is unavailable");
validateBenchmarkV2FreezeManifest(manifest, {
  repositoryRoot: root,
  salt,
  expectedFreezeFingerprint: expectedFingerprint,
  observedExecutableFingerprint: executableIdentity.fingerprint,
});
process.stdout.write(`${JSON.stringify({
  status: "validated-frozen-pre-selection",
  freeze_fingerprint: manifest.freeze_fingerprint,
  holdout_seed: manifest.holdout_seed,
  artifact_files: [relativePath],
})}\n`);
