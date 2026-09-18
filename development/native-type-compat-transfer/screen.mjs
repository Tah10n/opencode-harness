// Bounded, model-free admission check. No source mutations or provider imports.
// Run in the retained Node image; /repo is read-only and /out is disposable.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const root = '/repo/local/native-type-compat-transfer';
const prior = JSON.parse(fs.readFileSync('/repo/development/native-type-compat-offline-subscribe/repeatability/frozen-inputs.json'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const moduleRoot = root + '/candidate/lib';
const {captureTypeInputs, runTypeComparison, typeCompatProfile} = await import(pathToFileURL(moduleRoot + '/native-type-compat.mjs'));
const compiler = '/repo/local/native-type-compat-offline-subscribe/batch/bundle/node_modules/typescript/lib/typescript.js';
assert.equal(process.version, prior.node);
const modules = {};
for (const name of ['native-type-compat.mjs', 'native-type-compat-worker.mjs', 'native-type-compat-generator.mjs']) {
  const digest = hash(fs.readFileSync(moduleRoot + '/' + name));
  assert.equal(digest, prior.files['local/native-type-compat-offline-subscribe/batch/bundle/' + name]);
  modules[name] = digest;
}
assert.equal(hash(fs.readFileSync(compiler)), prior.files[compiler.slice('/repo/'.length)]);
const sources = JSON.parse(fs.readFileSync(root + '/sources.json'));
assert.deepEqual(sources.map(s => s.name), ['quick-lru', 'denque', 'async-mutex', 'emittery', 'eventemitter2', 'zen-observable']);
const results = [];
for (const source of sources) {
  const directory = root + '/baselines/' + source.name;
  const pkg = JSON.parse(fs.readFileSync(directory + '/package.json'));
  const entry = source.name === 'denque' ? 'index.d.ts' : undefined;
  const row = {...source, version: pkg.version, publicEntry: entry ?? pkg.types ?? pkg.typings ?? pkg.exports?.types ?? null,
    packageSha256: hash(fs.readFileSync(directory + '/package.json')), projectScripts: pkg.scripts ?? {}};
  try {
    const input = captureTypeInputs({directory, compiler, entry, profile: typeCompatProfile,
      rules: [{permission: '*', pattern: '*', action: 'allow'}]});
    row.surfaceHash = input.surfaceHash;
    row.declarations = input.files.map(([name, bytes]) => ({name, sha256: hash(bytes)}));
    // Exactly the same original declarations in both worlds. No seeded defect.
    const comparison = await runTypeComparison({compiler: input.compiler, libraries: input.libraries,
      specifier: input.specifier, baseline: input.files, candidate: input.files});
    assert.equal(comparison.process.terminationVerified, true);
    row.comparison = comparison;
    row.status = comparison.status;
    row.reason = comparison.reason ?? null;
    row.admissibleConsumers = comparison.consumers?.filter(c => c.status === 'no-difference-in-checked-scope').length ?? 0;
  } catch (error) {
    if (!error.status) throw error;
    row.status = error.status;
    row.reason = error.message.replaceAll(root, '<selection>');
    row.admissibleConsumers = 0;
  }
  results.push(row);
  console.log(JSON.stringify({name: row.name, status: row.status, reason: row.reason, consumers: row.admissibleConsumers}));
}
fs.writeFileSync('/out/selection.json', JSON.stringify({runtimeSha: prior.runtimeSha, image: prior.image,
  node: process.version, compilerSha256: hash(fs.readFileSync(compiler)), modules,
  profile: typeCompatProfile, baselineOnly: true, realProviderRequests: 0, results}, null, 2) + '\n');
