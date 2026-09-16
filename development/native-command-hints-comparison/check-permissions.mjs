// Eligibility check only: reuse the installed scripted fixture, not a task-run.
// No real provider, credentials, installation, runtime edits or permission relaxation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const candidate = 'c90fc7c78bcdd4d8288550b887f52990bafb11a6';
const frozenSource = spawnSync('git', ['diff', '--exit-code', candidate, '--', 'lib', 'profiles', 'development/native-command-hints/installed.mjs'], {cwd: root, encoding: 'utf8'});
assert.equal(frozenSource.status, 0, 'Measured product/fixture must match the fixed candidate: ' + frozenSource.stderr);
const output = path.join(root, 'local/native-command-hints-comparison');
fs.mkdirSync(output, {recursive: true});
const original = fs.readFileSync(path.join(root, 'development/native-command-hints/installed.mjs'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'local/native-task-integrated/experiment-config.json')));
assert.equal(config.permission.external_directory, 'deny');
let fixture = original;
function replace(from, to) {
  assert.equal(fixture.split(from).length, 2, 'Fixture anchor must be unique');
  fixture = fixture.replace(from, to);
}
replace("external_directory:'allow'", "external_directory:'deny'");
replace("encoding+'\\nexport const unusedCommandHint = ;\\n'", 'encoding');
replace("'Fix the unusedCommandHint lint defect in src/encoding.ts. Add a public encode(42) regression in test/encoding.test.ts. Preserve all existing tests. Run pnpm test after the last change.'", "'Check the declared pnpm test command and report its actual result. Do not change source or permissions.'");
replace("if(layout==='off'){assert.ok(!output.includes('Host-derived project command context:'));respond(res,null,'Bare command failed; no hints enabled.');step++;return;}", "assert.ok(!output.includes('Host-derived project command context:')); console.log(JSON.stringify({observedFailure:output})); respond(res,null,'Bare command failed; no hint was received. No checks passed.');step++;return;");
replace("if(layout==='off'){assert.ok(!fs.existsSync(path.join(artifacts,'command-hint.json')));assert.equal(events.length,1);}", "if(layout==='ancestor'){assert.ok(!fs.existsSync(path.join(artifacts,'command-hint.json')));assert.equal(events.length,1);assert.equal(report.termination.verified,true);evidence={...evidence,commandHintsEnabled:true,externalDirectory:'deny',hintReceived:false,hintArtifact:false,terminationVerified:true,rawEvent:events[0]};}");
// Baseline suitability is independent of the scripted author's failed bare command.
replace("console.log(JSON.stringify({progress:layout+' prepared'}));", "const baseline=run(path.join(project,'node_modules/.bin/pnpm'),['test'],project); assert.match(baseline,/Test Files/); console.log(JSON.stringify({progress:layout+' prepared',baselineSuitePassed:true}));");
const generated = path.join(output, 'permission-fixture.mjs');
fs.writeFileSync(generated, fixture);
const container = 'command-hints-permissions-' + Date.now();
const image = 'sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6';
const tool = path.resolve(root, '../verified-change-harness/local/template-toolchain-20260908/package/bin/opencode');
const started = Date.now();
const result = spawnSync('docker', ['run', '--name', container, '--rm', '--init', '--pull=never', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '512', '--memory', '3072m', '--cpus', '2', '--user', 'node', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '--tmpfs', '/work:rw,exec,nosuid,uid=1000,gid=1000,mode=0700,size=1536m', '--env', 'COMMAND_HINT_LAYOUTS=ancestor', '--mount', `type=bind,source=${root},target=/repo,readonly`, '--mount', `type=bind,source=${generated},target=/repo/development/native-command-hints/installed.mjs,readonly`, '--mount', `type=bind,source=${tool},target=/opt/opencode,readonly`, image, 'node', '/repo/development/native-command-hints/installed.mjs'], {encoding: 'utf8', timeout: 240000, maxBuffer: 8 * 1024 * 1024});
fs.writeFileSync(path.join(output, 'permission-fixture.log'), result.stdout + '\n' + result.stderr);
if (result.error) spawnSync('docker', ['rm', '--force', container], {timeout: 15000});
assert.equal(result.status, 0, result.stdout + '\n' + result.stderr);
const evidence = JSON.parse(result.stdout.trim().split('\n').at(-1));
const listed = spawnSync('docker', ['ps', '-aq', '--filter', 'name=^/' + container + '$'], {encoding: 'utf8'});
assert.equal(listed.status, 0, listed.stderr); assert.equal(listed.stdout.trim(), '');
const report = {candidate: 'c90fc7c78bcdd4d8288550b887f52990bafb11a6', prerequisite: 'failed: existing direct permissions suppress command hints', developerElapsedMs: Date.now()-started, realProviderRequests: 0, modelTaskRuns: 0, image, containerRemoved: true, fixtureSourceSha256: createHash('sha256').update(original).digest('hex'), generatedFixtureSha256: createHash('sha256').update(fixture).digest('hex'), evidence};
fs.writeFileSync(path.join(output, 'permission-result.json'), JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify(report, null, 2));
