import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { MILESTONE_DOD_DESCENDANT_SCENARIO_IDS } from "./milestone-dod.mjs";
import {
  ContractError,
  assertBoolean,
  assertFingerprint,
  assertString,
  assertStringArray,
  exact,
  fingerprint,
} from "./validation.mjs";

const REPORT_SCHEMA_VERSION = 1;
const REPORT_KIND = "milestone_2_operational_report";
const MAX_REPORT_BYTES = 1024 * 1024;
const TRUSTED_SCENARIO_IDS = Object.freeze(["trusted_project_check"]);
const CONTAINMENT_KIND_BY_PLATFORM = Object.freeze({
  win32: "windows-job-object-v1",
  linux: "linux-cgroup-v2",
  darwin: "macos-exclusive-uid-v1",
});

function withoutFingerprint(value) {
  const copy = { ...value };
  delete copy.fingerprint;
  return copy;
}

function validateUniqueFingerprints(value, label, { min = 0 } = {}) {
  assertStringArray(value, label, { min, max: 64, maxBytes: 80 });
  value.forEach((entry, index) => assertFingerprint(entry, `${label}[${index}]`));
  if (new Set(value).size !== value.length || JSON.stringify(value) !== JSON.stringify([...value].sort())) {
    throw new ContractError("MILESTONE_OPERATIONAL_REPORT", `${label} must be unique and sorted`);
  }
}

export function validateMilestone2OperationalReport(value) {
  const keys = [
    "schema_version",
    "kind",
    "report_kind",
    "platform",
    "containment_kind",
    "containment_identity_fingerprints",
    "teardown_verified",
    "scenario_ids",
    "trusted_check_receipt_fingerprints",
    "fingerprint",
  ];
  exact(value, keys, keys, "milestone 2 operational report");
  if (value.schema_version !== REPORT_SCHEMA_VERSION || value.kind !== REPORT_KIND) {
    throw new ContractError("MILESTONE_OPERATIONAL_REPORT", "operational report schema is unsupported");
  }
  if (!["trusted_project_check", "descendant_teardown"].includes(value.report_kind)) {
    throw new ContractError("MILESTONE_OPERATIONAL_REPORT", "operational report kind is unsupported");
  }
  if (!Object.hasOwn(CONTAINMENT_KIND_BY_PLATFORM, value.platform)) {
    throw new ContractError("MILESTONE_OPERATIONAL_REPORT", "operational report platform is unsupported");
  }
  assertString(value.containment_kind, "milestone 2 operational report.containment_kind", { maxBytes: 128 });
  if (value.containment_kind !== CONTAINMENT_KIND_BY_PLATFORM[value.platform]) {
    throw new ContractError("MILESTONE_OPERATIONAL_REPORT", "operational report containment kind does not match platform");
  }
  validateUniqueFingerprints(
    value.containment_identity_fingerprints,
    "milestone 2 operational report.containment_identity_fingerprints",
    { min: 1 },
  );
  assertBoolean(value.teardown_verified, "milestone 2 operational report.teardown_verified");
  if (value.teardown_verified !== true) {
    throw new ContractError("MILESTONE_OPERATIONAL_REPORT", "operational report teardown is not verified");
  }
  assertStringArray(value.scenario_ids, "milestone 2 operational report.scenario_ids", {
    min: 1,
    max: 32,
    maxBytes: 128,
  });
  const expectedScenarios = value.report_kind === "descendant_teardown"
    ? MILESTONE_DOD_DESCENDANT_SCENARIO_IDS[value.platform]
    : TRUSTED_SCENARIO_IDS;
  if (JSON.stringify(value.scenario_ids) !== JSON.stringify(expectedScenarios)) {
    throw new ContractError("MILESTONE_OPERATIONAL_REPORT", "operational report scenario contract is incomplete");
  }
  validateUniqueFingerprints(
    value.trusted_check_receipt_fingerprints,
    "milestone 2 operational report.trusted_check_receipt_fingerprints",
    { min: value.report_kind === "trusted_project_check" ? 1 : 0 },
  );
  if (value.report_kind === "descendant_teardown"
    && value.trusted_check_receipt_fingerprints.length !== 0) {
    throw new ContractError("MILESTONE_OPERATIONAL_REPORT", "descendant report cannot claim trusted check receipts");
  }
  assertFingerprint(value.fingerprint, "milestone 2 operational report.fingerprint");
  if (value.fingerprint !== fingerprint(withoutFingerprint(value))) {
    throw new ContractError("MILESTONE_OPERATIONAL_REPORT", "operational report fingerprint mismatch");
  }
  return value;
}

export function sealMilestone2OperationalReport(value) {
  const keys = [
    "report_kind",
    "platform",
    "containment_kind",
    "containment_identity_fingerprints",
    "teardown_verified",
    "scenario_ids",
    "trusted_check_receipt_fingerprints",
  ];
  exact(value, keys, keys, "milestone 2 operational report input");
  const body = {
    schema_version: REPORT_SCHEMA_VERSION,
    kind: REPORT_KIND,
    ...structuredClone(value),
    containment_identity_fingerprints: [...value.containment_identity_fingerprints].sort(),
    trusted_check_receipt_fingerprints: [...value.trusted_check_receipt_fingerprints].sort(),
  };
  const sealed = Object.freeze({ ...body, fingerprint: fingerprint(body) });
  validateMilestone2OperationalReport(sealed);
  return sealed;
}

function canonicalNewFile(candidate) {
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.includes("\0")
    || Buffer.byteLength(candidate, "utf8") > 4096 || !path.isAbsolute(candidate)
    || path.normalize(candidate) !== candidate || path.resolve(candidate) !== candidate) {
    throw new Error("operational report output path must be a canonical absolute path");
  }
  if (fs.existsSync(candidate)) throw new Error("operational report output already exists");
  const parent = path.dirname(candidate);
  const canonicalParent = fs.realpathSync.native(parent);
  const comparable = process.platform === "win32"
    ? (value) => value.toLowerCase()
    : (value) => value;
  if (comparable(canonicalParent) !== comparable(parent) || !fs.statSync(canonicalParent).isDirectory()) {
    throw new Error("operational report output parent is not a canonical directory");
  }
  return candidate;
}

export function writeMilestone2OperationalReportFromEnvironment(report, environment = process.env) {
  const output = environment.OPENCODE_MILESTONE_OPERATIONAL_REPORT;
  if (output === undefined) return null;
  const candidate = canonicalNewFile(output);
  validateMilestone2OperationalReport(report);
  fs.writeFileSync(candidate, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return candidate;
}

export function readMilestone2OperationalReport(candidate) {
  const bytes = fs.readFileSync(candidate);
  if (bytes.length === 0 || bytes.length > MAX_REPORT_BYTES) {
    throw new Error("operational report size is invalid");
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("operational report JSON is invalid");
  }
  return validateMilestone2OperationalReport(value);
}
