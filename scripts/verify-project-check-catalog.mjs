import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  PROJECT_CHECK_CATALOG_PATH,
  PROJECT_CHECK_CATALOG_SCHEMA_VERSION,
  PROJECT_CHECK_LIMITS,
  loadProjectCheckCatalog,
  parseProjectCheckCatalog,
  projectCheckCatalogFingerprint,
  projectCatalogToEngineeringCatalog,
  validateProjectCheckCatalog,
} from "../lib/quality/project-check-catalog.mjs";
import { ContractError } from "../lib/quality/validation.mjs";
import {
  DETERMINISTIC_STAGE_REGISTRY,
  deterministicStageEnvironment,
} from "./verify-all.mjs";

const workspaceRoot = fs.realpathSync(new URL("..", import.meta.url));

function expectCode(callback, code) {
  assert.throws(callback, (error) => error instanceof ContractError && error.code === code, `expected ${code}`);
}

function outcomeProtocol(overrides = {}) {
  return {
    kind: "exit_code",
    exit_codes: {
      failing_reproducer: [1],
      passing_regression: [0],
      unrelated_failure: [2],
      unavailable: [125],
    },
    ...overrides,
  };
}

function check(overrides = {}) {
  return {
    check_id: "fixture",
    executable_id: "node",
    argv: ["--version"],
    cwd: ".",
    phases: ["preimplementation", "integration"],
    purpose: "verification",
    timeout_ms: 1000,
    max_output_chars: 4096,
    ...overrides,
  };
}

function catalog(overrides = {}) {
  return {
    schema_version: PROJECT_CHECK_CATALOG_SCHEMA_VERSION,
    catalog_id: "fixture-checks-v2",
    checks: [check()],
    ...overrides,
  };
}

const schema = JSON.parse(fs.readFileSync(
  path.join(workspaceRoot, "quality", "schemas", "project-check-catalog.schema.json"),
  "utf8",
));
const example = JSON.parse(fs.readFileSync(
  path.join(workspaceRoot, "quality", "examples", "project-checks.example.json"),
  "utf8",
));
assert.equal(schema.properties.schema_version.const, PROJECT_CHECK_CATALOG_SCHEMA_VERSION);
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.checks.items.additionalProperties, false);
assert.equal(schema.properties.checks.items.properties.argv.minItems, undefined, "argv may be empty because it contains arguments only");
assert.match(schema.properties.checks.items.properties.executable_id.$comment, /logical ID/u);
assert.match(schema.properties.checks.items.properties.argv.$comment, /Arguments only/u);
assert.deepEqual(Object.keys(schema.$defs.outcomeProtocol.properties.exit_codes.properties).sort(), [
  "failing_reproducer", "passing_regression", "unavailable", "unrelated_failure",
]);

const validatedExample = validateProjectCheckCatalog(example);
assert.equal(validatedExample.schema_version, 2);
assert.equal(validatedExample.checks[0].purpose, "bug_reproducer");
assert.deepEqual(validatedExample.checks[0].generated_output_paths, ["coverage/orders"]);
assert.deepEqual(validatedExample.checks[1].generated_output_paths, []);
assert(Object.isFrozen(validatedExample));
assert.match(projectCheckCatalogFingerprint(validatedExample), /^sha256:[a-f0-9]{64}$/u);
const engineering = projectCatalogToEngineeringCatalog(validatedExample, "trusted-fixture");
assert.deepEqual(Object.keys(engineering.checks[0]).sort(), ["available", "check_id", "phases", "trusted_producer"]);

const productionCatalog = loadProjectCheckCatalog(workspaceRoot).catalog;
const recursiveCheckIds = new Set(["verify-all", "verify-trusted-project-runner"]);
const recursiveNpmScripts = new Set(["verify", "verify:trusted-project-runner"]);
const recursiveProductionChecks = productionCatalog.checks.filter((entry) => (
  recursiveCheckIds.has(entry.check_id)
  || (entry.executable_id === "npm"
    && ["run", "run-script"].includes(entry.argv[0])
    && recursiveNpmScripts.has(entry.argv[1]))
));
assert.deepEqual(
  recursiveProductionChecks,
  [],
  "production trusted checks must not recursively invoke verify-all or the trusted-runner verifier",
);
assert(
  DETERMINISTIC_STAGE_REGISTRY.some((entry) => entry.npm_script === "verify:trusted-project-runner"),
  "top-level verify-all must retain trusted-runner verification outside the production catalog",
);

const stageTemporaryKey = process.platform === "win32" ? "TEMP" : "TMPDIR";
const stageEnvironment = deterministicStageEnvironment({
  SAFE_VALUE: "preserved",
  OPENCODE_QUALITY_CGROUP_ROOT: "/poison/cgroup",
  OPENCODE_QUALITY_CGROUP_ATTACH_MODE: "poison-mode",
  OPENCODE_QUALITY_CGROUP_ATTACH_HELPER: "/poison/helper",
  OPENCODE_QUALITY_CGROUP_FUTURE_COORDINATOR: "poison-future-linux",
  OPENCODE_QUALITY_MACOS_CONTROLLER: "/poison/controller",
  OPENCODE_QUALITY_MACOS_WORKLOAD_UID: "501",
  OPENCODE_QUALITY_MACOS_UID_MARKER: "/poison/marker",
  OPENCODE_QUALITY_MACOS_UID_LEASE: "/poison/lease",
  OPENCODE_QUALITY_MACOS_FUTURE_COORDINATOR: "poison-future-macos",
  OPENCODE_QUALITY_WINDOWS_SENTINEL: "preserved-windows",
  [stageTemporaryKey]: workspaceRoot,
});
assert.deepEqual(stageEnvironment, {
  SAFE_VALUE: "preserved",
  OPENCODE_QUALITY_WINDOWS_SENTINEL: "preserved-windows",
  ...(process.platform === "win32"
    ? { TEMP: workspaceRoot, TMP: workspaceRoot }
    : { TMPDIR: workspaceRoot }),
}, "top-level verify-all must strip Linux/macOS coordination and publish a canonical stage temp root");

expectCode(() => parseProjectCheckCatalog("{"), "QUALITY_CHECK_CATALOG_JSON");
expectCode(() => validateProjectCheckCatalog({ ...catalog(), extra: true }), "CONTRACT_UNKNOWN_FIELD");
expectCode(() => validateProjectCheckCatalog({ ...catalog(), schema_version: 1 }), "QUALITY_CHECK_CATALOG_VERSION");
expectCode(() => validateProjectCheckCatalog(catalog({ checks: [] })), "QUALITY_ARRAY");
expectCode(() => validateProjectCheckCatalog(catalog({
  standard_lite_policy: { allowed_ownership_prefixes: ["."], protected_paths: [] },
})), "QUALITY_STANDARD_LITE_POLICY");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check(), check()],
})), "QUALITY_CHECK_DUPLICATE");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ shell: true })],
})), "CONTRACT_UNKNOWN_FIELD");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ executable_id: "C:\\Program Files\\node.exe" })],
})), "QUALITY_CHECK_EXECUTABLE_ID");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ argv: ["node", "--version"] })],
})), "QUALITY_CHECK_ARGV_EXECUTABLE");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ argv: "--version" })],
})), "QUALITY_ARRAY");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ argv: ["bad\0arg"] })],
})), "QUALITY_CHECK_ARGV");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ cwd: "../outside" })],
})), "QUALITY_CHECK_CWD");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ phases: ["integration", "integration"] })],
})), "QUALITY_CHECK_PHASE");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ purpose: "test" })],
})), "QUALITY_CHECK_PURPOSE");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ purpose: "bug_reproducer", phases: ["integration"], outcome_protocol: outcomeProtocol() })],
})), "QUALITY_CHECK_REPRODUCER");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ purpose: "bug_reproducer" })],
})), "QUALITY_CHECK_REPRODUCER");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ purpose: "architecture_graph", generated_output_paths: [] })],
})), "QUALITY_CHECK_ARCHITECTURE_OUTPUT");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ purpose: "architecture_graph", generated_output_paths: ["build/graph.txt"] })],
})), "QUALITY_CHECK_ARCHITECTURE_OUTPUT");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ purpose: "architecture_graph", phases: ["preimplementation"], generated_output_paths: ["build/graph.json"] })],
})), "QUALITY_CHECK_ARCHITECTURE_OUTPUT");
assert.equal(validateProjectCheckCatalog(catalog({
  checks: [check({ purpose: "architecture_graph", phases: ["integration"], generated_output_paths: ["build/graph.json"] })],
})).checks[0].purpose, "architecture_graph");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({
    purpose: "bug_reproducer",
    outcome_protocol: outcomeProtocol({
      exit_codes: {
        failing_reproducer: [1],
        passing_regression: [0],
        unrelated_failure: [1],
        unavailable: [125],
      },
    }),
  })],
})), "QUALITY_CHECK_OUTCOME_PROTOCOL");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ generated_output_paths: [".git/hooks"] })],
})), "QUALITY_CONTROL_PATH");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ generated_output_paths: [".opencode/quality/receipts"] })],
})), "QUALITY_CONTROL_PATH");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ generated_output_paths: ["reports/.env.production"] })],
})), "QUALITY_CHECK_OUTPUT_PATH");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ generated_output_paths: ["coverage", "coverage/unit"] })],
})), "QUALITY_CHECK_PATH_OVERLAP");
expectCode(() => validateProjectCheckCatalog(catalog({
  checks: [check({ generated_output_paths: ["coverage\\unit"] })],
})), "QUALITY_CHECK_OUTPUT_PATH");

const outputA = projectCheckCatalogFingerprint(catalog({ checks: [check()] }));
const outputB = projectCheckCatalogFingerprint(catalog({ checks: [check({ generated_output_paths: ["coverage"] })] }));
assert.notEqual(outputA, outputB, "generated-output policy must be fingerprint-bound");
const protocolA = projectCheckCatalogFingerprint(catalog({ checks: [check({ outcome_protocol: outcomeProtocol() })] }));
const protocolB = projectCheckCatalogFingerprint(catalog({ checks: [check({
  outcome_protocol: outcomeProtocol({
    exit_codes: {
      failing_reproducer: [3],
      passing_regression: [0],
      unrelated_failure: [2],
      unavailable: [125],
    },
  }),
})] }));
assert.notEqual(protocolA, protocolB, "outcome protocol must be fingerprint-bound");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-catalog-v2-"));
const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-catalog-v2-outside-"));
try {
  fs.mkdirSync(path.join(tempRoot, ".opencode", "quality"), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, ".opencode", "quality", "checks.json"), `${JSON.stringify(catalog())}\n`, "utf8");
  const loaded = loadProjectCheckCatalog(tempRoot);
  assert.equal(loaded.relative_path, PROJECT_CHECK_CATALOG_PATH);
  assert.equal(loaded.catalog.catalog_id, "fixture-checks-v2");
  assert.equal(loaded.fingerprint, projectCheckCatalogFingerprint(loaded.catalog));

  expectCode(() => validateProjectCheckCatalog(catalog({
    checks: [check({ cwd: "missing" })],
  }), { workspaceRoot: tempRoot }), "QUALITY_CHECK_CWD_UNAVAILABLE");

  const outsideLink = path.join(tempRoot, "outside-link");
  fs.symlinkSync(outsideRoot, outsideLink, process.platform === "win32" ? "junction" : "dir");
  expectCode(() => validateProjectCheckCatalog(catalog({
    checks: [check({ cwd: "outside-link" })],
  }), { workspaceRoot: tempRoot }), "QUALITY_CHECK_CWD_ESCAPE");

  fs.writeFileSync(
    path.join(tempRoot, ".opencode", "quality", "checks.json"),
    Buffer.alloc(PROJECT_CHECK_LIMITS.max_catalog_bytes + 1, 0x20),
  );
  expectCode(() => loadProjectCheckCatalog(tempRoot), "QUALITY_CHECK_CATALOG_SIZE");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.rmSync(outsideRoot, { recursive: true, force: true });
}

console.log("Project check catalog v2 checks passed.");
