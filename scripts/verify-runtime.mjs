import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { EVIDENCE_PRODUCERS, assertIsoTimestamp, assertSafeId, fingerprint } from "../lib/feedback/contracts.mjs";
import { atomicWriteJson, ensureConfinedDirectory, resolveHarnessRoot } from "../lib/feedback/files.mjs";
import { validateStaticEvidence } from "../lib/feedback/acceptance.mjs";
import {
  permissionProfileFingerprint,
  runtimeOutputsFingerprint,
} from "../lib/feedback/evidence.mjs";
import { collectResolvedPermissionSurface, extractPermissionSurface } from "../lib/feedback/permission-surface.mjs";
import { assertPersistenceSafe, assertSafePersistenceId } from "../lib/feedback/privacy.mjs";
import {
  evaluateRuntimeModelEvidence,
  sealRuntimeModelEvidence,
  validateEngineeringExperimentManifest,
  validateModelProfileCatalog,
  validateRuntimeModelEvidence,
} from "../lib/quality/model-profiles.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeCwd = process.env.HARNESS_RUNTIME_CWD
  ? path.resolve(process.env.HARNESS_RUNTIME_CWD)
  : root;
const fixtureArgIndex = process.argv.indexOf("--fixture-dir");
const fixtureArg = fixtureArgIndex === -1 ? null : process.argv[fixtureArgIndex + 1];
const fixtureSource = fixtureArg || process.env.HARNESS_RUNTIME_FIXTURE_DIR;
const fixtureDir = fixtureSource
  ? path.resolve(fixtureSource)
  : null;
const evidenceProfileArgIndex = process.argv.indexOf("--evidence-profile");
const evidenceProfile = evidenceProfileArgIndex === -1 ? null : process.argv[evidenceProfileArgIndex + 1];
const subjectIdArgIndex = process.argv.indexOf("--subject-id");
const subjectId = subjectIdArgIndex === -1 ? null : process.argv[subjectIdArgIndex + 1];
const subjectEvidenceArgIndex = process.argv.indexOf("--subject-evidence");
const subjectEvidencePath = subjectEvidenceArgIndex === -1 ? null : process.argv[subjectEvidenceArgIndex + 1];
const modelProfileArgIndex = process.argv.indexOf("--model-profile");
const modelProfileId = modelProfileArgIndex === -1 ? null : process.argv[modelProfileArgIndex + 1];
const comparisonArgIndex = process.argv.indexOf("--comparison");
const comparisonId = comparisonArgIndex === -1 ? null : process.argv[comparisonArgIndex + 1];
const experimentRoleArgIndex = process.argv.indexOf("--profile-role");
const experimentProfileRole = experimentRoleArgIndex === -1 ? null : process.argv[experimentRoleArgIndex + 1];
const allExperimentModels = process.argv.includes("--all-experiment-models");
const requiredAgentNames = ["orchestrator", "orchestrator-deep", "review-orchestrator", "explore", "architect", "general", "reviewer", "diagnose", "verifier", "researcher", "improver"];
const requiredAgentModes = new Map(requiredAgentNames.map((name) => [
  name,
  ["orchestrator", "orchestrator-deep", "review-orchestrator"].includes(name) ? "primary" : "subagent",
]));
const MAX_AGENT_INVENTORY_BYTES = 2 * 1024 * 1024;
const MAX_AGENT_COUNT = 128;
const failures = [];
let installedRuntimeVersion = null;

function fail(code, message, fix) {
  failures.push({ code, message, fix });
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function readFixture(name) {
  if (!fixtureDir) {
    return null;
  }
  const file = path.join(fixtureDir, `${name}.txt`);
  if (!fs.existsSync(file)) {
    fail("HARNESS-R001", `runtime fixture missing: ${file}`, "Provide all debug output files or unset HARNESS_RUNTIME_FIXTURE_DIR.");
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function readOptionalFixture(name) {
  if (!fixtureDir) return null;
  const file = path.join(fixtureDir, `${name}.txt`);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

function spawnOpenCode(args, { env = process.env } = {}) {
  if (process.platform === "win32") {
    return spawnSync("cmd.exe", ["/d", "/s", "/c", ["opencode", ...args].join(" ")], {
      cwd: runtimeCwd,
      encoding: "utf8",
      env,
    });
  }
  return spawnSync("opencode", args, {
    cwd: runtimeCwd,
    encoding: "utf8",
    env,
  });
}

function reportAndExit() {
  console.error("Harness runtime verification failed:");
  console.error(`Runtime cwd: ${runtimeCwd}`);
  for (const failure of failures) {
    console.error(`- ${failure.code}: ${failure.message}`);
    if (failure.fix) {
      console.error(`  fix: ${failure.fix}`);
    }
  }
  process.exit(1);
}

function loadSubjectEvidence() {
  if (evidenceProfileArgIndex === -1) {
    if (subjectEvidenceArgIndex !== -1 || subjectIdArgIndex !== -1) {
      fail("HARNESS-R019", "--subject-id and --subject-evidence require --evidence-profile", "Pass the permission profile and subject arguments together.");
    }
    return null;
  }
  if (!evidenceProfile || process.argv[evidenceProfileArgIndex + 1]?.startsWith("--")) {
    fail("HARNESS-R019", "--evidence-profile requires a filename-safe profile identifier", "Pass --evidence-profile baseline or --evidence-profile candidate.");
    return null;
  }
  try {
    assertSafePersistenceId(evidenceProfile, "evidence profile");
  } catch (error) {
    fail("HARNESS-R019", error instanceof Error ? error.message : String(error), "Pass a filename-safe evidence profile identifier.");
    return null;
  }
  const expectedSubjectId = subjectIdArgIndex === -1 ? evidenceProfile : subjectId;
  if (
    !expectedSubjectId
    || (subjectIdArgIndex !== -1 && process.argv[subjectIdArgIndex + 1]?.startsWith("--"))
  ) {
    fail("HARNESS-R019", "--subject-id requires a filename-safe static subject identifier", "Pass the candidate_id used by evidence:static.");
    return null;
  }
  try {
    assertSafePersistenceId(expectedSubjectId, "subject ID");
  } catch (error) {
    fail("HARNESS-R019", error instanceof Error ? error.message : String(error), "Pass the candidate_id used by evidence:static.");
    return null;
  }
  if (!subjectEvidencePath || process.argv[subjectEvidenceArgIndex + 1]?.startsWith("--")) {
    fail("HARNESS-R020", "--evidence-profile requires --subject-evidence <static-evidence.json>", "Capture first-party static evidence for the same profile first.");
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(path.resolve(subjectEvidencePath), "utf8"));
    validateStaticEvidence(parsed);
    if (!parsed.passed || !parsed.complete) {
      fail("HARNESS-R020", "subject static evidence must be passed and complete", "Run the first-party static evidence producer successfully.");
      return null;
    }
    if (parsed.candidate_id !== expectedSubjectId) {
      fail("HARNESS-R020", "subject static evidence candidate_id must match --subject-id (or --evidence-profile when omitted)", "Use evidence captured for the declared static subject identifier.");
      return null;
    }
    return parsed;
  } catch (error) {
    fail("HARNESS-R020", `invalid --subject-evidence: ${error instanceof Error ? error.message : String(error)}`, "Pass a valid first-party static evidence JSON document.");
    return null;
  }
}

const subjectEvidence = loadSubjectEvidence();
if (failures.length > 0) reportAndExit();

if (!fixtureDir) {
  const versionCheck = spawnOpenCode(["--version"]);
  if (versionCheck.error) {
    fail("HARNESS-R002", `failed to run opencode --version: ${versionCheck.error.message}`, "Install OpenCode, add it to PATH, set HARNESS_RUNTIME_CWD to an installed profile, or set HARNESS_RUNTIME_FIXTURE_DIR to saved debug outputs.");
    reportAndExit();
  }
  if (versionCheck.status !== 0) {
    fail("HARNESS-R002", `opencode --version exited with ${versionCheck.status}`, stripAnsi(`${versionCheck.stderr || versionCheck.stdout}`).trim());
    reportAndExit();
  }
  installedRuntimeVersion = stripAnsi(`${versionCheck.stdout || versionCheck.stderr || ""}`).trim().split(/\r?\n/u)[0]?.slice(0, 128) || null;
}

function runOpenCode(name, args, options = {}) {
  const fixture = readFixture(name);
  if (fixture !== null) {
    return stripAnsi(fixture);
  }

  const result = spawnOpenCode(args, options);

  if (result.error) {
    fail("HARNESS-R002", `failed to run opencode ${args.join(" ")}: ${result.error.message}`, "Install OpenCode or set HARNESS_RUNTIME_FIXTURE_DIR to saved debug outputs.");
    return "";
  }
  if (result.status !== 0) {
    fail("HARNESS-R003", `opencode ${args.join(" ")} exited with ${result.status}`, stripAnsi(`${result.stderr || result.stdout}`).trim());
    return stripAnsi(`${result.stdout || ""}\n${result.stderr || ""}`);
  }
  return stripAnsi(`${result.stdout || ""}\n${result.stderr || ""}`);
}

function namesFromJsonInventory(parsed) {
  let entries;
  if (Array.isArray(parsed)) {
    entries = parsed;
  } else if (
    parsed
    && typeof parsed === "object"
    && !Array.isArray(parsed)
    && Object.keys(parsed).length === 1
    && Object.hasOwn(parsed, "agents")
  ) {
    if (Array.isArray(parsed.agents)) {
      entries = parsed.agents;
    } else if (parsed.agents && typeof parsed.agents === "object") {
      entries = Object.entries(parsed.agents).map(([name, value]) => ({
        name,
        mode: typeof value === "string" ? value : value?.mode,
      }));
    } else {
      return null;
    }
  } else {
    return null;
  }

  const inventory = [];
  for (const entry of entries) {
    if (
      !entry
      || typeof entry !== "object"
      || Array.isArray(entry)
      || typeof entry.name !== "string"
      || typeof entry.mode !== "string"
      || Object.keys(entry).some((key) => !["name", "mode"].includes(key))
      || !["all", "primary", "subagent"].includes(entry.mode)
    ) {
      return null;
    }
    inventory.push({ name: entry.name, mode: entry.mode });
  }
  return inventory;
}

function namesFromCliInventory(source) {
  const lines = source.split(/\r?\n/);
  const inventory = [];
  let index = 0;
  while (index < lines.length) {
    while (index < lines.length && lines[index].trim() === "") index += 1;
    if (index >= lines.length) break;

    const header = lines[index].match(/^(.+?) \((all|primary|subagent)\)$/);
    if (!header) return null;
    inventory.push({ name: header[1], mode: header[2] });
    index += 1;

    const permissionLines = [];
    while (index < lines.length && !/^(.+?) \((all|primary|subagent)\)$/.test(lines[index])) {
      permissionLines.push(lines[index]);
      index += 1;
    }
    const permissionSource = permissionLines.join("\n").trim();
    if (!permissionSource) return null;
    try {
      const permission = JSON.parse(permissionSource);
      if (!permission || typeof permission !== "object") return null;
    } catch {
      return null;
    }
  }
  return inventory;
}

function parseAgentInventory(output) {
  const source = typeof output === "string" ? output.trim() : "";
  if (Buffer.byteLength(source, "utf8") > MAX_AGENT_INVENTORY_BYTES) {
    fail("HARNESS-R022", "agent inventory output exceeds the 2 MiB safety limit", "Reduce unexpected CLI output and rerun opencode agent list.");
    return [];
  }
  if (!source) {
    fail("HARNESS-R022", "agent inventory is empty", "Ensure opencode agent list returns the installed agents.");
    return [];
  }

  let inventory = null;
  try {
    inventory = namesFromJsonInventory(JSON.parse(source));
  } catch {
    inventory = namesFromCliInventory(source);
  }
  if (!inventory) {
    fail("HARNESS-R022", "agent inventory has an unsupported or malformed format", "Use a supported OpenCode agent list output and rerun verification.");
    return [];
  }
  if (inventory.length === 0) {
    fail("HARNESS-R022", "agent inventory contains no agents", "Ensure opencode agent list returns at least the installed harness agents.");
    return [];
  }
  if (inventory.length > MAX_AGENT_COUNT) {
    fail("HARNESS-R022", `agent inventory contains more than ${MAX_AGENT_COUNT} agents`, "Reduce the installed agent surface or review the unexpected inventory growth.");
    return [];
  }

  const seen = new Set();
  for (const { name } of inventory) {
    try {
      assertSafeId(name, "installed agent name");
    } catch {
      fail("HARNESS-R022", "agent inventory contains an unsafe agent name", "Use filename-safe OpenCode agent identifiers.");
      return [];
    }
    if (seen.has(name)) {
      fail("HARNESS-R022", `agent inventory contains duplicate agent ${name}`, "Repair the installed agent inventory so every name is unique.");
      return [];
    }
    seen.add(name);
  }

  const missingRequired = requiredAgentNames.filter((name) => !seen.has(name));
  if (missingRequired.length > 0) {
    fail("HARNESS-R023", `agent inventory is missing required harness agents: ${missingRequired.join(", ")}`, "Install the complete harness agent profile before runtime verification.");
    return [];
  }
  for (const { name, mode } of inventory) {
    const expectedMode = requiredAgentModes.get(name);
    if (expectedMode && mode !== expectedMode) {
      fail(
        "HARNESS-R024",
        `required harness agent ${name} must use mode ${expectedMode}, got ${mode}`,
        "Repair the installed agent mode before collecting runtime evidence.",
      );
    }
  }
  return inventory.sort((left, right) => left.name.localeCompare(right.name));
}

function assertContains(output, needle, label, code, fix) {
  if (!output.includes(needle)) {
    fail(code, `${label} missing ${needle}`, fix);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function permissionValues(output, key) {
  const jsonValues = jsonPermissionValues(output, key);
  if (jsonValues !== null) {
    return jsonValues;
  }

  const escapedKey = escapeRegex(key);
  const pattern = new RegExp(`^\\s*["']?${escapedKey}["']?\\s*[:=]\\s*["']?([^"',#}\\s]+)`, "gim");
  const direct = [...output.matchAll(pattern)].map((match) => normalizePermissionValue(match[1]));
  const structured = structuredPermissionValues(output, key);
  const yamlNested = yamlPathValues(output, key);
  return [...direct, ...structured, ...yamlNested];
}

function jsonPermissionValues(output, key) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    return null;
  }

  const values = [];
  const direct = scalarToString(parsed?.[key]) ?? valueAtPath(parsed, key);
  if (direct !== null) {
    values.push(normalizePermissionValue(direct));
  }

  const permissions = parsed?.permission;
  if (Array.isArray(permissions)) {
    for (const item of permissions) {
      if (!item || typeof item !== "object") continue;

      const permission = scalarToString(item.permission);
      const action = scalarToString(item.action);
      if (permission === key && action !== null) {
        values.push(normalizePermissionValue(action));
      }
    }
  } else if (permissions && typeof permissions === "object") {
    const action = scalarToString(permissions[key]) ?? valueAtPath(permissions, key);
    if (action !== null) {
      values.push(normalizePermissionValue(action));
    }
  }

  return values;
}

function valueAtPath(object, key) {
  if (!object || typeof object !== "object") {
    return null;
  }
  let current = object;
  for (const segment of key.split(".")) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return null;
    }
    current = current[segment];
  }
  return scalarToString(current);
}

function structuredPermissionValues(output, key) {
  const values = [];
  for (const block of output.match(/\{[^{}]*\}/g) ?? []) {
    const permission = objectFieldValue(block, "permission");
    const action = objectFieldValue(block, "action");
    if (permission === key && action !== null) {
      values.push(normalizePermissionValue(action));
    }
  }

  return values;
}

function yamlPathValues(output, key) {
  const values = [];
  const stack = [];
  for (const rawLine of output.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }
    const match = rawLine.match(/^(\s*)(["']?[^:"']+["']?)\s*:\s*(?:"([^"]*)"|'([^']*)'|([^#\s]+))?\s*$/);
    if (!match) {
      continue;
    }
    const indent = match[1].length;
    const name = match[2].replace(/^["']|["']$/g, "");
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    while (stack.length > 0 && indent <= stack.at(-1).indent) {
      stack.pop();
    }
    const currentPath = [...stack.map((entry) => entry.name), name].join(".");
    if (value === "") {
      stack.push({ indent, name });
      continue;
    }
    if (currentPath === key || currentPath.endsWith(`.${key}`)) {
      values.push(normalizePermissionValue(value));
    }
  }
  return values;
}

function objectFieldValue(block, field) {
  const fieldPattern = new RegExp(
    `["']?${escapeRegex(field)}["']?\\s*[:=]\\s*(?:"([^"]*)"|'([^']*)'|([^"',}\\s]+))`,
    "i",
  );
  const match = block.match(fieldPattern);
  return match ? scalarToString(match[1] ?? match[2] ?? match[3]) : null;
}

function scalarToString(value) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function normalizePermissionValue(value) {
  const normalized = value.toLowerCase();
  if (normalized === "true") return "allow";
  if (normalized === "false") return "deny";
  return normalized;
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function formatValues(values) {
  return values.length > 0 ? uniqueValues(values).join(", ") : "<missing>";
}

function effectivePermissionValue(values) {
  return values.length > 0 ? values[values.length - 1] : null;
}

function resolvedConfigValue(output, keys) {
  for (const key of keys) {
    const values = uniqueValues(permissionValues(output, key));
    if (values.length > 0) return { value: values.at(-1), values };
  }
  return { value: null, values: [] };
}

function optionResult(optionId, requestedValue, resolved, { unsupportedWhenAbsent = false, allowAlias = false } = {}) {
  let status;
  if (resolved.value === null) status = unsupportedWhenAbsent ? "unsupported" : "absent";
  else if (resolved.value === requestedValue) status = "accepted";
  else if (allowAlias && resolved.value.replace(/^openai\//u, "") === requestedValue.replace(/^openai\//u, "")) status = "alias";
  else if (resolved.values.includes(requestedValue)) status = "ignored";
  else status = "conflicting";
  return {
    option_id: optionId,
    requested_value: requestedValue,
    effective_value: resolved.value,
    status,
  };
}

function loadRequestedModelProfile() {
  if (allExperimentModels) return null;
  if (modelProfileArgIndex === -1 && comparisonArgIndex === -1 && experimentRoleArgIndex === -1) return null;
  if (comparisonArgIndex !== -1 || experimentRoleArgIndex !== -1) {
    if (
      !comparisonId || process.argv[comparisonArgIndex + 1]?.startsWith("--")
      || !["baseline", "candidate"].includes(experimentProfileRole)
    ) {
      fail(
        "HARNESS-R025",
        "--comparison <comparison-id> and --profile-role baseline|candidate must be supplied together",
        "Choose a comparison_id from quality/model-profiles/experiment.v1.json.",
      );
      return null;
    }
  }
  if (modelProfileArgIndex !== -1 && (!modelProfileId || process.argv[modelProfileArgIndex + 1]?.startsWith("--"))) {
    fail("HARNESS-R025", "--model-profile requires a checked model profile identifier", "Choose a profile_id from quality/model-profiles/catalog.v1.json.");
    return null;
  }
  const catalogPath = path.join(root, "quality", "model-profiles", "catalog.v1.json");
  try {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8").replace(/^\uFEFF/u, ""));
    validateModelProfileCatalog(catalog);
    let invocation = null;
    if (comparisonId !== null) {
      assertSafeId(comparisonId, "comparison ID");
      const experiment = JSON.parse(fs.readFileSync(path.join(root, "quality", "model-profiles", "experiment.v1.json"), "utf8").replace(/^\uFEFF/u, ""));
      validateEngineeringExperimentManifest(experiment, { catalog });
      const comparison = experiment.comparisons.find((entry) => entry.comparison_id === comparisonId);
      if (!comparison) {
        fail("HARNESS-R025", `unknown --comparison ${comparisonId}`, "Choose a checked comparison_id from the experiment manifest.");
        return null;
      }
      invocation = comparison[`${experimentProfileRole}_invocation`];
      if (modelProfileId !== null && modelProfileId !== invocation.profile_id) {
        fail("HARNESS-R025", "--model-profile does not match the selected experiment invocation", "Omit --model-profile or pass the invocation profile_id.");
        return null;
      }
    }
    const requestedProfileId = invocation?.profile_id ?? modelProfileId;
    const profile = catalog.profiles.find((entry) => entry.profile_id === requestedProfileId);
    if (!profile) {
      fail("HARNESS-R025", `unknown --model-profile ${requestedProfileId}`, "Choose a checked profile_id from the model catalog.");
      return null;
    }
    invocation ??= {
      role: profile.role,
      profile_id: profile.profile_id,
      model_id: profile.model_id,
      reasoning_effort: profile.default_reasoning_effort,
      text_verbosity: profile.default_text_verbosity,
      mode: profile.mode,
    };
    return { catalog, profile, invocation, comparisonId, experimentProfileRole };
  } catch (error) {
    fail("HARNESS-R025", `model profile catalog is invalid: ${error instanceof Error ? error.message : String(error)}`, "Restore and verify the checked model profile catalog.");
    return null;
  }
}

function invocationIdentity(invocation) {
  return JSON.stringify({
    role: invocation.role,
    profile_id: invocation.profile_id,
    model_id: invocation.model_id,
    reasoning_effort: invocation.reasoning_effort,
    text_verbosity: invocation.text_verbosity,
    mode: invocation.mode,
  });
}

function loadAllRequestedModelProfiles() {
  if (!allExperimentModels) return null;
  if (
    modelProfileArgIndex !== -1
    || comparisonArgIndex !== -1
    || !["baseline", "candidate"].includes(experimentProfileRole)
  ) {
    fail(
      "HARNESS-R025",
      "--all-experiment-models requires exactly --profile-role baseline|candidate and cannot be combined with --model-profile or --comparison",
      "Run one complete batch per profile role against its installed runtime root.",
    );
    return null;
  }
  try {
    const catalog = JSON.parse(fs.readFileSync(path.join(root, "quality", "model-profiles", "catalog.v1.json"), "utf8").replace(/^\uFEFF/u, ""));
    const experiment = JSON.parse(fs.readFileSync(path.join(root, "quality", "model-profiles", "experiment.v1.json"), "utf8").replace(/^\uFEFF/u, ""));
    validateModelProfileCatalog(catalog);
    validateEngineeringExperimentManifest(experiment, { catalog });
    const requestsByIdentity = new Map();
    for (const comparison of experiment.comparisons) {
      const invocation = comparison[`${experimentProfileRole}_invocation`];
      const identity = invocationIdentity(invocation);
      if (!requestsByIdentity.has(identity)) {
        const profile = catalog.profiles.find((entry) => entry.profile_id === invocation.profile_id);
        if (!profile) throw new Error(`missing catalog profile ${invocation.profile_id}`);
        requestsByIdentity.set(identity, {
          catalog,
          profile,
          invocation,
          comparisonId: null,
          experimentProfileRole,
        });
      }
    }
    const requests = [...requestsByIdentity.values()].sort((left, right) => (
      invocationIdentity(left.invocation).localeCompare(invocationIdentity(right.invocation))
    ));
    if (requests.length === 0 || requests.length > 128) {
      throw new Error(`expected 1..128 distinct invocations, got ${requests.length}`);
    }
    return { catalog, experiment, profileRole: experimentProfileRole, requests };
  } catch (error) {
    fail(
      "HARNESS-R025",
      `complete experiment model batch is invalid: ${error instanceof Error ? error.message : String(error)}`,
      "Restore and verify the checked model catalog and experiment manifest.",
    );
    return null;
  }
}

function batchModelOutput(requested) {
  const { invocation, profile } = requested;
  if (fixtureDir) {
    const fixtureMode = (readOptionalFixture("model-batch-mode") ?? "unsupported").trim();
    const base = agentOutputs.get(profile.role) ?? "";
    const acceptedLines = [
      `model: ${invocation.model_id}`,
      `reasoningEffort: ${invocation.reasoning_effort}`,
      `textVerbosity: ${invocation.text_verbosity}`,
    ];
    if (fixtureMode === "accepted") acceptedLines.push(`model_mode: ${invocation.mode}`);
    else if (fixtureMode === "ignored") {
      acceptedLines.push(`model_mode: ${invocation.mode}`);
      acceptedLines.push("reasoningEffort: fixture-conflict");
    } else if (fixtureMode !== "unsupported") {
      fail("HARNESS-R025", `unsupported model-batch fixture mode ${fixtureMode}`, "Use accepted, ignored, or unsupported.");
    }
    return `${base}\n${acceptedLines.join("\n")}\n`;
  }

  let configContent = {};
  if (process.env.OPENCODE_CONFIG_CONTENT) {
    try {
      configContent = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT);
      if (!configContent || typeof configContent !== "object" || Array.isArray(configContent)) {
        throw new Error("must be a JSON object");
      }
    } catch (error) {
      fail("HARNESS-R025", `OPENCODE_CONFIG_CONTENT is invalid: ${error.message}`, "Pass a JSON object or unset the variable.");
      return "";
    }
  }
  const existingAgent = configContent.agent?.[profile.role];
  const agentOverride = existingAgent && typeof existingAgent === "object" && !Array.isArray(existingAgent)
    ? existingAgent
    : {};
  const existingOptions = agentOverride.options && typeof agentOverride.options === "object" && !Array.isArray(agentOverride.options)
    ? agentOverride.options
    : {};
  const override = {
    ...configContent,
    agent: {
      ...(configContent.agent ?? {}),
      [profile.role]: {
        ...agentOverride,
        model: invocation.model_id,
        reasoningEffort: invocation.reasoning_effort,
        textVerbosity: invocation.text_verbosity,
        options: {
          ...existingOptions,
          reasoningEffort: invocation.reasoning_effort,
          textVerbosity: invocation.text_verbosity,
          model_mode: invocation.mode,
        },
      },
    },
  };
  return runOpenCode(
    `model-batch-${profile.role}`,
    ["debug", "agent", profile.role],
    { env: { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(override) } },
  );
}

function captureRuntimeModelEvidence(requested, { output = null, batch = false, createdAt = null } = {}) {
  if (requested === null) return null;
  const { catalog, profile, invocation } = requested;
  const resolvedOutput = output ?? agentOutputs.get(profile.role) ?? "";
  const model = optionResult("model", invocation.model_id, resolvedConfigValue(resolvedOutput, ["model", "options.model"]), { allowAlias: true });
  const reasoning = optionResult(
    "reasoning_effort",
    invocation.reasoning_effort,
    resolvedConfigValue(resolvedOutput, ["reasoningEffort", "options.reasoningEffort", "reasoning_effort", "options.reasoning_effort"]),
  );
  const verbosity = optionResult(
    "text_verbosity",
    invocation.text_verbosity,
    resolvedConfigValue(resolvedOutput, ["textVerbosity", "options.textVerbosity", "text_verbosity", "options.text_verbosity"]),
  );
  // OpenCode documentation does not currently establish the API-level standard/pro
  // mode as a resolved agent-config key. Only an explicit runtime-specific key can
  // prove it; the ordinary agent `mode` field is primary/subagent and is unrelated.
  const mode = optionResult(
    "mode",
    invocation.mode,
    resolvedConfigValue(resolvedOutput, ["model_mode", "options.model_mode", "provider.mode"]),
    { unsupportedWhenAbsent: true },
  );
  const optionResults = [model, reasoning, verbosity, mode];
  const requestedCapabilityIds = [
    ...(invocation.reasoning_effort === "xhigh" ? ["reasoning_effort_xhigh"] : []),
    ...(invocation.reasoning_effort === "max" ? ["reasoning_effort_max"] : []),
    ...(invocation.mode === "pro" ? ["mode_pro"] : []),
  ];
  for (const capabilityId of requestedCapabilityIds) {
    let source = { value: null, values: [] };
    let requestedValue = null;
    if (capabilityId === "reasoning_effort_xhigh") {
      source = reasoning;
      requestedValue = "xhigh";
    } else if (capabilityId === "reasoning_effort_max") {
      source = reasoning;
      requestedValue = "max";
    } else if (capabilityId === "mode_pro") {
      source = mode;
      requestedValue = "pro";
    }
    optionResults.push({
      option_id: capabilityId,
      requested_value: requestedValue,
      effective_value: source.effective_value ?? source.value ?? null,
      status: source.status ?? "unsupported",
    });
  }
  const capturedAt = createdAt ?? process.env.HARNESS_EVIDENCE_TIMESTAMP ?? new Date().toISOString();
  assertIsoTimestamp(capturedAt, "HARNESS_EVIDENCE_TIMESTAMP");
  const invocationFingerprint = fingerprint(JSON.parse(invocationIdentity(invocation))).slice(7, 23);
  const evidence = sealRuntimeModelEvidence({
    schema_version: 1,
    evidence_id: batch
      ? `runtime-model-${profile.profile_id}-${invocationFingerprint}`
      : `runtime-model-${profile.profile_id}${requested.comparisonId ? `-${requested.comparisonId}-${requested.experimentProfileRole}` : ""}`,
    evidence_kind: fixtureDir ? "fixture_parser" : "installed_runtime",
    runtime_name: "opencode",
    runtime_version: fixtureDir ? null : installedRuntimeVersion,
    captured_at: capturedAt,
    catalog_id: catalog.catalog_id,
    catalog_fingerprint: catalog.content_fingerprint,
    requested_profile_id: profile.profile_id,
    requested_model_id: profile.model_id,
    effective_model_id: model.effective_value,
    option_results: optionResults,
    complete: optionResults.every((entry) => entry.status === "accepted"),
    source_command_id: batch
      ? `opencode-debug-agent-${profile.role}-batch-${invocationFingerprint}`
      : `opencode-debug-agent-${profile.role}`,
  });
  return { catalog, evidence, createdAt: capturedAt, invocation };
}

function persistEvidenceDocument(document, createdAt, label) {
  assertPersistenceSafe(document, { label: `${label} evidence` });
  const evidenceWorkspace = path.resolve(process.env.HARNESS_EVIDENCE_WORKSPACE || root);
  const harnessRoot = resolveHarnessRoot(evidenceWorkspace);
  const evidenceDir = path.join(harnessRoot, "evidence");
  ensureConfinedDirectory(harnessRoot, evidenceDir);
  const timestamp = createdAt.replace(/[-:.]/g, "").replace(/[+]/g, "p");
  const evidencePath = path.join(evidenceDir, `${timestamp}-${label}-${randomUUID()}.json`);
  atomicWriteJson(evidencePath, document, { immutable: true, basePath: harnessRoot });
  return path.relative(evidenceWorkspace, evidencePath).replaceAll("\\", "/");
}

function persistRuntimeModelBatch(evidence, createdAt, profileRole) {
  if (!Array.isArray(evidence) || evidence.length === 0 || evidence.length > 128) {
    throw new Error("runtime model batch must contain 1..128 entries");
  }
  const identities = evidence.map((entry) => {
    const options = new Map(entry.option_results.map((option) => [option.option_id, option.requested_value]));
    return JSON.stringify({
      requested_profile_id: entry.requested_profile_id,
      requested_model_id: entry.requested_model_id,
      reasoning_effort: options.get("reasoning_effort"),
      text_verbosity: options.get("text_verbosity"),
      mode: options.get("mode"),
    });
  });
  if (new Set(identities).size !== identities.length) {
    throw new Error("runtime model batch contains duplicate exact invocations");
  }
  const evidenceWorkspace = path.resolve(process.env.HARNESS_EVIDENCE_WORKSPACE || root);
  const harnessRoot = resolveHarnessRoot(evidenceWorkspace);
  const evidenceDir = path.join(harnessRoot, "evidence", "runtime-model-batches");
  ensureConfinedDirectory(harnessRoot, evidenceDir);
  const timestamp = createdAt.replace(/[-:.]/g, "").replace(/[+]/g, "p");
  const batchId = `runtime-batch-${profileRole}-${randomUUID()}`;
  const batchFile = `${timestamp}-runtime-batch-${profileRole}-${batchId}.json`;
  const modelFiles = evidence.map((entry, index) => (
    `${timestamp}-model-${profileRole}-${String(index + 1).padStart(3, "0")}-${entry.evidence_id}-${batchId}.json`
  ));
  const markerFile = `${timestamp}-runtime-batch-${profileRole}-${batchId}.complete.json`;
  const batchFingerprint = fingerprint(evidence.map((entry) => entry.content_fingerprint));
  const marker = {
    schema_version: 1,
    batch_id: batchId,
    profile_role: profileRole,
    created_at: createdAt,
    entry_count: evidence.length,
    batch_file: batchFile,
    batch_fingerprint: batchFingerprint,
    model_files: modelFiles,
    model_fingerprints: evidence.map((entry) => entry.content_fingerprint),
  };
  assertPersistenceSafe(evidence, { label: "runtime model batch" });
  assertPersistenceSafe(marker, { label: "runtime model batch marker" });
  atomicWriteJson(path.join(evidenceDir, batchFile), evidence, { immutable: true, basePath: harnessRoot });
  evidence.forEach((entry, index) => {
    atomicWriteJson(path.join(evidenceDir, modelFiles[index]), entry, { immutable: true, basePath: harnessRoot });
  });
  atomicWriteJson(path.join(evidenceDir, markerFile), marker, { immutable: true, basePath: harnessRoot });
  return {
    directory: path.relative(evidenceWorkspace, evidenceDir).replaceAll("\\", "/"),
    batchFile,
    markerFile,
  };
}

function assertOnlyPermission(output, key, expected, label, code, fix) {
  const values = permissionValues(output, key);
  const effective = effectivePermissionValue(values);
  if (effective !== expected) {
    fail(code, `${label} expected only ${key}: ${expected}, got ${formatValues(values)}`, fix);
  }
}

function assertNoPermission(output, key, forbiddenValues, label, code, fix) {
  const values = permissionValues(output, key);
  const effective = effectivePermissionValue(values);
  if (effective !== null && forbiddenValues.includes(effective)) {
    fail(code, `${label} unexpectedly exposes ${key}: ${effective}`, fix);
  }
}

function assertNoPermissionPrefix(output, prefix, forbiddenValues, label, code, fix) {
  const surface = extractPermissionSurface(output);
  const exposed = Object.entries(surface.permissions)
    .filter(([key, action]) => key.startsWith(prefix) && forbiddenValues.includes(action))
    .sort(([left], [right]) => left.localeCompare(right));
  if (exposed.length > 0) {
    fail(code, `${label} unexpectedly exposes ${exposed.map(([key, action]) => `${key}: ${action}`).join(", ")}`, fix);
  }
}

const agentInventoryOutput = runOpenCode("agent-list", ["agent", "list"]);
const installedAgentInventory = parseAgentInventory(agentInventoryOutput);
const installedAgentNames = installedAgentInventory.map(({ name }) => name);
if (failures.length > 0) reportAndExit();

const configOutput = runOpenCode("debug-config", ["debug", "config"]);
const agentOutputs = new Map();

for (const agent of installedAgentNames) {
  agentOutputs.set(agent, runOpenCode(`debug-agent-${agent}`, ["debug", "agent", agent]));
}

assertOnlyPermission(configOutput, "default_agent", "orchestrator", "opencode debug config", "HARNESS-R004", "The installed profile should use the harness orchestrator as default.");
assertOnlyPermission(configOutput, "oc_learning_*", "deny", "opencode debug config", "HARNESS-R006", "Root oc_learning tools should be denied outside the bounded improver path.");

for (const agent of ["orchestrator", "orchestrator-deep", "review-orchestrator", "explore", "architect", "reviewer", "diagnose", "verifier"]) {
  const output = agentOutputs.get(agent) ?? "";
  for (const tool of ["context_outline", "context_files", "context_search", "context_read"]) {
    assertOnlyPermission(output, tool, "allow", `opencode debug agent ${agent}`, "HARNESS-R007", "Install or enable opencode-recursive-context for broad read-only context.");
  }
}

for (const agent of ["review-orchestrator", "explore", "architect", "reviewer", "diagnose", "verifier", "researcher", "improver"]) {
  assertOnlyPermission(agentOutputs.get(agent) ?? "", "edit", "deny", `opencode debug agent ${agent}`, "HARNESS-R009", "Read-only subagents should deny edits.");
}

assertOnlyPermission(agentOutputs.get("general") ?? "", "edit", "allow", "opencode debug agent general", "HARNESS-R016", "Implementation worker should declare edit access explicitly.");
assertOnlyPermission(agentOutputs.get("researcher") ?? "", "websearch", "allow", "opencode debug agent researcher", "HARNESS-R010", "Researcher should retain web research tools.");
assertOnlyPermission(agentOutputs.get("researcher") ?? "", "webfetch", "allow", "opencode debug agent researcher", "HARNESS-R011", "Researcher should retain web research tools.");
assertOnlyPermission(agentOutputs.get("improver") ?? "", "oc_learning_*", "ask", "opencode debug agent improver", "HARNESS-R012", "Improver should be the bounded self-improvement write path.");

const reviewOrchestratorOutput = agentOutputs.get("review-orchestrator") ?? "";
assertOnlyPermission(reviewOrchestratorOutput, "task.*", "deny", "opencode debug agent review-orchestrator", "HARNESS-R017", "Review primary should default-deny task delegation.");
for (const agent of ["explore", "reviewer", "researcher", "verifier"]) {
  assertOnlyPermission(reviewOrchestratorOutput, `task.${agent}`, "allow", "opencode debug agent review-orchestrator", "HARNESS-R017", "Review primary should allow only read-only support delegates.");
}
for (const agent of ["general", "architect", "diagnose", "improver"]) {
  assertNoPermission(reviewOrchestratorOutput, `task.${agent}`, ["ask", "allow"], "opencode debug agent review-orchestrator", "HARNESS-R018", "Review primary must not delegate to implementation, write planning, diagnosis, or self-improvement agents.");
}

for (const agent of installedAgentNames.filter((name) => name !== "researcher")) {
  const output = agentOutputs.get(agent) ?? "";
  assertNoPermission(output, "websearch", ["ask", "allow"], `opencode debug agent ${agent}`, "HARNESS-R014", "Only researcher should expose web search.");
  assertNoPermission(output, "webfetch", ["ask", "allow"], `opencode debug agent ${agent}`, "HARNESS-R015", "Only researcher should expose web fetch.");
}

for (const agent of installedAgentNames.filter((name) => name !== "improver")) {
  assertNoPermissionPrefix(agentOutputs.get(agent) ?? "", "oc_learning_", ["ask", "allow"], `opencode debug agent ${agent}`, "HARNESS-R013", "Only improver should ask for any oc_learning write tool.");
}

if (failures.length > 0) {
  reportAndExit();
}

if (evidenceProfileArgIndex !== -1) {
  const surface = collectResolvedPermissionSurface({ configOutput, agentOutputs, agentNames: installedAgentNames });
  const runtimeFingerprint = runtimeOutputsFingerprint({ configOutput, agentOutputs, agentInventory: installedAgentInventory });
  const surfaceFingerprint = fingerprint(surface.permissions);
  const subjectFingerprint = subjectEvidence.repository_fingerprint;

  const createdAt = process.env.HARNESS_EVIDENCE_TIMESTAMP || new Date().toISOString();
  assertIsoTimestamp(createdAt, "HARNESS_EVIDENCE_TIMESTAMP");
  const snapshot = {
    schema_version: 1,
    producer_id: EVIDENCE_PRODUCERS.runtimePermissionSnapshot,
    profile_id: evidenceProfile,
    subject_fingerprint: subjectFingerprint,
    runtime_fingerprint: runtimeFingerprint,
    surface_fingerprint: surfaceFingerprint,
    profile_fingerprint: permissionProfileFingerprint({
      subjectFingerprint,
      runtimeFingerprint,
      surfaceFingerprint,
    }),
    permissions: surface.permissions,
    source: fixtureDir ? "fixture" : "installed_runtime",
    complete: surface.complete,
    incomplete_scopes: surface.incomplete_scopes,
    created_at: createdAt,
  };
  assertPersistenceSafe(snapshot, { label: "runtime permission evidence" });
  const evidenceWorkspace = path.resolve(process.env.HARNESS_EVIDENCE_WORKSPACE || root);
  const harnessRoot = resolveHarnessRoot(evidenceWorkspace);
  const evidenceDir = path.join(harnessRoot, "evidence");
  ensureConfinedDirectory(harnessRoot, evidenceDir);
  const timestamp = createdAt.replace(/[-:.]/g, "").replace(/[+]/g, "p");
  const evidencePath = path.join(evidenceDir, `${timestamp}-permission-${evidenceProfile}-${randomUUID()}.json`);
  atomicWriteJson(evidencePath, snapshot, { immutable: true, basePath: harnessRoot });
  console.log(`Permission evidence written: ${path.relative(evidenceWorkspace, evidencePath).replaceAll("\\", "/")}`);
  if (!surface.complete) {
    fail(
      "HARNESS-R021",
      `permission evidence is incomplete for scopes: ${surface.incomplete_scopes.join(", ")}`,
      "Use complete supported debug output with only allow, ask, or deny actions.",
    );
    reportAndExit();
  }
}

const requestedModelBatch = loadAllRequestedModelProfiles();
if (failures.length > 0) reportAndExit();
if (requestedModelBatch !== null) {
  const createdAt = process.env.HARNESS_EVIDENCE_TIMESTAMP || new Date().toISOString();
  assertIsoTimestamp(createdAt, "HARNESS_EVIDENCE_TIMESTAMP");
  const captured = requestedModelBatch.requests.map((requested) => captureRuntimeModelEvidence(requested, {
    output: batchModelOutput(requested),
    batch: true,
    createdAt,
  }));
  const evidence = captured.map((entry) => entry.evidence);
  evidence.forEach((entry) => validateRuntimeModelEvidence(entry, { catalog: requestedModelBatch.catalog }));
  const decisions = captured.map((entry) => evaluateRuntimeModelEvidence(
    entry.evidence,
    entry.catalog,
    { expectedInvocation: entry.invocation },
  ));
  const ineligible = decisions.filter((decision) => !decision.eligible);
  if (ineligible.length > 0) {
    const reasonCodes = [...new Set(ineligible.flatMap((decision) => decision.reason_codes))].sort();
    fail(
      "HARNESS-R025",
      `${ineligible.length}/${decisions.length} distinct ${requestedModelBatch.profileRole} invocations are not runtime-eligible: ${reasonCodes.join(", ")}`,
      "Use installed-runtime output that accepts every exact model, effort, verbosity, and mode override; fixture, unsupported, ignored, alias, and conflicting values never authorize execution.",
    );
  }
  if (failures.length > 0) reportAndExit();
  const persisted = persistRuntimeModelBatch(evidence, createdAt, requestedModelBatch.profileRole);
  console.log(`Complete runtime model batch written: ${persisted.directory}/${persisted.batchFile}`);
  console.log(`Runtime model batch completion marker: ${persisted.directory}/${persisted.markerFile}`);
}

const requestedModelProfile = loadRequestedModelProfile();
if (failures.length > 0) reportAndExit();
if (requestedModelProfile !== null) {
  const captured = captureRuntimeModelEvidence(requestedModelProfile);
  const relativeEvidencePath = persistEvidenceDocument(
    captured.evidence,
    captured.createdAt,
    `model-${captured.evidence.requested_profile_id}`,
  );
  console.log(`Model evidence written: ${relativeEvidencePath}`);
  const decision = evaluateRuntimeModelEvidence(captured.evidence, captured.catalog, { expectedInvocation: captured.invocation });
  if (!decision.eligible) {
    fail(
      "HARNESS-R025",
      `model profile ${captured.evidence.requested_profile_id} is not runtime-eligible: ${decision.reason_codes.join(", ")}`,
      "Use installed-runtime output that proves every requested option exactly; do not promote fixture, absent, ignored, alias, conflicting, or unsupported options.",
    );
    reportAndExit();
  }
}

console.log(`Harness runtime verification passed for ${runtimeCwd}.`);
