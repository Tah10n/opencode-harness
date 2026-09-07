import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';

// These are ordinary regression tests using audited development copies. They do
// not load a frozen manifest, grader, result ledger, provider, or model session.
const bundle = process.env.VERIFIED_CHANGE_TEST_BUNDLE ?? fileURLToPath(new URL('..', import.meta.url));
const { runController } = await import(pathToFileURL(path.join(bundle, 'lib/controller.mjs')));
const { snapshotCandidate, checkScope, importDraft } = await import(pathToFileURL(path.join(bundle, 'lib/workspace.mjs')));
const reporter = path.join(bundle, 'lib/node-reporter.mjs');
function write(root, files) {
  for (const [file, bytes] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), bytes);
  }
}
function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
  assert.equal(result.status, 0, result.stderr); return result.stdout;
}
function repository(root, files) {
  fs.mkdirSync(root); write(root, files); git(root, 'init'); git(root, 'add', '.');
  git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture');
}
async function verify(snapshot, checks, generated = {}) {
  const generatedRoot = path.join(path.dirname(snapshot.directory), `${snapshot.name}-generated`);
  write(generatedRoot, Object.fromEntries(Object.entries(generated).map(([f, bytes]) => [f, bytes.replaceAll('/workspace/', snapshot.directory + '/')])));
  return checks.map(check => {
    const cwd = Object.hasOwn(generated, check.files[0]) ? generatedRoot : snapshot.directory;
    const execution = spawnSync(process.execPath, ['--test', `--test-reporter=${reporter}`, ...check.files], { cwd, encoding: 'utf8', timeout: 5000, env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT')) });
    assert.equal(execution.error, undefined); assert.ok([0, 1].includes(execution.status), execution.stderr);
    const r = JSON.parse(execution.stdout);
    return { id: check.id, status: r.status, assertions: r.failures, stdout: execution.stdout, stderr: execution.stderr };
  });
}
async function moduleAt(snapshot, file) { return import(pathToFileURL(path.join(snapshot.directory, 'src', file))); }
const semantics = {
  'catalog-language-fallback': async snapshot => {
    const { Catalog } = await moduleAt(snapshot, 'catalog.mjs');
    const messages = Object.assign(Object.create({ 'xx-ZZ': { x: 'inherited' } }), { en: { x: 'base' } });
    assert.equal(new Catalog(messages, 'en-AU-special').get('xx-ZZ', 'x'), 'base');
  },
  'env-recursive-expansion': async snapshot => {
    const { resolveEnv } = await moduleAt(snapshot, 'resolve.mjs');
    assert.equal(resolveEnv({ A: '${B}/end', B: '${C}', C: 'x=y' }).A, 'x=y/end');
    assert.equal(resolveEnv({ VALUE: 'literal', REF: '${VALUE}', TEXT: '$$VALUE $$${VALUE} ${REF}' }).TEXT, '$VALUE $literal literal');
  },
  'versions-prerelease-precedence': async snapshot => {
    const { parseVersion } = await moduleAt(snapshot, 'parse.mjs');
    const { compareVersions } = await moduleAt(snapshot, 'compare.mjs');
    assert.deepEqual(parseVersion('1.2.3-alpha.1-x9').pre, ['alpha', '1-x9']);
    assert.equal(Math.sign(compareVersions('1.2.3-Alpha', '1.2.3-alpha')), -1);
    assert.equal(Math.sign(compareVersions('1.2.3-alpha', '1.2.3-Alpha')), 1);
    for (const a of ['Alpha', 'alpha', 'alpha-z', 'a', 'Z']) for (const b of ['Alpha', 'alpha', 'alpha-z', 'a', 'Z']) {
      assert.equal(compareVersions(`1.2.3-${a}`, `1.2.3-${b}`) + compareVersions(`1.2.3-${b}`, `1.2.3-${a}`), 0);
    }
  },
  'edits-validation': async snapshot => {
    const { applyEdits } = await moduleAt(snapshot, 'edits.mjs');
    assert.equal(applyEdits('😀bc', [{ start: 3, end: 3, text: 'A' }, { start: 1, end: 3, text: 'X' }, { start: 3, end: 3, text: 'B' }]), '\ud83dXABc');
  },
};
for (const [name, semanticCheck] of Object.entries(semantics)) test(`saved scenario: ${name} keeps D0 and rejects harmful repair authority`, async () => {
  const data = JSON.parse(fs.readFileSync(new URL(`fixtures/known-repairs/${name}.json`, import.meta.url)));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'verified-change-regression-'));
  const candidate = path.join(temp, 'candidate'), baseline = path.join(temp, 'baseline');
  repository(candidate, data.baseline); fs.mkdirSync(baseline); write(baseline, data.baseline);
  const patch = path.join(temp, 'input.patch'); fs.writeFileSync(patch, data.patches.D0);
  let repairCalls = 0, assessmentCalls = 0;
  const report = await runController({ task: data.contracts.task, contracts: data.contracts,
    checks: [{ id: 'public', kind: 'node-test', files: ['test/public.test.mjs'] }], hypotheses: data.hypotheses,
    host: {
      draft: () => importDraft(candidate, patch), snapshot: name => snapshotCandidate(candidate, temp, name),
      scope: snapshot => checkScope(snapshot, baseline, ['src']),
      verify: (snapshot, checks) => verify(snapshot, checks, data.generated),
      assess: async () => { assessmentCalls++; return data.decision; },
      repair: async () => { repairCalls++; write(candidate, data.baseline); fs.writeFileSync(patch, data.patches.D1); await importDraft(candidate, patch); },
    } });
  assert.equal(report.stopReason, 'checks_passed'); assert.equal(report.selected.name, 'D0');
  assert.equal(repairCalls, 0); assert.equal(assessmentCalls, 1); assert.equal(report.repairs, 0);
  assert.deepEqual(report.passedProjectChecks, ['public']); assert.deepEqual(report.confirmed, []);
  assert.equal(report.semanticCorrectness, 'unproven');
  const selectedPatch = fs.readFileSync(report.selected.patchPath);
  assert.equal(selectedPatch.toString(), data.patches.D0);
  assert.equal(createHash('sha256').update(selectedPatch).digest('hex'), data.patchSha256.D0);
  const failed = report.unresolvedHypotheses.filter(h => h.result?.status === 'assertion_failed');
  assert.ok(failed.length > 0); assert.ok(failed.every(h => h.result.assertions.length && h.explanation));
  assert.ok(failed.every(h => h.source === 'generated_hypothesis'));
  if (name === 'edits-validation') assert.equal(failed[0].reason, 'disputed_assertion');
  else assert.ok(failed.every(h => h.reason === 'expected_result_unconfirmed'));
  await semanticCheck(report.selected);
  // Verify that the saved harmful patch would break the same behavior. This is
  // a development counterexample, never a new grade for the historical run.
  if (data.patches.D1) {
    const bad = path.join(temp, 'recorded-repair'); repository(bad, data.baseline);
    fs.writeFileSync(patch, data.patches.D1); await importDraft(bad, patch);
    await assert.rejects(() => semanticCheck({ directory: bad }), { code: 'ERR_ASSERTION' });
    if (name === 'versions-prerelease-precedence') {
      const { compareVersions } = await moduleAt({ directory: bad }, 'compare.mjs');
      assert.equal(compareVersions('1.2.3-Alpha', '1.2.3-alpha') + compareVersions('1.2.3-alpha', '1.2.3-Alpha'), -2);
    }
  }
});
test('real project assertion still repairs source and returns the D1 patch', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'verified-change-project-repair-'));
  const candidate = path.join(temp, 'candidate'), baseline = path.join(temp, 'baseline');
  const files = { 'src/value.mjs': 'export const value = 0;\n',
    'test/public.test.mjs': "import test from 'node:test';import assert from 'node:assert/strict';import {value} from '../src/value.mjs';test('project contract',()=>assert.equal(value,2));\n" };
  repository(candidate, files); fs.mkdirSync(baseline); write(baseline, files);
  const r = await runController({ task: 'Restore the public value to 2.', contracts: {}, hypotheses: [],
    checks: [{ id: 'public', kind: 'node-test', files: ['test/public.test.mjs'] }],
    host: { draft: async () => {}, snapshot: name => snapshotCandidate(candidate, temp, name), scope: s => checkScope(s, baseline, ['src']), verify,
      repair: async input => { assert.equal(input.diagnostics[0].check.source, 'existing_project_check');
        assert.equal(input.diagnostics[0].reproduced.status, 'assertion_failed'); write(candidate, { 'src/value.mjs': 'export const value = 2;\n' }); } } });
  assert.equal(r.repairs, 1); assert.equal(r.selected.name, 'D1'); assert.equal(r.stopReason, 'checks_passed');
  assert.match(fs.readFileSync(r.selected.patchPath, 'utf8'), /\+export const value = 2;/);
  assert.equal((await moduleAt(r.selected, 'value.mjs')).value, 2);
});
