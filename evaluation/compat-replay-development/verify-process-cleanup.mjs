// Real POSIX groups, no provider, campaign or readiness publication.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const self = fileURLToPath(import.meta.url);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const mode = process.argv[2];
if (mode === '--descendant') {
  const ready = process.argv[3];
  process.on('SIGTERM', () => { fs.appendFileSync(ready + '.term', 'TERM\n'); console.log('descendant ignored SIGTERM'); });
  process.on('message', message => { if (message === 'finish') process.exit(0); });
  fs.writeFileSync(ready, JSON.stringify({pid: process.pid, parent: process.ppid}));
  setInterval(() => console.log('descendant heartbeat'), 20);
  setTimeout(() => process.exit(0), 30000); // Independent fixture lifetime cap.
} else if (mode === '--control') {
  fs.writeFileSync(process.argv[3], String(process.pid));
  setInterval(() => {}, 1000);
  setTimeout(() => process.exit(0), 120000);
} else if (mode === '--parent') {
  const [ready, behavior] = process.argv.slice(3);
  fs.writeFileSync(ready + '.parent', String(process.pid));
  const child = spawn(process.execPath, [self, '--descendant', ready], {stdio: ['ignore', 'inherit', 'inherit', 'ipc']});
  child.on('error', error => { throw error; });
  while (!fs.existsSync(ready)) await pause(5); // Handler registration handshake.
  if (behavior === 'normal') process.exit(0);
  if (behavior === 'family') {
    child.send('finish');
    await new Promise(resolve => child.once('close', resolve));
    process.exit(0);
  }
  setTimeout(() => process.exit(0), 30000);
} else if (mode === '--launcher') {
  // Test-only module mocks isolate historical campaign admission, while the
  // real prepareReady loop and executeStep run real processes. No production
  // argument or environment variable can bypass readiness checks.
  const [root, behavior] = process.argv.slice(3), ready = path.join(root, 'ready');
  const {mock} = await import('node:test');
  const commands = behavior === 'command-error' ? [[process.execPath, '-e', 'process.exit(4)']] :
    [[process.execPath, self, '--parent', ready, ['residue', 'known-escape'].includes(behavior) ? 'normal' : 'timeout']];
  commands.push([process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(root + '/next')},'started')`]);
  mock.module(new URL('./readiness.mjs', import.meta.url).href, {namedExports: {
    sourceManifest: () => ({}), snapshot: () => ({}), verifySourceCommit: () => {}, verifyCI: () => {},
    requiredSteps: ['first', 'second'], preparationCommands: () => commands,
    verifyReadiness: () => fs.writeFileSync(root + '/published', 'unexpected'),
  }});
  if (['inspect-error', 'stop-error', 'identity-reuse', 'retired-group', 'known-escape'].includes(behavior)) {
    const cp = await import('node:child_process'), {syncBuiltinESMExports} = await import('node:module');
    const original = cp.default.spawnSync, originalKill = process.kill;
    let descendantObserved = false;
    cp.default.spawnSync = (bin, args, options) => {
      if (bin !== '/bin/ps') return original(bin, args, options);
      if (behavior === 'inspect-error' && fs.existsSync(ready)) return {status: 1, stderr: 'fixture: process inspection denied (EPERM)'};
      const r = original(bin, args, options);
      if (behavior === 'known-escape' && fs.existsSync(ready)) {
        const pid = JSON.parse(fs.readFileSync(ready)).pid;
        if (descendantObserved) r.stdout = r.stdout.split('\n').map(line => line.replace(
          new RegExp('^(\\s*' + pid + '\\s+)\\d+(\\s+)'), (_, prefix, gap) => prefix + pid + gap)).join('\n');
        descendantObserved = true; // First snapshot records its real group identity.
      }
      if (fs.existsSync(ready) && ['identity-reuse', 'retired-group'].includes(behavior)) {
        const pgid = +fs.readFileSync(ready + '.parent', 'utf8');
        if (behavior === 'identity-reuse') r.stdout = r.stdout.split('\n').map(line =>
          new RegExp('^\\s*' + pgid + '\\s').test(line) ? line.replace(/\w{3} \w{3}\s+\d+ \d+:\d+:\d+ \d{4}/, 'Mon Jan  1 00:00:00 2024') : line).join('\n');
        else r.stdout = r.stdout.split('\n').filter(line => !new RegExp('^\\s*\\d+\\s+' + pgid + '\\s').test(line)).join('\n');
      }
      return r;
    };
    process.kill = (pid, signal) => {
      fs.appendFileSync(root + '/signals', JSON.stringify({pid, signal}) + '\n');
      if (behavior === 'stop-error') { const error = Error('fixture: group stop denied (EPERM)'); error.code = 'EPERM'; throw error; }
      return originalKill(pid, signal);
    };
    syncBuiltinESMExports();
  }
  const {prepareReady} = await import('./prepare-ready.mjs');
  try {
    await prepareReady({output: root + '/output', hostOpenCode: process.execPath, linuxOpenCode: process.execPath, executionImage: 'fixture'});
    fs.writeFileSync(root + '/outcome', 'fulfilled');
  } catch (error) { fs.writeFileSync(root + '/outcome', error.message); process.exitCode = 1; }
} else {
  const {executeStep} = await import('./prepare-ready.mjs');
  function table() {
    const r = spawnSync('/bin/ps', ['-axo', 'pid=,pgid=,stat=,lstart='], {encoding: 'utf8', env: {...process.env, LC_ALL: 'C'}, timeout: 2000});
    assert.equal(r.status, 0, r.error?.message ?? r.stderr);
    return r.stdout.trim().split('\n').map(line => {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
      assert.ok(m, 'unparseable process row');
      return {pid: +m[1], pgid: +m[2], state: m[3], identity: m[1] + ':' + m[4]};
    });
  }
  const active = row => row && !/^[ZX]/.test(row.state);
  async function until(predicate, limit = 5000) {
    const end = Date.now() + limit;
    while (!predicate()) { assert.ok(Date.now() < end, 'fixture handshake/cleanup deadline'); await pause(20); }
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'preparation-processes-'));
  const rows = [];
  const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  async function cleanupGroup(pgid, identity) {
    assert.ok(Number.isSafeInteger(pgid) && pgid > 1);
    const members = table().filter(row => row.pgid === pgid);
    if (members.some(active)) {
      if (identity) assert.ok(members.some(row => row.identity === identity), 'fallback ownership lost');
      try { process.kill(-pgid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    await until(() => !table().some(row => row.pgid === pgid)); // Also require orphan zombies to be reaped.
  }
  // Each fixture owns its independent fallback, even when executeStep is broken.
  async function defect(name, behavior) {
    const ready = path.join(temp, name + '.ready');
    let pgid, descendant;
    try {
      const started = Date.now();
      const settled = executeStep({name, argv: [process.execPath, self, '--parent', ready, behavior], output: temp, timeoutMs: 2000})
        .then(value => ({fulfilled: true, value}), error => ({fulfilled: false, error: error.message}));
      await until(() => fs.existsSync(ready));
      pgid = +fs.readFileSync(ready + '.parent', 'utf8');
      const pid = JSON.parse(fs.readFileSync(ready)).pid;
      descendant = table().find(row => row.pid === pid);
      assert.ok(active(descendant), 'descendant actually running after handshake');
      assert.equal(descendant.pgid, pgid, 'descendant belongs to step group');
      const outcome = await settled;
      const remaining = table().find(row => row.pid === pid && row.identity === descendant.identity);
      const receipt = JSON.parse(fs.readFileSync(path.join(temp, name + '.json')));
      rows.push({name, fulfilled: outcome.fulfilled, descendantRunning: !!active(remaining), sameGroup: descendant.pgid === pgid,
        elapsedMs: Date.now() - started, exitCode: receipt.exitCode, signal: receipt.signal, error: receipt.error, cleanup: receipt.cleanup ?? null});
      assert.equal(active(remaining) || false, false, 'step settled with a running descendant');
      assert.equal(outcome.fulfilled, false, 'residual work must not produce PASS');
      assert.equal(receipt.cleanup.verified, true);
      assert.deepEqual(receipt.cleanup.signals, ['SIGTERM', 'SIGKILL']);
      assert.ok(fs.existsSync(ready + '.term'), 'descendant received soft stop');
      assert.equal(receipt.log.stable, true);
      assert.equal(digest(receipt.log.path), receipt.log.sha256);
      const bytes = fs.readFileSync(receipt.log.path);
      assert.match(bytes.toString(), /descendant ignored SIGTERM[\s\S]+descendant heartbeat/, 'descendant kept writing during soft stop');
      await pause(150);
      assert.deepEqual(fs.readFileSync(receipt.log.path), bytes, 'log stable after final receipt');
      assert.equal(digest(receipt.log.path), receipt.log.sha256);
    } finally {
      if (!pgid && fs.existsSync(ready + '.parent')) pgid = +fs.readFileSync(ready + '.parent', 'utf8');
      if (pgid) await cleanupGroup(pgid, descendant?.identity);
    }
  }
  async function launchCase(name, behavior, signals = []) {
    const root = path.join(temp, name); fs.mkdirSync(root);
    const ready = path.join(root, 'ready');
    const launcher = spawn(process.execPath, ['--experimental-test-module-mocks', self, '--launcher', root, behavior], {stdio: ['ignore', 'ignore', 'pipe']});
    let stderr = '', closed = false;
    launcher.stderr.on('data', b => { stderr += b; });
    const ended = new Promise(resolve => launcher.once('close', code => { closed = true; resolve(code); }));
    let pgid, identity;
    try {
      if (behavior !== 'command-error') {
        await until(() => fs.existsSync(ready));
        pgid = +fs.readFileSync(ready + '.parent', 'utf8');
        const descendant = table().find(row => row.pid === JSON.parse(fs.readFileSync(ready)).pid);
        assert.ok(active(descendant)); assert.equal(descendant.pgid, pgid); identity = descendant.identity;
        if (behavior === 'stop-error') launcher.kill('SIGTERM');
        if (signals.length) {
          launcher.kill(signals[0]);
          await until(() => fs.existsSync(ready + '.term'));
          assert.equal(closed, false, 'launcher remains alive during cleanup after parent close');
          for (const signal of signals.slice(1)) launcher.kill(signal);
        }
      }
      const file = root + '/output/first.json';
      await until(() => fs.existsSync(file), 15000).catch(error => { throw Error(name + ': ' + error.message + '; ' + stderr); });
      const receipt = JSON.parse(fs.readFileSync(file));
      assert.equal(fs.existsSync(root + '/next'), false, 'real sequential launcher blocked next step');
      assert.equal(fs.existsSync(root + '/published'), false);
      assert.equal(fs.existsSync(root + '/output/readiness.json'), false);
      if (['inspect-error', 'stop-error', 'identity-reuse', 'known-escape'].includes(behavior)) {
        assert.equal(receipt.cleanup.verified, false);
        assert.equal(receipt.log.sha256, null);
        assert.equal(receipt.log.stable, false);
        if (behavior === 'identity-reuse') assert.match(receipt.cleanup.error, /identity changed/);
        else if (behavior === 'known-escape') { assert.match(receipt.cleanup.error, /left its group/); assert.equal(receipt.exitCode, 0); assert.equal(receipt.signal, null); }
        else assert.match(receipt.cleanup.error, /EPERM/);
        const sent = fs.existsSync(root + '/signals') ? fs.readFileSync(root + '/signals', 'utf8').trim().split('\n').map(JSON.parse) : [];
        assert.equal(sent.length, behavior === 'stop-error' ? 1 : 0);
        if (sent.length) { assert.equal(sent[0].pid, -pgid); assert.equal(sent[0].signal, 'SIGTERM'); }
      } else if (behavior === 'retired-group') {
        // Simulated empty observation retires ownership. A later timeout must
        // never send a delayed SIGKILL even if the number appears again.
        assert.equal(receipt.cleanup.verified, false); // Parent has not closed.
        assert.equal(fs.existsSync(root + '/signals'), false);
      } else {
        assert.equal(receipt.cleanup.verified, true);
        if (signals.length) {
          assert.equal(receipt.error, 'launcher interrupted: ' + signals[0]);
          assert.deepEqual(receipt.cleanup.signals, ['SIGTERM', 'SIGKILL']);
          assert.equal(table().some(row => row.pgid === pgid && active(row)), false);
        }
        if (behavior === 'command-error') { assert.equal(receipt.exitCode, 4); assert.equal(receipt.signal, null); }
      }
      rows.push({name, exitCode: receipt.exitCode, signal: receipt.signal, error: receipt.error, cleanup: receipt.cleanup, nextStepStarted: false});
    } finally {
      if (!pgid && fs.existsSync(ready + '.parent')) pgid = +fs.readFileSync(ready + '.parent', 'utf8');
      if (pgid) await cleanupGroup(pgid, identity);
      try { await until(() => closed, 5000); }
      catch (error) { launcher.kill('SIGKILL'); await ended; throw error; }
      assert.equal(await ended, 1, name + ': ' + stderr);
    }
  }
  const failures = [];
  const controlReady = temp + '/control.ready';
  const control = spawn(process.execPath, [self, '--control', controlReady], {detached: true, stdio: 'ignore'});
  const controlEnded = new Promise(resolve => control.once('close', resolve));
  try {
    await until(() => fs.existsSync(controlReady));
    const controlIdentity = table().find(row => row.pid === control.pid).identity;
    for (const [name, behavior] of [['timeout-descendant', 'timeout'], ['successful-parent-descendant', 'normal']]) {
      try { await defect(name, behavior); } catch (error) { failures.push({name, message: error.message}); }
    }
    if (mode !== '--defects-only') {
      const ready = temp + '/family.ready', started = Date.now();
      try {
        const family = await executeStep({name: 'normal-family', argv: [process.execPath, self, '--parent', ready, 'family'], output: temp});
        assert.equal(family.cleanup.status, 'empty'); assert.deepEqual(family.cleanup.signals, []);
        assert.ok(Date.now() - started < 2000, 'normal completion does not wait five seconds');
        rows.push({name: 'normal-family', elapsedMs: Date.now() - started, cleanup: family.cleanup});
      } finally { if (fs.existsSync(ready + '.parent')) await cleanupGroup(+fs.readFileSync(ready + '.parent', 'utf8')); }
      for (const signal of ['SIGINT', 'SIGTERM']) await launchCase('launcher-' + signal, 'signal', [signal]);
      await launchCase('repeated-cancellation', 'signal', ['SIGINT', 'SIGTERM', 'SIGINT']);
      for (const behavior of ['command-error', 'residue', 'inspect-error', 'stop-error', 'identity-reuse', 'retired-group', 'known-escape']) await launchCase(behavior, behavior);
      await assert.rejects(() => executeStep({name: 'spawn-error', argv: [temp + '/missing-executable'], output: temp}));
      const failed = JSON.parse(fs.readFileSync(temp + '/spawn-error.json'));
      assert.equal(failed.cleanup.pgid, null); assert.deepEqual(failed.cleanup.signals, []);
      assert.equal(failed.cleanup.status, 'not-started'); assert.match(failed.error, /ENOENT/);
      rows.push({name: 'spawn-error', exitCode: failed.exitCode, error: failed.error, cleanup: failed.cleanup});
    }
    assert.ok(table().some(row => row.identity === controlIdentity && active(row)), 'unrelated control group survived all stops');
    const report = {node: process.version, platform: process.platform, architecture: process.arch, rows, failures, fallbackCleanup: 'confirmed', realProviderCalls: 0};
    console.log(JSON.stringify(report, null, 2));
    if (process.env.PREPARATION_TEST_REPORT) fs.writeFileSync(process.env.PREPARATION_TEST_REPORT, JSON.stringify(report, null, 2));
    assert.deepEqual(failures, []);
  } finally {
    await cleanupGroup(control.pid); await controlEnded;
    fs.rmSync(temp, {recursive: true, force: true});
  }
}
