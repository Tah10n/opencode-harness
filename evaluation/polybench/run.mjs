// Campaign wiring: reuse existing request capture, auth, admission and stop policy.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {prepareWorktreeDependencies} from './dependencies.mjs';
import {runComparison} from '../support/scheduler.mjs';
import {startContainer} from '../support/container-session.mjs';
import {runNativePhase} from '../support/native-run.mjs';
import {stopWorkload} from '../support/stop-workload.mjs';
import {captureCandidate} from './capture.mjs';
export async function runTask(session,options){
 session.arm=options.arm;
 if(!['P','C','T','H0','H1'].includes(options.arm))throw Error('Unknown PolyBench arm');
 if(Object.hasOwn(process.env,'OPENCODE_CONFIG_CONTENT'))throw Error('Existing inline override must be preserved; unsupported launch');
 const offline=JSON.parse(fs.readFileSync('fixtures/native-offline/build.json'));
 const prepared=session.exec(['node','-e',`require('fs').writeFileSync('/work/config/experiment.json',${JSON.stringify(JSON.stringify(options.config))})`]);
 if(prepared.status!==0)throw Error('Cannot prepare experiment configuration');
 const result=await runNativePhase(session,{...options,enabled:!['P','C'].includes(options.arm),config:offline,strategy:'direct'},{spawnProcess:(cmd,args,settings)=>{
  const at=args.indexOf(session.name);if(at<0)throw Error('Container missing');
  const env=['OPENCODE_CONFIG=/work/config/experiment.json','BASH_ENV=/work/config/project-shell.sh','GIT_LFS_SKIP_SMUDGE=1'];
  if(options.arm==='C')env.push('OPENCODE_CONFIG_DIR=/template');
  if(options.arm!=='P'){
   env.push(...['CONTEXT','CHECKS','SENSITIVITY','COMMAND_HINTS','EXTRA_ATTENTION','PRESERVATION_NUDGE'].map(k=>'HARNESS_TASK_'+k+'=0'));
   env.push('HARNESS_TASK_INVESTIGATION='+(options.arm==='T'?'1':'0'));
   env.push('HARNESS_TASK_TYPE_COMPAT='+(options.arm==='H1'?'1':'0'),'HARNESS_TASK_TYPE_COMPAT_PROFILE=returned-callable-strict-v1','HARNESS_TASK_TYPE_COMPAT_COMPILER=/template/node_modules/typescript/lib/typescript.js','HARNESS_TASK_TYPE_COMPAT_NODE=/diagnostic/node');
  }
  args=args.map(value=>value.startsWith('PATH=')?'PATH=/work/bin:'+session.preparedEnvironment.projectPath:value);
  return spawn(cmd,[...args.slice(0,at),...env.flatMap(v=>['--env',v]),...args.slice(at)],settings);
 }});
 const {events,stderr,...summary}=result;
 return {...summary,phaseCount:1,continuationApplied:false,nativeCompleted:result.exitCode===0&&!result.timedOut&&!result.parseErrors&&!events.some(e=>e.type==='error')&&events.some(e=>e.type==='step_finish'&&e.part?.reason==='stop')};
}
export async function run(root,extra={}){
 if(!extra.fetchImpl&&!extra.authorized)throw Error('Explicit --authorize-model-runs is required before credential access');
 const freeze=JSON.parse(fs.readFileSync(path.join(root,'freeze.json')));
 if(!extra.fetchImpl && freeze.experimentKind!=='polybench')throw Error('Scripted preparation cannot access provider');
 if(!extra.fetchImpl){
  if(freeze.controlsPassed!==true||freeze.authorIsolationPassed!==true)throw Error('Real admission requires controls and isolation');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
  if(manifest.freezeSha256!==createHash('sha256').update(fs.readFileSync(path.join(root,'freeze.json'))).digest('hex'))throw Error('Local freeze differs from committed manifest');
  if(freeze.campaign==='consolidated-v1'){
   const published='evaluation/polybench/campaigns/consolidated-v1/frozen-manifest.json';
   const committed=execFileSync('git',['show','HEAD:'+published]);
   if(!committed.equals(fs.readFileSync(path.join(root,'manifest.json'))))throw Error('Campaign freeze must be committed before model admission');
   execFileSync('git',['merge-base','--is-ancestor',freeze.adapterSha,'HEAD']);
  }
 }
 return runComparison({root,startContainer:async a=>{
  const preparedEnvironment=freeze.environments[a.source];if(!preparedEnvironment)throw Error('Unfrozen environment');
  const session=await startContainer({...a,preparedEnvironment,workMemoryMb:8192,memoryMb:12288});
  const startup=session.exec(['node','-e',`require('fs').writeFileSync('/work/config/project-shell.sh',${JSON.stringify((preparedEnvironment.startup??'')+'true\n')})`]);
  if(startup.status!==0){session.close();throw Error('Cannot preserve project shell startup');}
  try{prepareWorktreeDependencies(session,preparedEnvironment.dependencyDirectories);const baseline=session.exec(['git','rev-parse','HEAD']);if(baseline.status!==0)throw Error('Baseline unavailable');session.baseline=baseline.stdout.trim();return session;}catch(error){session.close();throw error;}
 },stopWorkload,captureCandidate,runTaskImplementation:runTask,readAuth:()=>{
  const a=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/opencode/auth.json'))).openai;
  if(a?.type!=='oauth'||!a.access||!a.accountId||a.expires<=Date.now())throw Error('Existing authorization unavailable or expired');
  return{access:a.access,accountId:a.accountId};
 },...extra});
}
if(process.argv[1]===fileURLToPath(import.meta.url))await run(path.resolve(process.argv[2]??'local/polybench/batch'),{authorized:process.argv.includes('--authorize-model-runs')});
