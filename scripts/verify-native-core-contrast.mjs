// Installed instruction delivery and a scripted public-call contrast, not model lift.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {materializeNativeTemplate} from '../lib/native-template.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'native-core-contrast-'));
const project = path.join(temporary, 'project');
for (const name of ['project', 'home', 'config', 'data', 'cache', 'state'])
  fs.mkdirSync(path.join(temporary, name));
const bundle = path.join(temporary, 'bundle');
const task = 'Remove the archived column while retaining the active column and its value. Use the public configureColumns call.';
const core = fs.readFileSync(path.join(root, 'profiles/native/core.md'), 'utf8');
materializeNativeTemplate({repositoryRoot: root, outputDirectory: bundle});
assert.deepEqual(fs.readdirSync(bundle).sort(), ['core.md', 'opencode.json']);
assert.equal(fs.readFileSync(path.join(bundle, 'core.md'), 'utf8'), core);
fs.writeFileSync(path.join(project, 'scenario.mjs'), `
import assert from 'node:assert/strict';
const columns = {active: 'retained-value', archived: 'old-value'};
function configureColumns(input, strategy) {
  const result = {...columns};
  if (strategy === 'broad' && input.remove.length) return {};
  for (const name of input.remove) delete result[name];
  return result;
}
const result = configureColumns({remove: ['archived']}, process.argv[2]);
assert.equal(Object.hasOwn(result, 'archived'), false); // Absence alone accepts both.
assert.equal(result.active, columns.active); // Independent retained-member observation.
assert.deepEqual(result, {active: 'retained-value'});
console.log('CONTRAST_SCOPED_OK');
`);
fs.writeFileSync(path.join(project, 'AGENTS.md'), 'PROJECT_GUIDANCE_SENTINEL: preserve unrelated columns and private-file denials.\n');
fs.writeFileSync(path.join(project, 'opencode.json'), JSON.stringify({permission: {webfetch: 'deny', read: {'private/**': 'deny'}},
  agent: {build: {permission: {webfetch: 'deny'}}}}));
const probe = strategy => spawnSync(process.execPath, ['scenario.mjs', strategy], {cwd: project, encoding: 'utf8'});
const negative = probe('broad'), positive = probe('scoped');
assert.equal(negative.status, 1);
assert.match(negative.stderr, /ERR_ASSERTION/);
assert.equal(positive.status, 0, positive.stderr);
assert.match(positive.stdout, /CONTRAST_SCOPED_OK/);

let turn = 0, child;
const requests = [];
const fixture = http.createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  assert.equal(request.url, '/v1/chat/completions');
  const body = JSON.parse(Buffer.concat(chunks));
  const main = body.tools?.length > 0;
  if (main) requests.push(body);
  const command = main && turn < 2 ? `node scenario.mjs ${turn++ === 0 ? 'broad' : 'scoped'}` : null;
  const delta = command ? {role: 'assistant', tool_calls: [{index: 0, id: `contrast-${turn}`, type: 'function', function: {
    name: 'bash', arguments: JSON.stringify({command, description: 'Observe selected and retained columns through the public caller'})
  }}]} : {role: 'assistant', content: 'Scripted contrast completed. This fixture does not measure model decisions.'};
  const chunk = {id: 'local-contrast', object: 'chat.completion.chunk', created: 1, model: 'fixture'};
  response.writeHead(200, {'content-type': 'text/event-stream'});
  response.end(`data: ${JSON.stringify({...chunk, choices: [{index: 0, delta, finish_reason: null}]})}\n\n` +
    `data: ${JSON.stringify({...chunk, choices: [{index: 0, delta: {}, finish_reason: command ? 'tool_calls' : 'stop'}]})}\n\n` +
    'data: [DONE]\n\n');
});
try {
  await new Promise((resolve, reject) => {fixture.once('error', reject); fixture.listen(0, '127.0.0.1', resolve);});
  const config = {model: 'local-fixture/fixture', small_model: 'local-fixture/fixture', provider: {'local-fixture': {
    npm: '@ai-sdk/openai-compatible', name: 'Local scripted fixture',
    options: {baseURL: `http://127.0.0.1:${fixture.address().port}/v1`, apiKey: 'not-a-credential'},
    models: {fixture: {name: 'fixture', limit: {context: 100000, output: 10000}}}
  }}};
  const env = {PATH: process.env.PATH, HOME: path.join(temporary, 'home'), TMPDIR: os.tmpdir(),
    ...Object.fromEntries(['config', 'data', 'cache', 'state'].map(name => [`XDG_${name.toUpperCase()}_HOME`, path.join(temporary, name)])),
    OPENCODE_DISABLE_MODELS_FETCH: 'true', OPENCODE_DISABLE_AUTOUPDATE: 'true',
    OPENCODE_CONFIG_DIR: bundle, OPENCODE_CONFIG_CONTENT: JSON.stringify(config)};
  const result = await new Promise((resolve, reject) => {
    child = spawn(process.env.OPENCODE_BIN ?? 'opencode', ['run', '--format', 'json', '--model', 'local-fixture/fixture', task], {
      cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32'
    });
    let stdout = '', stderr = '';
    const deadline = setTimeout(() => {
      if (process.platform === 'win32') child.kill('SIGKILL'); else process.kill(-child.pid, 'SIGKILL');
    }, 120000);
    child.stdout.on('data', data => {stdout += data;});
    child.stderr.on('data', data => {stderr += data;});
    child.once('error', error => {clearTimeout(deadline); reject(error);});
    child.once('close', code => {clearTimeout(deadline); child = null; resolve({code, stdout, stderr});});
  });
  assert.equal(result.code, 0, result.stderr);
  const events = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  const commands = events.filter(event => event.type === 'tool_use' && event.part?.tool === 'bash').map(event => event.part.state);
  assert.equal(commands.length, 2, result.stdout);
  assert.equal(commands[0].input.command, 'node scenario.mjs broad');
  assert.equal(commands[0].metadata.exit, 1);
  assert.match(commands[0].output, /ERR_ASSERTION/);
  assert.equal(commands[1].input.command, 'node scenario.mjs scoped');
  assert.equal(commands[1].metadata.exit, 0);
  assert.match(commands[1].output, /CONTRAST_SCOPED_OK/);
  assert.ok(requests.length >= 3);
  for (const body of requests) {
    const instructions = body.messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
    assert.ok(instructions.includes(core.trim()), 'Exact materialized instructions did not reach the installed session');
    assert.ok(JSON.stringify(body.messages).includes(task));
    assert.ok(instructions.includes('PROJECT_GUIDANCE_SENTINEL'));
    const names = body.tools.map(tool => tool.function.name);
    for (const name of ['bash', 'read', 'glob', 'grep']) assert.ok(names.includes(name), name);
    assert.ok(names.includes('edit') || names.includes('apply_patch'), 'Native provider-specific editing tool');
    assert.ok(!names.includes('webfetch'));
    assert.ok(!names.includes('harness_task'));
  }
  console.log(JSON.stringify({passed: true, opencode: '1.18.26', coreSha256: createHash('sha256').update(core).digest('hex'),
    scriptedWorkRequests: requests.length, realProviderRequests: 0, positiveControl: 'scoped removal retains sibling',
    negativeControl: 'absence-only broad replacement fails retained-member assertion',
    limit: 'Proves installation, instruction delivery, native command execution and contrast sensitivity; no model compliance or quality lift.'}));
} finally {
  if (child) {
    const active = child;
    await new Promise(resolve => {
      active.once('close', resolve);
      if (process.platform === 'win32') active.kill('SIGKILL'); else process.kill(-active.pid, 'SIGKILL');
    });
  }
  if (fixture.listening) await new Promise(resolve => fixture.close(resolve));
  fs.rmSync(temporary, {recursive: true, force: true});
}
