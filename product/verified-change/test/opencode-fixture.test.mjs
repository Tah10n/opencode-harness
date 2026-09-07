import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createHash } from "node:crypto";

const enabled = process.env.VERIFIED_CHANGE_OPENCODE_TEST === "1";
const scenarios = [
  { name: "preparation protected workspace mutation remains blocking", preparation: 'integrity', draft: 2, applied: false },
  { name: "preparation user cancellation remains blocking", preparation: 'cancel', draft: 2, applied: false },
  { name: "preparation missing manifest preserves imported D0", preparation: 'missing', imported: true, draft: 2, repairs: 0, reason: 'checks_passed', applied: true },
  { name: "preparation invalid JSON preserves imported D0", preparation: 'json', imported: true, draft: 2, repairs: 0, reason: 'checks_passed', applied: true },
  { name: "preparation invalid element preserves draft and project checks", preparation: 'element', draft: 2, repairs: 0, reason: 'checks_passed', applied: true },
  { name: "preparation duplicate ID excludes diagnostic set", preparation: 'duplicate', draft: 2, repairs: 0, reason: 'checks_passed', applied: true },
  { name: "preparation failure still repairs real project assertion", preparation: 'session', projectFailure: true, draft: -1, repair: 2, repairs: 1, reason: 'checks_passed', applied: true },
  { name: "preparation audit failure preserves imported D0", preparation: 'audit', imported: true, draft: 2, repairs: 0, reason: 'checks_passed', applied: true },
  { name: "preparation cleanup failure remains blocking", preparation: 'cleanup', cleanup: true, cleanupTool: true, draft: 2, applied: false },
  { name: "missing diagnostic response retains D0", assessmentResponse: 'missing', draft: 1, repairs: 0, reason: 'checks_passed', applied: true },
  { name: "malformed diagnostic response retains D0", assessmentResponse: 'malformed', draft: 1, repairs: 0, reason: 'checks_passed', applied: true },
  { name: "null diagnostic dispute retains D0", assessmentResponse: 'null', draft: 1, repairs: 0, reason: 'checks_passed', applied: true },
  { name: "host cleanup refusal preserves D0 patch and user worktree", cleanup: true, draft: 2, applied: false },
  { name: "plugin cleanup refusal survives empty session census", cleanup: true, cleanupTool: true, draft: 2, applied: false },
  { name: "owner-confirmed requirement repaired", draft: 1, repair: 2, repairs: 1, reason: "checks_passed", applied: true },
  { name: "correct draft unchanged", draft: 2, repairs: 0, reason: "checks_passed", applied: true },
  { name: "missed consumer repaired", draft: 2, repair: 2, consumer: true, repairs: 1, reason: "checks_passed", applied: true },
  { name: "unsupported assertion ignored", draft: 1, ambiguous: true, repairs: 0, reason: "checks_passed", applied: true },
  { name: "broken runtime does not trigger repair", draft: 1, broken: true, repairs: 0, reason: "verification_unavailable", applied: false },
  { name: "regressing repair rejected", draft: 1, repair: -1, repairs: 1, reason: "repair_regression", applied: false },
  { name: "concurrent user changes preserved", draft: 2, concurrent: true, repairs: 0, reason: "checks_passed", applied: false },
  { name: "session timeout terminates descendants", timeout: true, draft: 1, applied: false },
  { name: "cancellation terminates descendants", cancel: true, draft: 1, applied: false },
  { name: "wrapped quote alone cannot authorize repair", wrapped: true, draft: 1, repairs: 0, reason: "checks_passed", applied: true },
  { name: "shared ambiguous assertions quarantined", shared: true, draft: 1, repairs: 0, reason: "checks_passed", applied: true },
  { name: "only owner-confirmed tests inform repair", readAcceptance: true, draft: 1, repair: 2, repairs: 1, reason: "checks_passed", applied: true },
  { name: "confident but unsupported assertion disputed before edits", disputed: true, draft: 1, repairs: 0, reason: "checks_passed", applied: true },
  { name: "imported draft repaired without a second draft call", imported: true, draft: 1, repair: 2, repairs: 1, reason: "checks_passed", applied: true },
  { name: "imported correct draft retained", imported: true, draft: 2, repairs: 0, reason: "checks_passed", applied: true },
  { name: "total deadline terminates descendants", deadline: true, draft: 1, applied: false },
  { name: "generated files unavailable during confirmed repair", mixed: true, draft: 1, repair: 2, repairs: 1, reason: "checks_passed", applied: true },
];
for (const scenario of scenarios) test(`installed OpenCode CLI: ${scenario.name}`, { skip: !enabled, timeout: 180_000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "verified-change-opencode-"));
  const root = fileURLToPath(new URL("..", import.meta.url));
  const pack = spawnSync("npm", ["pack", "--json", "--ignore-scripts", "--cache", path.join(temp, "cache"), "--pack-destination", temp], { cwd: root, encoding: "utf8" });
  assert.equal(pack.status, 0, pack.stderr);
  const packed = JSON.parse(pack.stdout);
  const archive = (Array.isArray(packed) ? packed[0] : packed["@opencode-harness/verified-change"]).filename;
  const install = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", path.join(temp, "installed"), path.join(temp, archive)], { encoding: "utf8" });
  assert.equal(install.status, 0, install.stderr);
  let fixturePath = process.env.PATH;
  const cleanupTrigger = path.join(temp, 'fail-cleanup');
  if (scenario.cleanup) {
    const docker = spawnSync('which', ['docker'], { encoding: 'utf8' }).stdout.trim();
    assert.ok(path.isAbsolute(docker));
    const bin = path.join(temp, 'bin'); fs.mkdirSync(bin);
    const shim = `#!${process.execPath}\nconst fs=require('fs'),cp=require('child_process');const args=process.argv.slice(2);if(args[0]==='rm'&&fs.existsSync(${JSON.stringify(cleanupTrigger)})){process.stderr.write('scripted Docker daemon cleanup failure');process.exit(1);}const r=cp.spawnSync(${JSON.stringify(docker)},args,{stdio:'inherit'});process.exit(r.status??1);\n`;
    fs.writeFileSync(path.join(bin, 'docker'), shim, { mode: 0o755 });
    fixturePath = `${bin}${path.delimiter}${fixturePath}`;
  }
  if (['session', 'audit'].includes(scenario.preparation)) {
    const realOpenCode = spawnSync('which', ['opencode'], { encoding: 'utf8' }).stdout.trim();
    assert.ok(path.isAbsolute(realOpenCode));
    const bin = path.join(temp, 'session-bin'); fs.mkdirSync(bin);
    const trigger = scenario.preparation === 'audit' ? 'Audit your acceptance assertions' : 'Prepare a small independent set';
    const shim = `#!${process.execPath}\nconst cp=require('child_process');const args=process.argv.slice(2);const r=cp.spawnSync(${JSON.stringify(realOpenCode)},args,{stdio:'inherit'});if(r.status===0&&args.at(-1)?.startsWith(${JSON.stringify(trigger)})){process.stderr.write('scripted diagnostic session failure');process.exit(1);}process.exit(r.status??1);\n`;
    fs.writeFileSync(path.join(bin, 'opencode'), shim, { mode: 0o755 });
    fixturePath = `${bin}${path.delimiter}${fixturePath}`;
  }
  const repo = path.join(temp, "repo"); fs.mkdirSync(repo); fs.mkdirSync(path.join(repo, "src"));
  fs.writeFileSync(path.join(repo, "src/api.mjs"), "export const value = 0;\n");
  if (scenario.consumer) fs.writeFileSync(path.join(repo, "src/consumer.mjs"), "export const value = 0;\n");
  fs.writeFileSync(path.join(repo, "regression.test.mjs"), scenario.broken ? "import 'nonexistent-runtime-library';\n" : "import test from 'node:test';import assert from 'node:assert/strict';import {value} from './src/api.mjs';test('public contract',()=>{assert.equal(typeof value,'number');assert.ok(value>=0)});\n");
  const projectChecks = [{ id: "public", kind: "node-test", files: ["regression.test.mjs"] }];
  const protectedPaths = ["regression.test.mjs", ".opencode-harness.json"];
  if (scenario.repairs && !scenario.projectFailure) {
    const ownerFile = "owner-acceptance.test.mjs";
    const bytes = `import test from 'node:test';import assert from 'node:assert/strict';import {value} from './src/${scenario.consumer ? "consumer" : "api"}.mjs';test('owner-confirmed expected value',()=>assert.equal(value,2));\n`;
    fs.writeFileSync(path.join(repo, ownerFile), bytes);
    protectedPaths.push(ownerFile);
    projectChecks.push({ id: 'owner-value', kind: 'node-test', files: [ownerFile], source: 'independently_validated_acceptance',
      expectedResult: { kind: 'project_owner_confirmation', confirmed: true, expectation: 'The exported value is exactly 2.',
        rationale: 'Fixture project owner explicitly confirmed the value and consumer expectation.',
        fileSha256: { [ownerFile]: createHash('sha256').update(bytes).digest('hex') } } });
  }
  fs.writeFileSync(path.join(repo, ".opencode-harness.json"), JSON.stringify({ version: 1, image: "node:24.19.0-bookworm-slim", sourcePaths: ["src"], protectedPaths, checks: projectChecks, sessionTimeoutMs: scenario.timeout ? 5000 : 40_000 }));
  for (const args of [["init"], ["add", "."], ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"]]) {
    const r = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: repo, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  }
  const task = scenario.disputed ? "Return a numeric value. Preserve the public numeric API." : scenario.wrapped ? "The exported value\nmust equal 2. Preserve the public numeric API." : "The exported value must equal 2. Preserve the public numeric API.";
  const testBytes = `import test from 'node:test';import assert from 'node:assert/strict';import {value} from '/workspace/src/${scenario.consumer ? "consumer" : "api"}.mjs';test('new requirement',()=>assert.equal(value,${scenario.ambiguous ? 77 : 2}));\n${scenario.shared ? "test('unsupported assertion',()=>assert.equal(value,77));" : ""}`;
  const manifest = [{ id: "value", kind: "node-test", files: ["value.test.mjs"], confidence: scenario.ambiguous ? "ambiguous" : "unambiguous", basis: { source: "task", quote: scenario.ambiguous ? "The value must equal 77." : "The exported value must equal 2." } }];
  if (scenario.disputed) manifest[0].basis.quote = "Return a numeric value.";
  if (scenario.shared) manifest.push({ ...manifest[0], id: "uncertain", confidence: "ambiguous", basis: { source: "task", quote: "The value must equal 77." } });
  if (scenario.mixed) manifest.push({ ...manifest[0], id: 'uncertain', files:['uncertain.test.mjs'], basis:{source:'task',quote:'Preserve the public numeric API.'} });
  const commands = [
    `node -e ${shellQuote(`const fs=require('fs');fs.writeFileSync('/acceptance/value.test.mjs',${JSON.stringify(testBytes)});fs.writeFileSync('/acceptance/manifest.json',${JSON.stringify(JSON.stringify(manifest))});`)}`,
    `node -e ${shellQuote(`require('fs').writeFileSync('/workspace/src/api.mjs',${JSON.stringify(`export const value = ${scenario.draft};\n`)});process.stdout.write('oauth credential permission')`)}`,
    `node -e ${shellQuote(`require('fs').writeFileSync('/workspace/src/${scenario.consumer ? "consumer" : "api"}.mjs',${JSON.stringify(`export const value = ${scenario.repair};\n`)})`)}`,
  ];
  if (['missing', 'json', 'element', 'duplicate'].includes(scenario.preparation)) {
    const bytes = scenario.preparation === 'json' ? '{invalid JSON'
      : scenario.preparation === 'element' ? '[null]'
      : JSON.stringify([manifest[0], manifest[0]]);
    commands[0] = scenario.preparation === 'missing' ? 'true'
      : `node -e ${shellQuote(`const fs=require('fs');fs.writeFileSync('/acceptance/value.test.mjs',${JSON.stringify(testBytes)});fs.writeFileSync('/acceptance/manifest.json',${JSON.stringify(bytes)})`)}`;
  }
  if (scenario.mixed) {
    commands[0] += ` && node -e ${shellQuote(`require('fs').writeFileSync('/acceptance/uncertain.test.mjs',${JSON.stringify(testBytes.replace('value,2','value,77'))})`)}`;
    commands[2] = `node -e ${shellQuote("const fs=require('fs');if(fs.existsSync('/acceptance/uncertain.test.mjs'))throw Error('disputed test leaked');fs.readFileSync('/workspace/owner-acceptance.test.mjs')")} && ${commands[2]}`;
  }
  if (scenario.timeout || scenario.cancel || scenario.deadline) commands[1] = `node -e ${shellQuote("require('child_process').spawn('node',['-e','setInterval(()=>{},100)'],{detached:true,stdio:'ignore'});setInterval(()=>{},100)")}`;
  const draftFile = path.join(temp, 'draft.patch');
  if (scenario.imported) {
    fs.writeFileSync(path.join(repo, 'src/api.mjs'), `export const value = ${scenario.draft};\n`);
    const diff = spawnSync('git', ['diff', '--binary'], { cwd: repo, encoding: 'utf8' });
    assert.equal(diff.status, 0, diff.stderr);
    fs.writeFileSync(draftFile, diff.stdout);
    fs.writeFileSync(path.join(repo, 'src/api.mjs'), 'export const value = 0;\n');
    commands[0] = `node -e ${shellQuote("if(!require('fs').readFileSync('/workspace/src/api.mjs','utf8').includes('value = 0'))throw Error('draft leaked to author')")} && ${commands[0]}`;
    commands.splice(1, 1);
  }
  if (scenario.readAcceptance) {
    commands[1] = `node -e ${shellQuote("if(require('fs').existsSync('/acceptance'))throw Error('acceptance leaked into initial draft')")} && ${commands[1]}`;
    commands[2] = `node -e ${shellQuote("const fs=require('fs');fs.readFileSync('/workspace/owner-acceptance.test.mjs');fs.readFileSync('/harness/node-reporter.mjs');try{fs.writeFileSync('/workspace/owner-acceptance.test.mjs','weakened');throw Error('test was writable')}catch(e){if(e.message==='test was writable')throw e}")} && ${commands[2]}`;
  }
  let requests = 0;
  let assessmentRequests = 0;
  let auditRequests = 0;
  const decision = { disputed: scenario.disputed ? [{ id: "value", basis: { source: "task", quote: "Return a numeric value." }, reason: "The request permits any numeric value; it does not mandate 2." }] : [] };
  if (scenario.mixed) decision.disputed.push({id:'uncertain',basis:{source:'task',quote:'Preserve the public numeric API.'},reason:'Numeric compatibility does not require value 77; the explicit new requirement is 2.'});
  let assessmentCommand = `node -e ${shellQuote(`const fs=require('fs');let denied=false;try{fs.writeFileSync('/workspace/src/api.mjs','must not change')}catch(e){if(['EROFS','EACCES'].includes(e.code))denied=true;else throw e;}if(!denied)throw Error('assessment source writable');fs.writeFileSync('/assessment/decision.json',${JSON.stringify(JSON.stringify(decision))});`)}`;
  if (scenario.assessmentResponse) {
    const bytes = scenario.assessmentResponse === 'malformed' ? '{bad json' : '{"disputed":[null]}';
    assessmentCommand = scenario.assessmentResponse === 'missing' ? 'true'
      : `node -e ${shellQuote(`require('fs').writeFileSync('/assessment/decision.json',${JSON.stringify(bytes)})`)}`;
  }
  let cliProcess;
  let runOutput;
  const requestSummary = [];
  const server = http.createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    if (!req.url?.endsWith("/chat/completions")) { res.writeHead(404).end(); return; }
    const body = JSON.parse(raw);
    requestSummary.push({ tools: body.tools?.map((tool) => tool.function?.name), stream: body.stream, messages: body.messages?.map((m) => m.role) });
    const audit = JSON.stringify(body.messages?.filter((m) => m.role === "user").at(-1)).includes("Audit your acceptance assertions");
    if (audit) auditRequests++;
    if (!body.tools?.length || audit) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ id: "fixture-title", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: { role: "assistant", content: "Fixture task" }, finish_reason: "stop" }] })}\n\n`);
      res.end("data: [DONE]\n\n");
      return;
    }
    const assessment = JSON.stringify(body.messages?.filter((m) => m.role === "user").at(-1)).includes("Assess reproduced acceptance failures");
    const index = Math.floor(requests / 2), toolTurn = (assessment ? assessmentRequests : requests) % 2 === 0;
    if (assessment) assessmentRequests += 1; else requests += 1;
    if (scenario.cleanup && !assessment && index === (scenario.preparation === 'cleanup' ? 0 : 1) && toolTurn === Boolean(scenario.cleanupTool)) fs.writeFileSync(cleanupTrigger, 'fail rm only');
    if (index === 0 && !toolTurn && !assessment && ['integrity', 'cancel'].includes(scenario.preparation)) {
      assert.ok(runOutput);
      if (scenario.preparation === 'integrity') fs.appendFileSync(path.join(runOutput, 'baseline/regression.test.mjs'), '\n// scripted protected-file mutation');
      else cliProcess.kill('SIGINT');
    }
    if (scenario.cancel && index === 1 && toolTurn) setTimeout(() => cliProcess.kill("SIGINT"), 1500);
    if (scenario.concurrent && index === 1 && !toolTurn) fs.writeFileSync(path.join(repo, "src/api.mjs"), "export const value = 99; // user change\n");
    if (toolTurn && !body.tools?.some((tool) => tool.function?.name === "repository_shell")) {
      res.writeHead(500).end("isolated tools missing"); return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const base = { id: `fixture-${requests}-${assessmentRequests}`, object: "chat.completion.chunk", created: 1, model: "fixture" };
    const deltas = toolTurn ? [
      { role: "assistant", tool_calls: [{ index: 0, id: `call-${requests}-${assessmentRequests}`, type: "function", function: { name: "repository_shell", arguments: JSON.stringify({ command: assessment ? assessmentCommand : commands[index] }) } }] },
    ] : [{ role: "assistant", content: "Completed. oauth credential permission." }];
    for (const delta of deltas) res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: toolTurn ? "tool_calls" : "stop" }] })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const configFile = path.join(temp, "opencode.json");
  fs.writeFileSync(configFile, JSON.stringify({ provider: { "verified-fixture": { npm: "@ai-sdk/openai-compatible", name: "Local fixture", options: { baseURL: `http://127.0.0.1:${server.address().port}/v1`, apiKey: "fixture-local-only" }, models: { fixture: { name: "fixture", limit: { context: 100000, output: 10000 } } } } } }));
  try {
    const cli = path.join(temp, "installed/node_modules/.bin/opencode-harness");
    if (scenario.name === "correct draft unchanged" || scenario.broken) {
      const doctor = spawnSync(cli, ["doctor", "--workspace", repo], { encoding: "utf8" });
      assert.equal(doctor.status, scenario.broken ? 2 : 0, doctor.stderr);
      assert.equal(JSON.parse(doctor.stdout).status, scenario.broken ? "check_infrastructure_unavailable" : "execution_path_checked");
    }
    const result = await new Promise((resolve) => {
      const child = spawn(cli, ["run", "--workspace", repo, "--model", "verified-fixture/fixture", ...(scenario.imported ? ['--draft-patch', draftFile] : []), ...(scenario.deadline ? ['--time-limit-ms', '12000'] : []), "--", task], { env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "NODE_TEST_CONTEXT")), OPENCODE_CONFIG: configFile, PATH: fixturePath }, stdio: ["ignore", "pipe", "pipe"] });
      cliProcess = child;
      let stdout = "", stderr = "";
      child.stdout.on("data", (c) => { stdout += c; }); child.stderr.on("data", (c) => { stderr += c; runOutput = stderr.match(/Private run artifacts: (.+)/)?.[1]; });
      child.on("error", (error) => resolve({ code: -1, stdout, stderr: error.message }));
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
    assert.equal(result.code, scenario.applied ? 0 : 2, `${result.stderr}\n${result.stdout}\n${JSON.stringify(requestSummary)}`);
    if (['integrity', 'cancel'].includes(scenario.preparation)) {
      const report = JSON.parse(result.stdout);
      assert.equal(report.stopReason, scenario.preparation === 'cancel' ? 'cancelled' : 'execution_error');
      if (scenario.preparation === 'integrity') assert.match(result.stderr, /DIAGNOSTIC_WORKSPACE_CHANGED/);
      assert.equal(report.selectedPatch, null); assert.equal(report.application.applied, false);
      assert.equal(fs.readFileSync(path.join(repo, 'src/api.mjs'), 'utf8'), 'export const value = 0;\n');
      assert.equal(auditRequests, 0); assert.equal(requests, 2);
      return;
    }
    if (scenario.cleanup) {
      const report = JSON.parse(result.stdout);
      assert.equal(report.stopReason, 'execution_error'); assert.equal(report.application.applied, false);
      const error = JSON.parse(fs.readFileSync(path.join(report.output, 'error.json')));
      assert.equal(error.error, 'SANDBOX_CLEANUP_UNVERIFIED');
      assert.equal(error.cleanup.verified, false); assert.equal(error.cleanup.after.state, 'absent');
      assert.equal(error.cleanup.rm.exitCode, 1); assert.match(error.cleanup.rm.stderr, /scripted Docker daemon/);
      assert.match(error.cleanup.container.name, /^verified-change-/);
      if (scenario.cleanupTool) assert.ok(fs.existsSync(path.join(report.output, scenario.preparation === 'cleanup' ? 'author-control/cleanup-error.json' : 'primary-control/cleanup-error.json')));
      else assert.match(fs.readFileSync(report.selectedPatch, 'utf8'), /\+export const value = 2;/);
      assert.equal(fs.readFileSync(path.join(repo, 'src/api.mjs'), 'utf8'), 'export const value = 0;\n');
      assert.equal(requests, scenario.preparation === 'cleanup' ? 2 : 4, 'no model task retry for cleanup');
      if (scenario.preparation === 'cleanup') { assert.equal(report.selectedPatch, null); assert.equal(auditRequests, 0); }
      return;
    }
    if (scenario.timeout || scenario.cancel || scenario.deadline) {
      if (scenario.timeout) assert.match(result.stderr, /OPENCODE_SESSION_TIMEOUT/);
      else if (scenario.deadline) assert.equal(JSON.parse(result.stdout).stopReason, "timeout");
      else assert.equal(JSON.parse(result.stdout).stopReason, "cancelled");
      const output = result.stderr.split("\n").find((line) => line.startsWith("Private run artifacts: ")).slice("Private run artifacts: ".length);
      const session = JSON.parse(fs.readFileSync(path.join(output, "primary-control/session.json"), "utf8"));
      const remaining = spawnSync("docker", ["ps", "-aq", "--filter", `label=verified-change.session=${session.sandbox.sessionLabel}`], { encoding: "utf8" });
      assert.equal(remaining.status, 0, remaining.stderr);
      assert.equal(remaining.stdout.trim(), "", "all session containers and detached descendants must be gone");
      assert.match(fs.readFileSync(path.join(repo, "src/api.mjs"), "utf8"), /value = 0/);
      return;
    }
    const report = JSON.parse(result.stdout);
    assert.equal(report.stopReason, scenario.reason);
    assert.equal(report.repairs, scenario.repairs);
    assert.equal(report.selected.name, scenario.repairs && scenario.applied ? "D1" : "D0");
    assert.equal(report.application.applied, scenario.applied);
    assert.equal(requests, (scenario.imported ? 2 : 4) + 2 * scenario.repairs);
    if (scenario.imported) {
      assert.equal(report.draftImported, true);
      assert.equal(fs.readFileSync(report.snapshots[0].snapshot.patchPath, 'utf8'), fs.readFileSync(draftFile, 'utf8'));
    }
    if (scenario.preparation) {
      assert.equal(report.diagnosticPreparation.status, 'diagnostic_unavailable');
      const reasons = { missing: /ACCEPTANCE_MANIFEST_MISSING/, json: /ACCEPTANCE_JSON_INVALID/, element: /CHECK_ID_INVALID/, duplicate: /ACCEPTANCE_ENTRY_INVALID/, session: /OPENCODE_EXECUTION_FAILED/, audit: /OPENCODE_EXECUTION_FAILED/ };
      assert.match(report.diagnosticPreparation.reason, reasons[scenario.preparation]);
      assert.deepEqual(report.diagnosticPreparation.hypotheses, []);
      assert.deepEqual(report.checkSources, { public: 'existing_project_check' });
      assert.deepEqual(report.passedProjectChecks, ['public']);
      assert.equal(assessmentRequests, 0);
      assert.equal(auditRequests, scenario.preparation === 'session' ? 0 : 1, 'diagnostic session is not retried');
      const events = fs.readFileSync(path.join(report.output, 'attempts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
      assert.equal(events.filter(e => e.phase === 'diagnostic_unavailable').length, 1);
      assert.ok(events.filter(e => e.phase === 'check_finished').every(e => e.result.id === 'public'));
      if (scenario.projectFailure) assert.equal(report.snapshots[0].checks[0].status, 'assertion_failed');
    }
    if (scenario.assessmentResponse) {
      assert.ok(report.snapshots[0].assessment.error);
      assert.equal(report.unresolvedHypotheses[0].result.status, 'assertion_failed');
      assert.equal(report.unresolvedHypotheses[0].reason, 'expected_result_unconfirmed');
      assert.equal(assessmentRequests, 2);
    }
    if (scenario.ambiguous) assert.equal(report.unverified.length, 1);
    if (scenario.shared) assert.equal(report.unverified.length, 2);
    if (scenario.disputed) {
      assert.equal(report.unverified[0].reason, "disputed_assertion");
      assert.equal(assessmentRequests, 2);
    }
    if (scenario.mixed) {
      assert.deepEqual(report.unverified.map(c=>c.id),['value','uncertain']);
      assert.equal(report.unverified.find(c => c.id === 'uncertain').reason, 'disputed_assertion');
      assert.deepEqual(report.confirmed.map(c=>c.id),['owner-value']);
    }
    assert.equal(report.semanticCorrectness, 'unproven');
    assert.ok(report.unresolvedHypotheses.every(h => h.source === 'generated_hypothesis'));
    const expectedValue = scenario.concurrent ? 99 : scenario.applied ? scenario.consumer ? scenario.draft : scenario.repair ?? scenario.draft : 0;
    assert.match(fs.readFileSync(path.join(repo, "src/api.mjs"), "utf8"), new RegExp(`value = ${expectedValue}`));
    if (scenario.consumer) assert.match(fs.readFileSync(path.join(repo, "src/consumer.mjs"), "utf8"), /value = 2/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
function shellQuote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }
