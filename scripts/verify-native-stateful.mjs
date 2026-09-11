import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stale, guarded, repaired, beforeOnly } from '../fixtures/native-stateful/tests.mjs';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'native-stateful-'));
const source = fs.readFileSync(new URL('../fixtures/native-stateful/example.mjs', import.meta.url), 'utf8');
const rows = [];
try {
  for (const [name, test, disabled, exit] of [
    ['A-vacuous-old-test', stale, false, 0],
    ['B-precondition-detects-lost-state', guarded, false, 1],
    ['C-restored-setup-and-empty-idempotency', repaired, false, 0],
    ['D-postcondition-detects-disabled-transition', repaired, true, 1],
    ['E-empty-idempotency-with-disabled-transition', repaired, true, 0],
    ['F-precondition-only-is-insufficient', beforeOnly, true, 0],
  ]) {
    const dir = path.join(temp, name); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'example.mjs'), disabled ? source.replace('store.delete(record.id)', 'void record.id') : source);
    fs.writeFileSync(path.join(dir, 'example.test.mjs'), test);
    const result = spawnSync(process.execPath, ['--test', ...(name.startsWith('E-') ? ['--test-name-pattern=empty idempotency'] : []), 'example.test.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, exit, name + '\n' + result.stdout + result.stderr);
    if (name.startsWith('B-')) assert.match(result.stdout, /undefined/);
    rows.push({ name, exit: result.status, stdout: result.stdout, stderr: result.stderr });
  }
  console.log(JSON.stringify({ passed: true, realProviderRequests: 0, rows }, null, 2));
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
