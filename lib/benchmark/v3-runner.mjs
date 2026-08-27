import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { fileURLToPath } from "node:url";

import { ContractError, canonicalJson, fingerprint } from "../feedback/contracts.mjs";
import { runManagedCommand } from "../feedback/process-tree.mjs";
import { buildProfileBundleManifest } from "../profile-v3.mjs";
import { evaluatePairedDefects } from "./paired-defect-evaluator.mjs";
import { coreTrustedCheckCommandFingerprint, loadCoreVerificationCatalog } from "../../runtime/core-verification-runtime.mjs";
import { captureBenchmarkV3Workspace, fingerprintBenchmarkV3SemanticRuntime, fingerprintBenchmarkV3SemanticRuntimeKey,
  loadBenchmarkV3Corpus, materializeBenchmarkV3Workspace } from "./v3-corpus.mjs";
import { loadSignedBenchmarkV3HoldoutCommitment, loadSignedExternalBenchmarkV3Holdout } from "./v3-holdout.mjs";
import { buildBenchmarkV3ArmOrderSchedule, validateBenchmarkV3ArmOrderPolicy } from "./v3-arm-order.mjs";
import { benchmarkV3ExecutionCloneBinding, consumeBenchmarkV3Execution,
  loadSignedBenchmarkV3ExecutionAuthority, reserveBenchmarkV3Continuation,
  reserveBenchmarkV3Execution } from "./v3-execution-authority.mjs";
import { assertBenchmarkV3CapabilityAuthorization, authorizeBenchmarkV3Capabilities } from "./v3-readiness.mjs";
import {
  assessBenchmarkV3BaselineOpportunity,
  exactBinomialUpperConfidenceBound,
  exactBinomialUpperTail,
  exactConservativePairedDeltaInterval,
  loadBenchmarkV3Design,
} from "./v3-design.mjs";
import {
  appendBenchmarkV3LedgerEvent,
  bindBenchmarkV3HoldoutArmOrderSchedule,
  createBenchmarkV3Ledger,
  freezeBenchmarkV3FinalCandidate,
  selectBenchmarkV3Candidate,
  validateBenchmarkV3Ledger,
} from "./v3-ledger.mjs";

const AUTHORIZED_GATES = new WeakSet();
const EXECUTION_AUTHORIZATIONS = new WeakMap();
const ORACLE_EXPECTATIONS = new WeakMap();
const FP = /^sha256:[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;
const LEASE_HEARTBEAT_INTERVAL_MS = 5_000;
const CURRENT_PROCESS_FALLBACK_START_FINGERPRINT = fingerprint({ pid: process.pid,
  approximate_started_at_ms: Math.floor(Date.now() - process.uptime() * 1000), host: os.hostname().toLowerCase() });

function fail(code, message) { throw new ContractError(code, message); }
function expect(condition, code, message) { if (!condition) fail(code, message); }
function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8", shell: false, windowsHide: true, maxBuffer: 32 * 1024 * 1024, ...options,
  });
}
function passed(result) { return result.error === undefined && result.signal === null && result.status === 0; }
function durableJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, target);
  const directory = fs.openSync(path.dirname(target), fs.constants.O_RDONLY);
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}
function processStartFingerprint(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  if (process.platform === "linux") {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const close = stat.lastIndexOf(")");
      const fields = close === -1 ? [] : stat.slice(close + 2).trim().split(/\s+/u);
      const startTicks = fields[19];
      return /^\d+$/u.test(startTicks ?? "") ? fingerprint({ platform: "linux", pid, start_ticks: startTicks }) : null;
    } catch { return null; }
  }
  if (process.platform === "darwin") {
    const result = run("/bin/ps", ["-o", "lstart=", "-p", String(pid)], { env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" } });
    const started = result.stdout?.trim();
    return passed(result) && typeof started === "string" && started.length > 0
      ? fingerprint({ platform: "darwin", pid, started })
      : (pid === process.pid ? CURRENT_PROCESS_FALLBACK_START_FINGERPRINT : null);
  }
  return pid === process.pid ? CURRENT_PROCESS_FALLBACK_START_FINGERPRINT : null;
}
function acquireLease(target, code, message) {
  const host = fingerprint(os.hostname().toLowerCase());
  const processStart = processStartFingerprint(process.pid);
  const takeoverGuard = `${target}.takeover-guard`;
  const heartbeatLock = `${target}.heartbeat-lock`;
  expect(processStart !== null, code, "process start identity is unavailable");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    expect(!fs.existsSync(takeoverGuard) && !fs.existsSync(heartbeatLock), code,
      "signed audited takeover or heartbeat recovery is in progress or requires manual recovery");
    const nonce = randomBytes(16).toString("hex");
    const now = Date.now();
    const value = { schema_version: 2, pid: process.pid, process_start_fingerprint: processStart,
      host_fingerprint: host, nonce, created_at_ms: now, heartbeat_at_ms: now };
    try {
      const descriptor = fs.openSync(target, "wx", 0o600);
      try { fs.writeFileSync(descriptor, `${JSON.stringify(value)}\n`); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
      if (fs.existsSync(takeoverGuard) || fs.existsSync(heartbeatLock)) {
        let current = null; try { current = JSON.parse(fs.readFileSync(target, "utf8")); } catch {}
        if (current?.nonce === nonce) fs.unlinkSync(target);
        fail(code, "signed audited takeover or heartbeat recovery began during lease acquisition");
      }
      let released = false;
      const heartbeat = setInterval(() => {
        if (released || fs.existsSync(takeoverGuard)) return;
        let descriptor = null;
        try {
          descriptor = fs.openSync(heartbeatLock, "wx", 0o600);
          fs.writeFileSync(descriptor, `${JSON.stringify({ schema_version: 1, lease_nonce: nonce })}\n`);
          fs.fsyncSync(descriptor);
          if (fs.existsSync(takeoverGuard)) return;
          let current = null; try { current = JSON.parse(fs.readFileSync(target, "utf8")); } catch {}
          if (current?.nonce !== nonce) return;
          durableJson(target, { ...current, heartbeat_at_ms: Date.now() });
        } catch (error) {
          if (error?.code !== "EEXIST") return;
        } finally {
          if (descriptor !== null) {
            fs.closeSync(descriptor);
            let lock = null; try { lock = JSON.parse(fs.readFileSync(heartbeatLock, "utf8")); } catch {}
            if (lock?.lease_nonce === nonce) fs.unlinkSync(heartbeatLock);
          }
        }
      }, LEASE_HEARTBEAT_INTERVAL_MS);
      heartbeat.unref();
      return Object.freeze({ nonce, release() {
        if (released) return;
        let current = null; try { current = JSON.parse(fs.readFileSync(target, "utf8")); } catch {}
        expect(current?.nonce === nonce, code, "lease ownership changed before release");
        released = true; clearInterval(heartbeat); fs.unlinkSync(target);
      } });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let current = null; try { current = JSON.parse(fs.readFileSync(target, "utf8")); } catch {}
      if (current?.schema_version === 2 && current.host_fingerprint !== host) {
        fail(code, "foreign-host lease is authoritative; signed audited takeover is required");
      }
      fail(code, `${message}; signed audited takeover is required even when the recorded owner appears stale`);
    }
  }
  fail(code, "lease acquisition raced repeatedly");
}
function gitSha(root) {
  const result = run("git", ["rev-parse", "HEAD"], { cwd: root });
  expect(passed(result) && /^[0-9a-f]{40}$/u.test(result.stdout.trim()), "BENCHMARK_V3_RUNNER_SOURCE", "source SHA is unavailable");
  return result.stdout.trim();
}
function assertClean(root) {
  const result = run("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root });
  expect(passed(result) && result.stdout.length === 0, "BENCHMARK_V3_RUNNER_SOURCE", "model-backed execution requires a clean committed source tree");
}
function assertReviewedSourceCurrent(root, sourceSha, sourceTreeFingerprint) {
  assertClean(root);
  expect(gitSha(root) === sourceSha && buildProfileBundleManifest(root, "lab").manifest.source_tree_fingerprint === sourceTreeFingerprint,
    "BENCHMARK_V3_RUNNER_SOURCE", "reviewed runner source changed after the model-free gate");
}
function modelEnvironment(source = process.env) {
  const allowed = new Set(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ"]);
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => allowed.has(key) && typeof value === "string"));
}
function installCredentialBridge(sourceRoot, attemptDirectory, attemptConfig, provider, source = process.env) {
  expect(provider === "openai", "BENCHMARK_V3_RUNNER_CREDENTIAL_BOUNDARY",
    "benchmark-v3 currently supports only the host-isolated OpenAI credential bridge");
  expect(typeof source.OPENAI_API_KEY === "string" && source.OPENAI_API_KEY.length >= 16,
    "BENCHMARK_V3_RUNNER_CREDENTIAL_BOUNDARY", "an OpenAI credential is unavailable to the host runner");
  const credentialFile = path.join(attemptDirectory, "host-credential.json");
  fs.writeFileSync(credentialFile, JSON.stringify({ schema_version: 1, provider, api_key: source.OPENAI_API_KEY }),
    { encoding: "utf8", flag: "wx", mode: 0o600 });
  const pluginDirectory = path.join(attemptConfig, "plugins");
  fs.mkdirSync(pluginDirectory, { recursive: true, mode: 0o700 });
  const sourcePlugin = path.join(sourceRoot, "lib", "benchmark", "v3-opencode-provider-bridge-plugin.mjs");
  const targetPlugin = path.join(pluginDirectory, "benchmark-v3-credential-bridge.mjs");
  fs.copyFileSync(sourcePlugin, targetPlugin, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(targetPlugin, 0o400);
  return Object.freeze({ credential_file: credentialFile,
    placeholder_auth_content: JSON.stringify({ openai: { type: "api", key: "benchmark-v3-host-credential-bridge" } }) });
}
function coreCatalogFingerprint(workspace) {
  const file = path.join(workspace, ".git", "opencode-harness", "core", "checks.json");
  if (!fs.existsSync(file)) return null;
  const stat = fs.lstatSync(file);
  expect(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, "BENCHMARK_V3_RUNNER_WORKSPACE", "core catalog is not an ordinary file");
  return `sha256:${createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
}
function benchmarkV3CandidateCheck(family) {
  const syntaxProgram = "const{spawnSync}=require('node:child_process');for(const f of process.argv.slice(1)){const r=spawnSync(process.execPath,['--check',f],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1)}";
  return Object.freeze({ check_id: "v3-public-syntax-all", scope_prefixes: [...family.control_surface.allowed_mutation_paths].sort(),
    cost_rank: 1, executable_path: fs.realpathSync.native(process.execPath),
    argv: ["-e", syntaxProgram], immutable_input_paths: [],
    subject_paths: family.public_surface.public_files.map((entry) => entry.path), cwd: ".", timeout_ms: 30_000 });
}
function benchmarkV3ActivationBinding(workspace) {
  const catalog = loadCoreVerificationCatalog(workspace);
  expect(catalog.checks.length === 1, "BENCHMARK_V3_RUNNER_WORKSPACE", "candidate catalog must contain exactly one trusted check");
  return Object.freeze({
    catalog_fingerprint: catalog.catalog_fingerprint,
    command_fingerprint: coreTrustedCheckCommandFingerprint(catalog.checks[0]),
  });
}

export function classifyBenchmarkV3AttemptReceipt(receipt, armKind) {
  const child = receipt?.child_execution;
  const ordinaryExit = receipt?.timed_out === false && child?.signal === null && child?.error_code === null
    && Number.isSafeInteger(child?.status) && child.status >= 0 && child.status <= 255;
  const outerTimeout = receipt?.timed_out === true && receipt.status === null
    && receipt.error_code === "ETIMEDOUT" && (receipt.signal === null || typeof receipt.signal === "string");
  const wrappedTimeout = armKind === "candidate" && receipt?.timed_out === true && receipt.error_code === "ETIMEDOUT"
    && child?.status === null && child?.error_code === "ETIMEDOUT" && typeof child?.signal === "string";
  const authenticTimeout = outerTimeout || wrappedTimeout;
  const authentic = receipt?.schema_version === 2 && (ordinaryExit || authenticTimeout)
    && Number.isSafeInteger(receipt.terminal_event_count) && receipt.terminal_event_count >= 0
    && Number.isSafeInteger(receipt.json_event_count) && receipt.json_event_count >= 0
    && Number.isSafeInteger(receipt.turn_count) && receipt.turn_count >= 0
    && Number.isSafeInteger(receipt.tool_call_count) && receipt.tool_call_count >= 0
    && (armKind === "baseline" || receipt.activation_receipt_authentic === true);
  const verificationSucceeded = authentic && !authenticTimeout && child.status === 0
    && receipt.protocol_valid === true && receipt.usage_observed === true
    && receipt.terminal_event_count > 0 && receipt.json_event_count > 0
    && (armKind === "baseline" || receipt.activation_receipt_valid === true);
  return Object.freeze({ receipt_authentic: authentic, complete_scored_outcome: authentic,
    verification_succeeded: verificationSucceeded, infrastructure_failure: !authentic });
}
export function benchmarkV3AttemptTimeouts(timeoutMs, armKind) {
  expect(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && ["baseline", "candidate"].includes(armKind),
    "BENCHMARK_V3_RUNNER_ARGUMENT", "attempt timeout binding is invalid");
  const workerTimeoutMs = armKind === "candidate" ? timeoutMs + 300_000 : timeoutMs;
  return Object.freeze({ model_timeout_ms: timeoutMs, wrapper_timeout_ms: armKind === "candidate" ? timeoutMs : null,
    worker_timeout_ms: workerTimeoutMs, managed_timeout_ms: workerTimeoutMs + 30_000,
    complete_authorization_reservation_ms: timeoutMs + 600_000 });
}
function attemptReceiptMetrics(receipt) {
  const safe = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return Object.freeze({ turn_count: safe(receipt?.turn_count), tool_call_count: safe(receipt?.tool_call_count),
    json_event_count: safe(receipt?.json_event_count), terminal_event_count: safe(receipt?.terminal_event_count),
    unfinished_tool_count: safe(receipt?.unfinished_tool_count) });
}
function closedDirectoryFingerprint(directory) {
  const root = fs.realpathSync.native(directory);
  const entries = [];
  const visit = (current, prefix = "") => {
    for (const name of fs.readdirSync(current).sort()) {
      const relative = prefix === "" ? name : `${prefix}/${name}`;
      const target = path.join(current, name);
      const stat = fs.lstatSync(target);
      expect(!stat.isSymbolicLink() && (stat.isDirectory() || (stat.isFile() && stat.nlink === 1)),
        "BENCHMARK_V3_RUNNER_PRODUCT_BINDING", "attempt configuration contains an unsupported entry");
      if (stat.isDirectory()) visit(target, relative);
      else entries.push({ path: relative, size: stat.size, sha256: `sha256:${createHash("sha256").update(fs.readFileSync(target)).digest("hex")}` });
    }
  };
  visit(root);
  return fingerprint(entries);
}
function sandboxLiteral(value) { return JSON.stringify(fs.realpathSync.native(value)); }
function benchmarkV3SandboxProfile({ workspace, attemptDirectory, opencodePath, workerPath }) {
  expect(process.platform === "darwin" && fs.existsSync("/usr/bin/sandbox-exec"), "BENCHMARK_V3_RUNNER_FILESYSTEM_ISOLATION",
    "a supported filesystem sandbox backend is unavailable");
  const readableSystem = ["/System", "/usr", "/Library", "/opt/homebrew", path.dirname(process.execPath)].filter((entry) => fs.existsSync(entry));
  return ["(version 1)", "(deny default)", "(allow process-exec process-fork)",
    "(allow signal (target same-sandbox))", "(allow process-info* (target same-sandbox))",
    "(allow network-outbound)", "(allow mach-lookup)",
    "(allow sysctl-read)", "(allow file-read-metadata)",
    `(allow file-read* ${readableSystem.map((entry) => `(subpath ${sandboxLiteral(entry)})`).join(" ")}`,
    `  (subpath ${sandboxLiteral(workspace)}) (subpath ${sandboxLiteral(attemptDirectory)})`,
    `  (literal ${sandboxLiteral(opencodePath)}) (literal ${sandboxLiteral(workerPath)}))`,
    `(allow file-write* (subpath ${sandboxLiteral(workspace)}) (subpath ${sandboxLiteral(attemptDirectory)}) (literal "/dev/null"))`,
  ].join("\n");
}

function benchmarkV3LinuxBubblewrapArgs({ workspace, attemptDirectory, workerPath, inputFile, outputFile, marker }) {
  const systemRoots = ["/usr", "/bin", "/lib", "/lib64", "/opt", "/nix/store", "/etc/ssl", "/etc/pki", "/etc/ca-certificates",
    "/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf", path.dirname(process.execPath)]
    .filter((entry, index, values) => fs.existsSync(entry) && values.indexOf(entry) === index);
  return ["--die-with-parent", "--new-session", "--unshare-user-try", "--unshare-pid", "--unshare-ipc", "--unshare-uts",
    "--unshare-cgroup-try", "--share-net", "--proc", "/proc", "--dev", "/dev",
    ...systemRoots.flatMap((entry) => ["--ro-bind", entry, entry]),
    "--bind", workspace, workspace, "--bind", attemptDirectory, attemptDirectory, "--chdir", workspace,
    process.execPath, workerPath, inputFile, outputFile, marker];
}

function benchmarkV3OracleSandboxProfile({ oracleDirectory, semanticRuntimeRoot, writableDirectories }) {
  const readableSystem = ["/System", "/usr", "/Library", "/opt/homebrew", path.dirname(process.execPath)]
    .filter((entry) => fs.existsSync(entry));
  return ["(version 1)", "(deny default)", "(allow process*)", "(deny network*)", "(allow mach-lookup)",
    "(allow sysctl-read)", "(allow file-read-metadata)",
    `(allow file-read* ${readableSystem.map((entry) => `(subpath ${sandboxLiteral(entry)})`).join(" ")}`,
    `  (subpath ${sandboxLiteral(oracleDirectory)}) (subpath ${sandboxLiteral(semanticRuntimeRoot)}))`,
    `(allow file-write* ${writableDirectories.map((entry) => `(subpath ${sandboxLiteral(entry)})`).join(" ")} (literal "/dev/null"))`,
  ].join("\n");
}

function benchmarkV3LinuxOracleArgs({ oracleDirectory, semanticRuntimeRoot, workerPath, inputFile, outputFile, marker,
  writableDirectories }) {
  const systemRoots = ["/usr", "/bin", "/lib", "/lib64", "/opt", "/nix/store"]
    .filter((entry, index, values) => fs.existsSync(entry) && values.indexOf(entry) === index);
  return ["--die-with-parent", "--new-session", "--unshare-user-try", "--unshare-pid", "--unshare-ipc", "--unshare-uts",
    "--unshare-cgroup-try", "--unshare-net", "--proc", "/proc", "--dev", "/dev",
    ...systemRoots.flatMap((entry) => ["--ro-bind", entry, entry]),
    "--ro-bind", semanticRuntimeRoot, semanticRuntimeRoot, "--ro-bind", oracleDirectory, oracleDirectory,
    ...writableDirectories.flatMap((entry) => ["--bind", entry, entry]),
    "--chdir", path.join(oracleDirectory, "workspace"), process.execPath, workerPath, inputFile, outputFile, marker];
}

export function verifyBenchmarkV3OracleSubjectSafety(workspace, beforeSnapshot, family) {
  const after = captureBenchmarkV3Workspace(workspace);
  const beforeMap = new Map(beforeSnapshot.entries.map((entry) => [entry.path, `${entry.sha256}:${entry.size}:${entry.mode}`]));
  const afterMap = new Map(after.entries.map((entry) => [entry.path, `${entry.sha256}:${entry.size}:${entry.mode}`]));
  const changedPaths = [...new Set([...beforeMap.keys(), ...afterMap.keys()])]
    .filter((entry) => beforeMap.get(entry) !== afterMap.get(entry)).sort();
  const allowed = new Set(family.control_surface.allowed_mutation_paths);
  if (changedPaths.some((entry) => !allowed.has(entry))) {
    return Object.freeze({ safe: false, changed_paths: Object.freeze(changedPaths), reason: "closed-mutation-scope-violated" });
  }
  for (const relative of changedPaths) {
    const target = path.join(workspace, ...relative.split("/"));
    const before = beforeSnapshot.entries.find((entry) => entry.path === relative);
    let stat = null; try { stat = fs.lstatSync(target); } catch {}
    const ordinaryPreservedMode = stat?.isFile() === true && !stat.isSymbolicLink() && stat.nlink === 1
      && before !== undefined && (stat.mode & 0o7777) === before.mode;
    if (!ordinaryPreservedMode) return Object.freeze({ safe: false, changed_paths: Object.freeze(changedPaths),
      reason: "allowed-source-file-identity-or-mode-changed" });
  }
  return Object.freeze({ safe: true, changed_paths: Object.freeze(changedPaths),
    reason: "closed-mutation-scope-and-source-file-modes-preserved" });
}

async function evaluateContainedBenchmarkV3Oracle({ workspace, beforeSnapshot, family, semanticRuntimeRoot,
  opencodeIdentity, containmentOptions }) {
  const authorization = EXECUTION_AUTHORIZATIONS.get(opencodeIdentity);
  assertBenchmarkV3CapabilityAuthorization(authorization, { minimumRemainingMs: 150_000 });
  const oracleDirectory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "benchmark-v3-oracle-"));
  try {
    const oracleWorkspace = path.join(oracleDirectory, "workspace");
    fs.cpSync(workspace, oracleWorkspace, { recursive: true, errorOnExist: true, force: false });
    const originalAfterModel = captureBenchmarkV3Workspace(workspace);
    for (const hidden of family.control_surface.hidden_test_files) {
      const target = path.resolve(oracleWorkspace, ...hidden.path.split("/"));
      const relative = path.relative(oracleWorkspace, target);
      expect(relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
        "BENCHMARK_V3_RUNNER_ORACLE", "hidden oracle path escaped its workspace");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, hidden.content, { encoding: "utf8", mode: 0o400 });
    }
    const runtimeNodeModules = path.join(fs.realpathSync.native(semanticRuntimeRoot), family.control_surface.runtime_key, "node_modules");
    fs.symlinkSync(runtimeNodeModules, path.join(oracleWorkspace, "node_modules"), "dir");
    const workerPath = path.join(oracleDirectory, "oracle-worker.mjs");
    fs.copyFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "benchmark-v3-oracle-worker.mjs"), workerPath);
    const inputFile = path.join(oracleDirectory, "input.json");
    const outputDirectory = path.join(oracleDirectory, "output");
    const outputFile = path.join(outputDirectory, "result.json");
    const emptyHome = path.join(oracleDirectory, "home");
    const emptyTmp = path.join(oracleDirectory, "tmp");
    fs.mkdirSync(emptyHome, { mode: 0o700 }); fs.mkdirSync(emptyTmp, { mode: 0o700 }); fs.mkdirSync(outputDirectory, { mode: 0o700 });
    const oracleMacKey = randomBytes(32);
    const authorityFile = path.join(outputDirectory, "authority.json");
    fs.writeFileSync(authorityFile, JSON.stringify({ mac_key: oracleMacKey.toString("base64url"),
      expected_test_count: ORACLE_EXPECTATIONS.get(opencodeIdentity)?.get(family.family_id) ?? null }), { mode: 0o600 });
    fs.writeFileSync(inputFile, JSON.stringify({ schema_version: 1, workspace: oracleWorkspace,
      runtime_root: fs.realpathSync.native(semanticRuntimeRoot), runtime_key: family.control_surface.runtime_key,
      hidden_test_files: family.control_surface.hidden_test_files, test_argv: family.control_surface.test_argv,
      allowed_mutation_paths: family.control_surface.allowed_mutation_paths, before_entries: beforeSnapshot.entries,
      model_entries: originalAfterModel.entries, authority_file: authorityFile,
      empty_home: emptyHome, empty_tmp: emptyTmp }), { mode: 0o600 });
    const marker = `BENCHMARK_V3_ORACLE_${fingerprint({ family: family.family_id, after: originalAfterModel.fingerprint }).slice(7, 31)}`;
    let managedFile; let managedArgs;
    if (opencodeIdentity.filesystem_isolation.backend === "macos-sandbox-exec-v1") {
      const profileFile = path.join(oracleDirectory, "oracle.sb");
      fs.writeFileSync(profileFile, benchmarkV3OracleSandboxProfile({ oracleDirectory,
        semanticRuntimeRoot: fs.realpathSync.native(semanticRuntimeRoot),
        writableDirectories: [emptyHome, emptyTmp, outputDirectory] }), { mode: 0o600 });
      managedFile = "/usr/bin/sandbox-exec";
      managedArgs = ["-f", profileFile, process.execPath, workerPath, inputFile, outputFile, marker];
    } else {
      managedFile = opencodeIdentity.filesystem_isolation.launcher;
      managedArgs = benchmarkV3LinuxOracleArgs({ oracleDirectory,
        semanticRuntimeRoot: fs.realpathSync.native(semanticRuntimeRoot), workerPath, inputFile, outputFile, marker,
        writableDirectories: [emptyHome, emptyTmp, outputDirectory] });
    }
    const managed = await runManagedCommand({ file: managedFile, args: managedArgs, cwd: oracleWorkspace,
      env: { PATH: "/usr/bin:/bin", HOME: emptyHome, TMPDIR: emptyTmp, LANG: "C", LC_ALL: "C" },
      timeout: 150_000, maxOutputChars: 4096, outputMarker: marker, containmentOptions });
    assertBenchmarkV3CapabilityAuthorization(authorization);
    let receipt = null;
    try { receipt = JSON.parse(fs.readFileSync(outputFile, "utf8")); } catch { receipt = null; }
    const { receipt_mac: receiptMac, ...receiptBody } = receipt ?? {};
    let macValid = false;
    try {
      const expectedMac = createHmac("sha256", oracleMacKey).update(JSON.stringify(receiptBody)).digest();
      const actualMac = Buffer.from(receiptMac, "base64url");
      macValid = actualMac.length === expectedMac.length && timingSafeEqual(actualMac, expectedMac);
    } catch { macValid = false; }
    const authentic = managed.teardown_verified === true && FP.test(managed.containment_fingerprint ?? "")
      && managed.output_marker_match?.count === 1 && receipt?.schema_version === 2 && macValid
      && typeof receipt.semantic_passed === "boolean" && Array.isArray(receipt.changed_paths)
      && Array.isArray(receipt.scope_violations) && typeof receipt.oracle_workspace_mutated === "boolean"
      && (receipt.test_count === null || (Number.isSafeInteger(receipt.test_count) && receipt.test_count > 0));
    expect(authentic, "BENCHMARK_V3_RUNNER_ORACLE", "contained semantic oracle did not yield an authentic supervisor receipt");
    const originalAfterOracle = captureBenchmarkV3Workspace(workspace);
    expect(originalAfterOracle.fingerprint === originalAfterModel.fingerprint,
      "BENCHMARK_V3_RUNNER_ORACLE", "model-authored oracle execution mutated the scored workspace");
    const evidence = Object.freeze({ ...receipt, before_fingerprint: beforeSnapshot.fingerprint,
      after_fingerprint: originalAfterModel.fingerprint, containment_fingerprint: managed.containment_fingerprint });
    const scopeViolation = receipt.scope_violations.length > 0 || receipt.oracle_workspace_mutated === true;
    return Object.freeze({ passed: receipt.semantic_passed === true && !scopeViolation,
      semantic_passed: receipt.semantic_passed === true, scope_violation: scopeViolation,
      defect_severity: receipt.semantic_passed === true && !scopeViolation ? "none" : family.control_surface.defect_severity,
      test_count: receipt.test_count, changed_paths: Object.freeze(receipt.changed_paths), result_fingerprint: fingerprint(evidence) });
  } finally { fs.rmSync(oracleDirectory, { recursive: true, force: true }); }
}

async function calibrateBenchmarkV3Oracles({ sourceRoot, corpus, semanticRuntimeRoot, opencodeIdentity, containmentOptions = {} }) {
  const expectations = [];
  for (const family of corpus.families) {
    const workspace = stagePublicWorkspace(sourceRoot, family, false);
    try {
      const baselineBefore = captureBenchmarkV3Workspace(workspace);
      const baseline = await evaluateContainedBenchmarkV3Oracle({ workspace, beforeSnapshot: baselineBefore,
        family, semanticRuntimeRoot, opencodeIdentity, containmentOptions });
      expect(baseline.semantic_passed === false && Number.isSafeInteger(baseline.test_count),
        "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", `${family.family_id} contained baseline calibration is invalid`);
      for (const entry of family.control_surface.reference_files) {
        const target = path.resolve(workspace, ...entry.path.split("/"));
        const relative = path.relative(workspace, target);
        expect(relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
          "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", "reference calibration path escaped its workspace");
        fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, entry.content, "utf8");
      }
      const referenceBefore = captureBenchmarkV3Workspace(workspace);
      const reference = await evaluateContainedBenchmarkV3Oracle({ workspace, beforeSnapshot: referenceBefore,
        family, semanticRuntimeRoot, opencodeIdentity, containmentOptions });
      expect(reference.passed === true && reference.test_count === baseline.test_count,
        "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", `${family.family_id} contained reference calibration is invalid`);
      expectations.push(Object.freeze({ family_id: family.family_id, test_count: reference.test_count }));
    } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
  }
  return Object.freeze(expectations);
}

export function verifyBenchmarkV3FilesystemIsolation(sourceRoot, opencodeIdentity, capabilityAuthorization) {
  const authorization = assertBenchmarkV3CapabilityAuthorization(capabilityAuthorization);
  expect(["darwin", "linux"].includes(process.platform), "BENCHMARK_V3_RUNNER_FILESYSTEM_ISOLATION",
    "only signed Linux namespace and macOS sandbox execution paths are supported");
  if (process.platform === "linux") {
    const bwrap = ["/usr/bin/bwrap", "/usr/local/bin/bwrap"].find((entry) => fs.existsSync(entry));
    expect(bwrap !== undefined, "BENCHMARK_V3_RUNNER_FILESYSTEM_ISOLATION", "the signed Linux path requires bubblewrap");
    const stat = fs.lstatSync(bwrap);
    expect(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o111) !== 0,
      "BENCHMARK_V3_RUNNER_FILESYSTEM_ISOLATION", "the Linux namespace launcher is untrusted");
    const probe = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "benchmark-v3-bwrap-probe-"));
    try {
      const allowed = path.join(probe, "allowed.txt"); fs.writeFileSync(allowed, "public\n");
      const executableProbe = path.join(probe, "opencode");
      fs.copyFileSync(opencodeIdentity.path, executableProbe, fs.constants.COPYFILE_EXCL); fs.chmodSync(executableProbe, 0o500);
      expect(verifyBenchmarkV3OpenCodeExecutable(executableProbe).sha256 === opencodeIdentity.sha256,
        "BENCHMARK_V3_RUNNER_FILESYSTEM_ISOLATION", "Linux sandbox executable copy changed bytes");
      const forbidden = path.join(sourceRoot, "benchmarks", "v3", "corpus", "index.json");
      const systemRoots = ["/usr", "/bin", "/lib", "/lib64", "/opt", "/nix/store", "/etc/ssl", "/etc/pki", "/etc/ca-certificates",
        "/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf", path.dirname(process.execPath)]
        .filter((entry, index, values) => fs.existsSync(entry) && values.indexOf(entry) === index);
      const program = "const fs=require('node:fs'),{spawnSync}=require('node:child_process');if(fs.readFileSync(process.argv[1],'utf8')!=='public\\n')process.exit(2);try{fs.readFileSync(process.argv[2]);process.exit(3)}catch{}const r=spawnSync(process.argv[3],['--version'],{encoding:'utf8'});process.exit(r.status===0?0:4)";
      const result = run(bwrap, ["--die-with-parent", "--new-session", "--unshare-user-try", "--unshare-pid", "--unshare-ipc",
        "--unshare-uts", "--unshare-cgroup-try", "--share-net", "--proc", "/proc", "--dev", "/dev",
        ...systemRoots.flatMap((entry) => ["--ro-bind", entry, entry]), "--bind", probe, probe, "--chdir", probe,
        process.execPath, "-e", program, allowed, forbidden, executableProbe], { timeout: 30_000 });
      expect(passed(result), "BENCHMARK_V3_RUNNER_FILESYSTEM_ISOLATION", "Linux namespace probe did not enforce the closed read boundary");
    } finally { fs.rmSync(probe, { recursive: true, force: true }); }
    return Object.freeze({ schema_version: 1, backend: "linux-bubblewrap-v1", launcher: fs.realpathSync.native(bwrap),
      authorization_fingerprint: authorization.authorization_fingerprint });
  }
  const probe = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "benchmark-v3-sandbox-probe-"));
  try {
    const workspace = path.join(probe, "workspace"); fs.mkdirSync(workspace);
    const allowed = path.join(workspace, "allowed.txt"); fs.writeFileSync(allowed, "public\n");
    const forbidden = path.join(sourceRoot, "benchmarks", "v3", "corpus", "index.json");
    const worker = path.join(sourceRoot, "scripts", "benchmark-v3-attempt-worker.mjs");
    const profile = benchmarkV3SandboxProfile({ workspace, attemptDirectory: probe, opencodePath: opencodeIdentity.path, workerPath: worker });
    const profileFile = path.join(probe, "profile.sb"); fs.writeFileSync(profileFile, profile, { mode: 0o600 });
    const program = "const fs=require('node:fs');if(fs.readFileSync(process.argv[1],'utf8')!=='public\\n')process.exit(2);try{fs.readFileSync(process.argv[2]);process.exit(3)}catch{process.exit(0)}";
    const result = run("/usr/bin/sandbox-exec", ["-f", profileFile, process.execPath, "-e", program, allowed, forbidden],
      { env: { PATH: "/usr/bin:/bin", HOME: probe, TMPDIR: probe, LANG: "C", LC_ALL: "C" }, timeout: 30_000 });
    expect(passed(result), "BENCHMARK_V3_RUNNER_FILESYSTEM_ISOLATION", "filesystem sandbox did not enforce the closed read boundary");
    return Object.freeze({ schema_version: 1, backend: "macos-sandbox-exec-v1", launcher: "/usr/bin/sandbox-exec",
      authorization_fingerprint: authorization.authorization_fingerprint });
  } finally { fs.rmSync(probe, { recursive: true, force: true }); }
}

export function verifyBenchmarkV3OpenCodeExecutable(executable) {
  expect(typeof executable === "string" && path.isAbsolute(executable), "BENCHMARK_V3_RUNNER_OPENCODE", "an absolute OpenCode executable path is required");
  const resolved = fs.realpathSync.native(executable);
  const stat = fs.lstatSync(resolved);
  expect(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && (stat.mode & 0o111) !== 0 && stat.size > 0 && stat.size <= 256 * 1024 * 1024,
    "BENCHMARK_V3_RUNNER_OPENCODE", "OpenCode must resolve to one bounded executable ordinary file");
  const versionResult = run(resolved, ["--version"], { env: modelEnvironment(), timeout: 30_000, maxBuffer: 64 * 1024 });
  const version = versionResult.stdout.trim();
  expect(passed(versionResult) && /^1\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/u.test(version), "BENCHMARK_V3_RUNNER_OPENCODE", "OpenCode version probe failed");
  const helpResult = run(resolved, ["run", "--help"], { env: modelEnvironment(), timeout: 30_000, maxBuffer: 256 * 1024 });
  expect(passed(helpResult), "BENCHMARK_V3_RUNNER_OPENCODE", "OpenCode run capability probe failed");
  const help = `${helpResult.stdout}\n${helpResult.stderr}`;
  const body = Object.freeze({ schema_version: 1, path: resolved, size: stat.size, mode: stat.mode & 0o7777,
    device: String(stat.dev), inode: String(stat.ino), sha256: `sha256:${createHash("sha256").update(fs.readFileSync(resolved)).digest("hex")}`, version,
    variant_supported: /(?:^|\s)--variant(?:\s|,|$)/mu.test(help), seed_supported: /(?:^|\s)--seed(?:\s|,|$)/mu.test(help) });
  return Object.freeze({ ...body, executable_fingerprint: fingerprint(body) });
}

export function verifyBenchmarkV3ProductBundle(sourceRoot, materializedCoreDirectory) {
  const source = fs.realpathSync.native(path.resolve(sourceRoot));
  const installed = fs.realpathSync.native(path.resolve(materializedCoreDirectory));
  const expected = buildProfileBundleManifest(source, "core").manifest;
  let observed;
  try { observed = JSON.parse(fs.readFileSync(path.join(installed, ".opencode-profile-manifest.json"), "utf8")); } catch {
    fail("BENCHMARK_V3_RUNNER_PRODUCT_BINDING", "materialized core manifest is unavailable");
  }
  expect(fingerprint(observed) === fingerprint(expected) && observed.bundle_fingerprint === expected.bundle_fingerprint
    && observed.source_sha === gitSha(source) && observed.source_git_clean === true && observed.source_all_tracked === true,
  "BENCHMARK_V3_RUNNER_PRODUCT_BINDING", "materialized core manifest does not match the exact clean source");
  const declared = new Set([".opencode-profile-manifest.json", ...expected.files.map((entry) => entry.path)]);
  const actual = [];
  const visit = (directory, prefix = "") => {
    for (const name of fs.readdirSync(directory).sort()) {
      const relative = prefix === "" ? name : `${prefix}/${name}`;
      const target = path.join(directory, name);
      const stat = fs.lstatSync(target);
      expect(!stat.isSymbolicLink(), "BENCHMARK_V3_RUNNER_PRODUCT_BINDING", "materialized core contains a link");
      if (stat.isDirectory()) visit(target, relative);
      else if (stat.isFile() && stat.nlink === 1) actual.push(relative);
      else fail("BENCHMARK_V3_RUNNER_PRODUCT_BINDING", "materialized core contains an unsupported entry");
    }
  };
  visit(installed);
  expect(actual.length === declared.size && actual.every((entry) => declared.has(entry)), "BENCHMARK_V3_RUNNER_PRODUCT_BINDING", "materialized core file set drifted");
  for (const entry of expected.files) {
    const bytes = fs.readFileSync(path.join(installed, ...entry.path.split("/")));
    expect(bytes.byteLength === entry.size && `sha256:${createHash("sha256").update(bytes).digest("hex")}` === entry.sha256,
      "BENCHMARK_V3_RUNNER_PRODUCT_BINDING", `materialized core bytes drifted at ${entry.path}`);
  }
  return Object.freeze({ source_root: source, source_sha: expected.source_sha, materialized_core_directory: installed,
    architecture_fingerprint: expected.bundle_fingerprint, product_bundle_fingerprint: expected.bundle_fingerprint });
}

export function buildBenchmarkV3ModelBinding({ executableFingerprint, opencodeVersion, provider, model, variant,
  variantSupported, modelSamplingSeedSupported, corpusGenerationSeed, modelSamplingSeed = null,
  candidateBundleFingerprints, evaluatorFingerprint, corpusFingerprint, designFingerprint, semanticRuntimeFingerprint,
  armOrderPolicyFingerprint, publicArmOrderScheduleFingerprints }) {
  expect(FP.test(executableFingerprint) && FP.test(evaluatorFingerprint) && FP.test(corpusFingerprint)
    && FP.test(designFingerprint) && FP.test(semanticRuntimeFingerprint) && FP.test(armOrderPolicyFingerprint)
    && publicArmOrderScheduleFingerprints && FP.test(publicArmOrderScheduleFingerprints.development)
    && FP.test(publicArmOrderScheduleFingerprints.validation)
    && canonicalJson(Object.keys(publicArmOrderScheduleFingerprints).sort()) === canonicalJson(["development", "validation"]),
  "BENCHMARK_V3_RUNNER_BINDING", "binding fingerprints are invalid");
  for (const value of [opencodeVersion, provider, model, variant, corpusGenerationSeed]) expect(typeof value === "string" && value.length > 0, "BENCHMARK_V3_RUNNER_BINDING", "binding identity is invalid");
  expect(modelSamplingSeed === null || (modelSamplingSeedSupported === true && typeof modelSamplingSeed === "string" && modelSamplingSeed.length > 0),
    "BENCHMARK_V3_RUNNER_BINDING", "unsupported model sampling seed cannot be bound");
  return Object.freeze({ executable_fingerprint: executableFingerprint, opencode_version: opencodeVersion, provider, model, variant,
    supported_sampling_parameters: Object.freeze({ variant: variantSupported === true, model_sampling_seed: modelSamplingSeedSupported === true }),
    corpus_generation_seed: corpusGenerationSeed, model_sampling_seed: modelSamplingSeed,
    candidate_bundle_fingerprints: Object.freeze([...candidateBundleFingerprints]), evaluator_fingerprint: evaluatorFingerprint,
    corpus_fingerprint: corpusFingerprint, arm_order_policy_fingerprint: armOrderPolicyFingerprint,
    public_arm_order_schedule_fingerprints: Object.freeze({ ...publicArmOrderScheduleFingerprints }), design_fingerprint: designFingerprint,
    semantic_runtime_fingerprint: semanticRuntimeFingerprint });
}
export function buildBenchmarkV3CampaignFingerprint({ sourceSha, sourceTreeFingerprint, bindingsFingerprint,
  reviewFingerprints }) {
  expect(/^[0-9a-f]{40}$/u.test(sourceSha) && FP.test(sourceTreeFingerprint) && FP.test(bindingsFingerprint)
    && Array.isArray(reviewFingerprints) && reviewFingerprints.length >= 2 && reviewFingerprints.every((entry) => FP.test(entry)),
  "BENCHMARK_V3_RUNNER_BINDING", "campaign fingerprint inputs are invalid");
  return fingerprint({ schema_version: 2, source_sha: sourceSha, source_tree_fingerprint: sourceTreeFingerprint,
    bindings_fingerprint: bindingsFingerprint, review_fingerprints: reviewFingerprints });
}

export function resolveBenchmarkV3StudySeeds(corpus, {
  corpusGenerationSeed = null,
  modelSamplingSeed = null,
  modelSamplingSeedSupported = false,
} = {}) {
  const frozen = corpus?.generator?.corpus_generation_seed;
  expect(typeof frozen === "string" && frozen.length > 0,
    "BENCHMARK_V3_RUNNER_SEED", "frozen corpus generation seed is unavailable");
  expect(corpusGenerationSeed === null || corpusGenerationSeed === frozen,
    "BENCHMARK_V3_RUNNER_SEED", "corpus generation seed substitution is forbidden");
  expect(modelSamplingSeed === null || (modelSamplingSeedSupported === true && SAFE_ID.test(modelSamplingSeed)),
    "BENCHMARK_V3_RUNNER_SEED", "model sampling seed is unsupported or invalid");
  return Object.freeze({ corpus_generation_seed: frozen, model_sampling_seed: modelSamplingSeed });
}

function loadReviewIssuers(sourceRoot) {
  const file = path.join(sourceRoot, "benchmarks", "v3", "review-issuers.v1.json");
  let value;
  try { value = JSON.parse(fs.readFileSync(file, "utf8")); } catch { fail("BENCHMARK_V3_RUNNER_REVIEW", "review issuer registry is unavailable"); }
  expect(value?.schema_version === 1 && Array.isArray(value.issuers) && value.issuers.length >= 2,
    "BENCHMARK_V3_RUNNER_REVIEW", "review issuer registry is invalid");
  for (const issuer of value.issuers) expect(SAFE_ID.test(issuer?.issuer_id) && SAFE_ID.test(issuer?.reviewer_id)
    && SAFE_ID.test(issuer?.protected_channel) && path.isAbsolute(issuer?.channel_root)
    && Number.isSafeInteger(issuer?.owner_uid) && issuer.owner_uid >= 0
    && typeof issuer.public_key_pem === "string", "BENCHMARK_V3_RUNNER_REVIEW", "review issuer is invalid");
  expect(new Set(value.issuers.map((entry) => entry.issuer_id)).size === value.issuers.length
    && new Set(value.issuers.map((entry) => entry.reviewer_id)).size === value.issuers.length,
  "BENCHMARK_V3_RUNNER_REVIEW", "review issuers must be independent");
  return Object.freeze(value.issuers.map((entry) => Object.freeze(entry)));
}

function readProtectedReviewReceipt(file, issuer) {
  const configuredRoot = path.resolve(issuer.channel_root);
  let channelRoot;
  try { channelRoot = fs.realpathSync.native(configuredRoot); } catch {
    fail("BENCHMARK_V3_RUNNER_REVIEW", "independent review protected channel is unavailable");
  }
  const absoluteInput = path.resolve(file);
  let canonicalParent;
  try { canonicalParent = fs.realpathSync.native(path.dirname(absoluteInput)); } catch {
    fail("BENCHMARK_V3_RUNNER_REVIEW", "independent review protected channel is unavailable");
  }
  const absolute = path.join(canonicalParent, path.basename(absoluteInput));
  const relative = path.relative(channelRoot, absolute);
  expect(relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative),
    "BENCHMARK_V3_RUNNER_REVIEW", "review receipt is outside its independent protected channel");
  let current = path.dirname(absolute);
  while (true) {
    const stat = fs.lstatSync(current);
    expect(stat.isDirectory() && !stat.isSymbolicLink() && [0, issuer.owner_uid].includes(stat.uid)
      && (stat.mode & 0o022) === 0, "BENCHMARK_V3_RUNNER_REVIEW", "review channel ancestry is writable by an untrusted principal");
    if (current === channelRoot) break;
    const parent = path.dirname(current);
    expect(parent !== current && !path.relative(channelRoot, parent).startsWith(".."),
      "BENCHMARK_V3_RUNNER_REVIEW", "review channel ancestry escaped its root");
    current = parent;
  }
  const descriptor = fs.openSync(absoluteInput, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs.fstatSync(descriptor);
    expect(stat.isFile() && stat.nlink === 1 && stat.uid === issuer.owner_uid && (stat.mode & 0o022) === 0 && stat.size <= 64 * 1024,
      "BENCHMARK_V3_RUNNER_REVIEW", "review receipt ownership or mode is untrusted");
    return JSON.parse(fs.readFileSync(descriptor, "utf8"));
  } finally { fs.closeSync(descriptor); }
}

export function validateBenchmarkV3ReviewReceipt(file, { sourceSha, sourceTreeFingerprint, trustedIssuers }) {
  expect(Array.isArray(trustedIssuers), "BENCHMARK_V3_RUNNER_REVIEW", "review issuer registry is unavailable");
  const matching = trustedIssuers.filter((issuer) => {
    try { return fs.realpathSync.native(path.resolve(file)).startsWith(`${fs.realpathSync.native(issuer.channel_root)}${path.sep}`); } catch { return false; }
  });
  expect(matching.length === 1, "BENCHMARK_V3_RUNNER_REVIEW", "review receipt protected channel is untrusted or ambiguous");
  const issuer = matching[0];
  let value;
  try { value = readProtectedReviewReceipt(file, issuer); } catch (error) {
    if (error instanceof ContractError) throw error;
    fail("BENCHMARK_V3_RUNNER_REVIEW", "review receipt is unavailable");
  }
  expect(value?.schema_version === 3 && value.issuer_id === issuer.issuer_id && value.reviewer_id === issuer.reviewer_id
    && value.protected_channel === issuer.protected_channel
    && SAFE_ID.test(value.reviewer_id) && value.read_only === true && value.verdict === "passed"
    && value.high_findings === 0 && value.medium_findings === 0 && value.source_sha === sourceSha
    && value.corpus_contract_reviewed === true && value.contract_coverage_reviewed === true && value.oracle_leakage_reviewed === true
    && value.source_tree_fingerprint === sourceTreeFingerprint && FP.test(value.review_fingerprint)
    && typeof value.reviewed_at === "string" && Number.isFinite(Date.parse(value.reviewed_at))
    && typeof value.signature === "string" && /^[A-Za-z0-9_-]{86}$/u.test(value.signature),
  "BENCHMARK_V3_RUNNER_REVIEW", "review receipt is invalid or stale");
  const unsigned = { ...value }; delete unsigned.review_fingerprint; delete unsigned.signature;
  expect(value.review_fingerprint === fingerprint(unsigned), "BENCHMARK_V3_RUNNER_REVIEW", "review receipt fingerprint is stale");
  const signed = { ...unsigned, review_fingerprint: value.review_fingerprint };
  let signatureValid = false;
  try { signatureValid = verifySignature(null, Buffer.from(canonicalJson(signed), "utf8"), createPublicKey(issuer.public_key_pem), Buffer.from(value.signature, "base64url")); } catch {}
  expect(signatureValid, "BENCHMARK_V3_RUNNER_REVIEW", "review receipt signature is invalid");
  return Object.freeze(value);
}

export async function runBenchmarkV3ModelFreeGate({ sourceRoot, candidateBundles, reviewReceiptPaths, readinessReceiptPaths,
  semanticRuntimeRoot, opencodeExecutable, outputDirectory, executionAuthorityPath, holdoutCommitmentPath,
  readinessTrustedIssuers, executionAuthorityTrustedIssuers, holdoutTrustedIssuers }) {
  const source = fs.realpathSync.native(path.resolve(sourceRoot));
  expect(typeof semanticRuntimeRoot === "string" && path.isAbsolute(semanticRuntimeRoot),
    "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", "a frozen absolute semantic runtime root is required");
  assertClean(source);
  const sourceSha = gitSha(source);
  const prepared = buildProfileBundleManifest(source, "lab").manifest;
  const corpus = loadBenchmarkV3Corpus(source);
  const { value: designValue, validation: designValidation } = loadBenchmarkV3Design(source);
  const authority = loadSignedBenchmarkV3ExecutionAuthority({ sourceRoot: source, receiptPath: executionAuthorityPath,
    sourceSha, sourceTreeFingerprint: prepared.source_tree_fingerprint, designFingerprint: designValidation.design_fingerprint,
    corpusFingerprint: corpus.corpus_fingerprint, outputDirectory: path.resolve(outputDirectory),
    ...(executionAuthorityTrustedIssuers === undefined ? {} : { trustedIssuers: executionAuthorityTrustedIssuers }) });
  const holdoutCommitment = loadSignedBenchmarkV3HoldoutCommitment({ sourceRoot: source, commitmentPath: holdoutCommitmentPath,
    campaignExecutionId: authority.receipt.campaign_execution_id, holdoutExecutionId: authority.receipt.holdout_execution_id,
    sourceSha, sourceTreeFingerprint: prepared.source_tree_fingerprint, designFingerprint: designValidation.design_fingerprint,
    corpusFingerprint: corpus.corpus_fingerprint,
    ...(holdoutTrustedIssuers === undefined ? {} : { trustedIssuers: holdoutTrustedIssuers }) });
  expect(corpus.development_execution_eligible === true && corpus.confirmatory_eligible === false,
    "BENCHMARK_V3_RUNNER_CONTRACT_COMPLETENESS",
    "the public corpus must be explicitly development-only and ineligible for confirmatory claims");
  expect(Array.isArray(candidateBundles) && candidateBundles.length === 1,
    "BENCHMARK_V3_RUNNER_CANDIDATE", "exactly one frozen candidate is required");
  const candidates = candidateBundles.map((entry) => verifyBenchmarkV3ProductBundle(entry.sourceRoot, entry.materializedCoreDirectory));
  expect(candidates.every((entry) => entry.source_root === source && entry.source_sha === sourceSha),
    "BENCHMARK_V3_RUNNER_CANDIDATE", "every candidate must be materialized from the exact independently reviewed source tree");
  expect(new Set(candidates.map((entry) => entry.architecture_fingerprint)).size === candidates.length,
    "BENCHMARK_V3_RUNNER_CANDIDATE", "registered candidate architecture fingerprints must be distinct");
  const opencode = verifyBenchmarkV3OpenCodeExecutable(opencodeExecutable);
  const capabilityAuthorization = authorizeBenchmarkV3Capabilities(readinessReceiptPaths, {
    sourceRoot: source,
    scope: "development",
    ...(readinessTrustedIssuers === undefined ? {} : { trustedIssuers: readinessTrustedIssuers }),
  });
  const filesystemIsolation = verifyBenchmarkV3FilesystemIsolation(source, opencode, capabilityAuthorization);
  expect(opencode.variant_supported, "BENCHMARK_V3_RUNNER_OPENCODE_CAPABILITY",
    "OpenCode must support exact --variant execution binding before any model call");
  expect(Array.isArray(reviewReceiptPaths) && reviewReceiptPaths.length === 2,
    "BENCHMARK_V3_RUNNER_REVIEW", "two review receipts are required");
  const reviewIssuers = loadReviewIssuers(source);
  const reviews = reviewReceiptPaths.map((file) => validateBenchmarkV3ReviewReceipt(file, { sourceSha,
    sourceTreeFingerprint: prepared.source_tree_fingerprint, trustedIssuers: reviewIssuers }));
  expect(new Set(reviews.map((entry) => entry.reviewer_id)).size === 2
    && new Set(reviews.map((entry) => entry.issuer_id)).size === 2,
  "BENCHMARK_V3_RUNNER_REVIEW", "reviewers and signing issuers must be independent");
  const calibrationIdentity = Object.freeze({ ...opencode, filesystem_isolation: filesystemIsolation });
  EXECUTION_AUTHORIZATIONS.set(calibrationIdentity, capabilityAuthorization);
  ORACLE_EXPECTATIONS.set(calibrationIdentity, new Map());
  const semanticOracleExpectations = await calibrateBenchmarkV3Oracles({ sourceRoot: source, corpus,
    semanticRuntimeRoot, opencodeIdentity: calibrationIdentity });
  expect(semanticOracleExpectations.length === corpus.families.length,
  "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", "semantic oracle test-count calibration is incomplete");
  const checks = [
    ["npm", ["run", "verify:benchmark:v3:design"]],
    ["npm", ["run", "verify:benchmark:v3:corpus"]],
    ["npm", ["run", "verify:benchmark:v3:ledger"]],
    ["npm", ["run", "verify:benchmark:v3:runner"]],
    ["npm", ["run", "verify:benchmark:v3:contract-audit"]],
    ["npm", ["run", "verify:core-product-installed-runtime"]],
    ["npm", ["run", "verify"]],
  ];
  const checkResults = [Object.freeze({ command: "direct semantic oracle calibration",
    output_fingerprint: fingerprint(semanticOracleExpectations) })];
  for (const [command, args] of checks) {
    const result = run(command, args, { cwd: source, env: { ...process.env, BENCHMARK_V3_GATE_CHILD: "1", BENCHMARK_V3_ESLINT_RUNTIME_ROOT: semanticRuntimeRoot } });
    expect(passed(result), "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", `${command} ${args.join(" ")} did not pass`);
    checkResults.push(Object.freeze({ command: `${command} ${args.join(" ")}`, output_fingerprint: fingerprint(`${result.stdout}\n${result.stderr}`) }));
  }
  const semanticRuntime = fingerprintBenchmarkV3SemanticRuntime(semanticRuntimeRoot, corpus.families.map((entry) => entry.control_surface.runtime_key));
  const body = { schema_version: 1, source_sha: sourceSha, source_tree_fingerprint: prepared.source_tree_fingerprint,
    design_fingerprint: designValidation.design_fingerprint, corpus_fingerprint: corpus.corpus_fingerprint,
    semantic_runtime_fingerprint: semanticRuntime.runtime_fingerprint,
    semantic_oracle_expectations_fingerprint: fingerprint(semanticOracleExpectations),
    opencode_executable_fingerprint: opencode.executable_fingerprint,
    capability_authorization_fingerprint: capabilityAuthorization.authorization_fingerprint,
    filesystem_isolation_fingerprint: fingerprint(filesystemIsolation),
    candidate_product_bundle_fingerprints: candidates.map((entry) => entry.product_bundle_fingerprint),
    execution_authority_fingerprint: authority.authority_fingerprint,
    holdout_selection_commitment_fingerprint: holdoutCommitment.commitment_fingerprint,
    checks: checkResults, review_fingerprints: reviews.map((entry) => entry.review_fingerprint) };
  const gate = Object.freeze({ ...body, reviewed_source_root: source, gate_fingerprint: fingerprint(body), candidates: Object.freeze(candidates),
    semantic_runtime_entries: semanticRuntime.entries, opencode_executable: opencode, filesystem_isolation: filesystemIsolation,
    semantic_oracle_expectations: semanticOracleExpectations,
    capability_authorization: capabilityAuthorization, execution_authority: authority,
    holdout_selection_commitment: holdoutCommitment, design: designValue });
  AUTHORIZED_GATES.add(gate);
  return gate;
}

function stagePublicWorkspace(sourceRoot, family, candidate) {
  const workspace = materializeBenchmarkV3Workspace(sourceRoot, family);
  expect(passed(run("git", ["init", "--quiet"], { cwd: workspace })) && passed(run("git", ["add", "."], { cwd: workspace })),
    "BENCHMARK_V3_RUNNER_WORKSPACE", "attempt workspace could not be initialized");
  if (candidate) {
    const catalog = path.join(workspace, ".git", "opencode-harness", "core", "checks.json");
    fs.mkdirSync(path.dirname(catalog), { recursive: true });
    const check = benchmarkV3CandidateCheck(family);
    fs.writeFileSync(catalog, `${JSON.stringify({ schema_version: 2, catalog_id: "benchmark-v3-public", checks: [check] })}\n`, "utf8");
  }
  return workspace;
}

export function buildBenchmarkV3AttemptEnvelope({ family, armId, sourceSha, productBundleFingerprint, opencodeExecutableFingerprint,
  model, provider, variant, corpusGenerationSeed, modelSamplingSeed = null, executionId, armOrderScheduleFingerprint,
  scheduleEntry, holdoutSelectionCommitmentFingerprint }) {
  for (const value of [armId, model, provider, variant, corpusGenerationSeed]) expect(SAFE_ID.test(value), "BENCHMARK_V3_RUNNER_ARGUMENT", "attempt identity is invalid");
  expect(modelSamplingSeed === null || SAFE_ID.test(modelSamplingSeed), "BENCHMARK_V3_RUNNER_ARGUMENT", "model sampling seed is invalid");
  expect(/^[0-9a-f]{40}$/u.test(sourceSha) && FP.test(productBundleFingerprint) && FP.test(opencodeExecutableFingerprint)
    && SAFE_ID.test(executionId) && FP.test(armOrderScheduleFingerprint) && FP.test(scheduleEntry?.entry_fingerprint)
    && scheduleEntry.family_id === family.family_id && scheduleEntry.arms.includes(armId === "plain-baseline" ? "baseline" : "candidate")
    && FP.test(holdoutSelectionCommitmentFingerprint), "BENCHMARK_V3_RUNNER_ARGUMENT", "attempt binding is invalid");
  const body = Object.freeze({ schema_version: 2, family_id: family.family_id, split: family.split, stratum: family.stratum,
    arm_id: armId, source_sha: sourceSha, product_bundle_fingerprint: productBundleFingerprint, opencode_executable_fingerprint: opencodeExecutableFingerprint,
    execution_id: executionId, arm_order_schedule_fingerprint: armOrderScheduleFingerprint,
    schedule_entry_fingerprint: scheduleEntry.entry_fingerprint, scheduled_order: scheduleEntry.order,
    holdout_selection_commitment_fingerprint: holdoutSelectionCommitmentFingerprint,
    model, provider, variant, corpus_generation_seed: corpusGenerationSeed, model_sampling_seed: modelSamplingSeed,
    prompt: family.public_surface.visible_requirements.join("\n\n"),
    public_surface_fingerprint: family.manifest.public_surface_fingerprint });
  const serialized = JSON.stringify(body);
  expect(!serialized.includes("control_surface") && !serialized.includes("reference_files")
    && !serialized.includes("baseline_outcome") && !serialized.includes("baseline_failure"),
    "BENCHMARK_V3_RUNNER_VISIBILITY", "attempt envelope leaked runner-owned control data");
  return Object.freeze({ ...body, envelope_fingerprint: fingerprint(body) });
}

async function executeAttempt({ sourceRoot, semanticRuntimeRoot, semanticRuntimeEntries, family, arm, opencodeIdentity, model, provider, variant,
  seed, modelSamplingSeed, timeoutMs, executionId, schedule, scheduleEntry, holdoutSelectionCommitmentFingerprint,
  containmentOptions = {}, durableCompletion = null }) {
  const workspace = stagePublicWorkspace(sourceRoot, family, arm.kind === "candidate");
  let attemptDirectory = null;
  let outputFile = null;
  let envelope = null;
  const started = process.hrtime.bigint();
  const attemptTimeouts = benchmarkV3AttemptTimeouts(timeoutMs, arm.kind);
  const finishOutcome = (value) => {
    const outcome = Object.freeze(value);
    if (durableCompletion?.path !== null && durableCompletion?.path !== undefined) durableJson(durableCompletion.path, {
      schema_version: 1, campaign_fingerprint: durableCompletion.campaign_fingerprint,
      arm_id: arm.arm_id, family_id: family.family_id, attempt_index: durableCompletion.attempt_index,
      attempt_binding_fingerprint: durableCompletion.attempt_binding_fingerprint,
      outcome, outcome_fingerprint: fingerprint(outcome),
    });
    return outcome;
  };
  try {
    assertBenchmarkV3CapabilityAuthorization(EXECUTION_AUTHORIZATIONS.get(opencodeIdentity),
      { minimumRemainingMs: attemptTimeouts.complete_authorization_reservation_ms });
    assertReviewedSourceCurrent(sourceRoot, arm.source_sha, arm.source_tree_fingerprint);
    envelope = buildBenchmarkV3AttemptEnvelope({ family, armId: arm.arm_id, sourceSha: arm.source_sha,
      productBundleFingerprint: arm.product_bundle_fingerprint, opencodeExecutableFingerprint: opencodeIdentity.executable_fingerprint,
      model, provider, variant, corpusGenerationSeed: seed, modelSamplingSeed, executionId,
      armOrderScheduleFingerprint: schedule.schedule_fingerprint, scheduleEntry,
      holdoutSelectionCommitmentFingerprint });
    attemptDirectory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "benchmark-v3-receipt-"));
    let executionOpenCodeIdentity = opencodeIdentity;
    if (opencodeIdentity.filesystem_isolation.backend === "linux-bubblewrap-v1") {
      const executableCopy = path.join(attemptDirectory, "opencode");
      fs.copyFileSync(opencodeIdentity.path, executableCopy, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(executableCopy, 0o500);
      const copied = verifyBenchmarkV3OpenCodeExecutable(executableCopy);
      expect(copied.sha256 === opencodeIdentity.sha256 && copied.version === opencodeIdentity.version
        && copied.variant_supported === opencodeIdentity.variant_supported && copied.seed_supported === opencodeIdentity.seed_supported,
      "BENCHMARK_V3_RUNNER_OPENCODE", "sandbox-mounted OpenCode copy differs from the gate-bound executable");
      executionOpenCodeIdentity = Object.freeze({ ...copied, filesystem_isolation: opencodeIdentity.filesystem_isolation });
    }
    const attemptConfig = path.join(attemptDirectory, "configuration");
    if (arm.kind === "candidate") fs.cpSync(arm.materialized_core_directory, attemptConfig, { recursive: true, errorOnExist: true, force: false });
    else fs.mkdirSync(attemptConfig, { mode: 0o700 });
    if (arm.kind === "candidate") {
      const rebound = verifyBenchmarkV3ProductBundle(sourceRoot, attemptConfig);
      expect(rebound.product_bundle_fingerprint === arm.product_bundle_fingerprint, "BENCHMARK_V3_RUNNER_PRODUCT_BINDING", "attempt product differs from the gate-bound product");
    } else expect(closedDirectoryFingerprint(attemptConfig) === fingerprint([]),
      "BENCHMARK_V3_RUNNER_PRODUCT_BINDING", "baseline configuration is not empty before the common host bridge");
    const credentialBridge = installCredentialBridge(sourceRoot, attemptDirectory, attemptConfig, provider);
    const configurationBefore = closedDirectoryFingerprint(attemptConfig);
    expect(verifyBenchmarkV3OpenCodeExecutable(opencodeIdentity.path).executable_fingerprint === opencodeIdentity.executable_fingerprint,
      "BENCHMARK_V3_RUNNER_OPENCODE", "OpenCode changed after the gate");
    const modelId = provider.includes("/") ? provider : `${provider}/${model}`;
    const samplingArgs = modelSamplingSeed === null ? [] : ["--seed", modelSamplingSeed];
    const opencodeArgs = ["run", "--format", "json", "--model", modelId, "--variant", variant, ...samplingArgs,
      "--agent", arm.agent_id, "--dir", workspace, envelope.prompt];
    const command = arm.kind === "candidate" ? process.execPath : executionOpenCodeIdentity.path;
    const argv = arm.kind === "candidate" ? [path.join(attemptConfig, "runtime", "opencode-core.mjs"), "--workspace", workspace,
      "--opencode", executionOpenCodeIdentity.path, "--receipt-fd", "3", "--child-timeout-ms", String(attemptTimeouts.wrapper_timeout_ms), "--", ...opencodeArgs] : opencodeArgs;
    const beforeSnapshot = captureBenchmarkV3Workspace(workspace);
    const catalogBefore = coreCatalogFingerprint(workspace);
    const inputFile = path.join(attemptDirectory, "input.json");
    outputFile = path.join(attemptDirectory, "output.json");
    const isolatedHome = path.join(attemptDirectory, "home"); fs.mkdirSync(isolatedHome, { mode: 0o700 });
    const isolatedTmp = path.join(attemptDirectory, "tmp"); fs.mkdirSync(isolatedTmp, { mode: 0o700 });
    const sourceWorkerPath = path.join(sourceRoot, "scripts", "benchmark-v3-attempt-worker.mjs");
    const workerPath = opencodeIdentity.filesystem_isolation.backend === "linux-bubblewrap-v1"
      ? path.join(attemptDirectory, "attempt-worker.mjs") : sourceWorkerPath;
    if (workerPath !== sourceWorkerPath) fs.copyFileSync(sourceWorkerPath, workerPath);
    const sandboxProfileFile = path.join(attemptDirectory, "profile.sb");
    if (opencodeIdentity.filesystem_isolation.backend === "macos-sandbox-exec-v1") {
      fs.writeFileSync(sandboxProfileFile, benchmarkV3SandboxProfile({ workspace, attemptDirectory,
        opencodePath: opencodeIdentity.path, workerPath }), { mode: 0o600 });
    }
    const marker = `BENCHMARK_V3_COMPLETED_${fingerprint(envelope).slice(7, 31)}`;
    const activationBinding = arm.kind === "candidate" ? benchmarkV3ActivationBinding(workspace) : null;
    fs.writeFileSync(inputFile, JSON.stringify({ schema_version: 1, file: command, args: argv, cwd: workspace, timeout_ms: attemptTimeouts.worker_timeout_ms,
      env_overrides: { OPENCODE_CONFIG_DIR: attemptConfig,
        OPENCODE_AUTH_CONTENT: credentialBridge.placeholder_auth_content,
        BENCHMARK_V3_CREDENTIAL_FILE: credentialBridge.credential_file }, opencode_identity: executionOpenCodeIdentity,
      activation_binding: activationBinding }), { mode: 0o600 });
    let managed;
    try {
      const managedFile = opencodeIdentity.filesystem_isolation.launcher;
      const managedArgs = opencodeIdentity.filesystem_isolation.backend === "macos-sandbox-exec-v1"
        ? ["-f", sandboxProfileFile, process.execPath, workerPath, inputFile, outputFile, marker]
        : benchmarkV3LinuxBubblewrapArgs({ workspace, attemptDirectory, workerPath, inputFile, outputFile, marker });
      managed = await runManagedCommand({ file: managedFile,
        args: managedArgs,
        cwd: workspace, env: { ...modelEnvironment(), HOME: isolatedHome, TMPDIR: isolatedTmp }, timeout: attemptTimeouts.managed_timeout_ms,
        maxOutputChars: 4096, outputMarker: marker, containmentOptions });
    } catch (error) {
      let failedReceipt = null;
      try { failedReceipt = JSON.parse(fs.readFileSync(outputFile, "utf8")); } catch { failedReceipt = null; }
      const consumedTokens = Number.isSafeInteger(failedReceipt?.tokens) && failedReceipt.tokens >= 0 ? failedReceipt.tokens : 0;
      return finishOutcome({ family_id: family.family_id, stratum: family.stratum, passed: false, defect_severity: family.control_surface.defect_severity,
        scope_violation: false, timeout: failedReceipt?.timed_out === true, duration_ms: Number(process.hrtime.bigint() - started) / 1e6, tokens: consumedTokens, activation: false,
        ...attemptReceiptMetrics(failedReceipt), infrastructure_failure: true, completion_accepted: false, process_status: null,
        result_fingerprint: fingerprint({ envelope, containment_error: error?.classification ?? error?.code ?? "unknown" }) });
    }
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    assertReviewedSourceCurrent(sourceRoot, arm.source_sha, arm.source_tree_fingerprint);
    expect(verifyBenchmarkV3OpenCodeExecutable(opencodeIdentity.path).executable_fingerprint === opencodeIdentity.executable_fingerprint,
      "BENCHMARK_V3_RUNNER_OPENCODE", "OpenCode changed during the attempt");
    let receipt = null;
    try { receipt = JSON.parse(fs.readFileSync(outputFile, "utf8")); } catch { receipt = null; }
    const contained = managed.teardown_verified === true && FP.test(managed.containment_fingerprint ?? "") && managed.output_marker_match?.count === 1;
    const receiptClassification = classifyBenchmarkV3AttemptReceipt(receipt, arm.kind);
    const completionAccepted = contained && receiptClassification.complete_scored_outcome;
    const runtimeEntry = semanticRuntimeEntries.find((entry) => entry.key === family.control_surface.runtime_key);
    assertBenchmarkV3CapabilityAuthorization(EXECUTION_AUTHORIZATIONS.get(opencodeIdentity), { minimumRemainingMs: 150_000 });
    expect(runtimeEntry !== undefined && fingerprintBenchmarkV3SemanticRuntimeKey(semanticRuntimeRoot,
      family.control_surface.runtime_key).key_fingerprint === runtimeEntry.key_fingerprint,
    "BENCHMARK_V3_RUNNER_ORACLE", "semantic oracle runtime changed after the gate");
    const subjectSafety = verifyBenchmarkV3OracleSubjectSafety(workspace, beforeSnapshot, family);
    const oracle = subjectSafety.safe
      ? await evaluateContainedBenchmarkV3Oracle({ workspace, beforeSnapshot, family, semanticRuntimeRoot,
        opencodeIdentity, containmentOptions })
      : Object.freeze({ passed: false, semantic_passed: false, scope_violation: true,
        defect_severity: family.control_surface.defect_severity, changed_paths: subjectSafety.changed_paths,
        result_fingerprint: fingerprint(subjectSafety) });
    const catalogAfter = coreCatalogFingerprint(workspace);
    const catalogDrift = catalogBefore !== catalogAfter;
    expect(!fs.existsSync(credentialBridge.credential_file), "BENCHMARK_V3_RUNNER_CREDENTIAL_BOUNDARY",
      "OpenCode did not consume and erase the one-shot host credential file");
    const configurationAfter = closedDirectoryFingerprint(attemptConfig);
    const configurationDrift = configurationBefore !== configurationAfter;
    const taskPassed = oracle.passed && receiptClassification.verification_succeeded && !catalogDrift && !configurationDrift;
    return finishOutcome({ family_id: family.family_id, stratum: family.stratum, passed: taskPassed,
      defect_severity: taskPassed ? "none" : family.control_surface.defect_severity, scope_violation: oracle.scope_violation || catalogDrift || configurationDrift,
      timeout: receipt?.timed_out === true, duration_ms: durationMs,
      tokens: receipt?.tokens ?? 0, activation: arm.kind === "baseline" ? true : receipt?.activation === true && !catalogDrift && !configurationDrift,
      ...attemptReceiptMetrics(receipt),
      activation_eligible: arm.kind === "candidate" && oracle.changed_paths.some((entry) => family.control_surface.allowed_mutation_paths.includes(entry)),
      infrastructure_failure: !completionAccepted, completion_accepted: completionAccepted,
      receipt_authentic: receiptClassification.receipt_authentic,
      process_status: receipt?.status ?? null, containment_fingerprint: managed.containment_fingerprint,
      result_fingerprint: fingerprint({ envelope, oracle: oracle.result_fingerprint, receipt, containment: managed.containment_fingerprint,
        catalog_before: catalogBefore, catalog_after: catalogAfter, configuration_before: configurationBefore,
        configuration_after: configurationAfter, duration_ms: durationMs }) });
  } catch (error) {
    let failedReceipt = null;
    try { failedReceipt = JSON.parse(fs.readFileSync(outputFile, "utf8")); } catch { failedReceipt = null; }
    return finishOutcome({ family_id: family.family_id, stratum: family.stratum, passed: false,
      defect_severity: family.control_surface.defect_severity, scope_violation: false, timeout: failedReceipt?.timed_out === true,
      duration_ms: Number(process.hrtime.bigint() - started) / 1e6,
      tokens: Number.isSafeInteger(failedReceipt?.tokens) && failedReceipt.tokens >= 0 ? failedReceipt.tokens : 0,
      ...attemptReceiptMetrics(failedReceipt), activation: false, infrastructure_failure: true,
      completion_accepted: false, process_status: failedReceipt?.status ?? null,
      result_fingerprint: fingerprint({ envelope, post_execution_error: error?.code ?? "unknown", receipt_fingerprint: failedReceipt === null ? null : fingerprint(failedReceipt) }) });
  } finally {
    if (attemptDirectory !== null) fs.rmSync(attemptDirectory, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

function finding(outcome) {
  if (outcome.passed) return [];
  if (outcome.defect_severity === "unclassified") return [];
  return [{ finding_id: `oracle-${outcome.family_id}`, family: outcome.family_id, violated_contract: "hidden-upstream-semantic-test",
    evidence_source: { kind: "trusted-check", source_id: `v3-oracle-${outcome.family_id}`, path: null, summary: "Runner-owned hidden oracle did not accept the workspace." }, severity: outcome.defect_severity }];
}
function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values) { const ordered = [...values].sort((a, b) => a - b); const middle = Math.floor(ordered.length / 2); return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2; }
function successSummary(outcomes) {
  const successCount = outcomes.filter((entry) => entry.passed).length;
  return Object.freeze({ count: outcomes.length, success_count: successCount,
    success_rate: outcomes.length === 0 ? 0 : successCount / outcomes.length,
    attempt_count: outcomes.reduce((sum, entry) => sum + (entry.attempt_count ?? 1), 0),
    tokens: outcomes.reduce((sum, entry) => sum + entry.tokens, 0),
    duration_ms: outcomes.reduce((sum, entry) => sum + entry.duration_ms, 0),
    turn_count: outcomes.reduce((sum, entry) => sum + (entry.turn_count ?? 0), 0),
    tool_call_count: outcomes.reduce((sum, entry) => sum + (entry.tool_call_count ?? 0), 0) });
}
function relativeLift(baselineRate, candidateRate) { return baselineRate === 0 ? null : (candidateRate - baselineRate) / baselineRate; }

export function summarizeBenchmarkV3Stage({ baseline, candidate, confidenceLevel = 0.95 }) {
  expect(Array.isArray(baseline) && Array.isArray(candidate) && baseline.length > 0 && baseline.length === candidate.length,
    "BENCHMARK_V3_RUNNER_RESULT", "paired stage outcomes are incomplete");
  const candidateById = new Map(candidate.map((entry) => [entry.family_id, entry]));
  expect(candidateById.size === candidate.length, "BENCHMARK_V3_RUNNER_RESULT", "candidate family outcomes are duplicated");
  let candidateOnly = 0; let baselineOnly = 0; let newCritical = 0; let newBlocking = 0;
  const relations = [];
  for (const left of baseline) {
    const right = candidateById.get(left.family_id);
    expect(right !== undefined && right.stratum === left.stratum, "BENCHMARK_V3_RUNNER_RESULT", "paired family identity drifted");
    if (!left.passed && right.passed) candidateOnly += 1;
    if (left.passed && !right.passed) baselineOnly += 1;
    const defects = evaluatePairedDefects({ baseline: { functional_task_success: left.passed, scope_violation: left.scope_violation === true, findings: finding(left) }, candidate: { functional_task_success: right.passed, scope_violation: right.scope_violation === true, findings: finding(right) } });
    newCritical += defects.new_critical_regression;
    newBlocking += defects.new_high_medium_regression;
    relations.push(defects);
  }
  const discordant = candidateOnly + baselineOnly;
  const interval = exactConservativePairedDeltaInterval({ familyCount: baseline.length, candidateOnly, baselineOnly, confidenceLevel });
  const smallLeft = baseline.filter((entry) => entry.stratum === "small");
  const smallRight = new Map(candidate.filter((entry) => entry.stratum === "small").map((entry) => [entry.family_id, entry]));
  const smallCandidateOnly = smallLeft.filter((entry) => !entry.passed && smallRight.get(entry.family_id)?.passed).length;
  const smallBaselineOnly = smallLeft.filter((entry) => entry.passed && !smallRight.get(entry.family_id)?.passed).length;
  const smallInterval = exactConservativePairedDeltaInterval({ familyCount: smallLeft.length, candidateOnly: smallCandidateOnly, baselineOnly: smallBaselineOnly, confidenceLevel });
  const baselineDurations = baseline.map((entry) => entry.duration_ms);
  const candidateDurations = candidate.map((entry) => entry.duration_ms);
  const pairedDelta = (candidateOnly - baselineOnly) / baseline.length;
  const activationEligible = candidate.filter((entry) => entry.activation_eligible === true);
  const baselineSummary = successSummary(baseline);
  const candidateSummary = successSummary(candidate);
  const stratumBreakdown = Object.freeze(Object.fromEntries(["small", "medium", "high"].map((stratum) => {
    const left = successSummary(baseline.filter((entry) => entry.stratum === stratum));
    const right = successSummary(candidate.filter((entry) => entry.stratum === stratum));
    return [stratum, Object.freeze({ family_count: left.count, baseline_success_count: left.success_count,
      candidate_success_count: right.success_count, baseline_success_rate: left.success_rate,
      candidate_success_rate: right.success_rate, absolute_delta: right.success_rate - left.success_rate,
      relative_lift: relativeLift(left.success_rate, right.success_rate) })];
  })));
  const report = Object.freeze({ family_count: baseline.length, candidate_only: candidateOnly, baseline_only: baselineOnly, discordant,
    paired_delta: pairedDelta, exact_p: discordant === 0 ? 1 : exactBinomialUpperTail(discordant, candidateOnly, 0.5), confidence_interval: interval,
    baseline_success_count: baselineSummary.success_count, candidate_success_count: candidateSummary.success_count,
    baseline_success_rate: baselineSummary.success_rate, candidate_success_rate: candidateSummary.success_rate,
    absolute_success_rate_delta: candidateSummary.success_rate - baselineSummary.success_rate,
    relative_lift: relativeLift(baselineSummary.success_rate, candidateSummary.success_rate), stratum_breakdown: stratumBreakdown,
    new_critical_regressions: newCritical, new_unclassified_semantic_regressions: baselineOnly,
    new_high_medium_regression_delta: newBlocking / baseline.length,
    new_high_medium_upper_ci: exactBinomialUpperConfidenceBound(baseline.length, newBlocking, confidenceLevel),
    small_discordant: smallCandidateOnly + smallBaselineOnly, small_delta_lower_ci: smallInterval[0], timeout_delta: (candidate.filter((entry) => entry.timeout).length - baseline.filter((entry) => entry.timeout).length) / baseline.length,
    median_duration_ratio: median(candidateDurations) / Math.max(median(baselineDurations), 1), mean_duration_ratio: mean(candidateDurations) / Math.max(mean(baselineDurations), 1),
    activation_rate: activationEligible.length === 0 ? 0 : activationEligible.filter((entry) => entry.activation).length / activationEligible.length,
    activation_eligible_count: activationEligible.length,
    baseline_tokens: baselineSummary.tokens, candidate_tokens: candidateSummary.tokens,
    baseline_turn_count: baselineSummary.turn_count, candidate_turn_count: candidateSummary.turn_count,
    baseline_tool_call_count: baselineSummary.tool_call_count, candidate_tool_call_count: candidateSummary.tool_call_count,
    baseline_duration_ms: baselineSummary.duration_ms, duration_ms: candidateSummary.duration_ms,
    baseline_attempt_count: baselineSummary.attempt_count, candidate_attempt_count: candidateSummary.attempt_count,
    retried_family_count: candidate.filter((entry) => (entry.attempt_count ?? 1) === 2).length,
    attempt_audit_fingerprint: fingerprint(candidate.map((entry) => ({ family_id: entry.family_id, attempts: entry.attempt_fingerprints ?? [entry.result_fingerprint] }))),
    relations_fingerprint: fingerprint(relations.map((entry) => entry.evaluation_fingerprint)) });
  return Object.freeze({ ...report, report_fingerprint: fingerprint(report) });
}

export function evaluateBenchmarkV3Guardrails(design, report) {
  const guard = design.guardrails;
  const failures = [];
  if (report.new_critical_regressions > guard.new_critical_regressions_maximum) failures.push("new-critical-regression");
  if (report.new_unclassified_semantic_regressions > guard.new_unclassified_semantic_regressions_maximum) failures.push("new-unclassified-semantic-regression");
  if (report.new_high_medium_regression_delta > 0
    || (report.family_count >= 90 && report.new_high_medium_upper_ci > guard.new_high_medium_regression_rate_upper_bound_maximum)) failures.push("new-high-medium-safety");
  if (report.small_discordant > 0 && report.small_delta_lower_ci < guard.small_delta_lower_ci_minimum) failures.push("small-delta-lower-ci");
  if (report.timeout_delta > guard.timeout_delta_maximum) failures.push("timeout-delta");
  if (report.median_duration_ratio > guard.median_duration_ratio_maximum) failures.push("median-duration-ratio");
  if (report.mean_duration_ratio > guard.mean_duration_ratio_maximum) failures.push("mean-duration-ratio");
  if (report.activation_rate < guard.activation_minimum) failures.push("activation");
  return Object.freeze({ passed: failures.length === 0, failures: Object.freeze(failures) });
}

export function evaluateBenchmarkV3EfficacyGate(design, report, registeredCandidates = 1) {
  const guardrails = evaluateBenchmarkV3Guardrails(design, report);
  const criteria = Object.freeze({
    paired_delta: report.paired_delta >= design.opportunity_power_gate.minimum_practical_delta,
    exact_p: report.exact_p <= design.opportunity_power_gate.familywise_alpha / registeredCandidates,
    confidence_interval_lower: Array.isArray(report.confidence_interval) && report.confidence_interval[0] > 0,
    guardrails: guardrails.passed,
  });
  return Object.freeze({ passed: Object.values(criteria).every(Boolean), criteria, guardrails });
}

function safeLedgerId(value, prefix) {
  const normalized = String(value).replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 70);
  return `${prefix}-${normalized || fingerprint(value).slice(7, 23)}`;
}
function ledgerMetrics(report) {
  return Object.freeze({ paired_delta: report.paired_delta, new_critical_regressions: report.new_critical_regressions,
    new_unclassified_semantic_regressions: report.new_unclassified_semantic_regressions,
    new_high_medium_upper_ci: report.new_high_medium_upper_ci, small_delta_lower_ci: report.small_delta_lower_ci,
    timeout_delta: report.timeout_delta, median_duration_ratio: report.median_duration_ratio,
    mean_duration_ratio: report.mean_duration_ratio, activation_rate: report.activation_rate,
    candidate_tokens: report.candidate_tokens, duration_ms: report.duration_ms,
    candidate_attempt_count: report.candidate_attempt_count, retried_family_count: report.retried_family_count });
}
function ledgerEvent({ id, type, stage, registration, model, provider, variant, seed, bindingsFingerprint,
  executionId, armOrderScheduleFingerprint, status, scored, retry = null, report = null }) {
  return Object.freeze({ event_id: `event-${id}`, event_type: type, candidate_id: registration.candidate_id,
    attempt_id: `attempt-${id}`, retry_of_attempt_id: retry, stage, source_sha: registration.source_sha,
    model: safeLedgerId(model, "model"), provider: safeLedgerId(provider, "provider"), variant: safeLedgerId(variant, "variant"), seed: safeLedgerId(seed, "seed"),
    bindings_fingerprint: bindingsFingerprint, architecture_fingerprint: registration.architecture_fingerprint,
    product_bundle_fingerprint: registration.product_bundle_fingerprint, execution_id: executionId,
    arm_order_schedule_fingerprint: armOrderScheduleFingerprint, scored_outcome: scored, status,
    result_fingerprint: report === null ? (type === "acceptance-probe" ? registration.product_bundle_fingerprint : null) : report.report_fingerprint,
    metrics: report === null ? null : ledgerMetrics(report) });
}
function createContinuationBudget({ authority, phase, campaignFingerprint, cloneBinding, reservationDisposition }) {
  expect(["reserved", "exact-resume"].includes(reservationDisposition), "BENCHMARK_V3_EXECUTION_CONTINUATION_USED",
    "an incomplete execution has an invalid reservation disposition");
  let mode = null;
  if (reservationDisposition === "exact-resume") {
    reserveBenchmarkV3Continuation({ authority, phase, mode: "resume", campaignFingerprint, cloneBinding });
    mode = "resume";
  }
  return Object.freeze({
    reserveRetry() {
      if (mode !== null) return false;
      try {
        reserveBenchmarkV3Continuation({ authority, phase, mode: "retry", campaignFingerprint, cloneBinding });
      } catch (error) {
        if (error?.code === "BENCHMARK_V3_EXECUTION_CONTINUATION_USED") return false;
        throw error;
      }
      mode = "retry";
      return true;
    },
    currentMode() { return mode; },
  });
}
async function runSplit({ sourceRoot, semanticRuntimeRoot, semanticRuntimeEntries, families, arm, opencodeIdentity, model, provider, variant,
  seed, modelSamplingSeed, timeoutMs, executionId, schedule, holdoutSelectionCommitmentFingerprint, containmentOptions,
  journal, continuationBudget }) {
  const outcomes = [];
  let retriedFamilyCount = 0;
  for (const family of families) {
    const scheduleEntry = schedule.entries.find((entry) => entry.family_id === family.family_id);
    expect(scheduleEntry !== undefined, "BENCHMARK_V3_ARM_ORDER_STALE", "family is absent from the frozen arm order schedule");
    const attemptBinding = fingerprint({ schema_version: 1, execution_id: executionId,
      holdout_selection_commitment_fingerprint: holdoutSelectionCommitmentFingerprint,
      arm_order_schedule_fingerprint: schedule.schedule_fingerprint, schedule_entry_fingerprint: scheduleEntry.entry_fingerprint,
      arm_id: arm.arm_id, family_id: family.family_id });
    const preserved = journal.attemptsFor(arm.arm_id, family.family_id);
    expect(preserved.length <= 2 && preserved.every((entry, index) => entry.attempt_index === index + 1),
      "BENCHMARK_V3_RUNNER_RESUME", "preserved family attempts are not an exact prefix");
    const firstReservation = journal.prepareAttempt(arm.arm_id, family.family_id, 1, attemptBinding);
    const first = firstReservation.outcome ?? await executeAttempt({ sourceRoot, semanticRuntimeRoot, semanticRuntimeEntries,
      family, arm, opencodeIdentity, model, provider, variant, seed, modelSamplingSeed, timeoutMs, executionId,
      schedule, scheduleEntry, holdoutSelectionCommitmentFingerprint, containmentOptions,
      durableCompletion: { path: firstReservation.completion_path, campaign_fingerprint: firstReservation.campaign_fingerprint,
        attempt_index: firstReservation.attempt_index, attempt_binding_fingerprint: attemptBinding } });
    if (firstReservation.outcome === null) journal.recordAttempt({ arm_id: arm.arm_id, family_id: family.family_id, attempt_index: 1, outcome: first });
    if (!first.infrastructure_failure) {
      outcomes.push(Object.freeze({ ...first, attempt_count: 1, attempt_fingerprints: Object.freeze([first.result_fingerprint]) }));
      continue;
    }
    if (!continuationBudget.reserveRetry()) {
      outcomes.push(Object.freeze({ ...first, attempt_count: 1,
        attempt_fingerprints: Object.freeze([first.result_fingerprint]) }));
      return Object.freeze({ outcomes: Object.freeze(outcomes), retried_family_count: retriedFamilyCount,
        infrastructure_failure: true });
    }
    retriedFamilyCount += 1;
    const retryReservation = journal.prepareAttempt(arm.arm_id, family.family_id, 2, attemptBinding);
    const retry = retryReservation.outcome ?? await executeAttempt({ sourceRoot, semanticRuntimeRoot, semanticRuntimeEntries,
      family, arm, opencodeIdentity, model, provider, variant, seed, modelSamplingSeed, timeoutMs, executionId,
      schedule, scheduleEntry, holdoutSelectionCommitmentFingerprint, containmentOptions,
      durableCompletion: { path: retryReservation.completion_path, campaign_fingerprint: retryReservation.campaign_fingerprint,
        attempt_index: retryReservation.attempt_index, attempt_binding_fingerprint: attemptBinding } });
    if (retryReservation.outcome === null) journal.recordAttempt({ arm_id: arm.arm_id, family_id: family.family_id, attempt_index: 2, outcome: retry });
    outcomes.push(Object.freeze({ ...retry, tokens: first.tokens + retry.tokens, duration_ms: first.duration_ms + retry.duration_ms,
      turn_count: first.turn_count + retry.turn_count, tool_call_count: first.tool_call_count + retry.tool_call_count,
      json_event_count: first.json_event_count + retry.json_event_count,
      terminal_event_count: first.terminal_event_count + retry.terminal_event_count,
      unfinished_tool_count: first.unfinished_tool_count + retry.unfinished_tool_count,
      attempt_count: 2, attempt_fingerprints: Object.freeze([first.result_fingerprint, retry.result_fingerprint]) }));
    if (retry.infrastructure_failure) return Object.freeze({ outcomes: Object.freeze(outcomes),
      retried_family_count: retriedFamilyCount, infrastructure_failure: true });
  }
  return Object.freeze({ outcomes: Object.freeze(outcomes), retried_family_count: retriedFamilyCount,
    infrastructure_failure: outcomes.some((entry) => entry.infrastructure_failure) });
}
async function runCandidateStage({ sourceRoot, semanticRuntimeRoot, semanticRuntimeEntries, containmentOptions, ledger, design, stage,
  families, baseline, arm, registration, opencodeIdentity, model, provider, variant, seed, modelSamplingSeed, timeoutMs,
  bindingsFingerprint, executionId, schedule, holdoutSelectionCommitmentFingerprint, journal, continuationBudget }) {
  const baseId = `${stage}-${registration.candidate_id}`;
  const scoredType = `${stage}-execution`;
  const existingInfrastructure = ledger.events.find((entry) => entry.candidate_id === registration.candidate_id && entry.stage === stage
    && entry.event_type === "infrastructure-failure-before-scoring");
  const existingScored = ledger.events.find((entry) => entry.candidate_id === registration.candidate_id && entry.event_type === scoredType);
  const execution = await runSplit({ sourceRoot, semanticRuntimeRoot, semanticRuntimeEntries, containmentOptions, families, arm,
    opencodeIdentity, model, provider, variant, seed, modelSamplingSeed, timeoutMs, executionId, schedule,
    holdoutSelectionCommitmentFingerprint, journal, continuationBudget });
  let retry = existingInfrastructure?.attempt_id ?? null;
  if (execution.infrastructure_failure) {
    if (existingInfrastructure === undefined) {
      ledger = appendBenchmarkV3LedgerEvent(ledger, design, ledgerEvent({ id: `${baseId}-infra`, type: "infrastructure-failure-before-scoring", stage,
        registration, model, provider, variant, seed, bindingsFingerprint, executionId,
        armOrderScheduleFingerprint: schedule.schedule_fingerprint, status: "infrastructure-failure", scored: false }));
      journal.recordLedger(ledger);
    }
    return Object.freeze({ ledger, blocked: true, outcomes: execution.outcomes, report: null });
  }
  if (execution.retried_family_count > 0 && existingInfrastructure === undefined) {
    ledger = appendBenchmarkV3LedgerEvent(ledger, design, ledgerEvent({ id: `${baseId}-infra`, type: "infrastructure-failure-before-scoring", stage,
      registration, model, provider, variant, seed, bindingsFingerprint, executionId,
      armOrderScheduleFingerprint: schedule.schedule_fingerprint, status: "infrastructure-failure", scored: false }));
    journal.recordLedger(ledger);
    retry = `attempt-${baseId}-infra`;
  }
  const report = summarizeBenchmarkV3Stage({ baseline, candidate: execution.outcomes });
  if (existingScored !== undefined) {
    expect(existingScored.result_fingerprint === report.report_fingerprint, "BENCHMARK_V3_RUNNER_RESUME",
      "preserved scored family set no longer reproduces its report");
  } else {
    ledger = appendBenchmarkV3LedgerEvent(ledger, design, ledgerEvent({ id: `${baseId}-scored`, type: scoredType, stage, registration, model, provider, variant, seed,
      bindingsFingerprint, executionId, armOrderScheduleFingerprint: schedule.schedule_fingerprint,
      status: "scored", scored: true, retry, report }));
    journal.recordLedger(ledger);
  }
  return Object.freeze({ ledger, blocked: false, outcomes: execution.outcomes, report });
}

async function runCounterbalancedCandidateStage({ sourceRoot, semanticRuntimeRoot, semanticRuntimeEntries, containmentOptions,
  ledger, design, stage, families, baselineArm, candidateArm, registration, opencodeIdentity, model, provider, variant, seed,
  modelSamplingSeed, timeoutMs, bindingsFingerprint, executionId, schedule, holdoutSelectionCommitmentFingerprint,
  journal, continuationBudget }) {
  expect(["validation", "holdout"].includes(stage) && schedule.split === stage
    && schedule.mode === "balanced-counterbalanced", "BENCHMARK_V3_ARM_ORDER_POLICY",
  "validation and holdout require a balanced counterbalanced schedule");
  const baselineByFamily = new Map();
  const candidateByFamily = new Map();
  let candidateRetriedFamilyCount = 0;
  for (const scheduleEntry of schedule.entries) {
    const family = families.find((entry) => entry.family_id === scheduleEntry.family_id);
    expect(family !== undefined, "BENCHMARK_V3_ARM_ORDER_STALE", "scheduled family is absent from the split");
    for (const armKind of scheduleEntry.arms) {
      const arm = armKind === "baseline" ? baselineArm : candidateArm;
      const execution = await runSplit({ sourceRoot, semanticRuntimeRoot, semanticRuntimeEntries, containmentOptions,
        families: [family], arm, opencodeIdentity, model, provider, variant, seed, modelSamplingSeed, timeoutMs,
        executionId, schedule, holdoutSelectionCommitmentFingerprint, journal, continuationBudget });
      if (armKind === "baseline") baselineByFamily.set(family.family_id, execution.outcomes[0]);
      else { candidateByFamily.set(family.family_id, execution.outcomes[0]); candidateRetriedFamilyCount += execution.retried_family_count; }
      if (execution.infrastructure_failure) {
        const existingInfrastructure = ledger.events.find((entry) => entry.candidate_id === registration.candidate_id
          && entry.stage === stage && entry.event_type === "infrastructure-failure-before-scoring");
        if (existingInfrastructure === undefined) {
          ledger = appendBenchmarkV3LedgerEvent(ledger, design, ledgerEvent({ id: `${stage}-${registration.candidate_id}-infra`,
            type: "infrastructure-failure-before-scoring", stage, registration, model, provider, variant, seed,
            bindingsFingerprint, executionId, armOrderScheduleFingerprint: schedule.schedule_fingerprint,
            status: "infrastructure-failure", scored: false }));
          journal.recordLedger(ledger);
        }
        return Object.freeze({ ledger, blocked: true,
          baseline: Object.freeze([...baselineByFamily.values()]), outcomes: Object.freeze([...candidateByFamily.values()]), report: null });
      }
    }
  }
  const baseline = families.map((family) => baselineByFamily.get(family.family_id));
  const outcomes = families.map((family) => candidateByFamily.get(family.family_id));
  expect(baseline.every(Boolean) && outcomes.every(Boolean), "BENCHMARK_V3_ARM_ORDER_STALE",
    "counterbalanced stage did not execute every scheduled arm exactly once");
  const existingInfrastructure = ledger.events.find((entry) => entry.candidate_id === registration.candidate_id
    && entry.stage === stage && entry.event_type === "infrastructure-failure-before-scoring");
  const existingScored = ledger.events.find((entry) => entry.candidate_id === registration.candidate_id
    && entry.event_type === `${stage}-execution`);
  let retry = existingInfrastructure?.attempt_id ?? null;
  if (candidateRetriedFamilyCount > 0 && existingInfrastructure === undefined) {
    ledger = appendBenchmarkV3LedgerEvent(ledger, design, ledgerEvent({ id: `${stage}-${registration.candidate_id}-infra`,
      type: "infrastructure-failure-before-scoring", stage, registration, model, provider, variant, seed,
      bindingsFingerprint, executionId, armOrderScheduleFingerprint: schedule.schedule_fingerprint,
      status: "infrastructure-failure", scored: false }));
    journal.recordLedger(ledger);
    retry = `attempt-${stage}-${registration.candidate_id}-infra`;
  }
  const report = summarizeBenchmarkV3Stage({ baseline, candidate: outcomes });
  if (existingScored !== undefined) {
    expect(existingScored.result_fingerprint === report.report_fingerprint, "BENCHMARK_V3_RUNNER_RESUME",
      "preserved counterbalanced family set no longer reproduces its report");
  } else {
    ledger = appendBenchmarkV3LedgerEvent(ledger, design, ledgerEvent({ id: `${stage}-${registration.candidate_id}-scored`,
      type: `${stage}-execution`, stage, registration, model, provider, variant, seed, bindingsFingerprint,
      executionId, armOrderScheduleFingerprint: schedule.schedule_fingerprint, status: "scored", scored: true, retry, report }));
    journal.recordLedger(ledger);
  }
  return Object.freeze({ ledger, blocked: false, baseline: Object.freeze(baseline), outcomes: Object.freeze(outcomes), report });
}

function attemptAudit(outcomes) {
  return Object.freeze(outcomes.map((entry) => Object.freeze({ family_id: entry.family_id, attempt_count: entry.attempt_count ?? 1,
    attempt_fingerprints: entry.attempt_fingerprints ?? Object.freeze([entry.result_fingerprint]), tokens: entry.tokens,
    duration_ms: entry.duration_ms, turn_count: entry.turn_count ?? 0, tool_call_count: entry.tool_call_count ?? 0,
    json_event_count: entry.json_event_count ?? 0, terminal_event_count: entry.terminal_event_count ?? 0,
    unfinished_tool_count: entry.unfinished_tool_count ?? 0, passed: entry.passed, stratum: entry.stratum,
    infrastructure_failure: entry.infrastructure_failure, process_status: entry.process_status,
    containment_fingerprint: entry.containment_fingerprint ?? null })));
}
function finalizeStudy(outputDirectory, ledger, value, journal = null, {
  ledgerName = "ledger.json", reportName = "report.json",
} = {}) {
  const finalBody = Object.freeze({ ...value, ledger, ledger_fingerprint: ledger.ledger_fingerprint });
  const final = Object.freeze({ ...finalBody, study_fingerprint: fingerprint(finalBody) });
  if (outputDirectory !== undefined) {
    const output = path.resolve(outputDirectory);
    for (const [name, artifact] of [[ledgerName, ledger], [reportName, final]]) {
      const target = path.join(output, name);
      if (fs.existsSync(target)) {
        let existing;
        try { existing = JSON.parse(fs.readFileSync(target, "utf8")); } catch { existing = null; }
        expect(canonicalJson(existing) === canonicalJson(artifact), "BENCHMARK_V3_RUNNER_ARTIFACT",
          `${name} exists with different contents`);
        continue;
      }
      const temporary = `${target}.tmp-${process.pid}`;
      fs.writeFileSync(temporary, `${JSON.stringify(artifact, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      fs.renameSync(temporary, target);
    }
  }
  journal?.markComplete(final);
  return final;
}

function campaignRegistryPath(sourceRoot) {
  const result = run("git", ["rev-parse", "--git-common-dir"], { cwd: sourceRoot });
  expect(passed(result), "BENCHMARK_V3_RUNNER_REGISTRY", "campaign registry Git path is unavailable");
  const commonDirectory = fs.realpathSync.native(path.resolve(sourceRoot, result.stdout.trim()));
  return path.join(commonDirectory, "opencode-harness", "benchmark-v3", "campaign-registry.json");
}
function sealRegistry(entries) {
  const body = { schema_version: 1, entries };
  return { ...body, registry_fingerprint: fingerprint(body) };
}
function readRegistry(target) {
  if (!fs.existsSync(target)) return sealRegistry([]);
  const value = JSON.parse(fs.readFileSync(target, "utf8"));
  expect(value?.schema_version === 1 && Array.isArray(value.entries)
    && value.registry_fingerprint === fingerprint({ schema_version: value.schema_version, entries: value.entries }),
  "BENCHMARK_V3_RUNNER_REGISTRY", "campaign registry is invalid");
  return value;
}
function extendsDevelopmentLedger(development, current) {
  if (!development || !current || !Array.isArray(development.events) || !Array.isArray(current.events)
    || current.events.length < development.events.length) return false;
  const invariantKeys = ["schema_version", "design_fingerprint", "campaign_fingerprint", "registrations",
    "campaign_execution_id", "holdout_execution_id", "holdout_selection_commitment_fingerprint",
    "arm_order_policy_fingerprint", "public_arm_order_schedule_fingerprints",
    "selected_candidate_id", "final_candidate_sha"];
  return invariantKeys.every((key) => canonicalJson(current[key]) === canonicalJson(development[key]))
    && canonicalJson(current.events.slice(0, development.events.length)) === canonicalJson(development.events);
}
function updateRegistry(target, mutate) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const lock = `${target}.lock`;
  const lease = acquireLease(lock, "BENCHMARK_V3_RUNNER_REGISTRY", "campaign registry is locked by another live process");
  try {
    const next = sealRegistry(mutate(readRegistry(target).entries));
    durableJson(target, next);
    return next;
  } finally { lease.release(); }
}

export function createBenchmarkV3CampaignJournal(outputDirectory, { sourceRoot, campaignFingerprint, initialLedger,
  phase = "development" }) {
  let attempts = [];
  let ledger = initialLedger;
  let output = null;
  let registryTarget = null;
  let campaignLease = null;
  let completedReport = null;
  if (outputDirectory !== undefined) {
    output = path.resolve(outputDirectory);
    expect(FP.test(campaignFingerprint) && typeof sourceRoot === "string" && ["development", "holdout"].includes(phase),
      "BENCHMARK_V3_RUNNER_REGISTRY", "campaign binding or phase is invalid");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    registryTarget = campaignRegistryPath(sourceRoot);
    fs.mkdirSync(path.dirname(registryTarget), { recursive: true, mode: 0o700 });
    const campaignLeaseTarget = path.join(path.dirname(registryTarget), `campaign-${campaignFingerprint.slice(7)}.lease`);
    campaignLease = acquireLease(campaignLeaseTarget, "BENCHMARK_V3_RUNNER_REGISTRY",
      "the same campaign is already active in another live process");
    try {
      const registry = updateRegistry(registryTarget, (entries) => {
        const existing = entries.find((entry) => entry.campaign_fingerprint === campaignFingerprint);
        if (existing !== undefined) {
          expect(existing.output_directory === output, "BENCHMARK_V3_RUNNER_REGISTRY",
            "campaign bindings are already registered to a different output directory");
          if (phase === "holdout") {
            expect(["complete", "holdout-in-progress", "holdout-complete"].includes(existing.status)
              && FP.test(existing.development_report_fingerprint ?? ""), "BENCHMARK_V3_RUNNER_RESUME",
              "holdout can resume only after the development/validation campaign completed");
            let registeredDevelopmentReport = null;
            try { registeredDevelopmentReport = JSON.parse(fs.readFileSync(path.join(output, "report.json"), "utf8")); } catch {}
            expect(existing.development_report_fingerprint === fingerprint(registeredDevelopmentReport),
              "BENCHMARK_V3_RUNNER_RESUME", "development report differs from the exact registered report");
            return entries.map((entry) => entry === existing
              ? { ...entry, status: existing.status === "holdout-complete" ? "holdout-complete" : "holdout-in-progress" }
              : entry);
          }
          expect(["in-progress", "complete"].includes(existing.status) && existing.holdout_report_fingerprint === undefined,
            "BENCHMARK_V3_RUNNER_RESUME", "development phase cannot resume after holdout started");
          return entries;
        }
        expect(phase === "development", "BENCHMARK_V3_RUNNER_RESUME", "holdout cannot create a new campaign registry entry");
        expect(!fs.existsSync(output), "BENCHMARK_V3_RUNNER_ARTIFACT", "unregistered campaign output directory already exists");
        return [...entries, { campaign_fingerprint: campaignFingerprint, output_directory: output, status: "in-progress" }];
      });
      const registered = registry.entries.find((entry) => entry.campaign_fingerprint === campaignFingerprint);
      if (!fs.existsSync(output)) fs.mkdirSync(output, { mode: 0o700 });
      const checkpoint = path.join(output, "checkpoint.json");
      if (fs.existsSync(checkpoint)) {
        const value = JSON.parse(fs.readFileSync(checkpoint, "utf8"));
        const body = { schema_version: value.schema_version, campaign_fingerprint: value.campaign_fingerprint,
          attempts: value.attempts, ledger: value.ledger };
        expect(value.schema_version === 4 && value.campaign_fingerprint === campaignFingerprint
          && Array.isArray(value.attempts) && value.checkpoint_fingerprint === fingerprint(body),
        "BENCHMARK_V3_RUNNER_RESUME", "campaign checkpoint is invalid or rebound");
        attempts = value.attempts;
        ledger = value.ledger;
      } else expect(registered.status === "in-progress" && !fs.existsSync(path.join(output, "report.json")),
        "BENCHMARK_V3_RUNNER_RESUME", "registered campaign has no resumable checkpoint");
      if (phase === "holdout") {
        const developmentReport = JSON.parse(fs.readFileSync(path.join(output, "report.json"), "utf8"));
        const { study_fingerprint: declaredDevelopmentFingerprint, ...developmentBody } = developmentReport;
        expect(registered.development_report_fingerprint === fingerprint(developmentReport),
          "BENCHMARK_V3_RUNNER_RESUME", "development report differs from the exact registered report");
        expect(developmentReport.status === "sealed-holdout-required"
          && declaredDevelopmentFingerprint === fingerprint(developmentBody)
          && developmentReport.ledger_fingerprint === developmentReport.ledger?.ledger_fingerprint
          && extendsDevelopmentLedger(developmentReport.ledger, ledger)
          && attempts.every((entry) => entry.state === "completed"),
        "BENCHMARK_V3_RUNNER_RESUME", "holdout did not resume the exact completed development/validation campaign");
      }
      const reportPath = path.join(output, phase === "development" ? "report.json" : "holdout-report.json");
      if (fs.existsSync(reportPath)) {
        const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
        const registeredReportFingerprint = phase === "development" ? registered.development_report_fingerprint
          : registered.holdout_report_fingerprint;
        expect(report.ledger_fingerprint === report.ledger?.ledger_fingerprint && report.ledger_fingerprint === ledger?.ledger_fingerprint,
          "BENCHMARK_V3_RUNNER_RESUME", "completed report does not match the checkpoint ledger");
        const { study_fingerprint: declaredStudyFingerprint, ...reportBody } = report;
        expect(declaredStudyFingerprint === fingerprint(reportBody) && registeredReportFingerprint === fingerprint(report),
          "BENCHMARK_V3_RUNNER_RESUME", "completed report fingerprint is stale or differs from the registered report");
        completedReport = Object.freeze(report);
      }
    } catch (error) { campaignLease.release(); campaignLease = null; throw error; }
  }
  const write = () => {
    if (output === null) return;
    const target = path.join(output, "checkpoint.json");
    const checkpointBody = { schema_version: 4, campaign_fingerprint: campaignFingerprint, attempts, ledger };
    const body = { ...checkpointBody, checkpoint_fingerprint: fingerprint(checkpointBody) };
    durableJson(target, body);
  };
  const completionPath = (armId, familyId, attemptIndex) => output === null ? null
    : path.join(output, "attempt-completions", `${fingerprint({ armId, familyId, attemptIndex }).slice(7)}.json`);
  return Object.freeze({
    get ledger() { return ledger; },
    get completed_report() { return completedReport; },
    attemptsFor(armId, familyId) { return attempts.filter((entry) => entry.arm_id === armId && entry.family_id === familyId && entry.state === "completed")
      .sort((left, right) => left.attempt_index - right.attempt_index); },
    prepareAttempt(armId, familyId, attemptIndex, attemptBindingFingerprint) {
      expect(FP.test(attemptBindingFingerprint), "BENCHMARK_V3_RUNNER_RESUME", "attempt binding fingerprint is invalid");
      let existing = attempts.find((entry) => entry.arm_id === armId && entry.family_id === familyId
        && entry.attempt_index === attemptIndex);
      const target = completionPath(armId, familyId, attemptIndex);
      if (existing !== undefined) expect(existing.attempt_binding_fingerprint === attemptBindingFingerprint,
        "BENCHMARK_V3_RUNNER_RESUME", "preserved attempt changed its execution or temporal-order binding");
      if (existing?.state === "completed") return Object.freeze({ outcome: existing.outcome, completion_path: target,
        campaign_fingerprint: campaignFingerprint, attempt_index: attemptIndex });
      if (existing?.state === "started") {
        let completion = null; try { completion = JSON.parse(fs.readFileSync(target, "utf8")); } catch {}
        expect(completion?.schema_version === 1 && completion.campaign_fingerprint === campaignFingerprint
          && completion.arm_id === armId && completion.family_id === familyId && completion.attempt_index === attemptIndex
          && completion.attempt_binding_fingerprint === attemptBindingFingerprint
          && completion.outcome_fingerprint === fingerprint(completion.outcome),
        "BENCHMARK_V3_RUNNER_RESUME", "an interrupted model attempt has no authentic durable completion; refusing to repeat it");
        existing = Object.freeze({ ...existing, state: "completed", outcome: Object.freeze(completion.outcome) });
        attempts = attempts.map((entry) => entry === attempts.find((candidate) => candidate.arm_id === armId
          && candidate.family_id === familyId && candidate.attempt_index === attemptIndex) ? existing : entry);
        write();
        return Object.freeze({ outcome: existing.outcome, completion_path: target,
          campaign_fingerprint: campaignFingerprint, attempt_index: attemptIndex });
      }
      expect(existing === undefined, "BENCHMARK_V3_RUNNER_RESUME", "attempt reservation state is invalid");
      attempts.push(Object.freeze({ arm_id: armId, family_id: familyId, attempt_index: attemptIndex,
        attempt_binding_fingerprint: attemptBindingFingerprint,
        state: "started", completion_file: target === null ? null : path.relative(output, target) }));
      write();
      return Object.freeze({ outcome: null, completion_path: target,
        campaign_fingerprint: campaignFingerprint, attempt_index: attemptIndex });
    },
    recordAttempt(value) {
      const index = attempts.findIndex((entry) => entry.arm_id === value.arm_id && entry.family_id === value.family_id
        && entry.attempt_index === value.attempt_index && entry.state === "started");
      expect(index !== -1, "BENCHMARK_V3_RUNNER_RESUME", "attempt was not durably reserved before execution");
      if (output !== null) {
        const target = completionPath(value.arm_id, value.family_id, value.attempt_index);
        const completion = JSON.parse(fs.readFileSync(target, "utf8"));
        expect(completion.schema_version === 1 && completion.campaign_fingerprint === campaignFingerprint
          && completion.arm_id === value.arm_id && completion.family_id === value.family_id
          && completion.attempt_index === value.attempt_index
          && completion.attempt_binding_fingerprint === attempts[index].attempt_binding_fingerprint
          && completion.outcome_fingerprint === fingerprint(value.outcome)
          && canonicalJson(completion.outcome) === canonicalJson(value.outcome),
        "BENCHMARK_V3_RUNNER_RESUME", "attempt completion differs from its durable receipt");
      }
      attempts[index] = Object.freeze({ ...attempts[index], state: "completed", outcome: Object.freeze(value.outcome) }); write();
    },
    recordLedger(value) { ledger = value; write(); },
    markComplete(report) {
      if (registryTarget === null) return;
      expect(attempts.every((entry) => entry.state === "completed"), "BENCHMARK_V3_RUNNER_RESUME",
        "campaign cannot complete while an attempt lacks authentic durable completion evidence");
      updateRegistry(registryTarget, (entries) => entries.map((entry) => entry.campaign_fingerprint === campaignFingerprint
        ? phase === "development"
          ? { ...entry, status: "complete", development_report_fingerprint: fingerprint(report) }
          : { ...entry, status: "holdout-complete", holdout_report_fingerprint: fingerprint(report) }
        : entry));
      campaignLease?.release(); campaignLease = null;
    },
    close() { campaignLease?.release(); campaignLease = null; },
  });
}

export async function runBenchmarkV3Study({ gate, semanticRuntimeRoot, outputDirectory, containmentOptions = {}, model, provider, variant,
  corpusGenerationSeed = null, modelSamplingSeed = null, timeoutMs = 900_000 }) {
  expect(AUTHORIZED_GATES.has(gate), "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", "study execution requires a same-process passed model-free gate");
  assertBenchmarkV3CapabilityAuthorization(gate.capability_authorization);
  const { value: design, validation: currentDesign } = loadBenchmarkV3Design(gate.reviewed_source_root);
  const corpus = loadBenchmarkV3Corpus(gate.reviewed_source_root);
  expect(currentDesign.design_fingerprint === gate.design_fingerprint && corpus.corpus_fingerprint === gate.corpus_fingerprint,
    "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", "reviewed design or corpus bytes changed after the gate");
  const semanticRuntime = fingerprintBenchmarkV3SemanticRuntime(semanticRuntimeRoot, corpus.families.map((entry) => entry.control_surface.runtime_key));
  expect(semanticRuntime.runtime_fingerprint === gate.semantic_runtime_fingerprint,
    "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", "semantic runtime changed after the gate");
  const opencodeIdentity = Object.freeze({ ...verifyBenchmarkV3OpenCodeExecutable(gate.opencode_executable.path),
    filesystem_isolation: gate.filesystem_isolation });
  EXECUTION_AUTHORIZATIONS.set(opencodeIdentity, gate.capability_authorization);
  expect(Array.isArray(gate.semantic_oracle_expectations)
    && fingerprint(gate.semantic_oracle_expectations) === gate.semantic_oracle_expectations_fingerprint,
  "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", "semantic oracle expectations changed after the gate");
  ORACLE_EXPECTATIONS.set(opencodeIdentity,
    new Map(gate.semantic_oracle_expectations.map((entry) => [entry.family_id, entry.test_count])));
  expect(opencodeIdentity.executable_fingerprint === gate.opencode_executable_fingerprint,
    "BENCHMARK_V3_RUNNER_MODEL_FREE_GATE", "OpenCode changed after the gate");
  const studySeeds = resolveBenchmarkV3StudySeeds(corpus, {
    corpusGenerationSeed,
    modelSamplingSeed,
    modelSamplingSeedSupported: opencodeIdentity.seed_supported,
  });
  const seed = studySeeds.corpus_generation_seed;
  const development = corpus.families.filter((entry) => entry.split === "development");
  const validationFamilies = corpus.families.filter((entry) => entry.split === "validation");
  const armOrderPolicyFingerprint = validateBenchmarkV3ArmOrderPolicy(design.arm_order_schedule).policy_fingerprint;
  const developmentSchedule = buildBenchmarkV3ArmOrderSchedule({ policy: design.arm_order_schedule, split: "development",
    families: development.map((entry) => ({ family_id: entry.family_id, stratum: entry.stratum })) });
  const validationSchedule = buildBenchmarkV3ArmOrderSchedule({ policy: design.arm_order_schedule, split: "validation",
    families: validationFamilies.map((entry) => ({ family_id: entry.family_id, stratum: entry.stratum })) });
  const registrations = gate.candidates.map((binding, index) => Object.freeze({ candidate_id: `candidate-${index + 1}`,
    architecture_fingerprint: binding.architecture_fingerprint, product_bundle_fingerprint: binding.product_bundle_fingerprint,
    source_sha: binding.source_sha, registered_before_baseline: true, development_execution_count: 0 }));
  const modelBinding = buildBenchmarkV3ModelBinding({ executableFingerprint: gate.opencode_executable_fingerprint,
    opencodeVersion: opencodeIdentity.version, provider, model, variant, variantSupported: opencodeIdentity.variant_supported,
    modelSamplingSeedSupported: opencodeIdentity.seed_supported, corpusGenerationSeed: seed,
    modelSamplingSeed: studySeeds.model_sampling_seed,
    candidateBundleFingerprints: registrations.map((entry) => entry.product_bundle_fingerprint),
    evaluatorFingerprint: fingerprint(evaluatePairedDefects.toString()), corpusFingerprint: gate.corpus_fingerprint,
    designFingerprint: gate.design_fingerprint, semanticRuntimeFingerprint: gate.semantic_runtime_fingerprint,
    armOrderPolicyFingerprint, publicArmOrderScheduleFingerprints: {
      development: developmentSchedule.schedule_fingerprint, validation: validationSchedule.schedule_fingerprint,
    } });
  const bindingsFingerprint = fingerprint(modelBinding);
  const campaignFingerprint = buildBenchmarkV3CampaignFingerprint({ sourceSha: gate.source_sha,
    sourceTreeFingerprint: gate.source_tree_fingerprint, bindingsFingerprint,
    reviewFingerprints: gate.review_fingerprints });
  const cloneBinding = benchmarkV3ExecutionCloneBinding(gate.reviewed_source_root, path.resolve(outputDirectory));
  const executionReservation = reserveBenchmarkV3Execution({ authority: gate.execution_authority, phase: "campaign",
    campaignFingerprint, cloneBinding });
  const initialLedger = createBenchmarkV3Ledger({ design, designFingerprint: gate.design_fingerprint, campaignFingerprint,
    campaignExecutionId: gate.execution_authority.receipt.campaign_execution_id,
    holdoutExecutionId: gate.execution_authority.receipt.holdout_execution_id,
    holdoutSelectionCommitmentFingerprint: gate.holdout_selection_commitment.commitment_fingerprint,
    armOrderPolicyFingerprint, publicArmOrderScheduleFingerprints: {
      development: developmentSchedule.schedule_fingerprint, validation: validationSchedule.schedule_fingerprint,
    }, registrations });
  const journal = createBenchmarkV3CampaignJournal(outputDirectory, { sourceRoot: gate.reviewed_source_root, campaignFingerprint, initialLedger });
  if (journal.completed_report !== null) {
    journal.markComplete(journal.completed_report);
    consumeBenchmarkV3Execution({ authority: gate.execution_authority, phase: "campaign", campaignFingerprint, cloneBinding });
    return journal.completed_report;
  }
  const continuationBudget = createContinuationBudget({ authority: gate.execution_authority, phase: "campaign",
    campaignFingerprint, cloneBinding, reservationDisposition: executionReservation.disposition });
  let ledger = journal.ledger;
  if (ledger === null) { ledger = initialLedger; journal.recordLedger(ledger); }
  for (const [index, registration] of registrations.entries()) {
    if (ledger.events.some((entry) => entry.event_type === "acceptance-probe" && entry.candidate_id === registration.candidate_id)) continue;
    ledger = appendBenchmarkV3LedgerEvent(ledger, design, ledgerEvent({ id: `accept-${registration.candidate_id}`,
      type: "acceptance-probe", stage: "acceptance", registration, model, provider, variant, seed, bindingsFingerprint,
      executionId: gate.execution_authority.receipt.campaign_execution_id,
      armOrderScheduleFingerprint: armOrderPolicyFingerprint, status: "accepted", scored: false, report: null }));
    journal.recordLedger(ledger);
  }
  const campaignBinding = Object.freeze({ schema_version: 2, source_sha: gate.source_sha,
    source_tree_fingerprint: gate.source_tree_fingerprint, gate_fingerprint: gate.gate_fingerprint,
    review_fingerprints: gate.review_fingerprints, model_binding: modelBinding,
    semantic_runtime_entries: gate.semantic_runtime_entries,
    execution_authority_fingerprint: gate.execution_authority.authority_fingerprint,
    campaign_execution_id: gate.execution_authority.receipt.campaign_execution_id,
    holdout_execution_id: gate.execution_authority.receipt.holdout_execution_id,
    execution_clone_binding_fingerprint: cloneBinding.clone_binding_fingerprint,
    execution_reservation_disposition: executionReservation.disposition,
    holdout_selection_commitment_fingerprint: gate.holdout_selection_commitment.commitment_fingerprint,
    arm_order_schedules: Object.freeze({ development: developmentSchedule, validation: validationSchedule }),
    bindings_fingerprint: bindingsFingerprint, campaign_fingerprint: campaignFingerprint });
  const finish = (value) => {
    const result = finalizeStudy(outputDirectory, ledger, { ...value, campaign_binding: campaignBinding }, journal);
    consumeBenchmarkV3Execution({ authority: gate.execution_authority, phase: "campaign", campaignFingerprint, cloneBinding });
    return result;
  };
  const baselineFingerprint = fingerprint({ schema_version: 1, files: [] });
  const baselineArm = Object.freeze({ kind: "baseline", arm_id: "plain-baseline", source_sha: gate.source_sha,
    source_tree_fingerprint: gate.source_tree_fingerprint, product_bundle_fingerprint: baselineFingerprint, agent_id: "build" });
  const developmentBaselineRun = await runSplit({ sourceRoot: gate.reviewed_source_root, semanticRuntimeRoot, semanticRuntimeEntries: gate.semantic_runtime_entries, families: development,
    arm: baselineArm, opencodeIdentity, model, provider, variant, seed, modelSamplingSeed: studySeeds.model_sampling_seed,
    timeoutMs, executionId: gate.execution_authority.receipt.campaign_execution_id, schedule: developmentSchedule,
    holdoutSelectionCommitmentFingerprint: gate.holdout_selection_commitment.commitment_fingerprint,
    containmentOptions, journal, continuationBudget });
  const baseline = developmentBaselineRun.outcomes;
  if (developmentBaselineRun.infrastructure_failure) return finish(
    { status: "infrastructure-blocked", final_status: "STUDY BLOCKED — INFRASTRUCTURE", baseline_attempt_count: baseline.reduce((sum, entry) => sum + entry.attempt_count, 0), candidate_attempt_count: 0, candidate_tokens: 0, development_baseline_attempts: attemptAudit(baseline) });
  const failures = Object.fromEntries(["small", "medium", "high"].map((stratum) => [stratum, baseline.filter((entry) => entry.stratum === stratum && !entry.passed).length]));
  const opportunity = assessBenchmarkV3BaselineOpportunity(design, failures, registrations.length);
  if (!opportunity.eligible) return finish(
    { status: "design-uninformative",
      final_status: "STUDY STOPPED BEFORE CANDIDATE — INSUFFICIENT BASELINE OPPORTUNITY",
      baseline_attempt_count: baseline.reduce((sum, entry) => sum + entry.attempt_count, 0), candidate_attempt_count: 0, candidate_tokens: 0,
      opportunity_power_gate: opportunity, baseline_fingerprint: fingerprint(baseline), development_baseline_attempts: attemptAudit(baseline) });
  const developmentReports = [];
  for (const [index, binding] of gate.candidates.entries()) {
    const arm = Object.freeze({ kind: "candidate", arm_id: `candidate-${index + 1}`, ...binding,
      source_tree_fingerprint: gate.source_tree_fingerprint, agent_id: "core" });
    const runResult = await runCandidateStage({ sourceRoot: gate.reviewed_source_root, semanticRuntimeRoot, semanticRuntimeEntries: gate.semantic_runtime_entries, containmentOptions, ledger, design, stage: "development", families: development, baseline, arm, registration: registrations[index],
      opencodeIdentity, model, provider, variant, seed, modelSamplingSeed: studySeeds.model_sampling_seed,
      timeoutMs, bindingsFingerprint, executionId: gate.execution_authority.receipt.campaign_execution_id,
      schedule: developmentSchedule, holdoutSelectionCommitmentFingerprint: gate.holdout_selection_commitment.commitment_fingerprint,
      journal, continuationBudget });
    ledger = runResult.ledger;
    if (runResult.blocked) return finish(
      { status: "infrastructure-blocked", final_status: "STUDY BLOCKED — INFRASTRUCTURE", stage: "development",
        development_baseline_attempts: attemptAudit(baseline), candidate_attempts: attemptAudit(runResult.outcomes) });
    developmentReports.push(Object.freeze({ arm, outcomes: runResult.outcomes, report: runResult.report }));
  }
  if (ledger.selected_candidate_id === null) { ledger = selectBenchmarkV3Candidate(ledger, design); journal.recordLedger(ledger); }
  const selectedIndex = registrations.findIndex((entry) => entry.candidate_id === ledger.selected_candidate_id);
  const selected = developmentReports[selectedIndex];
  const validationRun = await runCounterbalancedCandidateStage({ sourceRoot: gate.reviewed_source_root,
    semanticRuntimeRoot, semanticRuntimeEntries: gate.semantic_runtime_entries, containmentOptions, ledger, design,
    stage: "validation", families: validationFamilies, baselineArm, candidateArm: selected.arm,
    registration: registrations[selectedIndex], opencodeIdentity, model, provider, variant, seed,
    modelSamplingSeed: studySeeds.model_sampling_seed, timeoutMs, bindingsFingerprint,
    executionId: gate.execution_authority.receipt.campaign_execution_id, schedule: validationSchedule,
    holdoutSelectionCommitmentFingerprint: gate.holdout_selection_commitment.commitment_fingerprint,
    journal, continuationBudget });
  ledger = validationRun.ledger;
  if (validationRun.blocked) return finish(
    { status: "infrastructure-blocked", final_status: "STUDY BLOCKED — INFRASTRUCTURE", stage: "validation",
      validation_baseline_attempts: attemptAudit(validationRun.baseline), candidate_attempts: attemptAudit(validationRun.outcomes) });
  const validationReport = validationRun.report;
  const validationEfficacy = evaluateBenchmarkV3EfficacyGate(design, validationReport, registrations.length);
  if (!validationEfficacy.passed) return finish(
    { status: "validation-efficacy-failed", final_status: "BOUNDED STUDY COMPLETE — NO PROMOTABLE HARNESS",
      selected_candidate_sha: selected.arm.source_sha,
      validation_report: validationReport, validation_efficacy: validationEfficacy, validation_baseline_attempts: attemptAudit(validationRun.baseline),
      validation_candidate_attempts: attemptAudit(validationRun.outcomes) });
  if (ledger.final_candidate_sha === null) { ledger = freezeBenchmarkV3FinalCandidate(ledger, design); journal.recordLedger(ledger); }
  return finish({ status: "sealed-holdout-required", final_status: "STUDY BLOCKED — EXTERNAL SEALED HOLDOUT REQUIRED",
    selected_candidate_sha: selected.arm.source_sha, development_reports: Object.freeze(developmentReports.map((entry) => entry.report)), validation_report: validationReport,
    public_corpus: "development-validation-only", confirmatory_claim_allowed: false,
    sealed_holdout_storage: "outside-public-git", sealed_holdout_creation: "precommitted-before-baseline-revealed-after-candidate-freeze",
    product_bundle_fingerprint: selected.arm.product_bundle_fingerprint, validation_efficacy: validationEfficacy,
    final_candidate_frozen_at_ms: Date.now(),
    final_candidate_sha: ledger.final_candidate_sha, development_baseline_attempts: attemptAudit(baseline),
    development_candidate_attempts: Object.freeze(developmentReports.map((entry) => attemptAudit(entry.outcomes))),
    validation_baseline_attempts: attemptAudit(validationRun.baseline), validation_candidate_attempts: attemptAudit(validationRun.outcomes) });
}

export async function runBenchmarkV3Holdout({ sourceRoot, semanticRuntimeRoot, outputDirectory, externalManifestPath,
  executionAuthorityPath, holdoutCommitmentPath, opencodeExecutable, candidateSourceRoot, candidateBundle,
  readinessReceiptPaths, readinessTrustedIssuers, executionAuthorityTrustedIssuers,
  holdoutTrustedIssuers, containmentOptions = {}, timeoutMs = 900_000 }) {
  const source = fs.realpathSync.native(path.resolve(sourceRoot));
  const output = path.resolve(outputDirectory);
  assertClean(source);
  const developmentReport = JSON.parse(fs.readFileSync(path.join(output, "report.json"), "utf8"));
  const { study_fingerprint: declaredDevelopmentFingerprint, ...developmentBody } = developmentReport;
  expect(declaredDevelopmentFingerprint === fingerprint(developmentBody)
    && developmentReport.status === "sealed-holdout-required"
    && developmentReport.validation_efficacy?.passed === true
    && developmentReport.confirmatory_claim_allowed === false,
  "BENCHMARK_V3_HOLDOUT_RESUME", "holdout requires the exact passed development/validation report");
  const { value: design, validation: designValidation } = loadBenchmarkV3Design(source);
  const publicCorpus = loadBenchmarkV3Corpus(source);
  const expectedPublicArmOrderSchedules = Object.fromEntries(["development", "validation"].map((split) => [split,
    buildBenchmarkV3ArmOrderSchedule({ policy: design.arm_order_schedule, split,
      families: publicCorpus.families.filter((entry) => entry.split === split)
        .map((entry) => ({ family_id: entry.family_id, stratum: entry.stratum })) })]));
  const sourceTreeFingerprint = buildProfileBundleManifest(source, "lab").manifest.source_tree_fingerprint;
  const executionAuthority = loadSignedBenchmarkV3ExecutionAuthority({ sourceRoot: source, receiptPath: executionAuthorityPath,
    sourceSha: gitSha(source), sourceTreeFingerprint, designFingerprint: designValidation.design_fingerprint,
    corpusFingerprint: publicCorpus.corpus_fingerprint, outputDirectory: output,
    ...(executionAuthorityTrustedIssuers === undefined ? {} : { trustedIssuers: executionAuthorityTrustedIssuers }) });
  const holdoutCommitment = loadSignedBenchmarkV3HoldoutCommitment({ sourceRoot: source, commitmentPath: holdoutCommitmentPath,
    campaignExecutionId: executionAuthority.receipt.campaign_execution_id,
    holdoutExecutionId: executionAuthority.receipt.holdout_execution_id,
    sourceSha: gitSha(source), sourceTreeFingerprint, designFingerprint: designValidation.design_fingerprint,
    corpusFingerprint: publicCorpus.corpus_fingerprint,
    ...(holdoutTrustedIssuers === undefined ? {} : { trustedIssuers: holdoutTrustedIssuers }) });
  const binding = developmentReport.campaign_binding;
  expect(binding?.campaign_fingerprint === developmentReport.ledger.campaign_fingerprint
    && binding.source_sha === gitSha(source) && binding.source_tree_fingerprint === sourceTreeFingerprint
    && binding.model_binding !== null && binding.bindings_fingerprint === fingerprint(binding.model_binding)
    && binding.execution_authority_fingerprint === executionAuthority.authority_fingerprint
    && binding.campaign_execution_id === executionAuthority.receipt.campaign_execution_id
    && binding.holdout_execution_id === executionAuthority.receipt.holdout_execution_id
    && binding.holdout_selection_commitment_fingerprint === holdoutCommitment.commitment_fingerprint
    && canonicalJson(binding.arm_order_schedules) === canonicalJson(expectedPublicArmOrderSchedules),
  "BENCHMARK_V3_HOLDOUT_RESUME", "current source or model binding differs from the exact campaign");
  validateBenchmarkV3Ledger(developmentReport.ledger, design, {
    development: expectedPublicArmOrderSchedules.development.schedule_fingerprint,
    validation: expectedPublicArmOrderSchedules.validation.schedule_fingerprint,
    holdout: null,
  });
  const selectedId = developmentReport.ledger.selected_candidate_id;
  const registration = developmentReport.ledger.registrations.find((entry) => entry.candidate_id === selectedId);
  expect(registration !== undefined && registration.source_sha === developmentReport.ledger.final_candidate_sha,
    "BENCHMARK_V3_HOLDOUT_FREEZE", "final candidate is not frozen in the resumed ledger");
  const candidate = verifyBenchmarkV3ProductBundle(candidateSourceRoot, candidateBundle);
  expect(candidate.source_root === source && candidate.source_sha === registration.source_sha
    && candidate.product_bundle_fingerprint === registration.product_bundle_fingerprint
    && candidate.product_bundle_fingerprint === developmentReport.product_bundle_fingerprint,
  "BENCHMARK_V3_HOLDOUT_FREEZE", "holdout candidate differs from the frozen development/validation product");
  const opencode = verifyBenchmarkV3OpenCodeExecutable(opencodeExecutable);
  expect(opencode.executable_fingerprint === binding.model_binding.executable_fingerprint,
    "BENCHMARK_V3_HOLDOUT_BINDING", "OpenCode executable differs from the resumed campaign");
  const capabilityAuthorization = authorizeBenchmarkV3Capabilities(readinessReceiptPaths, {
    sourceRoot: source, scope: "holdout",
    ...(readinessTrustedIssuers === undefined ? {} : { trustedIssuers: readinessTrustedIssuers }),
  });
  const filesystemIsolation = verifyBenchmarkV3FilesystemIsolation(source, opencode, capabilityAuthorization);
  const opencodeIdentity = Object.freeze({ ...opencode, filesystem_isolation: filesystemIsolation });
  EXECUTION_AUTHORIZATIONS.set(opencodeIdentity, capabilityAuthorization);
  const external = loadSignedExternalBenchmarkV3Holdout({ sourceRoot: source, manifestPath: externalManifestPath,
    campaignFingerprint: binding.campaign_fingerprint, designFingerprint: designValidation.design_fingerprint,
    finalCandidateSha: registration.source_sha, productBundleFingerprint: registration.product_bundle_fingerprint,
    candidateFrozenAtMs: developmentReport.final_candidate_frozen_at_ms,
    campaignExecutionId: executionAuthority.receipt.campaign_execution_id,
    holdoutExecutionId: executionAuthority.receipt.holdout_execution_id,
    holdoutCommitment, armOrderPolicy: design.arm_order_schedule,
    publicSourceCommits: publicCorpus.split_assignment.entries.map((entry) => entry.source_commit),
    publicSourcePaths: publicCorpus.families.flatMap((entry) => entry.control_surface.provenance.source_paths),
    ...(holdoutTrustedIssuers === undefined ? {} : { trustedIssuers: holdoutTrustedIssuers }) });
  const semanticRuntime = fingerprintBenchmarkV3SemanticRuntime(semanticRuntimeRoot,
    external.families.map((entry) => entry.control_surface.runtime_key));
  const frozenRuntimeByKey = new Map(binding.semantic_runtime_entries?.map((entry) => [entry.key, entry.key_fingerprint]) ?? []);
  expect(semanticRuntime.entries.every((entry) => frozenRuntimeByKey.get(entry.key) === entry.key_fingerprint),
    "BENCHMARK_V3_HOLDOUT_BINDING", "external holdout requires a semantic runtime key not frozen by the resumed campaign");
  ORACLE_EXPECTATIONS.set(opencodeIdentity, new Map(external.families.map((entry) => [entry.family_id,
    entry.control_surface.expected_test_count])));
  const cloneBinding = benchmarkV3ExecutionCloneBinding(source, output);
  expect(cloneBinding.clone_binding_fingerprint === binding.execution_clone_binding_fingerprint,
    "BENCHMARK_V3_EXECUTION_ALREADY_RESERVED", "holdout is running from a different clone than the reserved campaign");
  const holdoutReservation = reserveBenchmarkV3Execution({ authority: executionAuthority, phase: "holdout",
    campaignFingerprint: binding.campaign_fingerprint, cloneBinding });
  const journal = createBenchmarkV3CampaignJournal(output, { sourceRoot: source,
    campaignFingerprint: binding.campaign_fingerprint, initialLedger: developmentReport.ledger, phase: "holdout" });
  validateBenchmarkV3Ledger(journal.ledger, design, {
    development: binding.arm_order_schedules.development.schedule_fingerprint,
    validation: binding.arm_order_schedules.validation.schedule_fingerprint,
    holdout: external.manifest.arm_order_schedule.schedule_fingerprint,
  });
  if (journal.completed_report !== null) {
    expect(journal.completed_report.external_holdout_manifest_fingerprint === fingerprint(external.manifest)
      && journal.completed_report.external_holdout_corpus_fingerprint === external.corpus_fingerprint,
    "BENCHMARK_V3_HOLDOUT_RESUME", "completed holdout report differs from the current signed external holdout");
    journal.markComplete(journal.completed_report);
    consumeBenchmarkV3Execution({ authority: executionAuthority, phase: "holdout",
      campaignFingerprint: binding.campaign_fingerprint, cloneBinding });
    return journal.completed_report;
  }
  const continuationBudget = createContinuationBudget({ authority: executionAuthority, phase: "holdout",
    campaignFingerprint: binding.campaign_fingerprint, cloneBinding,
    reservationDisposition: holdoutReservation.disposition });
  let ledger = bindBenchmarkV3HoldoutArmOrderSchedule(journal.ledger, design,
    external.manifest.arm_order_schedule.schedule_fingerprint);
  if (ledger.ledger_fingerprint !== journal.ledger.ledger_fingerprint) journal.recordLedger(ledger);
  const modelBinding = binding.model_binding;
  const baselineArm = Object.freeze({ kind: "baseline", arm_id: "plain-baseline", source_sha: registration.source_sha,
    source_tree_fingerprint: binding.source_tree_fingerprint, product_bundle_fingerprint: fingerprint({ schema_version: 1, files: [] }), agent_id: "build" });
  const candidateArm = Object.freeze({ kind: "candidate", arm_id: selectedId, ...candidate,
    source_tree_fingerprint: binding.source_tree_fingerprint, agent_id: "core" });
  const finish = (value) => {
    const result = finalizeStudy(output, ledger, { ...value, campaign_binding: binding,
      holdout_execution_reservation_disposition: holdoutReservation.disposition,
      external_holdout_manifest_fingerprint: fingerprint(external.manifest),
      external_holdout_corpus_fingerprint: external.corpus_fingerprint }, journal,
    { ledgerName: "holdout-ledger.json", reportName: "holdout-report.json" });
    consumeBenchmarkV3Execution({ authority: executionAuthority, phase: "holdout",
      campaignFingerprint: binding.campaign_fingerprint, cloneBinding });
    return result;
  };
  const candidateRun = await runCounterbalancedCandidateStage({ sourceRoot: source, semanticRuntimeRoot,
    semanticRuntimeEntries: semanticRuntime.entries, containmentOptions, ledger, design, stage: "holdout",
    families: external.families, baselineArm, candidateArm, registration,
    opencodeIdentity, model: modelBinding.model, provider: modelBinding.provider, variant: modelBinding.variant,
    seed: modelBinding.corpus_generation_seed, modelSamplingSeed: modelBinding.model_sampling_seed,
    timeoutMs, bindingsFingerprint: binding.bindings_fingerprint,
    executionId: executionAuthority.receipt.holdout_execution_id,
    schedule: external.manifest.arm_order_schedule,
    holdoutSelectionCommitmentFingerprint: holdoutCommitment.commitment_fingerprint,
    journal, continuationBudget });
  ledger = candidateRun.ledger;
  if (candidateRun.blocked) return finish({ status: "infrastructure-blocked", final_status: "STUDY BLOCKED — INFRASTRUCTURE",
    stage: "holdout", confirmatory_claim_allowed: false, confirmatory_execution_count: 0,
    holdout_baseline_attempts: attemptAudit(candidateRun.baseline), holdout_candidate_attempts: attemptAudit(candidateRun.outcomes) });
  const efficacy = evaluateBenchmarkV3EfficacyGate(design, candidateRun.report, 1);
  if (!efficacy.passed) return finish({ status: "holdout-efficacy-failed",
    final_status: "BOUNDED STUDY COMPLETE — NO PROMOTABLE HARNESS",
    confirmatory_claim_allowed: false, confirmatory_execution_count: 1, holdout_report: candidateRun.report,
    holdout_efficacy: efficacy, holdout_baseline_attempts: attemptAudit(candidateRun.baseline),
    holdout_candidate_attempts: attemptAudit(candidateRun.outcomes) });
  return finish({ status: "holdout-confirmed", final_status: "CONFIRMATORY HOLDOUT PASSED",
    confirmatory_claim_allowed: true, confirmatory_execution_count: 1, final_candidate_sha: registration.source_sha,
    product_bundle_fingerprint: registration.product_bundle_fingerprint, holdout_report: candidateRun.report,
    holdout_efficacy: efficacy, holdout_baseline_attempts: attemptAudit(candidateRun.baseline),
    holdout_candidate_attempts: attemptAudit(candidateRun.outcomes) });
}
