import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SECRET_NAME = /(?:^|[._-])(?:secret|credential|private[-_]?key|token)(?:[._-]|$)|^(?:\.env|\.npmrc|\.pypirc|\.netrc)$/iu;
const IMPORT_PATTERN = /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*["']([^"']+)["']/gu;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}

function safeRelative(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512
    && !value.startsWith("/") && !value.includes("\\") && !/[\r\n\0]/u.test(value)
    && value.split("/").every((part) => !["", ".", ".."].includes(part))
    && !value.split("/").some((part) => SECRET_NAME.test(part));
}

function tokenize(value) {
  return new Set(String(value).toLowerCase().split(/[^a-z0-9_$-]+/u).filter((entry) => entry.length >= 3));
}

function classify(filePath) {
  const name = path.posix.basename(filePath).toLowerCase();
  if (/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\./u.test(filePath)) return "test";
  if (/(?:^|\/)(?:docs?|documentation)(?:\/|$)|\.(?:md|mdx)$/u.test(filePath)) return "documentation-contract";
  if (/(?:^|\/)(?:config|configs)(?:\/|$)|\.(?:json|ya?ml|toml)$/u.test(filePath)) return "config-reference";
  if (/(?:generated|vendor|dist|build)/u.test(filePath)) return "generated-boundary";
  if (/^(?:index|main|public-api|mod)\./u.test(name)) return "entry-point";
  return "source";
}

function resolveImport(fromPath, specifier, visibleSet) {
  if (!specifier.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), specifier));
  if (base === ".." || base.startsWith("../") || base.startsWith("/")) return null;
  for (const candidate of [base, `${base}.mjs`, `${base}.js`, `${base}.ts`, `${base}/index.mjs`, `${base}/index.js`]) {
    if (visibleSet.has(candidate)) return candidate;
  }
  return null;
}

function recall(selected, expected) {
  if (expected.length === 0) return 1;
  const selectedSet = new Set(selected);
  return expected.filter((entry) => selectedSet.has(entry)).length / expected.length;
}

export function buildBoundedRepositoryMap({
  workspace_root,
  visible_paths,
  task_prompt,
  required_relevant_paths = [],
  required_consumer_paths = [],
  max_files = 20,
  max_bytes = 12_000,
} = {}) {
  if (typeof workspace_root !== "string" || !Array.isArray(visible_paths)
    || !Array.isArray(required_relevant_paths) || !Array.isArray(required_consumer_paths)
    || !Number.isSafeInteger(max_files) || max_files < 1 || max_files > 20
    || !Number.isSafeInteger(max_bytes) || max_bytes < 1_000 || max_bytes > 12_000) {
    throw new Error("BOUNDED_REPOSITORY_MAP_INPUT: invalid map request");
  }
  const root = fs.realpathSync(path.resolve(workspace_root));
  const normalizedPaths = [...new Set(visible_paths)].filter(safeRelative).sort();
  if (normalizedPaths.length !== new Set(visible_paths).size || normalizedPaths.length > 128) {
    throw new Error("BOUNDED_REPOSITORY_MAP_PATH: visible paths are unsafe or unbounded");
  }
  for (const expected of [...required_relevant_paths, ...required_consumer_paths]) {
    if (!safeRelative(expected) || !normalizedPaths.includes(expected)) {
      throw new Error("BOUNDED_REPOSITORY_MAP_ORACLE: expected evidence path is not visible and safe");
    }
  }
  const visibleSet = new Set(normalizedPaths);
  const promptTokens = tokenize(task_prompt);
  const incoming = new Map(normalizedPaths.map((entry) => [entry, []]));
  const records = normalizedPaths.map((relativePath) => {
    const absolute = path.resolve(root, ...relativePath.split("/"));
    const relative = path.relative(root, absolute);
    if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("BOUNDED_REPOSITORY_MAP_ESCAPE: path escapes workspace");
    }
    const real = fs.realpathSync(absolute);
    const realRelative = path.relative(root, real);
    if (realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)
      || path.relative(absolute, real) !== "") {
      throw new Error("BOUNDED_REPOSITORY_MAP_ESCAPE: path traverses a link or escapes workspace");
    }
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 256 * 1024) {
      throw new Error("BOUNDED_REPOSITORY_MAP_FILE: visible file is not a bounded ordinary file");
    }
    const source = fs.readFileSync(absolute, "utf8");
    if (source.includes("\0")) throw new Error("BOUNDED_REPOSITORY_MAP_FILE: binary file is unsupported");
    const imports = [...source.matchAll(IMPORT_PATTERN)]
      .map((match) => resolveImport(relativePath, match[1], visibleSet))
      .filter((entry) => entry !== null);
    for (const target of imports) incoming.get(target).push(relativePath);
    const kind = classify(relativePath);
    const pathTokens = tokenize(relativePath);
    const lexicalMatches = [...promptTokens].filter((token) => pathTokens.has(token)).length;
    const score = lexicalMatches * 20
      + (kind === "entry-point" ? 16 : 0)
      + (kind === "test" ? 10 : 0)
      + (kind === "config-reference" ? 8 : 0)
      + (kind === "documentation-contract" ? 6 : 0)
      + imports.length * 2;
    return { path: relativePath, kind, imports: [...new Set(imports)].sort(), score };
  });
  const requiredSet = new Set([...required_relevant_paths, ...required_consumer_paths]);
  for (const record of records) {
    record.consumers = [...new Set(incoming.get(record.path))].sort();
    record.score += record.consumers.length * 3;
  }
  const ranked = records.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
  let selected = ranked.slice(0, max_files).map(({ score: _score, ...entry }) => entry);
  const finalize = (entries) => {
    const selectedPaths = entries.map((entry) => entry.path);
    const relevantRecall = recall(selectedPaths, required_relevant_paths);
    const consumerRecall = recall(selectedPaths, required_consumer_paths);
    const relevantSelected = selectedPaths.filter((entry) => requiredSet.has(entry)).length;
    const source = {
      schema_version: 1,
      producer: "host-bounded-repository-map",
      entries,
      relevant_file_recall: relevantRecall,
      consumer_recall: consumerRecall,
      context_precision: selectedPaths.length === 0 ? 0 : relevantSelected / selectedPaths.length,
      first_edit_relevant_context_coverage: relevantRecall,
    };
    let contextBytes = 0;
    let envelope;
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const body = { ...source, context_bytes: contextBytes };
      envelope = { ...body, map_fingerprint: fingerprint(body) };
      const measured = Buffer.byteLength(JSON.stringify(envelope), "utf8");
      if (measured === contextBytes) break;
      contextBytes = measured;
    }
    return Object.freeze(envelope);
  };
  let result = finalize(selected);
  while (result.context_bytes > max_bytes && selected.length > 0) {
    selected = selected.slice(0, -1);
    result = finalize(selected);
  }
  if (selected.length === 0 || result.context_bytes > max_bytes) {
    throw new Error("BOUNDED_REPOSITORY_MAP_BUDGET: no map fits the byte budget");
  }
  return result;
}

export function renderBoundedRepositoryMapContext(repositoryMap) {
  return `HOST_REPOSITORY_MAP_V1=${JSON.stringify(repositoryMap)}`;
}
