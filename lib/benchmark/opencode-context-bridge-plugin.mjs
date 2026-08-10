import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  createNormalSessionQualityBridge,
  handleNormalSessionEvent,
  handleNormalSessionToolAfter,
  handleNormalSessionToolBefore,
} from "../quality/normal-session-bridge.mjs";
import { loadProjectCheckCatalog } from "../quality/project-check-catalog.mjs";
import { loadTrustedToolchainMap } from "../quality/trusted-toolchains.mjs";

const MAX_PATH_CHARS = 1_024;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_LINES = 500;
const MAX_OUTLINE_FILES = 256;
const MAX_OUTLINE_BYTES = 2 * 1024 * 1024;
const CHECK_CATALOG_PATH = ".git/opencode-harness/quality/checks.json";
const TOOLCHAIN_MAP_PATH = ".git/opencode-harness/quality/toolchains.json";
const CONTROL_ROOTS = new Set([".git", ".oc_harness", ".opencode-harness"]);
const SECRET_NAME = /^(?:\.env(?:\..*)?|credentials?(?:\..*)?|secrets?(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/iu;
const TRUNCATION_KEYS = Object.freeze([
  "inventoryLimitReached",
  "resultLimitReached",
  "matchLimitReached",
  "byteLimitReached",
  "lineLimitReached",
  "durationLimitReached",
  "excerptTruncated",
  "contextBeforeTruncated",
  "contextAfterTruncated",
  "symbolLimitReached",
  "relationshipLimitReached",
  "snapshotChanged",
  "coveragePartial",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalWorkspace(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error("bounded context workspace is unavailable");
  }
  const resolved = path.resolve(value);
  const identity = fs.lstatSync(resolved);
  const physical = fs.realpathSync.native(resolved);
  const comparable = (entry) => process.platform === "win32" ? entry.toLowerCase() : entry;
  if (!identity.isDirectory() || identity.isSymbolicLink() || comparable(physical) !== comparable(resolved)) {
    throw new Error("bounded context workspace must be a canonical ordinary directory");
  }
  return physical;
}

function confinedFile(root, value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > MAX_PATH_CHARS
    || value.includes("\0")
    || value.includes("\\")
    || path.posix.isAbsolute(value)
  ) {
    throw new Error("context_read path must be a bounded portable relative path");
  }
  const segments = value.split("/");
  if (
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
    || CONTROL_ROOTS.has(segments[0])
    || SECRET_NAME.test(segments.at(-1))
  ) {
    throw new Error("context_read path is outside the readable task surface");
  }
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    const identity = fs.lstatSync(current);
    if (identity.isSymbolicLink()) throw new Error("context_read refuses symbolic links");
    if (index < segments.length - 1 && !identity.isDirectory()) {
      throw new Error("context_read parent must be a directory");
    }
    if (index === segments.length - 1 && !identity.isFile()) {
      throw new Error("context_read target must be an ordinary file");
    }
  }
  const physical = fs.realpathSync.native(current);
  const relative = path.relative(root, physical);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("context_read target escapes the task workspace");
  }
  return { absolute: physical, relative: segments.join("/") };
}

function contextReadEnvelope(relativePath, contents, { startLine, maxLines }) {
  const lines = contents.split(/\r?\n/u);
  const effectiveStartLine = Math.min(startLine, lines.length);
  const selected = lines.slice(effectiveStartLine - 1, effectiveStartLine - 1 + maxLines);
  const endLine = effectiveStartLine + selected.length - 1;
  const bytes = Buffer.byteLength(contents, "utf8");
  const fileHash = sha256(contents);
  const truncation = Object.fromEntries(TRUNCATION_KEYS.map((key) => [key, false]));
  return {
    schemaVersion: 2,
    tool: "context_read",
    worktree: ".",
    scope: { path: relativePath, filters: {} },
    snapshot: {
      fingerprint: sha256(JSON.stringify({ path: relativePath, sha256: fileHash, startLine: effectiveStartLine, endLine })),
      fingerprintKind: "content",
      fingerprintScope: relativePath,
      complete: true,
      stable: true,
      changedDuringOperation: false,
      truncationReasons: [],
    },
    coverage: {
      candidateFiles: 1,
      scannedFiles: 1,
      bytesScanned: bytes,
      skippedSecret: 0,
      skippedGenerated: 0,
      skippedLarge: 0,
      skippedUnreadable: 0,
      unsupportedLanguages: {},
      truncation,
      truncationReasons: [],
      partial: false,
    },
    limits: {},
    usage: {
      files: 1,
      directories: 0,
      bytes,
      lines: selected.length,
      matches: 0,
      ranges: 1,
    },
    truncated: false,
    ok: true,
    path: relativePath,
    sha256: fileHash,
    bytes,
    totalLines: lines.length,
    selectedRange: { startLine: effectiveStartLine, endLine },
    encoding: "utf-8",
    stableDuringRead: true,
    truncatedBefore: effectiveStartLine > 1,
    truncatedAfter: endLine < lines.length,
    text: selected.map((line, index) => `${effectiveStartLine + index}: ${line}`).join("\n"),
  };
}

function publicOutline(root) {
  const files = [];
  let directories = 0;
  let bytes = 0;
  let skippedLarge = 0;
  let skippedSecret = 0;
  const visit = (directory, prefix = "") => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`context_outline refuses symbolic link ${relative}`);
      if (entry.isDirectory()) {
        if (CONTROL_ROOTS.has(entry.name) || entry.name === "node_modules") continue;
        directories += 1;
        visit(path.join(directory, entry.name), relative);
        continue;
      }
      if (!entry.isFile()) continue;
      if (SECRET_NAME.test(entry.name)) {
        skippedSecret += 1;
        continue;
      }
      const identity = fs.lstatSync(path.join(directory, entry.name));
      if (identity.size > MAX_FILE_BYTES) {
        skippedLarge += 1;
        continue;
      }
      if (files.length >= MAX_OUTLINE_FILES || bytes + identity.size > MAX_OUTLINE_BYTES) {
        throw new Error("context_outline bounded inventory limit exceeded");
      }
      bytes += identity.size;
      files.push({ path: relative, size: identity.size });
    }
  };
  visit(root);
  const partial = skippedLarge > 0 || skippedSecret > 0;
  return { files, directories, bytes, skippedLarge, skippedSecret, partial };
}

function contextOutlineEnvelope(root) {
  const inventory = publicOutline(root);
  const truncation = Object.fromEntries(TRUNCATION_KEYS.map((key) => [key, false]));
  truncation.coveragePartial = inventory.partial;
  const inventoryFingerprint = sha256(JSON.stringify(inventory.files));
  return {
    schemaVersion: 2,
    tool: "context_outline",
    worktree: ".",
    scope: { path: ".", filters: {} },
    snapshot: {
      fingerprint: inventoryFingerprint,
      fingerprintKind: "metadata",
      fingerprintScope: ".",
      complete: !inventory.partial,
      stable: true,
      changedDuringOperation: false,
      truncationReasons: inventory.partial ? ["coverage_partial"] : [],
    },
    coverage: {
      candidateFiles: inventory.files.length,
      scannedFiles: inventory.files.length,
      bytesScanned: inventory.bytes,
      skippedSecret: inventory.skippedSecret,
      skippedGenerated: 0,
      skippedLarge: inventory.skippedLarge,
      skippedUnreadable: 0,
      unsupportedLanguages: {},
      truncation,
      truncationReasons: inventory.partial ? ["coverage_partial"] : [],
      partial: inventory.partial,
    },
    limits: {},
    usage: {
      files: inventory.files.length,
      directories: inventory.directories,
      bytes: inventory.bytes,
      lines: 0,
      matches: 0,
      ranges: 0,
    },
    truncated: inventory.partial,
    guidance: [],
    filesSample: inventory.files,
    tools: ["context_outline", "context_read"],
    toolset: "minimal",
    explicitEnabledTools: [],
  };
}

async function installedToolFactory() {
  const configDirectory = process.env.OPENCODE_CONFIG_DIR;
  if (typeof configDirectory !== "string" || !path.isAbsolute(configDirectory)) {
    throw new Error("OpenCode runtime config directory is unavailable");
  }
  const modulePath = path.join(
    configDirectory,
    "node_modules",
    "@opencode-ai",
    "plugin",
    "dist",
    "index.js",
  );
  const pluginApi = await import(pathToFileURL(modulePath).href);
  if (
    typeof pluginApi.tool !== "function"
    || typeof pluginApi.tool.schema?.string !== "function"
    || typeof pluginApi.tool.schema?.number !== "function"
    || typeof pluginApi.tool.schema?.enum !== "function"
  ) {
    throw new Error("installed OpenCode plugin API is incompatible");
  }
  return pluginApi.tool;
}

const loadBoundedProjectCheckCatalog = (workspaceRoot) => loadProjectCheckCatalog(
  workspaceRoot,
  { relativePath: CHECK_CATALOG_PATH },
);

const loadBoundedTrustedToolchainMap = (workspaceRoot) => loadTrustedToolchainMap(
  workspaceRoot,
  { relativePath: TOOLCHAIN_MAP_PATH },
);

function failedContextEvent({ sessionID, callID, tool = "context_read" }) {
  return {
    type: "message.part.updated",
    properties: {
      part: {
        type: "tool",
          tool,
        sessionID,
        callID,
        state: { status: "error" },
      },
    },
  };
}

export const ContextBridgePlugin = async ({
  directory,
  worktree,
  hostToolchainAnchorUrl = undefined,
}) => {
  const root = canonicalWorkspace(worktree ?? directory);
  const tool = await installedToolFactory();
  const qualityBridge = createNormalSessionQualityBridge({
    workspaceRoot: root,
    projectCatalogLoader: loadBoundedProjectCheckCatalog,
    toolchainMapLoader: loadBoundedTrustedToolchainMap,
    enforceClassifiedContext: true,
    ...(hostToolchainAnchorUrl === undefined ? {} : { hostToolchainAnchorUrl }),
  });
  let callSequence = 0;
  return {
    tool: {
      context_outline: tool({
        description: "Inventory bounded task-workspace paths and metadata without exposing runner-owned state or non-task files.",
        args: {},
        async execute(_args, context) {
          if (typeof context?.sessionID !== "string") {
            throw new Error("context_outline runner session identity is unavailable");
          }
          const callID = `context-outline-${++callSequence}`;
          const input = { tool: "context_outline", sessionID: context.sessionID, callID };
          const normalizedInput = { args: {} };
          handleNormalSessionToolBefore(qualityBridge, input, normalizedInput);
          let output;
          try {
            output = `${JSON.stringify(contextOutlineEnvelope(root))}\n`;
          } catch (error) {
            handleNormalSessionEvent(qualityBridge, failedContextEvent({
              sessionID: context.sessionID,
              callID,
              tool: "context_outline",
            }));
            throw error;
          }
          handleNormalSessionToolAfter(qualityBridge, input, {
            output,
            title: "bounded context outline",
            metadata: {},
          });
          return output;
        },
      }),
      context_read: tool({
        description: "Read one bounded task file and emit a context-receipt-compatible JSON envelope. Runner-owned and secret-like paths are denied.",
        args: {
          path: tool.schema.string().describe("Portable repository-relative public file path."),
          startLine: tool.schema.number().int().min(1).max(100_000).optional().describe("1-based start line; defaults to 1."),
          maxLines: tool.schema.number().int().min(1).max(MAX_LINES).optional().describe("Maximum lines; defaults to 500."),
          maxBytes: tool.schema.number().int().min(1_024).max(MAX_FILE_BYTES).optional().describe("Maximum full-file bytes; defaults to 262144."),
          format: tool.schema.enum(["json"]).optional().describe("JSON is always returned."),
        },
        async execute(args, context) {
          const target = confinedFile(root, args.path);
          if (typeof context?.sessionID !== "string") {
            throw new Error("context_read runner session identity is unavailable");
          }
          const callID = `context-read-${++callSequence}`;
          const input = { tool: "context_read", sessionID: context.sessionID, callID };
          const normalizedInput = { args: { ...args, format: "json" } };
          handleNormalSessionToolBefore(qualityBridge, input, normalizedInput);
          let output;
          try {
            const before = fs.statSync(target.absolute);
            const maxBytes = normalizedInput.args.maxBytes ?? MAX_FILE_BYTES;
            if (before.size > maxBytes) throw new Error("context_read byte limit exceeded");
            const contents = fs.readFileSync(target.absolute, "utf8");
            const after = fs.statSync(target.absolute);
            if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
              throw new Error("context_read target changed during the operation");
            }
            const startLine = normalizedInput.args.startLine ?? 1;
            const maxLines = normalizedInput.args.maxLines ?? MAX_LINES;
            output = `${JSON.stringify(contextReadEnvelope(target.relative, contents, { startLine, maxLines }))}\n`;
          } catch (error) {
            handleNormalSessionEvent(qualityBridge, failedContextEvent({
              sessionID: context.sessionID,
              callID,
            }));
            throw error;
          }
          handleNormalSessionToolAfter(qualityBridge, input, {
            output,
            title: "bounded context read",
            metadata: {},
          });
          return output;
        },
      }),
    },
  };
};

export default ContextBridgePlugin;
