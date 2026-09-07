import assert from 'node:assert/strict';
import test from 'node:test';
import { createContainerCleanup } from '../lib/sandbox.mjs';
const name = 'verified-change-12345678-1234-1234-1234-123456789abc';
const id = 'a'.repeat(64);
const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '', timedOut: false, cancelled: false, truncated: false, spawnError: null, exitSignal: null });
const absent = () => ({ ...ok(), exitCode: 1, stderr: `Error: No such object: ${name}\n` });
const gone = () => ({ ...ok(), exitCode: 1, stderr: `Error response from daemon: No such container: ${name}\n` });
const present = () => ok(`${id} /${name} running\n`);
function cleanup(results) {
  const calls = [];
  const run = createContainerCleanup(name, async (argv, options) => {
    calls.push(argv); assert.equal(options.timeoutMs, 10_000); assert.equal(options.signal, undefined);
    const r = results.shift(); assert.ok(r, 'unexpected cleanup retry'); if (r instanceof Error) throw r; return r;
  });
  return { run, calls };
}
test('auto-remove race is verified by precise missing response and immediate observations', async () => {
  const c = cleanup([present(), ok(`${id} ${name} running`), gone(), absent(), ok()]);
  const r = await c.run(); assert.equal(r.verified, true); assert.deepEqual(r.container, { name, id });
  assert.equal(r.before.state, 'present'); assert.equal(r.after.state, 'absent'); assert.equal(r.rm.exitCode, 1);
  assert.strictEqual(await c.run(), r); assert.equal(c.calls.length, 5);
});
test('already absent container is safe and cleanup is idempotent for concurrent callers', async () => {
  const c = cleanup([absent(), ok(), gone(), absent(), ok()]);
  const [a, b] = await Promise.all([c.run(), c.run()]); assert.strictEqual(a, b); assert.equal(c.calls.length, 5);
});
test('successful removal still requires immediate verified absence', async () => {
  const c = cleanup([present(), ok(id), ok(name), present(), ok(id)]);
  await assert.rejects(c.run, e => { assert.equal(e.message, 'SANDBOX_CLEANUP_UNVERIFIED'); assert.equal(e.cleanup.after.state, 'present'); return true; });
});
for (const [label, failure] of [
  ['daemon error', { ...ok(), exitCode: 1, stderr: 'Cannot connect to the Docker daemon' }],
  ['timeout', { ...ok(), exitCode: null, timedOut: true, exitSignal: 'SIGKILL' }],
  ['interruption', { ...ok(), exitCode: null, cancelled: true, exitSignal: 'SIGTERM' }],
  ['spawn error', new Error('spawn docker ENOENT')],
  ['truncated output', { ...ok(name), stderr: 'x'.repeat(9000), truncated: true }],
]) test(`${label} remains a refusal despite later empty inventory`, async () => {
  const c = cleanup([present(), ok(id), failure, absent(), ok()]);
  let first;
  await assert.rejects(c.run, e => {
    first = e; assert.equal(e.message, 'SANDBOX_CLEANUP_UNVERIFIED');
    assert.deepEqual(e.cleanup.container, { name, id }); assert.equal(e.cleanup.after.state, 'absent');
    assert.equal(e.cleanup.verified, false); assert.ok(e.cleanup.rm.stderr.length <= 4096);
    assert.deepEqual(e.cleanup.rm.argv, ['docker', 'rm', '--force', name]); return true;
  });
  await assert.rejects(c.run, e => e === first); assert.equal(c.calls.length, 5);
});
for (const index of [0, 1, 3, 4]) test(`observation error at command ${index} cannot become verified`, async () => {
  const results = [present(), ok(id), ok(name), absent(), ok()];
  results[index] = { ...ok(), exitCode: 1, stderr: 'daemon unavailable' };
  await assert.rejects(cleanup(results).run, /SANDBOX_CLEANUP_UNVERIFIED/);
});
test('a missing response for another container is not proof', async () => {
  await assert.rejects(cleanup([present(), ok(id), { ...gone(), stderr: 'Error response from daemon: No such container: other' }, absent(), ok()]).run, /SANDBOX_CLEANUP_UNVERIFIED/);
});
