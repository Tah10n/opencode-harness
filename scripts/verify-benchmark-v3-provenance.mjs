#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(fs.readFileSync(path.join(root, "benchmarks", "v3", "corpus", "SOURCE.json"), "utf8"));
assert.equal(source.repository, "https://github.com/eslint/eslint");
assert.equal(source.source_commit, source.source_tip);
assert.match(source.source_commit, /^[0-9a-f]{40}$/u);
assert.equal(source.spdx_license, "MIT");
assert.match(source.provenance_bundle.sha256, /^sha256:[0-9a-f]{64}$/u);
assert.equal(source.provenance_bundle.size, 43987615);
assert.equal(source.provenance_bundle.redistribution_status, "excluded-from-git-and-release-assets");
for (const file of [source.third_party_notices, "THIRD_PARTY_LICENSE.txt"]) assert.equal(fs.statSync(path.join(root, "benchmarks", "v3", "corpus", file)).isFile(), true);
assert.equal(fs.statSync(path.join(root, source.materializer)).isFile(), true);
process.stdout.write(`${JSON.stringify({ status: "passed", evidence_class: "model-free-provenance-manifest-validation",
  raw_bundle_tracked: false, source_repository: source.repository, source_commit: source.source_commit,
  sha256: source.provenance_bundle.sha256, size: source.provenance_bundle.size, spdx_license: source.spdx_license })}\n`);
