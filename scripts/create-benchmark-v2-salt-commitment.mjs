import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fingerprintProfileValue } from "../lib/profile-v3.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const privateDirectory = path.join(root, ".oc_harness", "benchmark-v2", "private");
const privatePath = path.join(privateDirectory, "holdout-salt.v2.txt");
const commitmentPath = path.join(root, "benchmarks", "v2", "holdout", "salt-commitment.v2.json");

if (fs.existsSync(privatePath) || fs.existsSync(commitmentPath)) {
  throw new Error("benchmark v2 salt or commitment already exists; refusing to rotate a preregistered value");
}

fs.mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
const salt = randomBytes(32).toString("hex");
fs.writeFileSync(privatePath, `${salt}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
const source = {
  schema_version: 2,
  commitment_id: "benchmark-v2-holdout-preregistered-salt",
  algorithm: "profile-value-sha256-v1",
  commitment: fingerprintProfileValue(salt),
  created_before_holdout_selection: true,
  preimage_storage: "git-ignored-private-runtime-state",
};
fs.writeFileSync(commitmentPath, `${JSON.stringify(source, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o644,
});
process.stdout.write(`${JSON.stringify({
  status: "created",
  commitment: source.commitment,
  private_path: path.relative(root, privatePath),
  commitment_path: path.relative(root, commitmentPath),
})}\n`);
