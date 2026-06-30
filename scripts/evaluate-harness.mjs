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
    id: "high-risk-task-requires-quality-gates",
    category: "architecture-fitness",
    checks: () => {
      exists("skills/global-quality-gates/SKILL.md", "High-assurance work should have a detailed quality-gate skill.");
      includes("AGENTS.md", "load `global-quality-gates` before edits", "Global rules should trigger quality gates for high-risk work.");
      includes("agents/orchestrator.md", "load `global-quality-gates`", "Primary orchestrator should load quality gates for high-risk work.");
      includes("docs/harness-map.md", "Quality gates", "The control map should classify quality gates.");
    },
  },
  {
    id: "high-risk-implementation-requires-pre-change-baseline",
    category: "behaviour",
    checks: () => {
      includes("skills/global-quality-gates/SKILL.md", "For `high` and `critical` tasks, baseline is mandatory before edits.", "High-risk work should require baseline before implementation.");
      includes("agents/orchestrator.md", "Capture baseline before edits", "Primary orchestrator should capture baseline before edits.");
      includes("agents/verifier.md", "`baseline_comparison`", "Verifier output should compare against baseline.");
    },
  },
  {
    id: "worker-receives-explicit-test-obligations",
    category: "behaviour",
    checks: () => {
      includes("agents/orchestrator.md", "explicit test obligations", "Orchestrator should pass test obligations to workers.");
      includes("agents/general.md", "test obligations", "Implementation workers should require test obligations.");
      includes("agents/general.md", "`tests_added_or_updated`", "Worker output should report tests added or updated.");
      includes("agents/architect.md", "`test_obligations_by_slice`", "Architect should define test obligations by slice.");
    },
  },
  {
    id: "behavior-preserving-refactor-requires-characterization",
    category: "behaviour",
    checks: () => {
      includes("skills/global-quality-gates/SKILL.md", "characterization tests", "Behavior-preserving refactors should require characterization coverage.");
      includes("agents/architect.md", "characterization tests", "Architect should identify pre-refactor characterization tests.");
      includes("agents/general.md", "characterization tests", "Workers should add or cite characterization tests before refactors.");
    },
  },
  {
    id: "critical-cannot-complete-with-missing-mandatory-verification",
    category: "safety",
    checks: () => {
      includes("skills/global-quality-gates/SKILL.md", "incomplete-with-critical-verification-gap", "Critical work should have a non-complete status for verification gaps.");
      includes("AGENTS.md", "High/critical work cannot be reported as `complete`", "Global rules should block false completion.");
      includes("agents/verifier.md", "Do not recommend `complete` if a mandatory gate is missing", "Verifier should not recommend completion with missing mandatory gates.");
    },
  },
  {
    id: "plan-challenge-before-high-critical-implementation",
    category: "architecture-fitness",
    checks: () => {
      includes("agents/orchestrator.md", "plan-and-test-design mode", "High-risk plans should be challenged before implementation.");
      includes("agents/reviewer.md", "Plan-and-test-design mode:", "Reviewer should support plan challenge mode.");
      includes("agents/reviewer.md", "missing invariants", "Plan challenge should look for missing invariants.");
    },
  },
  {
    id: "final-adversarial-audit-is-bounded",
    category: "safety",
    checks: () => {
      includes("agents/orchestrator.md", "one final adversarial audit", "Final adversarial audit should run once.");
      includes("agents/reviewer.md", "Final-adversarial-audit mode:", "Reviewer should support final audit mode.");
      includes("agents/reviewer.md", "bounded re-review", "Final audit findings should lead to bounded re-review only.");
      includes("skills/global-review-ledger/SKILL.md", "Do not restart fresh open-ended reviews indefinitely", "Ledger should prevent infinite fresh audit loops.");
    },
  },
  {
    id: "live-eval-adapter-success-is-explicit",
    category: "behaviour",
    checks: () => {
      includes("scripts/evaluate-live.mjs", "adapter did not return explicit success", "Live-eval adapters should not pass without an explicit success signal.");
      includes("scripts/evaluate-live.mjs", "runAdapterWithTimeout", "Live-eval runner should enforce adapter timeouts itself.");
      includes("scripts/evaluate-live.mjs", "adapter timed out after", "Live-eval self-tests should cover adapter timeout semantics.");
      includes("scripts/evaluate-live.mjs", "HARNESS-L020", "Live-eval self-tests should cover adapter success semantics.");
      includes("scripts/evaluate-live.mjs", "HARNESS-L022", "Live-eval self-tests should cover adapter timeout semantics.");
      includes("evals/README.md", "Adapters must return explicit success", "Live-eval docs should document explicit adapter success.");
    },
  },
  {
    id: "live-eval-public-scenario-is-allowlisted",
    category: "safety",
    checks: () => {
      includes("scripts/evaluate-live.mjs", "publicScenarioFields", "Live-eval should expose only an allowlisted public scenario to adapters.");
      includes("scripts/evaluate-live.mjs", "unsupportedScenarioFields", "Live-eval should reject unsupported manifest fields.");
      includes("scripts/evaluate-live.mjs", "HARNESS-L021", "Live-eval self-tests should cover unsupported-field rejection.");
      includes("scripts/evaluate-live.mjs", "hidden_check_files", "Live-eval should keep hidden check files runner-only.");
      includes("evals/scenario.schema.json", "\"additionalProperties\": false", "Live-eval schema should reject unsupported manifest fields.");
    },
  },
  {
    id: "live-eval-fixture-scope-is-narrow",
    category: "safety",
    checks: () => {
      includes("scripts/evaluate-live.mjs", "HARNESS-L031", "Live-eval self-tests should cover unsafe repo fixture scopes.");
      includes("scripts/evaluate-live.mjs", "allowedRepoFixtureRoots", "Live-eval should use a narrow project-fixture allowlist.");
      includes("scripts/evaluate-live.mjs", "repo_fixture: \".\"", "Live-eval self-tests should reject the repository root.");
      includes("scripts/evaluate-live.mjs", "repo_fixture: \"evals\"", "Live-eval self-tests should reject eval runner directories.");
      includes("scripts/evaluate-live.mjs", "repo_fixture: \"fixtures/adversarial\"", "Live-eval self-tests should reject adversarial fixtures.");
      includes("docs/live-evaluation.md", "relative allowlisted project fixture", "Live-eval docs should document narrow fixture scope.");
      includes("evals/README.md", "must not point at the repository root", "Live-eval README should document forbidden fixture scopes.");
    },
  },
  {
    id: "live-eval-hidden-files-do-not-overwrite",
    category: "safety",
    checks: () => {
      includes("scripts/evaluate-live.mjs", "HARNESS-L032", "Live-eval self-tests should cover hidden check target collisions.");
      includes("scripts/evaluate-live.mjs", "hidden_check_files target collision", "Hidden check staging should fail on existing targets.");
      includes("scripts/evaluate-live.mjs", "fs.existsSync(target)", "Hidden check staging should check the resolved target before copying.");
      includes("docs/live-evaluation.md", "must be absent before staging", "Live-eval docs should document absent-only hidden file staging.");
      includes("evals/README.md", "staged only into absent target paths", "Live-eval README should document hidden target collision prevention.");
    },
  },
  {
    id: "live-eval-reports-are-redacted",
    category: "safety",
    checks: () => {
      includes("scripts/evaluate-live.mjs", "HARNESS-L033", "Live-eval self-tests should cover adapter report string redaction.");
      includes("scripts/evaluate-live.mjs", "redactReportString", "Live-eval report strings should pass through a redaction step.");
      includes("scripts/evaluate-live.mjs", "[redacted]", "Live-eval should replace sensitive report strings with a redacted placeholder.");
      includes("scripts/evaluate-live.mjs", "BEGIN PRIVATE KEY", "Live-eval redaction should cover private-key markers.");
      includes("docs/live-evaluation.md", "allowlisted, redacted adapter summary", "Live-eval docs should document redacted adapter summaries.");
      includes("evals/README.md", "redacted summary", "Live-eval README should document adapter report redaction.");
    },
  },
  {
    id: "live-eval-profiles-are-isolated-and-reports-sanitized",
    category: "safety",
    checks: () => {
      includes("scripts/evaluate-live.mjs", "liveProfileRuns", "Live-eval should require explicit baseline and harness profiles.");
      includes("scripts/evaluate-live.mjs", "OPENCODE_BASELINE_PROFILE", "Live-eval should require a baseline profile.");
      includes("scripts/evaluate-live.mjs", "OPENCODE_HARNESS_PROFILE", "Live-eval should require a harness profile.");
      includes("scripts/evaluate-live.mjs", "runScenarioProfile", "Live-eval should run each profile in its own isolated repo copy.");
      includes("scripts/evaluate-live.mjs", "profileRole", "Live-eval reports should distinguish baseline and harness roles.");
      includes("scripts/evaluate-live.mjs", "stageHiddenCheckFiles", "Live-eval should copy hidden artifacts only after adapter execution.");
      includes("scripts/evaluate-live.mjs", "adapterReportSummary", "Live-eval reports should persist only an allowlisted adapter summary.");
      includes("evals/README.md", "separate isolated repo copies", "Live-eval docs should document profile isolation.");
      includes("evals/README.md", "Reports persist command status/exit metadata and an allowlisted adapter", "Live-eval docs should document report sanitization.");
    },
  },
  {
    id: "review-commands-use-read-only-primary",
    category: "safety",
    checks: () => {
      exists("agents/review-orchestrator.md", "Review commands should have a read-only primary.");
      includes("opencode.json", "\"agent\": \"review-orchestrator\"", "Review commands should route through the read-only primary.");
      includes("agents/review-orchestrator.md", "edit: deny", "Review primary must structurally deny edits.");
      includes("agents/review-orchestrator.md", "\"*\": deny", "Review primary should deny broad shell access.");
    },
  },
  {
    id: "review-orchestrator-cannot-delegate-implementation",
    category: "safety",
    checks: () => {
      excludes("agents/review-orchestrator.md", "general: allow", "Review primary must not delegate to implementation workers.");
      excludes("agents/review-orchestrator.md", "architect: allow", "Review primary must not delegate write-planning architecture work.");
      excludes("agents/review-orchestrator.md", "diagnose: allow", "Review primary should stay limited to review support delegates.");
      excludes("agents/review-orchestrator.md", "improver: allow", "Review primary must not delegate self-improvement.");
    },
  },
  {
    id: "specialized-verification-selected-by-applicability",
    category: "behaviour",
    checks: () => {
      includes("skills/global-quality-gates/SKILL.md", "Specialized verification applicability", "Quality gates should include specialized verification selection.");
      includes("agents/architect.md", "`specialized_verification`", "Architect should choose specialized checks.");
      includes("agents/verifier.md", "`specialized_checks`", "Verifier should report specialized checks or gaps.");
    },
  },
  {
    id: "existing-failures-distinguished-from-introduced-failures",
    category: "behaviour",
    checks: () => {
      includes("skills/global-quality-gates/SKILL.md", "existing failures", "Quality gates should require baseline comparison.");
      includes("agents/orchestrator.md", "introduced failures", "Orchestrator should distinguish introduced failures.");
      includes("agents/verifier.md", "`new_failures`", "Verifier should report new failures.");
      includes("agents/verifier.md", "`existing_failures`", "Verifier should report existing failures.");
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
  {
    id: "trace-contract",
    category: "maintainability",
    checks: () => {
      exists("docs/trace-contract.md", "Trace contract should be documented as a portable artifact shape.");
      includes("docs/trace-contract.md", "not a tracing implementation", "Trace control should stay a contract layer, not a runtime dependency.");
      includes("docs/trace-contract.md", "machine-local artifacts", "Real traces should stay local and out of the reusable template.");
      for (const field of ["`run_id`", "`agent`", "`permission_decision`", "`files_read`", "`files_written`", "`verification`", "`termination_reason`"]) {
        includes("docs/trace-contract.md", field, "Trace events should include the core aggregation and audit fields.");
      }
      includes("docs/trace-contract.md", "must not persist secrets", "Trace contract should explicitly protect secrets and private logs.");
      includes("docs/harness-map.md", "Trace contract", "The trace contract should be represented in the control map.");
    },
  },
  {
    id: "budgeted-termination",
    category: "architecture-fitness",
    checks: () => {
      exists("docs/budgets-and-termination.md", "Budget and termination policy should be documented.");
      for (const reason of ["`verified`", "`partially_verified`", "`blocked_missing_context`", "`blocked_permission`", "`unsafe_without_permission`", "`budget_exhausted`", "`verification_failed`", "`not_reproducible`"]) {
        includes("docs/budgets-and-termination.md", reason, "Termination reasons should be stable and reusable.");
      }
      includes("docs/budgets-and-termination.md", "no remaining high-value independent work", "Budget policy should define concrete stop conditions.");
      includes("docs/budgets-and-termination.md", "worker output is weak after one narrowing", "Weak worker output should not cause unbounded loops.");
      includes("AGENTS.md", "docs/budgets-and-termination.md", "Global rules should point at the budget policy.");
      includes("agents/orchestrator.md", "termination_reason", "Primary orchestrator should require termination reasons.");
      includes("docs/harness-map.md", "Budget and termination policy", "Budget policy should be represented in the control map.");
    },
  },
  {
    id: "subagent-result-schema",
    category: "behaviour",
    checks: () => {
      exists("docs/subagent-result-schema.md", "Shared subagent result schema should be documented.");
      for (const field of ["`status`", "`assigned_scope`", "`summary`", "`evidence`", "`files_changed`", "`verification`", "`decision_unblocked`", "`uncertainty`", "`risks`", "`next_step`", "`termination_reason`"]) {
        includes("docs/subagent-result-schema.md", field, "Shared schema should include all common fields.");
      }
      includes("agents/explore.md", "`files_changed`: []", "Read-only explore should explicitly report no changed files.");
      includes("agents/reviewer.md", "`files_changed`: []", "Read-only reviewer should explicitly report no changed files.");
      includes("agents/verifier.md", "`files_changed`: []", "Read-only verifier should explicitly report no changed files.");
      includes("agents/general.md", "`files_changed`: exact changed paths", "Implementation workers should report exact changed paths.");
      includes("agents/orchestrator.md", "Aggregate subagent results by evidence, uncertainty, termination reason", "Orchestrator should aggregate common fields instead of raw output.");
      includes("docs/harness-map.md", "Subagent result schema", "Subagent result schema should be represented in the control map.");
    },
  },
  {
    id: "adversarial-fixtures",
    category: "safety",
    checks: () => {
      for (const file of [
        "fixtures/adversarial/README.md",
        "fixtures/adversarial/prompt-injection/README.md",
        "fixtures/adversarial/command-injection/README.md",
        "fixtures/adversarial/secret-bait/README.md",
        "fixtures/adversarial/review-only-trap/README.md",
      ]) {
        exists(file, "Adversarial fixtures should include the required static README files.");
        includes(file, "Static fixture: do not execute.", "Adversarial fixtures should be static and non-executable.");
      }
      includes("fixtures/adversarial/prompt-injection/README.md", "untrusted repository content", "Prompt-injection fixture should frame repo text as untrusted.");
      includes("fixtures/adversarial/command-injection/README.md", "prose only", "Command-injection fixture should avoid executable payloads.");
      includes("fixtures/adversarial/secret-bait/README.md", "fake placeholders", "Secret-bait fixture should avoid real secrets.");
      includes("fixtures/adversarial/review-only-trap/README.md", "stay read-only", "Review-only trap should preserve review semantics.");
      excludes("fixtures/adversarial/command-injection/README.md", "rm -rf", "Adversarial fixtures must not include real destructive command examples.");
      excludes("fixtures/adversarial/secret-bait/README.md", "BEGIN PRIVATE KEY", "Adversarial fixtures must not include private-key material.");
      includes("docs/harness-map.md", "Adversarial fixtures", "Adversarial fixtures should be represented in the control map.");
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
console.log(`Harness contract/config evaluation passed (${scenarios.length} scenarios across ${categories.length} categories).`);
