import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPublicKey, verify as verifySignature } from "node:crypto";
import { spawnSync } from "node:child_process";

import { ContractError, canonicalJson, fingerprint } from "../feedback/contracts.mjs";

const FP = /^sha256:[0-9a-f]{64}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;
const EXECUTION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{15,99}$/u;

function fail(code, message) { throw new ContractError(code, message); }
function expect(condition, code, message) { if (!condition) fail(code, message); }
function exact(value, keys, label) {
  expect(value && typeof value === "object" && !Array.isArray(value)
    && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()),
  "BENCHMARK_V3_EXECUTION_AUTHORITY_SHAPE", `${label} shape is invalid`);
}
function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function git(sourceRoot, args) {
  const result = spawnSync("git", args, { cwd: sourceRoot, encoding: "utf8", shell: false, windowsHide: true });
  expect(result.status === 0 && result.signal === null && result.error === undefined,
    "BENCHMARK_V3_EXECUTION_AUTHORITY_GIT", "execution clone identity is unavailable");
  return result.stdout.trim();
}
function assertPrivateAncestry(target, root, ownerUid, code) {
  const canonicalRoot = fs.realpathSync.native(path.resolve(root));
  let current = fs.realpathSync.native(path.resolve(target));
  expect(inside(canonicalRoot, current), code, "protected path escaped its configured root");
  while (true) {
    const stat = fs.lstatSync(current);
    expect(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === ownerUid && (stat.mode & 0o077) === 0,
      code, "protected path ancestry is not private and authority-owned");
    if (current === canonicalRoot) break;
    const next = path.dirname(current);
    expect(next !== current && inside(canonicalRoot, next), code, "protected path ancestry escaped");
    current = next;
  }
}

export function loadBenchmarkV3ExecutionAuthorityIssuers(sourceRoot) {
  let value;
  try { value = JSON.parse(fs.readFileSync(path.join(sourceRoot, "benchmarks", "v3", "execution-authority-issuers.v1.json"), "utf8")); }
  catch { fail("BENCHMARK_V3_EXECUTION_AUTHORITY_ISSUER", "execution authority issuer registry is unavailable"); }
  exact(value, ["schema_version", "issuers"], "execution authority issuer registry");
  expect(value.schema_version === 1 && Array.isArray(value.issuers) && value.issuers.length >= 1,
    "BENCHMARK_V3_EXECUTION_AUTHORITY_ISSUER", "execution authority issuer registry is invalid");
  for (const issuer of value.issuers) {
    exact(issuer, ["issuer_id", "protected_channel", "channel_root", "registry_root", "registry_path", "owner_uid", "public_key_pem"], "execution authority issuer");
    expect(EXECUTION_ID.test(issuer.issuer_id) && EXECUTION_ID.test(issuer.protected_channel)
      && path.isAbsolute(issuer.channel_root) && path.isAbsolute(issuer.registry_root)
      && path.isAbsolute(issuer.registry_path) && inside(path.resolve(issuer.registry_root), path.resolve(issuer.registry_path))
      && Number.isSafeInteger(issuer.owner_uid) && issuer.owner_uid >= 0 && typeof issuer.public_key_pem === "string",
    "BENCHMARK_V3_EXECUTION_AUTHORITY_ISSUER", "execution authority issuer is invalid");
  }
  return Object.freeze(value.issuers.map((entry) => Object.freeze(entry)));
}

function readProtectedAuthority(file, issuer) {
  const root = fs.realpathSync.native(path.resolve(issuer.channel_root));
  const parent = fs.realpathSync.native(path.dirname(path.resolve(file)));
  const target = path.join(parent, path.basename(file));
  expect(inside(root, target), "BENCHMARK_V3_EXECUTION_AUTHORITY_CUSTODY", "authority receipt is outside its protected channel");
  assertPrivateAncestry(parent, root, issuer.owner_uid, "BENCHMARK_V3_EXECUTION_AUTHORITY_CUSTODY");
  const descriptor = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs.fstatSync(descriptor);
    expect(stat.isFile() && stat.nlink === 1 && stat.uid === issuer.owner_uid && (stat.mode & 0o077) === 0 && stat.size <= 64 * 1024,
      "BENCHMARK_V3_EXECUTION_AUTHORITY_CUSTODY", "authority receipt is not private, bounded, and authority-owned");
    return JSON.parse(fs.readFileSync(descriptor, "utf8"));
  } finally { fs.closeSync(descriptor); }
}

export function loadSignedBenchmarkV3ExecutionAuthority({ sourceRoot, receiptPath, sourceSha, sourceTreeFingerprint,
  designFingerprint, corpusFingerprint, outputDirectory, trustedIssuers = loadBenchmarkV3ExecutionAuthorityIssuers(sourceRoot), now = Date.now() }) {
  expect(typeof receiptPath === "string" && path.isAbsolute(receiptPath) && path.isAbsolute(outputDirectory)
    && Array.isArray(trustedIssuers), "BENCHMARK_V3_EXECUTION_AUTHORITY_ARGUMENT", "execution authority arguments are invalid");
  const matching = trustedIssuers.filter((issuer) => {
    try { return inside(fs.realpathSync.native(issuer.channel_root), fs.realpathSync.native(path.dirname(receiptPath))); } catch { return false; }
  });
  expect(matching.length === 1, "BENCHMARK_V3_EXECUTION_AUTHORITY_ISSUER", "execution authority issuer is untrusted or ambiguous");
  const [issuer] = matching;
  const value = readProtectedAuthority(receiptPath, issuer);
  exact(value, ["schema_version", "issuer_id", "protected_channel", "campaign_execution_id", "holdout_execution_id",
    "source_sha", "source_tree_fingerprint", "design_fingerprint", "corpus_fingerprint", "output_directory_fingerprint",
    "issued_at_ms", "expires_at_ms", "signature"], "signed execution authority");
  const { signature, ...body } = value;
  let signatureValid = false;
  try { signatureValid = SIGNATURE.test(signature)
    && verifySignature(null, Buffer.from(canonicalJson(body), "utf8"), createPublicKey(issuer.public_key_pem), Buffer.from(signature, "base64url")); } catch {}
  expect(value.schema_version === 1 && value.issuer_id === issuer.issuer_id && value.protected_channel === issuer.protected_channel
    && EXECUTION_ID.test(value.campaign_execution_id) && EXECUTION_ID.test(value.holdout_execution_id)
    && value.campaign_execution_id !== value.holdout_execution_id && value.source_sha === sourceSha && SHA.test(sourceSha)
    && value.source_tree_fingerprint === sourceTreeFingerprint && value.design_fingerprint === designFingerprint
    && value.corpus_fingerprint === corpusFingerprint && [sourceTreeFingerprint, designFingerprint, corpusFingerprint].every((entry) => FP.test(entry))
    && value.output_directory_fingerprint === fingerprint(path.resolve(outputDirectory))
    && Number.isSafeInteger(value.issued_at_ms) && Number.isSafeInteger(value.expires_at_ms)
    && value.issued_at_ms <= now && value.expires_at_ms > now
    && value.expires_at_ms - value.issued_at_ms <= 30 * 24 * 60 * 60 * 1000
    && signatureValid, "BENCHMARK_V3_EXECUTION_AUTHORITY_SIGNATURE", "execution authority binding, signature, or expiry is invalid");
  return Object.freeze({ receipt: Object.freeze(value), authority_fingerprint: fingerprint(value), issuer });
}

export function benchmarkV3ExecutionCloneBinding(sourceRoot, outputDirectory, { host = os.hostname().toLowerCase() } = {}) {
  const source = fs.realpathSync.native(path.resolve(sourceRoot));
  const gitDirectory = fs.realpathSync.native(path.resolve(source, git(source, ["rev-parse", "--git-dir"])));
  const sourceStat = fs.lstatSync(source);
  const gitStat = fs.lstatSync(gitDirectory);
  const body = { schema_version: 1, host_fingerprint: fingerprint(host), source_realpath: source,
    source_device: String(sourceStat.dev), source_inode: String(sourceStat.ino), git_directory_realpath: gitDirectory,
    git_device: String(gitStat.dev), git_inode: String(gitStat.ino), output_directory_fingerprint: fingerprint(path.resolve(outputDirectory)) };
  return Object.freeze({ ...body, clone_binding_fingerprint: fingerprint(body) });
}

function readRegistry(file, ownerUid) {
  if (!fs.existsSync(file)) return [];
  const stat = fs.lstatSync(file);
  expect(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === ownerUid
    && (stat.mode & 0o077) === 0 && stat.size <= 16 * 1024 * 1024,
    "BENCHMARK_V3_EXECUTION_REGISTRY_CUSTODY", "external execution registry is not a private bounded ordinary file");
  const text = fs.readFileSync(file, "utf8");
  expect(text === "" || text.endsWith("\n"), "BENCHMARK_V3_EXECUTION_REGISTRY_INTEGRITY", "external execution registry has a torn tail");
  const events = text === "" ? [] : text.trimEnd().split("\n").map((line) => JSON.parse(line));
  let prior = null;
  for (const [index, event] of events.entries()) {
    exact(event, ["schema_version", "sequence", "action", "execution_id", "phase", "authority_fingerprint",
      "campaign_fingerprint", "clone_binding_fingerprint", "output_directory_fingerprint", "prior_event_fingerprint", "event_fingerprint"], `registry event ${index}`);
    const { event_fingerprint: declared, ...body } = event;
    expect(event.schema_version === 1 && event.sequence === index + 1 && ["reserve", "consume"].includes(event.action)
      && ["campaign", "holdout"].includes(event.phase) && EXECUTION_ID.test(event.execution_id)
      && [event.authority_fingerprint, event.campaign_fingerprint, event.clone_binding_fingerprint,
        event.output_directory_fingerprint].every((entry) => FP.test(entry))
      && event.prior_event_fingerprint === prior && declared === fingerprint(body),
    "BENCHMARK_V3_EXECUTION_REGISTRY_INTEGRITY", "external execution registry hash chain is invalid");
    prior = declared;
  }
  return events;
}

function appendEvent(file, event) {
  const descriptor = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT, 0o600);
  try { fs.writeFileSync(descriptor, `${JSON.stringify(event)}\n`); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  const directory = fs.openSync(path.dirname(file), fs.constants.O_RDONLY);
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}

function updateExternalRegistry(authority, mutate) {
  const { issuer } = authority;
  const registryRoot = fs.realpathSync.native(path.resolve(issuer.registry_root));
  const registryParent = fs.realpathSync.native(path.dirname(path.resolve(issuer.registry_path)));
  const registryPath = path.join(registryParent, path.basename(issuer.registry_path));
  expect(inside(registryRoot, registryPath), "BENCHMARK_V3_EXECUTION_REGISTRY_CUSTODY", "external registry escaped its configured root");
  assertPrivateAncestry(path.dirname(registryPath), registryRoot, issuer.owner_uid, "BENCHMARK_V3_EXECUTION_REGISTRY_CUSTODY");
  const lock = `${registryPath}.lock`;
  try { fs.mkdirSync(lock, { mode: 0o700 }); } catch (error) {
    if (error?.code === "EEXIST") fail("BENCHMARK_V3_EXECUTION_REGISTRY_LOCK", "external append-only registry is locked or requires audited recovery");
    throw error;
  }
  try {
    const events = readRegistry(registryPath, issuer.owner_uid);
    const next = mutate(events);
    if (next !== null) appendEvent(registryPath, next);
    return Object.freeze({ events: Object.freeze(next === null ? events : [...events, next]), appended: next !== null });
  } finally { fs.rmdirSync(lock); }
}

function bindingFor({ authority, phase, campaignFingerprint, cloneBinding }) {
  const executionId = phase === "campaign" ? authority.receipt.campaign_execution_id : authority.receipt.holdout_execution_id;
  return Object.freeze({ execution_id: executionId, phase, authority_fingerprint: authority.authority_fingerprint,
    campaign_fingerprint: campaignFingerprint, clone_binding_fingerprint: cloneBinding.clone_binding_fingerprint,
    output_directory_fingerprint: authority.receipt.output_directory_fingerprint });
}

function exactRegistryHistory(events, binding) {
  const matching = events.filter((event) => event.execution_id === binding.execution_id);
  expect(matching.every((event) => ["execution_id", "phase", "authority_fingerprint", "campaign_fingerprint",
    "clone_binding_fingerprint", "output_directory_fingerprint"].every((key) => event[key] === binding[key])),
  "BENCHMARK_V3_EXECUTION_ALREADY_RESERVED", "execution ID is globally reserved by another clone or binding");
  expect(matching.length <= 2 && (matching.length === 0 || matching[0].action === "reserve")
    && (matching.length < 2 || matching[1].action === "consume"),
  "BENCHMARK_V3_EXECUTION_REGISTRY_INTEGRITY", "execution ID history is invalid");
  return matching;
}

export function inspectBenchmarkV3HoldoutExecutionAuthority({ authority, campaignFingerprint, cloneBinding }) {
  expect(authority?.receipt && FP.test(campaignFingerprint) && FP.test(cloneBinding?.clone_binding_fingerprint),
    "BENCHMARK_V3_EXECUTION_REGISTRY_ARGUMENT", "execution inspection binding is invalid");
  const campaign = bindingFor({ authority, phase: "campaign", campaignFingerprint, cloneBinding });
  const holdout = bindingFor({ authority, phase: "holdout", campaignFingerprint, cloneBinding });
  const { events } = updateExternalRegistry(authority, (current) => {
    const campaignHistory = exactRegistryHistory(current, campaign);
    expect(campaignHistory.length === 2 && campaignHistory[1].action === "consume",
      "BENCHMARK_V3_EXECUTION_CAMPAIGN_INCOMPLETE", "campaign execution is not durably consumed by the exact clone");
    const holdoutHistory = exactRegistryHistory(current, holdout);
    expect(holdoutHistory.length < 2,
      "BENCHMARK_V3_EXECUTION_ALREADY_CONSUMED", "holdout execution ID is already globally consumed");
    return null;
  });
  const holdoutHistory = events.filter((event) => event.execution_id === holdout.execution_id);
  return Object.freeze({ campaign_status: "consumed", holdout_status: holdoutHistory.length === 0 ? "available" : "exact-resume",
    registry_event_count: events.length });
}

export function reserveBenchmarkV3Execution({ authority, phase, campaignFingerprint, cloneBinding }) {
  expect(authority?.receipt && ["campaign", "holdout"].includes(phase) && FP.test(campaignFingerprint)
    && FP.test(cloneBinding?.clone_binding_fingerprint), "BENCHMARK_V3_EXECUTION_REGISTRY_ARGUMENT", "execution reservation binding is invalid");
  const binding = bindingFor({ authority, phase, campaignFingerprint, cloneBinding });
  let disposition = "reserved";
  updateExternalRegistry(authority, (events) => {
    if (phase === "holdout") {
      const campaign = bindingFor({ authority, phase: "campaign", campaignFingerprint, cloneBinding });
      const campaignHistory = exactRegistryHistory(events, campaign);
      expect(campaignHistory.length === 2 && campaignHistory[1].action === "consume",
        "BENCHMARK_V3_EXECUTION_CAMPAIGN_INCOMPLETE",
        "holdout cannot reserve before the exact campaign execution is durably consumed");
    }
    const matching = events.filter((event) => event.execution_id === binding.execution_id);
    if (matching.length > 0) {
      expect(matching.every((event) => ["execution_id", "phase", "authority_fingerprint", "campaign_fingerprint",
        "clone_binding_fingerprint", "output_directory_fingerprint"].every((key) => event[key] === binding[key])),
      "BENCHMARK_V3_EXECUTION_ALREADY_RESERVED", "execution ID is globally reserved by another clone or binding");
      expect(matching.length <= 2 && matching[0].action === "reserve"
        && (matching.length === 1 || matching[1].action === "consume"),
      "BENCHMARK_V3_EXECUTION_REGISTRY_INTEGRITY", "execution ID history is invalid");
      disposition = matching.at(-1).action === "consume" ? "exact-consumed-resume" : "exact-resume";
      return null;
    }
    const body = { schema_version: 1, sequence: events.length + 1, action: "reserve", ...binding,
      prior_event_fingerprint: events.at(-1)?.event_fingerprint ?? null };
    return Object.freeze({ ...body, event_fingerprint: fingerprint(body) });
  });
  return Object.freeze({ ...binding, disposition });
}

export function consumeBenchmarkV3Execution({ authority, phase, campaignFingerprint, cloneBinding }) {
  expect(authority?.receipt && ["campaign", "holdout"].includes(phase) && FP.test(campaignFingerprint)
    && FP.test(cloneBinding?.clone_binding_fingerprint), "BENCHMARK_V3_EXECUTION_REGISTRY_ARGUMENT", "execution consumption binding is invalid");
  const binding = bindingFor({ authority, phase, campaignFingerprint, cloneBinding });
  let disposition = "consumed";
  updateExternalRegistry(authority, (events) => {
    const matching = events.filter((event) => event.execution_id === binding.execution_id);
    expect(matching.length >= 1 && matching.every((event) => ["execution_id", "phase", "authority_fingerprint",
      "campaign_fingerprint", "clone_binding_fingerprint", "output_directory_fingerprint"].every((key) => event[key] === binding[key])),
    "BENCHMARK_V3_EXECUTION_CONSUME", "execution ID was not reserved by the exact clone and binding");
    if (matching.at(-1).action === "consume") { disposition = "already-consumed"; return null; }
    expect(matching.length === 1 && matching[0].action === "reserve",
      "BENCHMARK_V3_EXECUTION_REGISTRY_INTEGRITY", "execution ID history is invalid");
    const body = { schema_version: 1, sequence: events.length + 1, action: "consume", ...binding,
      prior_event_fingerprint: events.at(-1)?.event_fingerprint ?? null };
    return Object.freeze({ ...body, event_fingerprint: fingerprint(body) });
  });
  return Object.freeze({ ...binding, disposition });
}
