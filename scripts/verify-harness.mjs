import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(code, message, fix) {
  failures.push({ code, message, fix });
}

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail("HARNESS-S001", `required file missing: ${relativePath}`, "Restore the required harness file or remove the invariant that references it.");
    return "";
  }
  return fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, "");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function listFiles(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relativePath = path.join(dir, entry.name).replaceAll("\\", "/");
    if ([".git", "node_modules", "dist", ".cache", ".oc_learning", "local"].includes(entry.name)) {
      continue;
    }
    if (entry.isDirectory()) {
      listFiles(relativePath, out);
    } else {
      out.push(relativePath);
    }
  }
  return out;
}

function assertIncludes(text, needle, label, code = "HARNESS-S002", fix = "Restore the expected invariant.") {
  if (!text.includes(needle)) {
    fail(code, `${label} missing ${needle}`, fix);
  }
}

function assertNotIncludes(text, needle, label, code = "HARNESS-S003", fix = "Remove stale or forbidden content.") {
  if (text.includes(needle)) {
    fail(code, `${label} still references ${needle}`, fix);
  }
}

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseScalar(value) {
  const unquoted = unquote(value);
  if (unquoted === "true") return true;
  if (unquoted === "false") return false;
  if (/^-?\d+$/.test(unquoted)) return Number(unquoted);
  return unquoted;
}

function findYamlSeparator(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && line[index - 1] !== "\\") {
      quote = quote === char ? null : quote ?? char;
      continue;
    }
    if (char === ":" && quote === null) {
      return index;
    }
  }
  return -1;
}

function parseYamlSubset(yaml, label) {
  const rootObject = {};
  const stack = [{ indent: -1, value: rootObject }];

  for (const rawLine of yaml.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }
    const indent = rawLine.match(/^ */)?.[0].length ?? 0;
    const line = rawLine.trim();
    const separator = findYamlSeparator(line);
    if (separator === -1) {
      fail("HARNESS-S004", `${label} contains unsupported frontmatter line: ${rawLine}`, "Keep agent frontmatter in the simple key/value format used by this template.");
      continue;
    }

    const key = unquote(line.slice(0, separator));
    const value = line.slice(separator + 1).trim();
    while (stack.length > 1 && indent <= stack.at(-1).indent) {
      stack.pop();
    }
    const parent = stack.at(-1).value;
    if (value === "") {
      const child = {};
      parent[key] = child;
      stack.push({ indent, value: child });
    } else {
      parent[key] = parseScalar(value);
    }
  }

  return rootObject;
}

function frontmatterFor(file) {
  const text = read(file);
  if (!text.startsWith("---\n")) {
    fail("HARNESS-S005", `${file} must start with frontmatter`, "Add OpenCode frontmatter at the top of the agent file.");
    return {};
  }
  const end = text.indexOf("\n---", 4);
  if (end === -1) {
    fail("HARNESS-S006", `${file} frontmatter is not closed`, "Close the frontmatter block with ---.");
    return {};
  }
  return parseYamlSubset(text.slice(4, end), file);
}

function assertPermission(agent, permission, key, expected, code, fix) {
  const actual = permission?.[key];
  if (actual !== expected) {
    fail(code, `agents/${agent}.md permission ${key} expected ${expected}, got ${actual ?? "<missing>"}`, fix);
  }
}

const requiredFiles = [
  "AGENTS.md",
  ".gitattributes",
  ".github/workflows/verify.yml",
  "CHANGELOG.md",
  "CODEOWNERS",
  "CONTRIBUTING.md",
  "README.md",
  "SECURITY.md",
  "opencode.json",
  "commands/learn.md",
  "commands/curate-learning.md",
  "agents/orchestrator.md",
  "agents/orchestrator-deep.md",
  "agents/review-orchestrator.md",
  "agents/explore.md",
  "agents/architect.md",
  "agents/general.md",
  "agents/reviewer.md",
  "agents/diagnose.md",
  "agents/researcher.md",
  "agents/verifier.md",
  "agents/improver.md",
  "skills/global-review-ledger/SKILL.md",
  "skills/global-harness-release-review/SKILL.md",
  "skills/global-quality-gates/SKILL.md",
  "skills/global-memory/SKILL.md",
  "skills/global-self-improvement/SKILL.md",
  "docs/recursive-context-mode.md",
  "docs/live-evaluation.md",
  "docs/trace-contract.md",
  "docs/budgets-and-termination.md",
  "docs/subagent-result-schema.md",
  "docs/memory-and-self-improvement.md",
  "docs/adoption.md",
  "docs/compatibility.md",
  "docs/evaluation.md",
  "docs/harness-map.md",
  "docs/harnessability.md",
  "docs/release.md",
  "examples/minimal-opencode.json",
  "examples/agent-tool-permissions.md",
  "examples/high-assurance-project/WORKFLOW.md",
  "examples/project-workflow/WORKFLOW.md",
  "examples/project-workflow/project-skill/SKILL.md",
  "fixtures/sample-project/WORKFLOW.md",
  "fixtures/runtime-debug/debug-config.txt",
  "fixtures/runtime-debug/debug-agent-orchestrator.txt",
  "fixtures/runtime-debug/debug-agent-orchestrator-deep.txt",
  "fixtures/runtime-debug/debug-agent-review-orchestrator.txt",
  "fixtures/runtime-debug/debug-agent-general.txt",
  "fixtures/runtime-debug/debug-agent-explore.txt",
  "fixtures/runtime-debug/debug-agent-architect.txt",
  "fixtures/runtime-debug/debug-agent-reviewer.txt",
  "fixtures/runtime-debug/debug-agent-diagnose.txt",
  "fixtures/runtime-debug/debug-agent-verifier.txt",
  "fixtures/runtime-debug/debug-agent-researcher.txt",
  "fixtures/runtime-debug/debug-agent-improver.txt",
  "fixtures/adversarial/README.md",
  "fixtures/adversarial/prompt-injection/README.md",
  "fixtures/adversarial/command-injection/README.md",
  "fixtures/adversarial/secret-bait/README.md",
  "fixtures/adversarial/review-only-trap/README.md",
  "evals/README.md",
  "evals/hidden/runner-self-test/hidden.test.js",
  "evals/scenario.schema.json",
  "evals/scenarios/runner-self-test.json",
  "scripts/evaluate-live.mjs",
  "scripts/evaluate-harness.mjs",
  "scripts/verify-drift.mjs",
  "scripts/verify-runtime-fixtures.mjs",
  "scripts/verify-runtime.mjs",
];

for (const file of requiredFiles) {
  if (!exists(file)) {
    fail("HARNESS-S001", `required file missing: ${file}`, "Restore the required harness file.");
  }
}

const packageJson = JSON.parse(read("package.json"));
if (packageJson.version !== "0.2.0") {
  fail("HARNESS-S007", "package.json version must match the latest release plan", "Update docs, changelog, and release metadata together with the version.");
}
if (packageJson.scripts?.verify !== "npm run verify:static && npm run eval && npm run verify:drift && npm run verify:runtime:fixture && npm run verify:live-eval") {
  fail("HARNESS-S008", "package.json must run static verification, eval, drift, runtime fixture checks, and live-eval deterministic checks from npm run verify", "Keep fast deterministic sensors in the default verify command.");
}
if (packageJson.scripts?.eval !== "node scripts/evaluate-harness.mjs") {
  fail("HARNESS-S009", "package.json must expose npm run eval", "Restore the evaluation script entry.");
}
if (packageJson.scripts?.["eval:live"] !== "node scripts/evaluate-live.mjs") {
  fail("HARNESS-S009", "package.json must expose npm run eval:live", "Restore the optional live evaluation script entry.");
}
if (packageJson.scripts?.["eval:live:validate"] !== "node scripts/evaluate-live.mjs --validate") {
  fail("HARNESS-S009", "package.json must expose npm run eval:live:validate", "Restore the deterministic live-evaluation manifest validator entry.");
}
if (packageJson.scripts?.["eval:live:self-test"] !== "node scripts/evaluate-live.mjs --self-test") {
  fail("HARNESS-S009", "package.json must expose npm run eval:live:self-test", "Restore the deterministic live-evaluation runner self-test entry.");
}
if (packageJson.scripts?.["verify:live-eval"] !== "npm run eval:live:validate && npm run eval:live:self-test") {
  fail("HARNESS-S009", "package.json must expose npm run verify:live-eval", "Keep live-eval deterministic checks in the default verification gate.");
}
if (packageJson.scripts?.["verify:static"] !== "node scripts/verify-harness.mjs") {
  fail("HARNESS-S010", "package.json must expose npm run verify:static", "Restore the static verifier entry.");
}
if (packageJson.scripts?.["verify:drift"] !== "node scripts/verify-drift.mjs") {
  fail("HARNESS-S011", "package.json must expose npm run verify:drift", "Restore the drift verifier entry.");
}
if (packageJson.scripts?.["verify:runtime"] !== "node scripts/verify-runtime.mjs") {
  fail("HARNESS-S012", "package.json must expose npm run verify:runtime", "Restore the runtime verifier entry.");
}
if (packageJson.scripts?.["verify:runtime:fixture"] !== "node scripts/verify-runtime-fixtures.mjs") {
  fail("HARNESS-S012", "package.json must expose npm run verify:runtime:fixture", "Restore the deterministic runtime fixture verifier entry.");
}
if (packageJson.repository?.url !== "git+https://github.com/Tah10n/opencode-harness.git") {
  fail("HARNESS-S013", "package.json must point repository.url at Tah10n/opencode-harness", "Keep published package metadata aligned with GitHub.");
}
if (packageJson.homepage !== "https://github.com/Tah10n/opencode-harness#readme") {
  fail("HARNESS-S014", "package.json must expose the GitHub README as homepage", "Keep the homepage pointing at the public README.");
}
if (packageJson.dependencies?.["@opencode-ai/plugin"]) {
  fail("HARNESS-S015", "opencode-harness must not depend on plugin packages", "Capabilities live in sibling packages; keep this repo as a behavior profile.");
}

const config = JSON.parse(read("opencode.json"));
if (config.default_agent !== "orchestrator") {
  fail("HARNESS-S016", "opencode.json default_agent must be orchestrator", "Restore the primary harness orchestrator.");
}
for (const commandName of ["review-diff", "diagnose", "workflow", "harness-release-review"]) {
  if (!config.command?.[commandName]) {
    fail("HARNESS-S017", `opencode.json missing command: ${commandName}`, "Restore the command entry or update docs and tests.");
  }
}
if (config.command?.["review-diff"]?.agent !== "review-orchestrator") {
  fail("HARNESS-S039", "review-diff must route through review-orchestrator", "Keep broad review commands on the read-only primary review boundary.");
}
if (config.command?.["harness-release-review"]?.agent !== "review-orchestrator") {
  fail("HARNESS-S040", "harness-release-review must route through review-orchestrator", "Keep release review on the read-only primary review boundary.");
}
if (config.command?.diagnose?.agent !== "diagnose") {
  fail("HARNESS-S041", "diagnose command must keep using diagnose", "Do not route diagnosis through the review primary.");
}
if (!config.watcher?.ignore?.includes(".oc_learning/**")) {
  fail("HARNESS-S018", "opencode.json watcher must ignore .oc_learning/**", "Prevent memory backups from becoming noisy watched changes.");
}
if (config.permission?.external_directory !== "ask") {
  fail("HARNESS-S019", "opencode.json must ask before external directory access", "Keep cross-directory access explicit.");
}
if (config.permission?.["oc_learning_*"] !== "deny") {
  fail("HARNESS-S020", "root permissions must deny oc_learning_* by default", "Route persistent writes through improver only.");
}

const rootDangerousPatterns = [
  "rm *",
  "Remove-Item *",
  "git clean*",
  "git reset*",
  "git rebase*",
  "git push --force*",
  "git push --delete*",
  "npm publish*",
  "docker system prune*",
  "kubectl delete*",
];

for (const pattern of rootDangerousPatterns) {
  if (config.permission?.bash?.[pattern] !== "ask") {
    fail("HARNESS-S021", `root bash permission ${pattern} must ask`, "Dangerous commands should require explicit approval.");
  }
}

const agentNames = [
  "orchestrator",
  "orchestrator-deep",
  "review-orchestrator",
  "explore",
  "architect",
  "general",
  "reviewer",
  "diagnose",
  "researcher",
  "verifier",
  "improver",
];
const readOnlyAgents = ["review-orchestrator", "explore", "architect", "reviewer", "diagnose", "verifier", "researcher", "improver"];
const contextAgents = ["orchestrator", "orchestrator-deep", "review-orchestrator", "explore", "architect", "reviewer", "diagnose", "verifier"];
const contextTools = ["context_outline", "context_files", "context_read", "context_search"];
const frontmatters = new Map();

for (const agent of agentNames) {
  const file = `agents/${agent}.md`;
  const frontmatter = frontmatterFor(file);
  frontmatters.set(agent, frontmatter);
  if (!frontmatter.description) {
    fail("HARNESS-S022", `${file} missing description`, "Add a concise agent description.");
  }
  if (!frontmatter.mode) {
    fail("HARNESS-S023", `${file} missing mode`, "Declare primary or subagent mode.");
  }
  if (!frontmatter.permission || typeof frontmatter.permission !== "object") {
    fail("HARNESS-S024", `${file} missing permission block`, "Declare the agent permission surface explicitly.");
  }

  const permission = frontmatter.permission ?? {};
  if (readOnlyAgents.includes(agent)) {
    assertPermission(agent, permission, "edit", "deny", "HARNESS-S025", "Read-only subagents must deny edits structurally.");
  }
  if (contextAgents.includes(agent)) {
    for (const tool of contextTools) {
      assertPermission(agent, permission, tool, "allow", "HARNESS-S026", "Agents that participate in broad context work need safe context tools.");
    }
  }
  if (agent === "researcher") {
    assertPermission(agent, permission, "webfetch", "allow", "HARNESS-S027", "Researcher should be the web-capable agent.");
    assertPermission(agent, permission, "websearch", "allow", "HARNESS-S028", "Researcher should be the web-capable agent.");
  } else if (permission.webfetch === "allow" || permission.websearch === "allow") {
    fail("HARNESS-S029", `${file} should not allow web tools`, "Keep web research isolated in the researcher agent.");
  }
  if (agent === "improver") {
    assertPermission(agent, permission, "oc_learning_*", "ask", "HARNESS-S030", "Improver is the only bounded learning write path.");
  } else if (permission["oc_learning_*"] && permission["oc_learning_*"] !== "deny") {
    fail("HARNESS-S031", `${file} must not request oc_learning_* writes`, "Route persistent writes through improver only.");
  }
  if (agent === "general") {
    assertPermission(agent, permission, "edit", "allow", "HARNESS-S035", "Implementation workers should declare write access explicitly.");
  }
}

for (const agent of ["orchestrator", "orchestrator-deep"]) {
  const taskPermissions = frontmatters.get(agent)?.permission?.task ?? {};
  for (const delegatedAgent of ["explore", "architect", "general", "reviewer", "diagnose", "researcher", "improver", "verifier"]) {
    if (taskPermissions[delegatedAgent] !== "allow") {
      fail("HARNESS-S032", `${agent} cannot delegate to ${delegatedAgent}`, "Primary orchestrators should be able to route focused work.");
    }
  }
}

const reviewOrchestratorFrontmatter = frontmatters.get("review-orchestrator") ?? {};
if (reviewOrchestratorFrontmatter.mode !== "primary") {
  fail("HARNESS-S042", "review-orchestrator must be a primary agent", "Keep review commands on a primary read-only orchestrator.");
}
const reviewOrchestratorPermission = reviewOrchestratorFrontmatter.permission ?? {};
if (reviewOrchestratorPermission?.bash?.["*"] !== "deny") {
  fail("HARNESS-S043", "review-orchestrator bash wildcard must deny", "Do not grant broad shell access to the read-only review primary.");
}
for (const forbiddenShellReader of ["rg *", "Get-Content *", "Get-ChildItem *", "Select-String *", "ls *", "dir *"]) {
  if (reviewOrchestratorPermission?.bash?.[forbiddenShellReader] !== undefined) {
    fail("HARNESS-S043", `review-orchestrator must not allow broad shell reader ${forbiddenShellReader}`, "Use safe context tools and necessary read-only git commands for review context.");
  }
}
for (const unsafeGitFlag of ["*--output*", "*--ext-diff*", "*--textconv*", "*--exec*", "*--paginate*", "*--no-pager*", "*--open-files-in-pager*", "*-c core.pager*"]) {
  if (reviewOrchestratorPermission?.bash?.[unsafeGitFlag] !== "deny") {
    fail("HARNESS-S043", `review-orchestrator must deny unsafe git flag pattern ${unsafeGitFlag}`, "Mirror root unsafe git option guards on the read-only review primary.");
  }
}
for (const delegatedAgent of ["explore", "reviewer", "researcher", "verifier"]) {
  if (reviewOrchestratorPermission?.task?.[delegatedAgent] !== "allow") {
    fail("HARNESS-S044", `review-orchestrator must be allowed to delegate to ${delegatedAgent}`, "Allow only read-only review support delegates.");
  }
}
for (const forbiddenDelegate of ["general", "architect", "diagnose", "improver"]) {
  if (reviewOrchestratorPermission?.task?.[forbiddenDelegate] !== undefined && reviewOrchestratorPermission.task[forbiddenDelegate] !== "deny") {
    fail("HARNESS-S045", `review-orchestrator must not delegate to ${forbiddenDelegate}`, "Keep implementation and write-planning delegates off the read-only review primary.");
  }
}
if (reviewOrchestratorPermission?.task?.["*"] !== "deny") {
  fail("HARNESS-S046", "review-orchestrator task wildcard must deny", "Default-deny task delegation for the read-only review primary.");
}
for (const taskName of Object.keys(reviewOrchestratorPermission?.task ?? {})) {
  if (!["*", "explore", "reviewer", "researcher", "verifier"].includes(taskName)) {
    fail("HARNESS-S046", `review-orchestrator task allowlist contains unsupported target ${taskName}`, "The review primary may only delegate to explore, reviewer, researcher, and verifier.");
  }
}
if (reviewOrchestratorPermission?.skill?.["*"] !== "allow") {
  fail("HARNESS-S062", "review-orchestrator must allow skill loading", "Review commands must still load relevant project-local skills while staying read-only.");
}

const reviewLedger = read("skills/global-review-ledger/SKILL.md");
for (const section of ["## Review baseline", "## Finding ledger", "## Fix pass", "## Re-review", "## Stop conditions"]) {
  assertIncludes(reviewLedger, section, "skills/global-review-ledger/SKILL.md");
}
for (const needle of ["finding source", "violated contract", "trigger condition", "expected test", "resolution evidence", "final adversarial audit", "Do not close a finding without resolution evidence"]) {
  assertIncludes(reviewLedger, needle, "skills/global-review-ledger/SKILL.md", "HARNESS-S047", "Keep the review ledger tied to quality-gate evidence.");
}

const releaseReviewSkill = read("skills/global-harness-release-review/SKILL.md");
for (const section of ["## Purpose", "## Rules", "## Review Scope", "## Questions", "## Output"]) {
  assertIncludes(releaseReviewSkill, section, "skills/global-harness-release-review/SKILL.md");
}

const qualityGatesSkill = read("skills/global-quality-gates/SKILL.md");
for (const section of [
  "## Purpose and triggers",
  "## Risk classification",
  "## Quality ledger",
  "## Pre-change baseline",
  "## Behavior contract",
  "## Edge-case and failure-mode matrix",
  "## Verification ladder",
  "## Specialized verification applicability",
  "## Completion statuses",
]) {
  assertIncludes(qualityGatesSkill, section, "skills/global-quality-gates/SKILL.md", "HARNESS-S048", "Keep the quality-gate skill as the detailed source of truth.");
}
for (const needle of [
  "`risk_class`",
  "`behavior_contract`",
  "`edge_case_matrix`",
  "`failure_mode_matrix`",
  "`test_obligations`",
  "Pre-change baseline",
  "applicable and tested",
  "incomplete-with-critical-verification-gap",
  "mutation testing",
]) {
  assertIncludes(qualityGatesSkill, needle, "skills/global-quality-gates/SKILL.md", "HARNESS-S049", "Quality gates must preserve required ledger and verification concepts.");
}

const recursiveDocs = read("docs/recursive-context-mode.md");
assertIncludes(recursiveDocs, "opencode-recursive-context", "docs/recursive-context-mode.md");
assertIncludes(recursiveDocs, "minimal safe harness surface", "docs/recursive-context-mode.md");
assertIncludes(recursiveDocs, "advanced tools are opt-in", "docs/recursive-context-mode.md");
assertIncludes(recursiveDocs, "not an absolute security boundary", "docs/recursive-context-mode.md");
assertIncludes(recursiveDocs, "optional live validation", "docs/recursive-context-mode.md");
assertNotIncludes(recursiveDocs, "plugins/recursive-context.ts", "docs/recursive-context-mode.md");

const liveEvaluationDocs = read("docs/live-evaluation.md");
for (const needle of [
  "OPENCODE_LIVE_EVAL_ADAPTER",
  "baseline profile",
  "harness profile",
  "`repo_fixture`",
  "hidden_checks",
  "hidden_check_files",
  "defect escape rate",
  "Do not fake a model run",
  "allowlisted public fields",
  "Adapters must return explicit success",
  "OPENCODE_BASELINE_PROFILE",
  "OPENCODE_HARNESS_PROFILE",
  "separate isolated repository copies",
  "AbortSignal",
  "allowlisted, redacted adapter summary",
  "raw command stdout/stderr",
  "Unsupported fields are rejected",
  "relative allowlisted project fixture",
  "must not point at the repository root",
  "trace/report directories",
  "must be absent before staging",
  "must not overwrite or merge",
  "transcripts, prompts, completions, secrets",
]) {
  assertIncludes(liveEvaluationDocs, needle, "docs/live-evaluation.md", "HARNESS-S057", "Document live A/B evaluation without making it a default CI dependency.");
}
assertNotIncludes(liveEvaluationDocs, "setup_source", "docs/live-evaluation.md", "HARNESS-S057", "Do not document live-eval setup sources until the runner implements them.");

const readme = read("README.md");
for (const needle of [
  "It is intentionally separate from plugin capabilities",
  "actions/workflows/verify.yml/badge.svg",
  "## Adoption",
  "npm run verify",
  "npm run verify:runtime",
  "optional live A/B evaluation",
  "docs/adoption.md",
  "docs/evaluation.md",
  "docs/live-evaluation.md",
  "docs/trace-contract.md",
  "docs/budgets-and-termination.md",
  "docs/subagent-result-schema.md",
  "docs/compatibility.md",
  "docs/release.md",
  "docs/harness-map.md",
  "docs/harnessability.md",
  "fixtures/adversarial/",
  "https://github.com/Tah10n/opencode-recursive-context",
  "https://github.com/Tah10n/opencode-learning-guard",
  "https://martinfowler.com/articles/harness-engineering.html",
  "https://github.com/DenisSergeevitch/agents-best-practices",
  "harness-release-review",
]) {
  assertIncludes(readme, needle, "README.md");
}

const traceContractDoc = read("docs/trace-contract.md");
for (const needle of [
  "machine-local artifacts",
  "not a tracing implementation",
  "`run_id`",
  "`agent`",
  "`permission_decision`",
  "`files_read`",
  "`files_written`",
  "`verification`",
  "`termination_reason`",
  "`task_start`",
  "`context_read`",
  "`delegation`",
  "`tool_call`",
  "`permission_request`",
  "`edit`",
  "`review_finding`",
  "`task_end`",
  "must not persist secrets",
  "raw private logs",
  ".env",
  "full source dumps",
  "```jsonl",
]) {
  assertIncludes(traceContractDoc, needle, "docs/trace-contract.md", "HARNESS-S065", "Keep the trace contract portable, safe, and aligned with termination policy.");
}

const budgetDoc = read("docs/budgets-and-termination.md");
for (const needle of [
  "`small/local/direct`",
  "`broad read-only audit`",
  "`review`",
  "`review-fix-re-review`",
  "`implementation`",
  "`diagnosis`",
  "`research`",
  "`self-improvement`",
  "`done`",
  "`verified`",
  "`partially_verified`",
  "`blocked_missing_context`",
  "`blocked_user_decision`",
  "`blocked_permission`",
  "`blocked_external_state`",
  "`unsafe_without_permission`",
  "`conflicting_write_scope`",
  "`budget_exhausted`",
  "`verification_failed`",
  "`not_reproducible`",
  "no remaining high-value independent work",
  "destructive or high-side-effect permission",
  "required external state, credential, or user decision is missing",
  "verification boundary has been reached",
  "re-review ledger is resolved",
  "worker output is weak after one narrowing",
  "`decision_unblocked`",
]) {
  assertIncludes(budgetDoc, needle, "docs/budgets-and-termination.md", "HARNESS-S066", "Keep budget and termination policy explicit and aligned with agent handoffs.");
}

const subagentSchemaDoc = read("docs/subagent-result-schema.md");
const commonResultFields = [
  "`status`",
  "`assigned_scope`",
  "`summary`",
  "`evidence`",
  "`files_changed`",
  "`verification`",
  "`decision_unblocked`",
  "`uncertainty`",
  "`risks`",
  "`next_step`",
  "`termination_reason`",
];
for (const needle of [
  ...commonResultFields,
  "`completed`",
  "`changed`",
  "`no-op`",
  "`no-findings`",
  "`blocked`",
  "`failed`",
  "`unsafe`",
  "use `[]` for read-only agents",
  "exact changed paths",
  "`@explore`",
  "`@architect`",
  "`@general`",
  "`@reviewer`",
  "`@diagnose`",
  "`@researcher`",
  "`@verifier`",
  "`@improver`",
]) {
  assertIncludes(subagentSchemaDoc, needle, "docs/subagent-result-schema.md", "HARNESS-S067", "Keep the shared subagent result schema complete and agent-specific.");
}

const harnessMapDoc = read("docs/harness-map.md");
for (const needle of [
  "Trace contract",
  "Budget and termination policy",
  "Subagent result schema",
  "Adversarial fixtures",
  "`docs/trace-contract.md`",
  "`docs/budgets-and-termination.md`",
  "`docs/subagent-result-schema.md`",
  "`fixtures/adversarial/`",
]) {
  assertIncludes(harnessMapDoc, needle, "docs/harness-map.md", "HARNESS-S068", "Represent new P0 controls in the harness control map.");
}

const subagentResultAgents = [
  "review-orchestrator",
  "explore",
  "architect",
  "general",
  "reviewer",
  "diagnose",
  "researcher",
  "verifier",
  "improver",
];
for (const agent of subagentResultAgents) {
  const agentText = read(`agents/${agent}.md`);
  for (const field of commonResultFields) {
    assertIncludes(agentText, field, `agents/${agent}.md`, "HARNESS-S069", "All result-producing agents must use or map onto the shared result schema.");
  }
}

for (const agent of ["review-orchestrator", "explore", "architect", "reviewer", "diagnose", "researcher", "verifier", "improver"]) {
  assertIncludes(read(`agents/${agent}.md`), "`files_changed`: []", `agents/${agent}.md`, "HARNESS-S070", "Read-only agents must explicitly report files_changed: [].");
}
assertIncludes(read("agents/general.md"), "`files_changed`: exact changed paths", "agents/general.md", "HARNESS-S071", "Implementation workers must report exact changed paths.");

const reviewerSchemaAgent = read("agents/reviewer.md");
assertNotIncludes(reviewerSchemaAgent, "respond with `no findings`", "agents/reviewer.md", "HARNESS-S074", "Reviewer no-finding results must use the shared output schema.");
assertNotIncludes(reviewerSchemaAgent, "respond with `no blocking findings`", "agents/reviewer.md", "HARNESS-S074", "Reviewer re-review results must use the shared output schema.");
for (const needle of ["`status: no-findings`", "`files_changed: []`", "`findings: []`", "`summary: no blocking findings`"]) {
  assertIncludes(reviewerSchemaAgent, needle, "agents/reviewer.md", "HARNESS-S075", "Reviewer no-finding output must map onto the shared schema.");
}

for (const agent of ["orchestrator", "orchestrator-deep"]) {
  const agentText = read(`agents/${agent}.md`);
  assertIncludes(agentText, "docs/subagent-result-schema.md", `agents/${agent}.md`, "HARNESS-S072", "Orchestrators must require the shared subagent result schema.");
  assertIncludes(agentText, "Aggregate subagent results by evidence, uncertainty, termination reason", `agents/${agent}.md`, "HARNESS-S072", "Orchestrators must aggregate subagent results by decision-critical common fields.");
  assertIncludes(agentText, "decision unblocked", `agents/${agent}.md`, "HARNESS-S072", "Orchestrators must aggregate subagent results by decision-critical common fields.");
  assertIncludes(agentText, "Do not paste raw subagent output as the final answer", `agents/${agent}.md`, "HARNESS-S072", "Orchestrators must synthesize subagent outputs.");
}

for (const file of [
  "fixtures/adversarial/README.md",
  "fixtures/adversarial/prompt-injection/README.md",
  "fixtures/adversarial/command-injection/README.md",
  "fixtures/adversarial/secret-bait/README.md",
  "fixtures/adversarial/review-only-trap/README.md",
]) {
  const fixtureText = read(file);
  assertIncludes(fixtureText, "Static fixture: do not execute.", file, "HARNESS-S073", "Adversarial fixtures must stay static and non-executable.");
}

const workflow = read(".github/workflows/verify.yml");
for (const needle of ["pull_request:", "workflow_dispatch:", "npm run verify", "actions/setup-node@v4", "Harness verification"]) {
  assertIncludes(workflow, needle, ".github/workflows/verify.yml");
}

const repositoriesDoc = read("docs/repositories.md");
assertIncludes(repositoriesDoc, "https://github.com/Tah10n/opencode-recursive-context", "docs/repositories.md");
assertIncludes(repositoriesDoc, "https://github.com/Tah10n/opencode-learning-guard", "docs/repositories.md");

const memoryDocs = read("docs/memory-and-self-improvement.md");
assertIncludes(memoryDocs, "opencode-learning-guard", "docs/memory-and-self-improvement.md");
for (const needle of [
  "Memory is not an always-on epilogue",
  "toolset",
  "enabledTools",
  "Memory cleanup is audit-first",
  "oc_learning_memory_audit",
  'toolset: "skills-write"',
  "tools/oc_learning.js",
]) {
  assertIncludes(memoryDocs, needle, "docs/memory-and-self-improvement.md");
}

const agentsPolicy = read("AGENTS.md");
assertIncludes(agentsPolicy, "skip it for simple, self-contained, or directly answerable tasks", "AGENTS.md");
assertIncludes(agentsPolicy, "Do not invoke self-improvement just because a task completed", "AGENTS.md");
assertIncludes(agentsPolicy, "Keep `oc_learning_*` write tools out of the root profile and ordinary agents", "AGENTS.md");
assertIncludes(agentsPolicy, "load `global-quality-gates` before edits", "AGENTS.md");
assertIncludes(agentsPolicy, "High/critical work cannot be reported as `complete`", "AGENTS.md");
assertIncludes(agentsPolicy, "verification evidence", "AGENTS.md");

const orchestratorAgent = read("agents/orchestrator.md");
assertIncludes(orchestratorAgent, "Do not call `@improver` just because a task completed", "agents/orchestrator.md");
assertIncludes(orchestratorAgent, "ordinary agents must not use `oc_learning_*` directly", "agents/orchestrator.md");
for (const needle of [
  "load `global-quality-gates`",
  "Create and maintain a compact quality ledger",
  "Capture baseline before edits",
  "plan-and-test-design mode",
  "Worker verification is evidence, not a substitute for integrated verification",
  "Compare post-change results to the pre-change baseline",
  "final adversarial audit",
  "mandatory gate is missing, failed, timed out, not permitted",
]) {
  assertIncludes(orchestratorAgent, needle, "agents/orchestrator.md", "HARNESS-S050", "Primary orchestrator must enforce quality gates.");
}

const orchestratorDeepAgent = read("agents/orchestrator-deep.md");
for (const needle of [
  "load `global-quality-gates`",
  "baseline before edits",
  "plan-and-test-design review",
  "one final adversarial audit",
  "Compare integrated verification against baseline",
]) {
  assertIncludes(orchestratorDeepAgent, needle, "agents/orchestrator-deep.md", "HARNESS-S051", "Deep orchestrator must keep the same high-assurance invariants.");
}

const reviewOrchestratorAgent = read("agents/review-orchestrator.md");
for (const needle of [
  "mode: primary",
  "edit: deny",
  "Deduplicate findings into the review ledger",
  "global-quality-gates",
  "findings",
  "verification_evidence",
]) {
  assertIncludes(reviewOrchestratorAgent, needle, "agents/review-orchestrator.md", "HARNESS-S052", "Review orchestrator must remain a read-only primary with ledger output.");
}

const architectAgent = read("agents/architect.md");
for (const needle of [
  "`risk_class`",
  "`behavior_contract`",
  "`compatibility_contract`",
  "`edge_case_matrix`",
  "`failure_mode_matrix`",
  "`baseline_plan`",
  "`test_obligations_by_slice`",
  "`specialized_verification`",
  "`integration_order`",
  "`verification_order`",
  "`rollback_and_recovery`",
  "`critical_unknowns`",
]) {
  assertIncludes(architectAgent, needle, "agents/architect.md", "HARNESS-S053", "Architect output must include high-assurance planning fields.");
}

const generalAgent = read("agents/general.md");
for (const needle of [
  "`tests_added_or_updated`",
  "`edge_cases_covered`",
  "`failure_modes_covered`",
  "`contract_compatibility`",
  "`verification_evidence`",
  "`unverified`",
  "`integration_risks`",
  "regression test",
  "characterization tests",
]) {
  assertIncludes(generalAgent, needle, "agents/general.md", "HARNESS-S054", "Implementation workers must report tests, edge cases, and verification evidence.");
}

const reviewerAgent = read("agents/reviewer.md");
for (const needle of ["Plan-and-test-design mode", "Final-adversarial-audit mode", "objective artifacts", "bounded re-review"]) {
  assertIncludes(reviewerAgent, needle, "agents/reviewer.md", "HARNESS-S055", "Reviewer must support plan challenge and bounded final audit modes.");
}

const verifierAgent = read("agents/verifier.md");
for (const needle of [
  "`baseline_comparison`",
  "`targeted_checks`",
  "`affected_module_checks`",
  "`integration_contract_checks`",
  "`full_suite`",
  "`typecheck`",
  "`lint`",
  "`build`",
  "`specialized_checks`",
  "`completion_recommendation`",
  "`residual_risk`",
  "command unavailable",
]) {
  assertIncludes(verifierAgent, needle, "agents/verifier.md", "HARNESS-S056", "Verifier output must compare baseline and enforce completion recommendations.");
}

const improverAgent = read("agents/improver.md");
assertIncludes(improverAgent, "Skip low-signal candidate lessons", "agents/improver.md");
assertIncludes(improverAgent, "Avoid `oc_learning_memory_list` or broad skill inspection when no concrete candidate lesson exists", "agents/improver.md");
assertIncludes(improverAgent, "run `oc_learning_memory_audit` first when available", "agents/improver.md");

const selfImprovementSkill = read("skills/global-self-improvement/SKILL.md");
for (const needle of [
  "Do not run the write path just because a task completed",
  "## Token and tool budget",
  "Avoid broad `oc_learning_memory_list` or managed-skill scans until a concrete candidate lesson exists",
  "prefer read-only `oc_learning_memory_audit` before any remove or replace operation",
]) {
  assertIncludes(selfImprovementSkill, needle, "skills/global-self-improvement/SKILL.md");
}

const agentToolPermissions = read("examples/agent-tool-permissions.md");
assertIncludes(agentToolPermissions, 'toolset: "memory-read"', "examples/agent-tool-permissions.md");
assertIncludes(agentToolPermissions, 'toolset: "skills-write"', "examples/agent-tool-permissions.md");
assertIncludes(agentToolPermissions, 'toolset: "improver"', "examples/agent-tool-permissions.md");
assertIncludes(agentToolPermissions, "OPENCODE_CONFIG_ROOT", "examples/agent-tool-permissions.md");
assertIncludes(agentToolPermissions, "configRoot", "examples/agent-tool-permissions.md");
assertIncludes(agentToolPermissions, "enabledTools", "examples/agent-tool-permissions.md");
assertIncludes(agentToolPermissions, "oc_learning_memory_audit", "examples/agent-tool-permissions.md");
if ((agentToolPermissions.match(/configRoot,/g) ?? []).length < 5) {
  fail("HARNESS-S036", "examples/agent-tool-permissions.md must pass configRoot in every opencode-learning-guard example", "Pass an explicit configRoot or document OPENCODE_CONFIG_ROOT for each copyable snippet.");
}

for (const commandFile of ["commands/learn.md", "commands/curate-learning.md"]) {
  const commandFrontmatter = frontmatterFor(commandFile);
  if (commandFrontmatter.agent !== "improver") {
    fail("HARNESS-S037", `${commandFile} must route through improver`, "Self-improvement command templates must use the bounded improver agent.");
  }
  if (commandFrontmatter.subtask !== true) {
    fail("HARNESS-S038", `${commandFile} must run as subtask`, "Self-improvement command templates should not replace the primary orchestrator.");
  }
  const commandText = read(commandFile);
  assertIncludes(commandText, "Load the `global-self-improvement` skill", commandFile);
  assertIncludes(commandText, "Use only `oc_learning_*` tools for persistent writes", commandFile);
}

const compatibilityDoc = read("docs/compatibility.md");
for (const needle of ["v0.2.0", "opencode-recursive-context", "opencode-learning-guard"]) {
  assertIncludes(compatibilityDoc, needle, "docs/compatibility.md");
}

const evaluationDoc = read("docs/evaluation.md");
for (const needle of ["verify:drift", "verify:runtime", "verify:runtime:fixture", "verify:live-eval", "contract/config evaluation", "Optional live A/B evaluation", "Harness Control Map", "fixture path-boundary", "trace-contract", "budgeted-termination", "subagent-result-schema", "adversarial-fixtures", "static behavior contracts"]) {
  assertIncludes(evaluationDoc, needle, "docs/evaluation.md");
}

const releaseDoc = read("docs/release.md");
for (const needle of ["harness-release-review", "guide/sensor coherence", "permission safety", "verify:live-eval", "OPENCODE_BASELINE_PROFILE", "OPENCODE_HARNESS_PROFILE", "defect"]) {
  assertIncludes(releaseDoc, needle, "docs/release.md");
}

const adoptionDoc = read("docs/adoption.md");
for (const needle of ["docs/harnessability.md", "npm run verify:runtime", "Harnessability", "Post-Adoption Confidence Levels", "fault injection"]) {
  assertIncludes(adoptionDoc, needle, "docs/adoption.md");
}

const harnessabilityDoc = read("docs/harnessability.md");
for (const needle of ["Verification ladder", "evaluation corpus readiness", "hidden checks"]) {
  assertIncludes(harnessabilityDoc, needle, "docs/harnessability.md");
}

const highAssuranceWorkflow = read("examples/high-assurance-project/WORKFLOW.md");
for (const needle of ["Targeted tests", "Shared Mutable State", "High/Critical Order", "does not grant permissions", "Example Safe Allowlist"]) {
  assertIncludes(highAssuranceWorkflow, needle, "examples/high-assurance-project/WORKFLOW.md");
}

const liveEvalScript = read("scripts/evaluate-live.mjs");
for (const needle of [
  "HARNESS-L006",
  "must define repo_fixture",
  "HARNESS-L012",
  "OPENCODE_LIVE_EVAL_ADAPTER",
  "OPENCODE_BASELINE_PROFILE",
  "OPENCODE_HARNESS_PROFILE",
  "publicScenarioForAdapter",
  "publicScenarioFields",
  "unsupportedScenarioFields",
  "liveProfileRuns",
  "runScenarioProfile",
  "profileRole",
  "runAdapterWithTimeout",
  "AdapterTimeoutError",
  "adapter timed out after",
  "isSensitiveReportKey",
  "commandReportSummary",
  "adapterErrorSummary",
  "stageHiddenCheckFiles",
  "hidden_check_files",
  "adapterReportSummary",
  "adapterReport",
  "visibleResults",
  "visiblePassRate",
  "hiddenPassRate",
  "defectEscapeRate",
  "recordCommandFailures",
  "HARNESS-L016",
  "adapterFailureReason",
  "HARNESS-L017",
  "HARNESS-L018",
  "HARNESS-L020",
  "HARNESS-L021",
  "HARNESS-L022",
  "HARNESS-L023",
  "HARNESS-L024",
  "HARNESS-L025",
  "HARNESS-L030",
  "HARNESS-L031",
  "unsafe repo_fixture scope",
  "repo_fixture: \".\"",
  "repo_fixture: \"evals\"",
  "repo_fixture: \"fixtures/adversarial\"",
  "fixtures/runtime-debug",
  "fixtures/sample-project",
  "allowedRepoFixtureRoots",
  "allowedRepoFixturePrefixes",
  "HARNESS-L032",
  "hidden_check_files target collision",
  "fs.existsSync(target)",
  "HARNESS-L033",
  "redactReportString",
  "[redacted]",
  "FAKE_TOKEN=example-token-do-not-use",
  "BEGIN PRIVATE KEY",
  "adapter did not return explicit success",
  "--validate",
  "--self-test",
  "HARNESS-L015",
  "path.relative(basePath, targetPath)",
]) {
  assertIncludes(liveEvalScript, needle, "scripts/evaluate-live.mjs");
}
assertNotIncludes(liveEvalScript, "setup_source", "scripts/evaluate-live.mjs", "HARNESS-S058", "Keep live-eval validation aligned with the implemented repo_fixture runner.");
assertNotIncludes(liveEvalScript, "fake live success", "scripts/evaluate-live.mjs", "HARNESS-S058", "Do not add fake live success support to the live-eval runner.");

const runtimeVerifier = read("scripts/verify-runtime.mjs");
for (const needle of ["task.*", "`task.${agent}`", "\"general\"", "HARNESS-R017", "HARNESS-R018"]) {
  assertIncludes(runtimeVerifier, needle, "scripts/verify-runtime.mjs", "HARNESS-S059", "Runtime verification must prove review-orchestrator task delegation boundaries.");
}

const runtimeFixtureVerifier = read("scripts/verify-runtime-fixtures.mjs");
for (const needle of ["HARNESS-R017", "HARNESS-R018", "task.*", "task.explore", "task.reviewer", "task.researcher", "task.verifier", "task.general", "task.architect", "task.diagnose", "task.improver"]) {
  assertIncludes(runtimeFixtureVerifier, needle, "scripts/verify-runtime-fixtures.mjs", "HARNESS-S060", "Runtime fixtures must cover review-orchestrator task delegation boundaries.");
}

const liveEvalReadme = read("evals/README.md");
assertIncludes(liveEvalReadme, "`repo_fixture`", "evals/README.md", "HARNESS-S061", "Live-eval README should document the implemented fixture source.");
assertIncludes(liveEvalReadme, "`hidden_check_files`", "evals/README.md", "HARNESS-S061", "Live-eval README should document runner-owned hidden check files.");
assertIncludes(liveEvalReadme, "rejects unsupported manifest fields", "evals/README.md", "HARNESS-S061", "Live-eval README should document unsupported-field rejection.");
assertIncludes(liveEvalReadme, "Adapters must return explicit success", "evals/README.md", "HARNESS-S061", "Live-eval README should document explicit adapter success.");
assertIncludes(liveEvalReadme, "separate isolated repo copies", "evals/README.md", "HARNESS-S061", "Live-eval README should document baseline/harness isolation.");
assertIncludes(liveEvalReadme, "command status/exit metadata and an allowlisted adapter", "evals/README.md", "HARNESS-S061", "Live-eval README should document report sanitization.");
assertIncludes(liveEvalReadme, "raw command stdout/stderr", "evals/README.md", "HARNESS-S061", "Live-eval README should document command output sanitization.");
assertIncludes(liveEvalReadme, "relative allowlisted project fixture", "evals/README.md", "HARNESS-S061", "Live-eval README should document narrow fixture scope.");
assertIncludes(liveEvalReadme, "must not point at the repository root", "evals/README.md", "HARNESS-S061", "Live-eval README should document unsafe fixture scopes.");
assertIncludes(liveEvalReadme, "trace/report directories", "evals/README.md", "HARNESS-S061", "Live-eval README should document runner-owned directory exclusions.");
assertIncludes(liveEvalReadme, "staged only into absent target paths", "evals/README.md", "HARNESS-S061", "Live-eval README should document hidden check target collision prevention.");
assertIncludes(liveEvalReadme, "redacted summary", "evals/README.md", "HARNESS-S061", "Live-eval README should document adapter report redaction.");
assertIncludes(liveEvalReadme, "transcripts, prompts", "evals/README.md", "HARNESS-S061", "Live-eval README should document transcript and prompt exclusion.");
assertNotIncludes(liveEvalReadme, "setup source", "evals/README.md", "HARNESS-S061", "Do not document setup source until the runner supports it.");

const liveEvalSchema = read("evals/scenario.schema.json");
assertIncludes(liveEvalSchema, "\"additionalProperties\": false", "evals/scenario.schema.json", "HARNESS-S063", "Live-eval schema should reject unsupported manifest fields.");
assertIncludes(liveEvalSchema, "\"hidden_check_files\"", "evals/scenario.schema.json", "HARNESS-S063", "Live-eval schema should support runner-owned hidden check files.");

const liveEvalSelfTestScenario = read("evals/scenarios/runner-self-test.json");
assertIncludes(liveEvalSelfTestScenario, "\"hidden_check_files\"", "evals/scenarios/runner-self-test.json", "HARNESS-S064", "Live-eval self-test scenario should exercise hidden file staging.");
assertIncludes(liveEvalSelfTestScenario, "evals/hidden/runner-self-test/hidden.test.js", "evals/scenarios/runner-self-test.json", "HARNESS-S064", "Hidden check fixture should live outside the public repo fixture.");

const changelog = read("CHANGELOG.md");
assertIncludes(changelog, "## 0.2.0 - 2026-06-15", "CHANGELOG.md");
assertIncludes(changelog, "## 0.1.0 - 2026-06-15", "CHANGELOG.md");

const codeowners = read("CODEOWNERS");
assertIncludes(codeowners, "@Tah10n", "CODEOWNERS");

const security = read("SECURITY.md");
assertIncludes(security, "Reporting a Vulnerability", "SECURITY.md");

const contributing = read("CONTRIBUTING.md");
assertIncludes(contributing, "npm run verify", "CONTRIBUTING.md");

const privateMarkers = (process.env.HARNESS_FORBIDDEN_MARKERS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

for (const file of listFiles(".")) {
  if (file.startsWith(".git/")) {
    continue;
  }
  const fullPath = path.join(root, file);
  if (!fs.statSync(fullPath).isFile()) {
    continue;
  }
  const text = fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, "");
  for (const marker of privateMarkers) {
    if (text.includes(marker)) {
      fail("HARNESS-S033", `${file} contains project-specific marker ${marker}`, "Remove private or project-specific facts from the public harness template.");
    }
  }
}

const forbiddenSecretPaths = [
  /^\.env(\.|$)/,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)\.git-credentials$/i,
  /(^|\/)settings\.xml$/i,
  /(^|\/)gradle\.properties$/i,
  /(^|\/)local\.properties$/i,
];

for (const file of listFiles(".")) {
  if (forbiddenSecretPaths.some((pattern) => pattern.test(file))) {
    fail("HARNESS-S034", `secret-like file must not be committed: ${file}`, "Remove secret-like files from the reusable template.");
  }
}

if (failures.length > 0) {
  console.error("Harness verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure.code}: ${failure.message}`);
    if (failure.fix) {
      console.error(`  fix: ${failure.fix}`);
    }
  }
  process.exit(1);
}

console.log("Harness verification passed.");
