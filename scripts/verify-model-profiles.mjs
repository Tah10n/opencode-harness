import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MODEL_PROFILE_ROLES,
  bindInstalledRuntimeEvidence,
  createDefaultExperimentScenarioCells,
  createDefaultModelProfileCatalog,
  createEngineeringExperimentManifest,
  evaluateRuntimeModelEvidence,
  sealEngineeringExperimentManifest,
  sealModelProfileCatalog,
  sealRuntimeModelEvidence,
  validateEngineeringExperimentManifest,
  validateModelProfileCatalog,
  validateRuntimeModelEvidence,
} from "../lib/quality/model-profiles.mjs";
import {
  parsePromptFrontmatter,
  validatePromptInventory,
} from "../lib/quality/prompt-inventory.mjs";
import { ContractError, canonicalJson } from "../lib/quality/validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const startingCommit = "0a1d56605b9b8923ac27c3b3b405b38177ca7741";
const catalogPath = path.join(root, "quality", "model-profiles", "catalog.v1.json");
const experimentPath = path.join(root, "quality", "model-profiles", "experiment.v1.json");
const runtimeFixturePath = path.join(root, "quality", "model-profiles", "runtime-fixture-evidence.v1.json");
const promptBaselinePath = path.join(root, "quality", "prompt-inventory", "baseline.v1.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function expectContractError(code, action) {
  try {
    action();
  } catch (error) {
    if (error instanceof ContractError && error.code === code) return;
    throw error;
  }
  throw new Error(`expected ${code}`);
}

function provenanceError(code, message) {
  throw new ContractError(code, message);
}

function readStartingAgentDefinitions() {
  return new Map(MODEL_PROFILE_ROLES.map((role) => {
    const promptPath = `agents/${role}.md`;
    let content;
    try {
      content = execFileSync("git", ["show", `${startingCommit}:${promptPath}`], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      });
    } catch (error) {
      provenanceError(
        "MODEL_BASELINE_SOURCE_UNAVAILABLE",
        `cannot read ${promptPath} from immutable starting commit: ${error.status ?? error.code ?? error.message}`,
      );
    }
    const { frontmatter } = parsePromptFrontmatter(content, `${startingCommit}:${promptPath}`);
    return [role, { path: promptPath, frontmatter }];
  }));
}

function readActiveAgentDefinitions() {
  return new Map(MODEL_PROFILE_ROLES.map((role) => {
    const promptPath = `agents/${role}.md`;
    const content = fs.readFileSync(path.join(root, ...promptPath.split("/")), "utf8");
    const { frontmatter } = parsePromptFrontmatter(content, promptPath);
    return [role, { path: promptPath, frontmatter }];
  }));
}

function assertBaselineProfileProvenance(catalog, promptBaseline, startingDefinitions) {
  if (catalog.baseline_commit !== startingCommit) {
    provenanceError("MODEL_BASELINE_CATALOG_COMMIT", "model catalog is not bound to the immutable starting commit");
  }
  if (
    promptBaseline.baseline_commit !== startingCommit
    || promptBaseline.source_kind !== "git_commit"
    || promptBaseline.source_revision !== startingCommit
  ) {
    provenanceError("MODEL_BASELINE_PROMPT_COMMIT", "prompt baseline is not bound to the immutable starting commit");
  }

  const profilesByRole = new Map();
  for (const profile of catalog.profiles.filter((entry) => entry.family === "gpt-5.5-baseline")) {
    if (profilesByRole.has(profile.role)) {
      provenanceError("MODEL_BASELINE_PROFILE_DUPLICATE", `duplicate baseline profile for ${profile.role}`);
    }
    profilesByRole.set(profile.role, profile);
  }
  const promptsByPath = new Map(promptBaseline.entries.map((entry) => [entry.path, entry]));

  for (const role of MODEL_PROFILE_ROLES) {
    const profile = profilesByRole.get(role);
    if (!profile) provenanceError("MODEL_BASELINE_PROFILE_MISSING", `missing baseline profile for ${role}`);
    const definition = startingDefinitions.get(role);
    if (!definition) provenanceError("MODEL_BASELINE_SOURCE_MISSING", `missing immutable starting definition for ${role}`);
    const promptEntry = promptsByPath.get(definition.path);
    if (!promptEntry) provenanceError("MODEL_BASELINE_PROMPT_MISSING", `prompt baseline is missing ${definition.path}`);

    const sourceFields = {
      model: definition.frontmatter.model,
      reasoningEffort: definition.frontmatter.reasoningEffort,
      textVerbosity: definition.frontmatter.textVerbosity,
      temperature: definition.frontmatter.temperature,
    };
    // Starting agent frontmatter uses `mode` for primary/subagent classification,
    // not for the runtime model mode. An absent dedicated modelMode is therefore
    // the explicit standard-mode baseline rather than permission to infer pro.
    const sourceRuntimeModelMode = definition.frontmatter.modelMode ?? "standard";
    const promptFields = {
      model: promptEntry.model,
      reasoningEffort: promptEntry.options.reasoningEffort,
      textVerbosity: promptEntry.options.textVerbosity,
      temperature: promptEntry.options.temperature,
    };
    if (canonicalJson(promptFields) !== canonicalJson(sourceFields)) {
      provenanceError(
        "MODEL_BASELINE_PROMPT_SOURCE_MISMATCH",
        `${definition.path} prompt inventory does not match its immutable starting definition`,
      );
    }
    if (profile.model_id !== sourceFields.model) {
      provenanceError("MODEL_BASELINE_MODEL", `${profile.profile_id} changes the starting model`);
    }
    if (profile.default_reasoning_effort !== sourceFields.reasoningEffort) {
      provenanceError("MODEL_BASELINE_EFFORT", `${profile.profile_id} changes the starting reasoning effort`);
    }
    if (profile.default_text_verbosity !== sourceFields.textVerbosity) {
      provenanceError("MODEL_BASELINE_VERBOSITY", `${profile.profile_id} changes the starting text verbosity`);
    }
    if (!Object.is(profile.temperature, sourceFields.temperature)) {
      provenanceError("MODEL_BASELINE_TEMPERATURE", `${profile.profile_id} changes the starting temperature`);
    }
    if (profile.mode !== sourceRuntimeModelMode) {
      provenanceError("MODEL_BASELINE_MODE", `${profile.profile_id} changes the starting runtime model mode`);
    }
    if (profile.provenance?.kind !== "starting_commit" || profile.provenance.reference !== startingCommit) {
      provenanceError("MODEL_BASELINE_PROVENANCE", `${profile.profile_id} has invalid starting-commit provenance`);
    }
  }
  if (profilesByRole.size !== MODEL_PROFILE_ROLES.length) {
    provenanceError("MODEL_BASELINE_PROFILE_SET", "baseline catalog contains an unexpected role profile");
  }
}

function assertActiveProfileConfiguration(catalog, activeDefinitions) {
  if (
    catalog.default_profile_policy.active_family !== "gpt-5.6-candidate"
    || catalog.default_profile_policy.state !== "directly_activated"
  ) {
    provenanceError("MODEL_ACTIVE_POLICY", "catalog does not declare the GPT-5.6 family as directly active");
  }

  const activeProfilesByRole = new Map();
  for (const profile of catalog.profiles.filter((entry) => entry.promotion_state === "active_default")) {
    if (activeProfilesByRole.has(profile.role)) {
      provenanceError("MODEL_ACTIVE_PROFILE_DUPLICATE", `duplicate active profile for ${profile.role}`);
    }
    activeProfilesByRole.set(profile.role, profile);
  }

  for (const role of MODEL_PROFILE_ROLES) {
    const profile = activeProfilesByRole.get(role);
    if (!profile) provenanceError("MODEL_ACTIVE_PROFILE_MISSING", `missing active profile for ${role}`);
    const definition = activeDefinitions.get(role);
    if (!definition) provenanceError("MODEL_ACTIVE_SOURCE_MISSING", `missing active definition for ${role}`);
    const fields = definition.frontmatter;
    if (fields.model !== profile.model_id) {
      provenanceError("MODEL_ACTIVE_MODEL", `${definition.path} does not use ${profile.model_id}`);
    }
    if (fields.reasoningEffort !== profile.default_reasoning_effort) {
      provenanceError("MODEL_ACTIVE_EFFORT", `${definition.path} does not preserve its configured reasoning effort`);
    }
    if (fields.textVerbosity !== profile.default_text_verbosity) {
      provenanceError("MODEL_ACTIVE_VERBOSITY", `${definition.path} does not preserve its configured text verbosity`);
    }
    if ((fields.modelMode ?? "standard") !== profile.mode) {
      provenanceError("MODEL_ACTIVE_MODE", `${definition.path} does not use the active profile mode`);
    }
    if (Object.hasOwn(fields, "temperature")) {
      provenanceError("MODEL_ACTIVE_TEMPERATURE", `${definition.path} must omit temperature for GPT-5.6`);
    }
  }
  if (activeProfilesByRole.size !== MODEL_PROFILE_ROLES.length) {
    provenanceError("MODEL_ACTIVE_PROFILE_SET", "active catalog contains an unexpected role profile");
  }
}

function cloneDefinitionsWithPatch(definitions, role, patch) {
  const cloned = new Map([...definitions].map(([key, value]) => [key, {
    ...value,
    frontmatter: { ...value.frontmatter },
  }]));
  const current = cloned.get(role);
  cloned.set(role, { ...current, frontmatter: { ...current.frontmatter, ...patch } });
  return cloned;
}

function cloneWithBaselinePatch(catalog, role, patch) {
  const cloned = JSON.parse(JSON.stringify(catalog));
  const index = cloned.profiles.findIndex((entry) => entry.family === "gpt-5.5-baseline" && entry.role === role);
  if (index === -1) throw new Error(`test fixture is missing baseline role ${role}`);
  cloned.profiles[index] = { ...cloned.profiles[index], ...patch };
  return cloned;
}

function resealRuntime(evidence, patch = {}) {
  return sealRuntimeModelEvidence({ ...evidence, ...patch });
}

const catalog = readJson(catalogPath);
const experiment = readJson(experimentPath);
const runtimeFixture = readJson(runtimeFixturePath);
const promptBaseline = readJson(promptBaselinePath);

validateModelProfileCatalog(catalog);
validateEngineeringExperimentManifest(experiment, { catalog });
validateRuntimeModelEvidence(runtimeFixture, { catalog });
validatePromptInventory(promptBaseline);

const startingDefinitions = readStartingAgentDefinitions();
assertBaselineProfileProvenance(catalog, promptBaseline, startingDefinitions);
const activeDefinitions = readActiveAgentDefinitions();
assertActiveProfileConfiguration(catalog, activeDefinitions);

expectContractError("MODEL_ACTIVE_MODEL", () => assertActiveProfileConfiguration(
  catalog,
  cloneDefinitionsWithPatch(activeDefinitions, "general", { model: "openai/gpt-5.5" }),
));
expectContractError("MODEL_ACTIVE_EFFORT", () => assertActiveProfileConfiguration(
  catalog,
  cloneDefinitionsWithPatch(activeDefinitions, "general", { reasoningEffort: "medium" }),
));
expectContractError("MODEL_ACTIVE_TEMPERATURE", () => assertActiveProfileConfiguration(
  catalog,
  cloneDefinitionsWithPatch(activeDefinitions, "general", { temperature: 0.2 }),
));

for (const [code, field, value] of [
  ["MODEL_BASELINE_MODEL", "model_id", "openai/test-mutated-model"],
  ["MODEL_BASELINE_EFFORT", "default_reasoning_effort", "none"],
  ["MODEL_BASELINE_VERBOSITY", "default_text_verbosity", "high"],
  ["MODEL_BASELINE_TEMPERATURE", "temperature", 0.9],
  ["MODEL_BASELINE_MODE", "mode", "pro"],
]) {
  expectContractError(code, () => assertBaselineProfileProvenance(
    cloneWithBaselinePatch(catalog, "general", { [field]: value }),
    promptBaseline,
    startingDefinitions,
  ));
}
expectContractError("MODEL_BASELINE_PROVENANCE", () => assertBaselineProfileProvenance(
  cloneWithBaselinePatch(catalog, "general", {
    provenance: { ...catalog.profiles.find((entry) => entry.profile_id === "baseline-general").provenance, reference: "f".repeat(40) },
  }),
  promptBaseline,
  startingDefinitions,
));
const missingBaselineRole = JSON.parse(JSON.stringify(catalog));
missingBaselineRole.profiles = missingBaselineRole.profiles.filter((entry) => entry.profile_id !== "baseline-general");
expectContractError("MODEL_BASELINE_PROFILE_MISSING", () => (
  assertBaselineProfileProvenance(missingBaselineRole, promptBaseline, startingDefinitions)
));
const duplicateBaselineRole = JSON.parse(JSON.stringify(catalog));
duplicateBaselineRole.profiles.push({
  ...duplicateBaselineRole.profiles.find((entry) => entry.profile_id === "baseline-general"),
  profile_id: "baseline-general-duplicate",
});
expectContractError("MODEL_BASELINE_PROFILE_DUPLICATE", () => (
  assertBaselineProfileProvenance(duplicateBaselineRole, promptBaseline, startingDefinitions)
));
expectContractError("MODEL_BASELINE_CATALOG_COMMIT", () => assertBaselineProfileProvenance(
  { ...catalog, baseline_commit: "f".repeat(40) },
  promptBaseline,
  startingDefinitions,
));

// This comparison proves deterministic regeneration only. Immutable starting-commit
// provenance is established independently above from Git and the sealed prompt inventory.
const generatedCatalog = createDefaultModelProfileCatalog();
const generatedExperiment = createEngineeringExperimentManifest(
  generatedCatalog,
  createDefaultExperimentScenarioCells(generatedCatalog),
);
check(canonicalJson(catalog) === canonicalJson(generatedCatalog), "checked-in model catalog is not reproducible");
check(canonicalJson(experiment) === canonicalJson(generatedExperiment), "checked-in experiment plan is not reproducible");
check(experiment.comparisons.length === 96, "experiment universe must contain exactly 96 paired comparisons");
check(experiment.execution_state === "planned_unexecuted", "experiment must not claim live execution");

const roles = new Set(experiment.scenario_cells.map((entry) => entry.role));
check(roles.size === 11, "all 11 harness roles must be primary in the experiment");
check(
  canonicalJson(experiment.scenario_cells.map((entry) => entry.scenario_id)) === canonicalJson([
    "quality-cross-module-invariant",
    "quality-public-api-compatibility",
    "quality-architecture-boundary",
    "quality-concurrency-cancellation",
    "quality-parser-boundaries",
    "quality-small-local-control",
    "quality-persistence-rollback",
    "quality-retry-idempotency",
    "quality-stale-cache-version-skew",
    "quality-partial-dependency-failure",
    "quality-resource-lifecycle",
    "quality-migration-compatibility",
  ]),
  "experiment scenario cells must align with the canonical quality corpus",
);
check(
  experiment.scenario_cells.filter((entry) => entry.suite === "development").length === 6
  && experiment.scenario_cells.filter((entry) => entry.suite === "held_out").length === 4
  && experiment.scenario_cells.filter((entry) => entry.suite === "canary").length === 2,
  "experiment suite split must be 6 development, 4 held-out, and 2 canary",
);
const lunaCells = experiment.scenario_cells.filter((entry) => entry.candidate_profile_id.includes("luna"));
check(
  lunaCells.length === 1
  && lunaCells[0].risk_class === "standard-lite"
  && lunaCells[0].workload_class === "high-volume",
  "Luna must have exactly one standard-lite high-volume cell",
);

const fixtureDecision = evaluateRuntimeModelEvidence(runtimeFixture, catalog);
check(!fixtureDecision.eligible, "fixture_parser evidence must never authorize a candidate");
check(
  fixtureDecision.reason_codes.includes("RUNTIME_MODEL_INSTALLED_EVIDENCE_REQUIRED"),
  "fixture rejection must explain the missing installed runtime",
);
for (const purpose of ["default_promotion", "max_experiment", "pro_experiment"]) {
  check(
    !evaluateRuntimeModelEvidence(runtimeFixture, catalog, { purpose }).eligible,
    `fixture_parser evidence must never authorize ${purpose}`,
  );
}

const installedGeneral = sealRuntimeModelEvidence({
  ...runtimeFixture,
  evidence_id: "test-only-installed-general",
  evidence_kind: "installed_runtime",
  runtime_name: "test-only-opencode",
  runtime_version: "test-only",
  source_command_id: "test-only:opencode-debug-agent-general",
});
const executionDecision = evaluateRuntimeModelEvidence(installedGeneral, catalog);
check(executionDecision.eligible, "complete exact installed-runtime evidence should authorize candidate execution");
const promotionDecision = evaluateRuntimeModelEvidence(installedGeneral, catalog, { purpose: "default_promotion" });
check(!promotionDecision.eligible, "runtime parsing alone must not authorize default promotion");
check(
  promotionDecision.reason_codes.includes("RUNTIME_MODEL_BEHAVIORAL_ACCEPTANCE_REQUIRED"),
  "default promotion must require behavioral acceptance",
);

const aliasEvidence = resealRuntime(installedGeneral, { effective_model_id: "openai/gpt-5.6" });
check(!evaluateRuntimeModelEvidence(aliasEvidence, catalog).eligible, "generic alias must fail closed");
const requestedAliasOptions = installedGeneral.option_results.map((entry) => (
  entry.option_id === "model" ? { ...entry, requested_value: "openai/gpt-5.6" } : entry
));
check(
  !evaluateRuntimeModelEvidence(resealRuntime(installedGeneral, { option_results: requestedAliasOptions }), catalog).eligible,
  "requested generic alias must fail closed even when the effective identity is exact",
);
check(
  !evaluateRuntimeModelEvidence(resealRuntime(installedGeneral, { runtime_version: null }), catalog).eligible,
  "installed evidence without a runtime version must fail closed",
);
const ignoredOptions = installedGeneral.option_results.map((entry) => (
  entry.option_id === "reasoning_effort" ? { ...entry, status: "ignored", effective_value: null } : entry
));
expectContractError("RUNTIME_MODEL_COMPLETENESS", () => (
  evaluateRuntimeModelEvidence(resealRuntime(installedGeneral, { option_results: ignoredOptions }), catalog)
));
check(
  !evaluateRuntimeModelEvidence(resealRuntime(installedGeneral, {
    option_results: ignoredOptions,
    complete: false,
  }), catalog).eligible,
  "ignored requested option must fail closed",
);
const missingOptions = installedGeneral.option_results.filter((entry) => entry.option_id !== "text_verbosity");
check(
  !evaluateRuntimeModelEvidence(resealRuntime(installedGeneral, {
    option_results: missingOptions,
    complete: false,
  }), catalog).eligible,
  "absent requested option must fail closed",
);
const conflictingOptions = installedGeneral.option_results.map((entry) => (
  entry.option_id === "mode" ? { ...entry, status: "conflicting", effective_value: "pro" } : entry
));
check(
  !evaluateRuntimeModelEvidence(resealRuntime(installedGeneral, {
    option_results: conflictingOptions,
    complete: false,
  }), catalog).eligible,
  "conflicting requested option must fail closed",
);

const orchestratorEvidence = sealRuntimeModelEvidence({
  ...installedGeneral,
  evidence_id: "test-only-installed-orchestrator",
  requested_profile_id: "candidate-sol-orchestrator",
  requested_model_id: "openai/gpt-5.6-sol",
  option_results: installedGeneral.option_results.map((entry) => (
    entry.option_id === "reasoning_effort"
      ? { ...entry, requested_value: "xhigh", effective_value: "xhigh" }
      : entry
  )),
  source_command_id: "test-only:opencode-debug-agent-orchestrator",
});
check(
  !evaluateRuntimeModelEvidence(orchestratorEvidence, catalog).eligible,
  "xhigh profile must require an explicit installed capability result",
);
const xhighEvidence = resealRuntime(orchestratorEvidence, {
  option_results: [
    ...orchestratorEvidence.option_results,
    {
      option_id: "reasoning_effort_xhigh",
      requested_value: "xhigh",
      effective_value: "xhigh",
      status: "accepted",
    },
  ],
});
check(
  evaluateRuntimeModelEvidence(xhighEvidence, catalog).eligible,
  "exact installed xhigh evidence should authorize candidate execution without mutating the checked catalog",
);
const xhighCatalog = bindInstalledRuntimeEvidence(catalog, xhighEvidence);
const boundXhighEvidence = resealRuntime(xhighEvidence, { catalog_fingerprint: xhighCatalog.content_fingerprint });
check(
  evaluateRuntimeModelEvidence(boundXhighEvidence, xhighCatalog).eligible,
  "explicit bound xhigh runtime evidence should satisfy candidate execution",
);
check(
  !evaluateRuntimeModelEvidence(boundXhighEvidence, xhighCatalog, { purpose: "max_experiment" }).eligible,
  "max experiment must remain blocked until its catalog capability is required and proven",
);
check(
  !evaluateRuntimeModelEvidence(boundXhighEvidence, xhighCatalog, { purpose: "pro_experiment" }).eligible,
  "pro experiment must remain blocked until its catalog capability is required and proven",
);

const unknownCatalog = { ...catalog, invented: true };
expectContractError("CONTRACT_UNKNOWN_FIELD", () => validateModelProfileCatalog(unknownCatalog));
const candidateWithTemperature = JSON.parse(JSON.stringify(catalog));
candidateWithTemperature.profiles.find((entry) => entry.family === "gpt-5.6-candidate").temperature = 0.1;
expectContractError("MODEL_PROFILE_GPT56_TEMPERATURE", () => validateModelProfileCatalog(sealModelProfileCatalog(candidateWithTemperature)));
const normalizedExplore = JSON.parse(JSON.stringify(catalog));
normalizedExplore.profiles.find((entry) => entry.profile_id === "baseline-explore").model_id = "openai/gpt-5.5";
expectContractError("MODEL_PROFILE_EXPLORE_EXCEPTION", () => validateModelProfileCatalog(sealModelProfileCatalog(normalizedExplore)));
const unsafeLuna = JSON.parse(JSON.stringify(catalog));
unsafeLuna.profiles.find((entry) => entry.model_id === "openai/gpt-5.6-luna").eligibility.risk_classes = ["high"];
expectContractError("MODEL_PROFILE_LUNA_ELIGIBILITY", () => validateModelProfileCatalog(sealModelProfileCatalog(unsafeLuna)));
const missingPair = JSON.parse(JSON.stringify(experiment));
missingPair.comparisons.pop();
expectContractError("QUALITY_ARRAY", () => validateEngineeringExperimentManifest(sealEngineeringExperimentManifest(missingPair), { catalog }));

console.log(
  "Verified model profiles: 11 active GPT-5.6 Sol/Terra roles, retained starting-commit baseline provenance, evaluation-only Luna, 96 optional planned pairs, and fail-closed runtime evidence.",
);
