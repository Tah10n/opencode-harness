// Campaign wiring only: same session, transport, observer, cancellation and capture.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {runComparison} from '../native-task-ab/run-comparison.mjs';
import {startContainer} from '../native-task-integrated/container-session.mjs';
import {runNativePhase} from '../native-task-abc/native-run.mjs';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
import {captureCandidate} from '../native-task-ab/capture-candidate.mjs';
export async function runTask(session,options){
 if(!['OFF','ON'].includes(options.arm))throw Error('Unknown arm');
 const result=await runNativePhase(session,{...options,strategy:'direct'},{spawnProcess:(cmd,args,settings)=>{
  const at=args.indexOf(session.name);if(at<0)throw Error('Container missing');
  const env=['CONTEXT','CHECKS','SENSITIVITY','INVESTIGATION','COMMAND_HINTS','EXTRA_ATTENTION'].map(k=>'HARNESS_TASK_'+k+'=0');
  env.push('HARNESS_TASK_TYPE_COMPAT='+(options.arm==='ON'?'1':'0'),'HARNESS_TASK_TYPE_COMPAT_PROFILE=returned-callable-strict-v1','HARNESS_TASK_TYPE_COMPAT_COMPILER=/template/node_modules/typescript/lib/typescript.js','HARNESS_TASK_TYPE_COMPAT_NODE=/usr/local/bin/node');
  return spawn(cmd,[...args.slice(0,at),...env.flatMap(v=>['--env',v]),...args.slice(at)],settings);
 }});
 const {events,stderr,...summary}=result;
 return {...summary,phaseCount:1,continuationApplied:false,nativeCompleted:result.exitCode===0&&!result.timedOut&&!result.parseErrors&&!events.some(e=>e.type==='error')&&events.some(e=>e.type==='step_finish'&&e.part?.reason==='stop')};
}
export const run=(root,extra={})=>runComparison({root,startContainer:a=>startContainer({...a,workMemoryMb:1536,memoryMb:3072}),stopWorkload,captureCandidate,runTaskImplementation:runTask,readAuth:()=>{const a=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/opencode/auth.json'))).openai;if(a?.type!=='oauth'||!a.access||!a.accountId||a.expires<=Date.now())throw Error('Existing authorization unavailable or expired');return{access:a.access,accountId:a.accountId};},...extra});
if(process.argv[1]===fileURLToPath(import.meta.url))await run(path.resolve(process.argv[2]));
