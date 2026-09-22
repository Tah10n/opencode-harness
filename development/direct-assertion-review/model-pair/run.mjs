// Campaign wiring: reuse existing request capture, auth, admission and stop policy.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {runComparison} from '../../native-task-ab/run-comparison.mjs';
import {startContainer} from '../../native-task-integrated/container-session.mjs';
import {runNativePhase} from '../../native-task-abc/native-run.mjs';
import {stopWorkload} from '../../native-task-utility/container/stop-workload.mjs';
import {captureCandidate} from '../../polybench-pilot/capture.mjs';
export async function runTask(session,options){
 session.arm=options.arm;
 if(!['AR0','AR1'].includes(options.arm))throw Error('Unknown pair arm');
 if(Object.hasOwn(process.env,'OPENCODE_CONFIG_CONTENT'))throw Error('Existing inline override must be preserved; unsupported launch');
 const offline=JSON.parse(fs.readFileSync('development/native-task-offline/build.json'));
 const prepared=session.exec(['node','-e',`require('fs').writeFileSync('/work/config/experiment.json',${JSON.stringify(JSON.stringify(options.config))})`]);
 if(prepared.status!==0)throw Error('Cannot prepare experiment configuration');
 const result=await runNativePhase(session,{...options,config:offline,strategy:'direct'},{spawnProcess:(cmd,args,settings)=>{
  const at=args.indexOf(session.name);if(at<0)throw Error('Container missing');
  const env=['OPENCODE_CONFIG=/work/config/experiment.json','BASH_ENV=/work/config/project-shell.sh','GIT_LFS_SKIP_SMUDGE=1'];
  if(options.arm!=='P'){
   env.push(...['CONTEXT','CHECKS','SENSITIVITY','INVESTIGATION','COMMAND_HINTS','EXTRA_ATTENTION'].map(k=>'HARNESS_TASK_'+k+'=0'));
   env.push('HARNESS_TASK_PRESERVATION_NUDGE=0');
   env.push('HARNESS_TASK_TYPE_COMPAT='+('0'),'HARNESS_TASK_TYPE_COMPAT_PROFILE=returned-callable-strict-v1','HARNESS_TASK_TYPE_COMPAT_COMPILER=/template/node_modules/typescript/lib/typescript.js','HARNESS_TASK_TYPE_COMPAT_NODE=/diagnostic/node');
  }
  args=args.map(value=>value.startsWith('PATH=')?'PATH=/work/bin:'+session.preparedEnvironment.projectPath:value);
  return spawn(cmd,[...args.slice(0,at),...env.flatMap(v=>['--env',v]),...args.slice(at)],settings);
 }});
 const {events,stderr,...summary}=result;
 return {...summary,phaseCount:1,continuationApplied:false,nativeCompleted:result.exitCode===0&&!result.timedOut&&!result.parseErrors&&!events.some(e=>e.type==='error')&&events.some(e=>e.type==='step_finish'&&e.part?.reason==='stop')};
}
export async function run(root,extra={}){
 const freeze=JSON.parse(fs.readFileSync(path.join(root,'freeze.json')));
 if(!extra.fetchImpl && freeze.experimentKind!=='assertion-review-pair')throw Error('Scripted preparation cannot access provider');
 if(!extra.fetchImpl){
  if(freeze.controlsPassed!==true||freeze.authorIsolationPassed!==true)throw Error('Real admission requires controls and isolation');
  const commit=JSON.parse(fs.readFileSync(path.join(root,'freeze-commit.json'))).commit;
  if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Invalid freeze commit');
  const file='development/direct-assertion-review/model-pair/manifest.json';
  const committed=execFileSync('git',['show',commit+':'+file]);
  if(!committed.equals(fs.readFileSync(file)))throw Error('Committed freeze changed');
  const manifest=JSON.parse(committed);
  if(manifest.freezeSha256!==createHash('sha256').update(fs.readFileSync(path.join(root,'freeze.json'))).digest('hex'))throw Error('Local freeze differs from committed manifest');
 }
 return runComparison({root,startContainer:async a=>{
  const session=await startContainer({...a,workMemoryMb:1536,memoryMb:3072});
  try {
   const setup=session.exec(['node','-e',"require('fs').writeFileSync('/work/config/project-shell.sh','true\\n')"]);
   const baseline=session.exec(['git','rev-parse','HEAD']),count=session.exec(['git','rev-list','--all','--count']),remotes=session.exec(['git','remote']);
   if(setup.status!==0||baseline.status!==0||count.status!==0||count.stdout.trim()!=='1'||remotes.status!==0||remotes.stdout.trim())throw Error('Fresh project preparation failed');
   const reflog=session.exec(['git','reflog','expire','--expire=all','--all']);if(reflog.status!==0)throw Error('Fresh baseline reflog removal failed');
   session.baseline=baseline.stdout.trim();session.preparedEnvironment={projectPath:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'};
   return session;
  }catch(error){session.close();throw error;}
 },stopWorkload,captureCandidate,runTaskImplementation:runTask,readAuth:()=>{
  const a=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/opencode/auth.json'))).openai;
  if(a?.type!=='oauth'||!a.access||!a.accountId||a.expires<=Date.now())throw Error('Existing authorization unavailable or expired');
  return{access:a.access,accountId:a.accountId};
 },...extra});
}
if(process.argv[1]===fileURLToPath(import.meta.url))await run(path.resolve(process.argv[2]??'local/direct-assertion-review-model-pair/batch'));
