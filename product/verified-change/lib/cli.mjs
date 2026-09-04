#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateConfig, validateCheck } from "./config.mjs";
import { command } from "./process.mjs";
import { resolveImage, sandboxCommand } from "./sandbox.mjs";
import { inspectWorkspace, createCandidate, snapshotCandidate, checkScope, publishSnapshot, treeFingerprint } from "./workspace.mjs";
import { createOpenCodeSession } from "./opencode.mjs";
import { runController } from "./controller.mjs";
import { runCheck } from "./checks.mjs";

function argumentsFor(argv) {
  const args = { command: argv.shift() };
  while (argv.length) {
    const arg = argv.shift();
    if (arg === "--") { args.task = argv.join(" "); break; }
    if (!["--workspace", "--model", "--variant"].includes(arg) || !argv.length) throw new Error("USAGE: opencode-harness run|doctor --workspace <repository> [--model provider/model] [--variant variant] -- <task>");
    args[arg.slice(2)] = argv.shift();
  }
  if (!["run", "doctor"].includes(args.command) || !args.workspace) throw new Error("USAGE: opencode-harness run|doctor --workspace <repository> -- <task>");
  if (args.command === "run" && !args.task?.trim()) throw new Error("TASK_REQUIRED");
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
    console.log(JSON.stringify({ status: "preflight_passed", head: original.head, image,
      checked: ["clean_git", "configuration", "opencode_cli_options", "contained_node_runtime"],
      unverified: ["model_access", "acceptance_author", "full_repair_cycle"] }, null, 2));
    return;
  }
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "verified-change-run-"));
  fs.chmodSync(output, 0o700);
  console.error(`Private run artifacts: ${output}`);
  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  const usage = [];
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
    const authorPrompt = `Prepare a small independent set of acceptance tests BEFORE implementation. You can read the initial repository at /workspace and its docs/tests. Only /acceptance is writable.\nTask:\n${args.task}\n\n${instructions.join("\n\n")}\n\nWrite Node built-in test runner files under /acceptance, importing candidate code from absolute /workspace paths. Use node:assert/strict. Do not infer expected results from current implementation. Do not invent requirements. Write /acceptance/manifest.json as a JSON array. Each entry: {id,kind:"node-test",files:["relative.test.mjs"],confidence:"unambiguous" or "ambiguous",basis:{source:"task" or "AGENTS.md" or "WORKFLOW.md" or "README.md",quote:"exact public requirement quote"}}. Mark doubtful assertions ambiguous. You cannot see the future implementation. No more than 6 checks. Do not modify existing tests or source.`;
    usage.push({ role: "acceptance", ...await author.prompt(authorPrompt, abort.signal) });
    const acceptanceHash = treeFingerprint(acceptance); // Reject symlinks before host manifest reads.
    const hypotheses = JSON.parse(fs.readFileSync(path.join(acceptance, "manifest.json"), "utf8"));
    if (!Array.isArray(hypotheses) || hypotheses.length > 6) throw new Error("ACCEPTANCE_MANIFEST_INVALID");
    for (const hypothesis of hypotheses) {
      validateCheck(hypothesis);
      if (hypothesis.kind !== "node-test") throw new Error("ACCEPTANCE_KIND_INVALID");
      if (config.checks.some((check) => check.id === hypothesis.id)) throw new Error("ACCEPTANCE_ID_COLLIDES_WITH_EXISTING_CHECK");
    }
    const primary = await createOpenCodeSession({ ...sessionOptions, controlDirectory: path.join(output, "primary-control"),
      sandbox: { image, workspace: candidate, readonly: true, writablePaths: config.sourcePaths } });
    const host = {
      draft: async (task, signal) => {
        usage.push({ role: "draft", ...await primary.prompt(`Work on this task in /workspace using the isolated repository tools. Read relevant project instructions and consumers. Run available tests as needed. Authorized source paths: ${JSON.stringify(config.sourcePaths)}.\n\n${task}\n\n${instructions.join("\n\n")}`, signal) });
      },
      snapshot: (name) => snapshotCandidate(candidate, output, name),
      scope: (snapshot) => checkScope(snapshot, baseline, config.sourcePaths),
      verify: async (snapshot, checks, signal) => {
        if (treeFingerprint(acceptance) !== acceptanceHash) throw new Error("ACCEPTANCE_CHANGED");
        const results = [];
        for (const check of checks) {
          const generated = hypotheses.includes(check);
          results.push(await runCheck(check, { image, workspace: snapshot.directory,
            ...(generated ? { checkRoot: "/acceptance", extraMounts: [{ source: acceptance, target: "/acceptance" }] } : {}) }, signal));
          if (signal?.aborted) throw new DOMException("cancelled", "AbortError");
        }
        return results;
      },
      repair: async (diagnostics, signal) => {
        usage.push({ role: "repair", ...await primary.prompt(`Fix only the reproduced requirement failures below. Keep existing behavior and test expectations. Do not weaken checks. Inspect affected consumers.\n${JSON.stringify(diagnostics)}`, signal) });
      },
    };
    const report = await runController({ task: args.task, checks: config.checks, hypotheses, contracts, host, signal: abort.signal });
    report.base = original; report.usage = usage; report.output = output;
    // Failed/unverified drafts remain downloadable patches, never automatic edits.
    report.application = report.stopReason === "checks_passed"
      ? await publishSnapshot(original, report.selected, abort.signal) : { applied: false, reason: report.stopReason };
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
    if (report.stopReason !== "checks_passed" || !report.application.applied) process.exitCode = 2;
  } catch (error) {
    fs.writeFileSync(path.join(output, "error.json"), JSON.stringify({ error: error.message, usage, cancelled: abort.signal.aborted }), { mode: 0o600 });
    throw error;
  } finally {
    process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel);
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 2; });
