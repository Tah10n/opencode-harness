import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectInstalledContextToolSurface } from "../lib/quality/context-tool-overlay.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const overlayPath = path.join(root, "quality", "context-tool-overlays", "advanced-readonly.v1.json");

const MINIMAL_TOOLS = Object.freeze([
  "context_files",
  "context_outline",
  "context_read",
  "context_search",
]);
const ADVANCED_TOOLS = Object.freeze([
  "context_batch_read",
  "context_map",
  "context_related",
  "context_symbols",
]);
const FORBIDDEN_CAPABILITIES = Object.freeze(["network", "shell", "write"]);

function exactKeys(value, expected, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} keys drifted`);
}

function sortedUniqueStrings(value, expected, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  assert(value.every((entry) => typeof entry === "string" && entry.length > 0), `${label} must contain strings`);
  assert.equal(new Set(value).size, value.length, `${label} must be unique`);
  assert.deepEqual(value, [...value].sort(), `${label} must be sorted`);
  if (expected) assert.deepEqual(value, expected, `${label} changed`);
}

const overlay = JSON.parse(fs.readFileSync(overlayPath, "utf8").replace(/^\uFEFF/u, ""));
exactKeys(overlay, [
  "schema_version",
  "overlay_version",
  "overlay_id",
  "mode",
  "portable_default_unchanged",
  "portable_default_tools",
  "advanced_tool_grants",
  "allowed_risk_classes",
  "forbidden_capabilities",
  "persistence_behavior",
  "installed_runtime_states",
], "context tool overlay");

assert.equal(overlay.schema_version, 1);
assert.equal(overlay.overlay_version, "1.0.0");
assert.equal(overlay.overlay_id, "advanced-readonly-v1");
assert.equal(overlay.mode, "optional-host-overlay");
assert.equal(overlay.portable_default_unchanged, true, "the optional overlay must not alter the portable default");
assert.equal(overlay.persistence_behavior, "unchanged", "the overlay must not alter recursive-context persistence");
sortedUniqueStrings(overlay.portable_default_tools, MINIMAL_TOOLS, "portable_default_tools");
sortedUniqueStrings(overlay.allowed_risk_classes, ["critical", "high"], "allowed_risk_classes");
sortedUniqueStrings(overlay.forbidden_capabilities, FORBIDDEN_CAPABILITIES, "forbidden_capabilities");
sortedUniqueStrings(overlay.installed_runtime_states, [
  "advanced_available",
  "advanced_unavailable",
  "minimal_available",
  "unsupported_host_schema",
], "installed_runtime_states");

assert(Array.isArray(overlay.advanced_tool_grants), "advanced_tool_grants must be an array");
assert.equal(overlay.advanced_tool_grants.length, ADVANCED_TOOLS.length);
assert.deepEqual(
  overlay.advanced_tool_grants.map((entry) => entry.tool_id),
  ADVANCED_TOOLS,
  "advanced tool grants changed or are not sorted",
);
for (const [index, grant] of overlay.advanced_tool_grants.entries()) {
  exactKeys(grant, ["tool_id", "access", "capability"], `advanced_tool_grants[${index}]`);
  assert.equal(grant.access, "allow");
  assert.equal(grant.capability, "read_only");
  assert(grant.tool_id.startsWith("context_"), `${grant.tool_id} is outside the context tool family`);
  assert(!MINIMAL_TOOLS.includes(grant.tool_id), `${grant.tool_id} duplicates the portable default`);
}

const fullDetection = detectInstalledContextToolSurface({ tool_ids: [...MINIMAL_TOOLS, ...ADVANCED_TOOLS] });
assert.deepEqual(fullDetection, {
  host_schema: "supported",
  minimal_tools: "minimal_available",
  advanced_tools: "advanced_available",
  available_tool_ids: [...MINIMAL_TOOLS, ...ADVANCED_TOOLS].sort(),
});
const fallbackDetection = detectInstalledContextToolSurface({ tool_ids: [...MINIMAL_TOOLS] });
assert.deepEqual(fallbackDetection, {
  host_schema: "supported",
  minimal_tools: "minimal_available",
  advanced_tools: "advanced_unavailable",
  available_tool_ids: [...MINIMAL_TOOLS].sort(),
});
const partialDetection = detectInstalledContextToolSurface({ tool_ids: ["context_read"] });
assert.deepEqual(partialDetection, {
  host_schema: "supported",
  minimal_tools: "minimal_unavailable",
  advanced_tools: "advanced_unavailable",
  available_tool_ids: ["context_read"],
});
assert.deepEqual(detectInstalledContextToolSurface({ permissions: {} }), {
  host_schema: "unsupported_host_schema",
  minimal_tools: "unknown",
  advanced_tools: "unknown",
  available_tool_ids: [],
});

console.log("Context tool overlay self-test passed (portable default unchanged; optional advanced surface is read-only).");
