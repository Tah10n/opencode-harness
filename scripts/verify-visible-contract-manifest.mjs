import assert from "node:assert/strict";

import {
  buildVisibleContractManifest,
  renderVisibleContractManifest,
} from "../lib/quality/visible-contract-manifest.mjs";

const manifest = buildVisibleContractManifest({
  visible_requirements: "Case demo, data variant alpha: Resolve precedence to defaults < user < runtime, preserve explicit null, ignore undefined, and never mutate inputs. Task scope: modify only these visible repository paths: `src/task.mjs`.",
  task_scope: {
    mode: "edit",
    allowed_changed_paths: ["src/task.mjs"],
    max_changed_files: 1,
  },
});
assert.equal(manifest.schema_version, 1);
assert.equal(manifest.producer, "host-visible-contract-compiler");
assert.deepEqual(manifest.task_scope.allowed_changed_paths, ["src/task.mjs"]);
assert(manifest.clauses.some((entry) => entry.category === "ordering"));
assert(manifest.clauses.some((entry) => entry.category === "preservation"));
assert(manifest.clauses.some((entry) => entry.category === "boundary"));
assert.match(manifest.manifest_fingerprint, /^sha256:[a-f0-9]{64}$/u);
assert.match(renderVisibleContractManifest(manifest), /^HOST_VISIBLE_CONTRACT_V1=/u);
assert.equal(JSON.stringify(manifest).includes("Task scope:"), false);

const repeated = buildVisibleContractManifest({
  visible_requirements: "Case demo, data variant alpha: Resolve precedence to defaults < user < runtime, preserve explicit null, ignore undefined, and never mutate inputs. Task scope: modify only these visible repository paths: `src/task.mjs`.",
  task_scope: {
    mode: "edit",
    allowed_changed_paths: ["src/task.mjs"],
    max_changed_files: 1,
  },
});
assert.deepEqual(repeated, manifest);

assert.throws(() => buildVisibleContractManifest({
  visible_requirements: "Change the file.",
  task_scope: { mode: "edit", allowed_changed_paths: ["../escape"], max_changed_files: 1 },
}), /VISIBLE_CONTRACT_MANIFEST_PATH/u);
assert.throws(() => buildVisibleContractManifest({
  visible_requirements: "Change the file.",
  task_scope: { mode: "read-only", allowed_changed_paths: ["src/task.mjs"], max_changed_files: 1 },
}), /VISIBLE_CONTRACT_MANIFEST_SCOPE/u);

console.log("visible contract manifest passed");
