// New independent series. Uses the existing transport, accounting and stop rules.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {startContainer} from '../native-task-ab/container-session.mjs';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
import {captureCandidate} from '../native-task-ab/capture-candidate.mjs';
import {runComparison} from '../native-task-ab/run-comparison.mjs';

const root = path.resolve(process.argv[2]);
const freeze = JSON.parse(fs.readFileSync(path.join(root,'freeze.json')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function readAuth() {
  const a=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/opencode/auth.json'),'utf8')).openai;
  if(a?.type!=='oauth'||!a.access||!a.accountId||!Number.isFinite(a.expires)||a.expires<=Date.now())throw Error('Existing OpenCode authorization unavailable or expired');
  return {access:a.access,accountId:a.accountId};
}
readAuth();
await runComparison({root, readAuth, captureCandidate, stopWorkload,
  startContainer: async args => {
    const row=freeze.attempts.find(a=>a.source===args.source);
    if(!row||sha(fs.readFileSync(row.seedPatch))!==row.seedSha256)throw Error('Frozen input patch mismatch');
    const session=await startContainer(args);
    try {
      const seed=fs.readFileSync(row.seedPatch,'utf8');
      const prepared=session.exec(['node','-e',`const fs=require('fs'),{spawnSync}=require('child_process');const result=spawnSync('git',['apply','--check','-'],{input:${JSON.stringify(seed)},encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);const applied=spawnSync('git',['apply','-'],{input:${JSON.stringify(seed)},encoding:'utf8'});if(applied.status!==0)throw Error(applied.stderr);`]);
      if(prepared.status!==0)throw Error('Cannot seed unfinished patch: '+prepared.stderr);
      return session;
    } catch(error) { session.close(); throw error; }
  },
});
