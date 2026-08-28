import fs from "node:fs";
import path from "node:path";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";

import { ContractError, canonicalJson, fingerprint } from "../feedback/contracts.mjs";

const ROLE_SPECS = Object.freeze([
  Object.freeze({ role: "readiness", registry: "readiness-issuers.v1.json", index: 0 }),
  Object.freeze({ role: "execution-authority", registry: "execution-authority-issuers.v1.json", index: 0 }),
  Object.freeze({ role: "holdout-custodian", registry: "holdout-issuers.v1.json", index: 0 }),
  Object.freeze({ role: "lease-takeover-auditor", registry: "lease-takeover-issuers.v1.json", index: 0 }),
]);
const REVIEWER_SPECS = Object.freeze([
  Object.freeze({ role: "reviewer-one", registry: "review-issuers.v1.json", index: 0 }),
  Object.freeze({ role: "reviewer-two", registry: "review-issuers.v1.json", index: 1 }),
]);
const ALL_ROLE_SPECS = Object.freeze([...ROLE_SPECS, ...REVIEWER_SPECS]);
const SHA = /^[0-9a-f]{40}$/u;
const FP = /^sha256:[0-9a-f]{64}$/u;

function fail(code, message) { throw new ContractError(code, message); }
function expect(condition, code, message) { if (!condition) fail(code, message); }
function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function privateKeyPath(custodyRoot, role) { return path.join(custodyRoot, "keys", `${role}.private.pem`); }
function publicKeyPem(key) { return createPublicKey(key).export({ type: "spki", format: "pem" }); }
export function benchmarkV3OperatorSpkiFingerprint(key) {
  try {
    return `sha256:${createHash("sha256").update(createPublicKey(key)
      .export({ type: "spki", format: "der" })).digest("hex")}`;
  } catch { fail("BENCHMARK_V3_OPERATOR_KEY", "operator key is invalid"); }
}

function readRegistries(sourceRoot) {
  const directory = path.join(sourceRoot, "benchmarks", "v3");
  const registries = new Map();
  for (const spec of ALL_ROLE_SPECS) {
    if (registries.has(spec.registry)) continue;
    let value;
    try { value = JSON.parse(fs.readFileSync(path.join(directory, spec.registry), "utf8")); }
    catch { fail("BENCHMARK_V3_OPERATOR_REGISTRY", `${spec.registry} is unavailable`); }
    expect(value?.schema_version === 1 && Array.isArray(value.issuers),
      "BENCHMARK_V3_OPERATOR_REGISTRY", `${spec.registry} is invalid`);
    registries.set(spec.registry, value);
  }
  for (const spec of ALL_ROLE_SPECS) {
    expect(registries.get(spec.registry).issuers[spec.index] !== undefined,
      "BENCHMARK_V3_OPERATOR_REGISTRY", `${spec.role} issuer is unavailable`);
  }
  return registries;
}

function assertOwnedDirectory(directory, ownerUid, code) {
  const stat = fs.lstatSync(directory);
  expect(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === ownerUid && (stat.mode & 0o077) === 0,
    code, `${directory} is not an owner-only directory`);
}
function assertOwnedFile(file, ownerUid, code, maximum = 64 * 1024, minimum = 1) {
  const stat = fs.lstatSync(file);
  expect(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === ownerUid
    && (stat.mode & 0o077) === 0 && stat.size >= minimum && stat.size <= maximum,
  code, `${file} is not an owner-only ordinary file`);
}
function createPrivateDirectory(directory, ownerUid) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  assertOwnedDirectory(directory, ownerUid, "BENCHMARK_V3_OPERATOR_CUSTODY");
}
function writeExclusive(file, bytes, ownerUid) {
  const descriptor = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
  try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  assertOwnedFile(file, ownerUid, "BENCHMARK_V3_OPERATOR_CUSTODY", 64 * 1024,
    Buffer.byteLength(bytes) === 0 ? 0 : 1);
}
function ensureExternal(sourceRoot, target) {
  const source = fs.realpathSync.native(path.resolve(sourceRoot));
  const resolved = path.resolve(target);
  expect(!inside(source, resolved), "BENCHMARK_V3_OPERATOR_CUSTODY", "operator custody must remain outside the tracked source tree");
}

function provisionChannels(registries, ownerUid) {
  const channels = new Set();
  for (const registry of registries.values()) {
    for (const issuer of registry.issuers) channels.add(path.resolve(issuer.channel_root));
  }
  for (const channel of channels) createPrivateDirectory(channel, ownerUid);
  const execution = registries.get("execution-authority-issuers.v1.json").issuers[0];
  createPrivateDirectory(path.resolve(execution.registry_root), ownerUid);
  const registryPath = path.resolve(execution.registry_path);
  expect(inside(path.resolve(execution.registry_root), registryPath),
    "BENCHMARK_V3_OPERATOR_REGISTRY", "external execution registry escaped its root");
  if (!fs.existsSync(registryPath)) writeExclusive(registryPath, "", ownerUid);
  else {
    const stat = fs.lstatSync(registryPath);
    expect(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.uid === ownerUid
      && (stat.mode & 0o077) === 0 && stat.size <= 16 * 1024 * 1024,
    "BENCHMARK_V3_OPERATOR_REGISTRY", "external execution registry is not private and bounded");
  }
}

function registryBundle(registries, keys, specs) {
  const output = {};
  for (const [name, registry] of registries) output[name] = structuredClone(registry);
  for (const spec of specs) {
    output[spec.registry].issuers[spec.index].public_key_pem = publicKeyPem(keys.get(spec.role));
  }
  return Object.freeze(Object.fromEntries(Object.entries(output).map(([name, value]) => [name, Object.freeze(value)])));
}

function initializeCustodySet({ sourceRoot, custodyRoot, specs, ownerUid, provision, now }) {
  expect(Number.isSafeInteger(ownerUid) && ownerUid >= 0 && typeof process.getuid === "function"
    && process.getuid() === ownerUid, "BENCHMARK_V3_OPERATOR_CUSTODY", "authority:init must run as the custody owner");
  ensureExternal(sourceRoot, custodyRoot);
  const registries = readRegistries(sourceRoot);
  const root = path.resolve(custodyRoot);
  const keysDirectory = path.join(root, "keys");
  const inventoryPath = path.join(root, "public-key-inventory.json");
  const existing = fs.existsSync(root);
  if (!existing) {
    createPrivateDirectory(root, ownerUid);
    createPrivateDirectory(keysDirectory, ownerUid);
  } else {
    assertOwnedDirectory(root, ownerUid, "BENCHMARK_V3_OPERATOR_CUSTODY");
    expect(fs.existsSync(keysDirectory), "BENCHMARK_V3_OPERATOR_CUSTODY", "existing custody is incomplete");
    assertOwnedDirectory(keysDirectory, ownerUid, "BENCHMARK_V3_OPERATOR_CUSTODY");
  }
  const present = specs.map((spec) => fs.existsSync(privateKeyPath(root, spec.role)));
  expect(present.every(Boolean) || present.every((entry) => !entry),
    "BENCHMARK_V3_OPERATOR_CUSTODY", "partial operator key custody requires audited recovery");
  const keys = new Map();
  if (present.every((entry) => !entry)) {
    expect(!fs.existsSync(inventoryPath), "BENCHMARK_V3_OPERATOR_CUSTODY", "custody inventory exists without a complete key set");
    for (const spec of specs) {
      const { privateKey } = generateKeyPairSync("ed25519");
      writeExclusive(privateKeyPath(root, spec.role), privateKey.export({ type: "pkcs8", format: "pem" }), ownerUid);
      keys.set(spec.role, privateKey);
    }
  } else {
    for (const spec of specs) keys.set(spec.role,
      loadBenchmarkV3OperatorPrivateKey({ custodyRoot: root, role: spec.role, ownerUid }));
  }
  const fingerprints = specs.map((spec) => Object.freeze({ role: spec.role,
    issuer_id: registries.get(spec.registry).issuers[spec.index].issuer_id,
    spki_fingerprint: benchmarkV3OperatorSpkiFingerprint(keys.get(spec.role)),
    spki_der_base64: createPublicKey(keys.get(spec.role)).export({ type: "spki", format: "der" }).toString("base64") }));
  expect(new Set(fingerprints.map((entry) => entry.spki_fingerprint)).size === specs.length,
    "BENCHMARK_V3_OPERATOR_KEY_SEPARATION", "operator role keys are not all distinct");
  const inventoryBody = { schema_version: 1, created_at: now, roles: fingerprints };
  let inventory = Object.freeze({ ...inventoryBody, inventory_fingerprint: fingerprint(inventoryBody) });
  if (!fs.existsSync(inventoryPath)) writeExclusive(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, ownerUid);
  else {
    assertOwnedFile(inventoryPath, ownerUid, "BENCHMARK_V3_OPERATOR_CUSTODY");
    let prior;
    try { prior = JSON.parse(fs.readFileSync(inventoryPath, "utf8")); } catch { prior = null; }
    const { inventory_fingerprint: priorFingerprint, ...priorBody } = prior ?? {};
    expect(prior?.schema_version === 1 && typeof prior.created_at === "string"
      && priorFingerprint === fingerprint(priorBody)
      && canonicalJson(prior.roles) === canonicalJson(inventory.roles),
    "BENCHMARK_V3_OPERATOR_CUSTODY", "existing public inventory does not match the retained private keys");
    inventory = Object.freeze(prior);
  }
  if (provision) provisionChannels(registries, ownerUid);
  return Object.freeze({ schema_version: 1, status: existing ? "verified-existing" : "initialized",
    custody_root_fingerprint: fingerprint(root), roles: Object.freeze(fingerprints),
    registry_bundle: registryBundle(registries, keys, specs), inventory_fingerprint: inventory.inventory_fingerprint });
}

export function initializeBenchmarkV3OperatorCustody({ sourceRoot, custodyRoot, ownerUid = 0,
  provision = true, now = new Date().toISOString() }) {
  return initializeCustodySet({ sourceRoot, custodyRoot, specs: ROLE_SPECS, ownerUid, provision, now });
}

export function initializeBenchmarkV3ReviewerCustody({ sourceRoot, custodyRoot, reviewer,
  ownerUid = 0, now = new Date().toISOString() }) {
  expect(["one", "two"].includes(reviewer), "BENCHMARK_V3_OPERATOR_CUSTODY", "reviewer custody role is invalid");
  const spec = REVIEWER_SPECS[reviewer === "one" ? 0 : 1];
  return initializeCustodySet({ sourceRoot, custodyRoot, specs: Object.freeze([spec]),
    ownerUid, provision: false, now });
}

export function loadBenchmarkV3OperatorPrivateKey({ custodyRoot, role, ownerUid = 0 }) {
  expect(ALL_ROLE_SPECS.some((entry) => entry.role === role), "BENCHMARK_V3_OPERATOR_KEY", "operator key role is invalid");
  const root = path.resolve(custodyRoot);
  assertOwnedDirectory(root, ownerUid, "BENCHMARK_V3_OPERATOR_CUSTODY");
  assertOwnedDirectory(path.join(root, "keys"), ownerUid, "BENCHMARK_V3_OPERATOR_CUSTODY");
  const file = privateKeyPath(root, role);
  assertOwnedFile(file, ownerUid, "BENCHMARK_V3_OPERATOR_CUSTODY", 8 * 1024);
  try { return createPrivateKey(fs.readFileSync(file)); }
  catch { fail("BENCHMARK_V3_OPERATOR_KEY", `${role} private key is invalid`); }
}

export function verifyBenchmarkV3OperatorRegistryKeys({ sourceRoot, custodyRoot, ownerUid = 0 }) {
  const registries = readRegistries(sourceRoot);
  let ledger;
  try { ledger = JSON.parse(fs.readFileSync(path.join(sourceRoot, "benchmarks", "v3", "operator-key-fingerprints.v1.json"), "utf8")); }
  catch { fail("BENCHMARK_V3_OPERATOR_REGISTRY", "operator key fingerprint ledger is unavailable"); }
  expect(ledger?.schema_version === 2 && typeof ledger.rotated_at === "string"
    && typeof ledger.rotation_reason === "string" && ledger.rotation_reason.length >= 20
    && SHA.test(ledger.prior_source_sha)
    && ledger.custody_inventory_fingerprints && typeof ledger.custody_inventory_fingerprints === "object"
    && ["authority", "reviewer_one", "reviewer_two"].every((key) => FP.test(ledger.custody_inventory_fingerprints[key]))
    && Array.isArray(ledger.keys) && ledger.keys.length === ALL_ROLE_SPECS.length,
  "BENCHMARK_V3_OPERATOR_REGISTRY", "operator key fingerprint ledger is invalid");
  const ledgerRoles = new Map(ledger.keys.map((entry) => [entry?.role, entry]));
  expect(ledgerRoles.size === ALL_ROLE_SPECS.length,
    "BENCHMARK_V3_OPERATOR_REGISTRY", "operator key fingerprint ledger contains duplicate roles");
  const observations = [];
  for (const spec of ALL_ROLE_SPECS) {
    const issuer = registries.get(spec.registry).issuers[spec.index];
    const committedFingerprint = benchmarkV3OperatorSpkiFingerprint(issuer.public_key_pem);
    const ledgerEntry = ledgerRoles.get(spec.role);
    expect(ledgerEntry?.registry === spec.registry && ledgerEntry.issuer_id === issuer.issuer_id
      && ledgerEntry.spki_fingerprint === committedFingerprint
      && ledgerEntry.custody_class === (spec.role.startsWith("reviewer-") ? spec.role : "authority"),
    "BENCHMARK_V3_OPERATOR_REGISTRY", `${spec.role} fingerprint ledger entry does not match the committed issuer`);
    if (ROLE_SPECS.includes(spec)) {
      const key = loadBenchmarkV3OperatorPrivateKey({ custodyRoot, role: spec.role, ownerUid });
      expect(benchmarkV3OperatorSpkiFingerprint(key) === committedFingerprint, "BENCHMARK_V3_OPERATOR_KEY",
        `${spec.role} private key does not match the committed issuer registry`);
    }
    observations.push(Object.freeze({ role: spec.role, issuer_id: issuer.issuer_id,
      spki_fingerprint: committedFingerprint }));
  }
  expect(new Set(observations.map((entry) => entry.spki_fingerprint)).size === ALL_ROLE_SPECS.length,
    "BENCHMARK_V3_OPERATOR_KEY_SEPARATION", "committed operator role keys are not all distinct");
  const inventoryPath = path.join(path.resolve(custodyRoot), "public-key-inventory.json");
  assertOwnedFile(inventoryPath, ownerUid, "BENCHMARK_V3_OPERATOR_CUSTODY");
  let inventory;
  try { inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8")); } catch { inventory = null; }
  const authorityObservations = observations.filter((entry) => ROLE_SPECS.some((spec) => spec.role === entry.role));
  expect(inventory?.inventory_fingerprint === ledger.custody_inventory_fingerprints.authority
    && canonicalJson(inventory.roles?.map(({ role, issuer_id, spki_fingerprint }) => ({ role, issuer_id, spki_fingerprint })))
      === canonicalJson(authorityObservations),
  "BENCHMARK_V3_OPERATOR_CUSTODY", "custody inventory does not match the committed fingerprint ledger");
  return Object.freeze(observations);
}

export function verifyBenchmarkV3ReviewerRegistryKey({ sourceRoot, custodyRoot, reviewer, ownerUid = 0 }) {
  expect(["one", "two"].includes(reviewer), "BENCHMARK_V3_OPERATOR_KEY", "reviewer role is invalid");
  const spec = REVIEWER_SPECS[reviewer === "one" ? 0 : 1];
  const registries = readRegistries(sourceRoot);
  const issuer = registries.get(spec.registry).issuers[spec.index];
  let ledger;
  let inventory;
  try {
    ledger = JSON.parse(fs.readFileSync(path.join(sourceRoot, "benchmarks", "v3", "operator-key-fingerprints.v1.json"), "utf8"));
    inventory = JSON.parse(fs.readFileSync(path.join(path.resolve(custodyRoot), "public-key-inventory.json"), "utf8"));
  } catch { fail("BENCHMARK_V3_OPERATOR_CUSTODY", "reviewer custody inventory or fingerprint ledger is unavailable"); }
  const ledgerEntry = ledger?.keys?.find((entry) => entry.role === spec.role);
  const committedFingerprint = benchmarkV3OperatorSpkiFingerprint(issuer.public_key_pem);
  const expectedInventory = ledger?.custody_inventory_fingerprints?.[reviewer === "one" ? "reviewer_one" : "reviewer_two"];
  expect(ledger?.schema_version === 2 && FP.test(expectedInventory)
    && inventory?.inventory_fingerprint === expectedInventory && Array.isArray(inventory.roles)
    && inventory.roles.length === 1 && inventory.roles[0].role === spec.role
    && inventory.roles[0].issuer_id === issuer.issuer_id
    && inventory.roles[0].spki_fingerprint === committedFingerprint
    && ledgerEntry?.custody_class === spec.role && ledgerEntry.spki_fingerprint === committedFingerprint,
  "BENCHMARK_V3_OPERATOR_CUSTODY", "reviewer custody does not match its committed isolated inventory");
  const key = loadBenchmarkV3OperatorPrivateKey({ custodyRoot, role: spec.role, ownerUid });
  expect(benchmarkV3OperatorSpkiFingerprint(key) === committedFingerprint,
    "BENCHMARK_V3_OPERATOR_KEY", "reviewer private key does not match its committed issuer");
  return key;
}

export const BENCHMARK_V3_OPERATOR_ROLES = ROLE_SPECS;
export const BENCHMARK_V3_REVIEWER_ROLES = REVIEWER_SPECS;
