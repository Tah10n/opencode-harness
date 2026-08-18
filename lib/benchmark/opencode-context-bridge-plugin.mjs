import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { isSensitiveContextPathSegments } from "../feedback/context-sensitive-paths.mjs";

const MAX_PATH_CHARS = 1_024;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_LINES = 500;
const MAX_OUTLINE_FILES = 256;
const MAX_OUTLINE_BYTES = 2 * 1024 * 1024;
const MAX_SEARCH_MATCHES = 256;
const CONTROL_ROOTS = new Set([".git", ".oc_harness", ".opencode-harness"]);
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

function sensitivePathSegments(segments) {
  return segments.some((segment) => CONTROL_ROOTS.has(segment))
    || isSensitiveContextPathSegments(segments);
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
    || sensitivePathSegments(segments)
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
  let inventoryLimitReached = false;
  let byteLimitReached = false;
  const visit = (directory, prefix = "") => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`context_outline refuses symbolic link ${relative}`);
      const segments = relative.split("/");
      if (sensitivePathSegments(segments)) {
        skippedSecret += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        directories += 1;
        if (visit(path.join(directory, entry.name), relative) === false) return false;
        continue;
      }
      if (!entry.isFile()) continue;
      const identity = fs.lstatSync(path.join(directory, entry.name));
      if (identity.size > MAX_FILE_BYTES) {
        skippedLarge += 1;
        continue;
      }
      if (files.length >= MAX_OUTLINE_FILES) {
        inventoryLimitReached = true;
        return false;
      }
      if (bytes + identity.size > MAX_OUTLINE_BYTES) {
        byteLimitReached = true;
        return false;
      }
      bytes += identity.size;
      files.push({ path: relative, size: identity.size });
    }
  };
  visit(root);
  const partial = skippedLarge > 0 || skippedSecret > 0 || inventoryLimitReached || byteLimitReached;
  const truncationReasons = [
    ...(inventoryLimitReached ? ["inventory_limit_reached"] : []),
    ...(byteLimitReached ? ["byte_limit_reached"] : []),
    ...((skippedLarge > 0 || skippedSecret > 0) ? ["coverage_partial"] : []),
  ];
  return {
    files,
    directories,
    bytes,
    skippedLarge,
    skippedSecret,
    inventoryLimitReached,
    byteLimitReached,
    truncationReasons,
    partial,
  };
}

function applyInventoryTruncation(truncation, inventory) {
  truncation.inventoryLimitReached = inventory.inventoryLimitReached;
  truncation.byteLimitReached = inventory.byteLimitReached;
  truncation.coveragePartial = inventory.partial;
}

function contextOutlineEnvelope(root) {
  const inventory = publicOutline(root);
  const truncation = Object.fromEntries(TRUNCATION_KEYS.map((key) => [key, false]));
  applyInventoryTruncation(truncation, inventory);
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
      truncationReasons: inventory.truncationReasons,
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
      truncationReasons: inventory.truncationReasons,
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
    tools: ["context_outline", "context_files", "context_search", "context_read"],
    toolset: "minimal",
    explicitEnabledTools: [],
  };
}

function baseEnvelope(toolId, inventory, scopePath = ".") {
  const truncation = Object.fromEntries(TRUNCATION_KEYS.map((key) => [key, false]));
  applyInventoryTruncation(truncation, inventory);
  return {
    schemaVersion: 2,
    tool: toolId,
    worktree: ".",
    scope: { path: scopePath, filters: {} },
    snapshot: {
      fingerprint: sha256(JSON.stringify(inventory.files)),
      fingerprintKind: "metadata",
      fingerprintScope: ".",
      complete: !inventory.partial,
      stable: true,
      changedDuringOperation: false,
      truncationReasons: inventory.truncationReasons,
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
      truncationReasons: inventory.truncationReasons,
      partial: inventory.partial,
    },
    limits: {},
  };
}

function canonicalScope(value, label) {
  if (value === undefined || value === null || value === "" || value === ".") return ".";
  if (typeof value !== "string" || value.length > MAX_PATH_CHARS || value.includes("\0")
    || value.includes("\\") || path.posix.isAbsolute(value)) {
    throw new Error(`${label} must be a bounded portable relative path`);
  }
  const segments = value.split("/");
  if (segments.some((entry) => entry.length === 0 || entry === "." || entry === "..")
    || sensitivePathSegments(segments)) {
    throw new Error(`${label} is outside the readable task surface`);
  }
  return segments.join("/");
}

function contextFilesEnvelope(root, args) {
  const inventory = publicOutline(root);
  const scopePath = canonicalScope(args.path, "context_files.path");
  const prefix = scopePath === "." ? "" : `${scopePath}/`;
  const contains = typeof args.contains === "string" ? args.contains : "";
  const afterPath = args.afterPath === undefined ? null : canonicalScope(args.afterPath, "context_files.afterPath");
  const limit = args.pageSize ?? args.limit ?? 128;
  const matching = inventory.files.filter((entry) => (
    (scopePath === "." || entry.path === scopePath || entry.path.startsWith(prefix))
    && (contains.length === 0 || entry.path.includes(contains))
    && (afterPath === null || entry.path.localeCompare(afterPath) > 0)
  ));
  const files = matching.slice(0, limit);
  const paginated = args.pageSize !== undefined;
  const hasMore = matching.length > files.length;
  return {
    ...baseEnvelope("context_files", inventory, scopePath),
    usage: { files: files.length, directories: 0, bytes: files.reduce((sum, entry) => sum + entry.size, 0), lines: 0, matches: 0, ranges: 0 },
    truncated: inventory.partial || hasMore,
    files,
    ...(paginated ? { hasMore, nextAfterPath: hasMore ? files.at(-1)?.path ?? null : null } : {}),
  };
}

function contextSearchEnvelope(root, args) {
  if (typeof args.query !== "string" || args.query.length === 0 || args.query.length > 1_000
    || /[\r\n\0]/u.test(args.query)) {
    throw new Error("context_search.query must be a bounded single-line string");
  }
  const inventory = publicOutline(root);
  const scopePath = canonicalScope(args.path, "context_search.path");
  const prefix = scopePath === "." ? "" : `${scopePath}/`;
  const query = args.query;
  const caseSensitive = args.caseSensitive === true;
  const needle = caseSensitive ? query : query.toLowerCase();
  const maxMatches = args.maxMatches ?? MAX_SEARCH_MATCHES;
  const maxFiles = args.maxFiles ?? MAX_OUTLINE_FILES;
  const maxBytesPerFile = args.maxBytesPerFile ?? MAX_FILE_BYTES;
  const extensions = new Set(args.extensions ?? []);
  const matches = [];
  const matchedFiles = [];
  let totalBytesScanned = 0;
  for (const entry of inventory.files) {
    if (matchedFiles.length >= maxFiles || matches.length >= maxMatches) break;
    if (!(scopePath === "." || entry.path === scopePath || entry.path.startsWith(prefix))) continue;
    if (typeof args.pathContains === "string" && !entry.path.includes(args.pathContains)) continue;
    if (extensions.size > 0 && !extensions.has(path.posix.extname(entry.path))) continue;
    if (entry.size > maxBytesPerFile) continue;
    const target = confinedFile(root, entry.path);
    const contents = fs.readFileSync(target.absolute, "utf8");
    totalBytesScanned += Buffer.byteLength(contents, "utf8");
    const fileMatches = [];
    const lines = contents.split(/\r?\n/u);
    for (const [index, line] of lines.entries()) {
      const haystack = caseSensitive ? line : line.toLowerCase();
      if (!haystack.includes(needle)) continue;
      fileMatches.push({
        path: entry.path,
        line: index + 1,
        text: line.slice(0, 2_000),
        textTruncated: line.length > 2_000,
        fileSha256: sha256(contents),
        contextBefore: [],
        contextAfter: [],
      });
      if (matches.length + fileMatches.length >= maxMatches) break;
    }
    if (fileMatches.length > 0) {
      matches.push(...fileMatches);
      matchedFiles.push({ path: entry.path, sha256: sha256(contents), bytes: entry.size, matches: fileMatches.length });
    }
  }
  const limited = matches.length >= maxMatches || matchedFiles.length >= maxFiles;
  const base = baseEnvelope("context_search", inventory, scopePath);
  base.coverage.truncation.matchLimitReached = limited;
  base.coverage.truncation.coveragePartial ||= limited;
  base.coverage.partial ||= limited;
  return {
    ...base,
    usage: { files: matchedFiles.length, directories: 0, bytes: totalBytesScanned, lines: 0, matches: matches.length, ranges: matches.length },
    truncated: inventory.partial || limited,
    query,
    scanned: inventory.files.length,
    matches,
    matchedFiles,
    matchedFileCount: matchedFiles.length,
    totalBytesScanned,
    verifiedSnapshotFingerprint: base.snapshot.fingerprint,
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

export function createBoundedContextToolSurface({ toolFactory, workspaceRoot }) {
  const root = canonicalWorkspace(workspaceRoot);
  const tool = toolFactory;
  return Object.freeze({
      context_outline: tool({
        description: "Inventory bounded task-workspace paths and metadata without exposing runner-owned state or non-task files.",
        args: {},
        async execute() {
          return `${JSON.stringify(contextOutlineEnvelope(root))}\n`;
        },
      }),
      context_files: tool({
        description: "List bounded task-workspace files with stable pagination and no runner-owned or secret-like paths.",
        args: {
          path: tool.schema.string().optional(),
          contains: tool.schema.string().optional(),
          limit: tool.schema.number().int().min(1).max(256).optional(),
          pageSize: tool.schema.number().int().min(1).max(256).optional(),
          afterPath: tool.schema.string().optional(),
          expectedSnapshotFingerprint: tool.schema.string().optional(),
        },
        async execute(args) {
          const envelope = contextFilesEnvelope(root, args);
          if (args.expectedSnapshotFingerprint !== undefined
            && args.expectedSnapshotFingerprint !== envelope.snapshot.fingerprint) {
            throw new Error("context_files snapshot fingerprint changed");
          }
          return `${JSON.stringify(envelope)}\n`;
        },
      }),
      context_search: tool({
        description: "Search bounded public task files and return stable line evidence without exposing secrets or runner state.",
        args: {
          query: tool.schema.string().describe("Non-empty literal search query."),
          path: tool.schema.string().optional(),
          pathContains: tool.schema.string().optional(),
          ...(typeof tool.schema.array === "function"
            ? { extensions: tool.schema.array(tool.schema.string()).optional() }
            : {}),
          ...(typeof tool.schema.boolean === "function"
            ? { caseSensitive: tool.schema.boolean().optional() }
            : {}),
          maxMatches: tool.schema.number().int().min(1).max(MAX_SEARCH_MATCHES).optional(),
          maxFiles: tool.schema.number().int().min(1).max(MAX_OUTLINE_FILES).optional(),
          maxBytesPerFile: tool.schema.number().int().min(1_024).max(MAX_FILE_BYTES).optional(),
          expectedSnapshotFingerprint: tool.schema.string().optional(),
        },
        async execute(args) {
          const envelope = contextSearchEnvelope(root, args);
          if (args.expectedSnapshotFingerprint !== undefined
            && args.expectedSnapshotFingerprint !== envelope.snapshot.fingerprint) {
            throw new Error("context_search snapshot fingerprint changed");
          }
          return `${JSON.stringify(envelope)}\n`;
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
        async execute(args) {
          const target = confinedFile(root, args.path);
          const normalizedInput = { args: { ...args, format: "json" } };
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
          return `${JSON.stringify(contextReadEnvelope(target.relative, contents, { startLine, maxLines }))}\n`;
        },
      }),
  });
}

export const ContextBridgePlugin = async ({ directory, worktree }) => {
  const root = canonicalWorkspace(
    typeof worktree === "string" && path.parse(worktree).root !== path.resolve(worktree)
      ? worktree : directory,
  );
  const tool = await installedToolFactory();
  return Object.freeze({ tool: createBoundedContextToolSurface({ toolFactory: tool, workspaceRoot: root }) });
};

export default ContextBridgePlugin;
