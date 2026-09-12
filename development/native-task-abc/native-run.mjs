// Experiment-only native continuation control. Not a harness controller or product mode.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import readline from 'node:readline';
export async function runNativePhase(session,{config,task,enabled,model,variant,limitMs,sessionID,stopWorkload,researchMs,researchStopped,signal,deadline=Date.now()+limitMs},{spawnProcess=spawn}={}) {
 const started=Date.now();
 const argv=['exec','--workdir','/work/repo','--env','PATH=/work/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','--env',`OPENCODE_CONFIG_CONTENT=${JSON.stringify(config)}`,
 ...(enabled?['--env','OPENCODE_CONFIG_DIR=/template','--env','HARNESS_TASK_FILE=/work/repo/TASK.md','--env',`HARNESS_TASK_TIMEOUT_MS=${limitMs}`]:[]),session.name,'/opt/opencode','run','--format','json','--agent','build','--model',model,...(variant?['--variant',variant]:[]),...(sessionID?['--session',sessionID]:[]),...(enabled?['--command','harness-task']:['--',task])];
 const stream=fs.createWriteStream(path.join(session.output,'events.jsonl'),{flags:'wx',mode:0o600});
 const events=[];let stderr='',parseErrors=0,timedOut=false,stopReason=null;
 let child,closed=false,fixed=false,result={},completedAt=null,researchBoundary='not-reached';
 let researchTimer,hardTimer,resolveDone;
 const done=new Promise(resolve=>{resolveDone=resolve;});
 const settle=()=>{
  if(fixed||!closed||(researchBoundary==='pending'&&!stopReason))return;
  fixed=true;clearTimeout(hardTimer);clearTimeout(researchTimer);signal?.removeEventListener('abort',cancel);
  resolveDone();
 };
 const stop=(kind,error)=>{
  if(fixed||stopReason)return;
  stopReason={kind,...(error?{name:error.name??'Error',message:error.message??String(error)}:{})};
  timedOut=kind==='hard_deadline';
  if(!closed)child?.kill('SIGKILL');
  settle();
 };
 const cancel=()=>stop(Date.now()>=deadline?'hard_deadline':'cancelled',signal.reason);
 // The hard deadline never waits for researchStopped or provider stream completion.
 hardTimer=setTimeout(()=>stop('hard_deadline'),Math.max(0,deadline-Date.now()));
 if(signal?.aborted||Date.now()>=deadline){closed=true;if(signal?.aborted)cancel();else stop('hard_deadline');}
 else {
  child=spawnProcess('docker',argv,{stdio:['ignore','pipe','pipe']});
  child.stderr.on('data',x=>stderr+=x);
  readline.createInterface({input:child.stdout}).on('line',line=>{
   try{const event=JSON.parse(line);if(event.type==='reasoning')return;events.push(event);stream.write(JSON.stringify(event)+'\n');}catch{parseErrors++;}
  });
  child.once('error',error=>{result.error=error.message;stop('process_error',error);});
  child.once('close',(exitCode,signal)=>{
   result={...result,exitCode,signal};closed=true;completedAt=Date.now();
   if(completedAt>=deadline&&!stopReason)stop('hard_deadline');
   settle();
  });
  signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted)cancel();
  if(researchMs!==undefined)researchTimer=setTimeout(()=>{
   if(fixed||stopReason)return;
   researchBoundary='pending';
   // Closing research admission does not terminate the native consumer of that response.
   Promise.resolve().then(()=>researchStopped?.()).then(()=>{
    if(fixed)return;researchBoundary='settled';settle();
   },error=>{
    if(fixed)return;researchBoundary='failed';stop('research_boundary_error',error);
   });
  },Math.max(0,started+researchMs-Date.now()));
 }
 await done;
 const executionElapsedMs=Date.now()-started,cleanupStarted=Date.now();
 let termination;
 try{termination=await stopWorkload(session);}catch(error){termination={terminationVerified:false,error:error.message};}
 await new Promise(r=>stream.end(r));fs.writeFileSync(path.join(session.output,'stderr.txt'),stderr);
 const summary={...result,termination,timedOut,stopReason,researchBoundary,completedAt,executionElapsedMs,cleanupElapsedMs:Date.now()-cleanupStarted,elapsedMs:Date.now()-started,parseErrors};
 fs.writeFileSync(path.join(session.output,'finished.json'),JSON.stringify(summary,null,2),{flag:'wx'});return {...summary,events,stderr};
}
export async function runTask(session,options){
 const started=Date.now(),deadline=started+options.limitMs,phases=[];
 const firstDir=path.join(session.output,'first');fs.mkdirSync(firstDir);
 const first=await runNativePhase({...session,output:firstDir},options);phases.push(first);
 // Snapshot before any B continuation, without touching the user's index.
 if(options.arm==='B'&&first.termination.terminationVerified){
  const r=session.exec(['node','-e',`const fs=require('fs'),{spawnSync}=require('child_process');const env={...process.env,GIT_INDEX_FILE:'/work/d0-index'};for(const args of [['read-tree','HEAD'],['add','-A']]){const r=spawnSync('git',args,{env,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);}const r=spawnSync('git',['diff','--cached','--binary','HEAD'],{env,encoding:'utf8',maxBuffer:32*1024*1024});if(r.status!==0)throw Error(r.stderr);fs.writeFileSync('/work/d0.patch',r.stdout);console.log(r.stdout);`]);
  if(r.status!==0)throw Error('B initial patch capture failed: '+r.stderr);fs.writeFileSync(path.join(session.output,'D0.patch'),r.stdout);
 }
 const sessionIDs=[...new Set(first.events.map(e=>e.sessionID).filter(Boolean))];
 const completed=first.exitCode===0&&!first.timedOut&&!first.parseErrors&&!first.events.some(e=>e.type==='error')&&first.events.some(e=>e.type==='step_finish'&&e.part?.reason==='stop');
 if(options.arm==='B'&&completed&&sessionIDs.length===1&&Date.now()<deadline&&(options.canContinue?.()??true)){
  const dir=path.join(session.output,'continuation');fs.mkdirSync(dir);
  phases.push(await runNativePhase({...session,output:dir},{...options,enabled:false,task:options.continuation,sessionID:sessionIDs[0],limitMs:deadline-Date.now()}));
 }
 const last=phases.at(-1),summary={exitCode:last.exitCode,termination:last.termination,timedOut:phases.some(p=>p.timedOut)||Date.now()>=deadline,elapsedMs:Date.now()-started,parseErrors:phases.reduce((n,p)=>n+p.parseErrors,0),phaseCount:phases.length,firstSessionID:sessionIDs.length===1?sessionIDs[0]:null,continuationApplied:phases.length===2};
 fs.writeFileSync(path.join(session.output,'finished.json'),JSON.stringify(summary,null,2),{flag:'wx'});return summary;
}
