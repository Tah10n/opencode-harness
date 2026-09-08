import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { materializeNativeTemplate } from '../lib/native-template.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'native-template-check-'));
const outputDirectory = path.join(temporary, 'bundle with spaces');
materializeNativeTemplate({ repositoryRoot, outputDirectory, dryRun: true });
assert.equal(fs.existsSync(outputDirectory), false);
materializeNativeTemplate({ repositoryRoot, outputDirectory });
assert.deepEqual(fs.readdirSync(outputDirectory).sort(), ['core.md', 'opencode.json']);
const configBytes = fs.readFileSync(path.join(outputDirectory, 'opencode.json'));
const config = JSON.parse(configBytes);
assert.deepEqual(Object.keys(config).sort(), ['$schema', 'instructions']);
assert.equal(fs.readFileSync(config.instructions[0], 'utf8'),
  fs.readFileSync(path.join(repositoryRoot, 'profiles/native/core.md'), 'utf8'));
assert.throws(() => materializeNativeTemplate({ repositoryRoot, outputDirectory }), /already exist/);
assert.deepEqual(fs.readFileSync(path.join(outputDirectory, 'opencode.json')), configBytes);
const linked = path.join(temporary, 'linked');
fs.symlinkSync(outputDirectory, linked);
assert.throws(() => materializeNativeTemplate({ repositoryRoot, outputDirectory: linked }), /already exist/);
assert.throws(() => materializeNativeTemplate({ repositoryRoot, outputDirectory: 'relative' }), /absolute/);
// The native CLI must work without historical materialization or runtime files.
const minimal = path.join(temporary, 'minimal');
for (const name of ['scripts', 'lib', 'profiles/native']) fs.mkdirSync(path.join(minimal, name), { recursive: true });
for (const file of ['scripts/profile-materialize.mjs', 'lib/native-template.mjs', 'profiles/native/core.md'])
  fs.copyFileSync(path.join(repositoryRoot, file), path.join(minimal, file));
const cli = (...args) => spawnSync(process.execPath, [path.join(minimal, 'scripts/profile-materialize.mjs'), ...args], { encoding: 'utf8' });
const isolated = path.join(temporary, 'isolated');
const installed = cli('--native', '--profile', 'core', '--output', isolated);
assert.equal(installed.status, 0, installed.stderr);
assert.deepEqual(fs.readdirSync(isolated).sort(), ['core.md', 'opencode.json']);
for (const extra of [['--force'], ['--allow-dirty'], ['--profile', 'deep']]) {
  const refused = cli('--native', '--profile', 'core', '--output', path.join(temporary, 'refused'), ...extra);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /PROFILE_V3_ARGUMENT/);
  assert.equal(fs.existsSync(path.join(temporary, 'refused')), false);
}
console.log(JSON.stringify({ passed: true, temporary, checks: ['two-file bundle', 'settings preserved', 'dry run', 'collision refusal', 'symlink refusal', 'absolute path', 'native CLI without historical code', 'unsupported flags refused'] }));
