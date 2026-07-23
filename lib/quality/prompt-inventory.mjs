import { createHash } from "node:crypto";

import { assertEnum, assertSafeId } from "../feedback/contracts.mjs";

import { PROMPT_INVENTORY_SCHEMA_VERSION } from "./constants.mjs";
import {
  ContractError,
  assertArray,
  assertCommit,
  assertFingerprint,
  assertInteger,
  assertString,
  assertStringArray,
  canonicalJson,
  deepFrozenClone,
  exact,
  fingerprint,
} from "./validation.mjs";

const SOURCE_KINDS = Object.freeze(["git_commit", "worktree"]);
const SOURCE_TYPES = Object.freeze(["agent", "skill"]);
const DUPLICATE_KINDS = Object.freeze(["exact", "normalized"]);
const CHANGE_ASPECTS = Object.freeze([
  "content",
  "options",
  "steps",
  "tool_surface",
  "permission_surface",
  "sentinels",
  "duplication",
]);
const FRONTMATTER_OPTION_KEYS = Object.freeze(["reasoningEffort", "textVerbosity", "temperature", "steps"]);
const MODEL_CONFIGURATION_KEYS = new Set([
  "model",
  "modelid",
  "provider",
  "providerid",
  "reasoning",
  "reasoningeffort",
  "textverbosity",
  "temperature",
  "topp",
  "topk",
  "minp",
  "thinking",
  "seed",
  "stop",
  "stopsequences",
  "maxtokens",
  "maxoutputtokens",
  "frequencypenalty",
  "presencepenalty",
  "responseformat",
]);
const MODEL_CONFIGURATION_CONTAINERS = new Set([
  "options",
  "modeloptions",
  "provideroptions",
  "generationoptions",
  "generationconfig",
  "reasoningconfig",
  "thinkingconfig",
  "sampling",
  "inference",
  "parameters",
]);
const MIN_DUPLICATE_PARAGRAPH_BYTES = 160;
const DUPLICATE_LINE_WINDOW = 3;
const MIN_DUPLICATE_BLOCK_BYTES = 120;

export const DEFAULT_PROMPT_SENTINELS = Object.freeze([
  {
    sentinel_id: "preimplementation-context-gate",
    required_paths: ["agents/orchestrator.md", "agents/orchestrator-deep.md"],
    regex_families: [
      {
        family_id: "affected-context",
        patterns: ["context (?:inventory|gate)", "affected blast radius"],
      },
      {
        family_id: "before-change",
        patterns: ["before (?:code changes|edits|editing|writing)", "before high/critical edits"],
      },
      {
        family_id: "quality-gate",
        patterns: ["global-quality-gates", "quality (?:gate|ledger)"],
      },
    ],
  },
  {
    sentinel_id: "readonly-review-boundary",
    required_paths: ["agents/review-orchestrator.md", "agents/reviewer.md", "agents/verifier.md"],
    regex_families: [
      {
        family_id: "read-only",
        patterns: ["read-only", "do not edit files", "stay read-only"],
      },
    ],
  },
  {
    sentinel_id: "self-improvement-write-boundary",
    required_paths: ["agents/improver.md"],
    regex_families: [
      {
        family_id: "no-product-code",
        patterns: ["do not edit product code"],
      },
      {
        family_id: "guarded-writes",
        patterns: ["oc_learning_\\*", "oc_learning_"],
      },
    ],
  },
  {
    sentinel_id: "shared-subagent-result-contract",
    required_paths: ["agents/orchestrator.md", "agents/orchestrator-deep.md"],
    regex_families: [
      {
        family_id: "schema-reference",
        patterns: ["docs/subagent-result-schema\\.md"],
      },
      {
        family_id: "termination-reason",
        patterns: ["termination_reason"],
      },
    ],
  },
  {
    sentinel_id: "high-risk-completion-gate",
    required_paths: ["agents/orchestrator.md", "agents/orchestrator-deep.md", "agents/verifier.md"],
    regex_families: [
      {
        family_id: "mandatory-verification",
        patterns: ["mandatory verification", "mandatory gate"],
      },
      {
        family_id: "no-false-completion",
        patterns: ["do not report[^\\n]{0,120}complete", "do not recommend[^\\n]{0,120}complete"],
      },
    ],
  },
  {
    sentinel_id: "quality-skill-completion-boundary",
    required_paths: ["skills/global-quality-gates/SKILL.md"],
    regex_families: [
      {
        family_id: "mandatory-gate",
        patterns: ["mandatory (?:verification|high|critical) gate", "missing mandatory verification"],
      },
      {
        family_id: "no-false-completion",
        patterns: ["cannot be reported as [`']?complete", "complete is allowed only when"],
      },
    ],
  },
  {
    sentinel_id: "review-skill-readonly-boundary",
    required_paths: ["skills/global-review-ledger/SKILL.md"],
    regex_families: [
      {
        family_id: "read-only-review",
        patterns: ["review requests are read-only", "do not edit files"],
      },
    ],
  },
  {
    sentinel_id: "self-improvement-skill-write-boundary",
    required_paths: ["skills/global-self-improvement/SKILL.md"],
    regex_families: [
      {
        family_id: "guarded-persistent-writes",
        patterns: ["use `oc_learning_\\*` tools for persistent writes", "do not mutate hand-authored skills"],
      },
    ],
  },
]);

function hashBytes(algorithm, bytes) {
  return `${algorithm}:${createHash(algorithm).update(bytes).digest("hex")}`;
}

export function normalizePromptText(text) {
  if (typeof text !== "string") throw new ContractError("PROMPT_TEXT", "prompt text must be a string");
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function normalizeParagraph(text) {
  return normalizePromptText(text)
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/^\s*(?:[-*+] |\d+[.)] )/gm, "")
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ");
}

export function gitBlobOid(content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return createHash("sha1").update(header).update(bytes).digest("hex");
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) return trimmed.slice(1, -1);
  return trimmed;
}

function parseScalar(value) {
  const unquoted = unquote(value);
  if (unquoted === "true") return true;
  if (unquoted === "false") return false;
  if (unquoted === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(unquoted)) return Number(unquoted);
  return unquoted;
}

function quotedYamlScalar(value) {
  const trimmed = value.trim();
  return (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"));
}

function assertSupportedPromptFrontmatterLine(line, rawValue, label) {
  if (/^(?:-|\?|\{|\[)\s*/u.test(line) || /^[&!*]/u.test(line)) {
    throw new ContractError(
      "PROMPT_FRONTMATTER_UNSUPPORTED_YAML",
      `${label} contains an unsupported YAML sequence, complex key, flow collection, node property, or alias`,
    );
  }
  if (quotedYamlScalar(rawValue)) return;
  if (/^(?:[\[{&*!|>]|<<\s*:)/u.test(rawValue)) {
    throw new ContractError(
      "PROMPT_FRONTMATTER_UNSUPPORTED_YAML",
      `${label} contains unsupported YAML collection, anchor, tag, alias, merge, or block-scalar syntax`,
    );
  }
}

function findYamlSeparator(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if ((character === '"' || character === "'") && line[index - 1] !== "\\") {
      quote = quote === character ? null : quote ?? character;
    } else if (character === ":" && quote === null) {
      return index;
    }
  }
  return -1;
}

export function parsePromptFrontmatter(text, label = "prompt") {
  const normalized = normalizePromptText(text);
  if (!normalized.startsWith("---\n")) {
    throw new ContractError("PROMPT_FRONTMATTER_START", `${label} must start with frontmatter`);
  }
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) throw new ContractError("PROMPT_FRONTMATTER_END", `${label} frontmatter is not closed`);
  const root = {};
  const stack = [{ indent: -1, value: root }];
  for (const rawLine of normalized.slice(4, end).split("\n")) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    if (/\t/.test(rawLine.slice(0, rawLine.length - rawLine.trimStart().length))) {
      throw new ContractError("PROMPT_FRONTMATTER_INDENT", `${label} frontmatter cannot use tab indentation`);
    }
    const indent = rawLine.match(/^ */)?.[0].length ?? 0;
    const line = rawLine.trim();
    const separator = findYamlSeparator(line);
    if (separator === -1) {
      throw new ContractError("PROMPT_FRONTMATTER_LINE", `${label} contains unsupported frontmatter line`);
    }
    const key = unquote(line.slice(0, separator));
    const rawValue = line.slice(separator + 1).trim();
    assertSupportedPromptFrontmatterLine(line, rawValue, label);
    if (key === "<<" || key.length === 0) {
      throw new ContractError("PROMPT_FRONTMATTER_UNSUPPORTED_YAML", `${label} contains an unsupported YAML key`);
    }
    while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();
    const parent = stack.at(-1).value;
    if (Object.hasOwn(parent, key)) {
      throw new ContractError("PROMPT_FRONTMATTER_DUPLICATE", `${label} has duplicate key ${key}`);
    }
    if (rawValue === "") {
      const child = {};
      parent[key] = child;
      stack.push({ indent, value: child });
    } else {
      parent[key] = parseScalar(rawValue);
    }
  }
  return {
    frontmatter: root,
    body: normalized.slice(end + 4).replace(/^\n/, ""),
  };
}

function normalizedConfigurationKey(key) {
  return String(key).toLocaleLowerCase("en-US").replace(/[_-]/gu, "");
}

function isModelConfigurationKey(key) {
  const normalized = normalizedConfigurationKey(key);
  return MODEL_CONFIGURATION_KEYS.has(normalized) || MODEL_CONFIGURATION_CONTAINERS.has(normalized);
}

export function findForbiddenAgentModelConfiguration(frontmatter) {
  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    throw new ContractError("PROMPT_FRONTMATTER_OBJECT", "agent frontmatter must be an object");
  }
  const violations = [];
  const visit = (value, keyPath) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, [...keyPath, `[${index}]`]));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (keyPath.length === 0 && normalizedConfigurationKey(key) === "permission") continue;
      const nextPath = [...keyPath, key];
      if (isModelConfigurationKey(key)) {
        violations.push({
          path: nextPath.join(".").replaceAll(".[", "["),
          key,
          kind: MODEL_CONFIGURATION_CONTAINERS.has(normalizedConfigurationKey(key)) ? "container" : "field",
        });
        continue;
      }
      visit(nested, nextPath);
    }
  };
  visit(frontmatter, []);
  return violations;
}

export function inspectAgentPromptModelNeutrality(text, label = "agent prompt") {
  const { frontmatter } = parsePromptFrontmatter(text, label);
  return findForbiddenAgentModelConfiguration(frontmatter);
}

function flattenPermissionSurface(value, prefix = "permission", output = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    output.push(`${prefix}=${String(value)}`);
    return output;
  }
  for (const key of Object.keys(value).sort()) {
    flattenPermissionSurface(value[key], `${prefix}.${key}`, output);
  }
  return output;
}

function paragraphRecords(body) {
  const blocks = normalizePromptText(body).split(/\n\s*\n+/);
  const records = [];
  for (const [sourceIndex, block] of blocks.entries()) {
    const exactText = block.trim();
    const bytes = Buffer.byteLength(exactText, "utf8");
    if (bytes < MIN_DUPLICATE_PARAGRAPH_BYTES) continue;
    const normalizedText = normalizeParagraph(exactText);
    records.push({
      paragraph_id: `p-${sourceIndex + 1}`,
      source_index: sourceIndex,
      exact_fingerprint: hashBytes("sha256", Buffer.from(exactText, "utf8")),
      normalized_fingerprint: hashBytes("sha256", Buffer.from(normalizedText, "utf8")),
      utf8_bytes: bytes,
    });
  }
  const nonEmptyLines = normalizePromptText(body)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  for (let sourceIndex = 0; sourceIndex <= nonEmptyLines.length - DUPLICATE_LINE_WINDOW; sourceIndex += 1) {
    const exactText = nonEmptyLines.slice(sourceIndex, sourceIndex + DUPLICATE_LINE_WINDOW).join("\n").trim();
    const bytes = Buffer.byteLength(exactText, "utf8");
    if (bytes < MIN_DUPLICATE_BLOCK_BYTES) continue;
    const normalizedText = normalizeParagraph(exactText);
    records.push({
      paragraph_id: `w-${sourceIndex + 1}-${DUPLICATE_LINE_WINDOW}`,
      source_index: sourceIndex,
      exact_fingerprint: hashBytes("sha256", Buffer.from(exactText, "utf8")),
      normalized_fingerprint: hashBytes("sha256", Buffer.from(normalizedText, "utf8")),
      utf8_bytes: bytes,
    });
  }
  return records;
}

function sentinelMatches(text, definition) {
  return definition.regex_families.every((family) => family.patterns.some((pattern) => {
    try {
      return new RegExp(pattern, "iu").test(text);
    } catch (error) {
      throw new ContractError("PROMPT_SENTINEL_REGEX", `${definition.sentinel_id}/${family.family_id} has invalid regex: ${error.message}`);
    }
  }));
}

function promptSourceType(path) {
  if (/^agents\/[A-Za-z0-9._-]+\.md$/.test(path)) return "agent";
  if (/^skills\/(?:[A-Za-z0-9._-]+\/)+SKILL\.md$/.test(path)) return "skill";
  return null;
}

function qualityRelevantPromptText(text, sourceType) {
  const normalized = normalizePromptText(text);
  if (sourceType !== "agent") return normalized;
  const lines = normalized.split(/(?<=\n)/u);
  let delimiters = 0;
  let skipIndentedBlock = false;
  return lines.filter((line) => {
    if (/^---\s*(?:\n)?$/u.test(line)) {
      delimiters += 1;
      skipIndentedBlock = false;
      return true;
    }
    if (delimiters !== 1) return true;
    if (/^\s/u.test(line)) return !skipIndentedBlock;
    skipIndentedBlock = false;
    const content = line.trimEnd();
    const separator = findYamlSeparator(content);
    if (separator === -1) return true;
    const key = unquote(content.slice(0, separator));
    if (!isModelConfigurationKey(key)) return true;
    skipIndentedBlock = content.slice(separator + 1).trim() === "";
    return false;
  }).join("");
}

function buildEntry({ path, content, declaredGitBlobOid }, sentinelDefinitions) {
  const sourceType = typeof path === "string" ? promptSourceType(path) : null;
  if (sourceType === null) {
    throw new ContractError("PROMPT_PATH", `unsupported prompt path ${path}`);
  }
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const text = bytes.toString("utf8");
  if (Buffer.from(text, "utf8").compare(bytes) !== 0) {
    throw new ContractError("PROMPT_UTF8", `${path} must be valid UTF-8`);
  }
  const lineEndingNormalized = normalizePromptText(text);
  const normalized = qualityRelevantPromptText(text, sourceType);
  const { frontmatter, body } = parsePromptFrontmatter(text, path);
  if (sourceType === "agent" && (!frontmatter.permission || typeof frontmatter.permission !== "object" || Array.isArray(frontmatter.permission))) {
    throw new ContractError("PROMPT_FRONTMATTER_CONTRACT", `${path} must declare permission`);
  }
  if (sourceType === "skill" && (typeof frontmatter.name !== "string" || typeof frontmatter.description !== "string")) {
    throw new ContractError("PROMPT_FRONTMATTER_CONTRACT", `${path} must declare skill name and description`);
  }
  const permission = sourceType === "agent" ? frontmatter.permission : {};
  const permissionEntries = sourceType === "agent" ? flattenPermissionSurface(permission) : [];
  const toolSurface = sourceType === "agent" ? Object.keys(permission).sort() : [];
  const taskSurface = Object.entries(permission.task ?? {})
    .map(([agent, decision]) => `${agent}:${decision}`)
    .sort();
  const sentinelIds = sentinelDefinitions
    .filter((definition) => definition.required_paths.includes(path) && sentinelMatches(normalized, definition))
    .map((definition) => definition.sentinel_id)
    .sort();
  const qualityBytes = Buffer.from(normalized, "utf8");
  const lineCount = normalized.length === 0
    ? 0
    : normalized.split("\n").length - (normalized.endsWith("\n") ? 1 : 0);
  const computedBlobOid = gitBlobOid(bytes);
  if (declaredGitBlobOid && declaredGitBlobOid !== computedBlobOid) {
    throw new ContractError("PROMPT_GIT_BLOB", `${path} declared Git blob does not match its bytes`);
  }
  return {
    path,
    source_type: sourceType,
    git_blob_oid: declaredGitBlobOid ?? computedBlobOid,
    content_fingerprint: hashBytes("sha256", bytes),
    line_ending_normalized_fingerprint: hashBytes("sha256", Buffer.from(lineEndingNormalized, "utf8")),
    normalized_fingerprint: hashBytes("sha256", qualityBytes),
    utf8_bytes: qualityBytes.length,
    line_count: lineCount,
    steps: sourceType === "agent" ? frontmatter.steps ?? null : null,
    tool_surface: toolSurface,
    task_surface: taskSurface,
    permission_surface_fingerprint: fingerprint(permissionEntries),
    sentinel_ids: sentinelIds,
    paragraphs: paragraphRecords(body),
  };
}

function buildDuplicateGroups(entries) {
  const occurrences = [];
  for (const entry of entries) {
    for (const paragraph of entry.paragraphs) {
      occurrences.push({
        path: entry.path,
        paragraph_id: paragraph.paragraph_id,
        exact_fingerprint: paragraph.exact_fingerprint,
        normalized_fingerprint: paragraph.normalized_fingerprint,
      });
    }
  }
  const groups = [];
  const byExact = Map.groupBy(occurrences, (entry) => entry.exact_fingerprint);
  for (const [groupFingerprint, members] of byExact) {
    if (members.length < 2 || new Set(members.map((entry) => entry.path)).size < 2) continue;
    groups.push({
      group_id: `dup-exact-${groupFingerprint.slice(7, 19)}`,
      kind: "exact",
      paragraph_fingerprint: groupFingerprint,
      occurrences: members
        .map(({ path, paragraph_id }) => ({ path, paragraph_id }))
        .sort((left, right) => `${left.path}:${left.paragraph_id}`.localeCompare(`${right.path}:${right.paragraph_id}`)),
    });
  }
  const byNormalized = Map.groupBy(occurrences, (entry) => entry.normalized_fingerprint);
  for (const [groupFingerprint, members] of byNormalized) {
    if (
      members.length < 2
      || new Set(members.map((entry) => entry.path)).size < 2
      || new Set(members.map((entry) => entry.exact_fingerprint)).size < 2
    ) continue;
    groups.push({
      group_id: `dup-normalized-${groupFingerprint.slice(7, 19)}`,
      kind: "normalized",
      paragraph_fingerprint: groupFingerprint,
      occurrences: members
        .map(({ path, paragraph_id }) => ({ path, paragraph_id }))
        .sort((left, right) => `${left.path}:${left.paragraph_id}`.localeCompare(`${right.path}:${right.paragraph_id}`)),
    });
  }
  return groups.sort((left, right) => left.group_id.localeCompare(right.group_id));
}

function validateRegexFamily(value, label) {
  exact(value, ["family_id", "patterns"], ["family_id", "patterns"], label);
  assertSafeId(value.family_id, `${label}.family_id`);
  assertStringArray(value.patterns, `${label}.patterns`, { min: 1, max: 8, maxBytes: 512 });
  for (const pattern of value.patterns) {
    try {
      new RegExp(pattern, "iu");
    } catch (error) {
      throw new ContractError("PROMPT_SENTINEL_REGEX", `${label} has invalid regex: ${error.message}`);
    }
  }
  return value;
}

function validateSentinelDefinition(value, label) {
  exact(value, ["sentinel_id", "required_paths", "regex_families"], ["sentinel_id", "required_paths", "regex_families"], label);
  assertSafeId(value.sentinel_id, `${label}.sentinel_id`);
  assertStringArray(value.required_paths, `${label}.required_paths`, { min: 1, max: 32, path: true });
  assertArray(value.regex_families, `${label}.regex_families`, { min: 1, max: 8, item: validateRegexFamily });
  return value;
}

function validateOptions(value, label) {
  exact(value, FRONTMATTER_OPTION_KEYS, FRONTMATTER_OPTION_KEYS, label);
  if (value.reasoningEffort !== null) assertString(value.reasoningEffort, `${label}.reasoningEffort`, { maxBytes: 32 });
  if (value.textVerbosity !== null) assertString(value.textVerbosity, `${label}.textVerbosity`, { maxBytes: 32 });
  if (value.temperature !== null && (typeof value.temperature !== "number" || !Number.isFinite(value.temperature))) {
    throw new ContractError("PROMPT_OPTION_TEMPERATURE", `${label}.temperature must be finite or null`);
  }
  if (value.steps !== null) assertInteger(value.steps, `${label}.steps`, { min: 1, max: 10000 });
  return value;
}

function validateParagraph(value, label) {
  exact(
    value,
    ["paragraph_id", "source_index", "exact_fingerprint", "normalized_fingerprint", "utf8_bytes"],
    ["paragraph_id", "source_index", "exact_fingerprint", "normalized_fingerprint", "utf8_bytes"],
    label,
  );
  assertSafeId(value.paragraph_id, `${label}.paragraph_id`);
  assertInteger(value.source_index, `${label}.source_index`, { min: 0, max: 10000 });
  assertFingerprint(value.exact_fingerprint, `${label}.exact_fingerprint`);
  assertFingerprint(value.normalized_fingerprint, `${label}.normalized_fingerprint`);
  assertInteger(value.utf8_bytes, `${label}.utf8_bytes`, { min: MIN_DUPLICATE_BLOCK_BYTES, max: 1024 * 1024 });
  return value;
}

function validateEntryCommon(value, label) {
  const expectedSourceType = promptSourceType(value.path);
  if (expectedSourceType === null) {
    throw new ContractError("PROMPT_PATH", `${label}.path must be an agent prompt or skill entrypoint`);
  }
  assertEnum(value.source_type, SOURCE_TYPES, `${label}.source_type`);
  if (value.source_type !== expectedSourceType) {
    throw new ContractError("PROMPT_SOURCE_TYPE", `${label}.source_type does not match its path`);
  }
  if (!/^[0-9a-f]{40}$/.test(value.git_blob_oid)) {
    throw new ContractError("PROMPT_GIT_BLOB", `${label}.git_blob_oid must be a SHA-1 Git blob identity`);
  }
  assertFingerprint(value.content_fingerprint, `${label}.content_fingerprint`);
  assertFingerprint(value.normalized_fingerprint, `${label}.normalized_fingerprint`);
  assertInteger(value.utf8_bytes, `${label}.utf8_bytes`, { min: 1, max: 1024 * 1024 });
  assertInteger(value.line_count, `${label}.line_count`, { min: 1, max: 100000 });
  assertStringArray(value.tool_surface, `${label}.tool_surface`, { max: 64, maxBytes: 128 });
  assertStringArray(value.task_surface, `${label}.task_surface`, { max: 64, maxBytes: 256 });
  assertFingerprint(value.permission_surface_fingerprint, `${label}.permission_surface_fingerprint`);
  assertStringArray(value.sentinel_ids, `${label}.sentinel_ids`, { max: 32, maxBytes: 128 });
  assertArray(value.paragraphs, `${label}.paragraphs`, { max: 128, item: validateParagraph });
}

function validateEntryV2(value, label) {
  const keys = [
    "path",
    "source_type",
    "git_blob_oid",
    "content_fingerprint",
    "normalized_fingerprint",
    "utf8_bytes",
    "line_count",
    "model",
    "options",
    "tool_surface",
    "task_surface",
    "permission_surface_fingerprint",
    "sentinel_ids",
    "paragraphs",
  ];
  exact(value, keys, keys, label);
  validateEntryCommon(value, label);
  if (value.source_type === "agent") {
    assertString(value.model, `${label}.model`, { maxBytes: 128 });
  } else if (value.model !== null) {
    throw new ContractError("PROMPT_SKILL_MODEL", `${label}.model must be null for a skill`);
  }
  validateOptions(value.options, `${label}.options`);
  if (
    value.source_type === "skill"
    && (
      Object.values(value.options).some((entry) => entry !== null)
      || value.tool_surface.length > 0
      || value.task_surface.length > 0
      || value.permission_surface_fingerprint !== fingerprint([])
    )
  ) {
    throw new ContractError("PROMPT_SKILL_SURFACE", `${label} skill must not synthesize agent model, tool, or permission declarations`);
  }
  return value;
}

function validateEntryV3(value, label) {
  const keys = [
    "path",
    "source_type",
    "git_blob_oid",
    "content_fingerprint",
    "line_ending_normalized_fingerprint",
    "normalized_fingerprint",
    "utf8_bytes",
    "line_count",
    "steps",
    "tool_surface",
    "task_surface",
    "permission_surface_fingerprint",
    "sentinel_ids",
    "paragraphs",
  ];
  exact(value, keys, keys, label);
  validateEntryCommon(value, label);
  assertFingerprint(value.line_ending_normalized_fingerprint, `${label}.line_ending_normalized_fingerprint`);
  if (value.source_type === "agent") {
    if (value.steps !== null) assertInteger(value.steps, `${label}.steps`, { min: 1, max: 10000 });
  } else if (value.steps !== null) {
    throw new ContractError("PROMPT_SKILL_STEPS", `${label}.steps must be null for a skill`);
  }
  if (
    value.source_type === "skill"
    && (
      value.tool_surface.length > 0
      || value.task_surface.length > 0
      || value.permission_surface_fingerprint !== fingerprint([])
    )
  ) {
    throw new ContractError("PROMPT_SKILL_SURFACE", `${label} skill must not synthesize agent tool or permission declarations`);
  }
  return value;
}

function validateOccurrence(value, label) {
  exact(value, ["path", "paragraph_id"], ["path", "paragraph_id"], label);
  assertString(value.path, `${label}.path`, { maxBytes: 512 });
  assertSafeId(value.paragraph_id, `${label}.paragraph_id`);
  return value;
}

function validateDuplicateGroup(value, label) {
  exact(
    value,
    ["group_id", "kind", "paragraph_fingerprint", "occurrences"],
    ["group_id", "kind", "paragraph_fingerprint", "occurrences"],
    label,
  );
  assertSafeId(value.group_id, `${label}.group_id`);
  assertEnum(value.kind, DUPLICATE_KINDS, `${label}.kind`);
  assertFingerprint(value.paragraph_fingerprint, `${label}.paragraph_fingerprint`);
  assertArray(value.occurrences, `${label}.occurrences`, { min: 2, max: 128, item: validateOccurrence });
  if (new Set(value.occurrences.map((entry) => entry.path)).size < 2) {
    throw new ContractError("PROMPT_DUPLICATE_PATHS", `${label} must span at least two prompts`);
  }
  return value;
}

function validateAllowlistEntry(value, label) {
  exact(value, ["group_id", "kind", "paths", "rationale"], ["group_id", "kind", "paths", "rationale"], label);
  assertSafeId(value.group_id, `${label}.group_id`);
  assertEnum(value.kind, DUPLICATE_KINDS, `${label}.kind`);
  assertStringArray(value.paths, `${label}.paths`, { min: 2, max: 64, path: true });
  assertString(value.rationale, `${label}.rationale`, { maxBytes: 1024 });
  return value;
}

function inventoryWithoutFingerprint(inventory) {
  const { content_fingerprint: _ignored, ...body } = inventory;
  return body;
}

export function promptInventoryFingerprint(inventory) {
  return fingerprint(inventoryWithoutFingerprint(inventory));
}

export function sealPromptInventory(inventory) {
  const body = inventoryWithoutFingerprint(inventory);
  return deepFrozenClone({ ...body, content_fingerprint: fingerprint(body) }, "prompt inventory");
}

export function validatePromptInventory(inventory) {
  const keys = [
    "schema_version",
    "inventory_id",
    "baseline_commit",
    "source_kind",
    "source_revision",
    "entries",
    "sentinel_definitions",
    "duplicate_groups",
    "intentional_duplication_allowlist",
    "content_fingerprint",
  ];
  exact(inventory, keys, keys, "prompt inventory");
  if (![2, PROMPT_INVENTORY_SCHEMA_VERSION].includes(inventory.schema_version)) {
    throw new ContractError(
      "QUALITY_SCHEMA_VERSION",
      `prompt inventory.schema_version must be 2 or ${PROMPT_INVENTORY_SCHEMA_VERSION}`,
    );
  }
  assertSafeId(inventory.inventory_id, "prompt inventory.inventory_id");
  assertCommit(inventory.baseline_commit, "prompt inventory.baseline_commit");
  assertEnum(inventory.source_kind, SOURCE_KINDS, "prompt inventory.source_kind");
  if (inventory.source_kind === "git_commit") {
    assertCommit(inventory.source_revision, "prompt inventory.source_revision");
  } else if (inventory.source_revision !== null) {
    throw new ContractError("PROMPT_SOURCE_REVISION", "worktree inventory source_revision must be null");
  }
  const validateEntry = inventory.schema_version === 2 ? validateEntryV2 : validateEntryV3;
  assertArray(inventory.entries, "prompt inventory.entries", { min: 1, max: 64, item: validateEntry });
  const entriesByPath = new Map();
  for (const entry of inventory.entries) {
    if (entriesByPath.has(entry.path)) throw new ContractError("PROMPT_ENTRY_DUPLICATE", `duplicate prompt entry ${entry.path}`);
    entriesByPath.set(entry.path, entry);
  }
  assertArray(inventory.sentinel_definitions, "prompt inventory.sentinel_definitions", { min: 1, max: 32, item: validateSentinelDefinition });
  const sentinelIds = new Set();
  for (const definition of inventory.sentinel_definitions) {
    if (sentinelIds.has(definition.sentinel_id)) throw new ContractError("PROMPT_SENTINEL_DUPLICATE", `duplicate sentinel ${definition.sentinel_id}`);
    sentinelIds.add(definition.sentinel_id);
    for (const requiredPath of definition.required_paths) {
      const entry = entriesByPath.get(requiredPath);
      if (!entry) throw new ContractError("PROMPT_SENTINEL_PATH", `${definition.sentinel_id} references missing ${requiredPath}`);
    }
  }
  for (const entry of inventory.entries) {
    for (const sentinelId of entry.sentinel_ids) {
      if (!sentinelIds.has(sentinelId)) throw new ContractError("PROMPT_SENTINEL_UNKNOWN", `${entry.path} references unknown sentinel ${sentinelId}`);
    }
  }
  assertArray(inventory.duplicate_groups, "prompt inventory.duplicate_groups", { max: 128, item: validateDuplicateGroup });
  const groupsById = new Map();
  for (const group of inventory.duplicate_groups) {
    if (groupsById.has(group.group_id)) throw new ContractError("PROMPT_DUPLICATE_GROUP_ID", `duplicate group ${group.group_id}`);
    groupsById.set(group.group_id, group);
    for (const occurrence of group.occurrences) {
      const entry = entriesByPath.get(occurrence.path);
      const paragraph = entry?.paragraphs.find((candidate) => candidate.paragraph_id === occurrence.paragraph_id);
      if (!paragraph) throw new ContractError("PROMPT_DUPLICATE_OCCURRENCE", `${group.group_id} references an unknown paragraph`);
      const expectedFingerprint = group.kind === "exact" ? paragraph.exact_fingerprint : paragraph.normalized_fingerprint;
      if (expectedFingerprint !== group.paragraph_fingerprint) {
        throw new ContractError("PROMPT_DUPLICATE_FINGERPRINT", `${group.group_id} occurrence fingerprint mismatch`);
      }
    }
  }
  assertArray(
    inventory.intentional_duplication_allowlist,
    "prompt inventory.intentional_duplication_allowlist",
    { max: 128, item: validateAllowlistEntry },
  );
  const allowlistIds = new Set();
  for (const allowed of inventory.intentional_duplication_allowlist) {
    if (allowlistIds.has(allowed.group_id)) throw new ContractError("PROMPT_ALLOWLIST_DUPLICATE", `duplicate allowlist entry ${allowed.group_id}`);
    allowlistIds.add(allowed.group_id);
    const group = groupsById.get(allowed.group_id);
    const groupPaths = group ? [...new Set(group.occurrences.map((entry) => entry.path))].sort() : [];
    if (!group || group.kind !== allowed.kind || canonicalJson(groupPaths) !== canonicalJson([...allowed.paths].sort())) {
      throw new ContractError("PROMPT_ALLOWLIST_STALE", `${allowed.group_id} does not exactly bind a duplicate group`);
    }
  }
  if (inventory.content_fingerprint !== promptInventoryFingerprint(inventory)) {
    throw new ContractError("PROMPT_INVENTORY_FINGERPRINT", "prompt inventory content fingerprint is invalid");
  }
  return inventory;
}

export function createIntentionalDuplicationAllowlist(duplicateGroups) {
  assertArray(duplicateGroups, "duplicateGroups", { max: 128, item: validateDuplicateGroup });
  return duplicateGroups.map((group) => ({
    group_id: group.group_id,
    kind: group.kind,
    paths: [...new Set(group.occurrences.map((entry) => entry.path))].sort(),
    rationale: group.kind === "exact"
      ? "Starting-profile role boundary is intentionally repeated; any changed or additional copy requires explicit review."
      : "Starting-profile semantic boundary uses role-specific wording; any changed or additional near-duplicate requires explicit review.",
  }));
}

export function createPromptInventory({
  inventoryId,
  baselineCommit,
  sourceKind,
  sourceRevision,
  promptSources,
  sentinelDefinitions = DEFAULT_PROMPT_SENTINELS,
  intentionalDuplicationAllowlist = [],
}) {
  assertSafeId(inventoryId, "inventoryId");
  assertCommit(baselineCommit, "baselineCommit");
  assertEnum(sourceKind, SOURCE_KINDS, "sourceKind");
  assertArray(promptSources, "promptSources", { min: 1, max: 64 });
  const definitions = JSON.parse(JSON.stringify(sentinelDefinitions));
  definitions.forEach(validateSentinelDefinition);
  let entries = promptSources
    .map((source) => {
      exact(source, ["path", "content", "git_blob_oid"], ["path", "content"], "prompt source");
      return buildEntry({
        path: source.path.replaceAll("\\", "/"),
        content: source.content,
        declaredGitBlobOid: source.git_blob_oid ?? null,
      }, definitions);
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  const duplicateGroups = buildDuplicateGroups(entries);
  const duplicatedParagraphs = new Set(duplicateGroups.flatMap((group) => (
    group.occurrences.map((occurrence) => `${occurrence.path}:${occurrence.paragraph_id}`)
  )));
  entries = entries.map((entry) => ({
    ...entry,
    paragraphs: entry.paragraphs.filter((paragraph) => duplicatedParagraphs.has(`${entry.path}:${paragraph.paragraph_id}`)),
  }));
  const sealed = sealPromptInventory({
    schema_version: PROMPT_INVENTORY_SCHEMA_VERSION,
    inventory_id: inventoryId,
    baseline_commit: baselineCommit,
    source_kind: sourceKind,
    source_revision: sourceRevision,
    entries,
    sentinel_definitions: definitions,
    duplicate_groups: duplicateGroups,
    intentional_duplication_allowlist: intentionalDuplicationAllowlist,
  });
  validatePromptInventory(sealed);
  return sealed;
}

function validateDeclaredChange(value, label) {
  exact(value, ["path", "aspects", "rationale"], ["path", "aspects", "rationale"], label);
  assertString(value.path, `${label}.path`, { maxBytes: 512 });
  assertStringArray(value.aspects, `${label}.aspects`, { min: 1, max: CHANGE_ASPECTS.length });
  for (const aspect of value.aspects) assertEnum(aspect, CHANGE_ASPECTS, `${label}.aspects[]`);
  assertString(value.rationale, `${label}.rationale`, { maxBytes: 1024 });
  return value;
}

function changeDeclared(path, aspect, declaredChanges) {
  return declaredChanges.some((entry) => entry.path === path && entry.aspects.includes(aspect));
}

export function comparePromptInventories(baseline, current, { declaredChanges = [] } = {}) {
  validatePromptInventory(baseline);
  validatePromptInventory(current);
  if (baseline.schema_version !== current.schema_version) {
    throw new ContractError(
      "PROMPT_INVENTORY_VERSION_SKEW",
      "prompt inventories must use the same schema version before comparison",
    );
  }
  if (baseline.baseline_commit !== current.baseline_commit) {
    throw new ContractError("PROMPT_BASELINE_COMMIT", "prompt inventories do not share the same immutable baseline commit");
  }
  assertArray(declaredChanges, "declaredChanges", { max: 64, item: validateDeclaredChange });
  const baselineEntries = new Map(baseline.entries.map((entry) => [entry.path, entry]));
  const currentEntries = new Map(current.entries.map((entry) => [entry.path, entry]));
  const findings = [];
  const changes = [];
  const addFinding = (code, path, aspect, message, { declarable = true } = {}) => {
    const declared = declarable && changeDeclared(path, aspect, declaredChanges);
    changes.push({ code, path, aspect, declared, message });
    if (!declared) findings.push({ code, path, aspect, message });
  };
  if (canonicalJson(baseline.sentinel_definitions) !== canonicalJson(current.sentinel_definitions)) {
    addFinding(
      "PROMPT_SENTINEL_POLICY_DRIFT",
      "quality/prompt-sentinels",
      "sentinels",
      "semantic sentinel definitions changed relative to the immutable baseline",
      { declarable: false },
    );
  }
  for (const path of [...baselineEntries.keys()].sort()) {
    if (!currentEntries.has(path)) addFinding("PROMPT_PATH_REMOVED", path, "content", "baseline prompt path was removed");
  }
  for (const path of [...currentEntries.keys()].sort()) {
    if (!baselineEntries.has(path)) addFinding("PROMPT_PATH_ADDED", path, "content", "new prompt path is not declared against the baseline");
  }
  for (const path of [...baselineEntries.keys()].filter((entry) => currentEntries.has(entry)).sort()) {
    const before = baselineEntries.get(path);
    const after = currentEntries.get(path);
    if (before.content_fingerprint !== after.content_fingerprint) {
      if (baseline.schema_version === 3 && before.line_ending_normalized_fingerprint === after.line_ending_normalized_fingerprint) {
        changes.push({
          code: "PROMPT_LINE_ENDING_ONLY",
          path,
          aspect: "content",
          declared: true,
          message: "raw bytes changed but line-ending-normalized prompt content is stable",
        });
      } else if (before.normalized_fingerprint === after.normalized_fingerprint) {
        if (baseline.schema_version === 2) {
          const configMetadataChanged = before.model !== after.model
            || before.options.reasoningEffort !== after.options.reasoningEffort
            || before.options.textVerbosity !== after.options.textVerbosity;
          changes.push({
            code: configMetadataChanged ? "PROMPT_CONFIG_METADATA_ONLY" : "PROMPT_LINE_ENDING_ONLY",
            path,
            aspect: "content",
            declared: true,
            message: configMetadataChanged
              ? "model or provider-option metadata changed while quality-relevant prompt content stayed stable"
              : "raw bytes changed but normalized prompt content is stable",
          });
        } else {
          changes.push({
            code: "PROMPT_NON_POLICY_FRONTMATTER_ONLY",
            path,
            aspect: "content",
            declared: true,
            message: "model/provider configuration bytes changed while model-neutral quality policy stayed stable",
          });
        }
      } else {
        addFinding("PROMPT_CONTENT_DRIFT", path, "content", "normalized prompt content changed");
      }
      if (
        before.normalized_fingerprint !== after.normalized_fingerprint
        && (after.utf8_bytes > before.utf8_bytes || after.line_count > before.line_count)
      ) {
        addFinding(
          "PROMPT_UNREVIEWED_GROWTH",
          path,
          "content",
          `prompt grew from ${before.utf8_bytes} bytes/${before.line_count} lines to ${after.utf8_bytes} bytes/${after.line_count} lines`,
        );
      }
    }
    if (baseline.schema_version === 2) {
      if (before.model !== after.model) {
        changes.push({ code: "PROMPT_MODEL_METADATA_CHANGED", path, aspect: "model", declared: true, message: "model metadata changed" });
      }
      if (
        before.options.reasoningEffort !== after.options.reasoningEffort
        || before.options.textVerbosity !== after.options.textVerbosity
      ) {
        changes.push({ code: "PROMPT_PROVIDER_OPTION_METADATA_CHANGED", path, aspect: "options", declared: true, message: "optional provider metadata changed" });
      }
      if (before.options.temperature !== after.options.temperature || before.options.steps !== after.options.steps) {
        addFinding("PROMPT_OPTION_DRIFT", path, "options", "model option declarations changed");
      }
    } else if (before.steps !== after.steps) {
      addFinding("PROMPT_STEP_LIMIT_DRIFT", path, "steps", "model-neutral agent step limit changed");
    }
    if (canonicalJson(before.tool_surface) !== canonicalJson(after.tool_surface) || canonicalJson(before.task_surface) !== canonicalJson(after.task_surface)) {
      addFinding("PROMPT_TOOL_SURFACE_DRIFT", path, "tool_surface", "declared tool or delegation surface changed");
    }
    if (before.permission_surface_fingerprint !== after.permission_surface_fingerprint) {
      addFinding("PROMPT_PERMISSION_SURFACE_DRIFT", path, "permission_surface", "permission surface changed");
    }
    const missingSentinels = before.sentinel_ids.filter((sentinelId) => !after.sentinel_ids.includes(sentinelId));
    if (missingSentinels.length > 0) {
      addFinding(
        "PROMPT_SAFETY_SENTINEL_REMOVED",
        path,
        "sentinels",
        `required semantic sentinels removed: ${missingSentinels.join(", ")}`,
        { declarable: false },
      );
    }
  }
  const allowedGroupKeys = new Set(baseline.intentional_duplication_allowlist.map((entry) => canonicalJson({
    kind: entry.kind,
    paths: [...entry.paths].sort(),
    group_id: entry.group_id,
  })));
  const currentGroupsById = new Map(current.duplicate_groups.map((entry) => [entry.group_id, entry]));
  for (const group of current.duplicate_groups) {
    const paths = [...new Set(group.occurrences.map((entry) => entry.path))].sort();
    const key = canonicalJson({ kind: group.kind, paths, group_id: group.group_id });
    if (!allowedGroupKeys.has(key)) {
      const path = paths.join(",");
      addFinding(
        "PROMPT_DUPLICATION_UNREVIEWED",
        path,
        "duplication",
        `${group.kind} duplicate group ${group.group_id} is not allowlisted`,
        { declarable: false },
      );
    }
  }
  for (const allowed of baseline.intentional_duplication_allowlist) {
    const group = currentGroupsById.get(allowed.group_id);
    const paths = group ? [...new Set(group.occurrences.map((entry) => entry.path))].sort() : [];
    if (!group || group.kind !== allowed.kind || canonicalJson(paths) !== canonicalJson([...allowed.paths].sort())) {
      changes.push({
        code: "PROMPT_DUPLICATION_REMOVED",
        path: allowed.paths.join(","),
        aspect: "duplication",
        declared: true,
        message: `starting-profile duplicate group ${allowed.group_id} is no longer present`,
      });
    }
  }
  for (const declaration of declaredChanges) {
    for (const aspect of declaration.aspects) {
      if (!changes.some((entry) => entry.path === declaration.path && entry.aspect === aspect && entry.declared)) {
        findings.push({
          code: "PROMPT_DECLARATION_STALE",
          path: declaration.path,
          aspect,
          message: "declared prompt change does not match an observed reviewable delta",
        });
      }
    }
  }
  return deepFrozenClone({
    baseline_inventory_id: baseline.inventory_id,
    current_inventory_id: current.inventory_id,
    baseline_commit: baseline.baseline_commit,
    status: findings.length === 0 ? "passed" : "failed",
    findings,
    changes,
  }, "prompt inventory comparison");
}
