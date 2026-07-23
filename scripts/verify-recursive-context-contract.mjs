import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  adaptContextToolOutput,
  adaptContextToolRequest,
} from "../lib/quality/context-tool-adapters.mjs";
import {
  beginContextReceiptOperation,
  completeContextReceiptOperation,
  validateContextReceipt,
} from "../lib/quality/context-receipts.mjs";
import {
  contentBackedInspectedPaths,
  contentBackedInspectedRanges,
} from "../lib/quality/context-sufficiency.mjs";
import { selectMinimumContextStrategy } from "../lib/quality/context-strategies.mjs";
import { canonicalJson, fingerprint } from "../lib/quality/validation.mjs";

const RAW_GUIDANCE_CANARY = "RAW_GUIDANCE_TEXT_MUST_NOT_ENTER_RECEIPTS";
const RAW_SOURCE_CANARY = "RAW_SOURCE_TEXT_MUST_NOT_ENTER_RECEIPTS";
const RAW_SEARCH_CANARY = "recursive-contract-search-canary";
const EXPECTED_TOOL_IDS = Object.freeze([
  "context_outline",
  "context_files",
  "context_search",
  "context_read",
  "context_map",
  "context_batch_read",
  "context_symbols",
  "context_related",
]);
const MINIMAL_TOOL_IDS = Object.freeze(EXPECTED_TOOL_IDS.slice(0, 4));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArguments(argv) {
  let capabilityRoot = null;
  let skipBuild = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--capability-root") {
      capabilityRoot = argv[++index] ?? null;
      continue;
    }
    if (argument === "--skip-build") {
      skipBuild = true;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  if (typeof capabilityRoot !== "string" || capabilityRoot.length === 0) {
    throw new Error("--capability-root <checkout-or-built-package> is required");
  }
  return { capabilityRoot: path.resolve(capabilityRoot), skipBuild };
}

function loadPackageMetadata(capabilityRoot) {
  const packagePath = path.join(capabilityRoot, "package.json");
  if (!fs.existsSync(packagePath)) throw new Error(`capability package.json is missing at ${packagePath}`);
  return JSON.parse(fs.readFileSync(packagePath, "utf8"));
}

function buildCapability(capabilityRoot, packageMetadata, skipBuild) {
  const sourceCheckout = fs.existsSync(path.join(capabilityRoot, "tsconfig.json"));
  if (skipBuild || !sourceCheckout) return;
  if (typeof packageMetadata.scripts?.build !== "string") {
    throw new Error("capability checkout has no build script");
  }
  const npmCli = process.env.npm_execpath
    ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (!fs.existsSync(npmCli)) throw new Error(`trusted npm CLI is missing: ${npmCli}`);
  const result = spawnSync(process.execPath, [npmCli, "run", "build"], {
    cwd: capabilityRoot,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 180_000,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`capability build failed with exit code ${result.status ?? "unknown"}: ${result.error?.message ?? "no process error"}`);
  }
}

function packageEntry(packageMetadata, key, fallback) {
  const value = packageMetadata.exports?.[key];
  if (typeof value === "string") return value;
  if (typeof value?.import === "string") return value.import;
  return fallback;
}

async function importCapability(capabilityRoot, packageMetadata) {
  const entry = packageEntry(packageMetadata, ".", packageMetadata.main ?? "./dist/index.js");
  const contractEntry = packageEntry(packageMetadata, "./contract", "./dist/contract.js");
  const entryPath = path.resolve(capabilityRoot, entry);
  const contractPath = path.resolve(capabilityRoot, contractEntry);
  for (const candidate of [entryPath, contractPath]) {
    if (!fs.existsSync(candidate)) throw new Error(`built capability entry is missing: ${candidate}`);
  }
  const cacheKey = `contract-verifier=${Date.now()}`;
  const implementation = await import(`${pathToFileURL(entryPath).href}?${cacheKey}`);
  const contract = await import(`${pathToFileURL(contractPath).href}?${cacheKey}`);
  if (typeof implementation.RecursiveContextPlugin !== "function") {
    throw new Error("capability does not export RecursiveContextPlugin");
  }
  return { RecursiveContextPlugin: implementation.RecursiveContextPlugin, contract };
}

function writeWorkspaceFile(root, relativePath, contents) {
  const target = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, "utf8");
}

function createFixture(root, marker) {
  const longLine = `${"prefix-".repeat(700)}${RAW_SEARCH_CANARY}${"-suffix".repeat(700)}`;
  const largeLines = Array.from({ length: 500 }, (_, index) => `line-${index + 1} ${index === 249 ? RAW_SOURCE_CANARY : "bounded"}`);
  const otherSource = "one\ntwo\nthree\n";
  writeWorkspaceFile(root, "AGENTS.md", `# Agent guidance\n${RAW_GUIDANCE_CANARY}\n`);
  writeWorkspaceFile(root, "WORKFLOW.md", `# Workflow\n${RAW_GUIDANCE_CANARY}\n`);
  writeWorkspaceFile(root, "packages/api/AGENTS.md", `# API guidance\n${RAW_GUIDANCE_CANARY}\n`);
  writeWorkspaceFile(root, ".env.example", "TOKEN=replace-me\n");
  writeWorkspaceFile(root, ".env", "TOKEN=real-secret\n");
  writeWorkspaceFile(root, ".env.local", "TOKEN=local-secret\n");
  writeWorkspaceFile(root, "blocked/.env.example/private.txt", `${RAW_SOURCE_CANARY}\n`);
  writeWorkspaceFile(root, "blocked/.env.example/nested/secret.txt", `${RAW_SOURCE_CANARY}\n`);
  writeWorkspaceFile(root, ".oc_harness/private/runtime.json", `${RAW_SOURCE_CANARY}\n`);
  writeWorkspaceFile(root, "evals/reports/private.json", `${RAW_SOURCE_CANARY}\n`);
  writeWorkspaceFile(root, "evals/decisions/private.json", `${RAW_SOURCE_CANARY}\n`);
  writeWorkspaceFile(root, "src/helper.ts", "export const helperValue = 41\n");
  writeWorkspaceFile(root, "src/app.ts", [
    "import { helperValue } from \"./helper\"",
    "export function apiFunction(value: number) {",
    "  return helperValue + value",
    "}",
    `export const workspaceMarker = ${JSON.stringify(marker)}`,
    "",
  ].join("\n"));
  writeWorkspaceFile(root, "src/app.test.ts", "import { apiFunction } from \"./app\"\nexport const observed = apiFunction(1)\n");
  writeWorkspaceFile(root, "src/app.md", "# app documentation\n");
  writeWorkspaceFile(root, ".agents/skills/review/SKILL.md", `# Review skill\n${RAW_GUIDANCE_CANARY}\n`);
  writeWorkspaceFile(root, "packages/.agents/skills/package-review/SKILL.md", `# Package review skill\n${RAW_GUIDANCE_CANARY}\n`);
  writeWorkspaceFile(root, "packages/other/.agents/skills/out-of-scope/SKILL.md", `# Out of scope\n${RAW_GUIDANCE_CANARY}\n`);
  writeWorkspaceFile(root, "long-search.txt", `${longLine}\n`);
  writeWorkspaceFile(root, "large.txt", `${largeLines.join("\n")}\n`);
  writeWorkspaceFile(root, "other.txt", otherSource);
  writeWorkspaceFile(root, "package.json", JSON.stringify({
    name: "contract-fixture",
    private: true,
    workspaces: ["packages/*"],
    main: "src/app.ts",
    module: ".oc_harness/private/runtime.json",
    types: "node_modules/private/index.d.ts",
    bin: ".env",
    exports: { ".": "./src/app.ts" },
    privateCanary: RAW_SOURCE_CANARY,
  }, null, 2));
  writeWorkspaceFile(root, "packages/api/package.json", JSON.stringify({
    name: "@contract/api",
    module: "./src/index.ts",
  }, null, 2));
  writeWorkspaceFile(root, "packages/api/src/index.ts", "export const apiPackage = true\n");
  writeWorkspaceFile(root, "packages/api/test/index.test.ts", "export const apiPackageTest = true\n");
  writeWorkspaceFile(root, "deploy/compose.yaml", [
    "services:",
    "    api:",
    "        build:",
    "            context: ../packages/api",
    "        environment:",
    "            context: ../must-not-be-a-workspace",
    "    worker:",
    "        build: ../packages/api",
    "    escaped:",
    "        build: ../../outside",
    "",
  ].join("\n"));
  return {
    largeSha256: sha256(`${largeLines.join("\n")}\n`),
    otherSha256: sha256(otherSource),
  };
}

function toolContext(root) {
  return {
    sessionID: "recursive-contract-verifier",
    messageID: "recursive-contract-message",
    agent: "verifier",
    directory: root,
    worktree: root,
    abort: new AbortController().signal,
    metadata() {},
    ask() {
      throw new Error("read-only context tools must not request permissions");
    },
  };
}

class ReceiptProbe {
  constructor(root, marker) {
    this.root = root;
    this.sequence = 0;
    this.previousFingerprint = null;
    this.receipts = [];
    this.salt = `recursive-context-contract-salt-${marker}`;
    this.sessionKey = sha256(`session:${marker}`);
    this.worktreeFingerprint = fingerprint({ fixture: marker, kind: "worktree" });
    this.sourceFingerprint = fingerprint({ fixture: marker, kind: "source" });
    this.strategy = selectMinimumContextStrategy({ risk_class: "high", task_type: "maintenance" });
  }

  async execute(tools, toolId, args, { expectedStatus = null } = {}) {
    this.sequence += 1;
    const normalizedRequest = adaptContextToolRequest(toolId, args, { fingerprintSalt: this.salt });
    const startedAt = new Date(Date.parse("2026-07-21T12:00:00.000Z") + this.sequence * 2000).toISOString();
    const pending = beginContextReceiptOperation({
      receipt_id: `CTXCONTRACT-${this.sequence}`,
      sequence: this.sequence,
      previous_receipt_fingerprint: this.previousFingerprint,
      session_key: this.sessionKey,
      parent_session_key: null,
      producer_session_key: this.sessionKey,
      producer_role: "runner",
      run_id: "recursive-context-contract-run",
      task_id: "recursive-context-contract-task",
      worktree_fingerprint: this.worktreeFingerprint,
      source_fingerprint: this.sourceFingerprint,
      context_strategy_id: this.strategy.strategy_id,
      context_strategy_fingerprint: this.strategy.fingerprint,
      parent_question_id: null,
      evidence_refs: [],
      mutation_revision_started: 0,
      tool_id: toolId,
      call_key_fingerprint: fingerprint({ marker: this.sessionKey, sequence: this.sequence, toolId }),
      started_at: startedAt,
      args,
      fingerprint_salt: this.salt,
    });
    assert.equal(
      canonicalJson(pending.request),
      canonicalJson(normalizedRequest),
      `${toolId} pending request must use the real adapter`,
    );
    const output = await tools[toolId].execute(args, toolContext(this.root));
    assert.equal(typeof output, "string", `${toolId} output must be a string`);
    const adapted = adaptContextToolOutput(toolId, output, {
      fingerprintSalt: this.salt,
      request: normalizedRequest,
    });
    const receipt = completeContextReceiptOperation(pending, {
      output,
      completed_at: new Date(Date.parse(startedAt) + 1000).toISOString(),
      mutation_revision_completed: 0,
      fingerprint_salt: this.salt,
    });
    validateContextReceipt(receipt);
    assert.equal(receipt.status, adapted.status, `${toolId} explicit adapter and receipt completion disagree`);
    assert.equal(receipt.reason_code, adapted.reason_code, `${toolId} reason code mismatch`);
    assert.equal(receipt.result_fingerprint, undefined, "raw adapter details must remain nested and bounded");
    if (expectedStatus !== null) assert.equal(receipt.status, expectedStatus, `${toolId} status`);
    this.previousFingerprint = receipt.fingerprint;
    this.receipts.push(receipt);
    let envelope = null;
    try { envelope = JSON.parse(output); } catch { /* direct text behavior is checked separately */ }
    return { output, envelope, adapted, receipt };
  }
}

function assertContractMetadata(envelope, contract, packageMetadata) {
  assert.equal(envelope.schemaVersion, contract.CONTEXT_OUTPUT_SCHEMA_VERSION);
  assert.equal(envelope.producer, contract.CONTEXT_PRODUCER);
  assert.equal(envelope.producerVersion, packageMetadata.version);
  assert.equal(envelope.producerVersion, contract.CONTEXT_PRODUCER_VERSION);
  assert.equal(envelope.contractVersion, contract.CONTEXT_CONTRACT_VERSION);
  assert.equal(envelope.policyVersion, contract.CONTEXT_POLICY_VERSION);
}

function assertNoReceiptLeak(receipts, roots) {
  const persisted = canonicalJson(receipts);
  for (const canary of [RAW_GUIDANCE_CANARY, RAW_SOURCE_CANARY, RAW_SEARCH_CANARY, ...roots]) {
    assert.equal(persisted.includes(canary), false, `receipt metadata leaked ${canary}`);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const packageMetadata = loadPackageMetadata(options.capabilityRoot);
  buildCapability(options.capabilityRoot, packageMetadata, options.skipBuild);
  const { RecursiveContextPlugin, contract } = await importCapability(options.capabilityRoot, packageMetadata);
  assert.deepEqual([...contract.CONTEXT_TOOL_IDS], EXPECTED_TOOL_IDS);
  assert.equal(contract.CONTEXT_OUTPUT_SCHEMA_VERSION, 2);
  assert.equal(contract.CONTEXT_CONTRACT_VERSION, "2.0");
  assert.equal(contract.CONTEXT_POLICY_VERSION, 1);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-recursive-contract-"));
  const alphaRoot = path.join(tempRoot, "alpha");
  const betaRoot = path.join(tempRoot, "beta");
  fs.mkdirSync(alphaRoot, { recursive: true });
  fs.mkdirSync(betaRoot, { recursive: true });
  try {
    const fixture = createFixture(alphaRoot, "alpha-only-marker");
    createFixture(betaRoot, "beta-only-marker");

    const minimalHooks = await RecursiveContextPlugin();
    const advancedHooks = await RecursiveContextPlugin(undefined, {
      toolset: "advanced",
      additionalIgnorePathPrefixes: ["evals/reports", "evals/decisions"],
    });
    assert.deepEqual(Object.keys(minimalHooks.tool).sort(), [...MINIMAL_TOOL_IDS].sort());
    assert.deepEqual(Object.keys(advancedHooks.tool).sort(), [...EXPECTED_TOOL_IDS].sort());
    const tools = advancedHooks.tool;
    const alpha = new ReceiptProbe(alphaRoot, "alpha");

    const outline = await alpha.execute(tools, "context_outline", {}, { expectedStatus: "success" });
    assertContractMetadata(outline.envelope, contract, packageMetadata);
    assert(outline.envelope.guidance.includes("AGENTS.md"));
    assert(outline.envelope.guidance.includes("WORKFLOW.md"));
    assert(outline.envelope.guidanceEntries.some((entry) => entry.path === "packages/api/AGENTS.md"
      && entry.kind === "agents" && entry.appliesTo === "packages/api"));
    assert(outline.receipt.result.guidance_paths.includes("AGENTS.md"));
    assert(outline.receipt.result.guidance_paths.includes("WORKFLOW.md"));
    assert.equal(outline.receipt.result.guidance_entries.some((entry) => entry.path === "packages/api/AGENTS.md"), true);
    assert.equal(JSON.stringify(outline.receipt).includes(RAW_GUIDANCE_CANARY), false);

    const firstPage = await alpha.execute(tools, "context_files", { limit: 100, pageSize: 3 }, { expectedStatus: "success" });
    const pagedPaths = [...firstPage.envelope.files.map((entry) => entry.path)];
    let page = firstPage;
    while (page.envelope.hasMore) {
      page = await alpha.execute(tools, "context_files", {
        limit: 100,
        pageSize: 3,
        afterPath: page.envelope.nextAfterPath,
        expectedSnapshotFingerprint: firstPage.envelope.snapshot.fingerprint,
      }, { expectedStatus: "success" });
      assert.equal(page.envelope.snapshot.fingerprint, firstPage.envelope.snapshot.fingerprint);
      pagedPaths.push(...page.envelope.files.map((entry) => entry.path));
      assert(pagedPaths.length < 200, "pagination must remain bounded");
    }
    assert.equal(new Set(pagedPaths).size, pagedPaths.length, "pagination duplicated a path");
    assert(pagedPaths.includes(".env.example"));
    assert.equal(pagedPaths.some((entry) => entry === ".env" || entry === ".env.local"), false);
    assert.equal(pagedPaths.some((entry) => entry.startsWith("blocked/.env.example/")), false);
    assert.equal(pagedPaths.some((entry) => entry.startsWith(".oc_harness/")), false);
    assert.equal(pagedPaths.some((entry) => entry.startsWith("evals/reports/") || entry.startsWith("evals/decisions/")), false);

    const stableFiles = await alpha.execute(tools, "context_files", {
      path: "src",
      limit: 100,
      requireStableSnapshot: true,
    }, { expectedStatus: "success" });
    assert.equal(stableFiles.envelope.snapshot.stable, true);
    assert.equal(stableFiles.envelope.snapshot.changedDuringOperation, false);

    const snapshotBoundSearch = await alpha.execute(tools, "context_search", {
      path: "src",
      query: "helperValue",
      maxFiles: 100,
      expectedSnapshotFingerprint: stableFiles.envelope.snapshot.fingerprint,
    }, { expectedStatus: "success" });
    assert.equal(snapshotBoundSearch.envelope.verifiedSnapshotFingerprint, stableFiles.envelope.snapshot.fingerprint);
    assert.equal(
      snapshotBoundSearch.receipt.request.expected_snapshot_fingerprint,
      `sha256:${stableFiles.envelope.snapshot.fingerprint}`,
    );

    const longSearch = await alpha.execute(tools, "context_search", {
      path: "long-search.txt",
      query: RAW_SEARCH_CANARY,
      maxMatches: 5,
    }, { expectedStatus: "success" });
    assert.equal(longSearch.envelope.matches[0].textTruncated, true);
    assert.equal(longSearch.receipt.result.coverage.partial, false);
    assert(longSearch.receipt.result.coverage.truncation_codes.includes("excerpt_truncated"));
    assert.equal(JSON.stringify(longSearch.receipt).includes(RAW_SEARCH_CANARY), false);

    const middleRead = await alpha.execute(tools, "context_read", {
      path: "large.txt",
      startLine: 100,
      maxLines: 21,
      format: "json",
    }, { expectedStatus: "success" });
    assert.deepEqual(middleRead.envelope.selectedRange, { startLine: 100, endLine: 120 });
    assert.equal(middleRead.receipt.result.coverage.partial, false);
    assert.equal(middleRead.receipt.result.coverage.complete, true);
    assert(middleRead.receipt.result.coverage.truncation_codes.includes("range_truncated_before"));
    assert(middleRead.receipt.result.coverage.truncation_codes.includes("range_truncated_after"));
    assert.equal(JSON.stringify(middleRead.receipt).includes(RAW_SOURCE_CANARY), false);

    const defaultText = await minimalHooks.tool.context_read.execute({ path: "other.txt", maxLines: 1 }, toolContext(alphaRoot));
    assert.match(defaultText, /path: other\.txt/);
    assert.throws(() => JSON.parse(defaultText), SyntaxError);

    const envExample = await alpha.execute(tools, "context_read", {
      path: ".env.example",
      format: "json",
    }, { expectedStatus: "success" });
    assert(envExample.receipt.result.relative_paths.includes(".env.example"));
    for (const secretPath of [".env", ".env.local"]) {
      await assert.rejects(
        () => tools.context_read.execute({ path: secretPath, format: "json" }, toolContext(alphaRoot)),
        /Refusing secret-like path/,
      );
    }
    await assert.rejects(
      () => tools.context_read.execute({ path: "blocked/.env.example/private.txt", format: "json" }, toolContext(alphaRoot)),
      /Refusing secret-like path/,
    );
    await assert.rejects(
      () => tools.context_read.execute({ path: ".oc_harness/private/runtime.json", format: "json" }, toolContext(alphaRoot)),
      /Refusing generated\/dependency\/cache path/,
    );

    const map = await alpha.execute(tools, "context_map", {
      includeSymbols: false,
      limit: 100,
    }, { expectedStatus: "success" });
    assert(map.envelope.workspaces.some((entry) => entry.path === "." && entry.manifest === "package.json"
      && entry.entrypoints.includes("src/app.ts")));
    assert(map.envelope.workspaces.some((entry) => entry.path === "packages/api"
      && entry.manifest === "packages/api/package.json"));
    assert(map.envelope.workspaces.some((entry) => entry.ecosystem === "docker-compose"
      && entry.name === "api" && entry.path === "packages/api"));
    assert(map.envelope.workspaces.some((entry) => entry.ecosystem === "docker-compose"
      && entry.name === "worker" && entry.path === "packages/api"));
    assert.equal(map.envelope.workspaces.some((entry) => entry.path.includes("must-not-be-a-workspace")
      || entry.path.startsWith("../")), false);
    assert.equal(JSON.stringify(map.envelope.workspaces).includes(".oc_harness"), false);
    assert.equal(JSON.stringify(map.envelope.workspaces).includes("node_modules"), false);
    assert(map.receipt.result.relative_paths.includes("package.json"));
    assert(map.receipt.result.relative_paths.includes("src/app.ts"));
    assert.equal(JSON.stringify(map.receipt).includes("privateCanary"), false);

    const scopedMap = await alpha.execute(tools, "context_map", {
      path: "packages/api",
      includeSymbols: false,
      limit: 1,
    }, { expectedStatus: "truncated" });
    assert(scopedMap.envelope.guidance.includes(".agents/skills/review/SKILL.md"));
    assert(scopedMap.envelope.guidance.includes("packages/.agents/skills/package-review/SKILL.md"));
    assert.equal(scopedMap.envelope.guidance.some((entry) => entry.includes("out-of-scope")), false);

    const successfulBatch = await alpha.execute(tools, "context_batch_read", {
      ranges: [
        { path: "other.txt", expectedSha256: fixture.otherSha256 },
        { path: "large.txt", startLine: 1, maxLines: 10, expectedSha256: fixture.largeSha256 },
      ],
    }, { expectedStatus: "success" });
    assert.equal(successfulBatch.receipt.result.content_ranges.length, 2);
    assert.deepEqual(successfulBatch.receipt.result.item_failures, []);
    assert(successfulBatch.receipt.request.ranges.every((entry) => entry.expected_content_version_fingerprint !== null));
    assert.equal(JSON.stringify(successfulBatch.receipt.request).includes(fixture.otherSha256), false);
    assert.equal(JSON.stringify(successfulBatch.receipt.request).includes(fixture.largeSha256), false);
    assert(contentBackedInspectedPaths({ receipts: [successfulBatch.receipt] }).includes("other.txt"));

    const mixedBatch = await alpha.execute(tools, "context_batch_read", {
      ranges: [
        { path: "other.txt", expectedSha256: fixture.otherSha256 },
        { path: "large.txt", expectedSha256: "0".repeat(64) },
      ],
    }, { expectedStatus: "truncated" });
    assert.equal(mixedBatch.receipt.reason_code, "partial_tool_failure");
    assert.deepEqual(mixedBatch.receipt.result.item_failures, [{ path: "large.txt", reason_code: "hash_mismatch" }]);
    const mixedRanges = contentBackedInspectedRanges({ receipts: [mixedBatch.receipt] });
    assert.deepEqual(mixedRanges.map((entry) => entry.path), ["other.txt"]);
    assert.equal(mixedRanges[0].requested_scope_complete, false);
    assert.deepEqual(contentBackedInspectedPaths({ receipts: [mixedBatch.receipt] }), []);

    const symbols = await alpha.execute(tools, "context_symbols", {
      path: "src",
      query: "apiFunction",
      kind: "function",
      limit: 20,
    }, { expectedStatus: "success" });
    assert(symbols.envelope.symbols.some((entry) => entry.name === "apiFunction" && entry.path === "src/app.ts"));

    const related = await alpha.execute(tools, "context_related", {
      path: "src/app.ts",
    }, { expectedStatus: "success" });
    assert(related.envelope.directImports.some((entry) => entry.path === "src/helper.ts"));
    assert(related.envelope.likelyTests.some((entry) => entry.path === "src/app.test.ts"));
    assert(related.receipt.result.relationships.some((entry) => entry.path === "src/helper.ts" && entry.relationship === "direct-import"));
    const importedBy = await alpha.execute(tools, "context_related", {
      path: "src/helper.ts",
      relationshipKinds: ["imported-by"],
    }, { expectedStatus: "success" });
    assert(importedBy.envelope.importedBy.some((entry) => entry.path === "src/app.ts"));

    const directOnlyHooks = await RecursiveContextPlugin(undefined, { toolset: "advanced", maxFiles: 1 });
    const directOnly = await alpha.execute(directOnlyHooks.tool, "context_related", {
      path: "src/app.ts",
      relationshipKinds: ["direct-import"],
    }, { expectedStatus: "success" });
    assert(directOnly.envelope.directImports.some((entry) => entry.path === "src/helper.ts"));

    const hashMismatch = await alpha.execute(tools, "context_read", {
      path: "large.txt",
      expectedSha256: "f".repeat(64),
      format: "json",
    }, { expectedStatus: "failed" });
    assert.equal(hashMismatch.receipt.reason_code, "hash_mismatch");
    assert.notEqual(hashMismatch.receipt.request.ranges[0].expected_content_version_fingerprint, null);

    const skippedLarge = await alpha.execute(tools, "context_search", {
      path: "large.txt",
      query: "line",
      maxBytesPerFile: 1024,
    }, { expectedStatus: "truncated" });
    assert.equal(skippedLarge.envelope.coverage.skippedLarge, 1);
    assert.equal(skippedLarge.envelope.coverage.partial, true);
    assert.equal(skippedLarge.receipt.result.coverage.partial, true);

    const boundedHooks = await RecursiveContextPlugin(undefined, { toolset: "advanced", maxFiles: 3 });
    const bounded = await alpha.execute(boundedHooks.tool, "context_files", { limit: 100 }, { expectedStatus: "truncated" });
    assert.equal(bounded.envelope.coverage.truncation.inventoryLimitReached, true);
    assert.equal(bounded.receipt.result.coverage.partial, true);

    writeWorkspaceFile(alphaRoot, "src/added-after-snapshot.ts", "export const later = true\n");
    const afterMutation = new ReceiptProbe(alphaRoot, "alpha-after-mutation");
    const stale = await afterMutation.execute(tools, "context_files", {
      limit: 100,
      pageSize: 3,
      afterPath: firstPage.envelope.nextAfterPath,
      expectedSnapshotFingerprint: firstPage.envelope.snapshot.fingerprint,
    }, { expectedStatus: "failed" });
    assert.equal(stale.receipt.reason_code, "snapshot_mismatch");

    const beta = new ReceiptProbe(betaRoot, "beta");
    const betaFiles = await beta.execute(tools, "context_files", { path: "src", limit: 100 }, { expectedStatus: "success" });
    const betaRead = await beta.execute(tools, "context_read", { path: "src/app.ts", format: "json" }, { expectedStatus: "success" });
    assert(betaRead.output.includes("beta-only-marker"));
    assert.equal(betaRead.output.includes("alpha-only-marker"), false);
    assert.equal(betaFiles.envelope.files.some((entry) => entry.path.startsWith("../")), false);
    assert.notEqual(alpha.worktreeFingerprint, beta.worktreeFingerprint);

    const allReceipts = [...alpha.receipts, ...afterMutation.receipts, ...beta.receipts];
    assertNoReceiptLeak(allReceipts, [alphaRoot, betaRoot, tempRoot]);
    assert.equal(allReceipts.some((entry) => entry.result?.relative_paths.some((item) => item.startsWith(".oc_harness/"))), false);
    assert.equal(new Set(alpha.receipts.map((entry) => entry.tool_id)).size, EXPECTED_TOOL_IDS.length);
    console.log(`Recursive context cross-repo contract verification passed (${allReceipts.length} real receipts, all eight tools).`);
  } finally {
    const resolvedTemp = path.resolve(tempRoot);
    if (!resolvedTemp.startsWith(path.resolve(os.tmpdir()))) throw new Error("refusing to remove an untrusted temporary root");
    fs.rmSync(resolvedTemp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
