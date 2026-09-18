// Real compiler + native hook queue/denial controls, without a provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import nativeTaskPlugin from '../lib/native-task-plugin.mjs';
const compiler = process.env.HARNESS_TASK_TYPE_COMPAT_COMPILER;
assert.ok(compiler, 'Select prepared compiler');
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'type-compat-hooks-')));
const savedEnv = {...process.env};
const results = [];
try {
for (const mode of ['queued-write', 'denial', 'denial-before', 'off']) {
  const directory = path.join(temp, mode); fs.mkdirSync(directory);
  const old = 'export class Dispatch { handlers(n: number): Array<(s: string) => void>; }\n';
  const bad = old.replace('(s: string)', '(this: {receiver: string}, s: string)');
  fs.writeFileSync(directory + '/index.d.ts', old);
  fs.writeFileSync(directory + '/package.json', JSON.stringify({types: 'index.d.ts', scripts: {test: 'node --version'}}));
  fs.writeFileSync(directory + '/TASK.md', 'Extend the public module and run npm test; preserve existing calls.');
  const git = args => {const r = spawnSync('git', args, {cwd: directory, encoding: 'utf8'}); assert.equal(r.status, 0, r.stderr);};
  git(['init', '-q']); git(['add', '.']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@local', 'commit', '-qm', 'base']);
  Object.assign(process.env, {HARNESS_TASK_FILE: directory + '/TASK.md', HARNESS_TASK_STRATEGY: 'direct', HARNESS_TASK_TIMEOUT_MS: '60000',
    HARNESS_TASK_TYPE_COMPAT: mode === 'off' ? '0' : '1', HARNESS_TASK_TYPE_COMPAT_COMPILER: compiler,
    HARNESS_TASK_TYPE_COMPAT_PROFILE: 'returned-callable-strict-v1', HARNESS_TASK_TYPE_COMPAT_NODE: process.execPath,
    HARNESS_TASK_CONTEXT: '0', HARNESS_TASK_CHECKS: '0', HARNESS_TASK_SENSITIVITY: '0', HARNESS_TASK_INVESTIGATION: '0', HARNESS_TASK_COMMAND_HINTS: '0', HARNESS_TASK_EXTRA_ATTENTION: '0'});
  let hooks, worktree, aborts = 0, received;
  const child = 'type-child-' + mode, parent = 'type-parent-' + mode;
  const input = (id, tool) => ({sessionID: child, callID: id, tool});
  const client = {app: {agents: async () => ({data: [{name: 'build', permission: [{permission: '*', pattern: '*', action: 'allow'}]}]})}, session: {
    get: async () => ({data: {permission: []}}), create: async ({query}) => {worktree = query.directory; return {data: {id: child}};},
    abort: async () => {aborts++; return {data: true};}, messages: async () => ({data: []}),
    prompt: async () => {
      await hooks['tool.execute.before'](input('edit', 'edit'), {args: {filePath: 'index.d.ts'}});
      fs.writeFileSync(worktree + '/index.d.ts', bad);
      await hooks['tool.execute.after']({...input('edit', 'edit'), args: {filePath: 'index.d.ts'}}, {output: 'edited', metadata: {}});
      const args = {command: 'npm test', workdir: '.'};
      await hooks['tool.execute.before'](input('check', 'bash'), {args}); await hooks['shell.env']({...input('check', 'bash'), cwd: worktree}, {env: {}});
      const command = spawnSync('npm', ['test'], {cwd: worktree, encoding: 'utf8'}); assert.equal(command.status, 0);
      const output = {output: command.stdout, metadata: {exit: 0}};
      const after = hooks['tool.execute.after']({...input('check', 'bash'), args}, output);
      if (mode === 'queued-write') {
        let admitted = false;
        const queued = hooks['tool.execute.before'](input('later-edit', 'edit'), {args: {filePath: 'index.d.ts'}}).then(() => {admitted = true;});
        await new Promise(r => setTimeout(r, 30)); assert.equal(admitted, false, 'Writer must wait for diagnostic delivery');
        await after; assert.match(output.output, /2684/); await queued;
        fs.writeFileSync(worktree + '/index.d.ts', old);
        await hooks['tool.execute.after']({...input('later-edit', 'edit'), args: {filePath: 'index.d.ts'}}, {output: 'repaired after observation', metadata: {}});
      } else if (mode.startsWith('denial')) {
        if (mode === 'denial') await new Promise(r => setTimeout(r, 30));
        await hooks.event({event: {type: 'permission.replied', properties: {sessionID: child, reply: 'reject'}}});
        await after; assert.equal(output.output, command.stdout, 'No late evidence after denial');
      } else {await after; assert.equal(output.output, command.stdout);}
      received = output.output;
      return {data: {info: {finish: 'stop'}, parts: [{type: 'text', text: 'Finished fixture'}]}};
    },
  }};
  hooks = await nativeTaskPlugin({client, directory});
  await hooks['command.execute.before']({command: 'harness-task', arguments: '', sessionID: parent});
  try {
    await hooks['chat.message']({sessionID: parent}, {message: {agent: 'build', model: {providerID: 'fixture', modelID: 'fixture'}}});
    const report = JSON.parse(await hooks.tool.harness_task.execute({}, {sessionID: parent, abort: new AbortController().signal, ask: async () => {}, metadata: async () => {}}));
    assert.equal(report.termination.verified, true);
    const raw = JSON.parse(fs.readFileSync(report.artifacts + '/tool-events.json'));
    assert.ok(!JSON.stringify(raw).includes('Type compatibility observation'));
    if (mode === 'off') {assert.equal(report.typeCompatibility, undefined); assert.equal(fs.existsSync(report.artifacts + '/type-compat.json'), false);}
    else {
      const diagnostic = JSON.parse(fs.readFileSync(report.artifacts + '/type-compat.json'));
      assert.equal(diagnostic.runs.length, mode === 'denial-before' ? 0 : 1);
      if (mode === 'queued-write') {assert.equal(diagnostic.current, false); assert.match(received, /2684/); assert.equal(aborts, 0);}
      else if (mode === 'denial-before') {assert.equal(diagnostic.status, 'NOT RUN'); assert.equal(aborts, 1);}
      else {assert.equal(diagnostic.runs[0].status, 'NOT RUN'); assert.equal(diagnostic.runs[0].delivered, undefined); assert.equal(aborts, 1);}
    }
    results.push({mode, terminationVerified: true, rawPreserved: true});
  } finally {await hooks.event({event: {type: 'command.executed', properties: {name: 'harness-task', sessionID: parent}}});}
}
console.log(JSON.stringify({passed: true, results, realProviderCalls: 0}));
} finally {
  for (const name of Object.keys(process.env)) if (!(name in savedEnv)) delete process.env[name];
  Object.assign(process.env, savedEnv); fs.rmSync(temp, {recursive: true, force: true});
}
