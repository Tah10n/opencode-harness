// Thin wiring only. The shared scheduler owns admission, requests and deadlines.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {runComparison,verifyFrozenSchedule} from '../support/scheduler.mjs';
import {startContainer,image} from '../support/container-session.mjs';
import {runNativePhase} from '../support/native-run.mjs';
import {stopWorkload} from '../support/stop-workload.mjs';
import {captureCandidate} from '../polybench/capture.mjs';
import {config,cleanEnvironment,command} from './suite.mjs';

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

export async function runPrepared(root,{scriptedFetch,readAuth=()=>{throw Error('No real model authorization in this stage');}}={}) {
  // No real-provider entry point is installed by this stage. Future authorization
  // must explicitly enable one; absent fixture transport fails before scheduling.
  if(typeof scriptedFetch!=='function')throw Error('Stage 2 only permits an explicit scripted provider');
  const f=JSON.parse(fs.readFileSync(path.join(root,'freeze.json')));
  if(f.experimentKind!=='fixture')throw Error('Stage 2 cannot execute benchmark task-runs');
  if(image!==f.executionImage)throw Error('Unfrozen execution image');
  verifyFrozenSchedule(f,runTask,scriptedFetch);
  return runComparison({root,fetchImpl:scriptedFetch,readAuth,startContainer:async options=>{
    const started=performance.now();
    const session=await startContainer(options);
    try {session.preparationStartedMono=started;session.baseline=command('docker',['exec',session.name,'git','-C','/work/repo','rev-parse','HEAD'],root).trim();return session;}
    catch(error){session.close();throw error;}
  },runTaskImplementation:async(session,options)=>({...await runTask(session,options),preparationElapsedMs:Math.max(0,options.deadlineMono-f.budgetMs-session.preparationStartedMono)}),stopWorkload,captureCandidate});
}
