#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "benchmarks", "v3", "corpus", "SOURCE.json"), "utf8"));
const sha256 = (file) => `sha256:${createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
const run = (file, args, options = {}) => spawnSync(file, args, { encoding: "utf8", shell: false, windowsHide: true, ...options });
const pass = (result, label) => { if (result.status !== 0) throw new Error(`${label} failed`); return result.stdout.trim(); };

const [mode, rawTarget] = process.argv.slice(2);
if (!['--verify', '--fetch'].includes(mode) || typeof rawTarget !== "string") {
  throw new Error("usage: materialize-benchmark-v3-provenance.mjs (--verify <existing-bundle> | --fetch <new-bundle>)");
}
const target = path.resolve(rawTarget);
if (mode === "--verify") {
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== manifest.provenance_bundle.size
    || sha256(target) !== manifest.provenance_bundle.sha256) throw new Error("provenance bundle hash or size mismatch");
  pass(run("git", ["bundle", "verify", target]), "git bundle verification");
  process.stdout.write(`${JSON.stringify({ status: "verified", source_commit: manifest.source_commit, sha256: sha256(target), size: stat.size })}\n`);
  process.exit(0);
}
if (fs.existsSync(target)) throw new Error("output bundle already exists");
const temporary = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "benchmark-v3-source-"));
try {
  pass(run("git", ["init", "--bare", "--quiet", temporary]), "bare repository initialization");
  pass(run("git", ["fetch", "--quiet", "--no-tags", manifest.repository, `${manifest.source_commit}:refs/heads/frozen-source`], { cwd: temporary }), "exact source fetch");
  const observed = pass(run("git", ["rev-parse", "refs/heads/frozen-source"], { cwd: temporary }), "source commitment verification");
  if (observed !== manifest.source_commit) throw new Error("fetched source commitment mismatch");
  pass(run("git", ["bundle", "create", target, "refs/heads/frozen-source"], { cwd: temporary }), "bundle materialization");
  pass(run("git", ["bundle", "verify", target]), "materialized bundle verification");
  process.stdout.write(`${JSON.stringify({ status: "materialized", source_repository: manifest.repository, source_commit: observed,
    sha256: sha256(target), size: fs.statSync(target).size, frozen_reference_sha256: manifest.provenance_bundle.sha256 })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
