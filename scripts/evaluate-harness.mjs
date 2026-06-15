import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/^\uFEFF/, "");
}

function fail(message) {
  failures.push(message);
}

function includes(file, needle) {
  const text = read(file);
  if (!text.includes(needle)) {
    fail(`${file} missing expected invariant: ${needle}`);
  }
}

function excludes(file, needle) {
  const text = read(file);
  if (text.includes(needle)) {
    fail(`${file} includes forbidden invariant: ${needle}`);
  }
}

function exists(file) {
  if (!fs.existsSync(path.join(root, file))) {
    fail(`missing fixture or evaluation file: ${file}`);
  }
}

const scenarios = [
  {
    id: "broad-audit-recursive-context",
    checks: () => {
      includes("agents/orchestrator.md", "Automatic recursive-context mode:");
      includes("agents/orchestrator.md", "context_outline");
      includes("agents/orchestrator.md", "context_files");
      includes("agents/orchestrator.md", "context_search");
      includes("agents/orchestrator.md", "context_read");
      includes("docs/recursive-context-mode.md", "Use recursive-context mode automatically");
    },
  },
  {
    id: "review-read-only-ledger",
    checks: () => {
      includes("AGENTS.md", "When the user asks for review, keep the task read-only");
      includes("skills/global-review-ledger/SKILL.md", "Review requests are read-only");
      includes("agents/reviewer.md", "edit: deny");
      includes("agents/reviewer.md", "Re-review mode:");
      includes("opencode.json", "Read-only review of current diff");
    },
  },
  {
    id: "bounded-self-improvement",
    checks: () => {
      includes("opencode.json", "\"oc_learning_*\": \"deny\"");
      includes("agents/improver.md", "\"oc_learning_*\": ask");
      includes("agents/improver.md", "Do not edit `AGENTS.md`, `opencode.json`, agent definitions");
      includes("docs/memory-and-self-improvement.md", "opencode-learning");
      excludes("docs/memory-and-self-improvement.md", "learning-guard");
    },
  },
  {
    id: "project-local-guidance",
    checks: () => {
      exists("fixtures/sample-project/WORKFLOW.md");
      exists("examples/project-workflow/WORKFLOW.md");
      exists("examples/project-workflow/project-skill/SKILL.md");
      includes("agents/orchestrator.md", "WORKFLOW.md");
      includes("agents/orchestrator.md", ".opencode/skills/project/SKILL.md");
      includes("skills/global-memory/SKILL.md", "Prefer project-local `WORKFLOW.md` or project skills");
    },
  },
  {
    id: "verifier-stays-read-only",
    checks: () => {
      includes("agents/verifier.md", "edit: deny");
      includes("agents/verifier.md", "Read-only verifier");
      includes("agents/verifier.md", "Do not edit files.");
    },
  },
];

for (const scenario of scenarios) {
  scenario.checks();
}

if (failures.length > 0) {
  console.error("Harness evaluation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Harness evaluation passed (${scenarios.length} scenarios).`);
