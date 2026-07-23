import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  comparePromptInventories,
  createIntentionalDuplicationAllowlist,
  createPromptInventory,
  inspectAgentPromptModelNeutrality,
  sealPromptInventory,
  validatePromptInventory,
} from "../lib/quality/prompt-inventory.mjs";
import {
  CONTEXT_EXECUTION_MODE_CONTRACT,
  HIGH_CRITICAL_PREIMPLEMENTATION_SEQUENCE,
  PROVISIONAL_DOSSIER_PHRASE,
  assertSemanticSequence,
} from "../lib/quality/preimplementation-sequence.mjs";
import { ContractError, canonicalJson } from "../lib/quality/validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(root, "quality", "prompt-inventory", "baseline.v3.json");
const declarationsPath = path.join(root, "quality", "prompt-inventory", "declared-changes.v3.json");
const legacyBaselinePath = path.join(root, "quality", "prompt-inventory", "baseline.v2.json");
const baselineCommit = "0a1d56605b9b8923ac27c3b3b405b38177ca7741";
const DEFAULT_DISCOVERY_LIMITS = Object.freeze({
  maxDirectories: 512,
  maxEntries: 4096,
  maxDepth: 32,
  maxPromptFiles: 64,
  maxPromptBytes: 512 * 1024,
  maxTotalPromptBytes: 8 * 1024 * 1024,
});
const COUNT_WORD_VALUES = Object.freeze({
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
});
const DOCUMENTED_PROMPT_COUNT_PATTERN = new RegExp(
  String.raw`\b(?<agents>\d+|${Object.keys(COUNT_WORD_VALUES).join("|")})\s+agent prompts?\b[\s\S]{0,160}?\b(?<skills>\d+|${Object.keys(COUNT_WORD_VALUES).join("|")})\s+skill entrypoints?\b`,
  "giu",
);

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

function expectFailure(label, messageFragment, action) {
  try {
    action();
  } catch (error) {
    check(
      error instanceof Error && error.message.includes(messageFragment),
      `${label} failed for an unexpected reason: ${error?.message ?? String(error)}`,
    );
    return;
  }
  throw new Error(`${label} did not fail`);
}

function parseDocumentedCount(token, label) {
  const normalized = token.toLowerCase();
  const value = /^\d+$/u.test(normalized) ? Number(normalized) : COUNT_WORD_VALUES[normalized];
  check(Number.isSafeInteger(value) && value >= 0, `${label} has an unsupported count: ${token}`);
  return value;
}

function documentedPromptEntrypointCounts(text, label) {
  const matches = [...text.matchAll(DOCUMENTED_PROMPT_COUNT_PATTERN)];
  check(matches.length === 1, `${label} must contain exactly one current agent/skill prompt inventory count`);
  return {
    agentPrompts: parseDocumentedCount(matches[0].groups.agents, `${label} agent prompt count`),
    skillEntrypoints: parseDocumentedCount(matches[0].groups.skills, `${label} skill entrypoint count`),
  };
}

function discoveredPromptEntrypointCounts(sources) {
  const agentPrompts = sources.filter((entry) => /^agents\/[^/]+\.md$/u.test(entry.path)).length;
  const skillEntrypoints = sources.filter((entry) => /^skills\/.+\/SKILL\.md$/u.test(entry.path)).length;
  check(
    agentPrompts + skillEntrypoints === sources.length,
    "current prompt discovery contains a path outside the agent/skill entrypoint contract",
  );
  return { agentPrompts, skillEntrypoints };
}

function assertCurrentPromptInventoryDocumentation(sources, documents) {
  const discovered = discoveredPromptEntrypointCounts(sources);
  for (const document of documents) {
    const documented = documentedPromptEntrypointCounts(document.text, document.path);
    check(
      documented.agentPrompts === discovered.agentPrompts
      && documented.skillEntrypoints === discovered.skillEntrypoints,
      `${document.path} prompt inventory count drift: documents ${documented.agentPrompts} agent/${documented.skillEntrypoints} skill entrypoints; current discovery has ${discovered.agentPrompts} agent/${discovered.skillEntrypoints}`,
    );
  }
  return discovered;
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: root,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

function baselineSources() {
  const paths = git(["ls-tree", "-r", "--name-only", baselineCommit, "--", "agents", "skills"], { encoding: "utf8" })
    .trim()
    .split(/\r?\n/)
    .filter((entry) => /^agents\/.+\.md$/.test(entry) || /^skills\/.+\/SKILL\.md$/.test(entry));
  return paths.map((promptPath) => ({
    path: promptPath,
    content: git(["show", `${baselineCommit}:${promptPath}`]),
    git_blob_oid: git(["rev-parse", `${baselineCommit}:${promptPath}`], { encoding: "utf8" }).trim(),
  }));
}

function discoveryError(code, message) {
  throw new ContractError(code, message);
}

function resolvedDiscoveryLimits(overrides = {}) {
  const limits = { ...DEFAULT_DISCOVERY_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      discoveryError("PROMPT_DISCOVERY_LIMIT", `${name} must be a positive safe integer`);
    }
  }
  return limits;
}

function isInside(basePath, candidatePath) {
  return candidatePath === basePath || candidatePath.startsWith(`${basePath}${path.sep}`);
}

function assertOrdinaryDiscoveryEntry(stat, relativePath) {
  if (stat.isSymbolicLink()) {
    discoveryError("PROMPT_DISCOVERY_LINK", `${relativePath} must not be a symbolic link or reparse point`);
  }
  if (!stat.isDirectory() && !stat.isFile()) {
    discoveryError("PROMPT_DISCOVERY_SPECIAL", `${relativePath} must be an ordinary file or directory`);
  }
}

function worktreeSources({ workspaceRoot = root, limitOverrides = {} } = {}) {
  const limits = resolvedDiscoveryLimits(limitOverrides);
  const resolvedWorkspace = fs.realpathSync(path.resolve(workspaceRoot));
  const state = { directories: 0, entries: 0, promptFiles: 0, promptBytes: 0 };
  const sources = [];

  function inspect(absolutePath, relativePath) {
    state.entries += 1;
    if (state.entries > limits.maxEntries) {
      discoveryError("PROMPT_DISCOVERY_ENTRY_QUOTA", `prompt discovery exceeded ${limits.maxEntries} entries`);
    }
    const stat = fs.lstatSync(absolutePath);
    assertOrdinaryDiscoveryEntry(stat, relativePath);
    const realPath = fs.realpathSync(absolutePath);
    if (!isInside(resolvedWorkspace, realPath)) {
      discoveryError("PROMPT_DISCOVERY_ESCAPE", `${relativePath} resolves outside the workspace`);
    }
    return stat;
  }

  function addPrompt(absolutePath, relativePath, stat) {
    state.promptFiles += 1;
    if (state.promptFiles > limits.maxPromptFiles) {
      discoveryError("PROMPT_DISCOVERY_FILE_QUOTA", `prompt discovery exceeded ${limits.maxPromptFiles} prompt files`);
    }
    if (stat.size > limits.maxPromptBytes) {
      discoveryError("PROMPT_DISCOVERY_FILE_BYTES", `${relativePath} exceeds the per-prompt byte quota`);
    }
    const content = fs.readFileSync(absolutePath);
    state.promptBytes += content.length;
    if (state.promptBytes > limits.maxTotalPromptBytes) {
      discoveryError("PROMPT_DISCOVERY_TOTAL_BYTES", "prompt discovery exceeded the total byte quota");
    }
    sources.push({ path: relativePath, content });
  }

  const agentsRoot = path.join(resolvedWorkspace, "agents");
  const agentsRootStat = inspect(agentsRoot, "agents");
  if (!agentsRootStat.isDirectory()) discoveryError("PROMPT_DISCOVERY_ROOT", "agents must be an ordinary directory");
  state.directories += 1;
  for (const entry of fs.readdirSync(agentsRoot, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = `agents/${entry.name}`;
    const absolutePath = path.join(agentsRoot, entry.name);
    const stat = inspect(absolutePath, relativePath);
    if (stat.isDirectory()) {
      discoveryError("PROMPT_DISCOVERY_AGENT_NESTING", `${relativePath} violates the top-level agent prompt contract`);
    }
    if (entry.name.endsWith(".md")) addPrompt(absolutePath, relativePath, stat);
  }

  const skillsRoot = path.join(resolvedWorkspace, "skills");
  function walkSkills(absolutePath, relativePath, depth) {
    if (depth > limits.maxDepth) {
      discoveryError("PROMPT_DISCOVERY_DEPTH", `${relativePath} exceeds the skill traversal depth quota`);
    }
    const stat = inspect(absolutePath, relativePath);
    if (stat.isFile()) {
      if (path.basename(absolutePath) === "SKILL.md") addPrompt(absolutePath, relativePath, stat);
      return;
    }
    state.directories += 1;
    if (state.directories > limits.maxDirectories) {
      discoveryError("PROMPT_DISCOVERY_DIRECTORY_QUOTA", `prompt discovery exceeded ${limits.maxDirectories} directories`);
    }
    for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      walkSkills(
        path.join(absolutePath, entry.name),
        `${relativePath}/${entry.name}`,
        depth + 1,
      );
    }
  }
  walkSkills(skillsRoot, "skills", 0);

  return sources.sort((left, right) => left.path.localeCompare(right.path));
}

function buildInventory({ inventoryId, sourceKind, sourceRevision, sources, sentinelDefinitions }) {
  const firstPass = createPromptInventory({
    inventoryId,
    baselineCommit,
    sourceKind,
    sourceRevision,
    promptSources: sources,
    sentinelDefinitions,
  });
  return createPromptInventory({
    inventoryId,
    baselineCommit,
    sourceKind,
    sourceRevision,
    promptSources: sources,
    sentinelDefinitions,
    intentionalDuplicationAllowlist: createIntentionalDuplicationAllowlist(firstPass.duplicate_groups),
  });
}

function cloneSources(sources) {
  return sources.map((source) => ({
    path: source.path,
    content: Buffer.from(source.content),
    ...(source.git_blob_oid ? { git_blob_oid: source.git_blob_oid } : {}),
  }));
}

function mutateSource(sources, promptPath, mutate) {
  return sources.map((source) => source.path === promptPath
    ? { path: source.path, content: Buffer.from(mutate(source.content.toString("utf8")), "utf8") }
    : { path: source.path, content: Buffer.from(source.content) });
}

function recursivelyRejectRawPromptFields(value, label = "inventory") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => recursivelyRejectRawPromptFields(entry, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (["body", "content", "prompt", "raw_prompt", "text"].includes(key)) {
      throw new Error(`${label}.${key} must not persist raw prompt content`);
    }
    recursivelyRejectRawPromptFields(nested, `${label}.${key}`);
  }
}

function readWorkspaceText(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function sectionBetween(text, startHeading, endHeading, label) {
  const start = text.indexOf(startHeading);
  check(start >= 0, `${label} is missing ${startHeading}`);
  const end = endHeading === null ? text.length : text.indexOf(endHeading, start + startHeading.length);
  check(end >= 0, `${label} is missing ${endHeading}`);
  return text.slice(start, end);
}

const OPERATIONAL_SEQUENCE_MARKERS = Object.freeze({
  session_registration: "`chat.message`",
  risk_and_strategy: "`quality_session_start`",
  provisional_dossier: PROVISIONAL_DOSSIER_PHRASE,
  context_receipts: /runner-owned context receipts/iu,
  serialized_read_only_children: /serialized read-only child tasks/iu,
  dossier_refinement: "`quality_dossier_update`",
  context_report_refinement: "`quality_context_report_update`",
  context_report_finalization: "`quality_context_report_finalize`",
  context_sufficiency_decision: /runner-(?:owned|computed)[\s\S]{0,120}sufficient\s+context\s+decision/iu,
  current_plan_challenges: /architect\s+and\s+reviewer[\s\S]{0,300}canonical\s+(?:current\s+)?challenge\s+subject/iu,
  dossier_gate: "`quality_dossier_finalize`",
  mutation_authorization: /runner-owned passed gate[\s\S]{0,80}(?:authorizes|permits)/iu,
});

function assertModeAwareReadOnlyGuidance(text, label) {
  check(
    /instrumented[\s\S]{0,320}(?:serializ(?:ed|es)|one[\s\S]{0,80}at a time)/iu.test(text),
    `${label} must state that instrumented context or read-only child work is serialized`,
  );
  check(
    /profile-only[\s\S]{0,320}(?:parallel|parallelize)/iu.test(text),
    `${label} must confine optional parallel read-only work to profile-only mode`,
  );
}

function assertPreimplementationSemantics() {
  check(
    HIGH_CRITICAL_PREIMPLEMENTATION_SEQUENCE.map((entry) => entry.id).join(",")
      === "session_registration,risk_and_strategy,provisional_dossier,context_receipts,serialized_read_only_children,dossier_refinement,context_report_refinement,context_report_finalization,context_sufficiency_decision,current_plan_challenges,dossier_gate,mutation_authorization",
    "the canonical high/critical preimplementation stage registry drifted",
  );
  check(CONTEXT_EXECUTION_MODE_CONTRACT.instrumented.context_operations === "serialized", "instrumented context operations must stay serialized");
  check(CONTEXT_EXECUTION_MODE_CONTRACT.instrumented.read_only_children === "serialized", "instrumented read-only children must stay serialized");
  check(CONTEXT_EXECUTION_MODE_CONTRACT.instrumented.parallel_child_correlation === false, "instrumented mode must not claim parallel child correlation");
  check(CONTEXT_EXECUTION_MODE_CONTRACT.profile_only.optional_parallel_read_only_fanout === true, "profile-only mode must retain optional parallel read-only guidance");
  check(CONTEXT_EXECUTION_MODE_CONTRACT.profile_only.computational_receipt_chain === false, "profile-only mode must not claim a computational receipt chain");

  const orchestrator = readWorkspaceText("agents/orchestrator.md");
  const orchestratorDeep = readWorkspaceText("agents/orchestrator-deep.md");
  const readme = readWorkspaceText("README.md");
  const wholeSystem = readWorkspaceText("docs/whole-system-context.md");
  const sequenceDocuments = [
    {
      label: "agents/orchestrator.md high/critical sequence",
      text: sectionBetween(orchestrator, "High/critical instrumented sequence:", "8. Keep the immediate blocking step local.", "agents/orchestrator.md"),
    },
    {
      label: "agents/orchestrator-deep.md high/critical sequence",
      text: sectionBetween(orchestratorDeep, "High/critical instrumented sequence:", "- Native `bash`", "agents/orchestrator-deep.md"),
    },
    {
      label: "README.md quality gate sequence",
      text: sectionBetween(readme, "## How The Quality Gate Works", "## How The Agent Understands A Change", "README.md"),
    },
    {
      label: "docs/whole-system-context.md sequence",
      text: sectionBetween(wholeSystem, "## Sequence and authority", "## Strategy classes", "docs/whole-system-context.md"),
    },
  ];
  for (const document of sequenceDocuments) {
    assertSemanticSequence(document.text, OPERATIONAL_SEQUENCE_MARKERS, { label: document.label });
  }

  const orchestratorSequence = sequenceDocuments[0].text;
  expectFailure(
    "missing provisional Dossier phrase fixture",
    "provisional_dossier",
    () => assertSemanticSequence(
      orchestratorSequence.replace(PROVISIONAL_DOSSIER_PHRASE, "initial planning notes"),
      OPERATIONAL_SEQUENCE_MARKERS,
      { label: "missing provisional Dossier phrase fixture" },
    ),
  );
  expectFailure(
    "report/Dossier finalization reordering fixture",
    "context_sufficiency_decision",
    () => assertSemanticSequence(
      orchestratorSequence
        .replace("`quality_context_report_finalize`", "`quality_dossier_finalize`")
        .replace("`quality_dossier_finalize` and existing gate evaluation", "`quality_context_report_finalize` and existing gate evaluation"),
      OPERATIONAL_SEQUENCE_MARKERS,
      { label: "report/Dossier finalization reordering fixture" },
    ),
  );
  expectFailure(
    "challenge-before-sufficient-decision fixture",
    "current_plan_challenges",
    () => assertSemanticSequence(
      orchestratorSequence.replace(
        /runner-owned sufficient context decision[\s\S]{0,300}(Architect and reviewer[\s\S]{0,300}canonical current challenge subject)/iu,
        "$1 before any runner-owned sufficient context decision",
      ),
      OPERATIONAL_SEQUENCE_MARKERS,
      { label: "challenge-before-sufficient-decision fixture" },
    ),
  );
  expectFailure(
    "premature sufficiency authority fixture",
    "mutation_authorization",
    () => assertSemanticSequence(
      orchestratorSequence.replace(/runner-owned passed gate authorizes mutation/iu, "context sufficiency authorizes mutation"),
      OPERATIONAL_SEQUENCE_MARKERS,
      { label: "premature sufficiency authority fixture" },
    ),
  );

  const modeAwareDocuments = [
    "AGENTS.md",
    "agents/orchestrator.md",
    "agents/orchestrator-deep.md",
    "agents/explore.md",
    "skills/global-wide-deep-context/SKILL.md",
    "skills/global-review-ledger/SKILL.md",
    "README.md",
    "docs/whole-system-context.md",
    "docs/recursive-context-mode.md",
    "docs/adoption.md",
    "docs/live-evaluation.md",
  ];
  for (const relativePath of modeAwareDocuments) {
    assertModeAwareReadOnlyGuidance(readWorkspaceText(relativePath), relativePath);
  }
  const obsoleteParallelClaims = [
    "Parallelize independent read-only discovery",
    "parallel context gathering",
    "Launch multiple `@explore` tasks in parallel",
    "Be optimized for parallel context gathering",
    "Use up to ten `@reviewer` subagents in parallel",
  ];
  for (const relativePath of modeAwareDocuments) {
    const text = readWorkspaceText(relativePath);
    for (const obsoleteClaim of obsoleteParallelClaims) {
      check(!text.includes(obsoleteClaim), `${relativePath} retains obsolete unqualified guidance: ${obsoleteClaim}`);
    }
  }

  const pluginDescriptions = readWorkspaceText("lib/quality/normal-session-plugin.mjs");
  check(pluginDescriptions.includes(PROVISIONAL_DOSSIER_PHRASE), "quality_dossier_create description must use the canonical provisional Dossier phrase");
  check(/canonical current challenge subject/iu.test(pluginDescriptions), "challenge tool description must bind contributions to the canonical current subject");
  check(/finalization alone does not authorize mutation/iu.test(pluginDescriptions), "Dossier finalization description must preserve the mutation authority boundary");

  for (const relativePath of [
    "AGENTS.md",
    "agents/orchestrator.md",
    "agents/orchestrator-deep.md",
    "skills/global-wide-deep-context/SKILL.md",
    "README.md",
    "docs/whole-system-context.md",
    "docs/adoption.md",
  ]) {
    const text = readWorkspaceText(relativePath);
    check(/finalized\s+(?:Whole-System\s+Context\s+Report|report)/iu.test(text), `${relativePath} must require a finalized context report before formal challenges`);
    check(/runner-owned\s+sufficient\s+context\s+decision/iu.test(text), `${relativePath} must require the current runner-owned sufficient decision`);
    check(/canonical\s+current\s+challenge\s+subject/iu.test(text), `${relativePath} must name the canonical current challenge subject`);
  }
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const declarations = JSON.parse(fs.readFileSync(declarationsPath, "utf8"));
const legacyBaseline = JSON.parse(fs.readFileSync(legacyBaselinePath, "utf8"));
validatePromptInventory(baseline);
validatePromptInventory(legacyBaseline);
check(
  declarations
  && Object.keys(declarations).sort().join(",") === "baseline_commit,changes,schema_version"
  && declarations.schema_version === 3
  && declarations.baseline_commit === baselineCommit
  && Array.isArray(declarations.changes),
  "declared prompt changes must be a strict version-3 manifest bound to the starting commit",
);
recursivelyRejectRawPromptFields(baseline);
recursivelyRejectRawPromptFields(legacyBaseline);
check(
  baseline.entries.every((entry) => !Object.hasOwn(entry, "model") && !Object.hasOwn(entry, "options")),
  "prompt inventory v3 must not persist model or provider-option fields",
);

const regeneratedBaseline = buildInventory({
  inventoryId: "baseline-engineering-prompts-v3",
  sourceKind: "git_commit",
  sourceRevision: baselineCommit,
  sources: baselineSources(),
});
check(canonicalJson(baseline) === canonicalJson(regeneratedBaseline), "checked-in prompt baseline does not regenerate from the immutable starting commit");
for (const definition of baseline.sentinel_definitions) {
  for (const requiredPath of definition.required_paths) {
    const entry = baseline.entries.find((candidate) => candidate.path === requiredPath);
    check(entry?.sentinel_ids.includes(definition.sentinel_id), `${requiredPath} baseline is missing sentinel ${definition.sentinel_id}`);
  }
}

const currentSources = worktreeSources();
const currentInventoryDocuments = [
  { path: "README.md", text: fs.readFileSync(path.join(root, "README.md"), "utf8") },
  { path: "docs/harness-map.md", text: fs.readFileSync(path.join(root, "docs", "harness-map.md"), "utf8") },
];
const currentEntrypointCounts = assertCurrentPromptInventoryDocumentation(currentSources, currentInventoryDocuments);
const staleHarnessMapDocuments = currentInventoryDocuments.map((document) => document.path === "docs/harness-map.md"
  ? { ...document, text: document.text.replace(/\bnine skill entrypoints\b/iu, "eight skill entrypoints") }
  : document);
check(
  staleHarnessMapDocuments.find((document) => document.path === "docs/harness-map.md").text
    !== currentInventoryDocuments.find((document) => document.path === "docs/harness-map.md").text,
  "stale documented-count fixture must replace the current nine-skill wording",
);
expectFailure(
  "stale eight-skill documentation fixture",
  "prompt inventory count drift",
  () => assertCurrentPromptInventoryDocumentation(currentSources, staleHarnessMapDocuments),
);
expectFailure(
  "undocumented current-skill fixture",
  "prompt inventory count drift",
  () => assertCurrentPromptInventoryDocumentation([
    ...cloneSources(currentSources),
    {
      path: "skills/test-undocumented-current-skill/SKILL.md",
      content: Buffer.from("test-only undocumented current skill entrypoint\n", "utf8"),
    },
  ], currentInventoryDocuments),
);
const current = buildInventory({
  inventoryId: "current-engineering-prompts-v3",
  sourceKind: "worktree",
  sourceRevision: null,
  sources: currentSources,
});
const currentComparison = comparePromptInventories(baseline, current, { declaredChanges: declarations.changes });
check(
  currentComparison.status === "passed",
  `current prompt inventory has undeclared drift: ${currentComparison.findings.map((entry) => `${entry.code}:${entry.path}`).join(", ")}`,
);
assertPreimplementationSemantics();

const crlfSources = baselineSources().map((source) => ({
  path: source.path,
  content: Buffer.from(source.content.toString("utf8").replace(/\r?\n/g, "\r\n"), "utf8"),
}));
const crlfInventory = buildInventory({
  inventoryId: "test-crlf-agent-prompts-v1",
  sourceKind: "worktree",
  sourceRevision: null,
  sources: crlfSources,
});
const crlfComparison = comparePromptInventories(baseline, crlfInventory);
check(crlfComparison.status === "passed", "CRLF/LF-only drift must remain semantically stable");
check(crlfComparison.changes.some((entry) => entry.code === "PROMPT_LINE_ENDING_ONLY"), "line-ending-only drift must be visible");

const baselineWorktreeSources = baselineSources().map(({ path: promptPath, content }) => ({ path: promptPath, content }));
const nestedSkillPath = "skills/vendor/foo/SKILL.md";
const nestedSkillText = [
  "---",
  "name: test-nested-skill",
  "description: Test-only nested prompt discovery fixture.",
  "license: MIT",
  "---",
  "",
  "## Nested boundary",
  "",
  "The nested immutable safety boundary must remain visible to prompt inventory sensors.",
  "",
].join("\n");
const temporaryRoot = fs.realpathSync(os.tmpdir());
const discoveryFixtureRoot = fs.mkdtempSync(path.join(temporaryRoot, "opencode-prompt-discovery-"));
const discoveryOutsideRoot = fs.mkdtempSync(path.join(temporaryRoot, "opencode-prompt-outside-"));
let nestedDiscoveredSource;
try {
  fs.mkdirSync(path.join(discoveryFixtureRoot, "agents"), { recursive: true });
  fs.mkdirSync(path.join(discoveryFixtureRoot, "skills", "zeta"), { recursive: true });
  fs.mkdirSync(path.join(discoveryFixtureRoot, "skills", "vendor", "foo"), { recursive: true });
  fs.writeFileSync(path.join(discoveryFixtureRoot, "agents", "zeta.md"), "test agent prompt\n", "utf8");
  fs.writeFileSync(path.join(discoveryFixtureRoot, "skills", "zeta", "SKILL.md"), nestedSkillText, "utf8");
  fs.writeFileSync(path.join(discoveryFixtureRoot, ...nestedSkillPath.split("/")), nestedSkillText, "utf8");
  fs.writeFileSync(path.join(discoveryFixtureRoot, "skills", "ignored.md"), "not a skill entrypoint\n", "utf8");

  const discovered = worktreeSources({ workspaceRoot: discoveryFixtureRoot });
  check(
    canonicalJson(discovered.map((entry) => entry.path)) === canonicalJson([
      "agents/zeta.md",
      nestedSkillPath,
      "skills/zeta/SKILL.md",
    ]),
    "recursive worktree discovery must return every prompt entrypoint in deterministic portable-path order",
  );
  nestedDiscoveredSource = discovered.find((entry) => entry.path === nestedSkillPath);
  check(Buffer.isBuffer(nestedDiscoveredSource?.content), "nested skill discovery must preserve ordinary file bytes");
  expectContractError("PROMPT_DISCOVERY_FILE_QUOTA", () => worktreeSources({
    workspaceRoot: discoveryFixtureRoot,
    limitOverrides: { maxPromptFiles: 2 },
  }));
  expectContractError("PROMPT_DISCOVERY_DEPTH", () => worktreeSources({
    workspaceRoot: discoveryFixtureRoot,
    limitOverrides: { maxDepth: 1 },
  }));

  fs.mkdirSync(path.join(discoveryFixtureRoot, "agents", "nested"));
  expectContractError("PROMPT_DISCOVERY_AGENT_NESTING", () => worktreeSources({ workspaceRoot: discoveryFixtureRoot }));
  fs.rmdirSync(path.join(discoveryFixtureRoot, "agents", "nested"));

  fs.mkdirSync(path.join(discoveryOutsideRoot, "external-skill"), { recursive: true });
  fs.writeFileSync(path.join(discoveryOutsideRoot, "external-skill", "SKILL.md"), nestedSkillText, "utf8");
  const linkPath = path.join(discoveryFixtureRoot, "skills", "escape");
  try {
    fs.symlinkSync(
      path.join(discoveryOutsideRoot, "external-skill"),
      linkPath,
      process.platform === "win32" ? "junction" : "dir",
    );
    expectContractError("PROMPT_DISCOVERY_LINK", () => worktreeSources({ workspaceRoot: discoveryFixtureRoot }));
    fs.unlinkSync(linkPath);
  } catch (error) {
    if (!(["EPERM", "EACCES", "ENOTSUP"].includes(error?.code))) throw error;
    expectContractError("PROMPT_DISCOVERY_LINK", () => assertOrdinaryDiscoveryEntry({
      isSymbolicLink: () => true,
      isDirectory: () => false,
      isFile: () => false,
    }, "skills/escape"));
  }
} finally {
  for (const ownedPath of [discoveryFixtureRoot, discoveryOutsideRoot]) {
    const resolved = path.resolve(ownedPath);
    if (path.dirname(resolved) !== temporaryRoot) {
      throw new Error(`refusing to remove non-owned prompt fixture path: ${resolved}`);
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

const nestedSources = [...cloneSources(baselineWorktreeSources), nestedDiscoveredSource];
const nestedBaselineInventory = buildInventory({
  inventoryId: "test-nested-skill-baseline-v1",
  sourceKind: "worktree",
  sourceRevision: null,
  sources: nestedSources,
});
check(
  comparePromptInventories(baseline, nestedBaselineInventory).findings.some((entry) => (
    entry.code === "PROMPT_PATH_ADDED" && entry.path === nestedSkillPath
  )),
  "an undeclared nested skill entrypoint must fail as an added prompt path",
);
const nestedGrowthInventory = buildInventory({
  inventoryId: "test-nested-skill-growth-v1",
  sourceKind: "worktree",
  sourceRevision: null,
  sources: mutateSource(
    nestedSources,
    nestedSkillPath,
    (text) => `${text.trimEnd()}\n\n## Unreviewed growth\n\nA new nested instruction family must remain visible.\n`,
  ),
});
check(
  comparePromptInventories(nestedBaselineInventory, nestedGrowthInventory).findings.some((entry) => (
    entry.code === "PROMPT_UNREVIEWED_GROWTH" && entry.path === nestedSkillPath
  )),
  "unreviewed growth in a nested skill must fail",
);
const nestedSentinelDefinitions = [{
  sentinel_id: "nested-skill-safety-boundary",
  required_paths: [nestedSkillPath],
  regex_families: [{
    family_id: "nested-immutable-boundary",
    patterns: ["nested immutable safety boundary"],
  }],
}];
const nestedSentinelBaseline = buildInventory({
  inventoryId: "test-nested-sentinel-baseline-v1",
  sourceKind: "worktree",
  sourceRevision: null,
  sources: nestedSources,
  sentinelDefinitions: nestedSentinelDefinitions,
});
const nestedSentinelRemoved = buildInventory({
  inventoryId: "test-nested-sentinel-removed-v1",
  sourceKind: "worktree",
  sourceRevision: null,
  sources: mutateSource(
    nestedSources,
    nestedSkillPath,
    (text) => text.replace("nested immutable safety boundary", "removed nested guidance"),
  ),
  sentinelDefinitions: nestedSentinelDefinitions,
});
check(
  comparePromptInventories(nestedSentinelBaseline, nestedSentinelRemoved).findings.some((entry) => (
    entry.code === "PROMPT_SAFETY_SENTINEL_REMOVED" && entry.path === nestedSkillPath
  )),
  "nested skill safety sentinel removal must fail",
);

const modelDriftSources = mutateSource(
  baselineWorktreeSources,
  "agents/general.md",
  (text) => text.replace(/^model:\s*.+$/mu, "model: example/model-only-change"),
);
const modelDrift = buildInventory({
  inventoryId: "test-model-drift-v1",
  sourceKind: "worktree",
  sourceRevision: null,
  sources: modelDriftSources,
});
const modelMetadataComparison = comparePromptInventories(baseline, modelDrift);
check(
  modelMetadataComparison.status === "passed"
  && modelMetadataComparison.changes.some((entry) => entry.code === "PROMPT_NON_POLICY_FRONTMATTER_ONLY"),
  "model/provider frontmatter bytes must remain visible without becoming quality policy",
);
check(
  inspectAgentPromptModelNeutrality(modelDriftSources.find((entry) => entry.path === "agents/general.md").content.toString("utf8"))
    .some((entry) => entry.path === "model"),
  "shared model-neutrality sensor must reject a direct model pin even though inventory v3 excludes it from quality policy",
);

const toolDriftSources = mutateSource(
  baselineWorktreeSources,
  "agents/general.md",
  (text) => text.replace("permission:\n", "permission:\n  synthetic_tool: allow\n"),
);
const toolDrift = buildInventory({
  inventoryId: "test-tool-drift-v1",
  sourceKind: "worktree",
  sourceRevision: null,
  sources: toolDriftSources,
});
const toolComparison = comparePromptInventories(baseline, toolDrift);
check(
  toolComparison.findings.some((entry) => entry.code === "PROMPT_TOOL_SURFACE_DRIFT")
  && toolComparison.findings.some((entry) => entry.code === "PROMPT_PERMISSION_SURFACE_DRIFT"),
  "undeclared tool and permission drift must fail",
);

const sentinelDriftSources = mutateSource(
  baselineWorktreeSources,
  "agents/orchestrator.md",
  (text) => text
    .replaceAll("global-quality-gates", "removed-quality-procedure")
    .replace(/quality gate/giu, "completion check")
    .replace(/quality ledger/giu, "work ledger"),
);
const sentinelDrift = buildInventory({
  inventoryId: "test-sentinel-drift-v1",
  sourceKind: "worktree",
  sourceRevision: null,
  sources: sentinelDriftSources,
});
const sentinelComparison = comparePromptInventories(baseline, sentinelDrift);
check(
  sentinelComparison.findings.some((entry) => entry.code === "PROMPT_SAFETY_SENTINEL_REMOVED"),
  "semantic safety/gate sentinel removal must fail",
);
const declaredSentinelRemoval = comparePromptInventories(baseline, sentinelDrift, {
  declaredChanges: [{
    path: "agents/orchestrator.md",
    aspects: ["content", "sentinels"],
    rationale: "Test-only attempt to waive a safety boundary.",
  }],
});
check(
  declaredSentinelRemoval.findings.some((entry) => entry.code === "PROMPT_SAFETY_SENTINEL_REMOVED"),
  "a generic change declaration must not waive safety sentinel removal",
);

const qualitySkillSentinelDrift = buildInventory({
  inventoryId: "test-quality-skill-sentinel-drift-v1",
  sourceKind: "worktree",
  sourceRevision: null,
  sources: mutateSource(
    baselineWorktreeSources,
    "skills/global-quality-gates/SKILL.md",
    (text) => text
      .replace(/mandatory verification/giu, "optional verification")
      .replace(/mandatory `high` or `critical` gate/giu, "optional high or critical check")
      .replace(/cannot be reported as `complete`/giu, "may be reported as done")
      .replace(/`complete` is allowed only when/giu, "done is suggested when"),
  ),
});
const qualitySkillSentinelComparison = comparePromptInventories(baseline, qualitySkillSentinelDrift, {
  declaredChanges: [{
    path: "skills/global-quality-gates/SKILL.md",
    aspects: ["content", "sentinels"],
    rationale: "Test-only attempt to waive the skill completion boundary.",
  }],
});
check(
  qualitySkillSentinelComparison.findings.some((entry) => entry.code === "PROMPT_SAFETY_SENTINEL_REMOVED"),
  "declared skill drift must not waive the quality-gate safety sentinel",
);

const weakenedPolicy = JSON.parse(JSON.stringify(current));
weakenedPolicy.sentinel_definitions[0].regex_families[0].patterns = [".*"];
const weakenedPolicyComparison = comparePromptInventories(baseline, sealPromptInventory(weakenedPolicy));
check(
  weakenedPolicyComparison.findings.some((entry) => entry.code === "PROMPT_SENTINEL_POLICY_DRIFT"),
  "semantic sentinel policy drift must fail even when prompt bytes are unchanged",
);

const exactBlock = [
  "- Synthetic repeated boundary requires the same evidence identity before an implementation action is accepted.",
  "- Synthetic repeated boundary keeps permission and hidden-evidence controls outside the candidate model.",
  "- Synthetic repeated boundary rejects incomplete verification instead of inferring successful completion.",
].join("\n");
let duplicateSources = mutateSource(baselineWorktreeSources, "agents/general.md", (text) => `${text.trimEnd()}\n${exactBlock}\n`);
duplicateSources = mutateSource(duplicateSources, "agents/architect.md", (text) => `${text.trimEnd()}\n${exactBlock}\n`);
const duplicateInventory = buildInventory({
  inventoryId: "test-duplicate-drift-v1",
  sourceKind: "worktree",
  sourceRevision: null,
  sources: duplicateSources,
});
check(
  comparePromptInventories(baseline, duplicateInventory).findings.some((entry) => entry.code === "PROMPT_DUPLICATION_UNREVIEWED"),
  "new exact duplicated policy block must fail without an intentional allowlist entry",
);

let nestedDuplicateSources = mutateSource(
  nestedSources,
  "agents/general.md",
  (text) => `${text.trimEnd()}\n${exactBlock}\n`,
);
nestedDuplicateSources = mutateSource(
  nestedDuplicateSources,
  nestedSkillPath,
  (text) => `${text.trimEnd()}\n${exactBlock}\n`,
);
const nestedDuplicateInventory = buildInventory({
  inventoryId: "test-nested-skill-duplicate-v1",
  sourceKind: "worktree",
  sourceRevision: null,
  sources: nestedDuplicateSources,
});
check(
  comparePromptInventories(nestedBaselineInventory, nestedDuplicateInventory).findings.some((entry) => (
    entry.code === "PROMPT_DUPLICATION_UNREVIEWED" && entry.path.includes(nestedSkillPath)
  )),
  "new duplicated policy text involving a nested skill must fail",
);

const normalizedLower = [
  "- Synthetic normalized boundary keeps evidence references stable across paired role invocations.",
  "- Synthetic normalized boundary preserves the permission surface before any delegated implementation.",
  "- Synthetic normalized boundary records incomplete runtime evidence as an explicit external gap.",
].join("\n");
const normalizedUpper = normalizedLower.toUpperCase().replace(/^- /gm, "* ");
let normalizedSources = mutateSource(baselineWorktreeSources, "agents/general.md", (text) => `${text.trimEnd()}\n${normalizedLower}\n`);
normalizedSources = mutateSource(normalizedSources, "agents/architect.md", (text) => `${text.trimEnd()}\n${normalizedUpper}\n`);
const normalizedInventory = buildInventory({
  inventoryId: "test-normalized-duplicate-v1",
  sourceKind: "worktree",
  sourceRevision: null,
  sources: normalizedSources,
});
check(
  normalizedInventory.duplicate_groups.some((entry) => entry.kind === "normalized")
  && comparePromptInventories(baseline, normalizedInventory).findings.some((entry) => entry.code === "PROMPT_DUPLICATION_UNREVIEWED"),
  "new deterministic normalized near-duplicate must fail without review",
);

const skillGrowthSources = mutateSource(
  baselineWorktreeSources,
  "skills/global-quality-gates/SKILL.md",
  (text) => `${text.trimEnd()}\n\n## Synthetic growth\n\nA new unreviewed instruction family.\n`,
);
const skillGrowth = buildInventory({
  inventoryId: "test-skill-growth-v1",
  sourceKind: "worktree",
  sourceRevision: null,
  sources: skillGrowthSources,
});
const skillGrowthComparison = comparePromptInventories(baseline, skillGrowth);
check(
  skillGrowthComparison.findings.some((entry) => (
    entry.code === "PROMPT_UNREVIEWED_GROWTH"
    && entry.path === "skills/global-quality-gates/SKILL.md"
  )),
  "unreviewed skill growth must fail against the immutable baseline",
);

let skillDuplicateSources = mutateSource(
  baselineWorktreeSources,
  "skills/global-quality-gates/SKILL.md",
  (text) => `${text.trimEnd()}\n${exactBlock}\n`,
);
skillDuplicateSources = mutateSource(
  skillDuplicateSources,
  "skills/global-review-ledger/SKILL.md",
  (text) => `${text.trimEnd()}\n${exactBlock}\n`,
);
const skillDuplicateInventory = buildInventory({
  inventoryId: "test-skill-duplicate-v1",
  sourceKind: "worktree",
  sourceRevision: null,
  sources: skillDuplicateSources,
});
check(
  comparePromptInventories(baseline, skillDuplicateInventory).findings.some((entry) => (
    entry.code === "PROMPT_DUPLICATION_UNREVIEWED"
    && entry.path.includes("skills/global-quality-gates/SKILL.md")
  )),
  "new duplicated policy text across skills must fail",
);

expectContractError("CONTRACT_UNKNOWN_FIELD", () => validatePromptInventory({ ...baseline, invented: true }));
expectContractError("PROMPT_INVENTORY_VERSION_SKEW", () => comparePromptInventories(legacyBaseline, baseline));
check(
  comparePromptInventories(baseline, current, {
    declaredChanges: [{
      path: "agents/diagnose.md",
      aspects: ["permission_surface"],
      rationale: "Test-only stale declaration.",
    }],
  }).findings.some((entry) => entry.code === "PROMPT_DECLARATION_STALE"),
  "stale prompt change declarations must fail",
);
const clonedSources = cloneSources(baselineWorktreeSources);
check(clonedSources.filter((entry) => entry.path.startsWith("agents/")).length === 11, "baseline source clone must retain all 11 agents");
check(clonedSources.filter((entry) => entry.path.startsWith("skills/")).length === 8, "baseline source clone must retain all 8 skills");

console.log(
  `Verified prompt inventory: ${baseline.entries.length} historical agent/skill baselines, current docs bind ${currentEntrypointCounts.agentPrompts} agent/${currentEntrypointCounts.skillEntrypoints} skill entrypoints, bounded recursive skill discovery, canonical preimplementation ordering, mode-aware serialization guidance, ${baseline.duplicate_groups.length} intentional duplicate groups, semantic sentinels, CRLF stability, and fail-closed undeclared drift.`,
);
