import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createOpenCodeSession } from '../lib/opencode.mjs';

// Scripted executables reproduce the host boundary; no OpenCode/provider runs.
test('a plugin cleanup refusal survives a later empty session inventory', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'verified-change-session-cleanup-'));
  const bin = path.join(temp, 'bin'); fs.mkdirSync(bin);
  const receipt = { container: { name: 'verified-change-12345678-1234-1234-1234-123456789abc', id: 'a'.repeat(64) },
    rm: { exitCode: 1, timedOut: false, stderr: 'daemon error' }, before: { state: 'present' }, after: { state: 'absent' }, verified: false };
  fs.writeFileSync(path.join(bin, 'opencode'), `#!${process.execPath}\nconst fs=require('fs'),path=require('path');fs.writeFileSync(path.join(path.dirname(process.env.VERIFIED_CHANGE_SESSION_CONFIG),'cleanup-error.json'),${JSON.stringify(JSON.stringify({ cleanup: receipt }))});process.stdout.write(JSON.stringify({type:'step_finish',sessionID:'fixture',part:{reason:'stop'}})+'\\n');\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'docker'), `#!${process.execPath}\nprocess.exit(0);\n`, { mode: 0o755 });
  const previous = process.env.PATH;
  try {
    process.env.PATH = `${bin}${path.delimiter}${previous}`;
    const session = await createOpenCodeSession({ controlDirectory: path.join(temp, 'control'), sandbox: {} });
    await assert.rejects(() => session.prompt('scripted fixture only'), error => {
      assert.equal(error.message, 'SANDBOX_CLEANUP_UNVERIFIED'); assert.deepEqual(error.cleanup, receipt); return true;
    });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(temp, 'control/cleanup-error.json'))).cleanup, receipt);
  } finally { process.env.PATH = previous; }
});
