// Two frozen direct slots; existing native runner, recorder, stop and capture.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runComparison} from '../native-task-ab/run-comparison.mjs';
import {startContainer, image} from '../native-task-integrated/container-session.mjs';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
import {captureCandidate} from '../polybench-pilot/capture.mjs';

const root=path.resolve(process.argv[2]??'local/investigation-direct-ledger-pair/batch');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const frozenBytes=fs.readFileSync(path.join(root,'freeze.json'));
const frozen=JSON.parse(frozenBytes);
const file='development/investigation-direct-ledger-pair/manifest.json';
const committed=execFileSync('git',['show','HEAD:'+file]);
const manifest=JSON.parse(committed);
if(!committed.equals(fs.readFileSync(file))||manifest.freezeSha256!==sha(frozenBytes)||
   frozen.image!==image||frozen.runtimeSha!==manifest.runtimeSha||
   frozen.experimentKind!=='investigation-direct-ledger-pair')throw Error('Frozen direct pair changed');

const result=await runComparison({root,startContainer:async options=>{
  const session=await startContainer({...options,workMemoryMb:1536,memoryMb:3072});
  try {
    const prepared=session.exec(['node','-e',"require('fs').writeFileSync('/work/config/project-shell.sh','true\\n')"]);
    const baseline=session.exec(['git','rev-parse','HEAD']);
    const count=session.exec(['git','rev-list','--all','--count']);
    const remotes=session.exec(['git','remote']);
    if(prepared.status!==0||baseline.status!==0||count.status!==0||count.stdout.trim()!=='1'||
       remotes.status!==0||remotes.stdout.trim())throw Error('Clean one-commit project preparation failed');
    session.baseline=baseline.stdout.trim();
    session.preparedEnvironment={projectPath:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'};
    return session;
  }catch(error){session.close();throw error;}
},stopWorkload,captureCandidate,readAuth:()=>{
  const a=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/opencode/auth.json'))).openai;
  if(a?.type!=='oauth'||!a.access||!a.accountId||a.expires<=Date.now())
    throw Error('Existing authorization unavailable or expired');
  return {access:a.access,accountId:a.accountId};
}});
console.log(JSON.stringify(result));
if(result.status!=='finished')process.exitCode=2;
