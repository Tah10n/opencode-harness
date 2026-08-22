import { createHash } from "node:crypto";

const SAFE_PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.\.(?:\/|$))[^\r\n\0]{1,512}$/u;
const MAX_REQUIREMENTS_CHARS = 24_000;
const MAX_CLAUSES = 24;
const MAX_CLAUSE_CHARS = 1_000;

const CATEGORY_PATTERNS = Object.freeze([
  ["preservation", /\b(?:preserv|keep|unchanged|without mutat|never mutat|do not mutat|retain|unmentioned)\w*/iu],
  ["ordering", /\b(?:precedence|priority|before|after|order|lowest|highest|first|last|sequence)\w*/iu],
  ["partial-failure", /\b(?:partial|fail|error|retry|cancel|cleanup|rollback|atomic|idempot)\w*/iu],
  ["compatibility", /\b(?:compat|version|migration|schema|legacy|backward|existing consumer)\w*/iu],
  ["trust-boundary", /\b(?:untrusted|authoriz|permission|secret|credential|path|escape|confin|redact|inject)\w*/iu],
  ["boundary", /\b(?:including|empty|null|undefined|outside|malformed|duplicate|missing|zero|negative|maximum|minimum|boundary)\w*/iu],
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}

function normalizeClause(value) {
  return value.replace(/\s+/gu, " ").replace(/^[,;:.\s]+|[,;:.\s]+$/gu, "").trim();
}

function visibleGoal(requirements) {
  const scopeIndex = requirements.indexOf("Task scope:");
  return normalizeClause(scopeIndex === -1 ? requirements : requirements.slice(0, scopeIndex));
}

function clauseCategory(clause, index) {
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(clause)) return category;
  }
  return index === 0 ? "primary" : "behavior";
}

function compileClauses(goal) {
  const withoutFixtureLabel = goal.replace(/^Case\s+[^:]{1,200}:\s*/u, "");
  const fragments = withoutFixtureLabel
    .split(/\s*(?:;|\.(?=\s|$)|,(?=\s)|\b(?:and|but)\b)\s*/iu)
    .map(normalizeClause)
    .filter((entry) => entry.length > 0);
  const bounded = (fragments.length === 0 ? [withoutFixtureLabel] : fragments)
    .slice(0, MAX_CLAUSES)
    .map((text, index) => ({
      clause_id: `visible-${index + 1}`,
      category: clauseCategory(text, index),
      text: text.slice(0, MAX_CLAUSE_CHARS),
    }));
  if (bounded.length === 0) throw new Error("VISIBLE_CONTRACT_MANIFEST_CLAUSE: no visible clause was compiled");
  return bounded;
}

export function buildVisibleContractManifest({
  visible_requirements,
  task_scope,
} = {}) {
  if (typeof visible_requirements !== "string" || visible_requirements.length < 1
    || visible_requirements.length > MAX_REQUIREMENTS_CHARS || visible_requirements.includes("\0")) {
    throw new Error("VISIBLE_CONTRACT_MANIFEST_INPUT: visible requirements are invalid");
  }
  if (task_scope === null || typeof task_scope !== "object"
    || !["edit", "read-only"].includes(task_scope.mode)
    || !Array.isArray(task_scope.allowed_changed_paths)
    || !Number.isSafeInteger(task_scope.max_changed_files)) {
    throw new Error("VISIBLE_CONTRACT_MANIFEST_INPUT: task scope is invalid");
  }
  const targetPaths = [...new Set(task_scope.allowed_changed_paths)];
  if (targetPaths.length !== task_scope.allowed_changed_paths.length
    || targetPaths.some((entry) => typeof entry !== "string" || !SAFE_PATH.test(entry)
      || entry.split("/").some((part) => ["", ".", ".."].includes(part)))) {
    throw new Error("VISIBLE_CONTRACT_MANIFEST_PATH: task scope path is unsafe");
  }
  if ((task_scope.mode === "read-only" && (targetPaths.length !== 0 || task_scope.max_changed_files !== 0))
    || (task_scope.mode === "edit" && (targetPaths.length === 0
      || task_scope.max_changed_files < 1 || task_scope.max_changed_files > targetPaths.length))) {
    throw new Error("VISIBLE_CONTRACT_MANIFEST_SCOPE: task scope is inconsistent");
  }
  const goal = visibleGoal(visible_requirements);
  if (goal.length === 0) throw new Error("VISIBLE_CONTRACT_MANIFEST_GOAL: visible goal is empty");
  const clauses = Object.freeze(compileClauses(goal).map((entry) => Object.freeze(entry)));
  const source = {
    schema_version: 1,
    producer: "host-visible-contract-compiler",
    authority: "derived-aid-visible-requirements-remain-authoritative",
    goal,
    clauses,
    task_scope: Object.freeze({
      mode: task_scope.mode,
      allowed_changed_paths: Object.freeze(targetPaths),
      max_changed_files: task_scope.max_changed_files,
    }),
  };
  return Object.freeze({ ...source, manifest_fingerprint: fingerprint(source) });
}

export function renderVisibleContractManifest(manifest) {
  return `HOST_VISIBLE_CONTRACT_V1=${JSON.stringify(manifest)}`;
}
