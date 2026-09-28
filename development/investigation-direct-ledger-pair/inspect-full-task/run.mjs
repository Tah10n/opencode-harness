// One frozen direct slot; existing native runner, recorder, stop and capture.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runComparison} from '../../native-task-ab/run-comparison.mjs';
import {image} from '../../native-task-integrated/container-session.mjs';
import {startContainer,captureCandidate} from './session.mjs';
import {stopWorkload} from '../../native-task-utility/container/stop-workload.mjs';

const root=path.resolve(process.argv[2]??'local/investigation-inspect-full-task/batch');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const frozenBytes=fs.readFileSync(path.join(root,'freeze.json'));
const frozen=JSON.parse(frozenBytes);
const file='development/investigation-direct-ledger-pair/inspect-full-task/manifest.json';
const committed=execFileSync('git',['show','HEAD:'+file]);
const manifest=JSON.parse(committed);
if(!committed.equals(fs.readFileSync(file))||manifest.freezeSha256!==sha(frozenBytes)||
   frozen.image!==image||frozen.runtimeSha!==manifest.runtimeSha||
   frozen.experimentKind!=='investigation-inspect-full-task')throw Error('Frozen direct slot changed');

const result=await runComparison({root,startContainer,stopWorkload,captureCandidate,readAuth:()=>{
  const a=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/opencode/auth.json'))).openai;
  if(a?.type!=='oauth'||!a.access||!a.accountId||a.expires<=Date.now())
    throw Error('Existing authorization unavailable or expired');
  return {access:a.access,accountId:a.accountId};
}});
console.log(JSON.stringify(result));
if(result.status!=='finished')process.exitCode=2;
