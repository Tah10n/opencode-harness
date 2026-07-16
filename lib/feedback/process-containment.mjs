import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const PROCESS_CONTAINMENT_SUPPORT_STATES = Object.freeze([
  "verified",
  "unsupported",
  "unavailable",
]);

const WINDOWS_JOB_KIND = "windows-job-object-v1";
const WINDOWS_JOB_READY_TIMEOUT_MS = 60_000;
const LINUX_CGROUP_KIND = "linux-cgroup-v2";
const MACOS_EXCLUSIVE_UID_KIND = "macos-exclusive-uid-v1";
const MACOS_CONTROLLER_PROTOCOL_VERSION = 1;
const MACOS_CONTROLLER_READY_TIMEOUT_MS = 10_000;
const MACOS_CONTROLLER_TEARDOWN_TIMEOUT_MS = 10_000;
const MACOS_CONTROLLER_CLOSE_TIMEOUT_MS = MACOS_CONTROLLER_TEARDOWN_TIMEOUT_MS + 2_000;
const MACOS_CONTROLLER_PROTOCOL_FINGERPRINT = fingerprint("macos-exclusive-uid-controller-v1");
const OTHER_UNAVAILABLE_KIND = "platform-process-containment-unavailable";
const CGROUP2_SUPER_MAGIC = 0x63677270n;
const SAFE_SCOPE = /^[A-Za-z0-9._-]{1,128}$/u;
const MAX_PATH_BYTES = 4096;
const MAX_CONTROLLER_BYTES = 4096;
const MAX_CONTROLLER_PATH_DEPTH = 64;
const MAX_CGROUP_DEPTH = 64;
const MAX_CGROUP_DESCENDANTS = 1024;
const LINUX_WORKLOAD_LEAF = "opencode-quality-workload";
const LINUX_ATTACH_MODE = "sudo-helper-v1";
const LINUX_CONTROLLER_MODULE = fileURLToPath(import.meta.url);

const LINUX_CGROUP_WATCHDOG_SOURCE = String.raw`
import { runLinuxCgroupWatchdogProcess } from ${JSON.stringify(import.meta.url)};
await runLinuxCgroupWatchdogProcess(process.env.OC_LINUX_CGROUP_WATCHDOG_CONFIG);
`;

const WINDOWS_JOB_CONTROLLER_SOURCE = String.raw`
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
trap {
  [Console]::Out.WriteLine("ERROR:" + $_.Exception.Message)
  [Console]::Out.Flush()
  exit 1
}
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class ManagedCommandJob {
  [StructLayout(LayoutKind.Sequential)]
  public struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
    public long PerProcessUserTimeLimit;
    public long PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize;
    public UIntPtr MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass;
    public uint SchedulingClass;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct IO_COUNTERS {
    public ulong ReadOperationCount;
    public ulong WriteOperationCount;
    public ulong OtherOperationCount;
    public ulong ReadTransferCount;
    public ulong WriteTransferCount;
    public ulong OtherTransferCount;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
    public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
    public IO_COUNTERS IoInfo;
    public UIntPtr ProcessMemoryLimit;
    public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed;
    public UIntPtr PeakJobMemoryUsed;
  }

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr CreateJobObject(IntPtr attributes, string name);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool CloseHandle(IntPtr handle);
}
"@

$job = [ManagedCommandJob]::CreateJobObject([IntPtr]::Zero, $env:OC_MANAGED_JOB_NAME)
if ($job -eq [IntPtr]::Zero) { throw "CreateJobObject failed" }
if ([Runtime.InteropServices.Marshal]::GetLastWin32Error() -eq 183) { throw "job scope already exists" }
try {
  $limits = New-Object ManagedCommandJob+JOBOBJECT_EXTENDED_LIMIT_INFORMATION
  $basicLimits = New-Object ManagedCommandJob+JOBOBJECT_BASIC_LIMIT_INFORMATION
  $basicLimits.LimitFlags = 0x00002000
  $limits.BasicLimitInformation = $basicLimits
  $size = [Runtime.InteropServices.Marshal]::SizeOf($limits)
  $pointer = [Runtime.InteropServices.Marshal]::AllocHGlobal($size)
  try {
    [Runtime.InteropServices.Marshal]::StructureToPtr($limits, $pointer, $false)
    if (-not [ManagedCommandJob]::SetInformationJobObject($job, 9, $pointer, [uint32]$size)) {
      throw "SetInformationJobObject failed"
    }
  } finally {
    [Runtime.InteropServices.Marshal]::FreeHGlobal($pointer)
  }

  $targetPid = [uint32]$env:OC_MANAGED_WORKER_PID
  $target = [ManagedCommandJob]::OpenProcess(0x00001101, $false, $targetPid)
  if ($target -eq [IntPtr]::Zero) { throw "OpenProcess failed" }
  try {
    if (-not [ManagedCommandJob]::AssignProcessToJobObject($job, $target)) {
      throw "AssignProcessToJobObject failed"
    }
  } finally {
    [void][ManagedCommandJob]::CloseHandle($target)
  }

  [Console]::Out.WriteLine("READY")
  [Console]::Out.Flush()
  if ([Console]::In.ReadLine() -ne "CLOSE") { throw "controller input closed" }
  if (-not [ManagedCommandJob]::CloseHandle($job)) { throw "CloseHandle failed" }
  $job = [IntPtr]::Zero
  [Console]::Out.WriteLine("CLOSED")
  [Console]::Out.Flush()
} finally {
  if ($job -ne [IntPtr]::Zero) { [void][ManagedCommandJob]::CloseHandle($job) }
}
`;

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function fingerprint(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function comparablePath(value, platform = process.platform) {
  let normalized = path.normalize(value);
  if (platform === "win32" && normalized.startsWith("\\\\?\\UNC\\")) normalized = `\\\\${normalized.slice(8)}`;
  else if (platform === "win32" && normalized.startsWith("\\\\?\\")) normalized = normalized.slice(4);
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

function decimal(value) {
  return typeof value === "bigint" ? value.toString(10) : String(value);
}

function fileIdentity(candidate) {
  const canonicalPath = fs.realpathSync.native(path.resolve(candidate));
  const stat = fs.statSync(canonicalPath, { bigint: true });
  if (!stat.isFile()) throw new Error("containment controller executable is not a regular file");
  return Object.freeze({
    canonical_path: canonicalPath,
    device: decimal(stat.dev),
    inode: decimal(stat.ino),
    mode: decimal(stat.mode),
    size: decimal(stat.size),
    modified_ns: decimal(stat.mtimeNs),
    changed_ns: decimal(stat.ctimeNs),
  });
}

function directoryIdentity(candidate) {
  const canonicalPath = fs.realpathSync.native(path.resolve(candidate));
  const stat = fs.statSync(canonicalPath, { bigint: true });
  if (!stat.isDirectory()) throw new Error("cgroup root is not a directory");
  return Object.freeze({
    canonical_path: canonicalPath,
    device: decimal(stat.dev),
    inode: decimal(stat.ino),
    mode: decimal(stat.mode),
    uid: decimal(stat.uid),
  });
}

function descriptor({ supportState, kind, scopeId = null, reason = null, mechanism = null }) {
  const identity = Object.freeze({
    schema_version: 1,
    support_state: supportState,
    kind,
    scope_id: scopeId,
    reason,
    mechanism,
  });
  return Object.freeze({ ...identity, identity, fingerprint: fingerprint(identity) });
}

export class ProcessContainmentError extends Error {
  constructor(classification, state, message = classification) {
    super(message);
    this.name = "ProcessContainmentError";
    this.code = classification.toUpperCase();
    this.classification = classification;
    this.containment_state = state;
  }
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
}

function assertCanonicalAbsolutePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > MAX_PATH_BYTES
    || value.includes("\0") || !path.isAbsolute(value) || path.normalize(value) !== value || path.resolve(value) !== value) {
    throw new TypeError(`${label} must be a bounded canonical absolute path`);
  }
  return value;
}

export function normalizeProcessContainmentOptions(value = {}) {
  assertPlainObject(value, "containmentOptions");
  const keys = Object.keys(value);
  if (keys.some((key) => ![
    "cgroupRoot", "cgroupAttachMode", "cgroupAttachHelper", "macosController", "macosWorkloadUid",
  ].includes(key))) {
    throw new TypeError("containmentOptions has unsupported fields");
  }
  if (value.cgroupAttachMode !== undefined && value.cgroupAttachMode !== LINUX_ATTACH_MODE) {
    throw new TypeError(`containmentOptions.cgroupAttachMode must be ${LINUX_ATTACH_MODE}`);
  }
  const normalized = {};
  if (value.cgroupRoot !== undefined) {
    normalized.cgroupRoot = assertCanonicalAbsolutePath(value.cgroupRoot, "containmentOptions.cgroupRoot");
  }
  if (value.cgroupAttachMode !== undefined) normalized.cgroupAttachMode = value.cgroupAttachMode;
  if (value.cgroupAttachHelper !== undefined) {
    normalized.cgroupAttachHelper = assertCanonicalAbsolutePath(
      value.cgroupAttachHelper,
      "containmentOptions.cgroupAttachHelper",
    );
  }
  if (value.macosController !== undefined) {
    normalized.macosController = assertCanonicalAbsolutePath(
      value.macosController,
      "containmentOptions.macosController",
    );
  }
  if (value.macosWorkloadUid !== undefined) {
    if (!Number.isSafeInteger(value.macosWorkloadUid)
      || value.macosWorkloadUid < 1 || value.macosWorkloadUid > 0x7fffffff) {
      throw new TypeError("containmentOptions.macosWorkloadUid must be a positive 32-bit integer");
    }
    normalized.macosWorkloadUid = value.macosWorkloadUid;
  }
  return Object.freeze(normalized);
}

function canonicalWindowsPowerShell() {
  const candidate = path.join(
    path.parse(process.execPath).root,
    "Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  return fileIdentity(candidate);
}

function scopeId(kind, factory) {
  const value = factory?.() ?? `${kind}-${process.pid}-${randomUUID()}`;
  if (typeof value !== "string" || !SAFE_SCOPE.test(value)) throw new ProcessContainmentError(
    "process_containment_failed",
    descriptor({ supportState: "unavailable", kind, reason: "invalid_scope_id" }),
    "process containment scope ID is invalid",
  );
  return value;
}

function decodeMountInfoPath(value) {
  return value.replace(/\\([0-7]{3})/gu, (_match, octal) => String.fromCharCode(Number.parseInt(octal, 8)));
}

function cgroup2MountFor(root, mountInfo = fs.readFileSync("/proc/self/mountinfo", "utf8")) {
  const candidates = [];
  for (const line of mountInfo.split("\n")) {
    const separator = line.indexOf(" - ");
    if (separator < 0) continue;
    const before = line.slice(0, separator).split(" ");
    const after = line.slice(separator + 3).split(" ");
    if (before.length < 5 || after[0] !== "cgroup2") continue;
    const mountRoot = decodeMountInfoPath(before[3]);
    const mountPoint = decodeMountInfoPath(before[4]);
    const comparableRoot = comparablePath(root, "linux");
    const comparableMount = comparablePath(mountPoint, "linux");
    if (comparableRoot === comparableMount || comparableRoot.startsWith(`${comparableMount}${path.sep}`)) {
      candidates.push(Object.freeze({ mount_point: mountPoint, mount_root: mountRoot }));
    }
  }
  return candidates.sort((left, right) => right.mount_point.length - left.mount_point.length)[0] ?? null;
}

function assertNoFilesystemAliases(candidate, platform = process.platform) {
  const absolute = assertCanonicalAbsolutePath(candidate, "containment path");
  const root = path.parse(absolute).root;
  const components = absolute.slice(root.length).split(path.sep).filter(Boolean);
  let current = root;
  for (const component of components) {
    current = path.join(current, component);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error("containment path traverses a symbolic link");
    if (comparablePath(fs.realpathSync.native(current), platform) !== comparablePath(current, platform)) {
      throw new Error("containment path traverses a filesystem alias");
    }
  }
  return absolute;
}

function assertControl(candidate, accessMode) {
  const stat = fs.lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`cgroup control is invalid: ${path.basename(candidate)}`);
  fs.accessSync(candidate, accessMode);
}

function linuxControllerError(code, message) {
  return Object.assign(new Error(message), { code });
}

function privilegedHelperIdentity(candidate) {
  const canonical = assertNoFilesystemAliases(candidate, "linux");
  const identity = fileIdentity(canonical);
  const stat = fs.statSync(canonical, { bigint: true });
  if (stat.uid !== 0n || stat.nlink !== 1n || (stat.mode & 0o022n) !== 0n
    || (stat.mode & 0o111n) === 0n) {
    throw linuxControllerError(
      "LINUX_CGROUP_ATTACH_HELPER_UNAVAILABLE",
      "attach helper must be a root-owned singly-linked non-writable executable",
    );
  }
  let parent = path.dirname(canonical);
  while (true) {
    assertNoFilesystemAliases(parent, "linux");
    assertNotWritableByCurrentUser(parent, `attach helper parent ${parent}`);
    const next = path.dirname(parent);
    if (next === parent) break;
    parent = next;
  }
  return Object.freeze({
    ...identity,
    uid: stat.uid.toString(10),
    link_count: stat.nlink.toString(10),
    content_fingerprint: `sha256:${createHash("sha256").update(fs.readFileSync(canonical)).digest("hex")}`,
  });
}

function linuxAttachHelper(helperPath) {
  const sudo = fileIdentity("/usr/bin/sudo");
  const policyProbeExecutable = fileIdentity("/usr/bin/tee");
  const executable = privilegedHelperIdentity(helperPath);
  return Object.freeze({ mode: LINUX_ATTACH_MODE, sudo, executable, policy_probe_executable: policyProbeExecutable });
}

function assertAttachHelperCannotEscapeGuard(helper, guard) {
  const deniedControls = ["cgroup.procs", "cgroup.threads"];
  for (const name of deniedControls) {
    const control = path.join(guard, name);
    assertControl(control, fs.constants.R_OK);
    const probe = spawnSync(
      helper.sudo.canonical_path,
      ["-n", "--", helper.policy_probe_executable.canonical_path, control],
      {
        shell: false,
        windowsHide: true,
        encoding: "utf8",
        env: { LANG: "C", LC_ALL: "C" },
        input: "",
        maxBuffer: MAX_CONTROLLER_BYTES,
        timeout: 10_000,
      },
    );
    if (probe.error !== undefined || probe.signal !== null || !Number.isInteger(probe.status)) {
      throw linuxControllerError(
        "LINUX_CGROUP_ATTACH_HELPER_UNAVAILABLE",
        `attach helper guard-policy probe did not complete for ${name}`,
      );
    }
    if (probe.status === 0) {
      throw linuxControllerError(
        "LINUX_CGROUP_ATTACH_HELPER_OVERPRIVILEGED",
        `attach helper can write guarded ${name}`,
      );
    }
    if (probe.status !== 1) {
      throw linuxControllerError(
        "LINUX_CGROUP_ATTACH_HELPER_UNAVAILABLE",
        `attach helper guard-policy probe returned an unsupported status for ${name}`,
      );
    }
  }
  assertSameFileIdentity(helper.sudo, "sudo attach helper");
  assertSameFileIdentity(helper.policy_probe_executable, "attach policy probe executable");
  const currentHelper = privilegedHelperIdentity(helper.executable.canonical_path);
  if (!sameIdentity(currentHelper, helper.executable)) {
    throw linuxControllerError("LINUX_CGROUP_ATTACH_HELPER_DRIFT", "privileged attach helper identity changed");
  }
  return fingerprint({ guard, denied_controls: deniedControls });
}

function assertSameFileIdentity(expected, label) {
  const current = fileIdentity(expected.canonical_path);
  if (!sameIdentity(current, expected)) {
    throw linuxControllerError("LINUX_CGROUP_ATTACH_HELPER_DRIFT", `${label} identity changed during attach`);
  }
}

function assertNotWritableByCurrentUser(candidate, label) {
  try {
    fs.accessSync(candidate, fs.constants.W_OK);
  } catch (error) {
    if (["EACCES", "EPERM", "EROFS"].includes(error?.code)) return;
    throw error;
  }
  throw linuxControllerError("LINUX_CGROUP_GUARD_WRITABLE", `${label} is writable by the current user`);
}

function pathIsWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function assertPathWithin(parent, candidate, label) {
  if (pathIsWithin(parent, candidate)) return;
  throw new Error(`${label} escapes its verified parent`);
}

function cgroupPath(info) {
  const candidate = info?.root ?? info?.leaf;
  if (typeof candidate !== "string") throw new Error("cgroup boundary path is unavailable");
  return candidate;
}

function unifiedCgroupMembership(pid) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error("cgroup membership PID is invalid");
  const content = fs.readFileSync(`/proc/${pid}/cgroup`, "utf8");
  if (Buffer.byteLength(content, "utf8") > MAX_PATH_BYTES) throw new Error("cgroup membership is unbounded");
  const matches = content.split("\n").filter((line) => line.startsWith("0::"));
  if (matches.length !== 1) throw new Error("cgroup v2 membership is ambiguous");
  const membership = matches[0].slice(3);
  if (membership.endsWith(" (deleted)") || membership.includes("\0") || !membership.startsWith("/")) {
    throw new Error("cgroup v2 membership is invalid");
  }
  const components = membership.split("/").filter(Boolean);
  if (components.some((component) => component === "." || component === "..")) {
    throw new Error("cgroup v2 membership escapes its namespace root");
  }
  const normalized = path.posix.normalize(membership);
  if (normalized !== membership) throw new Error("cgroup v2 membership is not canonical");
  return membership;
}

function membershipFilesystemPath(rootInfo, pid) {
  const membership = unifiedCgroupMembership(pid);
  const mountRoot = rootInfo.mount_root;
  if (typeof mountRoot !== "string" || !mountRoot.startsWith("/")
    || path.posix.normalize(mountRoot) !== mountRoot
    || mountRoot.split("/").some((component) => component === "." || component === "..")) {
    throw new Error("cgroup v2 mount root is not canonical");
  }
  const relative = path.posix.relative(mountRoot, membership);
  if (path.posix.isAbsolute(relative) || relative === ".." || relative.startsWith("../")) {
    throw new Error("cgroup membership is outside the visible cgroup v2 mount");
  }
  const candidate = relative === ""
    ? rootInfo.mount_point
    : path.join(rootInfo.mount_point, ...relative.split("/"));
  const canonical = assertNoFilesystemAliases(path.resolve(candidate), "linux");
  assertPathWithin(rootInfo.mount_point, canonical, "cgroup membership");
  return Object.freeze({ membership, cgroup: canonical, identity: directoryIdentity(canonical) });
}

export function createNodeLinuxController() {
  const members = (info) => {
    const content = fs.readFileSync(path.join(cgroupPath(info), "cgroup.procs"), "utf8");
    if (Buffer.byteLength(content, "utf8") > MAX_CONTROLLER_BYTES) {
      throw new Error("cgroup.procs exceeds its bounded representation");
    }
    const values = content.split(/\s+/u).filter(Boolean).map((value) => Number(value));
    if (values.some((value) => !Number.isInteger(value) || value <= 0) || new Set(values).size !== values.length) {
      throw new Error("cgroup.procs contains an invalid PID set");
    }
    return Object.freeze(values);
  };
  const descendants = (rootInfo) => {
    const entries = fs.readdirSync(rootInfo.root, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    if (entries.some((entry) => entry.isSymbolicLink())) {
      throw new Error("delegated root contains a symbolic-link entry");
    }
    const directoryEntries = entries.filter((entry) => entry.isDirectory());
    if (directoryEntries.length > MAX_CGROUP_DESCENDANTS) {
      throw new Error("cgroup subtree exceeds cleanup count bound");
    }
    return Object.freeze(directoryEntries.map((entry) => {
      const child = path.join(rootInfo.root, entry.name);
      if (path.dirname(child) !== rootInfo.root) throw new Error("cgroup descendant escapes delegated root");
      assertNoFilesystemAliases(child, "linux");
      return child;
    }));
  };
  const assertOutside = (rootInfo, processes) => {
    if (!Array.isArray(processes) || processes.some((entry) => entry === null
      || typeof entry !== "object" || Array.isArray(entry)
      || typeof entry.label !== "string" || !Number.isInteger(entry.pid) || entry.pid <= 0)) {
      throw new Error("exclusive cgroup root proof requires labelled PIDs");
    }
    return Object.freeze(processes.map((entry) => {
      const current = membershipFilesystemPath(rootInfo, entry.pid);
      if (pathIsWithin(rootInfo.root, current.cgroup)) {
        const code = entry.label === "coordinator"
          ? "LINUX_CGROUP_COORDINATOR_INSIDE_ROOT"
          : "LINUX_CGROUP_CONTROLLER_INSIDE_ROOT";
        throw linuxControllerError(code, `${entry.label} is already inside the delegated root`);
      }
      return Object.freeze({ ...entry, membership: current });
    }));
  };
  return Object.freeze({
    validateRoot(candidate) {
      const root = assertNoFilesystemAliases(candidate, "linux");
      const mount = cgroup2MountFor(root);
      if (mount === null) throw new Error("delegated root is not on a cgroup v2 mount");
      const mountPoint = assertNoFilesystemAliases(path.resolve(mount.mount_point), "linux");
      assertPathWithin(mountPoint, root, "delegated cgroup root");
      if (typeof fs.statfsSync === "function") {
        const statfs = fs.statfsSync(root, { bigint: true });
        if (statfs.type !== CGROUP2_SUPER_MAGIC) throw new Error("delegated root filesystem is not cgroup v2");
      }
      const identity = directoryIdentity(root);
      if (typeof process.getuid === "function" && identity.uid !== String(process.getuid())) {
        throw new Error("delegated cgroup root is not owned by the current user");
      }
      fs.accessSync(root, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
      for (const name of ["cgroup.procs", "cgroup.threads", "cgroup.subtree_control"]) {
        assertControl(path.join(root, name), fs.constants.R_OK | fs.constants.W_OK);
      }
      assertControl(path.join(root, "cgroup.events"), fs.constants.R_OK);
      assertControl(path.join(root, "cgroup.kill"), fs.constants.W_OK);
      const guard = path.dirname(root);
      if (comparablePath(guard, "linux") === comparablePath(root, "linux")
        || comparablePath(root, "linux") === comparablePath(mountPoint, "linux")) {
        throw linuxControllerError("LINUX_CGROUP_GUARD_UNAVAILABLE", "delegated root has no external guard cgroup");
      }
      assertNoFilesystemAliases(guard, "linux");
      assertPathWithin(mountPoint, guard, "delegated cgroup guard");
      fs.accessSync(guard, fs.constants.R_OK | fs.constants.X_OK);
      assertNotWritableByCurrentUser(guard, "delegated cgroup guard directory");
      for (const name of ["cgroup.procs", "cgroup.threads", "cgroup.subtree_control"]) {
        const control = path.join(guard, name);
        assertControl(control, fs.constants.R_OK);
        assertNotWritableByCurrentUser(control, `delegated cgroup guard ${name}`);
      }
      return Object.freeze({
        root,
        guard,
        mount_point: mountPoint,
        mount_root: mount.mount_root,
        identity,
        guard_identity: directoryIdentity(guard),
      });
    },
    membership(rootInfo, pid) {
      return membershipFilesystemPath(rootInfo, pid);
    },
    assertExclusiveRoot(rootInfo, outsideProcesses) {
      const current = this.validateRoot(rootInfo.root);
      if (!sameIdentity(current.identity, rootInfo.identity)
        || !sameIdentity(current.guard_identity, rootInfo.guard_identity)) {
        throw linuxControllerError("LINUX_CGROUP_ROOT_IDENTITY_DRIFT", "delegated root or guard identity drifted");
      }
      const outside = assertOutside(current, outsideProcesses);
      if (members(current).length !== 0 || this.populated(current) || descendants(current).length !== 0) {
        throw linuxControllerError(
          "LINUX_CGROUP_ROOT_NOT_EXCLUSIVE",
          "delegated root must be empty and have no descendants before attachment",
        );
      }
      return Object.freeze({ root: current, outside });
    },
    createLeaf(rootInfo) {
      const leaf = path.join(rootInfo.root, LINUX_WORKLOAD_LEAF);
      if (path.dirname(leaf) !== rootInfo.root) throw new Error("workload leaf escapes delegated root");
      try {
        fs.mkdirSync(leaf, { recursive: false, mode: 0o700 });
      } catch (error) {
        if (error?.code === "EEXIST") {
          throw linuxControllerError("LINUX_CGROUP_ROOT_NOT_EXCLUSIVE", "delegated root is already leased");
        }
        throw error;
      }
      try {
        assertNoFilesystemAliases(leaf, "linux");
        assertControl(path.join(leaf, "cgroup.procs"), fs.constants.R_OK | fs.constants.W_OK);
        assertControl(path.join(leaf, "cgroup.events"), fs.constants.R_OK);
        assertControl(path.join(leaf, "cgroup.kill"), fs.constants.W_OK);
        return Object.freeze({ leaf, identity: directoryIdentity(leaf) });
      } catch (error) {
        // Assignment in the caller has not happened yet. Roll the newly
        // created, still-unpopulated leaf back here so a validation failure
        // cannot strand an unreferenced cgroup directory.
        try { fs.rmdirSync(leaf); } catch (cleanupError) {
          throw new Error(`cgroup leaf validation failed and rollback was not confirmed: ${cleanupError.message}`, {
            cause: error,
          });
        }
        throw error;
      }
    },
    inspectLeaf(rootInfo) {
      const leaf = path.join(rootInfo.root, LINUX_WORKLOAD_LEAF);
      if (path.dirname(leaf) !== rootInfo.root) throw new Error("workload leaf escapes delegated root");
      assertNoFilesystemAliases(leaf, "linux");
      assertControl(path.join(leaf, "cgroup.procs"), fs.constants.R_OK | fs.constants.W_OK);
      assertControl(path.join(leaf, "cgroup.events"), fs.constants.R_OK);
      assertControl(path.join(leaf, "cgroup.kill"), fs.constants.W_OK);
      return Object.freeze({ leaf, identity: directoryIdentity(leaf) });
    },
    attach(leafInfo, pid, { mode = null, helperPath = null } = {}) {
      if (mode !== LINUX_ATTACH_MODE || typeof helperPath !== "string") {
        throw linuxControllerError(
          "LINUX_CGROUP_ATTACH_HELPER_UNAVAILABLE",
          "guarded cgroup attach requires the configured privileged helper",
        );
      }
      const helper = linuxAttachHelper(helperPath);
      const guardPolicyFingerprint = assertAttachHelperCannotEscapeGuard(
        helper,
        path.dirname(path.dirname(leafInfo.leaf)),
      );
      const control = path.join(leafInfo.leaf, "cgroup.procs");
      assertControl(control, fs.constants.R_OK | fs.constants.W_OK);
      const result = spawnSync(
        helper.sudo.canonical_path,
        ["-n", "--", helper.executable.canonical_path, String(pid)],
        {
          shell: false,
          windowsHide: true,
          encoding: "utf8",
          env: { LANG: "C", LC_ALL: "C" },
          input: "",
          maxBuffer: MAX_CONTROLLER_BYTES,
          timeout: 10_000,
        },
      );
      if (result.error !== undefined || result.status !== 0 || result.signal !== null
        || result.stdout !== `ATTACHED:${pid}\n` || result.stderr !== "") {
        throw linuxControllerError("LINUX_CGROUP_ATTACH_FAILED", "privileged cgroup attach helper failed closed");
      }
      assertSameFileIdentity(helper.sudo, "sudo attach helper");
      const currentHelper = privilegedHelperIdentity(helper.executable.canonical_path);
      if (!sameIdentity(currentHelper, helper.executable)) {
        throw linuxControllerError("LINUX_CGROUP_ATTACH_HELPER_DRIFT", "privileged attach helper identity changed");
      }
      const members = fs.readFileSync(path.join(leafInfo.leaf, "cgroup.procs"), "utf8")
        .split(/\s+/u).filter(Boolean).map(Number);
      if (!members.includes(pid)) throw new Error("idle worker was not attached to delegated cgroup");
      return Object.freeze({ ...helper, guard_policy_fingerprint: guardPolicyFingerprint });
    },
    assertInitialBoundary(rootInfo, leafInfo, workerPid, outsideProcesses) {
      const current = this.validateRoot(rootInfo.root);
      if (!sameIdentity(current.identity, rootInfo.identity)
        || !sameIdentity(current.guard_identity, rootInfo.guard_identity)) {
        throw linuxControllerError("LINUX_CGROUP_ROOT_IDENTITY_DRIFT", "delegated root or guard identity drifted");
      }
      const outside = assertOutside(current, outsideProcesses);
      const leaf = this.inspectLeaf(current);
      const childPaths = descendants(current);
      const leafMembers = members(leaf);
      const workerMembership = this.membership(current, workerPid);
      if (!sameIdentity(leaf.identity, leafInfo.identity)
        || childPaths.length !== 1
        || comparablePath(childPaths[0], "linux") !== comparablePath(leaf.leaf, "linux")
        || members(current).length !== 0
        || leafMembers.length !== 1
        || leafMembers[0] !== workerPid
        || comparablePath(workerMembership.cgroup, "linux") !== comparablePath(leaf.leaf, "linux")
        || !this.populated(current)) {
        throw linuxControllerError(
          "LINUX_CGROUP_ROOT_NOT_EXCLUSIVE",
          "delegated root acquired foreign processes or descendants during attachment",
        );
      }
      return Object.freeze({ root: current, leaf, outside });
    },
    revalidate(rootInfo, leafInfo, outsideProcesses) {
      const root = this.validateRoot(rootInfo.root);
      const outside = assertOutside(root, outsideProcesses);
      const leaf = this.inspectLeaf(root);
      return Object.freeze({
        root_identity: root.identity,
        guard_identity: root.guard_identity,
        leaf_identity: leaf.identity,
        outside,
      });
    },
    kill(info) {
      fs.writeFileSync(path.join(cgroupPath(info), "cgroup.kill"), "1\n", { encoding: "utf8", flag: "w" });
    },
    populated(info) {
      const events = fs.readFileSync(path.join(cgroupPath(info), "cgroup.events"), "utf8");
      const match = /^populated\s+([01])$/mu.exec(events);
      if (!match) throw new Error("cgroup.events has no bounded populated state");
      return match[1] === "1";
    },
    members,
    descendants,
    removeDescendants(rootInfo) {
      let visited = 0;
      const removePostorder = (candidate, depth) => {
        if (depth > MAX_CGROUP_DEPTH) throw new Error("cgroup subtree exceeds cleanup depth bound");
        if (!fs.existsSync(candidate)) return;
        assertNoFilesystemAliases(candidate, "linux");
        const entries = fs.readdirSync(candidate, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
          visited += 1;
          if (visited > MAX_CGROUP_DESCENDANTS) throw new Error("cgroup subtree exceeds cleanup count bound");
          const child = path.join(candidate, entry.name);
          if (path.dirname(child) !== candidate) throw new Error("cgroup cleanup child escapes its parent");
          removePostorder(child, depth + 1);
        }
        try { fs.rmdirSync(candidate); } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      };
      for (const child of descendants(rootInfo)) {
        visited += 1;
        if (visited > MAX_CGROUP_DESCENDANTS) throw new Error("cgroup subtree exceeds cleanup count bound");
        removePostorder(child, 1);
      }
      if (descendants(rootInfo).length !== 0) throw new Error("delegated root descendant cleanup was not confirmed");
    },
    exists(info) {
      return fs.existsSync(cgroupPath(info));
    },
  });
}

function sameIdentity(left, right) {
  return fingerprint(left) === fingerprint(right);
}

function rootFromOptions(options) {
  const environment = Object.hasOwn(options, "env") ? options.env : process.env;
  const candidate = options.cgroupRoot ?? environment?.OPENCODE_QUALITY_CGROUP_ROOT;
  return candidate === undefined ? null : assertCanonicalAbsolutePath(candidate, "delegated cgroup root");
}

function linuxAttachModeFromOptions(options) {
  const environment = Object.hasOwn(options, "env") ? options.env : process.env;
  const candidate = options.cgroupAttachMode ?? environment?.OPENCODE_QUALITY_CGROUP_ATTACH_MODE;
  if (candidate === undefined) return null;
  if (candidate !== LINUX_ATTACH_MODE) {
    throw linuxControllerError("LINUX_CGROUP_ATTACH_HELPER_UNAVAILABLE", "Linux cgroup attach mode is unsupported");
  }
  return candidate;
}

function linuxAttachHelperPathFromOptions(options) {
  const environment = Object.hasOwn(options, "env") ? options.env : process.env;
  const candidate = options.cgroupAttachHelper ?? environment?.OPENCODE_QUALITY_CGROUP_ATTACH_HELPER;
  if (candidate === undefined) return null;
  return assertCanonicalAbsolutePath(candidate, "Linux cgroup attach helper");
}

function linuxAttachHelperForOptions(options, rootInfo) {
  if (linuxAttachModeFromOptions(options) !== LINUX_ATTACH_MODE) {
    throw linuxControllerError(
      "LINUX_CGROUP_ATTACH_HELPER_UNAVAILABLE",
      "guarded Linux containment requires an explicit attach helper",
    );
  }
  const helperPath = linuxAttachHelperPathFromOptions(options);
  if (helperPath === null || pathIsWithin(rootInfo.root, helperPath)) {
    throw linuxControllerError(
      "LINUX_CGROUP_ATTACH_HELPER_UNAVAILABLE",
      "guarded Linux containment requires an external host-owned attach helper",
    );
  }
  const helper = linuxAttachHelper(helperPath);
  return Object.freeze({
    ...helper,
    guard_policy_fingerprint: assertAttachHelperCannotEscapeGuard(helper, rootInfo.guard),
  });
}

function macosControllerError(code, message) {
  return Object.assign(new Error(message), { code });
}

function macosControllerPathFromOptions(options) {
  const environment = Object.hasOwn(options, "env") ? options.env : process.env;
  const candidate = options.macosController ?? environment?.OPENCODE_QUALITY_MACOS_CONTROLLER;
  if (candidate === undefined) return null;
  return assertCanonicalAbsolutePath(candidate, "macOS exclusive-UID controller");
}

function macosWorkloadUidFromOptions(options) {
  const environment = Object.hasOwn(options, "env") ? options.env : process.env;
  const candidate = options.macosWorkloadUid ?? environment?.OPENCODE_QUALITY_MACOS_WORKLOAD_UID;
  if (candidate === undefined) return null;
  const parsed = typeof candidate === "number"
    ? candidate
    : (/^[1-9][0-9]*$/u.test(candidate) ? Number(candidate) : Number.NaN);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 0x7fffffff) {
    throw macosControllerError("MACOS_EXCLUSIVE_UID_INVALID", "macOS workload UID is invalid");
  }
  return parsed;
}

function macosControllerIdentity(candidate) {
  const identity = fileIdentity(candidate);
  const writableByWorkload = (entry) => {
    try {
      fs.accessSync(entry, fs.constants.W_OK);
      return true;
    } catch (error) {
      if (["EACCES", "EPERM", "EROFS"].includes(error?.code)) return false;
      throw error;
    }
  };
  let guard = path.dirname(identity.canonical_path);
  let reachedRoot = false;
  for (let depth = 0; depth < MAX_CONTROLLER_PATH_DEPTH; depth += 1) {
    const canonicalGuard = fs.realpathSync.native(guard);
    const stat = fs.statSync(canonicalGuard, { bigint: true });
    if (canonicalGuard !== guard || !stat.isDirectory() || stat.uid !== 0n
      || (stat.mode & 0o022n) !== 0n || writableByWorkload(canonicalGuard)) {
      throw macosControllerError(
        "MACOS_CONTROLLER_UNTRUSTED",
        "macOS controller path ancestry must be canonical, root-owned, and not group- or world-writable",
      );
    }
    const parent = path.dirname(canonicalGuard);
    if (parent === canonicalGuard) {
      reachedRoot = true;
      break;
    }
    guard = parent;
  }
  if (!reachedRoot) {
    throw macosControllerError("MACOS_CONTROLLER_UNTRUSTED", "macOS controller path ancestry is too deep");
  }
  const stat = fs.statSync(identity.canonical_path, { bigint: true });
  if (stat.uid !== 0n || (stat.mode & 0o022n) !== 0n || (stat.mode & 0o111n) === 0n
    || stat.nlink !== 1n || writableByWorkload(identity.canonical_path)) {
    throw macosControllerError(
      "MACOS_CONTROLLER_UNTRUSTED",
      "macOS controller must be root-owned, executable, singly linked, and not group- or world-writable",
    );
  }
  return Object.freeze({
    ...identity,
    owner_uid: decimal(stat.uid),
    owner_gid: decimal(stat.gid),
    links: decimal(stat.nlink),
  });
}

function macosMechanismForOptions(options) {
  const controllerPath = macosControllerPathFromOptions(options);
  if (controllerPath === null) {
    throw macosControllerError("MACOS_CONTROLLER_MISSING", "macOS exclusive-UID controller is not configured");
  }
  const workloadUid = macosWorkloadUidFromOptions(options);
  if (workloadUid === null) {
    throw macosControllerError("MACOS_EXCLUSIVE_UID_MISSING", "macOS exclusive workload UID is not configured");
  }
  const currentUid = options.currentUid ?? process.getuid?.();
  if (!Number.isSafeInteger(currentUid) || currentUid < 1 || currentUid !== workloadUid) {
    throw macosControllerError(
      "MACOS_EXCLUSIVE_UID_MISMATCH",
      "the harness coordinator must run as the configured non-root macOS workload UID",
    );
  }
  const controller = options.macosControllerIdentity ?? macosControllerIdentity(controllerPath);
  return Object.freeze({
    controller_executable: controller,
    workload_uid: workloadUid,
    controller_protocol_version: MACOS_CONTROLLER_PROTOCOL_VERSION,
    controller_protocol_fingerprint: MACOS_CONTROLLER_PROTOCOL_FINGERPRINT,
  });
}

function probeMacosExclusiveUid(mechanism, options) {
  const spawnProbe = options.spawnMacosProbe ?? spawnSync;
  const result = spawnProbe(
    mechanism.controller_executable.canonical_path,
    ["probe", String(process.pid), "5000"],
    {
      shell: false,
      windowsHide: true,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: MAX_CONTROLLER_BYTES,
      env: Object.hasOwn(options, "env") ? options.env : process.env,
    },
  );
  const nativeError = typeof result?.stdout === "string"
    ? /^ERROR:(exclusive_uid_not_available|scope_permission_failed|scope_identity_failed|scope_bound_exceeded|scope_ancestry_invalid|scope_census_failed)\n?$/u.exec(result.stdout)
    : null;
  if (result?.status !== 0 || result?.signal !== null || result?.error !== undefined
    || typeof result.stdout !== "string" || result.stderr !== "") {
    const error = macosControllerError("MACOS_EXCLUSIVE_UID_UNAVAILABLE", "macOS exclusive UID probe failed");
    if (result?.signal === null && result?.error === undefined && result?.stderr === "" && nativeError !== null) {
      error.reason = nativeError[1];
    }
    throw error;
  }
  const match = /^PROBE:1:([1-9][0-9]*):([1-9][0-9]*):([0-9]+):([0-9]+):([1-9][0-9]*)\n?$/u.exec(result.stdout);
  if (match === null || Number(match[1]) !== mechanism.workload_uid
    || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) < 1
    || !Number.isSafeInteger(Number(match[3])) || Number(match[3]) < 0
    || !Number.isSafeInteger(Number(match[4])) || Number(match[4]) < 0 || Number(match[4]) > 999999
    || !Number.isSafeInteger(Number(match[5])) || Number(match[5]) < 1 || Number(match[5]) > 64) {
    throw macosControllerError("MACOS_CONTROLLER_PROTOCOL_FAILED", "macOS exclusive UID probe output is invalid");
  }
  return true;
}

export function classifyProcessContainment(options = {}) {
  assertPlainObject(options, "process containment classification options");
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    try {
      const powershell = options.windowsPowerShellIdentity ?? canonicalWindowsPowerShell();
      return descriptor({
        supportState: "verified",
        kind: WINDOWS_JOB_KIND,
        mechanism: Object.freeze({ powershell, controller_source_fingerprint: fingerprint(WINDOWS_JOB_CONTROLLER_SOURCE) }),
      });
    } catch {
      return descriptor({ supportState: "unavailable", kind: WINDOWS_JOB_KIND, reason: "windows_job_controller_unavailable" });
    }
  }
  if (platform === "linux") {
    let root;
    try { root = rootFromOptions(options); } catch {
      return descriptor({ supportState: "unavailable", kind: LINUX_CGROUP_KIND, reason: "delegated_root_invalid" });
    }
    if (root === null) return descriptor({ supportState: "unavailable", kind: LINUX_CGROUP_KIND, reason: "delegated_root_missing" });
    try {
      const controller = options.linuxController ?? createNodeLinuxController();
      const rootInfo = controller.validateRoot(root);
      controller.assertExclusiveRoot(rootInfo, [Object.freeze({ label: "coordinator", pid: process.pid })]);
      const attachHelper = options.linuxController === undefined
        ? linuxAttachHelperForOptions(options, rootInfo)
        : null;
      return descriptor({
        supportState: "verified",
        kind: LINUX_CGROUP_KIND,
        mechanism: Object.freeze({
          root_identity: rootInfo.identity,
          current_parent_identity: rootInfo.guard_identity,
          guard_identity: rootInfo.guard_identity,
          mount_point: rootInfo.mount_point ?? null,
          attach_helper: attachHelper,
        }),
      });
    } catch {
      return descriptor({ supportState: "unavailable", kind: LINUX_CGROUP_KIND, reason: "delegated_root_unavailable" });
    }
  }
  if (platform === "darwin") {
    try {
      const mechanism = macosMechanismForOptions(options);
      probeMacosExclusiveUid(mechanism, options);
      return descriptor({
        supportState: "verified",
        kind: MACOS_EXCLUSIVE_UID_KIND,
        mechanism,
      });
    } catch (error) {
      const reason = error?.reason ?? Object.freeze({
        MACOS_CONTROLLER_MISSING: "controller_missing",
        MACOS_EXCLUSIVE_UID_MISSING: "exclusive_uid_missing",
        MACOS_EXCLUSIVE_UID_INVALID: "exclusive_uid_invalid",
        MACOS_EXCLUSIVE_UID_MISMATCH: "exclusive_uid_mismatch",
        MACOS_CONTROLLER_UNTRUSTED: "controller_untrusted",
        MACOS_EXCLUSIVE_UID_UNAVAILABLE: "exclusive_uid_not_available",
        MACOS_CONTROLLER_PROTOCOL_FAILED: "controller_protocol_failed",
      })[error?.code] ?? "controller_unavailable";
      return descriptor({ supportState: "unavailable", kind: MACOS_EXCLUSIVE_UID_KIND, reason });
    }
  }
  return descriptor({ supportState: "unavailable", kind: OTHER_UNAVAILABLE_KIND, reason: `platform_${platform}_unsupported` });
}

function waitForControllerClose(controller, closeState, confirmationMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { controller.stdin.end(); } catch { /* job handle close remains the fail-safe */ }
      try { controller.kill(); } catch { /* best effort after bounded failure */ }
      resolve(false);
    }, confirmationMs);
    closeState.resolve = (value) => {
      clearTimeout(timer);
      resolve(value);
    };
    try { controller.stdin.end("CLOSE\n"); } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

function createWindowsJobContainment(worker, timeoutMs, options) {
  return new Promise((resolve, reject) => {
    const classification = classifyProcessContainment({ platform: "win32", windowsPowerShellIdentity: options.windowsPowerShellIdentity });
    if (classification.support_state !== "verified") {
      reject(new ProcessContainmentError("process_containment_unavailable", classification));
      return;
    }
    const controllerIdentity = classification.mechanism.powershell;
    const uniqueScope = scopeId("windows-job", options.scopeIdFactory);
    const identity = Object.freeze({
      schema_version: 1,
      support_state: "verified",
      kind: WINDOWS_JOB_KIND,
      scope_id: uniqueScope,
      worker_pid: worker.pid,
      controller_executable: controllerIdentity,
      controller_source_fingerprint: fingerprint(WINDOWS_JOB_CONTROLLER_SOURCE),
    });
    const identityFingerprint = fingerprint(identity);
    let controller;
    let ready = false;
    let closed = false;
    let exited = false;
    let processClosed = false;
    let exitCode = null;
    let buffer = "";
    let stderr = "";
    let readinessSettled = false;
    let failure = null;
    let preparationAborted = false;
    let identityCurrent = true;
    let closePromise = null;
    let readyTimer;
    let abortHandler;
    const closeState = { requested: false, resolve: null };

    const status = () => Object.freeze({
      support_state: "verified",
      kind: WINDOWS_JOB_KIND,
      scope_id: uniqueScope,
      identity_fingerprint: identityFingerprint,
      attached: ready,
      closed,
      controller_exited: exited,
      controller_streams_closed: processClosed,
      controller_exit_code: exitCode,
      teardown_verified: closed && exited && processClosed && exitCode === 0 && identityCurrent && failure === null,
      preparation_aborted: preparationAborted,
      failure,
    });
    const clearReadiness = () => {
      clearTimeout(readyTimer);
      if (abortHandler !== undefined) options.signal?.removeEventListener("abort", abortHandler);
    };
    const failProtocol = (error = new ProcessContainmentError(
      "process_containment_failed",
      status(),
      "Windows Job Object setup failed",
    )) => {
      if (failure === null) failure = error.classification ?? "process_containment_failed";
      clearReadiness();
      try { controller?.stdin?.end(); } catch { /* job close is authoritative */ }
      try { controller?.kill(); } catch { /* best effort after failed readiness */ }
      if (!ready && !readinessSettled) {
        readinessSettled = true;
        reject(error);
      }
    };
    const maybeResolveClose = () => {
      if (!closeState.requested || !exited || !processClosed) return;
      closeState.resolve?.(closed && exitCode === 0 && failure === null);
    };
    const onLine = (line) => {
      if (line === "READY" && !ready && failure === null) {
        ready = true;
        readinessSettled = true;
        clearReadiness();
        const terminateAndVerify = (confirmationMs) => {
          if (closePromise !== null) return closePromise;
          closeState.requested = true;
          try {
            const currentController = options.windowsPowerShellIdentity
              ?? fileIdentity(controllerIdentity.canonical_path);
            identityCurrent = sameIdentity(currentController, controllerIdentity);
            if (!identityCurrent) failure = "windows_job_controller_identity_drift";
          } catch {
            identityCurrent = false;
            failure = "windows_job_controller_identity_unavailable";
          }
          if (exited) {
            closePromise = Promise.resolve(false);
            return closePromise;
          }
          closePromise = waitForControllerClose(controller, closeState, confirmationMs).then((closedVerified) => {
            if (!closedVerified && failure === null) failure = "windows_job_close_unverified";
            return closedVerified && identityCurrent && failure === null;
          });
          return closePromise;
        };
        resolve(Object.freeze({
          support_state: "verified",
          kind: WINDOWS_JOB_KIND,
          scope_id: uniqueScope,
          identity,
          fingerprint: identityFingerprint,
          status,
          terminateAndVerify,
          close: terminateAndVerify,
        }));
      } else if (line === "CLOSED" && ready && closeState.requested && !closed && failure === null) {
        closed = true;
        maybeResolveClose();
      } else if (line.startsWith("ERROR:")) {
        failProtocol(new ProcessContainmentError("process_containment_failed", status(), line.slice("ERROR:".length)));
      } else if (line.length > 0) {
        failProtocol(new ProcessContainmentError("process_containment_failed", status(), "unexpected Job controller output"));
      }
    };

    // A command timeout may race slow PowerShell startup. Continue the bounded
    // setup so the idle worker can still be attached and torn down through the
    // Job Object; initialization remains suppressed by the caller.
    abortHandler = () => { preparationAborted = true; };
    if (options.signal?.aborted) {
      abortHandler();
    }
    options.signal?.addEventListener("abort", abortHandler, { once: true });

    try {
      const encoded = Buffer.from(WINDOWS_JOB_CONTROLLER_SOURCE, "utf16le").toString("base64");
      const spawnController = options.spawnController ?? spawn;
      controller = spawnController(controllerIdentity.canonical_path, [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded,
      ], {
        windowsHide: true,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          OC_MANAGED_WORKER_PID: String(worker.pid),
          OC_MANAGED_JOB_NAME: `OpenCodeQuality-${uniqueScope}`,
        },
      });
    } catch {
      failProtocol();
      return;
    }
    controller.stdout.setEncoding("utf8");
    controller.stderr.setEncoding("utf8");
    controller.stderr.on("data", (chunk) => {
      const text = String(chunk);
      if (stderr.length < 4096) stderr += text.slice(0, 4096 - stderr.length);
      if (text.length > 0) {
        failProtocol(new ProcessContainmentError(
          "process_containment_failed",
          status(),
          "unexpected Job controller stderr",
        ));
      }
    });
    controller.stdout.on("data", (chunk) => {
      const text = String(chunk);
      if (text.length > 4096 - buffer.length) {
        buffer = "";
        failProtocol(new ProcessContainmentError(
          "process_containment_failed",
          status(),
          "Job controller output exceeded its protocol bound",
        ));
        return;
      }
      buffer += text;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/u, "");
        buffer = buffer.slice(newline + 1);
        onLine(line);
      }
    });
    controller.once("error", failProtocol);
    controller.once("exit", (code) => {
      exited = true;
      exitCode = code;
    });
    controller.once("close", (code) => {
      processClosed = true;
      if (!exited) {
        exited = true;
        exitCode = code;
      }
      if (!ready) {
        failProtocol(new ProcessContainmentError(
          "process_containment_failed",
          status(),
          stderr.trim().length > 0 ? stderr.trim() : "Job controller exited before readiness",
        ));
      } else if (!closeState.requested || !closed || exitCode !== 0) {
        failProtocol(new ProcessContainmentError(
          "process_containment_failed",
          status(),
          "Job controller exited outside the successful close protocol",
        ));
      }
      maybeResolveClose();
    });
    readyTimer = setTimeout(failProtocol, Math.max(timeoutMs, WINDOWS_JOB_READY_TIMEOUT_MS));
  });
}

function createMacosExclusiveUidContainment(worker, timeoutMs, options) {
  return new Promise((resolve, reject) => {
    let mechanism;
    try {
      mechanism = macosMechanismForOptions(options);
    } catch (error) {
      reject(new ProcessContainmentError(
        "process_containment_unavailable",
        descriptor({
          supportState: "unavailable",
          kind: MACOS_EXCLUSIVE_UID_KIND,
          reason: error?.code === "MACOS_EXCLUSIVE_UID_MISMATCH" ? "exclusive_uid_mismatch" : "controller_unavailable",
        }),
      ));
      return;
    }
    const uniqueScope = scopeId("macos-exclusive-uid", options.scopeIdFactory);
    let identity = null;
    let identityFingerprint = null;
    let controller;
    let ready = false;
    let closed = false;
    let exited = false;
    let processClosed = false;
    let exitCode = null;
    let buffer = "";
    let stderr = "";
    let readinessSettled = false;
    let failure = null;
    let preparationAborted = false;
    let identityCurrent = true;
    let closePromise = null;
    let readyTimer;
    let abortHandler;
    const closeState = { requested: false, resolve: null };

    const status = () => Object.freeze({
      support_state: "verified",
      kind: MACOS_EXCLUSIVE_UID_KIND,
      scope_id: uniqueScope,
      identity_fingerprint: identityFingerprint,
      attached: ready,
      closed,
      controller_exited: exited,
      controller_streams_closed: processClosed,
      controller_exit_code: exitCode,
      teardown_verified: closed && exited && processClosed && exitCode === 0 && identityCurrent && failure === null,
      preparation_aborted: preparationAborted,
      failure,
    });
    const clearReadiness = () => {
      clearTimeout(readyTimer);
      if (abortHandler !== undefined) options.signal?.removeEventListener("abort", abortHandler);
    };
    const failProtocol = (error = new ProcessContainmentError(
      "process_containment_failed",
      status(),
      "macOS exclusive-UID controller failed",
    )) => {
      if (failure === null) failure = error.classification ?? "process_containment_failed";
      clearReadiness();
      try { controller?.stdin?.end("CLOSE\n"); } catch { /* watchdog signal cleanup remains available */ }
      try { controller?.kill(); } catch { /* best effort after failed readiness */ }
      if (!ready && !readinessSettled) {
        readinessSettled = true;
        reject(error);
      }
    };
    const maybeResolveClose = () => {
      if (!closeState.requested || !exited || !processClosed) return;
      closeState.resolve?.(closed && exitCode === 0 && failure === null);
    };
    const onLine = (line) => {
      const readyMatch = /^READY:1:([1-9][0-9]*):([1-9][0-9]*):([0-9]+):([0-9]+):([1-9][0-9]*):([0-9]+):([0-9]+):([1-9][0-9]*)$/u.exec(line);
      if (readyMatch !== null && !ready && failure === null) {
        const values = readyMatch.slice(1).map((entry) => Number(entry));
        const [workloadUid, workerPid, workerSeconds, workerMicroseconds,
          controllerPid, controllerSeconds, controllerMicroseconds, ancestorCount] = values;
        if (workloadUid !== mechanism.workload_uid || workerPid !== worker.pid || controllerPid !== controller.pid
          || !values.every(Number.isSafeInteger) || workerSeconds < 0 || controllerSeconds < 0
          || workerMicroseconds < 0 || workerMicroseconds > 999999
          || controllerMicroseconds < 0 || controllerMicroseconds > 999999
          || ancestorCount < 1 || ancestorCount > 64) {
          failProtocol(new ProcessContainmentError(
            "process_containment_failed",
            status(),
            "macOS exclusive-UID readiness identity is invalid",
          ));
          return;
        }
        identity = Object.freeze({
          schema_version: 1,
          support_state: "verified",
          kind: MACOS_EXCLUSIVE_UID_KIND,
          scope_id: uniqueScope,
          worker_pid: workerPid,
          controller_pid: controllerPid,
          workload_uid: workloadUid,
          worker_start_identity: Object.freeze({ seconds: workerSeconds, microseconds: workerMicroseconds }),
          controller_start_identity: Object.freeze({ seconds: controllerSeconds, microseconds: controllerMicroseconds }),
          preserved_ancestor_count: ancestorCount,
          controller_executable: mechanism.controller_executable,
          controller_protocol_version: mechanism.controller_protocol_version,
          controller_protocol_fingerprint: mechanism.controller_protocol_fingerprint,
        });
        identityFingerprint = fingerprint(identity);
        ready = true;
        readinessSettled = true;
        clearReadiness();
        const terminateAndVerify = (confirmationMs) => {
          if (closePromise !== null) return closePromise;
          closeState.requested = true;
          try {
            const currentController = options.macosControllerIdentity
              ?? macosControllerIdentity(mechanism.controller_executable.canonical_path);
            const currentUid = options.currentUid ?? process.getuid?.();
            identityCurrent = sameIdentity(currentController, mechanism.controller_executable)
              && currentUid === mechanism.workload_uid;
            if (!identityCurrent) failure = "macos_uid_controller_identity_drift";
          } catch {
            identityCurrent = false;
            failure = "macos_uid_controller_identity_unavailable";
          }
          if (exited) {
            closePromise = Promise.resolve(false);
            return closePromise;
          }
          closePromise = waitForControllerClose(
            controller,
            closeState,
            Math.max(confirmationMs, MACOS_CONTROLLER_CLOSE_TIMEOUT_MS),
          ).then((closedVerified) => {
            if (!closedVerified && failure === null) failure = "macos_uid_teardown_unverified";
            return closedVerified && identityCurrent && failure === null;
          });
          return closePromise;
        };
        resolve(Object.freeze({
          support_state: "verified",
          kind: MACOS_EXCLUSIVE_UID_KIND,
          scope_id: uniqueScope,
          identity,
          fingerprint: identityFingerprint,
          status,
          terminateAndVerify,
          close: terminateAndVerify,
        }));
        return;
      }
      const closedMatch = /^CLOSED:1:([1-9][0-9]*):0$/u.exec(line);
      if (closedMatch !== null && ready && closeState.requested && !closed && failure === null) {
        closed = true;
        maybeResolveClose();
      } else if (line.startsWith("ERROR:")) {
        const reason = line.slice("ERROR:".length) || "macos_uid_controller_error";
        failProtocol(new ProcessContainmentError(
          "process_containment_failed",
          Object.freeze({ ...status(), reason }),
          reason,
        ));
      } else if (line.length > 0) {
        failProtocol(new ProcessContainmentError(
          "process_containment_failed",
          status(),
          "unexpected macOS exclusive-UID controller output",
        ));
      }
    };

    abortHandler = () => { preparationAborted = true; };
    if (options.signal?.aborted) abortHandler();
    options.signal?.addEventListener("abort", abortHandler, { once: true });

    try {
      const spawnController = options.spawnMacosController ?? spawn;
      controller = spawnController(mechanism.controller_executable.canonical_path, [
        "watch", String(worker.pid), String(process.pid), String(MACOS_CONTROLLER_TEARDOWN_TIMEOUT_MS),
      ], {
        windowsHide: true,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        env: Object.hasOwn(options, "env") ? options.env : process.env,
      });
    } catch {
      failProtocol();
      return;
    }
    controller.stdout.setEncoding("utf8");
    controller.stderr.setEncoding("utf8");
    controller.stderr.on("data", (chunk) => {
      const text = String(chunk);
      if (stderr.length < MAX_CONTROLLER_BYTES) {
        stderr += text.slice(0, MAX_CONTROLLER_BYTES - stderr.length);
      }
      if (text.length > 0) {
        failProtocol(new ProcessContainmentError(
          "process_containment_failed",
          status(),
          "unexpected macOS exclusive-UID controller stderr",
        ));
      }
    });
    controller.stdout.on("data", (chunk) => {
      const text = String(chunk);
      if (text.length > MAX_CONTROLLER_BYTES - buffer.length) {
        buffer = "";
        failProtocol(new ProcessContainmentError(
          "process_containment_failed",
          status(),
          "macOS exclusive-UID controller output exceeded its protocol bound",
        ));
        return;
      }
      buffer += text;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/u, "");
        buffer = buffer.slice(newline + 1);
        onLine(line);
      }
    });
    controller.once("error", () => failProtocol());
    controller.once("exit", (code) => {
      exited = true;
      exitCode = code;
    });
    controller.once("close", (code) => {
      processClosed = true;
      if (!exited) {
        exited = true;
        exitCode = code;
      }
      if (buffer.trim().length > 0) {
        failProtocol(new ProcessContainmentError(
          "process_containment_failed",
          status(),
          "macOS exclusive-UID controller output was truncated",
        ));
      } else if (!ready) {
        failProtocol(new ProcessContainmentError(
          "process_containment_failed",
          status(),
          stderr.trim().length > 0 ? stderr.trim() : "macOS exclusive-UID controller exited before readiness",
        ));
      } else if (!closeState.requested || !closed || exitCode !== 0) {
        failProtocol(new ProcessContainmentError(
          "process_containment_failed",
          status(),
          "macOS exclusive-UID controller exited outside the successful close protocol",
        ));
      }
      maybeResolveClose();
    });
    readyTimer = setTimeout(
      () => failProtocol(new ProcessContainmentError(
        "process_containment_failed",
        status(),
        "macOS exclusive-UID controller readiness timed out",
      )),
      Math.max(timeoutMs, MACOS_CONTROLLER_READY_TIMEOUT_MS),
    );
  });
}

function linuxContainmentReason(error, fallback) {
  return Object.freeze({
    LINUX_CGROUP_COORDINATOR_INSIDE_ROOT: "coordinator_inside_delegated_root",
    LINUX_CGROUP_CONTROLLER_INSIDE_ROOT: "controller_inside_delegated_root",
    LINUX_CGROUP_GUARD_UNAVAILABLE: "delegated_root_guard_unavailable",
    LINUX_CGROUP_GUARD_WRITABLE: "delegated_root_guard_writable",
    LINUX_CGROUP_ATTACH_FAILED: "delegated_root_attach_failed",
    LINUX_CGROUP_ATTACH_HELPER_DRIFT: "delegated_root_attach_helper_drift",
    LINUX_CGROUP_ATTACH_HELPER_OVERPRIVILEGED: "delegated_root_attach_helper_overprivileged",
    LINUX_CGROUP_ATTACH_HELPER_UNAVAILABLE: "delegated_root_attach_helper_unavailable",
    LINUX_CGROUP_ROOT_IDENTITY_DRIFT: "delegated_root_identity_drift",
    LINUX_CGROUP_ROOT_NOT_EXCLUSIVE: "delegated_root_not_exclusive",
  })[error?.code] ?? fallback;
}

async function bestEffortLinuxRootCleanup(controller, rootInfo, leased, confirmationMs, delay) {
  if (!leased || rootInfo === null) return false;
  try { controller.kill(rootInfo); } catch { return false; }
  const deadline = Date.now() + confirmationMs;
  try {
    while (controller.populated(rootInfo) && Date.now() < deadline) await delay(10);
    if (controller.populated(rootInfo)) return false;
    controller.removeDescendants(rootInfo);
    return controller.exists(rootInfo)
      && controller.populated(rootInfo) === false
      && controller.members(rootInfo).length === 0
      && controller.descendants(rootInfo).length === 0;
  } catch {
    return false;
  }
}

async function terminateLinuxCgroupRoot(
  controller,
  rootInfo,
  leafInfo,
  outsideProcesses,
  confirmationMs,
  delay,
) {
  let verificationFailure = null;
  try {
    const current = controller.revalidate(rootInfo, leafInfo, outsideProcesses);
    if (!sameIdentity(current.root_identity, rootInfo.identity)
      || !sameIdentity(current.guard_identity, rootInfo.guard_identity)
      || !sameIdentity(current.leaf_identity, leafInfo.identity)) {
      throw new Error("cgroup identity drifted before teardown");
    }
  } catch (error) {
    verificationFailure = error;
  }

  // The root was proven exclusive before the worker was attached. Cleanup is
  // therefore still mandatory when identity revalidation fails; the drift is
  // retained and prevents this cleanup attempt from becoming verified proof.
  controller.kill(rootInfo);
  const deadline = Date.now() + confirmationMs;
  while (controller.populated(rootInfo) && Date.now() < deadline) await delay(10);
  if (controller.populated(rootInfo)) throw new Error("delegated root remained populated after cgroup.kill");
  controller.removeDescendants(rootInfo);
  const currentRoot = controller.validateRoot(rootInfo.root);
  if (!controller.exists(rootInfo)
    || !sameIdentity(currentRoot.identity, rootInfo.identity)
    || !sameIdentity(currentRoot.guard_identity, rootInfo.guard_identity)
    || controller.populated(rootInfo)
    || controller.members(rootInfo).length !== 0
    || controller.descendants(rootInfo).length !== 0) {
    throw new Error("delegated root cleanup was not confirmed");
  }
  if (verificationFailure !== null) throw verificationFailure;
}

async function createInjectedLinuxCgroupContainment(worker, timeoutMs, options) {
  const controller = options.linuxController ?? createNodeLinuxController();
  const root = rootFromOptions(options);
  if (root === null) {
    const state = descriptor({ supportState: "unavailable", kind: LINUX_CGROUP_KIND, reason: "delegated_root_missing" });
    throw new ProcessContainmentError("process_containment_unavailable", state);
  }
  let rootInfo;
  try { rootInfo = controller.validateRoot(root); } catch (error) {
    const state = descriptor({
      supportState: "unavailable",
      kind: LINUX_CGROUP_KIND,
      reason: linuxContainmentReason(error, "delegated_root_unavailable"),
    });
    throw new ProcessContainmentError("process_containment_unavailable", state, error.message);
  }
  const uniqueScope = scopeId("linux-cgroup", options.scopeIdFactory);
  const delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let leafInfo = null;
  let attachHelper = null;
  let leased = false;
  try {
    if (options.signal?.aborted) throw new ProcessContainmentError(
      "process_containment_aborted",
      descriptor({ supportState: "verified", kind: LINUX_CGROUP_KIND, scopeId: uniqueScope }),
    );
    controller.assertExclusiveRoot(rootInfo, [
      Object.freeze({ label: "coordinator", pid: process.pid }),
      Object.freeze({ label: "idle_worker", pid: worker.pid }),
    ]);
    leafInfo = controller.createLeaf(rootInfo, uniqueScope);
    leased = true;
    attachHelper = controller.attach(leafInfo, worker.pid, {
      mode: options.linuxController === undefined ? linuxAttachModeFromOptions(options) : "injected",
      helperPath: options.linuxController === undefined ? linuxAttachHelperPathFromOptions(options) : null,
    }) ?? null;
    controller.assertInitialBoundary(rootInfo, leafInfo, worker.pid, [
      Object.freeze({ label: "coordinator", pid: process.pid }),
    ]);
  } catch (error) {
    await bestEffortLinuxRootCleanup(controller, rootInfo, leased, timeoutMs, delay);
    if (error instanceof ProcessContainmentError) throw error;
    throw new ProcessContainmentError(
      "process_containment_failed",
      descriptor({
        supportState: "unavailable",
        kind: LINUX_CGROUP_KIND,
        scopeId: uniqueScope,
        reason: linuxContainmentReason(error, "attach_failed"),
      }),
      error.message,
    );
  }
  const identity = Object.freeze({
    schema_version: 1,
    support_state: "verified",
    kind: LINUX_CGROUP_KIND,
    scope_id: uniqueScope,
    worker_pid: worker.pid,
    delegated_root_identity: rootInfo.identity,
    current_parent_identity: rootInfo.guard_identity,
    guard_identity: rootInfo.guard_identity,
    leaf_identity: leafInfo.identity,
    mount_point: rootInfo.mount_point ?? null,
    attach_helper: attachHelper,
  });
  const identityFingerprint = fingerprint(identity);
  let closed = false;
  let teardownVerified = false;
  let failure = null;
  let closePromise = null;
  const status = () => Object.freeze({
    support_state: "verified",
    kind: LINUX_CGROUP_KIND,
    scope_id: uniqueScope,
    identity_fingerprint: identityFingerprint,
    attached: true,
    closed,
    teardown_verified: teardownVerified,
    failure,
  });
  const terminateAndVerify = (confirmationMs) => {
    if (closePromise !== null) return closePromise;
    closePromise = (async () => {
      try {
        await terminateLinuxCgroupRoot(
          controller,
          rootInfo,
          leafInfo,
          [Object.freeze({ label: "coordinator", pid: process.pid })],
          confirmationMs,
          delay,
        );
        closed = true;
        teardownVerified = true;
        return true;
      } catch (error) {
        failure = error.message;
        return false;
      }
    })();
    return closePromise;
  };
  return Object.freeze({
    support_state: "verified",
    kind: LINUX_CGROUP_KIND,
    scope_id: uniqueScope,
    identity,
    fingerprint: identityFingerprint,
    status,
    terminateAndVerify,
    close: terminateAndVerify,
  });
}

function decodeLinuxWatchdogConfiguration(encoded) {
  if (typeof encoded !== "string" || encoded.length === 0 || encoded.length > 16_384) {
    throw new Error("linux watchdog configuration is invalid");
  }
  const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  assertPlainObject(value, "linux watchdog configuration");
  const expectedKeys = [
    "attach_helper", "attach_mode", "confirmation_ms", "coordinator_pid", "root", "scope_id", "worker_pid",
  ];
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error("linux watchdog configuration has unsupported fields");
  }
  assertCanonicalAbsolutePath(value.root, "linux watchdog root");
  assertCanonicalAbsolutePath(value.attach_helper, "linux watchdog attach helper");
  if (value.attach_mode !== LINUX_ATTACH_MODE
    || !SAFE_SCOPE.test(value.scope_id)
    || !Number.isInteger(value.worker_pid) || value.worker_pid <= 0
    || !Number.isInteger(value.coordinator_pid) || value.coordinator_pid <= 0
    || !Number.isSafeInteger(value.confirmation_ms) || value.confirmation_ms < 1 || value.confirmation_ms > 60_000) {
    throw new Error("linux watchdog configuration values are invalid");
  }
  return Object.freeze(value);
}

export async function runLinuxCgroupWatchdogProcess(encoded) {
  let configuration;
  let controller;
  let rootInfo = null;
  let leafInfo = null;
  let leased = false;
  let ready = false;
  let input = "";
  let closeRequested = false;
  let cleanupPromise = null;
  let lifecycleResolve;
  let finished = false;
  const lifecycle = new Promise((resolve) => { lifecycleResolve = resolve; });
  const finish = (code, line = null) => {
    if (finished) return;
    finished = true;
    process.exitCode = code;
    if (line === null || !process.stdout.writable) {
      lifecycleResolve();
      return;
    }
    const done = () => lifecycleResolve();
    process.stdout.once("error", done);
    process.stdout.write(`${line}\n`, done);
  };
  const cleanup = (explicit, protocolFailure = false) => {
    if (cleanupPromise !== null) return cleanupPromise;
    cleanupPromise = (async () => {
      try {
        if (leased && leafInfo !== null) {
          await terminateLinuxCgroupRoot(
            controller,
            rootInfo,
            leafInfo,
            [
              Object.freeze({ label: "watchdog", pid: process.pid }),
              Object.freeze({ label: "coordinator", pid: configuration.coordinator_pid }),
            ],
            configuration.confirmation_ms,
            (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
          );
        }
        finish(protocolFailure ? 1 : 0, explicit && !protocolFailure ? "CLOSED" : null);
      } catch {
        finish(1, explicit ? "ERROR:linux_watchdog_cleanup_failed" : null);
      }
    })();
    return cleanupPromise;
  };

  try {
    configuration = decodeLinuxWatchdogConfiguration(encoded);
    controller = createNodeLinuxController();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      if (finished || closeRequested) return;
      const text = String(chunk);
      if (text.length > 64 - input.length) {
        closeRequested = true;
        void cleanup(false, true);
        return;
      }
      input += text;
      if (input === "CLOSE\n") {
        closeRequested = true;
        void cleanup(true, false);
      } else if (input.includes("\n")) {
        closeRequested = true;
        void cleanup(false, true);
      }
    });
    process.stdin.once("end", () => {
      if (!closeRequested) void cleanup(false, input.length > 0);
    });
    process.stdin.once("error", () => {
      if (!closeRequested) void cleanup(false, true);
    });
    process.stdin.resume();

    rootInfo = controller.validateRoot(configuration.root);
    controller.assertExclusiveRoot(rootInfo, [
      Object.freeze({ label: "watchdog", pid: process.pid }),
      Object.freeze({ label: "coordinator", pid: configuration.coordinator_pid }),
      Object.freeze({ label: "idle_worker", pid: configuration.worker_pid }),
    ]);
    leafInfo = controller.createLeaf(rootInfo, configuration.scope_id);
    leased = true;
    controller.attach(leafInfo, configuration.worker_pid, {
      mode: configuration.attach_mode,
      helperPath: configuration.attach_helper,
    });
    const current = controller.assertInitialBoundary(rootInfo, leafInfo, configuration.worker_pid, [
      Object.freeze({ label: "watchdog", pid: process.pid }),
      Object.freeze({ label: "coordinator", pid: configuration.coordinator_pid }),
    ]);
    if (!sameIdentity(current.root.identity, rootInfo.identity)
      || !sameIdentity(current.root.guard_identity, rootInfo.guard_identity)
      || !sameIdentity(current.leaf.identity, leafInfo.identity)) {
      throw new Error("linux watchdog setup identity drifted");
    }
    ready = true;
    process.stdout.write("READY\n");
  } catch {
    if (controller !== undefined && configuration !== undefined) {
      await bestEffortLinuxRootCleanup(
        controller,
        rootInfo,
        leased,
        configuration.confirmation_ms,
        (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
      );
    }
    finish(1, "ERROR:linux_watchdog_setup_failed");
  }
  if (!ready && cleanupPromise === null && !finished) finish(1, "ERROR:linux_watchdog_setup_failed");
  await lifecycle;
}

function createLinuxWatchdogContainment(worker, timeoutMs, options) {
  return new Promise((resolve, reject) => {
    const controller = options.linuxController ?? createNodeLinuxController();
    const root = rootFromOptions(options);
    if (root === null) {
      reject(new ProcessContainmentError(
        "process_containment_unavailable",
        descriptor({ supportState: "unavailable", kind: LINUX_CGROUP_KIND, reason: "delegated_root_missing" }),
      ));
      return;
    }
    let rootInfo;
    let attachHelper;
    try {
      rootInfo = controller.validateRoot(root);
      attachHelper = options.linuxController === undefined
        ? linuxAttachHelperForOptions(options, rootInfo)
        : Object.freeze({ mode: "injected" });
    } catch (error) {
      reject(new ProcessContainmentError(
        "process_containment_unavailable",
        descriptor({
          supportState: "unavailable",
          kind: LINUX_CGROUP_KIND,
          reason: linuxContainmentReason(error, "delegated_root_unavailable"),
        }),
        error.message,
      ));
      return;
    }
    try {
      controller.assertExclusiveRoot(rootInfo, [
        Object.freeze({ label: "coordinator", pid: process.pid }),
        Object.freeze({ label: "idle_worker", pid: worker.pid }),
      ]);
    } catch (error) {
      reject(new ProcessContainmentError(
        "process_containment_failed",
        descriptor({
          supportState: "unavailable",
          kind: LINUX_CGROUP_KIND,
          reason: linuxContainmentReason(error, "delegated_root_not_exclusive"),
        }),
        error.message,
      ));
      return;
    }
    const uniqueScope = scopeId("linux-cgroup", options.scopeIdFactory);
    const nodeIdentity = options.linuxNodeIdentity ?? fileIdentity(process.execPath);
    const moduleIdentity = options.linuxModuleIdentity ?? fileIdentity(LINUX_CONTROLLER_MODULE);
    const sourceFingerprint = fingerprint(LINUX_CGROUP_WATCHDOG_SOURCE);
    const encodedConfiguration = Buffer.from(canonicalJson({
      attach_helper: options.linuxController === undefined
        ? attachHelper.executable.canonical_path
        : process.execPath,
      attach_mode: options.linuxController === undefined ? attachHelper.mode : LINUX_ATTACH_MODE,
      confirmation_ms: Math.max(1, Math.min(60_000, timeoutMs)),
      coordinator_pid: process.pid,
      root,
      scope_id: uniqueScope,
      worker_pid: worker.pid,
    })).toString("base64url");
    let watchdog;
    let ready = false;
    let closed = false;
    let exited = false;
    let processClosed = false;
    let exitCode = null;
    let buffer = "";
    let stderr = "";
    let failure = null;
    let readinessSettled = false;
    let closeRequested = false;
    let teardownVerified = false;
    let leafInfo = null;
    let closePromise = null;
    let preReadyShutdownPromise = null;
    let readyTimer;
    let processCloseResolve;
    const processClosePromise = new Promise((resolveProcessClose) => { processCloseResolve = resolveProcessClose; });
    let identity = null;
    let identityFingerprint = null;
    const status = () => Object.freeze({
      support_state: "verified",
      kind: LINUX_CGROUP_KIND,
      scope_id: uniqueScope,
      identity_fingerprint: identityFingerprint,
      attached: ready,
      closed,
      watchdog_exited: exited,
      watchdog_streams_closed: processClosed,
      watchdog_exit_code: exitCode,
      teardown_verified: teardownVerified,
      failure,
    });
    const failProtocol = (message = "linux_cgroup_watchdog_protocol_failed") => {
      if (failure === null) failure = message;
      clearTimeout(readyTimer);
      if (!ready && !readinessSettled) {
        readinessSettled = true;
        const error = new ProcessContainmentError("process_containment_failed", status(), message);
        preReadyShutdownPromise ??= shutdownPreReadyWatchdog().finally(() => reject(error));
      } else if (ready) {
        try { watchdog?.stdin?.end(); } catch { /* explicit teardown remains authoritative */ }
      }
    };
    const cleanupPreReadyBoundary = async (confirmationMs) => {
      let discoveredLeaf;
      try {
        discoveredLeaf = controller.inspectLeaf(rootInfo, uniqueScope);
        const current = controller.revalidate(rootInfo, discoveredLeaf, [
          Object.freeze({ label: "coordinator", pid: process.pid }),
        ]);
        if (!sameIdentity(current.root_identity, rootInfo.identity)
          || !sameIdentity(current.guard_identity, rootInfo.guard_identity)) {
          return;
        }
      } catch {
        return;
      }
      // The root and its host-owned guard were proven stable and the
      // coordinator remains outside. The fixed leaf is therefore still our
      // leased boundary even when the watchdog died before attaching the idle
      // worker or completing the full READY proof. Cleanup is mandatory, but
      // the rejected setup never becomes verified evidence.
      await bestEffortLinuxRootCleanup(
        controller,
        rootInfo,
        true,
        confirmationMs,
        options.delay ?? ((milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))),
      );
    };
    const shutdownPreReadyWatchdog = async () => {
      const confirmationMs = Math.max(1, Math.min(2_000, timeoutMs));
      try { watchdog?.stdin?.end(); } catch { /* bounded kill below is authoritative */ }
      let didClose = await Promise.race([
        processClosePromise.then(() => true),
        new Promise((resolveWait) => setTimeout(() => resolveWait(false), confirmationMs)),
      ]);
      if (!didClose) {
        try { watchdog?.kill(); } catch { /* parent-side cgroup cleanup remains authoritative */ }
        didClose = await Promise.race([
          processClosePromise.then(() => true),
          new Promise((resolveWait) => setTimeout(() => resolveWait(false), confirmationMs)),
        ]);
      }
      await cleanupPreReadyBoundary(confirmationMs);
      if (!didClose) {
        try { watchdog?.stdin?.destroy?.(); } catch { /* best effort before unref */ }
        try { watchdog?.stdout?.destroy?.(); } catch { /* best effort before unref */ }
        try { watchdog?.stderr?.destroy?.(); } catch { /* best effort before unref */ }
        try { watchdog?.unref?.(); } catch { /* the rejected setup remains fail-closed */ }
      }
    };
    const terminateAndVerify = (confirmationMs) => {
      if (closePromise !== null) return closePromise;
      closeRequested = true;
      closePromise = (async () => {
        try {
          const currentNode = options.linuxNodeIdentity ?? fileIdentity(nodeIdentity.canonical_path);
          const currentModule = options.linuxModuleIdentity ?? fileIdentity(moduleIdentity.canonical_path);
          const current = controller.revalidate(rootInfo, leafInfo, [
            Object.freeze({ label: "coordinator", pid: process.pid }),
            Object.freeze({ label: "watchdog", pid: watchdog.pid }),
          ]);
          if (!sameIdentity(currentNode, nodeIdentity)
            || !sameIdentity(currentModule, moduleIdentity)
            || !sameIdentity(current.root_identity, rootInfo.identity)
            || !sameIdentity(current.guard_identity, rootInfo.guard_identity)
            || !sameIdentity(current.leaf_identity, leafInfo.identity)) {
            failure = "linux_cgroup_watchdog_identity_drift";
          }
        } catch {
          failure = "linux_cgroup_watchdog_identity_unavailable";
        }
        try { watchdog.stdin.end("CLOSE\n"); } catch {
          if (failure === null) failure = "linux_cgroup_watchdog_close_failed";
        }
        const didClose = await Promise.race([
          processClosePromise.then(() => true),
          new Promise((resolveWait) => setTimeout(() => resolveWait(false), confirmationMs)),
        ]);
        if (!didClose) {
          if (failure === null) failure = "linux_cgroup_watchdog_close_timeout";
          try { watchdog.kill(); } catch { /* direct cleanup below remains fail-closed */ }
        }
        const rootIsClean = () => {
          try {
            return controller.exists(rootInfo)
              && !controller.populated(rootInfo)
              && controller.members(rootInfo).length === 0
              && controller.descendants(rootInfo).length === 0;
          } catch {
            return false;
          }
        };
        let rootClean = rootIsClean();
        const protocolSucceeded = didClose && closed && exited && processClosed && exitCode === 0 && failure === null;
        if (!protocolSucceeded || !rootClean) {
          if (failure === null) failure = "linux_cgroup_watchdog_root_not_clean";
          await bestEffortLinuxRootCleanup(
            controller,
            rootInfo,
            leafInfo !== null,
            confirmationMs,
            options.delay ?? ((milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))),
          );
          rootClean = rootIsClean();
        }
        teardownVerified = protocolSucceeded && rootClean;
        return teardownVerified;
      })();
      return closePromise;
    };
    const onLine = (line) => {
      if (line === "READY" && !ready && failure === null) {
        try {
          leafInfo = controller.inspectLeaf(rootInfo, uniqueScope);
          controller.assertInitialBoundary(rootInfo, leafInfo, worker.pid, [
            Object.freeze({ label: "coordinator", pid: process.pid }),
            Object.freeze({ label: "watchdog", pid: watchdog.pid }),
          ]);
          identity = Object.freeze({
            schema_version: 1,
            support_state: "verified",
            kind: LINUX_CGROUP_KIND,
            scope_id: uniqueScope,
            worker_pid: worker.pid,
            watchdog_pid: watchdog.pid,
            delegated_root_identity: rootInfo.identity,
            current_parent_identity: rootInfo.guard_identity,
            guard_identity: rootInfo.guard_identity,
            leaf_identity: leafInfo.identity,
            mount_point: rootInfo.mount_point ?? null,
            controller_executable: nodeIdentity,
            controller_module: moduleIdentity,
            controller_source_fingerprint: sourceFingerprint,
            attach_helper: attachHelper,
          });
          identityFingerprint = fingerprint(identity);
        } catch {
          failProtocol("linux_cgroup_watchdog_readiness_invalid");
          return;
        }
        ready = true;
        readinessSettled = true;
        clearTimeout(readyTimer);
        resolve(Object.freeze({
          support_state: "verified",
          kind: LINUX_CGROUP_KIND,
          scope_id: uniqueScope,
          identity,
          fingerprint: identityFingerprint,
          status,
          terminateAndVerify,
          close: terminateAndVerify,
        }));
      } else if (line === "CLOSED" && ready && closeRequested && !closed && failure === null) {
        closed = true;
      } else if (line.startsWith("ERROR:")) {
        failProtocol(line.slice("ERROR:".length) || "linux_cgroup_watchdog_error");
      } else if (line.length > 0) {
        failProtocol("linux_cgroup_watchdog_output_invalid");
      }
    };
    try {
      const spawnWatchdog = options.spawnLinuxWatchdog ?? spawn;
      watchdog = spawnWatchdog(nodeIdentity.canonical_path, [
        "--input-type=module", "--eval", LINUX_CGROUP_WATCHDOG_SOURCE,
      ], {
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { OC_LINUX_CGROUP_WATCHDOG_CONFIG: encodedConfiguration },
      });
    } catch {
      failProtocol("linux_cgroup_watchdog_spawn_failed");
      return;
    }
    watchdog.stdout.setEncoding("utf8");
    watchdog.stderr.setEncoding("utf8");
    watchdog.stderr.on("data", (chunk) => {
      const text = String(chunk);
      if (stderr.length < MAX_CONTROLLER_BYTES) stderr += text.slice(0, MAX_CONTROLLER_BYTES - stderr.length);
      if (text.length > 0) failProtocol("linux_cgroup_watchdog_stderr");
    });
    watchdog.stdout.on("data", (chunk) => {
      const text = String(chunk);
      if (text.length > MAX_CONTROLLER_BYTES - buffer.length) {
        buffer = "";
        failProtocol("linux_cgroup_watchdog_output_unbounded");
        return;
      }
      buffer += text;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/u, "");
        buffer = buffer.slice(newline + 1);
        onLine(line);
      }
    });
    watchdog.once("error", () => failProtocol("linux_cgroup_watchdog_process_failed"));
    watchdog.once("exit", (code) => {
      exited = true;
      exitCode = code;
    });
    watchdog.once("close", (code) => {
      processClosed = true;
      if (!exited) {
        exited = true;
        exitCode = code;
      }
      processCloseResolve();
      if (!ready) {
        failProtocol(stderr.trim() || "linux_cgroup_watchdog_exited_before_ready");
      } else if (!closeRequested || !closed || exitCode !== 0) {
        failProtocol("linux_cgroup_watchdog_exit_invalid");
      }
    });
    readyTimer = setTimeout(() => failProtocol("linux_cgroup_watchdog_ready_timeout"), Math.max(timeoutMs, 10_000));
  });
}

function createLinuxCgroupContainment(worker, timeoutMs, options) {
  if (options.linuxController !== undefined && options.spawnLinuxWatchdog === undefined) {
    return createInjectedLinuxCgroupContainment(worker, timeoutMs, options);
  }
  return createLinuxWatchdogContainment(worker, timeoutMs, options);
}

export async function preparePlatformProcessContainment(worker, timeoutMs = 2000, options = {}) {
  if (!worker || !Number.isInteger(worker.pid) || worker.pid <= 0) {
    throw new ProcessContainmentError(
      "process_containment_failed",
      descriptor({ supportState: "unavailable", kind: OTHER_UNAVAILABLE_KIND, reason: "worker_pid_invalid" }),
    );
  }
  assertPlainObject(options, "process containment options");
  const platform = options.platform ?? process.platform;
  if (platform === "win32") return createWindowsJobContainment(worker, timeoutMs, options);
  if (platform === "linux") return createLinuxCgroupContainment(worker, timeoutMs, options);
  if (platform === "darwin") return createMacosExclusiveUidContainment(worker, timeoutMs, options);
  const classification = classifyProcessContainment({ ...options, platform });
  const errorClass = classification.support_state === "unsupported"
    ? "process_containment_unsupported"
    : "process_containment_unavailable";
  throw new ProcessContainmentError(errorClass, classification);
}
