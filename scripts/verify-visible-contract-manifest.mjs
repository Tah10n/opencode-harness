import assert from "node:assert/strict";

import {
  buildVisibleContractManifest,
  renderVisibleContractManifest,
} from "../lib/quality/visible-contract-manifest.mjs";

const input = {
  visible_requirements: "Case demo, data variant alpha: Resolve precedence to defaults < user < runtime, preserve explicit null, ignore undefined, and never mutate inputs. Task scope: modify only these visible repository paths: `src/task.mjs`.",
  task_scope: {
    mode: "edit",
    allowed_changed_paths: ["src/task.mjs"],
    max_changed_files: 1,
  },
};
const legacyManifest = buildVisibleContractManifest(input);
assert.equal(legacyManifest.schema_version, 1);
assert.equal(legacyManifest.producer, "host-visible-contract-compiler");
assert(legacyManifest.clauses.every((entry) => !Object.hasOwn(entry, "review_focus")));
assert.match(renderVisibleContractManifest(legacyManifest), /^HOST_VISIBLE_CONTRACT_V1=/u);

const manifest = buildVisibleContractManifest({ ...input, scenario_typed: true });
assert.equal(manifest.schema_version, 2);
assert.equal(manifest.producer, "host-visible-contract-compiler-v2");
assert.deepEqual(manifest.task_scope.allowed_changed_paths, ["src/task.mjs"]);
assert(manifest.clauses.some((entry) => entry.category === "ordering"));
assert(manifest.clauses.some((entry) => entry.category === "preservation"));
assert(manifest.clauses.some((entry) => entry.category === "boundary"));
assert(manifest.clauses.every((entry) => typeof entry.review_focus === "string" && entry.review_focus.length > 0));
assert.match(
  manifest.clauses.find((entry) => entry.category === "boundary").review_focus,
  /explicitly named/u,
);
assert.match(manifest.manifest_fingerprint, /^sha256:[a-f0-9]{64}$/u);
assert.match(renderVisibleContractManifest(manifest), /^HOST_VISIBLE_CONTRACT_V2=/u);
assert.equal(JSON.stringify(manifest).includes("Task scope:"), false);

const repeated = buildVisibleContractManifest({ ...input, scenario_typed: true });
assert.deepEqual(repeated, manifest);

assert.throws(() => buildVisibleContractManifest({
  visible_requirements: "Change the file.",
  task_scope: { mode: "edit", allowed_changed_paths: ["../escape"], max_changed_files: 1 },
}), /VISIBLE_CONTRACT_MANIFEST_PATH/u);
assert.throws(() => buildVisibleContractManifest({
  visible_requirements: "Change the file.",
  task_scope: { mode: "read-only", allowed_changed_paths: ["src/task.mjs"], max_changed_files: 1 },
}), /VISIBLE_CONTRACT_MANIFEST_SCOPE/u);
assert.throws(() => renderVisibleContractManifest({ schema_version: 3 }), /VISIBLE_CONTRACT_MANIFEST_SCHEMA/u);

console.log("visible contract manifest passed");
