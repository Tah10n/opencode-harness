import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DETERMINISTIC_STAGE_REGISTRY, deterministicExpectedChecks } from "./verify-all.mjs";
import { milestone2ExpectedChecks } from "../lib/quality/milestone-dod.mjs";

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
  ".opencode/plugins/engineering-dossier.mjs",
  ".opencode/quality/checks.json",
  ".opencode/quality/toolchains.json",
  "quality/schemas/project-check-catalog.schema.json",
  "quality/schemas/post-edit-architecture-evidence.schema.json",
  "quality/schemas/toolchain-host-configuration.schema.json",
  "quality/schemas/toolchain-map.schema.json",
  "quality/examples/project-checks.example.json",
  "quality/examples/global-quality-plugin.mjs",
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
  "evals/acceptance-policy.json",
  "evals/hidden/runner-self-test/hidden.test.js",
  "evals/scenario.schema.json",
  "evals/suite.schema.json",
  "evals/suites.json",
  "evals/scenarios/runner-self-test.json",
  "lib/feedback/acceptance.mjs",
  "lib/feedback/adapter-worker.mjs",
  "lib/feedback/contracts.mjs",
  "lib/feedback/evidence.mjs",
  "lib/quality/milestone-dod.mjs",
  "lib/quality/normal-session-bridge.mjs",
  "lib/quality/normal-session-plugin.mjs",
  "lib/quality/project-check-catalog.mjs",
  "lib/quality/post-architecture-evidence.mjs",
  "lib/quality/quality-plugin.mjs",
  "lib/quality/runtime-hook-verification.mjs",
  "lib/quality/session-classification.mjs",
  "lib/quality/standard-lite.mjs",
  "lib/quality/trusted-project-runner.mjs",
  "lib/quality/trusted-toolchain-host-config.mjs",
  "lib/quality/trusted-toolchains.mjs",
  "lib/quality/verification-targets.mjs",
  "lib/quality/whitespace.mjs",
  "lib/feedback/files.mjs",
  "lib/feedback/index.mjs",
  "lib/feedback/manifests.mjs",
  "lib/feedback/managed-command-sync-worker.mjs",
  "lib/feedback/privacy.mjs",
  "lib/feedback/process-tree.mjs",
  "lib/feedback/process-containment.mjs",
  "lib/feedback/permission-surface.mjs",
  "lib/feedback/report-history.mjs",
  "lib/feedback/trace-assertions.mjs",
  "lib/feedback/trace-store.mjs",
  "scripts/assess-candidate.mjs",
  "scripts/capture-static-evidence.mjs",
  "scripts/evaluate-live.mjs",
  "scripts/evaluate-harness.mjs",
  "scripts/injected-test-containment.mjs",
  "scripts/trace-run.mjs",
  "scripts/verify-adoption-bundle.mjs",
  "scripts/verify-adapter-worker.mjs",
  "scripts/verify-candidate-assessment.mjs",
  "scripts/verify-feedback-foundation.mjs",
  "scripts/verify-live-manifests.mjs",
  "scripts/verify-report-history.mjs",
  "scripts/verify-trace-store.mjs",
  "scripts/verify-drift.mjs",
  "scripts/verify-runtime-fixtures.mjs",
  "scripts/verify-runtime.mjs",
  "scripts/verify-normal-session-quality-bridge.mjs",
  "scripts/verify-normal-session-runtime.mjs",
  "scripts/verify-normal-session-runtime-fixtures.mjs",
  "scripts/probe-normal-session-plugin-api.mjs",
  "scripts/verify-session-classification.mjs",
  "scripts/verify-project-check-catalog.mjs",
  "scripts/verify-workspace-observation.mjs",
  "scripts/verify-trusted-toolchain-host-config.mjs",
  "scripts/verify-trusted-toolchains.mjs",
  "scripts/verify-process-containment.mjs",
  "scripts/verify-trusted-project-runner.mjs",
  "scripts/verify-bash-boundary.mjs",
  "scripts/verify-global-quality-plugin-export.mjs",
  "scripts/verify-quality-live-runner.mjs",
  "scripts/verify-quality-verification-targets.mjs",
  "scripts/verify-committed-whitespace.mjs",
  "scripts/verify-committed-whitespace-fixtures.mjs",
  "scripts/verify-all.mjs",
];

for (const file of requiredFiles) {
  if (!exists(file)) {
    fail("HARNESS-S001", `required file missing: ${file}`, "Restore the required harness file.");
  }
}

for (const forbiddenFile of [
  "lib/quality/model-profiles.mjs",
  "lib/quality/runtime-execution.mjs",
  "quality/model-profiles/catalog.v1.json",
  "quality/model-profiles/experiment.v1.json",
  "quality/model-profiles/runtime-fixture-evidence.v1.json",
  "scripts/assess-quality-candidate.mjs",
  "scripts/verify-model-profiles.mjs",
]) {
  if (exists(forbiddenFile)) {
    fail("HARNESS-S001", `removed model-comparison artifact returned: ${forbiddenFile}`, "Keep model selection in active agent frontmatter only.");
  }
}

const packageJson = JSON.parse(read("package.json"));
if (packageJson.version !== "0.3.0") {
  fail("HARNESS-S007", "package.json version must match the unreleased 0.3.0 target", "Update docs, changelog, and release metadata together with the version.");
}
if (packageJson.engines?.node !== ">=24") {
  fail("HARNESS-S007", "package.json engines.node must match the Node 24 CI/runtime contract", "Declare engines.node as >=24 and keep CI aligned.");
}
if (packageJson.scripts?.verify !== "node scripts/verify-all.mjs") {
  fail("HARNESS-S008", "package.json must route npm run verify through the bounded runner-owned receipt aggregator", "Set verify to node scripts/verify-all.mjs.");
}
for (const forbiddenScript of ["assess:quality-candidate", "verify:model-profiles"]) {
  if (packageJson.scripts?.[forbiddenScript]) {
    fail("HARNESS-S008", `removed model-comparison command returned: ${forbiddenScript}`, "Keep general live evaluation model-neutral and outside deterministic acceptance.");
  }
}
const expectedDeterministicStages = [
  "verify:static", "verify:feedback-foundation", "verify:trace-store", "verify:report-history", "verify:adapter-worker",
  "eval", "verify:drift", "verify:adoption-bundle", "verify:runtime:fixture", "verify:runtime:quality-hooks:fixture",
  "verify:live-eval", "verify:acceptance",
  "verify:quality-contracts", "verify:engineering-dossier", "verify:architecture-policy", "verify:impact-graph",
  "verify:prompt-inventory", "verify:quality-live-coordinator", "verify:quality-live-runner", "verify:quality-verification-targets",
  "verify:normal-session-quality-bridge", "verify:session-classification", "verify:project-check-catalog",
  "verify:workspace-observation", "verify:trusted-toolchain-host-config", "verify:trusted-toolchains", "verify:process-containment",
  "verify:trusted-project-runner", "verify:bash-boundary", "verify:global-quality-plugin-export",
  "verify:quality-live-manifests", "verify:quality-acceptance",
  "verify:whitespace:fixture", "verify:milestone-2-dod-contract",
];
if (JSON.stringify(DETERMINISTIC_STAGE_REGISTRY.map((stage) => stage.npm_script)) !== JSON.stringify(expectedDeterministicStages)) {
  fail("HARNESS-S008", "verify-all deterministic stage registry drifted from the reviewed sequential npm stage contract", "Restore the exact model/network-free stage order.");
}
if (DETERMINISTIC_STAGE_REGISTRY.some((stage) => stage.npm_script === "probe:runtime:quality-plugin-api")) {
  fail("HARNESS-S008", "the machine-local installed API probe must not run inside npm run verify", "Keep the API probe as an explicit installed-runtime smoke only.");
}
if (new Set(DETERMINISTIC_STAGE_REGISTRY.map((stage) => stage.command_id)).size !== DETERMINISTIC_STAGE_REGISTRY.length) {
  fail("HARNESS-S008", "verify-all command IDs must be unique", "Give each deterministic stage one stable command_id.");
}
for (const stage of DETERMINISTIC_STAGE_REGISTRY) {
  if (!packageJson.scripts?.[stage.npm_script] || stage.npm_script === "verify") {
    fail("HARNESS-S008", `verify-all references missing or recursive npm stage ${stage.npm_script}`, "Keep the registry and package scripts coherent and non-recursive.");
  }
}
const dodDocument = JSON.parse(read("quality/milestone-2-dod.v2.json"));
const deterministicDimension = dodDocument.dimensions.find((item) => item.dimension_id === "deterministic_contracts");
const hostHookDimension = dodDocument.dimensions.find((item) => item.dimension_id === "host_hook_e2e");
if (dodDocument.schema_version !== 2 || !deterministicDimension || !hostHookDimension?.mandatory_for_verified) {
  fail("HARNESS-S008", "Milestone 2 DoD must retain explicit deterministic and mandatory host-hook dimensions", "Restore the v2 operational dimension contract.");
}
const deterministicDodChecks = [...deterministicDimension.check_ids].sort();
const operationalDeterministicChecks = deterministicExpectedChecks();
const registeredDodChecks = operationalDeterministicChecks.map((entry) => entry.check_id).sort();
if (JSON.stringify(registeredDodChecks) !== JSON.stringify(deterministicDodChecks)) {
  fail("HARNESS-S008", "verify-all receipt registry must map every deterministic DoD check exactly once", "Synchronize the runner registry with quality/milestone-2-dod.v2.json.");
}
const canonicalDeterministicChecks = milestone2ExpectedChecks(dodDocument)
  .filter((entry) => deterministicDimension.check_ids.includes(entry.check_id))
  .sort((left, right) => left.check_id.localeCompare(right.check_id));
const sortedOperationalChecks = [...operationalDeterministicChecks]
  .sort((left, right) => left.check_id.localeCompare(right.check_id));
if (JSON.stringify(sortedOperationalChecks) !== JSON.stringify(canonicalDeterministicChecks)) {
  fail("HARNESS-S008", "verify-all receipt producers or command IDs drifted from the canonical DoD authority", "Keep operational receipt identities identical to lib/quality/milestone-dod.mjs.");
}
if (Object.hasOwn(packageJson.scripts ?? {}, "verify:milestone-2-dod")) {
  fail("HARNESS-S008", "the misleading verify:milestone-2-dod command must not remain exposed", "Use verify:milestone-2-dod-contract for manifest-only validation.");
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
if (packageJson.scripts?.["eval:live:buffered-self-test"] !== "node scripts/evaluate-live.mjs --self-test-buffered") {
  fail("HARNESS-S009", "package.json must expose npm run eval:live:buffered-self-test", "Restore the no-process buffered live-evaluation self-test entry.");
}
if (packageJson.scripts?.["verify:live-eval"] !== "npm run verify:live-manifests && npm run eval:live:validate && npm run eval:live:buffered-self-test && npm run eval:live:self-test") {
  fail("HARNESS-S009", "package.json must expose npm run verify:live-eval", "Keep live-eval deterministic checks in the default verification gate.");
}
for (const [name, command] of Object.entries({
  "verify:feedback-foundation": "node scripts/verify-feedback-foundation.mjs",
  "verify:trace-store": "node scripts/verify-trace-store.mjs",
  "verify:report-history": "node scripts/verify-report-history.mjs",
  "verify:adapter-worker": "node scripts/verify-adapter-worker.mjs",
  "verify:adoption-bundle": "node scripts/verify-adoption-bundle.mjs",
  "verify:live-manifests": "node scripts/verify-live-manifests.mjs",
  "verify:quality-contracts": "node scripts/verify-quality-contracts.mjs",
  "verify:engineering-dossier": "node scripts/verify-engineering-quality.mjs",
  "verify:architecture-policy": "node scripts/verify-quality-architecture.mjs",
  "verify:impact-graph": "node scripts/verify-quality-architecture.mjs",
  "verify:prompt-inventory": "node scripts/verify-prompt-inventory.mjs",
  "verify:quality-live-coordinator": "node scripts/verify-quality-live-coordinator.mjs",
  "verify:quality-live-runner": "node scripts/verify-quality-live-runner.mjs",
  "verify:quality-verification-targets": "node scripts/verify-quality-verification-targets.mjs",
  "verify:normal-session-quality-bridge": "node scripts/verify-normal-session-quality-bridge.mjs",
  "verify:session-classification": "node scripts/verify-session-classification.mjs",
  "verify:project-check-catalog": "node scripts/verify-project-check-catalog.mjs",
  "verify:workspace-observation": "node scripts/verify-workspace-observation.mjs",
  "verify:trusted-toolchain-host-config": "node scripts/verify-trusted-toolchain-host-config.mjs",
  "verify:trusted-toolchains": "node scripts/verify-trusted-toolchains.mjs",
  "verify:process-containment": "node scripts/verify-process-containment.mjs",
  "verify:trusted-project-runner": "node scripts/verify-trusted-project-runner.mjs",
  "verify:bash-boundary": "node scripts/verify-bash-boundary.mjs",
  "verify:global-quality-plugin-export": "node scripts/verify-global-quality-plugin-export.mjs",
  "probe:runtime:quality-plugin-api": "node scripts/probe-normal-session-plugin-api.mjs",
  "verify:runtime:quality-hooks": "node scripts/verify-normal-session-runtime.mjs",
  "verify:runtime:quality-hooks:fixture": "node scripts/verify-normal-session-runtime-fixtures.mjs",
  "verify:quality-live-manifests": "node scripts/verify-quality-live-manifests.mjs",
  "verify:quality-acceptance": "node scripts/verify-quality-acceptance.mjs",
  "verify:milestone-2-dod-contract": "node scripts/verify-milestone-2-dod.mjs",
  "milestone:2:operational": "node scripts/run-milestone-2-operational.mjs",
  "milestone:2:assess": "node scripts/assess-milestone-2-receipts.mjs",
  "verify:acceptance": "node scripts/verify-candidate-assessment.mjs",
  "verify:whitespace": "node scripts/verify-committed-whitespace.mjs",
  "verify:whitespace:fixture": "node scripts/verify-committed-whitespace-fixtures.mjs",
  "assess:candidate": "node scripts/assess-candidate.mjs",
  "evidence:static": "node scripts/capture-static-evidence.mjs",
  trace: "node scripts/trace-run.mjs",
})) {
  if (packageJson.scripts?.[name] !== command) {
    fail("HARNESS-S009", `package.json must expose ${name}`, `Set ${name} to ${command}.`);
  }
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
const verifyAllScript = read("scripts/verify-all.mjs");
for (const needle of [
  "DETERMINISTIC_STAGE_REGISTRY",
  "sealVerificationReceipt",
  "assessMilestone2Receipts",
  "committedWhitespaceReceipt",
  "evidence_scope",
  "resolved_range",
  "deriveMilestone2StatusFacts",
  "sealMilestone2ReceiptBundle",
  "OPENCODE_MILESTONE_RECEIPTS_OUT",
  "deterministic_contracts",
  "Operational runtime and installed-host evidence are reported separately",
]) {
  assertIncludes(verifyAllScript, needle, "scripts/verify-all.mjs", "HARNESS-S008", "The default verifier must remain a runner-owned bounded receipt aggregator.");
}
for (const forbidden of ["OPENCODE_MODEL_RUNTIME_EVIDENCE_PATH", "OPENCODE_LIVE_EVAL_ADAPTER", "runtime_optional\": \"passed", "live_external\": \"passed"]) {
  assertNotIncludes(verifyAllScript, forbidden, "scripts/verify-all.mjs", "HARNESS-S008", "The deterministic runner must not self-declare external runtime or live success.");
}
const milestoneDodVerifier = read("scripts/verify-milestone-2-dod.mjs");
for (const needle of [
  "consumes no execution receipts",
  "asserts no milestone completion status",
  "duplicate verification receipt",
  "generic receipt sealing is restricted to the deterministic runner",
  "substituted command",
  "missing operational artifacts must never upgrade the milestone",
  "deterministic host fixtures must never satisfy installed-host evidence",
]) {
  assertIncludes(milestoneDodVerifier, needle, "scripts/verify-milestone-2-dod.mjs", "HARNESS-S008", "The DoD command must be honest and exercise the receipt rejection matrix.");
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
if (packageJson.exports?.["./feedback"] !== "./lib/feedback/index.mjs" || packageJson.exports?.["./trace-store"] !== "./lib/feedback/index.mjs") {
  fail("HARNESS-S015", "package.json must expose the stable feedback/trace integration boundary", "Export lib/feedback/index.mjs without exposing private implementation modules.");
}
const gitignore = read(".gitignore");
for (const ignored of [".oc_harness/", "evals/reports/", "evals/decisions/"]) {
  assertIncludes(gitignore, ignored, ".gitignore", "HARNESS-S018", "Keep operational, report, and decision artifacts out of Git.");
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
if (!config.watcher?.ignore?.includes(".oc_harness/**")) {
  fail("HARNESS-S018", "opencode.json watcher must ignore .oc_harness/**", "Keep machine-local operational runs out of watcher noise.");
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
  if (typeof frontmatter.model !== "string" || frontmatter.model.length === 0) {
    fail("HARNESS-S024", `${file} must declare a non-empty model preference`, "Keep the user-configurable model choice in active agent frontmatter.");
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
    assertPermission(agent, permission, "edit", "ask", "HARNESS-S035", "Implementation workers must route native edits through the quality permission hook.");
  }
}

if (config.permission?.["quality_*"] !== "deny") {
  fail("HARNESS-S084", "root quality_* permission must deny by default", "Expose only the bounded quality tools on explicitly authorized agent profiles.");
}
const qualityToolIds = [
  "quality_session_start",
  "quality_dossier_create",
  "quality_dossier_update",
  "quality_dossier_inspect",
  "quality_architecture_evaluate",
  "quality_dossier_finalize",
  "quality_action_authorize",
  "quality_command_authorize",
  "quality_verification_record",
  "quality_session_finalize",
];
const qualityPermissions = new Map([
  ["orchestrator", ["quality_session_start", "quality_dossier_create", "quality_dossier_update", "quality_dossier_inspect", "quality_dossier_finalize", "quality_action_authorize", "quality_session_finalize"]],
  ["orchestrator-deep", ["quality_session_start", "quality_dossier_create", "quality_dossier_update", "quality_dossier_inspect", "quality_dossier_finalize", "quality_action_authorize", "quality_session_finalize"]],
  ["architect", ["quality_dossier_inspect", "quality_architecture_evaluate"]],
  ["reviewer", ["quality_dossier_inspect", "quality_architecture_evaluate"]],
  ["verifier", ["quality_dossier_inspect", "quality_verification_record"]],
]);
for (const agent of agentNames) {
  const permission = frontmatters.get(agent)?.permission ?? {};
  const allowed = new Set(qualityPermissions.get(agent) ?? []);
  for (const toolId of qualityToolIds) {
    if (allowed.has(toolId) && permission[toolId] !== "allow") {
      fail("HARNESS-S084", `${agent} must allow ${toolId}`, "Restore the reviewed normal-session quality-tool permission matrix.");
    }
    if (!allowed.has(toolId) && Object.hasOwn(permission, toolId)) {
      fail("HARNESS-S084", `${agent} must inherit root deny for ${toolId}`, "Remove quality-tool exposure outside the reviewed role boundary.");
    }
  }
}

for (const agent of ["orchestrator", "orchestrator-deep"]) {
  const taskPermissions = frontmatters.get(agent)?.permission?.task ?? {};
  for (const delegatedAgent of ["explore", "architect", "general", "reviewer", "diagnose", "researcher", "improver", "verifier"]) {
    const expected = delegatedAgent === "general" ? "ask" : "allow";
    if (taskPermissions[delegatedAgent] !== expected) {
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
const dossierRiskClasses = ["standard-lite", "high", "critical"];
const dossierSchema = JSON.parse(read("quality/schemas/engineering-dossier.schema.json"));
const constantsSource = read("lib/quality/constants.mjs");
const constantsRiskMatch = constantsSource.match(/QUALITY_RISK_CLASSES\s*=\s*Object\.freeze\((\[[^\]]+\])\)/u);
let constantsRiskClasses = [];
try {
  constantsRiskClasses = constantsRiskMatch ? JSON.parse(constantsRiskMatch[1]) : [];
} catch {
  constantsRiskClasses = [];
}
for (const [label, actual] of [
  ["quality/schemas/engineering-dossier.schema.json", dossierSchema?.properties?.risk_class?.enum],
  ["lib/quality/constants.mjs", constantsRiskClasses],
]) {
  if (JSON.stringify(actual) !== JSON.stringify(dossierRiskClasses)) {
    fail("HARNESS-S049", `${label} dossier risk classes drifted from standard-lite | high | critical`, "Keep the computational Engineering Dossier risk classes aligned across schema, constants, prompts, and quality gates.");
  }
}
for (const [label, text] of [
  ["agents/architect.md", read("agents/architect.md")],
  ["skills/global-quality-gates/SKILL.md", qualityGatesSkill],
]) {
  for (const needle of ["`standard-lite`", "`high`", "`critical`", "operational trace", "legacy `standard`"]) {
    assertIncludes(text, needle, label, "HARNESS-S049", "Distinguish dossier standard-lite from the legacy operational trace standard label.");
  }
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
  "only allowlisted",
  "public fields",
  "Adapters must return explicit success",
  "OPENCODE_BASELINE_PROFILE",
  "OPENCODE_HARNESS_PROFILE",
  "OPENCODE_BASELINE_PERMISSION_EVIDENCE",
  "OPENCODE_HARNESS_PERMISSION_EVIDENCE",
  "separate isolated repository copies",
  "AbortSignal",
  "allowlisted sanitized model/tool/cost",
  "content-derived `profile_fingerprint`",
  "Symlinks",
  "junctions",
  "never raw command",
  "stdout/stderr",
  "Unsupported fields are rejected",
  "relative allowlisted project fixture",
  "repository root",
  "trace/report directories",
  "must be absent before staging",
  "must not overwrite or merge",
  "transcripts, prompts, completions, secrets",
  "`workspace_policy`",
  "`read_only`",
  "`allowlist`",
  "even when the adapter emitted no `edit` event",
  "bounded managed-command",
  "validated quality sidecar",
  "canonical runner-integrated verification",
  "runner/session",
  "artifact bundle",
  "self-described quality outcome",
]) {
  assertIncludes(liveEvaluationDocs, needle, "docs/live-evaluation.md", "HARNESS-S057", "Document general live evaluation without making it a default CI dependency.");
}
assertNotIncludes(liveEvaluationDocs, "setup_source", "docs/live-evaluation.md", "HARNESS-S057", "Do not document live-eval setup sources until the runner implements them.");
for (const [label, text] of [["README.md", read("README.md")], ["docs/evaluation.md", read("docs/evaluation.md")], ["docs/release.md", read("docs/release.md")]]) {
  assertNotIncludes(text, "npm run verify:milestone-2-dod\n", label, "HARNESS-S057", "Use the honest verify:milestone-2-dod-contract command name.");
}

const readme = read("README.md");
for (const needle of [
  "Its policy layer is intentionally separate from optional capability packages",
  "actions/workflows/verify.yml/badge.svg",
  "## Adoption",
  "npm run verify",
  "npm run verify:adoption-bundle",
  "npm run verify:runtime",
  "general live regression evaluation",
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
  "unreleased `0.3.0`",
  "tagged release is `v0.2.0`",
  "portable-adoption-bundle:start",
  ".opencode/plugins/engineering-dossier.mjs",
  ".opencode/quality/checks.json",
  "lib/feedback",
  "lib/quality",
  "never copy the whole `.opencode/`",
]) {
  assertIncludes(readme, needle, "README.md");
}
const modelsSection = readme.split("## Models", 2)[1]?.split(/^## /mu, 1)[0] ?? "";
for (const agent of agentNames) {
  const file = `agents/${agent}.md`;
  const row = modelsSection.split(/\r?\n/u).find((line) => line.includes(`\`${file}\``)) ?? "";
  const model = frontmatters.get(agent)?.model;
  assertIncludes(row, `\`${model}\``, `README.md Models row for ${file}`, "HARNESS-S083", "Keep each README model-table row synchronized with its active agent frontmatter.");
}
for (const needle of [
  "## Models",
  "The active agent frontmatter is the authoritative model configuration.",
  "When changing only the model, preserve the role prompt and permissions.",
  "`reasoningEffort` and `textVerbosity` are separate optional frontmatter",
]) {
  assertIncludes(readme, needle, "README.md Models instructions", "HARNESS-S083", "Preserve the exact direct model-replacement instructions.");
}
const normalizedReadme = readme.replace(/\s+/gu, " ");
for (const needle of [
  "To change a model, edit the `model:` field in the YAML frontmatter of the relevant `agents/<name>.md` file.",
  "No generated catalog or fingerprint must be updated for a model-only change.",
]) {
  assertIncludes(normalizedReadme, needle, "README.md Models instructions", "HARNESS-S083", "Preserve the exact direct model-replacement instructions independent of Markdown line wrapping.");
}
for (const forbidden of ["quality/model-profiles", "GPT-5.5", "Luna", "96-comparison", "model A/B"]) {
  assertNotIncludes(readme, forbidden, "README.md Models instructions", "HARNESS-S083", "Keep model selection direct and free of removed comparison infrastructure.");
}

const traceContractDoc = read("docs/trace-contract.md");
for (const needle of [
  "machine-local artifacts",
  "`.oc_harness/`",
  "Trace Schema Version 2",
  "Version 1 Read Compatibility",
  "`run.json`",
  "events.jsonl",
  "context-receipts.jsonl",
  "verification.json",
  "outcome.json",
  "`run_id`",
  "`event_id`",
  "`sequence`",
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
  "`hypothesis`",
  "`expected_observation`",
  "`actual_observation`",
  "`context_snapshot`",
  "`verifier_codes`",
  "`strategy_id`",
  "must not persist secrets",
  "raw private logs",
  ".env",
  "full source dumps",
  "host adapter",
  "`NUL.txt`",
  "stale `.tmp` remnants",
  "```jsonl",
]) {
  assertIncludes(traceContractDoc, needle, "docs/trace-contract.md", "HARNESS-S065", "Keep the trace contract portable, safe, and aligned with termination policy.");
}
assertNotIncludes(traceContractDoc, "C:/work/example", "docs/trace-contract.md", "HARNESS-S065", "Fake traces should model relative paths rather than normalize private absolute paths.");

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
  "Trace contract and operational run store (schema v2)",
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
for (const needle of [
  "Installed quality surfaces",
  "explicit API probe",
  "runtime-hook verifier",
  "host discovery",
  "callback invocation",
  "child-task causality",
  "effective adopted permissions",
  "Native Bash is disabled",
  "host-wide OS sandbox",
]) {
  assertIncludes(harnessMapDoc, needle, "docs/harness-map.md", "HARNESS-S068", "Keep installed API, runtime-hook, Bash, and OS-sandbox claims within their exact evidence boundaries.");
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
function workflowJobBlock(jobId) {
  const lines = workflow.split(/\r?\n/u);
  const escapedJobId = jobId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const start = lines.findIndex((line) => new RegExp(`^  ${escapedJobId}:\\s*$`, "u").test(line));
  if (start < 0) {
    fail("HARNESS-S002", `.github/workflows/verify.yml is missing the ${jobId} job`, "Restore the required workflow job.");
    return "";
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*$/u.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

for (const needle of [
  "pull_request:", "workflow_dispatch:", "npm run verify", "actions/setup-node@v4", "Harness verification",
  "linux-containment:", "windows-containment:", "ubuntu-latest", "windows-latest",
  "OPENCODE_QUALITY_CGROUP_ROOT", "OPENCODE_QUALITY_CGROUP_ATTACH_MODE=sudo-helper-v1",
  "OPENCODE_QUALITY_CGROUP_ATTACH_HELPER", "opencode-quality-workload/cgroup.procs",
  "expected_uid", "SUDO_UID", "npm run milestone:2:operational",
  "npm run milestone:2:assess", "--host-unavailable", "actions/upload-artifact@v4",
  "actions/download-artifact@v4", "sudo useradd", "attach helper can write the guard cgroup",
  "sudo setfacl -m", "sudo setfacl -x",
  "Harden trusted Node distribution permissions", "-exec chmod go-w {} +", "-perm /022",
  '${OPENCODE_QUALITY_RUN_USER:-}',
  "Require successful receipt producers", "needs.verify.result", "needs.linux-containment.result",
  "needs.windows-containment.result", '[[ "$result" != "success" ]]',
]) {
  assertIncludes(workflow, needle, ".github/workflows/verify.yml");
}
for (const [needle, expected] of [
  ["sudo setfacl -m", 2],
  ["sudo setfacl -x", 2],
  ["Harden trusted Node distribution permissions", 2],
  ["-exec chmod go-w {} +", 2],
  ['if [[ -n "${OPENCODE_QUALITY_RUN_USER:-}" ]]', 2],
]) {
  if (workflow.split(needle).length - 1 !== expected) {
    fail(
      "HARNESS-S002",
      `.github/workflows/verify.yml must contain exactly ${expected} ${needle} operations`,
      "Grant and remove checkout-parent traversal ACLs once in each unprivileged Linux producer job.",
    );
  }
}
const aggregateJob = workflowJobBlock("milestone-2-status");
const aggregateStepNames = [...aggregateJob.matchAll(/^      - name:\s*(.+?)\s*$/gmu)].map((match) => match[1]);
const producerResultGate = aggregateJob.indexOf("Require successful receipt producers");
const receiptDownload = aggregateJob.indexOf("Download milestone receipt bundles");
const receiptAggregation = aggregateJob.indexOf("Aggregate real execution receipts");
if (aggregateStepNames[0] !== "Require successful receipt producers"
  || producerResultGate < 0 || receiptDownload <= producerResultGate || receiptAggregation <= receiptDownload) {
  fail(
    "HARNESS-S002",
    ".github/workflows/verify.yml milestone-2-status must reject failed receipt-producing jobs before any artifact handling",
    "Keep the needs.*.result gate as the first milestone-2-status step, ahead of checkout, download, and aggregation.",
  );
}
for (const needle of [
  "VERIFY_RESULT: ${{ needs.verify.result }}",
  "LINUX_RESULT: ${{ needs.linux-containment.result }}",
  "WINDOWS_RESULT: ${{ needs.windows-containment.result }}",
  '[[ "$result" != "success" ]]',
]) {
  assertIncludes(
    aggregateJob,
    needle,
    ".github/workflows/verify.yml milestone-2-status job",
    "HARNESS-S002",
    "Keep the producer-conclusion gate scoped to the aggregate job.",
  );
}
for (const producerJobId of ["verify", "linux-containment", "windows-containment"]) {
  assertNotIncludes(
    workflowJobBlock(producerJobId),
    "Require successful receipt producers",
    `.github/workflows/verify.yml ${producerJobId} job`,
    "HARNESS-S003",
    "Producer jobs cannot read their own needs result; keep the gate in milestone-2-status.",
  );
}
const cgroupShellMigration = 'echo "$$" | sudo tee "$OPENCODE_QUALITY_CGROUP_ROOT/cgroup.procs" > /dev/null';
if (workflow.includes(cgroupShellMigration)) {
  fail(
    "HARNESS-S002",
    ".github/workflows/verify.yml must keep coordinators outside the exclusive delegated cgroup root",
    "Attach only idle managed workers through the fixed narrow helper; never move the workflow shell into the kill boundary.",
  );
}
if (workflow.split("npm run milestone:2:operational").length - 1 !== 2) {
  fail(
    "HARNESS-S002",
    ".github/workflows/verify.yml must produce exactly one Windows and one Linux operational receipt bundle",
    "Keep platform execution in the runner-owned operational wrapper and aggregate both artifacts.",
  );
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
assertIncludes(architectAgent, "`risk_class`: `standard-lite` | `high` | `critical`", "agents/architect.md", "HARNESS-S053", "Keep architect output aligned with the computational dossier schema.");
assertNotIncludes(architectAgent, "`risk_class`: standard | high | critical", "agents/architect.md", "HARNESS-S053", "Do not reuse the legacy operational trace standard label for the dossier.");

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
for (const needle of ["`0.3.0`", "Unreleased target", "`v0.2.0`", "Latest tagged release", "no package exports", "opencode-recursive-context", "opencode-learning-guard"]) {
  assertIncludes(compatibilityDoc, needle, "docs/compatibility.md");
}

const evaluationDoc = read("docs/evaluation.md");
for (const needle of ["verify:drift", "verify:runtime", "verify:runtime:fixture", "verify:live-eval", "contract/config evaluation", "Optional general live regression evaluation", "Harness Control Map", "path-boundary sensor", "trace-contract", "budgeted-termination", "subagent-result-schema", "adversarial-fixtures", "static behavior contracts", 'BASELINE_ROOT="/absolute/path/to/baseline"', 'CANDIDATE_ROOT="/absolute/path/to/candidate"', "absolute JSON path", "explicit, validated", "model-neutral runner/session artifact bundle", "standalone self-described outcome or report is never", "production `eval:live` entrypoint keeps the generic", "canonical", "runner-integrated verification"]) {
  assertIncludes(evaluationDoc, needle, "docs/evaluation.md");
}

const releaseDoc = read("docs/release.md");
for (const needle of ["harness-release-review", "guide/sensor coherence", "permission safety", "verify:live-eval", "OPENCODE_BASELINE_PROFILE", "OPENCODE_HARNESS_PROFILE", "defect", 'BASELINE_ROOT="/absolute/path/to/baseline"', 'CANDIDATE_ROOT="/absolute/path/to/candidate"', "absolute artifact path", "only a partial smoke", "must not be passed to `npm run assess:candidate`", "selector-free full run", "`development`, `held_out`, and `canary`"]) {
  assertIncludes(releaseDoc, needle, "docs/release.md");
}
const partialLiveRunIndex = releaseDoc.indexOf("npm run eval:live -- --suite development");
const fullLiveRunMatch = partialLiveRunIndex === -1
  ? null
  : /npm run eval:live\r?\n/u.exec(releaseDoc.slice(partialLiveRunIndex + 1));
const fullLiveRunIndex = fullLiveRunMatch
  ? partialLiveRunIndex + 1 + fullLiveRunMatch.index
  : -1;
const candidateAssessmentIndex = releaseDoc.indexOf("npm run assess:candidate", fullLiveRunIndex + 1);
if (partialLiveRunIndex === -1 || fullLiveRunIndex === -1 || candidateAssessmentIndex === -1) {
  fail("HARNESS-S057", "release decision recipe must run a selector-free full live evaluation after the development smoke and before candidate assessment", "Keep partial smoke evidence out of the development + held_out + canary acceptance decision.");
}

const adoptionDoc = read("docs/adoption.md");
for (const needle of ["docs/harnessability.md", "npm run verify:runtime", "npm run verify:adoption-bundle", "fixtures/sample-project/", "fixtures/live/", "Harnessability", "Post-Adoption Confidence Levels", "fault injection", "portable-adoption-bundle:start", ".opencode/plugins/engineering-dossier.mjs", ".opencode/quality/checks.json", "lib/feedback", "lib/quality", "opencode-harness/feedback", "opencode-harness/quality", "opencode-harness/quality-plugin", "Do not copy the whole `.opencode/` directory"]) {
  assertIncludes(adoptionDoc, needle, "docs/adoption.md");
}

const adoptionBundleVerifier = read("scripts/verify-adoption-bundle.mjs");
for (const needle of [
  '"evals"',
  '"fixtures"',
  '"lib/feedback"',
  '"lib/quality"',
  '"package.json"',
  '"scripts"',
  '"fixtures/live"',
  '"fixtures/sample-project"',
  '"opencode-harness/feedback"',
  '"opencode-harness/quality"',
  '"opencode-harness/quality-plugin"',
  '".opencode/quality/checks.json"',
  "documentedAdoptionEntries",
  "assertPortableAdoptionDeclaration",
  '".opencode/node_modules"',
  '".opencode/package.json"',
  '"scripts/evaluate-live.mjs", "--self-test-buffered"',
  "runManagedCommand",
  "deterministicContainmentFactory",
  "injected-test-only",
]) {
  assertIncludes(adoptionBundleVerifier, needle, "scripts/verify-adoption-bundle.mjs", "HARNESS-S082", "Keep the portable adoption bundle and its no-provider temp-copy smoke complete.");
}
const injectedTestContainment = read("scripts/injected-test-containment.mjs");
for (const needle of [
  "createInjectedTestContainmentFactory",
  "injected test containment kind is invalid",
  "process close confirmation remains authoritative",
]) {
  assertIncludes(injectedTestContainment, needle, "scripts/injected-test-containment.mjs", "HARNESS-S082", "Injected deterministic containment must remain explicitly test-only and wait for the production close confirmation path.");
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
  "OPENCODE_LIVE_EVAL_ADAPTER",
  "OPENCODE_BASELINE_PROFILE",
  "OPENCODE_HARNESS_PROFILE",
  "publicScenarioForAdapter",
  "loadScenarioCorpus",
  "selectScenarios",
  "runScenarioProfile",
  "profile_role",
  "profile_fingerprint",
  "runAdapterModule",
  "AdapterTimeoutError",
  "createTraceStore",
  "createBufferedStore",
  "commitBufferedRun",
  "createAdapterInstrumentation",
  "createReportHistory",
  "validateLiveReport",
  "evaluateTraceAssertions",
  "stageHiddenFiles",
  "hidden_check_files",
  "hidden_trace_assertions",
  "setup_results",
  "visible_results",
  "hidden_results",
  "visible_pass_rate",
  "hidden_pass_rate",
  "defect_escape_rate",
  "stdout_chars",
  "stderr_chars",
  "adapterFailureReason",
  "adapter_success_unavailable",
  "infrastructure_self_test",
  "deterministicSelfTestMode",
  "injected-live-eval-test-containment-v1",
  "deterministicSelfTestContainmentFactory",
  "HIDDEN_STAGED_AFTER_ADAPTER",
  "LIVE_TRACE_ASSERTIONS",
  "task_start",
  "fixture_preparation",
  "setup_verification",
  "adapter_invocation",
  "adapter_result",
  "visible_check",
  "hidden_staging",
  "hidden_check",
  "task_end",
  "--validate",
  "--self-test",
  "--self-test-buffered",
  "--suite",
  "--scenario",
]) {
  assertIncludes(liveEvalScript, needle, "scripts/evaluate-live.mjs");
}
assertNotIncludes(liveEvalScript, "setup_source", "scripts/evaluate-live.mjs", "HARNESS-S058", "Keep live-eval validation aligned with the implemented repo_fixture runner.");
assertNotIncludes(liveEvalScript, "fake live success", "scripts/evaluate-live.mjs", "HARNESS-S058", "Do not add fake live success support to the live-eval runner.");

const runtimeVerifier = read("scripts/verify-runtime.mjs");
for (const needle of ["task.*", "`task.${agent}`", "\"general\"", "HARNESS-R017", "HARNESS-R018"]) {
  assertIncludes(runtimeVerifier, needle, "scripts/verify-runtime.mjs", "HARNESS-S059", "Runtime verification must prove review-orchestrator task delegation boundaries.");
}
for (const needle of ["--evidence-profile", "--subject-evidence", "runtimePermissionSnapshot", "subject_fingerprint", "runtime_fingerprint", "surface_fingerprint", "profile_fingerprint", "incomplete_scopes", "collectResolvedPermissionSurface", "installed_runtime", "fixture", "Permission evidence written"]) {
  assertIncludes(runtimeVerifier, needle, "scripts/verify-runtime.mjs", "HARNESS-S059", "Runtime verification should optionally emit strict permission evidence without raw debug output.");
}
for (const needle of ['["agent", "list"]', "parseAgentInventory", "installedAgentInventory", "requiredAgentModes", "agentInventory", "HARNESS-R022", "HARNESS-R023", "HARNESS-R024"]) {
  assertIncludes(runtimeVerifier, needle, "scripts/verify-runtime.mjs", "HARNESS-S059", "Runtime verification must inventory every installed agent and fail closed on incomplete inventory.");
}
const qualityRuntimeVerifier = read("scripts/verify-normal-session-runtime.mjs");
for (const needle of ["--adapter", "--evidence", "QUALITY_HOST_EVIDENCE_TRUST_REQUIRED", "createProbeWorkspace", "randomBytes", "expectedFinalWorkspaceFingerprint", "diffContentBoundWorkspaces", "QUALITY_HOST_UNEXPECTED_WORKSPACE_EFFECT", "normalSessionRuntimeSourceFingerprint(root)", "trusted_adapter", "blocked_external_state"]) {
  assertIncludes(qualityRuntimeVerifier, needle, "scripts/verify-normal-session-runtime.mjs", "HARNESS-S059", "Real host verification must use a trusted adapter, fresh nonce, independently observed workspace effects, and honest external-state classification.");
}
const qualityApiProbe = read("scripts/probe-normal-session-plugin-api.mjs");
for (const needle of ["@opencode-ai", "chat.message", "tool.execute.before", "unclassified_edit_denied", "unclassified_mutating_bash_denied", "classifyQualityPluginApiProbe"]) {
  assertIncludes(qualityApiProbe, needle, "scripts/probe-normal-session-plugin-api.mjs", "HARNESS-S059", "Factory/API compatibility must remain separate from real host E2E evidence.");
}

const runtimeFixtureVerifier = read("scripts/verify-runtime-fixtures.mjs");
for (const needle of ["HARNESS-R017", "HARNESS-R018", "task.*", "task.explore", "task.reviewer", "task.researcher", "task.verifier", "task.general", "task.architect", "task.diagnose", "task.improver"]) {
  assertIncludes(runtimeFixtureVerifier, needle, "scripts/verify-runtime-fixtures.mjs", "HARNESS-S060", "Runtime fixtures must cover review-orchestrator task delegation boundaries.");
}
for (const needle of ["external_directory", "config.bash.", "unknown permission actions", "incomplete_scopes", "--subject-evidence"]) {
  assertIncludes(runtimeFixtureVerifier, needle, "scripts/verify-runtime-fixtures.mjs", "HARNESS-S060", "Runtime fixtures must prove complete permission extraction and explicit incomplete evidence.");
}
const qualityRuntimeFixtures = read("scripts/verify-normal-session-runtime-fixtures.mjs");
for (const needle of [
  "QUALITY_HOST_PLUGIN_NOT_DISCOVERED", "QUALITY_HOST_HOOK_MISSING_CHAT_MESSAGE",
  "QUALITY_HOST_HOOK_NOT_INVOKED_TOOL_EXECUTE_AFTER", "QUALITY_HOST_PROBE_FILE_CHANGED",
  "QUALITY_HOST_PERMISSION_MISMATCH", "QUALITY_HOST_RAW_OUTPUT_PERSISTED",
  "QUALITY_HOST_SCENARIO_CONTRACT_MISMATCH", "QUALITY_HOST_SCENARIO_ORDER_MISMATCH",
  "QUALITY_HOST_SCENARIO_CODE_MISMATCH", "QUALITY_HOST_SCENARIO_STATUS_MISMATCH",
  "QUALITY_HOST_SCENARIO_PATH_MISMATCH", "QUALITY_HOST_SCENARIO_CAPABILITY_MISMATCH",
  "QUALITY_HOST_SCENARIO_CALL_MISMATCH", "QUALITY_HOST_SCENARIO_WORKSPACE_MISMATCH",
  "QUALITY_HOST_SCENARIO_RECEIPT_MISMATCH", "QUALITY_HOST_SCENARIO_ATTESTATION_MISMATCH",
  "QUALITY_HOST_SCENARIO_RUN_BINDING_MISMATCH", "QUALITY_HOST_SCENARIO_PREVIOUS_MISMATCH",
  "QUALITY_HOST_EVIDENCE_STALE", "QUALITY_HOST_EVIDENCE_SOURCE_MISMATCH",
  "QUALITY_HOST_EVIDENCE_WORKSPACE_MISMATCH", "QUALITY_HOST_EVIDENCE_FINAL_WORKSPACE_MISMATCH",
  "QUALITY_HOST_EVIDENCE_FINGERPRINT", "QUALITY_HOST_EVIDENCE_TRUST_REQUIRED",
  "scenario_contract", "observed_scenarios", "run_binding_fingerprint",
]) {
  assertIncludes(qualityRuntimeFixtures, needle, "scripts/verify-normal-session-runtime-fixtures.mjs", "HARNESS-S060", "Runtime v2 fixtures must cover all ten ordered scenarios plus missing, unsafe, stale, mismatched, and forged evidence.");
}
for (const needle of ["agent-list.txt", "unexpected-agent", "wrongRequiredModeFixture", "extraDangerousAgentFixture", "HARNESS-R022", "HARNESS-R023", "HARNESS-R024"]) {
  assertIncludes(runtimeFixtureVerifier, needle, "scripts/verify-runtime-fixtures.mjs", "HARNESS-S060", "Runtime fixtures must prove authoritative installed-agent discovery, extra-agent capture, and fail-closed inventory handling.");
}

const liveEvalReadme = read("evals/README.md");
assertIncludes(liveEvalReadme, 'BASELINE_ROOT="/absolute/path/to/baseline"', "evals/README.md", "HARNESS-S061", "Live-eval examples must identify the baseline evidence root explicitly.");
assertIncludes(liveEvalReadme, 'CANDIDATE_ROOT="/absolute/path/to/candidate"', "evals/README.md", "HARNESS-S061", "Live-eval examples must identify the candidate evidence root explicitly.");
assertIncludes(liveEvalReadme, "runner-only `workspace_policy`", "evals/README.md", "HARNESS-S061", "Live-eval README must document runner-owned mutation enforcement.");
assertIncludes(liveEvalReadme, "exact `relative_path`", "evals/README.md", "HARNESS-S061", "Live-eval README must document path-specific handoff receipts.");
assertIncludes(liveEvalReadme, "unexpected blocked or failed reason", "evals/README.md", "HARNESS-S061", "Live-eval README must document non-success termination semantics.");
assertIncludes(liveEvalReadme, "`repo_fixture`", "evals/README.md", "HARNESS-S061", "Live-eval README should document the implemented fixture source.");
assertIncludes(liveEvalReadme, "`hidden_check_files`", "evals/README.md", "HARNESS-S061", "Live-eval README should document runner-owned hidden check files.");
assertIncludes(liveEvalReadme, "rejects unsupported manifest fields", "evals/README.md", "HARNESS-S061", "Live-eval README should document unsupported-field rejection.");
assertIncludes(liveEvalReadme, "Adapters must return", "evals/README.md", "HARNESS-S061", "Live-eval README should document explicit adapter success.");
assertIncludes(liveEvalReadme, "explicit success", "evals/README.md", "HARNESS-S061", "Live-eval README should document explicit adapter success.");
assertIncludes(liveEvalReadme, "separate isolated repo copies", "evals/README.md", "HARNESS-S061", "Live-eval README should document baseline/harness isolation.");
assertIncludes(liveEvalReadme, "command status/exit metadata", "evals/README.md", "HARNESS-S061", "Live-eval README should document report sanitization.");
assertIncludes(liveEvalReadme, "raw command stdout/stderr", "evals/README.md", "HARNESS-S061", "Live-eval README should document command output sanitization.");
assertIncludes(liveEvalReadme, "relative allowlisted", "evals/README.md", "HARNESS-S061", "Live-eval README should document narrow fixture scope.");
assertIncludes(liveEvalReadme, "repository root", "evals/README.md", "HARNESS-S061", "Live-eval README should document unsafe fixture scopes.");
assertIncludes(liveEvalReadme, "trace/report directories", "evals/README.md", "HARNESS-S061", "Live-eval README should document runner-owned directory exclusions.");
assertIncludes(liveEvalReadme, "staged only into absent target paths", "evals/README.md", "HARNESS-S061", "Live-eval README should document hidden check target collision prevention.");
assertIncludes(liveEvalReadme, "allowlisted sanitized model/tool/cost", "evals/README.md", "HARNESS-S061", "Live-eval README should document the implemented adapter metadata allowlist.");
assertIncludes(liveEvalReadme, "OPENCODE_BASELINE_PERMISSION_EVIDENCE", "evals/README.md", "HARNESS-S061", "Live-eval README should document content-bound profile evidence.");
assertIncludes(liveEvalReadme, "symlinks, junctions", "evals/README.md", "HARNESS-S061", "Live-eval README should document physical path confinement.");
assertIncludes(liveEvalReadme, "transcripts, prompts", "evals/README.md", "HARNESS-S061", "Live-eval README should document transcript and prompt exclusion.");
assertNotIncludes(liveEvalReadme, "setup source", "evals/README.md", "HARNESS-S061", "Do not document setup source until the runner supports it.");

const liveEvalSchema = read("evals/scenario.schema.json");
assertIncludes(liveEvalSchema, "\"additionalProperties\": false", "evals/scenario.schema.json", "HARNESS-S063", "Live-eval schema should reject unsupported manifest fields.");
assertIncludes(liveEvalSchema, "\"hidden_check_files\"", "evals/scenario.schema.json", "HARNESS-S063", "Live-eval schema should support runner-owned hidden check files.");
assertIncludes(liveEvalSchema, "\"hidden_trace_assertions\"", "evals/scenario.schema.json", "HARNESS-S063", "Live-eval schema should support runner-owned trace assertions.");
assertIncludes(liveEvalSchema, "\"review_finding_exists\"", "evals/scenario.schema.json", "HARNESS-S063", "Review and audit scenarios should require structured positive finding evidence.");
assertIncludes(liveEvalSchema, "\"failure_family\"", "evals/scenario.schema.json", "HARNESS-S063", "Behavioral scenarios should identify their distinct failure family.");

const liveEvalSuites = read("evals/suites.json");
for (const needle of ["\"development\"", "\"held_out\"", "\"canary\"", "\"infrastructure\"", "runner-self-test"]) {
  assertIncludes(liveEvalSuites, needle, "evals/suites.json", "HARNESS-S063", "Keep the versioned live-evaluation split complete.");
}
const acceptancePolicy = read("evals/acceptance-policy.json");
for (const needle of ["policy_version", "required_suites", "minimum_improvement", "expected_producer_ids"]) {
  assertIncludes(acceptancePolicy, needle, "evals/acceptance-policy.json", "HARNESS-S063", "Keep candidate acceptance policy explicit and versioned.");
}

const liveEvalSelfTestScenario = read("evals/scenarios/runner-self-test.json");
assertIncludes(liveEvalSelfTestScenario, "\"hidden_check_files\"", "evals/scenarios/runner-self-test.json", "HARNESS-S064", "Live-eval self-test scenario should exercise hidden file staging.");
assertIncludes(liveEvalSelfTestScenario, "evals/hidden/runner-self-test/hidden.test.js", "evals/scenarios/runner-self-test.json", "HARNESS-S064", "Hidden check fixture should live outside the public repo fixture.");
assertIncludes(liveEvalSelfTestScenario, "\"hidden_trace_assertions\"", "evals/scenarios/runner-self-test.json", "HARNESS-S064", "Infrastructure self-test should exercise trace assertions without an LLM.");

const traceStore = read("lib/feedback/trace-store.mjs");
for (const needle of [
  "TRACE_SCHEMA_VERSION",
  "events.jsonl",
  "context-receipts.jsonl",
  "verification.json",
  "outcome.json",
  "createRun",
  "appendEvent",
  "recordContextReceipt",
  "createJob",
  "completeJob",
  "recordVerification",
  "finalizeRun",
  "inspectRun",
  "legacy_events_present",
  "TRACE_SEQUENCE",
  "TRACE_FINALIZED",
  "DEFAULT_TRACE_STORE_LIMITS",
  "TRACE_QUOTA_TOTAL_BYTES",
  "TRACE_TASK_END_REQUIRED",
  "finding_id",
  "createBufferedTraceStore",
  "commitBufferedRun",
  "materializeBufferedSnapshot",
]) {
  assertIncludes(traceStore, needle, "lib/feedback/trace-store.mjs", "HARNESS-S076", "Keep the operational trace store complete and fail-closed.");
}

const privacyModule = read("lib/feedback/privacy.mjs");
for (const needle of ["secretAssignmentPattern", "providerTokenPattern", "github_pat_", "path.win32.isAbsolute", "path.posix.isAbsolute", "assertSafePersistenceId", "assertPersistenceSafe", "PRIVACY_FORBIDDEN_FIELD", "original_length", "stored_length"]) {
  assertIncludes(privacyModule, needle, "lib/feedback/privacy.mjs", "HARNESS-S077", "Keep redaction, cross-platform paths, strict fields, and truncation metadata centralized.");
}

const reportHistory = read("lib/feedback/report-history.mjs");
for (const needle of ["workspaceRoot", "publishImmutableSet", "complete.json", "latest.json", "latest.md", "latest.complete.json", "report_fingerprint", "json_text_fingerprint", "markdown_fingerprint", "inspectLatest"]) {
  assertIncludes(reportHistory, needle, "lib/feedback/report-history.mjs", "HARNESS-S078", "Immutable report history needs authoritative completion markers and convenience latest files.");
}

const adapterWorker = read("lib/feedback/adapter-worker.mjs");
for (const needle of ["spawn", "./process-tree.mjs", "prepareProcessContainment", "terminateProcessTree", "releaseUnverifiedChild", "adapter_teardown_unverified", "traceLimits", "trace_request", "payload_json", "result_json", "encodePlainJson", "AdapterTimeoutError", "containmentSetupTimeoutMs", "adapter_process_containment_timeout", "adapter_working_directory_changed", "workingDirectoryIdentity", "currentWorkingDirectoryIdentity"]) {
  assertIncludes(adapterWorker, needle, "lib/feedback/adapter-worker.mjs", "HARNESS-S079", "Live adapters must use bounded trace RPC and verified process-tree teardown.");
}
assertIncludes(adapterWorker, "containmentSetupTimeoutMs = 30_000", "lib/feedback/adapter-worker.mjs", "HARNESS-S079", "Cold Windows Job Object startup must remain bounded without using the command deadline.");

const adapterWorkerVerifier = read("scripts/verify-adapter-worker.mjs");
for (const needle of [
  "injectedTestContainmentFactory",
  "operationalContainmentAvailable",
  "runAdapterModuleProduction",
  "runManagedCommandProduction",
]) {
  assertIncludes(adapterWorkerVerifier, needle, "scripts/verify-adapter-worker.mjs", "HARNESS-S079", "Deterministic adapter checks must not synthesize platform evidence while operational descendant checks keep the production boundary.");
}

const processTree = read("lib/feedback/process-tree.mjs");
for (const needle of ["taskkill.exe", "process.kill(-pid", "terminateProcessTree", "releaseUnverifiedChild", "runManagedCommand", "ProcessTreeTeardownError", "containmentSetupTimeoutMs", "process_containment_setup_timeout", "observeLateProcessContainment", "expected_working_directory_identity", "assertManagedCommandWorkingDirectoryIdentityCurrent", "assertInheritedManagedCommandWorkingDirectoryIdentityCurrent", "PROCESS_WORKING_DIRECTORY_CHANGED"]) {
  assertIncludes(processTree, needle, "lib/feedback/process-tree.mjs", "HARNESS-S079", "Keep Windows/POSIX process-tree teardown and managed command settlement centralized.");
}
assertIncludes(processTree, "containmentSetupTimeoutMs = 30_000", "lib/feedback/process-tree.mjs", "HARNESS-S079", "Cold containment startup must remain separately bounded from command execution.");
const processContainment = read("lib/feedback/process-containment.mjs");
assertIncludes(processContainment, "Math.max(timeoutMs, 30_000)", "lib/feedback/process-containment.mjs", "HARNESS-S079", "The Windows Job Object controller must share the bounded cold-start allowance instead of failing at the former ten-second floor.");
const containedWorkerStart = processTree.indexOf("const COMMAND_WORKER_SOURCE");
const containedToolchainCheck = processTree.indexOf(
  "assertTrustedToolchainInvocationCurrent(input.expected_invocation);",
  containedWorkerStart,
);
const containedCommandBinding = processTree.indexOf(
  "assertTrustedToolchainCommandBinding(input.expected_invocation, input.file, input.args);",
  containedToolchainCheck,
);
const finalCwdIdentityCheck = processTree.indexOf(
  "assertInheritedManagedCommandWorkingDirectoryIdentityCurrent(",
  containedCommandBinding,
);
const containedCommandSpawn = processTree.indexOf("commandChild = spawn(input.file", finalCwdIdentityCheck);
const containedCommandSpawnEnd = processTree.indexOf('send({ type: "spawned"', containedCommandSpawn);
if (containedToolchainCheck < 0
  || containedCommandBinding <= containedToolchainCheck
  || finalCwdIdentityCheck <= containedCommandBinding
  || containedCommandSpawn <= finalCwdIdentityCheck
  || containedCommandSpawnEnd <= containedCommandSpawn
  || processTree.slice(containedCommandSpawn, containedCommandSpawnEnd).includes("cwd: input.cwd")) {
  fail(
    "HARNESS-S079",
    "contained managed commands must revalidate toolchain identity, then inherited cwd identity, without reopening cwd at spawn",
    "Keep the inherited cwd assertion last and omit cwd from the contained command spawn.",
  );
}
const defaultCommandFactory = processTree.indexOf("function defaultCommandProcessFactory(input)");
const defaultFactoryCwdCheck = processTree.indexOf(
  "assertManagedCommandWorkingDirectoryIdentityCurrent(",
  defaultCommandFactory,
);
const defaultFactorySpawn = processTree.indexOf("return spawn(process.execPath", defaultFactoryCwdCheck);
const defaultFactoryCwdOpen = processTree.indexOf("cwd: input.cwd", defaultFactorySpawn);
if (defaultCommandFactory < 0
  || defaultFactoryCwdCheck <= defaultCommandFactory
  || defaultFactorySpawn <= defaultFactoryCwdCheck
  || defaultFactoryCwdOpen <= defaultFactorySpawn) {
  fail(
    "HARNESS-S079",
    "managed command worker must open the freshly revalidated cwd before containment setup",
    "Bind default worker creation to input.cwd immediately after the parent-side identity check.",
  );
}
const beforeCommandStartHook = processTree.indexOf("beforeCommandStart?.();", defaultFactoryCwdOpen);
const managedWorkerInitialize = processTree.indexOf('type: "initialize"', beforeCommandStartHook);
if (beforeCommandStartHook < 0
  || managedWorkerInitialize <= beforeCommandStartHook
  || processTree.slice(beforeCommandStartHook, managedWorkerInitialize)
    .includes("assertManagedCommandWorkingDirectoryIdentityCurrent(cwd")) {
  fail(
    "HARNESS-S079",
    "managed command initialization must not reopen a pathname after the worker inherited the verified cwd",
    "Keep pathname validation before worker spawn and the final directory-object validation inside the contained worker.",
  );
}

const trustedToolchains = read("lib/quality/trusted-toolchains.mjs");
for (const needle of [
  "org.gradle.projectcachedir",
  "org.gradle.jvmargs",
  "cannot use Java argument files",
  "mavenControlPlan",
  "maven_control_user_settings",
  "maven_project_extensions",
  "maven_user_extensions",
  "maven_project_config",
  "maven_project_system_properties",
  "maven_user_system_properties",
  "maven-system.properties",
  "maven-user.properties",
  "maven.user.extensions",
  "maven.user.settings",
  "maven.user.toolchains",
  "maven.project.extensions",
  "maven.project.conf",
  "maven.project.settings",
  "maven.user.conf",
  "maven.installation.conf",
  "maven.installation.extensions",
  "maven.installation.settings",
  "maven.installation.toolchains",
  "maven.settings.security",
  "maven.repo.local.head",
  "maven.repo.local.tail",
  "projectConfigurationAncestors",
  "gradle_project_properties_",
  "gradle_user_properties",
  "gradle_user_init_directory",
  "gradle_installation_properties",
  'subdirectories: ["lib", "init.d"]',
  "runtime_metadata_fingerprint",
  "managed_worker_executable_path",
  "managed_worker_identity_fingerprint",
  "implicit_configuration",
]) {
  assertIncludes(trustedToolchains, needle, "lib/quality/trusted-toolchains.mjs", "HARNESS-S079", "Trusted Maven and Gradle launches must close direct and implicit resolver-override channels.");
}
assertIncludes(
  read("lib/quality/trusted-toolchain-host-config.mjs"),
  'TRUSTED_TOOLCHAIN_RESOLUTION_POLICY_VERSION = "trusted-toolchain-resolution-v4"',
  "lib/quality/trusted-toolchain-host-config.mjs",
  "HARNESS-S079",
  "Semantic toolchain-resolution changes must invalidate v3 receipts.",
);
const trustedProjectRunner = read("lib/quality/trusted-project-runner.mjs");
for (const needle of [
  "TRUSTED_PROJECT_CHECK_RECEIPT_SCHEMA_VERSION = 3",
  'TRUSTED_PROJECT_CHECK_PRODUCER = "opencode-harness/trusted-project-runner-v3"',
  'TRUSTED_PROJECT_EXECUTION_POLICY_VERSION = "trusted-project-execution-v5"',
  "managed_worker_executable_path",
  "toolchain_runtime_metadata_fingerprint",
  "workingDirectoryIdentityFingerprint",
  "expectedWorkingDirectoryIdentity",
]) {
  assertIncludes(
    trustedProjectRunner,
    needle,
    "lib/quality/trusted-project-runner.mjs",
    "HARNESS-S079",
    "Trusted receipts must bind policy-v4 runtime metadata, the managed worker, and cwd identity.",
  );
}
assertIncludes(
  read("lib/quality/normal-session-bridge.mjs"),
  "toolchain_runtime_metadata_fingerprint",
  "lib/quality/normal-session-bridge.mjs",
  "HARNESS-S079",
  "Normal-session receipt persistence must retain toolchain runtime metadata identity.",
);

const milestoneRunContext = read("lib/quality/milestone-run-context.mjs");
for (const needle of [
  "observeContentBoundWorkspaceWithSourceAttestation",
  "source_attestation_fingerprint",
  "assertMilestone2RunContextStable",
  "MILESTONE_SOURCE_CHANGED_DURING_RUN",
  "milestone2SourceStabilityFingerprint",
  "milestone2SharedRunFingerprint",
]) {
  assertIncludes(milestoneRunContext, needle, "lib/quality/milestone-run-context.mjs", "HARNESS-S079", "Milestone receipt provenance must bind portable source state and re-observe before sealing.");
}
assertNotIncludes(
  milestoneRunContext,
  "expected.workspace_fingerprint !== current.workspace_fingerprint",
  "lib/quality/milestone-run-context.mjs",
  "HARNESS-S079",
  "Do not treat machine-local Git index identity refresh as a portable source mutation.",
);
for (const file of [
  "scripts/verify-all.mjs",
  "scripts/run-milestone-2-operational.mjs",
  "scripts/verify-normal-session-runtime.mjs",
]) {
  assertIncludes(read(file), "assertMilestone2RunContextStable", file, "HARNESS-S079", "Every Milestone 2 producer must re-observe source state before sealing evidence.");
}
const operationalRunner = read("scripts/run-milestone-2-operational.mjs");
for (const needle of ["canonicalTempBase", "fs.realpathSync.native(os.tmpdir())", "fs.realpathSync.native(fs.mkdtempSync("]) {
  assertIncludes(operationalRunner, needle, "scripts/run-milestone-2-operational.mjs", "HARNESS-S079", "Operational child reports must use a canonical temp directory on hosts that expose an aliased TEMP path.");
}

const acceptanceEngine = read("lib/feedback/acceptance.mjs");
for (const needle of [
  "accepted",
  "rejected",
  "inconclusive",
  "STATIC_VERIFICATION_FAILED",
  "PERMISSION_SURFACE_WIDENED",
  "CANARY_REGRESSION",
  "HELD_OUT_REGRESSION",
  "NEW_HIDDEN_CHECK_FAILURE",
  "TARGET_IMPROVEMENT_BELOW_THRESHOLD",
  "COST_CEILING_EXCEEDED",
  "DURATION_CEILING_EXCEEDED",
  "evidence_identity",
  "repository_fingerprint",
  "profile_fingerprint",
  "MISMATCHED_BASELINE_EVIDENCE_FINGERPRINT",
  "MISMATCHED_CANDIDATE_EVIDENCE_FINGERPRINT",
  "scenarioRepetitionKey",
  "UNTRUSTED_LIVE_REPORT",
  "scenario_corpus_fingerprint",
  "pair_universe_fingerprint",
  "artifact_attestation_fingerprint",
  "canonicalScenarios",
]) {
  assertIncludes(acceptanceEngine, needle, "lib/feedback/acceptance.mjs", "HARNESS-S080", "Candidate decisions must preserve strict non-scalar hard gates and stable pairing.");
}

const evidenceModule = read("lib/feedback/evidence.mjs");
for (const needle of ["repositoryStateFingerprint", "materializeRepositorySnapshot", "verifyIntegrity", "runtimeOutputsFingerprint", "agentInventory", "permissionProfileFingerprint"]) {
  assertIncludes(evidenceModule, needle, "lib/feedback/evidence.mjs", "HARNESS-S081", "Evidence identity must use shared content-derived fingerprints.");
}
const permissionSurfaceModule = read("lib/feedback/permission-surface.mjs");
for (const needle of ["new Map", "extractPermissionSurface", "collectResolvedPermissionSurface", "unknown_action", "incomplete_scopes"]) {
  assertIncludes(permissionSurfaceModule, needle, "lib/feedback/permission-surface.mjs", "HARNESS-S081", "Permission evidence must parse the complete surface or remain explicitly incomplete.");
}

const changelog = read("CHANGELOG.md");
assertIncludes(changelog, "## Unreleased (target: 0.3.0)", "CHANGELOG.md");
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
