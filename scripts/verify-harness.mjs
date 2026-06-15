import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`required file missing: ${relativePath}`);
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

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) {
    fail(`${label} missing ${needle}`);
  }
}

function assertNotIncludes(text, needle, label) {
  if (text.includes(needle)) {
    fail(`${label} still references ${needle}`);
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
  "skills/global-memory/SKILL.md",
  "skills/global-self-improvement/SKILL.md",
  "docs/recursive-context-mode.md",
  "docs/memory-and-self-improvement.md",
  "docs/adoption.md",
  "docs/compatibility.md",
  "docs/evaluation.md",
  "docs/release.md",
  "examples/minimal-opencode.json",
  "examples/agent-tool-permissions.md",
  "examples/project-workflow/WORKFLOW.md",
  "examples/project-workflow/project-skill/SKILL.md",
  "fixtures/sample-project/WORKFLOW.md",
  "scripts/evaluate-harness.mjs",
];

for (const file of requiredFiles) {
  if (!exists(file)) {
    fail(`required file missing: ${file}`);
  }
}

const packageJson = JSON.parse(read("package.json"));
if (packageJson.version !== "0.2.0") {
  fail("package.json version must match the latest release plan");
}
if (packageJson.scripts?.verify !== "npm run verify:static && npm run eval") {
  fail("package.json must run static verification and eval from npm run verify");
}
if (packageJson.scripts?.eval !== "node scripts/evaluate-harness.mjs") {
  fail("package.json must expose npm run eval");
}
if (packageJson.scripts?.["verify:static"] !== "node scripts/verify-harness.mjs") {
  fail("package.json must expose npm run verify:static");
}
if (packageJson.repository?.url !== "git+https://github.com/Tah10n/opencode-harness.git") {
  fail("package.json must point repository.url at Tah10n/opencode-harness");
}
if (packageJson.homepage !== "https://github.com/Tah10n/opencode-harness#readme") {
  fail("package.json must expose the GitHub README as homepage");
}
if (packageJson.dependencies?.["@opencode-ai/plugin"]) {
  fail("opencode-harness must not depend on plugin packages; capabilities live in sibling packages");
}

const config = JSON.parse(read("opencode.json"));
if (config.default_agent !== "orchestrator") {
  fail("opencode.json default_agent must be orchestrator");
}
for (const commandName of ["review-diff", "diagnose", "workflow"]) {
  if (!config.command?.[commandName]) {
    fail(`opencode.json missing command: ${commandName}`);
  }
}
if (!config.watcher?.ignore?.includes(".oc_learning/**")) {
  fail("opencode.json watcher must ignore .oc_learning/**");
}
if (config.permission?.external_directory !== "ask") {
  fail("opencode.json must ask before external directory access");
}
if (config.permission?.["oc_learning_*"] !== "deny") {
  fail("root permissions must deny oc_learning_* by default");
}

const readOnlyAgents = ["explore", "architect", "reviewer", "diagnose", "verifier", "researcher", "improver"];
const contextAgents = ["explore", "architect", "reviewer", "diagnose", "verifier"];
const contextTools = ["context_outline", "context_files", "context_read", "context_search"];

for (const agent of [
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
]) {
  const file = `agents/${agent}.md`;
  const text = read(file);
  if (!text.startsWith("---\n")) {
    fail(`${file} must start with frontmatter`);
  }
  assertIncludes(text, "description:", file);
  assertIncludes(text, "mode:", file);
  assertIncludes(text, "permission:", file);
  if (readOnlyAgents.includes(agent)) {
    assertIncludes(text, "edit: deny", file);
  }
  if (contextAgents.includes(agent)) {
    for (const tool of contextTools) {
      assertIncludes(text, `${tool}: allow`, file);
    }
  }
}

const researcher = read("agents/researcher.md");
assertIncludes(researcher, "webfetch: allow", "agents/researcher.md");
assertIncludes(researcher, "websearch: allow", "agents/researcher.md");

const improver = read("agents/improver.md");
assertIncludes(improver, '"oc_learning_*": ask', "agents/improver.md");
assertIncludes(improver, "Do not edit `AGENTS.md`, `opencode.json`, agent definitions", "agents/improver.md");

const reviewLedger = read("skills/global-review-ledger/SKILL.md");
for (const section of ["## Review baseline", "## Finding ledger", "## Fix pass", "## Re-review", "## Stop conditions"]) {
  assertIncludes(reviewLedger, section, "skills/global-review-ledger/SKILL.md");
}

const recursiveDocs = read("docs/recursive-context-mode.md");
assertIncludes(recursiveDocs, "opencode-recursive-context", "docs/recursive-context-mode.md");
assertNotIncludes(recursiveDocs, "plugins/recursive-context.ts", "docs/recursive-context-mode.md");

const readme = read("README.md");
assertIncludes(readme, "It is intentionally separate from plugin capabilities", "README.md");
assertIncludes(readme, "actions/workflows/verify.yml/badge.svg", "README.md");
assertIncludes(readme, "## Adoption", "README.md");
assertIncludes(readme, "npm run verify", "README.md");
assertIncludes(readme, "docs/adoption.md", "README.md");
assertIncludes(readme, "docs/evaluation.md", "README.md");
assertIncludes(readme, "docs/compatibility.md", "README.md");
assertIncludes(readme, "docs/release.md", "README.md");
assertIncludes(readme, "https://github.com/Tah10n/opencode-recursive-context", "README.md");
assertIncludes(readme, "https://github.com/Tah10n/opencode-learning", "README.md");
assertIncludes(readme, "https://martinfowler.com/articles/harness-engineering.html", "README.md");
assertIncludes(readme, "https://github.com/DenisSergeevitch/agents-best-practices", "README.md");

const workflow = read(".github/workflows/verify.yml");
assertIncludes(workflow, "pull_request:", ".github/workflows/verify.yml");
assertIncludes(workflow, "workflow_dispatch:", ".github/workflows/verify.yml");
assertIncludes(workflow, "npm run verify", ".github/workflows/verify.yml");
assertIncludes(workflow, "actions/setup-node@v4", ".github/workflows/verify.yml");

const repositoriesDoc = read("docs/repositories.md");
assertIncludes(repositoriesDoc, "https://github.com/Tah10n/opencode-recursive-context", "docs/repositories.md");
assertIncludes(repositoriesDoc, "https://github.com/Tah10n/opencode-learning", "docs/repositories.md");

const memoryDocs = read("docs/memory-and-self-improvement.md");
assertIncludes(memoryDocs, "opencode-learning", "docs/memory-and-self-improvement.md");
assertNotIncludes(memoryDocs, "learning-guard", "docs/memory-and-self-improvement.md");

const compatibilityDoc = read("docs/compatibility.md");
assertIncludes(compatibilityDoc, "v0.2.0", "docs/compatibility.md");
assertIncludes(compatibilityDoc, "opencode-recursive-context", "docs/compatibility.md");
assertIncludes(compatibilityDoc, "opencode-learning", "docs/compatibility.md");
assertIncludes(compatibilityDoc, "opencode-learning-guard", "docs/compatibility.md");

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
      fail(`${file} contains project-specific marker ${marker}`);
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
    fail(`secret-like file must not be committed: ${file}`);
  }
}

if (failures.length > 0) {
  console.error("Harness verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Harness verification passed.");
