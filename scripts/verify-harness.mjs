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
  "agents/orchestrator.md",
  "agents/orchestrator-deep.md",
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
  "skills/global-memory/SKILL.md",
  "skills/global-self-improvement/SKILL.md",
  "docs/recursive-context-mode.md",
  "docs/memory-and-self-improvement.md",
  "docs/adoption.md",
  "docs/compatibility.md",
  "docs/evaluation.md",
  "docs/harness-map.md",
  "docs/harnessability.md",
  "docs/release.md",
  "examples/minimal-opencode.json",
  "examples/agent-tool-permissions.md",
  "examples/project-workflow/WORKFLOW.md",
  "examples/project-workflow/project-skill/SKILL.md",
  "fixtures/sample-project/WORKFLOW.md",
  "fixtures/runtime-debug/debug-config.txt",
  "fixtures/runtime-debug/debug-agent-orchestrator.txt",
  "fixtures/runtime-debug/debug-agent-orchestrator-deep.txt",
  "fixtures/runtime-debug/debug-agent-explore.txt",
  "fixtures/runtime-debug/debug-agent-architect.txt",
  "fixtures/runtime-debug/debug-agent-reviewer.txt",
  "fixtures/runtime-debug/debug-agent-diagnose.txt",
  "fixtures/runtime-debug/debug-agent-verifier.txt",
  "fixtures/runtime-debug/debug-agent-researcher.txt",
  "fixtures/runtime-debug/debug-agent-improver.txt",
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
if (packageJson.scripts?.verify !== "npm run verify:static && npm run eval && npm run verify:drift && npm run verify:runtime:fixture") {
  fail("HARNESS-S008", "package.json must run static verification, eval, drift, and runtime fixture checks from npm run verify", "Keep fast deterministic sensors in the default verify command.");
}
if (packageJson.scripts?.eval !== "node scripts/evaluate-harness.mjs") {
  fail("HARNESS-S009", "package.json must expose npm run eval", "Restore the evaluation script entry.");
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
  "explore",
  "architect",
  "general",
  "reviewer",
  "diagnose",
  "researcher",
  "verifier",
  "improver",
];
const readOnlyAgents = ["explore", "architect", "reviewer", "diagnose", "verifier", "researcher", "improver"];
const contextAgents = ["orchestrator", "orchestrator-deep", "explore", "architect", "reviewer", "diagnose", "verifier"];
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
}

for (const agent of ["orchestrator", "orchestrator-deep"]) {
  const taskPermissions = frontmatters.get(agent)?.permission?.task ?? {};
  for (const delegatedAgent of ["explore", "architect", "general", "reviewer", "diagnose", "researcher", "improver", "verifier"]) {
    if (taskPermissions[delegatedAgent] !== "allow") {
      fail("HARNESS-S032", `${agent} cannot delegate to ${delegatedAgent}`, "Primary orchestrators should be able to route focused work.");
    }
  }
}

const reviewLedger = read("skills/global-review-ledger/SKILL.md");
for (const section of ["## Review baseline", "## Finding ledger", "## Fix pass", "## Re-review", "## Stop conditions"]) {
  assertIncludes(reviewLedger, section, "skills/global-review-ledger/SKILL.md");
}

const releaseReviewSkill = read("skills/global-harness-release-review/SKILL.md");
for (const section of ["## Purpose", "## Rules", "## Review Scope", "## Questions", "## Output"]) {
  assertIncludes(releaseReviewSkill, section, "skills/global-harness-release-review/SKILL.md");
}

const recursiveDocs = read("docs/recursive-context-mode.md");
assertIncludes(recursiveDocs, "opencode-recursive-context", "docs/recursive-context-mode.md");
assertNotIncludes(recursiveDocs, "plugins/recursive-context.ts", "docs/recursive-context-mode.md");

const readme = read("README.md");
for (const needle of [
  "It is intentionally separate from plugin capabilities",
  "actions/workflows/verify.yml/badge.svg",
  "## Adoption",
  "npm run verify",
  "docs/adoption.md",
  "docs/evaluation.md",
  "docs/compatibility.md",
  "docs/release.md",
  "docs/harness-map.md",
  "docs/harnessability.md",
  "https://github.com/Tah10n/opencode-recursive-context",
  "https://github.com/Tah10n/opencode-learning-guard",
  "https://martinfowler.com/articles/harness-engineering.html",
  "https://github.com/DenisSergeevitch/agents-best-practices",
  "harness-release-review",
]) {
  assertIncludes(readme, needle, "README.md");
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
  "tools/oc_learning.js",
]) {
  assertIncludes(memoryDocs, needle, "docs/memory-and-self-improvement.md");
}

const agentsPolicy = read("AGENTS.md");
assertIncludes(agentsPolicy, "skip it for simple, self-contained, or directly answerable tasks", "AGENTS.md");
assertIncludes(agentsPolicy, "Do not invoke self-improvement just because a task completed", "AGENTS.md");
assertIncludes(agentsPolicy, "Keep `oc_learning_*` write tools out of the root profile and ordinary agents", "AGENTS.md");

const orchestratorAgent = read("agents/orchestrator.md");
assertIncludes(orchestratorAgent, "Do not call `@improver` just because a task completed", "agents/orchestrator.md");
assertIncludes(orchestratorAgent, "ordinary agents must not use `oc_learning_*` directly", "agents/orchestrator.md");

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
assertIncludes(agentToolPermissions, 'toolset: "improver"', "examples/agent-tool-permissions.md");
assertIncludes(agentToolPermissions, "enabledTools", "examples/agent-tool-permissions.md");
assertIncludes(agentToolPermissions, "oc_learning_memory_audit", "examples/agent-tool-permissions.md");

const compatibilityDoc = read("docs/compatibility.md");
for (const needle of ["v0.2.0", "opencode-recursive-context", "opencode-learning-guard"]) {
  assertIncludes(compatibilityDoc, needle, "docs/compatibility.md");
}

const evaluationDoc = read("docs/evaluation.md");
for (const needle of ["verify:drift", "verify:runtime", "verify:runtime:fixture", "Behaviour contract", "Harness Control Map"]) {
  assertIncludes(evaluationDoc, needle, "docs/evaluation.md");
}

const releaseDoc = read("docs/release.md");
for (const needle of ["harness-release-review", "guide/sensor coherence", "permission safety"]) {
  assertIncludes(releaseDoc, needle, "docs/release.md");
}

const adoptionDoc = read("docs/adoption.md");
for (const needle of ["docs/harnessability.md", "npm run verify:runtime", "Harnessability"]) {
  assertIncludes(adoptionDoc, needle, "docs/adoption.md");
}

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
