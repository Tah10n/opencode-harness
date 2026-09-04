#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateConfig, validateCheck } from "./config.mjs";
import { command } from "./process.mjs";
import { resolveImage, sandboxCommand } from "./sandbox.mjs";
import { inspectWorkspace, createCandidate, snapshotCandidate, checkScope, publishSnapshot, treeFingerprint, importDraft } from "./workspace.mjs";
import { createOpenCodeSession } from "./opencode.mjs";
import { runController } from "./controller.mjs";
import { runCheck } from "./checks.mjs";

function argumentsFor(argv) {
  const args = { command: argv.shift() };
  while (argv.length) {
    const arg = argv.shift();
    if (arg === "--") { args.task = argv.join(" "); break; }
    if (!["--workspace", "--model", "--variant", "--draft-patch", "--time-limit-ms"].includes(arg) || !argv.length) throw new Error("USAGE: opencode-harness run|doctor --workspace <repository> [--model provider/model] [--variant variant] [--draft-patch file] [--time-limit-ms milliseconds] -- <task>");
    args[arg.slice(2)] = argv.shift();
  }
  if (!["run", "doctor"].includes(args.command) || !args.workspace) throw new Error("USAGE: opencode-harness run|doctor --workspace <repository> -- <task>");
  if (args.command === "run" && !args.task?.trim()) throw new Error("TASK_REQUIRED");
  if (args["time-limit-ms"] !== undefined && (!/^\d+$/.test(args["time-limit-ms"]) || !Number.isSafeInteger(Number(args["time-limit-ms"])) || Number(args["time-limit-ms"]) < 1 || Number(args["time-limit-ms"]) > 2_147_483_647)) throw new Error("TIME_LIMIT_INVALID");
  return args;
}

async function main() {
  const args = argumentsFor(process.argv.slice(2));
  const original = await inspectWorkspace(args.workspace);
  const config = validateConfig(JSON.parse(fs.readFileSync(path.join(original.workspace, ".opencode-harness.json"), "utf8")));
  const image = await resolveImage(config.image);
  const help = await command(["opencode", "run", "--help"]);
  if (help.exitCode !== 0 || !["--format", "--session", "--dir", "--variant"].every((option) => (help.stdout + help.stderr).includes(option))) throw new Error("OPENCODE_CLI_UNSUPPORTED");
  const probe = await sandboxCommand({ image, workspace: original.workspace, argv: ["node", "-e", "process.stdout.write('runtime-ok')"] });
  if (probe.exitCode !== 0 || probe.stdout !== "runtime-ok") throw new Error(`SANDBOX_RUNTIME_UNAVAILABLE: ${probe.stderr}`);
  if (args.command === "doctor") {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), "verified-change-doctor-"));
    const baseline = await createCandidate(original, path.join(output, "baseline"));
    const checks = [];
    for (const check of config.checks) checks.push(await runCheck(check, { image, workspace: baseline }));
    const available = checks.every((check) => ["passed", "assertion_failed"].includes(check.status));
    console.log(JSON.stringify({ status: available ? "execution_path_checked" : "check_infrastructure_unavailable", head: original.head, image, checks,
      checked: ["clean_git", "configuration", "opencode_cli_options", "contained_node_runtime", "configured_project_checks"],
      unverified: ["model_access", "acceptance_author", "full_repair_cycle"] }, null, 2));
    if (!available) process.exitCode = 2;
    return;
  }
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "verified-change-run-"));
  fs.chmodSync(output, 0o700);
  console.error(`Private run artifacts: ${output}`);
  const abort = new AbortController();
  let deadlineExceeded = false;
  const deadline = args["time-limit-ms"] ? setTimeout(() => { deadlineExceeded = true; abort.abort(); }, Number(args["time-limit-ms"])) : null;
  const cancel = () => abort.abort();
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  const usage = [];
  let application = { applied: false };
  const record = (event) => fs.appendFileSync(path.join(output, "attempts.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n", { mode: 0o600 });
  const prompt = async (role, session, text, signal) => {
    record({ phase: "model_started", role });
    try {
      const summary = await session.prompt(text, signal);
      usage.push({ role, ...summary });
      record({ phase: "model_finished", role, ...summary });
    } catch (error) {
      record({ phase: "model_interrupted", role, error: error.message });
      throw error; // Never automatically resubmit an uncertain model request.
    }
  };
  try {
    const baseline = await createCandidate(original, path.join(output, "baseline"));
    const candidate = await createCandidate(original, path.join(output, "candidate"));
    const acceptance = path.join(output, "acceptance");
    fs.mkdirSync(acceptance);
    const contracts = { task: args.task };
    const instructions = [];
    for (const name of ["AGENTS.md", "WORKFLOW.md", "README.md"]) {
      const file = path.join(baseline, name);
      if (fs.existsSync(file)) {
        contracts[name] = fs.readFileSync(file, "utf8");
        instructions.push(`${name}:\n${contracts[name]}`);
      }
    }
    const sessionOptions = { model: args.model ?? config.model, variant: args.variant ?? config.variant, timeoutMs: config.sessionTimeoutMs };
    const author = await createOpenCodeSession({ ...sessionOptions, controlDirectory: path.join(output, "author-control"),
      sandbox: { image, workspace: baseline, readonly: true, extraMounts: [{ source: acceptance, target: "/acceptance", readonly: false }] } });
    const authorPrompt = `Prepare a small independent set of acceptance tests BEFORE implementation. You can read the initial repository at /workspace and its docs/tests. Only /acceptance is writable.\nTask:\n${args.task}\n\n${instructions.join("\n\n")}\n\nWrite Node built-in test runner files under /acceptance, importing candidate code from absolute /workspace paths. Use node:assert/strict. Use assertion errors (including assert.fail for bounded wait guards) for requirement violations, not generic Error. Do not use unbounded waits. Do not infer expected results from current implementation. Do not invent requirements or require a particular internal implementation: for example, correct cleanup does not require a positive addEventListener call count if another correct subscription mechanism is possible. Write /acceptance/manifest.json as a JSON array. Each entry: {id,kind:"node-test",files:["relative.test.mjs"],confidence:"unambiguous" or "ambiguous",basis:{source:"task" or "AGENTS.md" or "WORKFLOW.md" or "README.md",quote:"exact public requirement quote"}}. Prefer a separate file for each check. Never mix ambiguous assertions into a file used by an unambiguous check. Mark doubtful assertions ambiguous. You cannot see the future implementation. No more than 6 checks. Do not modify existing tests or source.`;
    await prompt("acceptance", author, authorPrompt, abort.signal);
    await prompt("acceptance_audit", author, "Audit your acceptance assertions before implementation. You still have only the original repository and request. For each asserted expectation, consider whether another reasonable interpretation of the request or another valid implementation would fail it. Mark such checks ambiguous in manifest.json rather than choosing your preferred interpretation. Check field precedence, defaults, timing and internal-observation assumptions particularly carefully. Keep test files self-contained apart from Node builtins and /workspace imports. Do not weaken a clearly stated requirement. Do not inspect or request a candidate solution. Update manifest.json if needed.", abort.signal);
    const acceptanceHash = treeFingerprint(acceptance); // Reject symlinks before host manifest reads.
    const hypotheses = JSON.parse(fs.readFileSync(path.join(acceptance, "manifest.json"), "utf8"));
    if (!Array.isArray(hypotheses) || hypotheses.length > 6) throw new Error("ACCEPTANCE_MANIFEST_INVALID");
    for (const hypothesis of hypotheses) {
      validateCheck(hypothesis);
      if (hypothesis.kind !== "node-test") throw new Error("ACCEPTANCE_KIND_INVALID");
      if (config.checks.some((check) => check.id === hypothesis.id)) throw new Error("ACCEPTANCE_ID_COLLIDES_WITH_EXISTING_CHECK");
    }
    const prepareChecks = (checks, name) => {
      const directory = path.join(output, name);
      fs.mkdirSync(directory);
      for (const check of checks.filter((c) => hypotheses.includes(c))) {
      for (const file of check.files) {
        const relative = check.cwd ? `${check.cwd}/${file}` : file;
        const target = path.join(directory, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (!fs.existsSync(target)) fs.copyFileSync(path.join(acceptance, relative), target);
      }
      }
      return directory;
    };
    const primary = await createOpenCodeSession({ ...sessionOptions, controlDirectory: path.join(output, "primary-control"),
      sandbox: { image, workspace: candidate, readonly: true, writablePaths: config.sourcePaths } });
    const host = {
      draft: async (task, signal) => {
        if (args["draft-patch"]) {
          // The author has completed against the original repository. Import
          // only now, without exposing the patch or its path to that session.
          const source = path.resolve(args["draft-patch"]);
          const stat = fs.lstatSync(source);
          if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error("DRAFT_PATCH_INVALID");
          const saved = path.join(output, "input-draft.patch");
          fs.copyFileSync(source, saved, fs.constants.COPYFILE_EXCL);
          fs.chmodSync(saved, 0o600);
          record({ phase: "draft_imported", fingerprint: await importDraft(candidate, saved, signal) });
          return;
        }
        await prompt("draft", primary, `Work on this task in /workspace using the isolated repository tools. Read relevant project instructions and consumers. Run available tests as needed. Authorized source paths: ${JSON.stringify(config.sourcePaths)}.\n\n${task}\n\n${instructions.join("\n\n")}`, signal);
      },
      snapshot: (name) => snapshotCandidate(candidate, output, name),
      scope: (snapshot) => checkScope(snapshot, baseline, config.sourcePaths),
      verify: async (snapshot, checks, signal) => {
        if (treeFingerprint(acceptance) !== acceptanceHash) throw new Error("ACCEPTANCE_CHANGED");
        const results = [];
        for (const check of checks) {
          const generated = hypotheses.includes(check);
          const result = await runCheck(check, { image, workspace: snapshot.directory,
            ...(generated ? { checkRoot: "/acceptance", extraMounts: [{ source: acceptance, target: "/acceptance" }] } : {}) }, signal);
          record({ phase: "check_finished", snapshot: snapshot.name, result });
          results.push(result);
          if (signal?.aborted) throw new DOMException("cancelled", "AbortError");
        }
        return results;
      },
      assess: async (diagnostics, signal) => {
        const directory = path.join(output, `assessment-${diagnostics.attempt}`);
        fs.mkdirSync(directory);
        primary.exposeAcceptedChecks(prepareChecks(diagnostics.checks, `assessment-checks-${diagnostics.attempt}`), { assessmentDirectory: directory });
        await prompt("assessment", primary, `Assess reproduced acceptance failures BEFORE changing code. Source is read-only in this turn. Read each failing test. A passing old implementation does not refute a clearly requested change. However, do not impose a test author's preferred interpretation when the original request permits alternatives. Write /assessment/decision.json as {"disputed":[]} if all listed expectations follow from the contract, or list {id,basis:{source,quote},reason} for disputed checks. Quote the original task or supplied public documentation, explain the competing valid interpretation, and never justify a dispute solely by what your candidate currently does. Only the listed acceptance IDs can be disputed; existing regressions cannot. Do not edit source or tests.\nOriginal task:\n${args.task}\n${instructions.join("\n\n")}\nReproduced failures:\n${JSON.stringify(diagnostics)}`, signal);
        if (treeFingerprint(candidate) !== diagnostics.snapshot.fingerprint) throw new Error("ASSESSMENT_MUTATED_SOURCE");
        const file = path.join(directory, "decision.json"), stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.size > 16_384) throw new Error("ASSESSMENT_FILE_INVALID");
        const decision = JSON.parse(fs.readFileSync(file, "utf8"));
        record({ phase: "assessment_finished", snapshot: diagnostics.snapshot.name, decision });
        return decision;
      },
      repair: async (diagnostics, signal) => {
        primary.exposeAcceptedChecks(prepareChecks(diagnostics.checks, `repair-checks-${diagnostics.attempt}`));
        await prompt("repair", primary, `Fix only the reproduced requirement failures below. The accepted test sources are now mounted read-only at /acceptance and their reporter at /harness/node-reporter.mjs. Read the failing test to identify its exact input and expectation, and reproduce the command in its reported cwd. Keep existing behavior and test expectations. Do not weaken checks. Inspect affected consumers.\n${JSON.stringify(diagnostics)}`, signal);
      },
    };
    const report = await runController({ task: args.task, checks: config.checks, hypotheses, contracts, host, signal: abort.signal });
    if (deadlineExceeded) report.stopReason = "timeout";
    report.base = original; report.usage = usage; report.output = output;
    report.timeLimitMs = args["time-limit-ms"] ? Number(args["time-limit-ms"]) : null;
    report.draftImported = Boolean(args["draft-patch"]);
    // Failed/unverified drafts remain downloadable patches, never automatic edits.
    report.application = report.stopReason === "checks_passed"
      ? await publishSnapshot(original, report.selected, abort.signal) : { applied: false, reason: report.stopReason };
    application = report.application;
    if (deadlineExceeded) report.stopReason = "timeout";
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
    if (report.stopReason !== "checks_passed" || !report.application.applied || report.application.cancelledAfterApplyStarted) process.exitCode = 2;
  } catch (error) {
    fs.writeFileSync(path.join(output, "error.json"), JSON.stringify({ error: error.message, usage, cancelled: abort.signal.aborted }), { mode: 0o600 });
    console.log(JSON.stringify({ stopReason: deadlineExceeded || error.message === "OPENCODE_SESSION_TIMEOUT" ? "timeout" : abort.signal.aborted ? "cancelled" : "execution_error",
      output, selectedPatch: fs.existsSync(path.join(output, "D0.patch")) ? path.join(output, "D0.patch") : null,
      diagnostics: path.join(output, "attempts.jsonl"), application }));
    throw error;
  } finally {
    if (deadline) clearTimeout(deadline);
    process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel);
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 2; });
