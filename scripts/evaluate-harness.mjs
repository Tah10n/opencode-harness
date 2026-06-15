import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail("HARNESS-E001", `${relativePath} is missing`, "Restore the contract file or update the scenario.");
    return "";
  }
  return fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, "");
}

function fail(code, message, fix) {
  failures.push({ code, message, fix });
}

function includes(file, needle, fix) {
  const text = read(file);
  if (!text.includes(needle)) {
    fail("HARNESS-E002", `${file} missing expected invariant: ${needle}`, fix);
  }
}

function excludes(file, needle, fix) {
  const text = read(file);
  if (text.includes(needle)) {
    fail("HARNESS-E003", `${file} includes forbidden invariant: ${needle}`, fix);
  }
}

function exists(file, fix) {
  if (!fs.existsSync(path.join(root, file))) {
    fail("HARNESS-E004", `missing fixture or evaluation file: ${file}`, fix);
  }
}

const scenarios = [
  {
    id: "broad-audit-recursive-context",
    category: "architecture-fitness",
    checks: () => {
      includes("AGENTS.md", "automatically use recursive-context mode", "Broad audits should trigger recursive-context mode from the global rule.");
      includes("agents/orchestrator.md", "Automatic recursive-context mode:", "The primary orchestrator should contain the runtime trigger.");
      for (const tool of ["context_outline", "context_files", "context_search", "context_read"]) {
        includes("agents/orchestrator.md", `${tool}: allow`, "The orchestrator must be allowed to use safe context tools directly.");
      }
      includes("docs/recursive-context-mode.md", "Use recursive-context mode automatically", "Keep the design note aligned with the agent rule.");
    },
  },
  {
    id: "review-read-only-ledger",
    category: "maintainability",
    checks: () => {
      includes("AGENTS.md", "When the user asks for review, keep the task read-only", "Review must not silently turn into a fix pass.");
      includes("skills/global-review-ledger/SKILL.md", "Review requests are read-only", "The review skill should preserve read-only semantics.");
      includes("agents/reviewer.md", "edit: deny", "Reviewer must remain read-only at the permission layer.");
      includes("agents/reviewer.md", "Re-review mode:", "The reviewer must support ledger-bounded re-review.");
      includes("opencode.json", "Read-only review of current diff", "The review command should be clear about read-only behavior.");
    },
  },
  {
    id: "small-local-task-single-agent",
    category: "maintainability",
    checks: () => {
      includes("AGENTS.md", "Prefer the single-agent loop for small, local, single-file, or directly answerable tasks.", "Small work should not pay orchestration overhead.");
      includes("agents/orchestrator.md", "Prefer a single linear loop for small, local, single-file, or directly answerable tasks.", "The primary orchestrator should retain the same local-work bias.");
      excludes("AGENTS.md", "Always delegate", "Delegation should stay conditional, not automatic.");
    },
  },
  {
    id: "architecture-gate-before-parallel-implementation",
    category: "architecture-fitness",
    checks: () => {
      includes("AGENTS.md", "Use `@architect` before broad or parallel implementation", "Parallel write work needs an architecture gate.");
      includes("agents/orchestrator.md", "Parallelize implementation only after `@architect` has produced explicit disjoint write ownership.", "The orchestrator must require explicit write ownership.");
      includes("agents/orchestrator.md", "If slices share files, shared contracts, generated outputs, lockfiles, migrations, package metadata, snapshots, or formatter output, serialize them.", "Shared mutable outputs should force serialization.");
    },
  },
  {
    id: "dangerous-commands-ask",
    category: "safety",
    checks: () => {
      includes("AGENTS.md", "Ask for explicit user permission *before* running any command that is destructive/irreversible", "The global safety rule should be explicit.");
      includes("opencode.json", "\"git reset*\": \"ask\"", "Dangerous git history commands should require approval.");
      includes("opencode.json", "\"Remove-Item *\": \"ask\"", "Destructive filesystem commands should require approval.");
      includes("opencode.json", "\"git push --force*\": \"ask\"", "Force pushes should require approval.");
    },
  },
  {
    id: "bounded-self-improvement",
    category: "maintainability",
    checks: () => {
      includes("opencode.json", "\"oc_learning_*\": \"deny\"", "Root access to learning writes should stay denied.");
      includes("agents/improver.md", "\"oc_learning_*\": ask", "Only the bounded improver should request learning writes.");
      includes("agents/improver.md", "Do not edit `AGENTS.md`, `opencode.json`, agent definitions", "Self-improvement should not rewrite the harness core.");
      includes("docs/memory-and-self-improvement.md", "opencode-learning-guard", "Memory docs should point at the current capability repository.");
    },
  },
  {
    id: "project-local-guidance",
    category: "behaviour",
    checks: () => {
      exists("fixtures/sample-project/WORKFLOW.md", "Keep an approved project workflow fixture.");
      exists("examples/project-workflow/WORKFLOW.md", "Keep a copyable project workflow example.");
      exists("examples/project-workflow/project-skill/SKILL.md", "Keep a project skill example.");
      includes("agents/orchestrator.md", "WORKFLOW.md", "The orchestrator should discover repo-owned workflow guidance.");
      includes("agents/orchestrator.md", ".opencode/skills/project/SKILL.md", "The orchestrator should discover project-local skills.");
      includes("skills/global-memory/SKILL.md", "Prefer project-local `WORKFLOW.md` or project skills", "Global memory should not absorb project-specific facts.");
    },
  },
  {
    id: "verifier-stays-read-only",
    category: "maintainability",
    checks: () => {
      includes("agents/verifier.md", "edit: deny", "Verifier must not patch files while checking.");
      includes("agents/verifier.md", "Read-only verifier", "Verifier identity should be explicit.");
      includes("agents/verifier.md", "Do not edit files.", "Verifier instructions should match permissions.");
    },
  },
  {
    id: "runtime-and-drift-sensors",
    category: "architecture-fitness",
    checks: () => {
      exists("scripts/verify-runtime.mjs", "Runtime verification should be available for installed profiles.");
      exists("scripts/verify-runtime-fixtures.mjs", "Runtime fixture verification should cover parser regressions.");
      exists("scripts/verify-drift.mjs", "Drift verification should be available for docs/release health.");
      exists("fixtures/runtime-debug/debug-config.txt", "Runtime parser should have deterministic fixture coverage.");
      includes("docs/harness-map.md", "Runtime verifier", "The control map should include runtime verification.");
      includes("docs/harnessability.md", "Strong Harnessability", "Adopters should have a checklist for harness readiness.");
      includes("package.json", "\"verify:runtime\": \"node scripts/verify-runtime.mjs\"", "Runtime verifier should be runnable through npm.");
      includes("package.json", "\"verify:runtime:fixture\": \"node scripts/verify-runtime-fixtures.mjs\"", "Runtime fixture verifier should be runnable through npm.");
      includes("scripts/verify-runtime-fixtures.mjs", "HARNESS-R009", "Runtime fixture verifier should prove unsafe edit permissions fail.");
      includes("scripts/verify-runtime-fixtures.mjs", "HARNESS-R013", "Runtime fixture verifier should prove unsafe oc_learning permissions fail.");
    },
  },
  {
    id: "release-inferential-review",
    category: "architecture-fitness",
    checks: () => {
      exists("skills/global-harness-release-review/SKILL.md", "Release-level inferential review should have an explicit skill.");
      includes("opencode.json", "harness-release-review", "Release-level inferential review should be a runnable command.");
      includes("docs/release.md", "/harness-release-review", "Release process should call out semantic harness review.");
      includes("docs/harness-map.md", "Harness release review", "The control map should classify release review as a sensor.");
      includes("skills/global-harness-release-review/SKILL.md", "guide/sensor coherence", "Release review should focus on coherence, not generic prose.");
    },
  },
];

for (const scenario of scenarios) {
  scenario.checks();
}

if (failures.length > 0) {
  console.error("Harness evaluation failed:");
  for (const failure of failures) {
    console.error(`- ${failure.code}: ${failure.message}`);
    if (failure.fix) {
      console.error(`  fix: ${failure.fix}`);
    }
  }
  process.exit(1);
}

const categories = [...new Set(scenarios.map((scenario) => scenario.category))].sort();
console.log(`Harness evaluation passed (${scenarios.length} scenarios across ${categories.length} categories).`);
