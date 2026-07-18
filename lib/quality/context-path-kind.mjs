import { normalizeRelativePath } from "../feedback/privacy.mjs";
import { ContractError } from "./validation.mjs";

function canonicalPath(value, label) {
  const normalized = normalizeRelativePath(value, label);
  if (normalized !== value) throw new ContractError("CONTEXT_PATH_KIND", `${label} must use canonical workspace-relative separators`);
  return value;
}

function pathExtension(base) {
  const index = base.lastIndexOf(".");
  return index <= 0 ? "" : base.slice(index + 1);
}

export function classifyContextPathKind(relativePath) {
  const normalized = canonicalPath(relativePath, "context path classification");
  const lower = normalized.toLowerCase();
  const segments = lower.split("/");
  const base = segments.at(-1);
  const extension = pathExtension(base);
  if (segments.some((entry) => ["fixtures", "fixture", "snapshots", "__snapshots__"].includes(entry))) return "fixture";
  if (segments.some((entry) => ["test", "tests", "__tests__"].includes(entry)) || /(?:^|\.)(?:test|spec)\.[^.]+$/u.test(base)) return "test";
  if (segments.some((entry) => ["schema", "schemas", "migration", "migrations"].includes(entry))
    || ["sql", "proto", "graphql", "gql"].includes(extension)) return "schema";
  if (["md", "mdx", "rst", "adoc"].includes(extension) || /^(?:readme|changelog|contributing|license)(?:\.|$)/u.test(base)) return "documentation";
  if (["json", "jsonc", "yaml", "yml", "toml", "ini", "env"].includes(extension)
    || /^(?:package-lock|pnpm-lock|yarn\.lock|dockerfile)(?:\.|$)/u.test(base)) return "config";
  if (["png", "jpg", "jpeg", "gif", "webp", "ico", "pdf", "zip", "gz", "wasm"].includes(extension)) return "other";
  return "source";
}

export function contextPathKindRequiresVerificationMapping(kind) {
  if (!["source", "test", "schema", "config", "documentation", "fixture", "other"].includes(kind)) {
    throw new ContractError("CONTEXT_PATH_KIND", `unsupported context path kind: ${kind}`);
  }
  return ["source", "schema", "config"].includes(kind);
}
