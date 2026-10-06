// Thin wiring only. The shared scheduler owns admission, requests and deadlines.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {hashFile} from '../support/output-files.mjs';
import {runComparison,verifyFrozenSchedule} from '../support/scheduler.mjs';
import {startContainer,image} from '../support/container-session.mjs';
import {runNativePhase} from '../support/native-run.mjs';
import {stopWorkload} from '../support/stop-workload.mjs';
import {captureCandidate} from '../polybench/capture.mjs';
import {config,cleanEnvironment,command,repository,realBatch,executionManifest,schedule,frozenManifest,tasks,runId,conditionsHead} from './suite.mjs';
import {providerConfig} from './prepare.mjs';
import {manifest} from '../support/manifest.mjs';
import {existingConnection} from './auth.mjs';

export function verifyRealAdmission(root,f,seal,freezeSha256,executionImage=image) {
  if(path.resolve(root)!==realBatch||f.runId!==runId||f.experimentKind!=='feedback-development'||f.modelRunsAuthorized!==true)throw Error('Real admission requires the authorized canonical development batch');
  if(f.suite!==config.suite||f.model!=='openai/gpt-5.6-luna'||f.variant!=='high'||f.runtimeVersion!==config.runtimeVersion||f.nodeVersion!==config.nodeVersion||f.budgetMs!==600000||!/^sha256:[a-f0-9]{64}$/.test(f.executionImage??'')||f.executionImage!==executionImage)throw Error('Unapproved development model/environment/configuration');
  if(JSON.stringify(f.config)!==JSON.stringify(providerConfig(f.model,f.variant)))throw Error('Changed provider configuration');
  const expected=schedule.map(a=>({...a,source:path.join(realBatch,'inputs',a.task)}));
  if(JSON.stringify(f.attempts)!==JSON.stringify(expected))throw Error('Changed development inputs/order');
  for(const task of tasks)for(const arm of config.arms)if(JSON.stringify(f.inputManifests[task.id+'-'+arm])!==JSON.stringify(manifest(task.source)))throw Error('Changed public inputs');
  const plan=frozenManifest();
  for(const [file,value] of Object.entries({...plan.files,...plan.product}))if(f.files[path.join(repository,file)]!==value.sha256)throw Error('Unfrozen adapter/product file: '+file);
  if(seal.runId!==runId||seal.conditionsHead!==conditionsHead||seal.reviewedHead!==f.sourceCommit||seal.preRunSourceCommit!==f.sourceCommit||seal.freezeSha256!==freezeSha256||seal.sourceCommit!==f.sourceCommit||seal.executionImage!==f.executionImage)throw Error('Changed execution freeze');
  verifyFrozenSchedule(f,runTask,fetch);
}

export function verifyUnstarted(root) {
  if(fs.existsSync(path.join(root,'admission-started.json'))||fs.existsSync(path.join(root,'scheduling-paused.json'))||fs.existsSync(path.join(root,'runs'))&&fs.readdirSync(path.join(root,'runs')).length)throw Error('Previously admitted campaign must never be retried');
}

export async function runTask(session,options) {
  if(!config.arms.includes(options.arm))throw Error('Unknown feedback strategy');
  session.armMode='task';session.arm=options.arm;
  const result=await runNativePhase(session,{...options,enabled:true,strategy:options.arm},{spawnProcess:(cmd,args,settings)=>{
    const at=args.indexOf(session.name);if(at<0)throw Error('Missing container');
    const disabled=Object.entries(config.environment).flatMap(([key,value])=>['--env',key+'='+value]);
    return spawn(cmd,[...args.slice(0,at),...disabled,...args.slice(at)],{...settings,env:cleanEnvironment()});
  }});
  const {events,stderr,...summary}=result;
  return {...summary,phaseCount:1,continuationApplied:false,nativeCompleted:result.exitCode===0&&!result.timedOut&&!result.parseErrors&&!events.some(e=>e.type==='error')&&events.some(e=>e.type==='step_finish'&&e.part?.reason==='stop')};
}

export async function runPrepared(root,{scriptedFetch,authorizeModelRuns=false,readAuth}={}) {
  if(!authorizeModelRuns&&typeof scriptedFetch!=='function')throw Error('Explicit scripted provider or --authorize-model-runs required before credential access');
  if(scriptedFetch===fetch)throw Error('Fixtures cannot use the real provider transport');
  const f=JSON.parse(fs.readFileSync(path.join(root,'freeze.json')));
  let fetchImpl,connection;
  if(f.experimentKind==='fixture') {
    if(authorizeModelRuns||typeof scriptedFetch!=='function')throw Error('Fixtures require an explicit scripted provider and cannot authorize real calls');
    fetchImpl=scriptedFetch;readAuth??=()=>{throw Error('Fixture credential access forbidden');};
  }else {
    if(!authorizeModelRuns||scriptedFetch!==undefined)throw Error('Real runs require explicit authorization, never an implicit transport fallback');
    const published=fs.readFileSync(path.join(repository,executionManifest));
    if(!published.equals(Buffer.from(command('git',['show','HEAD:'+executionManifest],repository))))throw Error('Execution seal must be committed before admission');
    verifyRealAdmission(root,f,JSON.parse(published),hashFile(path.join(root,'freeze.json')).sha256);
    verifyUnstarted(root);
    command('git',['merge-base','--is-ancestor',f.sourceCommit,'HEAD'],repository);
    for(const [file,digest] of Object.entries({...frozenManifest().files,...frozenManifest().product})) {
      const committed=command('git',['show',f.sourceCommit+':'+file],repository,{encoding:null});
      if(createHash('sha256').update(committed).digest('hex')!==digest.sha256)throw Error('Executable source differs from verified source commit: '+file);
    }
    fetchImpl=fetch;
    if(!readAuth){connection=existingConnection({providerID:f.model.split('/')[0]});readAuth=connection.read;}
  }
  if(image!==f.executionImage)throw Error('Unfrozen execution image');
  verifyFrozenSchedule(f,runTask,fetchImpl);
  // Source/expiry/refresh readiness must succeed before any admission or slot marker.
  if(f.experimentKind!=='fixture')await readAuth();
  if(f.experimentKind!=='fixture')fs.writeFileSync(path.join(root,'admission-started.json'),JSON.stringify({sourceCommit:f.sourceCommit,freezeSha256:hashFile(path.join(root,'freeze.json')).sha256,at:new Date().toISOString()}),{flag:'wx',mode:0o600});
  try{return await runComparison({root,fetchImpl,readAuth,startContainer:async options=>{
    const started=performance.now();
    const session=await startContainer(options);
    try {session.preparationStartedMono=started;session.baseline=command('docker',['exec',session.name,'git','-C','/work/repo','rev-parse','HEAD'],root).trim();return session;}
    catch(error){session.close();throw error;}
  },runTaskImplementation:async(session,options)=>({...await runTask(session,options),preparationElapsedMs:Math.max(0,options.deadlineMono-f.budgetMs-session.preparationStartedMono)}),stopWorkload,captureCandidate});}
  finally{if(connection){let status;try{status=connection.safeStatus();}catch(error){status={providerID:'openai',sourceKind:connection.source.kind,ready:false,reason:error.reason??'status-unavailable'};}fs.writeFileSync(path.join(root,'connection-status.json'),JSON.stringify(status,null,2),{mode:0o600});}}
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [root,...flags]=process.argv.slice(2);
  if(root==='--check-auth'&&!flags.length){console.log(JSON.stringify(await existingConnection().readiness()));process.exit(0);}
  if(!root||!path.isAbsolute(root)||flags.some(flag=>flag!=='--authorize-model-runs'))throw Error('Usage: run.mjs ABS_CANONICAL_BATCH --authorize-model-runs');
  await runPrepared(root,{authorizeModelRuns:flags.includes('--authorize-model-runs')});
}
