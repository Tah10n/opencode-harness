#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = Object.freeze([
  ["profiles/core-lite/.gitignore", ".gitignore"],
  ["agents/core-lite.md", "agents/core-lite.md"],
  ["profiles/core-lite/opencode.json", "opencode.json"],
  ["runtime/core-lite.mjs", "runtime/core-lite.mjs"],
]);

function hash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

const outputIndex = process.argv.indexOf("--output");
if (outputIndex < 0 || outputIndex + 1 >= process.argv.length) {
  process.stderr.write("usage: materialize-core-lite --output DIRECTORY\n");
  process.exit(1);
}
const output = path.resolve(process.argv[outputIndex + 1]);
if (fs.existsSync(output)) throw new Error(`output already exists: ${output}`);
fs.mkdirSync(output, { recursive: true });
const inventory = [];
for (const [source, destination] of files) {
  const bytes = fs.readFileSync(path.join(root, source));
  const target = path.join(output, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { mode: destination.endsWith(".mjs") ? 0o755 : 0o644 });
  inventory.push({ path: destination, bytes: bytes.length, sha256: hash(bytes) });
}
const body = { schema_version: 1, profile: "core-lite", main_runtime_entrypoint: "runtime/core-lite.mjs",
  files: inventory, file_count: inventory.length + 1,
  total_bytes_without_manifest: inventory.reduce((sum, entry) => sum + entry.bytes, 0) };
const manifest = { ...body, bundle_fingerprint: hash(Buffer.from(JSON.stringify(canonical(body)), "utf8")) };
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(output, ".opencode-profile-manifest.json"), manifestBytes, { mode: 0o644 });
const result = { ...manifest, total_bytes: body.total_bytes_without_manifest + manifestBytes.length };
if (result.file_count > 20 || result.total_bytes > 300 * 1024) throw new Error("materialized core-lite exceeds its bundle budget");
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
