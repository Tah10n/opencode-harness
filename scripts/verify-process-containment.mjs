import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  ProcessContainmentError,
  classifyProcessContainment,
  createNodeLinuxController,
  normalizeProcessContainmentOptions,
  preparePlatformProcessContainment,
} from "../lib/feedback/process-containment.mjs";
import {
  captureManagedCommandWorkingDirectoryIdentity,
  runManagedCommand,
} from "../lib/feedback/process-tree.mjs";
import { MILESTONE_DOD_DESCENDANT_SCENARIO_IDS } from "../lib/quality/milestone-dod.mjs";
import {
  sealMilestone2OperationalReport,
  writeMilestone2OperationalReportFromEnvironment,
} from "../lib/quality/milestone-operational-report.mjs";

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const canonicalTempBase = fs.realpathSync.native(os.tmpdir());
function temporaryDirectory(prefix) {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(canonicalTempBase, prefix)));
}
async function waitUntil(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await pause(25);
  }
  assert.fail(`timed out waiting for ${label}`);
}
const fakeRoot = path.join(canonicalTempBase, "opencode-quality-fake-cgroup");
const syncWorker = fileURLToPath(new URL("../lib/feedback/managed-command-sync-worker.mjs", import.meta.url));
const processTreeSource = fs.readFileSync(
  fileURLToPath(new URL("../lib/feedback/process-tree.mjs", import.meta.url)),
  "utf8",
);
const macosControllerSource = fs.readFileSync(
  fileURLToPath(new URL("../native/macos-exclusive-uid-controller.c", import.meta.url)),
  "utf8",
);
const macosMarkerValidation = macosControllerSource.indexOf("validate_uid_marker(marker_path, workload_uid)");
const macosLeaseAcquisition = macosControllerSource.indexOf("acquire_uid_lease(lease_path, workload_uid)");
const macosScopeCapture = macosControllerSource.indexOf("capture_scope(coordinator_pid, worker_pid, probe, &scope)");
const macosPreparation = macosControllerSource.indexOf("if (terminate_scope(", macosScopeCapture);
const macosReady = macosControllerSource.indexOf('"READY:%d:', macosPreparation);
const macosFinalTeardown = macosControllerSource.indexOf(
  "terminate_scope(&scope, timeout_milliseconds, false",
  macosReady,
);
assert(macosControllerSource.includes("#define CONTROLLER_PROTOCOL_VERSION 2")
  && macosControllerSource.includes("lease_matches_marker(marker_path, lease_path)")
  && macosControllerSource.includes("uid_preparation_timeout")
  && macosMarkerValidation >= 0
  && macosLeaseAcquisition > macosMarkerValidation
  && macosScopeCapture > macosLeaseAcquisition
  && macosPreparation > macosScopeCapture
  && macosReady > macosPreparation
  && macosFinalTeardown > macosReady,
"native macOS protocol must validate marker/lease, prepare the UID before READY, and tear down without preserving the worker");
const currentIdentityAssertion = processTreeSource.indexOf(
  "assertTrustedToolchainInvocationCurrent(input.expected_invocation);",
);
const commandBindingAssertion = processTreeSource.indexOf(
  "assertTrustedToolchainCommandBinding(input.expected_invocation, input.file, input.args);",
);
const inheritedCwdAssertion = processTreeSource.indexOf(
  "assertInheritedManagedCommandWorkingDirectoryIdentityCurrent(",
  commandBindingAssertion,
);
const containedSpawn = processTreeSource.indexOf("commandChild = spawn(input.file, input.args", inheritedCwdAssertion);
const containedSpawnEnd = processTreeSource.indexOf('send({ type: "spawned"', containedSpawn);
assert(currentIdentityAssertion >= 0
  && commandBindingAssertion > currentIdentityAssertion
  && inheritedCwdAssertion > commandBindingAssertion
  && containedSpawn > inheritedCwdAssertion
  && containedSpawn - inheritedCwdAssertion < 500,
"contained worker must bind toolchain identity, then inherited cwd identity, immediately before spawn");
assert(containedSpawnEnd > containedSpawn
  && !processTreeSource.slice(containedSpawn, containedSpawnEnd).includes("cwd: input.cwd"),
"contained command must inherit the worker's already-open cwd without resolving input.cwd again");
const defaultCommandFactory = processTreeSource.indexOf("function defaultCommandProcessFactory(input)");
const defaultFactoryCwdCheck = processTreeSource.indexOf(
  "assertManagedCommandWorkingDirectoryIdentityCurrent(",
  defaultCommandFactory,
);
const defaultFactorySpawn = processTreeSource.indexOf("return spawn(process.execPath", defaultFactoryCwdCheck);
const defaultFactoryCwdOpen = processTreeSource.indexOf("cwd: input.cwd", defaultFactorySpawn);
assert(defaultCommandFactory >= 0
  && defaultFactoryCwdCheck > defaultCommandFactory
  && defaultFactorySpawn > defaultFactoryCwdCheck
  && defaultFactoryCwdOpen > defaultFactorySpawn,
"managed worker must open only the freshly revalidated cwd before containment setup");

function fakeIdentity(candidate, inode) {
  return Object.freeze({
    canonical_path: candidate,
    device: "1",
    inode: String(inode),
    mode: "16832",
    uid: "1000",
    modified_ns: "1",
    changed_ns: "1",
  });
}

function createFakeLinuxController({
  attachFailure = false,
  coordinatorInside = false,
  drift = false,
  guardWritable = false,
  killFailure = false,
  nonexclusive = false,
  postKillInspectionFailure = false,
  remainPopulated = false,
  removeFailure = false,
} = {}) {
  const events = [];
  const guard = path.dirname(fakeRoot);
  let populated = nonexclusive;
  let killCount = 0;
  let descendants = nonexclusive ? new Set([path.join(fakeRoot, "foreign")]) : new Set();
  const rootIdentity = fakeIdentity(fakeRoot, 10);
  const guardIdentity = fakeIdentity(guard, 20);
  const memberships = new Map();
  let leafIdentity;
  let leafPath;
  const controllerError = (code, message) => Object.assign(new Error(message), { code });
  const rootInfo = () => Object.freeze({
    root: fakeRoot,
    guard,
    mount_point: "/sys/fs/cgroup",
    mount_root: "/",
    identity: rootIdentity,
    guard_identity: guardIdentity,
  });
  const assertOutside = (processes) => {
    for (const entry of processes) {
      const membership = coordinatorInside && entry.label === "coordinator"
        ? fakeRoot
        : (memberships.get(entry.pid) ?? guard);
      if (membership === fakeRoot || membership.startsWith(`${fakeRoot}${path.sep}`)) {
        throw controllerError(
          entry.label === "coordinator"
            ? "LINUX_CGROUP_COORDINATOR_INSIDE_ROOT"
            : "LINUX_CGROUP_CONTROLLER_INSIDE_ROOT",
          `${entry.label} is inside the fake delegated root`,
        );
      }
    }
  };
  return {
    events,
    controller: Object.freeze({
      validateRoot(root) {
        events.push("validate-root");
        assert.equal(root, fakeRoot);
        if (guardWritable) throw controllerError("LINUX_CGROUP_GUARD_WRITABLE", "fake guard is writable");
        return rootInfo();
      },
      assertExclusiveRoot(_rootInfo, processes) {
        events.push(`assert-exclusive:${processes.length}`);
        assertOutside(processes);
        if (populated || descendants.size !== 0) {
          throw controllerError("LINUX_CGROUP_ROOT_NOT_EXCLUSIVE", "fake delegated root is not exclusive");
        }
        return Object.freeze({ root: rootInfo(), outside: Object.freeze([]) });
      },
      createLeaf(_rootInfo, scopeId) {
        events.push(`create:${scopeId}`);
        leafPath = path.join(fakeRoot, "opencode-quality-workload");
        if (descendants.has(leafPath)) {
          throw controllerError("LINUX_CGROUP_ROOT_NOT_EXCLUSIVE", "fake delegated root is already leased");
        }
        leafIdentity = fakeIdentity(leafPath, 11);
        descendants.add(leafPath);
        return Object.freeze({ leaf: leafPath, identity: leafIdentity });
      },
      inspectLeaf() {
        events.push("inspect-leaf");
        if (leafPath === undefined || !descendants.has(leafPath)) throw new Error("fake leaf unavailable");
        return Object.freeze({ leaf: leafPath, identity: leafIdentity });
      },
      attach(leafInfo, pid) {
        events.push(`attach:${pid}`);
        if (attachFailure) throw new Error("fake attach failure");
        memberships.set(pid, leafInfo.leaf);
        populated = true;
      },
      membership(_rootInfo, pid) {
        const cgroup = coordinatorInside && pid === process.pid ? fakeRoot : (memberships.get(pid) ?? guard);
        const identity = cgroup === guard ? guardIdentity : (cgroup === leafPath ? leafIdentity : rootIdentity);
        return Object.freeze({ membership: "/fake", cgroup, identity });
      },
      assertInitialBoundary(_rootInfo, currentLeaf, workerPid, outsideProcesses) {
        events.push("assert-initial");
        assertOutside(outsideProcesses);
        if (descendants.size !== 1 || !descendants.has(currentLeaf.leaf)
          || memberships.get(workerPid) !== currentLeaf.leaf || !populated) {
          throw controllerError("LINUX_CGROUP_ROOT_NOT_EXCLUSIVE", "fake initial boundary is not exclusive");
        }
        return Object.freeze({ root: rootInfo(), leaf: currentLeaf, outside: Object.freeze([]) });
      },
      revalidate(_rootInfo, _leafInfo, outsideProcesses = []) {
        events.push("revalidate");
        assertOutside(outsideProcesses);
        return Object.freeze({
          root_identity: rootIdentity,
          guard_identity: guardIdentity,
          leaf_identity: drift ? fakeIdentity(leafIdentity.canonical_path, 12) : leafIdentity,
        });
      },
      kill(info) {
        assert.equal(info.root, fakeRoot, "cleanup did not target the delegated root");
        events.push("kill-root");
        killCount += 1;
        if (killFailure) throw new Error("fake kill failure");
        if (!remainPopulated) {
          populated = false;
          memberships.clear();
        }
      },
      populated() {
        events.push("populated");
        if (postKillInspectionFailure && killCount > 0) throw new Error("fake post-kill inspection failure");
        return populated;
      },
      members(info) {
        if (info.root === fakeRoot) return Object.freeze([]);
        return Object.freeze([...memberships.entries()]
          .filter(([, cgroup]) => cgroup === info.leaf)
          .map(([pid]) => pid));
      },
      descendants() {
        return Object.freeze([...descendants]);
      },
      removeDescendants() {
        events.push("remove-descendants");
        if (removeFailure) throw new Error("fake remove failure");
        descendants = new Set();
      },
      exists(info) {
        return info.root === fakeRoot || descendants.has(info.leaf);
      },
    }),
    descendantsRemoved: () => descendants.size === 0,
    killCount: () => killCount,
    migrateWorkerToSibling(pid) {
      const sibling = path.join(fakeRoot, "project-created-sibling");
      descendants.add(sibling);
      memberships.set(pid, sibling);
      populated = true;
      events.push(`migrate:${pid}`);
      return sibling;
    },
    rootRetained: () => true,
  };
}

function fakeWindowsIdentity(inode = "1") {
  return Object.freeze({
    canonical_path: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    device: "1",
    inode,
    mode: "33279",
    size: "1",
    modified_ns: "1",
    changed_ns: "1",
  });
}

function createFakeWindowsController({
  initial = "READY\n",
  close = "success",
  exitOnStart = null,
  exitBeforeClosed = false,
} = {}) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  let exited = false;
  const controller = new EventEmitter();
  const emitExit = (code, betweenExitAndClose = null) => {
    if (exited) return;
    exited = true;
    queueMicrotask(() => {
      controller.emit("exit", code);
      queueMicrotask(() => {
        betweenExitAndClose?.();
        controller.emit("close", code, null);
      });
    });
  };
  controller.stdout = stdout;
  controller.stderr = stderr;
  controller.stdin = {
    end(value) {
      if (value === "CLOSE\n" && close === "success") {
        queueMicrotask(() => {
          if (exitBeforeClosed) emitExit(0, () => stdout.emit("data", "CLOSED\n"));
          else {
            stdout.emit("data", "CLOSED\n");
            emitExit(0);
          }
        });
      } else if (value === "CLOSE\n" && close === "error") {
        queueMicrotask(() => {
          stdout.emit("data", "ERROR:fake close failure\n");
          emitExit(1);
        });
      }
    },
  };
  controller.kill = () => {
    emitExit(1);
    return true;
  };
  queueMicrotask(() => {
    const chunks = Array.isArray(initial) ? initial : [initial];
    for (const chunk of chunks) {
      if (chunk.length > 0) stdout.emit("data", chunk);
    }
    if (exitOnStart !== null) emitExit(exitOnStart);
  });
  return controller;
}

function fakeMacosControllerIdentity(candidate, inode = "1") {
  return Object.freeze({
    canonical_path: candidate,
    device: "1",
    inode,
    mode: "33005",
    size: "1",
    modified_ns: "1",
    changed_ns: "1",
    owner_uid: "0",
    owner_gid: "0",
    links: "1",
  });
}

function createFakeMacosController({
  workerPid = 4242,
  controllerPid = 6262,
  workloadUid = 501,
  initial,
  close = "success",
  exitOnStart = null,
  exitBeforeClosed = false,
} = {}) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  let exited = false;
  const controller = new EventEmitter();
  const emitExit = (code, betweenExitAndClose = null) => {
    if (exited) return;
    exited = true;
    queueMicrotask(() => {
      controller.emit("exit", code);
      queueMicrotask(() => {
        betweenExitAndClose?.();
        controller.emit("close", code, null);
      });
    });
  };
  controller.pid = controllerPid;
  controller.stdout = stdout;
  controller.stderr = stderr;
  controller.stdin = {
    end(value) {
      if (exited) return;
      if (value === "CLOSE\n" && close === "success") {
        queueMicrotask(() => {
          const emitClosed = () => stdout.emit("data", "CLOSED:2:4:0\n");
          if (exitBeforeClosed) emitExit(0, emitClosed);
          else {
            emitClosed();
            emitExit(0);
          }
        });
      } else if (value === "CLOSE\n" && close === "error") {
        queueMicrotask(() => {
          stdout.emit("data", "ERROR:uid_teardown_failed\n");
          emitExit(1);
        });
      }
    },
  };
  controller.kill = () => {
    emitExit(1);
    return true;
  };
  queueMicrotask(() => {
    const ready = initial ?? `READY:2:${workloadUid}:${workerPid}:10:20:${controllerPid}:30:40:2:3\n`;
    const chunks = Array.isArray(ready) ? ready : [ready];
    for (const chunk of chunks) {
      if (chunk.length > 0) stdout.emit("data", chunk);
    }
    if (exitOnStart !== null) emitExit(exitOnStart);
  });
  return controller;
}

function createFakeLinuxWatchdog(fake, {
  initial = "READY\n",
  close = "success",
  exitOnStart = null,
  pid = 6262,
  scopeId = "linux-watchdog-protocol",
  workerPid = 4242,
  exitBeforeClosed = false,
  ignoreStdin = false,
  attachWorker = true,
} = {}) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  const watchdog = new EventEmitter();
  let exited = false;
  let cleaned = false;
  const rootInfo = fake.controller.validateRoot(fakeRoot);
  fake.controller.assertExclusiveRoot(rootInfo, [
    Object.freeze({ label: "watchdog", pid }),
    Object.freeze({ label: "coordinator", pid: process.pid }),
    Object.freeze({ label: "idle_worker", pid: workerPid }),
  ]);
  const leafInfo = fake.controller.createLeaf(rootInfo, scopeId);
  if (attachWorker) {
    fake.controller.attach(leafInfo, workerPid);
    fake.controller.assertInitialBoundary(rootInfo, leafInfo, workerPid, [
      Object.freeze({ label: "watchdog", pid }),
      Object.freeze({ label: "coordinator", pid: process.pid }),
    ]);
  }
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try { fake.controller.kill(rootInfo); } catch { /* fixture failure is reflected by protocol */ }
    try { fake.controller.removeDescendants(rootInfo); } catch { /* fixture failure is reflected by protocol */ }
  };
  const emitExit = (code, betweenExitAndClose = null) => {
    if (exited) return;
    exited = true;
    queueMicrotask(() => {
      watchdog.emit("exit", code);
      queueMicrotask(() => {
        betweenExitAndClose?.();
        watchdog.emit("close", code, null);
      });
    });
  };
  watchdog.pid = pid;
  watchdog.stdout = stdout;
  watchdog.stderr = stderr;
  watchdog.stdin = {
    end(value) {
      if (exited) return;
      if (ignoreStdin) return;
      if (value === "CLOSE\n" && close === "success") {
        cleanup();
        queueMicrotask(() => {
          if (exitBeforeClosed) emitExit(0, () => stdout.emit("data", "CLOSED\n"));
          else {
            stdout.emit("data", "CLOSED\n");
            emitExit(0);
          }
        });
      } else if (value === "CLOSE\n" && close === "error") {
        cleanup();
        queueMicrotask(() => {
          stdout.emit("data", "ERROR:fake-close\n");
          emitExit(1);
        });
      } else if (value === "CLOSE\n" && close === "ignore") {
        // Deliberately retain the leaf until the parent timeout kills the fake watchdog.
      } else {
        cleanup();
        emitExit(0);
      }
    },
  };
  watchdog.kill = () => {
    emitExit(1);
    return true;
  };
  queueMicrotask(() => {
    const chunks = Array.isArray(initial) ? initial : [initial];
    for (const chunk of chunks) {
      if (chunk.length > 0) stdout.emit("data", chunk);
    }
    if (exitOnStart !== null) emitExit(exitOnStart);
  });
  return watchdog;
}

const fakeMacosControllerPath = path.join(canonicalTempBase, "opencode-quality-macos-controller");
const fakeMacosMarkerPath = path.join(canonicalTempBase, "opencode-quality-macos-uid.marker");
const fakeMacosLeasePath = `${fakeMacosMarkerPath}.lease`;
const macosIdentity = fakeMacosControllerIdentity(fakeMacosControllerPath);
const fakeMacosLeaseIdentity = Object.freeze({
  uid_marker: fakeMacosControllerIdentity(fakeMacosMarkerPath, "2"),
  lease_file: Object.freeze({
    ...fakeMacosControllerIdentity(fakeMacosLeasePath, "3"),
    mode: "33152",
    owner_uid: "501",
  }),
});
const validMacosProbe = () => Object.freeze({
  status: 0,
  signal: null,
  stdout: "PROBE:2:501:6262:10:20:2:3\n",
  stderr: "",
});
assert.equal(classifyProcessContainment({ platform: "darwin", env: {} }).support_state, "unavailable");
assert.equal(classifyProcessContainment({ platform: "darwin", env: {} }).kind, "macos-exclusive-uid-v1");
assert.equal(classifyProcessContainment({
  platform: "darwin",
  macosController: fakeMacosControllerPath,
  macosWorkloadUid: 501,
  macosUidMarker: fakeMacosMarkerPath,
  currentUid: 501,
  macosControllerIdentity: macosIdentity,
  macosUidLeaseIdentity: fakeMacosLeaseIdentity,
  spawnMacosProbe: validMacosProbe,
}).support_state, "verified");
assert.equal(classifyProcessContainment({
  platform: "darwin",
  macosController: fakeMacosControllerPath,
  macosWorkloadUid: 501,
  macosUidMarker: fakeMacosMarkerPath,
  currentUid: 502,
  macosControllerIdentity: macosIdentity,
  macosUidLeaseIdentity: fakeMacosLeaseIdentity,
  spawnMacosProbe: validMacosProbe,
}).reason, "exclusive_uid_mismatch");
assert.equal(classifyProcessContainment({
  platform: "darwin",
  macosController: fakeMacosControllerPath,
  macosWorkloadUid: 501,
  currentUid: 501,
  macosControllerIdentity: macosIdentity,
  spawnMacosProbe: validMacosProbe,
}).reason, "uid_marker_missing");
assert.equal(classifyProcessContainment({
  platform: "darwin",
  macosController: fakeMacosControllerPath,
  macosWorkloadUid: 501,
  macosUidMarker: fakeMacosMarkerPath,
  currentUid: 501,
  macosControllerIdentity: macosIdentity,
  spawnMacosProbe: validMacosProbe,
}).reason, "uid_marker_untrusted");
assert.equal(classifyProcessContainment({
  platform: "darwin",
  macosController: fakeMacosControllerPath,
  macosWorkloadUid: 501,
  macosUidMarker: fakeMacosMarkerPath,
  currentUid: 501,
  macosControllerIdentity: macosIdentity,
  macosUidLeaseIdentity: fakeMacosLeaseIdentity,
  spawnMacosProbe: () => ({ ...validMacosProbe(), stdout: "PROBE:1:501:6262:10:20:2:3\n" }),
}).reason, "controller_protocol_failed");
assert.equal(classifyProcessContainment({
  platform: "darwin",
  macosController: fakeMacosControllerPath,
  macosWorkloadUid: 501,
  macosUidMarker: fakeMacosMarkerPath,
  currentUid: 501,
  macosControllerIdentity: macosIdentity,
  macosUidLeaseIdentity: fakeMacosLeaseIdentity,
  spawnMacosProbe: () => ({
    status: 77,
    signal: null,
    stdout: "ERROR:scope_identity_failed\n",
    stderr: "",
  }),
}).reason, "scope_identity_failed");
assert.equal(classifyProcessContainment({ platform: "freebsd" }).support_state, "unavailable");
assert.equal(classifyProcessContainment({ platform: "linux", env: {} }).support_state, "unavailable");
assert.throws(() => normalizeProcessContainmentOptions({ fallbackToProcessGroup: true }), TypeError);
assert.throws(() => normalizeProcessContainmentOptions({ cgroupRoot: "relative" }), TypeError);
assert.deepEqual(
  normalizeProcessContainmentOptions({ cgroupAttachMode: "sudo-helper-v1" }),
  { cgroupAttachMode: "sudo-helper-v1" },
);
assert.throws(() => normalizeProcessContainmentOptions({ cgroupAttachMode: "ambient-sudo" }), TypeError);
assert.deepEqual(normalizeProcessContainmentOptions({
  macosController: fakeMacosControllerPath,
  macosWorkloadUid: 501,
  macosUidMarker: fakeMacosMarkerPath,
}), {
  macosController: fakeMacosControllerPath,
  macosWorkloadUid: 501,
  macosUidMarker: fakeMacosMarkerPath,
});
assert.throws(() => normalizeProcessContainmentOptions({ macosController: "relative" }), TypeError);
assert.throws(() => normalizeProcessContainmentOptions({ macosWorkloadUid: 0 }), TypeError);
assert.throws(() => normalizeProcessContainmentOptions({ macosUidMarker: "relative" }), TypeError);

const partialLeafRoot = temporaryDirectory("opencode-cgroup-partial-leaf-");
try {
  const partialLeaf = path.join(partialLeafRoot, "opencode-quality-workload");
  assert.throws(
    () => createNodeLinuxController().createLeaf(
      Object.freeze({ root: partialLeafRoot, identity: fakeIdentity(partialLeafRoot, 99) }),
      "partial-leaf",
    ),
  );
  assert.equal(fs.existsSync(partialLeaf), false, "partially validated cgroup leaf was not rolled back");
} finally {
  fs.rmSync(partialLeafRoot, { recursive: true, force: true });
}

if (process.platform === "linux") {
  const directChildBoundRoot = temporaryDirectory("opencode-cgroup-child-bound-");
  try {
    for (let index = 0; index < 1024; index += 1) {
      fs.mkdirSync(path.join(directChildBoundRoot, `child-${String(index).padStart(4, "0")}`));
    }
    const controller = createNodeLinuxController();
    assert.equal(
      controller.descendants({ root: directChildBoundRoot }).length,
      1024,
      "the documented direct-child bound must remain inclusive",
    );
    const overflowChild = path.join(directChildBoundRoot, "child-overflow");
    fs.mkdirSync(overflowChild);
    assert.throws(
      () => controller.descendants({ root: directChildBoundRoot }),
      /cleanup count bound/u,
      "the 1025th direct child must fail closed before cleanup traversal",
    );
    assert.equal(fs.existsSync(directChildBoundRoot), true, "bound rejection must retain the delegated root");
    assert.equal(fs.existsSync(overflowChild), true, "bound rejection must not partially remove descendants");
  } finally {
    fs.rmSync(directChildBoundRoot, { recursive: true, force: true });
  }
}

const windowsIdentity = fakeWindowsIdentity();
const validWindows = await preparePlatformProcessContainment({ pid: 4242 }, 100, {
  platform: "win32",
  windowsPowerShellIdentity: windowsIdentity,
  spawnController: () => createFakeWindowsController(),
  scopeIdFactory: () => "windows-job-valid-protocol",
});
assert.equal(await validWindows.terminateAndVerify(100), true);
assert.equal(validWindows.status().teardown_verified, true);

const reorderedWindows = await preparePlatformProcessContainment({ pid: 4242 }, 100, {
  platform: "win32",
  windowsPowerShellIdentity: windowsIdentity,
  spawnController: () => createFakeWindowsController({ exitBeforeClosed: true }),
  scopeIdFactory: () => "windows-job-exit-before-final-stdout",
});
assert.equal(await reorderedWindows.terminateAndVerify(100), true);
assert.equal(reorderedWindows.status().controller_streams_closed, true);
assert.equal(reorderedWindows.status().teardown_verified, true);

for (const [label, fixture] of [
  ["post-ready garbage", { initial: "READY\nGARBAGE\n" }],
  ["post-ready error", { initial: "READY\nERROR:injected\n" }],
  ["premature close", { initial: "READY\nCLOSED\n" }],
  ["bounded flood", { initial: ["READY\n", "x".repeat(5000)] }],
]) {
  const containment = await preparePlatformProcessContainment({ pid: 4242 }, 100, {
    platform: "win32",
    windowsPowerShellIdentity: windowsIdentity,
    spawnController: () => createFakeWindowsController(fixture),
    scopeIdFactory: () => `windows-job-${label.replaceAll(" ", "-")}`,
  });
  await pause(0);
  assert.equal(await containment.terminateAndVerify(20), false, `${label} was accepted as verified teardown`);
  assert.equal(containment.status().teardown_verified, false);
  assert.equal(typeof containment.status().failure, "string");
}

await assert.rejects(preparePlatformProcessContainment({ pid: 4242 }, 20, {
  platform: "win32",
  windowsPowerShellIdentity: windowsIdentity,
  spawnController: () => createFakeWindowsController({ initial: "", exitOnStart: 1 }),
  scopeIdFactory: () => "windows-job-early-exit",
}), (error) => error instanceof ProcessContainmentError && error.classification === "process_containment_failed");

const closeTimeout = await preparePlatformProcessContainment({ pid: 4242 }, 100, {
  platform: "win32",
  windowsPowerShellIdentity: windowsIdentity,
  spawnController: () => createFakeWindowsController({ close: "ignore" }),
  scopeIdFactory: () => "windows-job-close-timeout",
});
assert.equal(await closeTimeout.terminateAndVerify(5), false);
assert.equal(closeTimeout.status().teardown_verified, false);

let identityReads = 0;
const driftingOptions = {
  platform: "win32",
  spawnController: () => createFakeWindowsController(),
  scopeIdFactory: () => "windows-job-identity-drift",
};
Object.defineProperty(driftingOptions, "windowsPowerShellIdentity", {
  enumerable: true,
  get() {
    identityReads += 1;
    return identityReads === 1 ? fakeWindowsIdentity("1") : fakeWindowsIdentity("2");
  },
});
const identityDrift = await preparePlatformProcessContainment({ pid: 4242 }, 100, driftingOptions);
assert.equal(await identityDrift.terminateAndVerify(100), false);
assert.equal(identityDrift.status().teardown_verified, false);
assert.equal(identityDrift.status().failure, "windows_job_controller_identity_drift");

const macosOptions = Object.freeze({
  platform: "darwin",
  macosController: fakeMacosControllerPath,
  macosWorkloadUid: 501,
  macosUidMarker: fakeMacosMarkerPath,
  currentUid: 501,
  macosControllerIdentity: macosIdentity,
  macosUidLeaseIdentity: fakeMacosLeaseIdentity,
});
const validMacos = await preparePlatformProcessContainment({ pid: 4242 }, 100, {
  ...macosOptions,
  spawnMacosController: () => createFakeMacosController(),
  scopeIdFactory: () => "macos-exclusive-uid-valid-protocol",
});
assert.equal(validMacos.kind, "macos-exclusive-uid-v1");
assert.equal(validMacos.identity.workload_uid, 501);
assert.equal(validMacos.identity.preserved_ancestor_count, 2);
assert.equal(validMacos.identity.preparation_scan_count, 3);
assert.deepEqual(validMacos.identity.uid_marker, fakeMacosLeaseIdentity.uid_marker);
assert.deepEqual(validMacos.identity.lease_file, fakeMacosLeaseIdentity.lease_file);
assert.equal(await validMacos.terminateAndVerify(100), true);
assert.equal(validMacos.status().teardown_verified, true);

const reorderedMacos = await preparePlatformProcessContainment({ pid: 4242 }, 100, {
  ...macosOptions,
  spawnMacosController: () => createFakeMacosController({ exitBeforeClosed: true }),
  scopeIdFactory: () => "macos-exclusive-uid-exit-before-final-stdout",
});
assert.equal(await reorderedMacos.terminateAndVerify(100), true);
assert.equal(reorderedMacos.status().controller_streams_closed, true);

for (const [label, fixture] of [
  ["wrong worker", { initial: "READY:2:501:4243:10:20:6262:30:40:2:3\n" }],
  ["wrong UID", { initial: "READY:2:502:4242:10:20:6262:30:40:2:3\n" }],
  ["wrong controller", { initial: "READY:2:501:4242:10:20:6263:30:40:2:3\n" }],
  ["missing preparation evidence", { initial: "READY:2:501:4242:10:20:6262:30:40:2:2\n" }],
  ["protocol garbage", { initial: "GARBAGE\n" }],
  ["early exit", { initial: "", exitOnStart: 1 }],
]) {
  await assert.rejects(preparePlatformProcessContainment({ pid: 4242 }, 20, {
    ...macosOptions,
    spawnMacosController: () => createFakeMacosController(fixture),
    scopeIdFactory: () => `macos-exclusive-uid-${label.replaceAll(" ", "-")}`,
  }), (error) => error instanceof ProcessContainmentError
    && error.classification === "process_containment_failed", `${label} was accepted by the macOS controller protocol`);
}

await assert.rejects(preparePlatformProcessContainment({ pid: 4242 }, 20, {
  ...macosOptions,
  spawnMacosController: () => createFakeMacosController({
    initial: "ERROR:exclusive_uid_not_available\n",
    exitOnStart: 77,
  }),
  scopeIdFactory: () => "macos-exclusive-uid-pre-ready-collision",
}), (error) => error instanceof ProcessContainmentError
  && error.classification === "process_containment_failed"
  && error.containment_state.reason === "exclusive_uid_not_available");

const macosCloseError = await preparePlatformProcessContainment({ pid: 4242 }, 100, {
  ...macosOptions,
  spawnMacosController: () => createFakeMacosController({ close: "error" }),
  scopeIdFactory: () => "macos-exclusive-uid-close-error",
});
assert.equal(await macosCloseError.terminateAndVerify(100), false);
assert.equal(macosCloseError.status().teardown_verified, false);

let macosIdentityReads = 0;
const driftingMacosOptions = {
  platform: "darwin",
  macosController: fakeMacosControllerPath,
  macosWorkloadUid: 501,
  macosUidMarker: fakeMacosMarkerPath,
  currentUid: 501,
  macosUidLeaseIdentity: fakeMacosLeaseIdentity,
  spawnMacosController: () => createFakeMacosController(),
  scopeIdFactory: () => "macos-exclusive-uid-identity-drift",
};
Object.defineProperty(driftingMacosOptions, "macosControllerIdentity", {
  enumerable: true,
  get() {
    macosIdentityReads += 1;
    return fakeMacosControllerIdentity(fakeMacosControllerPath, macosIdentityReads === 1 ? "1" : "2");
  },
});
const macosIdentityDrift = await preparePlatformProcessContainment({ pid: 4242 }, 100, driftingMacosOptions);
assert.equal(await macosIdentityDrift.terminateAndVerify(100), false);
assert.equal(macosIdentityDrift.status().failure, "macos_uid_controller_identity_drift");

let macosLeaseIdentityReads = 0;
const driftingMacosLeaseOptions = {
  platform: "darwin",
  macosController: fakeMacosControllerPath,
  macosWorkloadUid: 501,
  macosUidMarker: fakeMacosMarkerPath,
  currentUid: 501,
  macosControllerIdentity: macosIdentity,
  spawnMacosController: () => createFakeMacosController(),
  scopeIdFactory: () => "macos-exclusive-uid-host-identity-drift",
};
Object.defineProperty(driftingMacosLeaseOptions, "macosUidLeaseIdentity", {
  enumerable: true,
  get() {
    macosLeaseIdentityReads += 1;
    return macosLeaseIdentityReads === 1
      ? fakeMacosLeaseIdentity
      : Object.freeze({
        ...fakeMacosLeaseIdentity,
        lease_file: Object.freeze({ ...fakeMacosLeaseIdentity.lease_file, inode: "4" }),
      });
  },
});
const macosLeaseIdentityDrift = await preparePlatformProcessContainment(
  { pid: 4242 },
  100,
  driftingMacosLeaseOptions,
);
assert.equal(await macosLeaseIdentityDrift.terminateAndVerify(100), false);
assert.equal(macosLeaseIdentityDrift.status().failure, "macos_uid_host_identity_drift");

const syncInput = {
  file: process.execPath,
  args: ["-e", "process.exit(0)"],
  cwd: process.cwd(),
  env: Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === "string")),
  timeout_ms: 5000,
  max_output_bytes: 1024,
};
const invalidSync = spawnSync(process.execPath, [syncWorker], {
  cwd: process.cwd(),
  shell: false,
  windowsHide: true,
  encoding: "utf8",
  input: JSON.stringify({ ...syncInput, containment_options: { cgroup_root: "relative" } }),
  maxBuffer: 64 * 1024,
});
assert.equal(invalidSync.status, 0);
assert.equal(JSON.parse(invalidSync.stdout).error_code, "MANAGED_COMMAND_INPUT_INVALID");
const invalidMacosMarkerSync = spawnSync(process.execPath, [syncWorker], {
  cwd: process.cwd(),
  shell: false,
  windowsHide: true,
  encoding: "utf8",
  input: JSON.stringify({ ...syncInput, containment_options: { macos_uid_marker: "relative" } }),
  maxBuffer: 64 * 1024,
});
assert.equal(invalidMacosMarkerSync.status, 0);
assert.equal(JSON.parse(invalidMacosMarkerSync.stdout).error_code, "MANAGED_COMMAND_INPUT_INVALID");

const successfulFake = createFakeLinuxController();
const fakeClassification = classifyProcessContainment({
  platform: "linux",
  cgroupRoot: fakeRoot,
  linuxController: successfulFake.controller,
});
assert.equal(fakeClassification.support_state, "verified");
assert.equal(fakeClassification.kind, "linux-cgroup-v2");

const fakeContainment = await preparePlatformProcessContainment({ pid: 4242 }, 100, {
  platform: "linux",
  cgroupRoot: fakeRoot,
  linuxController: successfulFake.controller,
  scopeIdFactory: () => "linux-cgroup-fixture-one",
  delay: async () => {},
});
assert.equal(fakeContainment.support_state, "verified");
assert.equal(fakeContainment.scope_id, "linux-cgroup-fixture-one");
assert.match(fakeContainment.fingerprint, /^sha256:[0-9a-f]{64}$/u);
assert(successfulFake.events.indexOf("attach:4242") > successfulFake.events.indexOf("create:linux-cgroup-fixture-one"));
assert.equal(fakeContainment.status().teardown_verified, false);

await assert.rejects(preparePlatformProcessContainment({ pid: 4343 }, 100, {
  platform: "linux",
  cgroupRoot: fakeRoot,
  linuxController: successfulFake.controller,
  scopeIdFactory: () => "linux-cgroup-concurrent-root",
  delay: async () => {},
}), (error) => error instanceof ProcessContainmentError
  && error.classification === "process_containment_failed"
  && error.containment_state.reason === "delegated_root_not_exclusive");
assert(
  successfulFake.events.every((event) => event !== "attach:4343"),
  "concurrent fake containment initialized a second worker",
);

const migratedSibling = successfulFake.migrateWorkerToSibling(4242);
assert.equal(path.dirname(migratedSibling), fakeRoot);
assert.equal(await fakeContainment.terminateAndVerify(100), true);
assert.equal(fakeContainment.status().teardown_verified, true);
assert.equal(successfulFake.descendantsRemoved(), true);
assert.equal(successfulFake.rootRetained(), true);
assert(successfulFake.events.includes("kill-root"), "migrated fake workload was not killed through the root boundary");

const coordinatorInsideFake = createFakeLinuxController({ coordinatorInside: true });
await assert.rejects(preparePlatformProcessContainment({ pid: 4343 }, 100, {
  platform: "linux",
  cgroupRoot: fakeRoot,
  linuxController: coordinatorInsideFake.controller,
  scopeIdFactory: () => "linux-cgroup-coordinator-inside-root",
  delay: async () => {},
}), (error) => error instanceof ProcessContainmentError
  && error.classification === "process_containment_failed"
  && error.containment_state.reason === "coordinator_inside_delegated_root");

for (const [label, fixture, reason] of [
  ["writable guard", { guardWritable: true }, "delegated_root_guard_writable"],
  ["foreign descendant", { nonexclusive: true }, "delegated_root_not_exclusive"],
]) {
  const fake = createFakeLinuxController(fixture);
  await assert.rejects(preparePlatformProcessContainment({ pid: 4343 }, 100, {
    platform: "linux",
    cgroupRoot: fakeRoot,
    linuxController: fake.controller,
    scopeIdFactory: () => `linux-cgroup-${label.replaceAll(" ", "-")}`,
    delay: async () => {},
  }), (error) => error instanceof ProcessContainmentError
    && error.containment_state.reason === reason
    && fake.events.every((event) => !event.startsWith("attach:")), `${label} was not rejected before attachment`);
}

const secondFake = createFakeLinuxController();
const secondContainment = await preparePlatformProcessContainment({ pid: 4242 }, 100, {
  platform: "linux",
  cgroupRoot: fakeRoot,
  linuxController: secondFake.controller,
  scopeIdFactory: () => "linux-cgroup-fixture-two",
  delay: async () => {},
});
assert.notEqual(secondContainment.scope_id, fakeContainment.scope_id);
assert.notEqual(secondContainment.fingerprint, fakeContainment.fingerprint);
assert.equal(await secondContainment.close(100), true);

const attachFailure = createFakeLinuxController({ attachFailure: true });
await assert.rejects(preparePlatformProcessContainment({ pid: 4242 }, 100, {
  platform: "linux",
  cgroupRoot: fakeRoot,
  linuxController: attachFailure.controller,
  scopeIdFactory: () => "linux-cgroup-attach-failure",
  delay: async () => {},
}), (error) => error instanceof ProcessContainmentError && error.classification === "process_containment_failed");
assert(attachFailure.events.includes("kill-root"), "attach failure did not attempt bounded root cleanup");
assert(attachFailure.events.includes("remove-descendants"), "attach failure did not remove root descendants");

for (const [label, failure] of [
  ["identity drift", { drift: true }],
  ["kill failure", { killFailure: true }],
  ["population timeout", { remainPopulated: true }],
  ["cleanup failure", { removeFailure: true }],
]) {
  const fake = createFakeLinuxController(failure);
  const containment = await preparePlatformProcessContainment({ pid: 4242 }, 1, {
    platform: "linux",
    cgroupRoot: fakeRoot,
    linuxController: fake.controller,
    scopeIdFactory: () => `linux-cgroup-${label.replaceAll(" ", "-")}`,
    delay: async () => {},
  });
  assert.equal(await containment.terminateAndVerify(1), false, `${label} was accepted as verified teardown`);
  assert.equal(containment.status().teardown_verified, false);
  assert.equal(typeof containment.status().failure, "string");
  if (label === "identity drift") {
    assert(fake.events.includes("kill-root"), "identity drift suppressed mandatory delegated-root kill");
    assert(fake.events.includes("remove-descendants"), "identity drift suppressed descendant cleanup");
  }
}

const validWatchdogFake = createFakeLinuxController();
const validWatchdogScope = "linux-watchdog-valid-protocol";
const validWatchdog = await preparePlatformProcessContainment({ pid: 4242 }, 100, {
  platform: "linux",
  cgroupRoot: fakeRoot,
  linuxController: validWatchdogFake.controller,
  spawnLinuxWatchdog: () => createFakeLinuxWatchdog(validWatchdogFake, { scopeId: validWatchdogScope }),
  scopeIdFactory: () => validWatchdogScope,
});
assert.equal(validWatchdog.identity.current_parent_identity.canonical_path, path.dirname(fakeRoot));
assert.equal(await validWatchdog.terminateAndVerify(100), true);
assert.equal(validWatchdog.status().teardown_verified, true);

const postKillInspectionFake = createFakeLinuxController({ postKillInspectionFailure: true });
const postKillInspectionScope = "linux-watchdog-post-kill-inspection-failure";
const postKillInspection = await preparePlatformProcessContainment({ pid: 4242 }, 100, {
  platform: "linux",
  cgroupRoot: fakeRoot,
  linuxController: postKillInspectionFake.controller,
  spawnLinuxWatchdog: () => createFakeLinuxWatchdog(postKillInspectionFake, {
    scopeId: postKillInspectionScope,
  }),
  scopeIdFactory: () => postKillInspectionScope,
});
assert.equal(await postKillInspection.terminateAndVerify(20), false,
  "post-watchdog inspection failure was accepted as verified teardown");
assert(postKillInspectionFake.killCount() >= 2,
  "post-watchdog inspection exception bypassed the mandatory fallback root kill");
assert.equal(postKillInspection.status().teardown_verified, false);

const reorderedWatchdogFake = createFakeLinuxController();
const reorderedWatchdogScope = "linux-watchdog-exit-before-final-stdout";
const reorderedWatchdog = await preparePlatformProcessContainment({ pid: 4242 }, 100, {
  platform: "linux",
  cgroupRoot: fakeRoot,
  linuxController: reorderedWatchdogFake.controller,
  spawnLinuxWatchdog: () => createFakeLinuxWatchdog(reorderedWatchdogFake, {
    exitBeforeClosed: true,
    scopeId: reorderedWatchdogScope,
  }),
  scopeIdFactory: () => reorderedWatchdogScope,
});
assert.equal(await reorderedWatchdog.terminateAndVerify(100), true);
assert.equal(reorderedWatchdog.status().watchdog_streams_closed, true);
assert.equal(reorderedWatchdog.status().teardown_verified, true);

for (const [label, initial] of [
  ["post-ready garbage", "READY\nGARBAGE\n"],
  ["post-ready error", "READY\nERROR:injected\n"],
  ["premature close", "READY\nCLOSED\n"],
  ["bounded flood", ["READY\n", "x".repeat(5000)]],
]) {
  const fake = createFakeLinuxController();
  const fixtureScope = `linux-watchdog-${label.replaceAll(" ", "-")}`;
  const containment = await preparePlatformProcessContainment({ pid: 4242 }, 100, {
    platform: "linux",
    cgroupRoot: fakeRoot,
    linuxController: fake.controller,
    spawnLinuxWatchdog: () => createFakeLinuxWatchdog(fake, { initial, scopeId: fixtureScope }),
    scopeIdFactory: () => fixtureScope,
  });
  await pause(0);
  assert.equal(await containment.terminateAndVerify(20), false, `${label} was accepted as Linux teardown evidence`);
  assert.equal(containment.status().teardown_verified, false);
  assert.equal(typeof containment.status().failure, "string");
  assert.equal(fake.descendantsRemoved(), true, `${label} did not clean delegated-root descendants`);
}

const earlyExitFake = createFakeLinuxController();
await assert.rejects(preparePlatformProcessContainment({ pid: 4242 }, 20, {
  platform: "linux",
  cgroupRoot: fakeRoot,
  linuxController: earlyExitFake.controller,
  spawnLinuxWatchdog: () => createFakeLinuxWatchdog(earlyExitFake, {
    initial: "",
    exitOnStart: 1,
    scopeId: "linux-watchdog-early-exit",
  }),
  scopeIdFactory: () => "linux-watchdog-early-exit",
}), (error) => error instanceof ProcessContainmentError && error.classification === "process_containment_failed");
await pause(0);
assert.equal(earlyExitFake.descendantsRemoved(), true, "early watchdog exit did not clean root descendants");

const hungPreReadyFake = createFakeLinuxController();
const hungPreReadyScope = "linux-watchdog-hung-before-ready";
const hungPreReadyStartedAt = Date.now();
await assert.rejects(preparePlatformProcessContainment({ pid: 4242 }, 20, {
  platform: "linux",
  cgroupRoot: fakeRoot,
  linuxController: hungPreReadyFake.controller,
  spawnLinuxWatchdog: () => createFakeLinuxWatchdog(hungPreReadyFake, {
    initial: "GARBAGE\n",
    ignoreStdin: true,
    scopeId: hungPreReadyScope,
  }),
  scopeIdFactory: () => hungPreReadyScope,
  delay: async () => {},
}), (error) => error instanceof ProcessContainmentError && error.classification === "process_containment_failed");
assert(Date.now() - hungPreReadyStartedAt < 1_000, "pre-READY watchdog shutdown exceeded its bound");
assert.equal(hungPreReadyFake.descendantsRemoved(), true, "hung pre-READY watchdog did not trigger parent-side root cleanup");

for (const [label, fake] of [
  ["unattached partial leaf", createFakeLinuxController()],
  ["partial leaf identity mismatch", createFakeLinuxController({ drift: true })],
]) {
  const scope = `linux-watchdog-${label.replaceAll(" ", "-")}`;
  await assert.rejects(preparePlatformProcessContainment({ pid: 4242 }, 20, {
    platform: "linux",
    cgroupRoot: fakeRoot,
    linuxController: fake.controller,
    spawnLinuxWatchdog: () => createFakeLinuxWatchdog(fake, {
      initial: "GARBAGE\n",
      ignoreStdin: true,
      attachWorker: false,
      scopeId: scope,
    }),
    scopeIdFactory: () => scope,
    delay: async () => {},
  }), (error) => error instanceof ProcessContainmentError
    && error.classification === "process_containment_failed", `${label} setup did not fail closed`);
  assert(fake.events.includes("kill-root"), `${label} did not trigger mandatory delegated-root kill`);
  assert(fake.events.includes("remove-descendants"), `${label} did not remove the fixed partial leaf`);
  assert.equal(fake.descendantsRemoved(), true, `${label} left the delegated root dirty`);
}

const postReadyExitFake = createFakeLinuxController();
const postReadyExitScope = "linux-watchdog-post-ready-exit";
const postReadyExit = await preparePlatformProcessContainment({ pid: 4242 }, 100, {
  platform: "linux",
  cgroupRoot: fakeRoot,
  linuxController: postReadyExitFake.controller,
  spawnLinuxWatchdog: () => createFakeLinuxWatchdog(postReadyExitFake, {
    close: "ignore",
    exitOnStart: 1,
    scopeId: postReadyExitScope,
  }),
  scopeIdFactory: () => postReadyExitScope,
  delay: async () => {},
});
await pause(0);
assert.equal(await postReadyExit.terminateAndVerify(20), false);
assert.equal(postReadyExit.status().teardown_verified, false);
assert.equal(postReadyExitFake.descendantsRemoved(), true, "post-READY watchdog death did not trigger parent-side root cleanup");

const closeTimeoutFake = createFakeLinuxController();
const closeTimeoutScope = "linux-watchdog-close-timeout";
const linuxCloseTimeout = await preparePlatformProcessContainment({ pid: 4242 }, 100, {
  platform: "linux",
  cgroupRoot: fakeRoot,
  linuxController: closeTimeoutFake.controller,
  spawnLinuxWatchdog: () => createFakeLinuxWatchdog(closeTimeoutFake, {
    close: "ignore",
    scopeId: closeTimeoutScope,
  }),
  scopeIdFactory: () => closeTimeoutScope,
});
assert.equal(await linuxCloseTimeout.terminateAndVerify(5), false);
assert.equal(linuxCloseTimeout.status().teardown_verified, false);
assert.equal(closeTimeoutFake.descendantsRemoved(), true, "watchdog close timeout did not run bounded root cleanup");

const managedEvents = [];
let managedContainmentClosed = false;
const managedIdentity = Object.freeze({
  schema_version: 1,
  support_state: "verified",
  kind: "injected-test-controller",
  scope_id: "injected-scope",
});
const managedContainment = Object.freeze({
  support_state: "verified",
  kind: managedIdentity.kind,
  scope_id: managedIdentity.scope_id,
  identity: managedIdentity,
  fingerprint: `sha256:${"a".repeat(64)}`,
  status: () => Object.freeze({
    support_state: "verified",
    kind: managedIdentity.kind,
    scope_id: managedIdentity.scope_id,
    teardown_verified: managedContainmentClosed,
  }),
  close: async () => {
    managedEvents.push("teardown");
    managedContainmentClosed = true;
    return true;
  },
});
const managedResult = await runManagedCommand({
  file: process.execPath,
  args: ["-e", ""],
  cwd: process.cwd(),
  timeout: 1000,
  processFactory: () => {
    managedEvents.push("spawn-idle-worker");
    const child = new EventEmitter();
    child.pid = 5252;
    child.connected = true;
    child.send = (message) => {
      if (message?.type !== "initialize") return;
      managedEvents.push("initialize");
      queueMicrotask(() => child.emit("message", {
        type: "result",
        result: {
          exit_code: 0,
          signal: null,
          stdout_chars: 0,
          stderr_chars: 0,
          stdout_bytes: 0,
          stderr_bytes: 0,
          error_code: null,
        },
      }));
    };
    return child;
  },
  processContainmentFactory: async () => {
    managedEvents.push("attach-before-initialize");
    return managedContainment;
  },
  treeTeardown: async (_child, _state, { containment }) => containment.close(100),
});
assert.deepEqual(managedEvents, ["spawn-idle-worker", "attach-before-initialize", "initialize", "teardown"]);
assert.equal(managedResult.teardown_verified, true);
assert.deepEqual(managedResult.containment_identity, managedIdentity);
assert.equal(managedResult.containment_state.teardown_verified, true);

const inheritedCwdRoot = temporaryDirectory("opencode-inherited-cwd-");
try {
  const activeCwd = path.join(inheritedCwdRoot, "active");
  const retainedCwd = path.join(inheritedCwdRoot, "retained");
  const relativeCommand = "relative-command.mjs";
  fs.mkdirSync(activeCwd);
  fs.writeFileSync(
    path.join(activeCwd, relativeCommand),
    'import fs from "node:fs"; fs.writeFileSync("executed.txt", "original");\n',
  );
  const expectedCwdIdentity = captureManagedCommandWorkingDirectoryIdentity(activeCwd);
  let swapped = false;
  let swapBlockedCode = null;
  const inheritedCwdResult = await runManagedCommand({
    file: process.execPath,
    args: [relativeCommand],
    cwd: activeCwd,
    timeout: 5000,
    expectedWorkingDirectoryIdentity: expectedCwdIdentity,
    processContainmentFactory: async (worker) => {
      let closed = false;
      return Object.freeze({
        support_state: "verified",
        kind: "injected-inherited-cwd-controller",
        scope_id: "inherited-cwd-swap",
        identity: Object.freeze({
          schema_version: 1,
          support_state: "verified",
          kind: "injected-inherited-cwd-controller",
          scope_id: "inherited-cwd-swap",
        }),
        fingerprint: `sha256:${"b".repeat(64)}`,
        status: () => Object.freeze({
          support_state: "verified",
          kind: "injected-inherited-cwd-controller",
          scope_id: "inherited-cwd-swap",
          teardown_verified: closed,
        }),
        close: async () => {
          try { worker.kill(); } catch { /* exit confirmation remains authoritative */ }
          closed = true;
          return true;
        },
      });
    },
    beforeCommandStart: () => {
      try {
        fs.renameSync(activeCwd, retainedCwd);
        fs.mkdirSync(activeCwd);
        fs.writeFileSync(
          path.join(activeCwd, relativeCommand),
          'import fs from "node:fs"; fs.writeFileSync("executed.txt", "replacement");\n',
        );
        swapped = true;
      } catch (error) {
        swapBlockedCode = error?.code ?? "UNKNOWN";
      }
    },
  });
  assert.equal(inheritedCwdResult.status, 0);
  assert.equal(inheritedCwdResult.teardown_verified, true);
  if (swapped) {
    assert.equal(
      fs.readFileSync(path.join(retainedCwd, "executed.txt"), "utf8"),
      "original",
      "contained command did not inherit the already-open original cwd",
    );
    assert.equal(
      fs.existsSync(path.join(activeCwd, "executed.txt")),
      false,
      "contained command re-resolved the replaced cwd path",
    );
  } else {
    assert.equal(process.platform, "win32", "cwd replacement was unexpectedly blocked off Windows");
    assert(["EACCES", "EBUSY", "EPERM"].includes(swapBlockedCode),
      `Windows blocked cwd replacement with unexpected code ${swapBlockedCode}`);
    assert.equal(
      fs.readFileSync(path.join(activeCwd, "executed.txt"), "utf8"),
      "original",
      "command did not execute from the OS-protected original Windows cwd",
    );
  }
} finally {
  fs.rmSync(inheritedCwdRoot, { recursive: true, force: true });
}

const delegatedRoot = process.env.OPENCODE_QUALITY_CGROUP_ROOT;
const configuredMacosController = process.env.OPENCODE_QUALITY_MACOS_CONTROLLER;
const configuredMacosUid = process.env.OPENCODE_QUALITY_MACOS_WORKLOAD_UID;
const configuredMacosUidMarker = process.env.OPENCODE_QUALITY_MACOS_UID_MARKER;
const operationalContainmentOptions = {
  ...(delegatedRoot === undefined ? {} : { cgroupRoot: delegatedRoot }),
  ...(configuredMacosController === undefined ? {} : { macosController: configuredMacosController }),
  ...(configuredMacosUid === undefined ? {} : { macosWorkloadUid: Number(configuredMacosUid) }),
  ...(configuredMacosUidMarker === undefined ? {} : { macosUidMarker: configuredMacosUidMarker }),
};
const syncContainmentOptions = {
  ...(delegatedRoot === undefined ? {} : { cgroup_root: delegatedRoot }),
  ...(configuredMacosController === undefined ? {} : { macos_controller: configuredMacosController }),
  ...(configuredMacosUid === undefined ? {} : { macos_workload_uid: Number(configuredMacosUid) }),
  ...(configuredMacosUidMarker === undefined ? {} : { macos_uid_marker: configuredMacosUidMarker }),
};
const operationalContainmentFingerprints = [];
const currentClassification = classifyProcessContainment(operationalContainmentOptions);
if (process.platform === "win32") {
  assert.equal(currentClassification.support_state, "verified", "Windows Job Object containment must be available");
} else if (process.platform === "linux" && delegatedRoot !== undefined) {
  assert.equal(currentClassification.support_state, "verified", "explicit Linux cgroup root must be usable, not skipped");
} else if (process.platform === "linux") {
  assert.equal(currentClassification.support_state, "unavailable");
} else if (process.platform === "darwin" && configuredMacosController !== undefined
  && configuredMacosUid !== undefined && configuredMacosUidMarker !== undefined) {
  assert.equal(
    currentClassification.support_state,
    "verified",
    `configured macOS exclusive-UID runtime must be usable: ${JSON.stringify(currentClassification)}`,
  );
} else if (process.platform === "darwin") {
  assert.equal(currentClassification.support_state, "unavailable");
}

if (currentClassification.support_state === "verified") {
  const validSync = spawnSync(process.execPath, [syncWorker], {
    cwd: process.cwd(),
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    input: JSON.stringify({
      ...syncInput,
      containment_options: syncContainmentOptions,
    }),
    maxBuffer: 64 * 1024,
  });
  assert.equal(validSync.status, 0);
  const validSyncResult = JSON.parse(validSync.stdout);
  assert.equal(validSyncResult.teardown_verified, true);
  assert.equal(validSyncResult.containment_identity.support_state, "verified");
  assert.equal(validSyncResult.containment_state.teardown_verified, true);
  operationalContainmentFingerprints.push(validSyncResult.containment_fingerprint);

  const actual = await runManagedCommand({
    file: process.execPath,
    args: ["-e", "process.exit(0)"],
    cwd: process.cwd(),
    timeout: 5000,
  });
  assert.equal(actual.status, 0);
  assert.equal(actual.teardown_verified, true);
  assert.equal(actual.containment_identity.support_state, "verified");
  assert.equal(actual.containment_state.teardown_verified, true);
  operationalContainmentFingerprints.push(actual.containment_fingerprint);

  if (process.platform === "linux") {
    const linuxTmp = temporaryDirectory("opencode-linux-watchdog-");
    try {
      const processTreeModule = new URL("../lib/feedback/process-tree.mjs", import.meta.url).href;
      const nestedReceipt = path.join(linuxTmp, "nested-receipt.json");
      const nestedCoordinatorSource = `
        import fs from "node:fs";
        import process from "node:process";
        import { runManagedCommand } from ${JSON.stringify(processTreeModule)};
        let receipt;
        try {
          await runManagedCommand({
            file: process.execPath,
            args: ["-e", "process.exit(0)"],
            cwd: process.cwd(),
            timeout: 5000,
          });
          receipt = { ok: true };
        } catch (error) {
          receipt = {
            ok: false,
            code: error?.code ?? null,
            classification: error?.classification ?? null,
            reason: error?.containment_state?.reason ?? null,
          };
        }
        fs.writeFileSync(process.argv[1], JSON.stringify(receipt));
      `;
      const nestedOuter = await runManagedCommand({
        file: process.execPath,
        args: ["--input-type=module", "--eval", nestedCoordinatorSource, nestedReceipt],
        cwd: linuxTmp,
        timeout: 10_000,
      });
      assert.equal(nestedOuter.status, 0);
      const nestedResult = JSON.parse(fs.readFileSync(nestedReceipt, "utf8"));
      assert.deepEqual(nestedResult, {
        ok: false,
        code: "PROCESS_CONTAINMENT_FAILED",
        classification: "process_containment_failed",
        reason: "coordinator_inside_delegated_root",
      }, "nested containment did not fail before the inner command started");

      const concurrentFirstStarted = path.join(linuxTmp, "concurrent-first-started.txt");
      const concurrentSecondStarted = path.join(linuxTmp, "concurrent-second-started.txt");
      const firstConcurrent = runManagedCommand({
        file: process.execPath,
        args: ["-e", "require('node:fs').writeFileSync(process.argv[1], 'started'); setInterval(() => {}, 60000);", concurrentFirstStarted],
        cwd: linuxTmp,
        timeout: 2500,
      });
      await waitUntil(() => fs.existsSync(concurrentFirstStarted), 10_000, "first exclusive-root command startup");
      await assert.rejects(runManagedCommand({
        file: process.execPath,
        args: ["-e", "require('node:fs').writeFileSync(process.argv[1], 'started');", concurrentSecondStarted],
        cwd: linuxTmp,
        timeout: 5000,
      }), (error) => error instanceof ProcessContainmentError
        && error.classification === "process_containment_failed"
        && error.containment_state.reason === "delegated_root_not_exclusive");
      assert.equal(fs.existsSync(concurrentSecondStarted), false, "concurrent command started inside a leased root");
      const firstConcurrentResult = await firstConcurrent;
      assert.equal(firstConcurrentResult.timed_out, true);
      assert.equal(firstConcurrentResult.teardown_verified, true);

      const migrationStarted = path.join(linuxTmp, "root-migration-started.json");
      const migrationEscaped = path.join(linuxTmp, "root-migration-escaped.txt");
      const migratedChildSource = `
        const fs = require("node:fs");
        const path = require("node:path");
        const root = process.argv[1];
        const started = process.argv[2];
        const escaped = process.argv[3];
        const parentPid = Number(process.argv[4]);
        const sibling = process.argv[5];
        fs.writeFileSync(path.join(sibling, "cgroup.procs"), String(process.pid) + "\\n");
        fs.writeFileSync(started, JSON.stringify({ pid: process.pid, sibling }));
        let goneSince = null;
        setInterval(() => {
          try { process.kill(parentPid, 0); goneSince = null; }
          catch {
            goneSince ??= Date.now();
            if (Date.now() - goneSince >= 750) {
              fs.writeFileSync(escaped, "escaped");
              process.exit(0);
            }
          }
        }, 25);
      `;
      const migrateWithinRootSource = `
        const fs = require("node:fs");
        const path = require("node:path");
        const { spawn } = require("node:child_process");
        const root = process.argv[1];
        const sibling = path.join(root, "project-created-sibling-" + process.pid);
        fs.writeFileSync(path.join(root, "cgroup.procs"), String(process.pid) + "\\n");
        fs.mkdirSync(sibling);
        const child = spawn(process.execPath, [
          "-e", process.argv[2], root, process.argv[3], process.argv[4], String(process.pid), sibling,
        ], { detached: true, stdio: "ignore" });
        child.unref();
        setInterval(() => {}, 60000);
      `;
      const migrated = await runManagedCommand({
        file: process.execPath,
        args: [
          "-e", migrateWithinRootSource, delegatedRoot, migratedChildSource,
          migrationStarted, migrationEscaped,
        ],
        cwd: linuxTmp,
        timeout: 3500,
      });
      assert.equal(migrated.timed_out, true);
      assert.equal(migrated.teardown_verified, true);
      operationalContainmentFingerprints.push(migrated.containment_fingerprint);
      const migrationReceipt = JSON.parse(fs.readFileSync(migrationStarted, "utf8"));
      assert.equal(path.dirname(migrationReceipt.sibling), delegatedRoot);
      await pause(1000);
      assert.equal(fs.existsSync(migrationEscaped), false, "root/sibling-migrated descendant escaped root kill");
      const afterMigrationController = createNodeLinuxController();
      const afterMigrationRoot = afterMigrationController.validateRoot(delegatedRoot);
      afterMigrationController.assertExclusiveRoot(afterMigrationRoot, [
        Object.freeze({ label: "coordinator", pid: process.pid }),
      ]);

      const startedMarker = path.join(linuxTmp, "coordinator-death-started.json");
      const escapedMarker = path.join(linuxTmp, "coordinator-death-escaped.txt");
      const descendantSource = `
        const fs = require("node:fs");
        const coordinatorPid = Number(process.argv[1]);
        const started = process.argv[2];
        const escaped = process.argv[3];
        fs.writeFileSync(started, JSON.stringify({ pid: process.pid }));
        let goneSince = null;
        setInterval(() => {
          try {
            process.kill(coordinatorPid, 0);
            goneSince = null;
          } catch {
            goneSince ??= Date.now();
            if (Date.now() - goneSince >= 750) {
              fs.writeFileSync(escaped, "escaped");
              process.exit(0);
            }
          }
        }, 25);
      `;
      const commandSource = `
        const { spawn } = require("node:child_process");
        const child = spawn(process.execPath, [
          "-e", process.argv[1], process.argv[2], process.argv[3], process.argv[4],
        ], { detached: true, stdio: "ignore" });
        child.unref();
        setInterval(() => {}, 60_000);
      `;
      const coordinatorSource = `
        import process from "node:process";
        import { runManagedCommand } from ${JSON.stringify(processTreeModule)};
        await runManagedCommand({
          file: process.execPath,
          args: [
            "-e", ${JSON.stringify(commandSource)}, ${JSON.stringify(descendantSource)},
            String(process.pid), process.argv[1], process.argv[2],
          ],
          cwd: process.cwd(),
          timeout: 60_000,
        });
      `;
      const coordinator = spawn(process.execPath, [
        "--input-type=module", "--eval", coordinatorSource, startedMarker, escapedMarker,
      ], {
        cwd: linuxTmp,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"],
        env: process.env,
      });
      let coordinatorStderr = "";
      coordinator.stderr.setEncoding("utf8");
      coordinator.stderr.on("data", (chunk) => { coordinatorStderr += String(chunk).slice(0, 4096); });
      try {
        await waitUntil(() => fs.existsSync(startedMarker), 10_000, "detached Linux descendant startup");
        const descendantPid = JSON.parse(fs.readFileSync(startedMarker, "utf8")).pid;
        const nodeController = createNodeLinuxController();
        const delegatedInfo = nodeController.validateRoot(delegatedRoot);
        const coordinatorMembership = nodeController.membership(delegatedInfo, coordinator.pid);
        const descendantMembership = nodeController.membership(delegatedInfo, descendantPid);
        assert(
          coordinatorMembership.cgroup !== delegatedInfo.root
            && !coordinatorMembership.cgroup.startsWith(`${delegatedInfo.root}${path.sep}`),
          "coordinator entered the exclusive delegated root",
        );
        assert.equal(path.dirname(descendantMembership.cgroup), delegatedInfo.root,
          "watchdog workload leaf was not created directly beneath the delegated root");
        const coordinatorExit = new Promise((resolve) => coordinator.once("exit", resolve));
        coordinator.kill("SIGKILL");
        await coordinatorExit;
        await waitUntil(
          () => !fs.existsSync(descendantMembership.cgroup),
          10_000,
          "orphan watchdog recursive cgroup cleanup",
        );
        await pause(1000);
        assert.equal(
          fs.existsSync(escapedMarker),
          false,
          `detached descendant survived coordinator SIGKILL: ${coordinatorStderr}`,
        );
        assert.equal(fs.existsSync(delegatedInfo.root), true, "orphan watchdog removed the delegated root");
        const cleanRoot = nodeController.validateRoot(delegatedInfo.root);
        nodeController.assertExclusiveRoot(cleanRoot, [
          Object.freeze({ label: "coordinator", pid: process.pid }),
        ]);
      } finally {
        try { coordinator.kill("SIGKILL"); } catch { /* watchdog cleanup is asserted above */ }
      }
    } finally {
      fs.rmSync(linuxTmp, { recursive: true, force: true });
    }
  }

  if (process.platform === "darwin") {
    const macosTmp = temporaryDirectory("opencode-macos-watchdog-");
    try {
      const concurrentFirstStarted = path.join(macosTmp, "concurrent-first-started.txt");
      const concurrentSecondStarted = path.join(macosTmp, "concurrent-second-started.txt");
      const firstConcurrent = runManagedCommand({
        file: process.execPath,
        args: [
          "-e",
          "require('node:fs').writeFileSync(process.argv[1], 'started'); setInterval(() => {}, 60000);",
          concurrentFirstStarted,
        ],
        cwd: macosTmp,
        timeout: 2500,
      });
      await waitUntil(() => fs.existsSync(concurrentFirstStarted), 10_000, "first macOS exclusive-UID command startup");
      await assert.rejects(runManagedCommand({
        file: process.execPath,
        args: [
          "-e",
          "require('node:fs').writeFileSync(process.argv[1], 'started');",
          concurrentSecondStarted,
        ],
        cwd: macosTmp,
        timeout: 5000,
      }), (error) => error instanceof ProcessContainmentError
        && error.classification === "process_containment_failed"
        && error.containment_state.reason === "exclusive_uid_not_available");
      assert.equal(fs.existsSync(concurrentSecondStarted), false, "concurrent macOS command started outside the exclusive UID lease");
      const firstConcurrentResult = await firstConcurrent;
      assert.equal(firstConcurrentResult.timed_out, true);
      assert.equal(firstConcurrentResult.teardown_verified, true);
      operationalContainmentFingerprints.push(firstConcurrentResult.containment_fingerprint);

      const processTreeModule = new URL("../lib/feedback/process-tree.mjs", import.meta.url).href;
      const startedMarker = path.join(macosTmp, "coordinator-death-started.json");
      const escapedMarker = path.join(macosTmp, "coordinator-death-escaped.txt");
      const descendantSource = `
        const fs = require("node:fs");
        const coordinatorPid = Number(process.argv[1]);
        const started = process.argv[2];
        const escaped = process.argv[3];
        fs.writeFileSync(started, JSON.stringify({ pid: process.pid }));
        let goneSince = null;
        setInterval(() => {
          try {
            process.kill(coordinatorPid, 0);
            goneSince = null;
          } catch {
            goneSince ??= Date.now();
            if (Date.now() - goneSince >= 750) {
              fs.writeFileSync(escaped, "escaped");
              process.exit(0);
            }
          }
        }, 25);
      `;
      const commandSource = `
        const { spawn } = require("node:child_process");
        const child = spawn(process.execPath, [
          "-e", process.argv[1], process.argv[2], process.argv[3], process.argv[4],
        ], { detached: true, stdio: "ignore" });
        child.unref();
        setInterval(() => {}, 60_000);
      `;
      const coordinatorSource = `
        import process from "node:process";
        import { runManagedCommand } from ${JSON.stringify(processTreeModule)};
        await runManagedCommand({
          file: process.execPath,
          args: [
            "-e", ${JSON.stringify(commandSource)}, ${JSON.stringify(descendantSource)},
            String(process.pid), process.argv[1], process.argv[2],
          ],
          cwd: process.cwd(),
          timeout: 60_000,
        });
      `;
      const coordinator = spawn(process.execPath, [
        "--input-type=module", "--eval", coordinatorSource, startedMarker, escapedMarker,
      ], {
        cwd: macosTmp,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"],
        env: process.env,
      });
      let coordinatorStderr = "";
      coordinator.stderr.setEncoding("utf8");
      coordinator.stderr.on("data", (chunk) => {
        if (coordinatorStderr.length < 4096) {
          coordinatorStderr += String(chunk).slice(0, 4096 - coordinatorStderr.length);
        }
      });
      try {
        await waitUntil(() => fs.existsSync(startedMarker), 10_000, "detached macOS descendant startup");
        const descendantPid = JSON.parse(fs.readFileSync(startedMarker, "utf8")).pid;
        const coordinatorExit = new Promise((resolve) => coordinator.once("exit", resolve));
        coordinator.kill("SIGKILL");
        await coordinatorExit;
        await waitUntil(() => {
          try {
            process.kill(descendantPid, 0);
            return false;
          } catch (error) {
            return error?.code === "ESRCH";
          }
        }, 15_000, "orphan macOS watchdog UID cleanup");
        await pause(1000);
        assert.equal(
          fs.existsSync(escapedMarker),
          false,
          `detached descendant survived macOS coordinator SIGKILL: ${coordinatorStderr}`,
        );
      } finally {
        try { coordinator.kill("SIGKILL"); } catch { /* watchdog cleanup is asserted above */ }
      }
    } finally {
      fs.rmSync(macosTmp, { recursive: true, force: true });
    }
  }

  const tmp = temporaryDirectory("opencode-process-containment-");
  try {
    const startedMarker = path.join(tmp, "double-fork-started.txt");
    const escapedMarker = path.join(tmp, "double-fork-escaped.txt");
    const stageTwo = `const fs=require("node:fs"); const parentPid=Number(process.argv[1]); const marker=process.argv[2]; setInterval(() => { try { process.kill(parentPid, 0); } catch { fs.writeFileSync(marker, "escaped"); process.exit(0); } }, 25);`;
    const stageOne = `const fs=require("node:fs"); const {spawn}=require("node:child_process"); const child=spawn(process.execPath,["-e",process.argv[1],process.argv[2],process.argv[3]],{detached:true,stdio:"ignore",windowsHide:true}); child.unref(); fs.writeFileSync(process.argv[4],"started");`;
    const command = `const {spawn}=require("node:child_process"); const child=spawn(process.execPath,["-e",${JSON.stringify(stageOne)},${JSON.stringify(stageTwo)},String(process.pid),${JSON.stringify(escapedMarker)},${JSON.stringify(startedMarker)}],{detached:true,stdio:"ignore",windowsHide:true}); child.unref(); setInterval(() => {},60000);`;
    const timed = await runManagedCommand({
      file: process.execPath,
      args: ["-e", command],
      cwd: tmp,
      timeout: 5000,
    });
    assert.equal(timed.timed_out, true);
    assert.equal(timed.teardown_verified, true);
    operationalContainmentFingerprints.push(timed.containment_fingerprint);
    assert.equal(fs.readFileSync(startedMarker, "utf8"), "started", "double-fork fixture did not start");
    await pause(750);
    assert.equal(fs.existsSync(escapedMarker), false, "detached double-fork descendant escaped containment");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.env.OPENCODE_MILESTONE_OPERATIONAL_REPORT !== undefined) {
  if (currentClassification.support_state !== "verified" || operationalContainmentFingerprints.length === 0) {
    throw new Error("descendant operational report requires verified platform containment");
  }
  writeMilestone2OperationalReportFromEnvironment(sealMilestone2OperationalReport({
    report_kind: "descendant_teardown",
    platform: process.platform,
    containment_kind: currentClassification.kind,
    containment_identity_fingerprints: operationalContainmentFingerprints,
    teardown_verified: true,
    scenario_ids: [...MILESTONE_DOD_DESCENDANT_SCENARIO_IDS[process.platform]],
    trusted_check_receipt_fingerprints: [],
  }));
}

console.log(`Process containment checks passed (${currentClassification.kind}: ${currentClassification.support_state}).`);
