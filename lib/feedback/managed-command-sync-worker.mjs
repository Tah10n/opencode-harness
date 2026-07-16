import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  ProcessTreeError,
  ProcessTreeTeardownError,
  runManagedCommand,
} from "./process-tree.mjs";

const MAX_INPUT_BYTES = 512 * 1024;

function invalidInput() {
  return Object.assign(new Error("MANAGED_COMMAND_INPUT_INVALID"), { code: "MANAGED_COMMAND_INPUT_INVALID" });
}

function fail(errorCode, teardownVerified = false, containmentState = null) {
  process.stdout.write(JSON.stringify({
    status: null,
    signal: null,
    stdout_bytes: 0,
    stderr_bytes: 0,
    timed_out: false,
    teardown_verified: teardownVerified,
    error_code: errorCode,
    containment_identity: null,
    containment_fingerprint: null,
    containment_state: containmentState,
  }));
}

function containmentOptions(input) {
  if (!Object.hasOwn(input, "containment_options")) return {};
  const value = input.containment_options;
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => ![
      "cgroup_root", "cgroup_attach_mode", "cgroup_attach_helper",
      "macos_controller", "macos_workload_uid", "macos_uid_marker",
    ].includes(key))
    || (Object.hasOwn(value, "cgroup_root") && (
      typeof value.cgroup_root !== "string"
      || !path.isAbsolute(value.cgroup_root)
      || path.normalize(value.cgroup_root) !== value.cgroup_root
      || path.resolve(value.cgroup_root) !== value.cgroup_root
      || Buffer.byteLength(value.cgroup_root, "utf8") > 4096
      || value.cgroup_root.includes("\0")
    ))
    || (Object.hasOwn(value, "cgroup_attach_mode") && value.cgroup_attach_mode !== "sudo-helper-v1")
    || (Object.hasOwn(value, "cgroup_attach_helper") && (
      typeof value.cgroup_attach_helper !== "string"
      || !path.isAbsolute(value.cgroup_attach_helper)
      || path.normalize(value.cgroup_attach_helper) !== value.cgroup_attach_helper
      || path.resolve(value.cgroup_attach_helper) !== value.cgroup_attach_helper
      || Buffer.byteLength(value.cgroup_attach_helper, "utf8") > 4096
      || value.cgroup_attach_helper.includes("\0")
    ))
    || (Object.hasOwn(value, "macos_controller") && (
      typeof value.macos_controller !== "string"
      || !path.isAbsolute(value.macos_controller)
      || path.normalize(value.macos_controller) !== value.macos_controller
      || path.resolve(value.macos_controller) !== value.macos_controller
      || Buffer.byteLength(value.macos_controller, "utf8") > 4096
      || value.macos_controller.includes("\0")
    ))
    || (Object.hasOwn(value, "macos_uid_marker") && (
      typeof value.macos_uid_marker !== "string"
      || !path.isAbsolute(value.macos_uid_marker)
      || path.normalize(value.macos_uid_marker) !== value.macos_uid_marker
      || path.resolve(value.macos_uid_marker) !== value.macos_uid_marker
      || Buffer.byteLength(value.macos_uid_marker, "utf8") > 4096
      || value.macos_uid_marker.includes("\0")
    ))
    || (Object.hasOwn(value, "macos_workload_uid") && (
      !Number.isSafeInteger(value.macos_workload_uid)
      || value.macos_workload_uid < 1
      || value.macos_workload_uid > 0x7fffffff
    ))) {
    throw invalidInput();
  }
  return {
    ...(Object.hasOwn(value, "cgroup_root") ? { cgroupRoot: value.cgroup_root } : {}),
    ...(Object.hasOwn(value, "cgroup_attach_mode")
      ? { cgroupAttachMode: value.cgroup_attach_mode }
      : {}),
    ...(Object.hasOwn(value, "cgroup_attach_helper")
      ? { cgroupAttachHelper: value.cgroup_attach_helper }
      : {}),
    ...(Object.hasOwn(value, "macos_controller")
      ? { macosController: value.macos_controller }
      : {}),
    ...(Object.hasOwn(value, "macos_workload_uid")
      ? { macosWorkloadUid: value.macos_workload_uid }
      : {}),
    ...(Object.hasOwn(value, "macos_uid_marker")
      ? { macosUidMarker: value.macos_uid_marker }
      : {}),
  };
}

function readInput() {
  const bytes = fs.readFileSync(0);
  if (bytes.length === 0 || bytes.length > MAX_INPUT_BYTES) throw invalidInput();
  let input;
  try {
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalidInput();
  }
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => ![
      "file", "args", "cwd", "env", "timeout_ms", "max_output_bytes", "containment_options",
      "expected_invocation", "expected_working_directory_identity",
    ].includes(key))
    || typeof input.file !== "string" || !path.isAbsolute(input.file)
    || !Array.isArray(input.args) || input.args.some((entry) => typeof entry !== "string")
    || typeof input.cwd !== "string" || !path.isAbsolute(input.cwd)
    || input.env === null || typeof input.env !== "object" || Array.isArray(input.env)
    || Object.values(input.env).some((entry) => typeof entry !== "string")
    || !Number.isSafeInteger(input.timeout_ms) || input.timeout_ms < 1
    || !Number.isSafeInteger(input.max_output_bytes) || input.max_output_bytes < 1) {
    throw invalidInput();
  }
  input.containment_options = containmentOptions(input);
  return input;
}

try {
  const input = readInput();
  const result = await runManagedCommand({
    file: input.file,
    args: input.args,
    cwd: input.cwd,
    env: input.env,
    timeout: input.timeout_ms,
    maxOutputChars: input.max_output_bytes,
    containmentOptions: input.containment_options,
    expectedInvocation: input.expected_invocation ?? null,
    expectedWorkingDirectoryIdentity: input.expected_working_directory_identity ?? null,
  });
  process.stdout.write(JSON.stringify({
    status: Number.isInteger(result.status) ? result.status : null,
    signal: typeof result.signal === "string" ? result.signal : null,
    stdout_bytes: Number.isSafeInteger(result.stdout_bytes) ? result.stdout_bytes : 0,
    stderr_bytes: Number.isSafeInteger(result.stderr_bytes) ? result.stderr_bytes : 0,
    timed_out: result.timed_out === true,
    teardown_verified: result.teardown_verified === true,
    error_code: typeof result.error?.code === "string" ? result.error.code : null,
    containment_identity: result.containment_identity ?? null,
    containment_fingerprint: result.containment_fingerprint ?? null,
    containment_state: result.containment_state ?? null,
  }));
} catch (error) {
  if (error instanceof ProcessTreeTeardownError || error instanceof ProcessTreeError) {
    fail(
      error instanceof ProcessTreeTeardownError ? error.code : error.classification,
      false,
      error.containment_state ?? null,
    );
  } else {
    fail(
      typeof error?.code === "string" ? error.code : "MANAGED_COMMAND_SYNC_WORKER_FAILED",
      false,
      error?.containment_state ?? null,
    );
  }
}
