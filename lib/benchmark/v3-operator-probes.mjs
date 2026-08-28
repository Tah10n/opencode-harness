import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { ContractError, canonicalJson, fingerprint } from "../feedback/contracts.mjs";
import { runManagedCommand } from "../feedback/process-tree.mjs";
import { buildProfileBundleManifest } from "../profile-v3.mjs";
import { verifyBenchmarkV3OpenCodeExecutable } from "./v3-runner.mjs";

const VERIFIED = new WeakSet();
const VERIFIED_EGRESS = new WeakSet();
const FP = /^sha256:[0-9a-f]{64}$/u;

function fail(message) { throw new ContractError("BENCHMARK_V3_OPERATOR_PROBE", message); }
function expect(condition, message) { if (!condition) fail(message); }
function passed(result) { return result.status === 0 && result.signal === null && result.error === undefined; }
function containmentOptionsFromEnvironment(environment) {
  const cgroupRoot = environment.OPENCODE_QUALITY_CGROUP_ROOT;
  const cgroupAttachMode = environment.OPENCODE_QUALITY_CGROUP_ATTACH_MODE;
  const cgroupAttachHelper = environment.OPENCODE_QUALITY_CGROUP_ATTACH_HELPER;
  expect(typeof cgroupRoot === "string" && path.isAbsolute(cgroupRoot)
    && cgroupAttachMode === "sudo-helper-v2" && typeof cgroupAttachHelper === "string"
    && path.isAbsolute(cgroupAttachHelper), "guarded cgroup-v2 containment is not configured");
  return Object.freeze({ cgroupRoot: path.resolve(cgroupRoot), cgroupAttachMode, cgroupAttachHelper: path.resolve(cgroupAttachHelper) });
}
function systemRoots() {
  return ["/usr", "/bin", "/lib", "/lib64", "/opt", "/nix/store", "/etc/ssl", "/etc/pki",
    "/etc/ca-certificates", "/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf", path.dirname(process.execPath)]
    .filter((entry, index, values) => fs.existsSync(entry) && values.indexOf(entry) === index);
}

export async function runBenchmarkV3OperatorProbes({ sourceRoot, opencodeExecutable, environment = process.env,
  expectedOpenCodeVersion = "1.18.21", managedRunner = runManagedCommand, namespaceRunner = spawnSync,
  platform = process.platform, bubblewrapExecutable = null }) {
  expect(platform === "linux", "readiness authority requires a provisioned Linux host");
  const source = fs.realpathSync.native(path.resolve(sourceRoot));
  const prepared = buildProfileBundleManifest(source, "lab").manifest;
  const opencode = verifyBenchmarkV3OpenCodeExecutable(path.resolve(opencodeExecutable));
  const versionHome = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "benchmark-v3-opencode-version-"));
  let version;
  try {
    version = spawnSync(opencode.path, ["--version"], { encoding: "utf8", shell: false, windowsHide: true,
      timeout: 30_000, env: { PATH: environment.PATH ?? "/usr/bin:/bin", HOME: versionHome } });
  } finally { fs.rmSync(versionHome, { recursive: true, force: true }); }
  expect(passed(version) && version.stdout.trim() === expectedOpenCodeVersion,
    `OpenCode executable is not exact version ${expectedOpenCodeVersion}`);
  const containmentOptions = containmentOptionsFromEnvironment(environment);
  const marker = `BENCHMARK_V3_OPERATOR_CONTAINMENT_${prepared.source_sha.slice(0, 16)}`;
  const descendantProgram = "const{spawn}=require('node:child_process');spawn(process.execPath,['-e','setInterval(()=>{},60000)'],{stdio:'ignore'}).unref();process.stdout.write(process.argv[1]);";
  const managed = await managedRunner({ file: process.execPath, args: ["-e", descendantProgram, marker], cwd: source,
    env: { PATH: environment.PATH ?? "/usr/bin:/bin", HOME: "/nonexistent" }, timeout: 30_000,
    maxOutputChars: 1024, outputMarker: marker, containmentOptions });
  const zeroDescendants = managed.teardown_verified === true && FP.test(managed.containment_fingerprint ?? "")
    && managed.output_marker_match?.count === 1
    && !fs.existsSync(path.join(containmentOptions.cgroupRoot, "opencode-quality-workload"));
  expect(zeroDescendants, "process-tree containment or zero-descendant teardown probe failed");
  const probe = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "benchmark-v3-operator-probe-"));
  let namespaceResult;
  try {
    const workspace = path.join(probe, "workspace");
    fs.mkdirSync(workspace, { mode: 0o700 });
    const allowed = path.join(workspace, "allowed.txt");
    const writable = path.join(workspace, "written.txt");
    const hidden = path.join(probe, "hidden-control.json");
    fs.writeFileSync(allowed, "public\n", { mode: 0o600 });
    fs.writeFileSync(hidden, "private-control\n", { mode: 0o600 });
    const executableProbe = path.join(workspace, "opencode-bin");
    fs.copyFileSync(opencode.path, executableProbe, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(executableProbe, 0o500);
    expect(verifyBenchmarkV3OpenCodeExecutable(executableProbe).sha256 === opencode.sha256,
      "OpenCode executable identity changed during namespace staging");
    if (namespaceRunner === spawnSync) expect(typeof process.getuid === "function" && process.getuid() === 0,
      "real namespace probe requires the trusted root coordinator");
    const program = [
      "const fs=require('node:fs'),{spawnSync}=require('node:child_process');",
      "if(process.getuid?.()===0)process.exit(10);",
      "if(fs.readFileSync(process.argv[1],'utf8')!=='public\\n')process.exit(11);",
      "fs.writeFileSync(process.argv[2],'bounded-write\\n');",
      "for(const p of [process.argv[3],process.argv[4]]){try{fs.readFileSync(p);process.exit(12)}catch{}}",
      "try{fs.writeFileSync('/etc/benchmark-v3-forbidden','x');process.exit(13)}catch{}",
      "const r=spawnSync(process.argv[5],['--version'],{encoding:'utf8'});",
      "if(r.status!==0)process.exit(14);if(r.stdout.trim()!==process.argv[6])process.exit(15);",
      "process.exit(0);",
    ].join("");
    const bwrap = bubblewrapExecutable
      ?? ["/usr/bin/bwrap", "/usr/local/bin/bwrap"].find((entry) => fs.existsSync(entry));
    expect(bwrap !== undefined, "bubblewrap is unavailable");
    const namespaceWorkspace = "/workspace";
    namespaceResult = namespaceRunner(bwrap, ["--die-with-parent", "--new-session", "--unshare-user", "--uid", "65534",
      "--gid", "65534", "--unshare-pid", "--unshare-ipc", "--unshare-uts", "--unshare-cgroup-try", "--share-net",
      "--proc", "/proc", "--dev", "/dev", ...systemRoots().flatMap((entry) => ["--ro-bind", entry, entry]),
      "--chmod", "0555", "/", "--chmod", "0555", "/etc",
      "--bind", workspace, namespaceWorkspace, "--chdir", namespaceWorkspace, process.execPath, "-e", program,
      `${namespaceWorkspace}/allowed.txt`, `${namespaceWorkspace}/written.txt`, hidden,
      path.join(source, "package.json"), `${namespaceWorkspace}/opencode-bin`, expectedOpenCodeVersion], {
      encoding: "utf8", shell: false, windowsHide: true, timeout: 30_000, maxBuffer: 64 * 1024,
      env: { PATH: "/usr/bin:/bin", HOME: namespaceWorkspace, TMPDIR: namespaceWorkspace, LANG: "C", LC_ALL: "C" },
    });
    expect(passed(namespaceResult) && fs.readFileSync(writable, "utf8") === "bounded-write\n",
      `hidden namespace, source read, workspace write, or executable identity probe failed (status ${namespaceResult.status ?? "none"})`);
  } finally { fs.rmSync(probe, { recursive: true, force: true }); }
  const body = Object.freeze({ schema_version: 1, source_sha: prepared.source_sha,
    source_tree_fingerprint: prepared.source_tree_fingerprint,
    process_tree_containment: true, zero_descendant_teardown: true, hidden_namespace_denial: true,
    source_read_boundary: true, workspace_write_boundary: true, workload_non_root: true,
    opencode_executable_fingerprint: opencode.executable_fingerprint, opencode_version: expectedOpenCodeVersion,
    containment_fingerprint: managed.containment_fingerprint });
  const evidence = Object.freeze({ ...body, probe_fingerprint: fingerprint(body) });
  VERIFIED.add(evidence);
  return evidence;
}

export function verifyBenchmarkV3OperatorProbeEvidence(evidence) {
  expect(VERIFIED.has(evidence) && evidence?.process_tree_containment === true
    && evidence?.zero_descendant_teardown === true && evidence?.hidden_namespace_denial === true
    && evidence?.source_read_boundary === true && evidence?.workspace_write_boundary === true
    && evidence?.workload_non_root === true && FP.test(evidence?.probe_fingerprint ?? ""),
  "readiness receipt requires opaque evidence from the real operator probes");
  return evidence;
}

export function runBenchmarkV3ProviderOnlyEgressProbe({ sourceRoot, curlExecutable = "/usr/bin/curl",
  resolverExecutable = "/usr/bin/getent", runner = spawnSync, platform = process.platform } = {}) {
  expect(platform === "linux", "provider-only egress probe requires a provisioned Linux host");
  const source = fs.realpathSync.native(path.resolve(sourceRoot));
  const prepared = buildProfileBundleManifest(source, "lab").manifest;
  expect(fs.existsSync(curlExecutable) && path.isAbsolute(curlExecutable)
    && fs.existsSync(resolverExecutable) && path.isAbsolute(resolverExecutable),
  "trusted curl or resolver executable is unavailable");
  const probe = (url) => runner(curlExecutable, ["--silent", "--show-error", "--output", "/dev/null",
    "--write-out", "%{http_code}", "--connect-timeout", "10", "--max-time", "20", "--location-trusted", "--max-redirs", "0", url], {
    encoding: "utf8", shell: false, windowsHide: true, timeout: 30_000,
    env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent", LANG: "C", LC_ALL: "C" },
  });
  const providerAuthMode = process.env.BENCHMARK_V3_PROVIDER_AUTH_MODE ?? "api";
  expect(["api", "oauth"].includes(providerAuthMode), "provider authorization mode is invalid");
  const providerOrigins = providerAuthMode === "oauth"
    ? ["https://auth.openai.com/oauth/token", "https://chatgpt.com/backend-api/codex/responses"]
    : ["https://api.openai.com/v1/models"];
  const providers = providerOrigins.map(probe);
  const forbiddenOrigin = probe("https://example.com/");
  const forbiddenAddress = probe("https://1.1.1.1/");
  const forbiddenDns = runner(resolverExecutable, ["ahostsv4", "example.com"], {
    encoding: "utf8", shell: false, windowsHide: true, timeout: 10_000,
    env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent", LANG: "C", LC_ALL: "C" },
  });
  expect(providers.every((provider) => provider.status === 0
    && /^(?:400|401|403|404|405|429)$/u.test(provider.stdout.trim())),
  "OpenAI provider origins are not reachable through the provisioned egress boundary");
  expect(forbiddenOrigin.status !== 0 && forbiddenAddress.status !== 0 && forbiddenDns.status !== 0,
    "provider-only egress boundary allowed a non-provider destination");
  const body = Object.freeze({ schema_version: 2, source_sha: prepared.source_sha,
    source_tree_fingerprint: prepared.source_tree_fingerprint, provider_auth_mode: providerAuthMode,
    provider_origins: Object.freeze(providerOrigins), provider_origin_reachable: true,
    non_provider_origin_denied: true, direct_non_provider_address_denied: true,
    arbitrary_dns_egress_denied: true });
  const evidence = Object.freeze({ ...body, probe_fingerprint: fingerprint(body) });
  VERIFIED_EGRESS.add(evidence);
  return evidence;
}

export function verifyBenchmarkV3ProviderOnlyEgressEvidence(evidence) {
  const expectedOrigins = evidence?.provider_auth_mode === "oauth"
    ? ["https://auth.openai.com/oauth/token", "https://chatgpt.com/backend-api/codex/responses"]
    : evidence?.provider_auth_mode === "api" ? ["https://api.openai.com/v1/models"] : null;
  expect(VERIFIED_EGRESS.has(evidence) && evidence?.provider_origin_reachable === true
    && expectedOrigins !== null && canonicalJson(evidence?.provider_origins) === canonicalJson(expectedOrigins)
    && evidence?.non_provider_origin_denied === true && evidence?.direct_non_provider_address_denied === true
    && evidence?.arbitrary_dns_egress_denied === true
    && FP.test(evidence?.probe_fingerprint ?? ""),
  "provider-only egress receipt requires opaque evidence from the real network probes");
  return evidence;
}
