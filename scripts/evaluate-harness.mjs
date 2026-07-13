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
      includes("scripts/evaluate-live.mjs", "adapterFailureReason", "Live-eval adapters should not pass without an explicit success signal.");
      includes("scripts/evaluate-live.mjs", "LIVE_SELF_TEST_ADAPTER_SUCCESS", "Live-eval self-tests should cover adapter success semantics.");
      includes("lib/feedback/adapter-worker.mjs", "runAdapterModule", "Live-eval runner should enforce adapter timeouts in an isolated process host.");
      includes("lib/feedback/adapter-worker.mjs", "terminateProcessTree", "Adapters should use the shared verified process-tree boundary.");
      includes("lib/feedback/process-tree.mjs", "taskkill.exe", "Windows adapters and commands should tear down the complete ordinary descendant tree.");
      includes("lib/feedback/process-tree.mjs", "process.kill(-pid", "POSIX adapters and commands should use a dedicated process group.");
      includes("lib/feedback/process-tree.mjs", "runManagedCommand", "Shell verification should share the bounded process-tree runner.");
      includes("lib/feedback/adapter-worker.mjs", "adapter_teardown_unverified", "Unverified teardown must fail closed.");
      includes("scripts/verify-adapter-worker.mjs", "late-marker.txt", "Adapter timeout tests should prove process-tree termination prevents late writes.");
      includes("evals/README.md", "Adapters must return", "Live-eval docs should document explicit adapter success.");
      includes("evals/README.md", "explicit success", "Live-eval docs should document explicit adapter success.");
    },
  },
  {
    id: "live-eval-public-scenario-is-allowlisted",
    category: "safety",
    checks: () => {
      includes("lib/feedback/manifests.mjs", "PUBLIC_SCENARIO_FIELDS", "Live-eval should expose only an allowlisted public scenario to adapters.");
      includes("scripts/verify-live-manifests.mjs", "CONTRACT_UNKNOWN_FIELD", "Live-eval self-tests should cover unsupported-field rejection.");
      includes("scripts/verify-live-manifests.mjs", "failure_family", "Manifest tests should prove runner-only failure metadata stays private.");
      includes("scripts/verify-live-manifests.mjs", "expectationSentinels", "Manifest tests should prove expected and forbidden strings stay runner-only.");
      includes("scripts/evaluate-live.mjs", "hidden_check_files", "Live-eval should keep hidden check files runner-only.");
      includes("evals/scenario.schema.json", "\"additionalProperties\": false", "Live-eval schema should reject unsupported manifest fields.");
    },
  },
  {
    id: "live-eval-fixture-scope-is-narrow",
    category: "safety",
    checks: () => {
      includes("lib/feedback/manifests.mjs", "MANIFEST_FIXTURE_SCOPE", "Live-eval should use a narrow project-fixture allowlist.");
      includes("scripts/verify-live-manifests.mjs", "repo_fixture: \".\"", "Live-eval self-tests should reject the repository root.");
      includes("scripts/verify-live-manifests.mjs", "repo_fixture: \"evals\"", "Live-eval self-tests should reject eval runner directories.");
      includes("scripts/verify-live-manifests.mjs", "repo_fixture: \"fixtures/adversarial\"", "Live-eval self-tests should reject adversarial fixtures.");
      includes("docs/live-evaluation.md", "relative allowlisted project fixture", "Live-eval docs should document narrow fixture scope.");
      includes("evals/README.md", "repository root", "Live-eval README should document forbidden fixture scopes.");
    },
  },
  {
    id: "live-eval-hidden-files-do-not-overwrite",
    category: "safety",
    checks: () => {
      includes("scripts/evaluate-live.mjs", "LIVE_SELF_TEST_HIDDEN_COLLISION", "Live-eval self-tests should cover hidden check target collisions.");
      includes("scripts/evaluate-live.mjs", "LIVE_HIDDEN_COLLISION", "Hidden check staging should fail on existing targets.");
      includes("scripts/evaluate-live.mjs", "lstatExists(target)", "Hidden check staging should detect ordinary and dangling-link collisions before copying.");
      includes("docs/live-evaluation.md", "must be absent before staging", "Live-eval docs should document absent-only hidden file staging.");
      includes("evals/README.md", "staged only into absent target paths", "Live-eval README should document hidden target collision prevention.");
    },
  },
  {
    id: "live-eval-reports-are-redacted",
    category: "safety",
    checks: () => {
      includes("scripts/evaluate-live.mjs", "sanitizeBoundedString", "Live-eval report strings should pass through centralized sanitization.");
      includes("lib/feedback/privacy.mjs", "[redacted]", "Sensitive strings should be replaced with a redacted placeholder.");
      includes("scripts/verify-feedback-foundation.mjs", "BEGIN PRIVATE KEY", "Privacy self-tests should cover private-key markers.");
      includes("scripts/evaluate-live.mjs", "LIVE_SELF_TEST_PRIVACY", "Live-eval self-tests should prove arbitrary adapter output stays out of reports.");
      includes("docs/live-evaluation.md", "allowlisted sanitized model/tool/cost", "Live-eval docs should document the implemented adapter metadata allowlist.");
      includes("evals/README.md", "allowlisted sanitized model/tool/cost", "Live-eval README should document the implemented adapter metadata allowlist.");
    },
  },
  {
    id: "live-eval-profiles-are-isolated-and-reports-sanitized",
    category: "safety",
    checks: () => {
      includes("scripts/evaluate-live.mjs", "profileRuns", "Live-eval should require explicit baseline and harness profiles.");
      includes("scripts/evaluate-live.mjs", "OPENCODE_BASELINE_PROFILE", "Live-eval should require a baseline profile.");
      includes("scripts/evaluate-live.mjs", "OPENCODE_HARNESS_PROFILE", "Live-eval should require a harness profile.");
      includes("scripts/evaluate-live.mjs", "OPENCODE_BASELINE_PERMISSION_EVIDENCE", "Live-eval should bind baseline behavior to installed permission evidence.");
      includes("scripts/evaluate-live.mjs", "OPENCODE_HARNESS_PERMISSION_EVIDENCE", "Live-eval should bind candidate behavior to installed permission evidence.");
      includes("scripts/evaluate-live.mjs", "runScenarioProfile", "Live-eval should run each profile in its own isolated repo copy.");
      includes("scripts/evaluate-live.mjs", "profileRole", "Live-eval reports should distinguish baseline and harness roles.");
      includes("scripts/evaluate-live.mjs", "stageHiddenFiles", "Live-eval should copy hidden artifacts only after adapter execution.");
      includes("scripts/evaluate-live.mjs", "availabilityMetadata", "Live-eval reports should persist only allowlisted, sanitized adapter metadata.");
      includes("evals/README.md", "separate isolated repo copies", "Live-eval docs should document profile isolation.");
      includes("evals/README.md", "Reports persist command status/exit metadata", "Live-eval docs should document report sanitization.");
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
      exists("fixtures/runtime-debug/agent-list.txt", "Runtime parser fixtures should carry an authoritative installed-agent inventory.");
      includes("docs/harness-map.md", "Runtime verifier", "The control map should include runtime verification.");
      includes("docs/harnessability.md", "Strong Harnessability", "Adopters should have a checklist for harness readiness.");
      includes("package.json", "\"verify:runtime\": \"node scripts/verify-runtime.mjs\"", "Runtime verifier should be runnable through npm.");
      includes("package.json", "\"verify:runtime:fixture\": \"node scripts/verify-runtime-fixtures.mjs\"", "Runtime fixture verifier should be runnable through npm.");
      includes("scripts/verify-runtime-fixtures.mjs", "HARNESS-R009", "Runtime fixture verifier should prove unsafe edit permissions fail.");
      includes("scripts/verify-runtime-fixtures.mjs", "HARNESS-R013", "Runtime fixture verifier should prove unsafe oc_learning permissions fail.");
      includes("scripts/verify-runtime-fixtures.mjs", "unexpected-agent", "Runtime fixture verifier should prove additional installed agents are discovered and captured.");
      includes("scripts/verify-runtime-fixtures.mjs", "HARNESS-R022", "Runtime fixture verifier should prove malformed or missing installed-agent inventory fails closed.");
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
      exists("docs/trace-contract.md", "Trace contract should document the executable operational store.");
      exists("lib/feedback/trace-store.mjs", "Operational trace storage must be implemented, not only documented.");
      exists("scripts/verify-trace-store.mjs", "Trace persistence needs deterministic lifecycle and privacy tests.");
      includes("docs/trace-contract.md", "schema version `2`", "Trace writers should use the current executable schema.");
      includes("docs/trace-contract.md", "schema-v1", "Trace readers should document explicit legacy compatibility.");
      includes("docs/trace-contract.md", "machine-local artifacts", "Real traces should stay local and out of the reusable template.");
      for (const field of ["`run_id`", "`event_id`", "`sequence`", "`agent`", "`permission_decision`", "`files_read`", "`files_written`", "`verification`", "`termination_reason`", "`hypothesis`", "`actual_observation`", "`strategy_id`"]) {
        includes("docs/trace-contract.md", field, "Trace events should include the core aggregation and audit fields.");
      }
      includes("docs/trace-contract.md", "must not persist secrets, raw prompts", "Trace contract should explicitly protect secrets and private logs.");
      includes("docs/harness-map.md", "Trace contract and operational run store (schema v2)", "The executable trace control should be represented in the control map.");
    },
  },
  {
    id: "operational-feedback-plane",
    category: "architecture-fitness",
    checks: () => {
      includes(".gitignore", ".oc_harness/", "Operational artifacts must remain machine-local.");
      includes("opencode.json", ".oc_harness/**", "OpenCode watcher must ignore operational artifacts.");
      includes("package.json", "verify:trace-store", "Trace-store tests must be available from package scripts.");
      includes("scripts/evaluate-live.mjs", "createTraceStore", "Live evaluation should create operational runs.");
      includes("scripts/evaluate-live.mjs", "createReportHistory", "Live evaluation should write immutable history.");
      includes("scripts/evaluate-live.mjs", "runAdapterModule", "Adapters should run behind the terminable worker boundary.");
      includes("scripts/evaluate-live.mjs", "infrastructure_self_test", "Deterministic tracing evidence must be labeled as infrastructure only.");
    },
  },
  {
    id: "representative-live-corpus-and-suites",
    category: "behaviour",
    checks: () => {
      exists("evals/suites.json", "Live scenarios need a versioned suite split.");
      exists("scripts/verify-live-manifests.mjs", "Suite and corpus validation must be deterministic.");
      includes("lib/feedback/manifests.mjs", "SUITE_DUPLICATE_MEMBERSHIP", "Duplicate suite membership must fail closed.");
      includes("lib/feedback/manifests.mjs", "SUITE_MISSING_MEMBERSHIP", "Missing suite membership must fail closed.");
      includes("lib/feedback/trace-assertions.mjs", "no_overlapping_job_write_scopes", "Trace assertions should cover non-shell behavioral contracts.");
      includes("docs/live-evaluation.md", "development", "Suite semantics must be documented.");
      includes("docs/live-evaluation.md", "held_out", "Held-out suite semantics must be documented.");
      includes("docs/live-evaluation.md", "canary", "Canary suite semantics must be documented.");
    },
  },
  {
    id: "candidate-acceptance-hard-gates",
    category: "safety",
    checks: () => {
      exists("evals/acceptance-policy.json", "Candidate acceptance needs a versioned policy.");
      exists("lib/feedback/acceptance.mjs", "Candidate decisions need a strict deterministic engine.");
      exists("scripts/verify-candidate-assessment.mjs", "Accepted, rejected, and inconclusive decisions need deterministic tests.");
      includes("lib/feedback/acceptance.mjs", "inconclusive", "Missing mandatory evidence must not become acceptance.");
      includes("lib/feedback/acceptance.mjs", "CANARY_REGRESSION", "Canary regressions must be a hard gate.");
      includes("lib/feedback/acceptance.mjs", "HELD_OUT_REGRESSION", "Held-out regressions must be a hard gate.");
      includes("lib/feedback/acceptance.mjs", "NEW_HIDDEN_CHECK_FAILURE", "Introduced hidden failures must be a hard gate.");
      includes("lib/feedback/acceptance.mjs", "evidence_identity", "Static, permission, and live evidence must be content-bound.");
      includes("docs/evaluation.md", "whole decision `inconclusive`", "Missing mandatory evidence must take precedence over rejection.");
      includes("docs/evaluation.md", "candidate acceptance", "Evaluation docs should distinguish evidence collection from candidate decisions.");
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
