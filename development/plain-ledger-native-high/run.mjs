// One Node-project slot; reuse native execution, admission, capture and cleanup.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runComparison} from '../native-task-ab/run-comparison.mjs';
import {runTask} from '../polybench-pilot/run.mjs';
import {startContainer,image} from '../native-task-integrated/container-session.mjs';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
import {captureCandidate} from '../polybench-pilot/capture.mjs';

export async function run(root, extra={}) {
  const freezeBytes=fs.readFileSync(path.join(root,'freeze.json'));
  const f=JSON.parse(freezeBytes);
  if(f.image!==image)throw Error('Node image differs from freeze');
  if(extra.fetchImpl) {
    if(f.experimentKind!=='plain-ledger-native-high-preflight')throw Error('Invalid scripted kind');
  } else {
    if(f.experimentKind!=='plain-ledger-native-high'||!f.controlsPassed||!f.authorIsolationPassed)throw Error('Admission incomplete');
    const {commit}=JSON.parse(fs.readFileSync(path.join(root,'freeze-commit.json')));
    if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Invalid freeze commit');
    const file='development/plain-ledger-native-high/manifest.json';
    const bytes=execFileSync('git',['show',commit+':'+file]);
    if(!bytes.equals(fs.readFileSync(file))||JSON.parse(bytes).freezeSha256!==createHash('sha256').update(freezeBytes).digest('hex'))throw Error('Freeze changed');
  }
  return runComparison({root,startContainer:async options=>{
    const session=await startContainer({...options,workMemoryMb:1536,memoryMb:3072});
    try {
      const prep=session.exec(['node','-e',"require('fs').writeFileSync('/work/config/project-shell.sh','true\\n')"]);
      const baseline=session.exec(['git','rev-parse','HEAD']);
      const count=session.exec(['git','rev-list','--all','--count']);
      const remotes=session.exec(['git','remote']);
      if(prep.status!==0||baseline.status!==0||count.status!==0||count.stdout.trim()!=='1'||remotes.status!==0||remotes.stdout.trim())throw Error('Fresh project preparation failed');
      session.baseline=baseline.stdout.trim();
      // runTask only uses this PATH. Container creation above uses the ordinary
      // pinned Node image, without alternate-image preparation or mounts.
      session.preparedEnvironment={projectPath:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'};
      return session;
    } catch(error) {session.close();throw error;}
  },stopWorkload,captureCandidate,runTaskImplementation:runTask,readAuth:()=>{
    const a=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/opencode/auth.json'))).openai;
    if(a?.type!=='oauth'||!a.access||!a.accountId||a.expires<=Date.now())throw Error('Existing authorization unavailable or expired');
    return {access:a.access,accountId:a.accountId};
  },...extra});
}
if(process.argv[1]===fileURLToPath(import.meta.url))await run(path.resolve(process.argv[2]??'local/plain-ledger-native-high/batch'));
