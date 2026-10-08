import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {startContainer,image} from '../support/container-session.mjs';
import {manifest} from '../support/manifest.mjs';
import {stopWorkload} from '../support/stop-workload.mjs';
import {privateJSON,hashFile} from '../support/output-files.mjs';
import {applyPatch,cleanEnvironment,config,directory,tasks} from './suite.mjs';

export function scoreOutput(task,processResult) {
  const expected=[...task.feature,...task.preservation], rows=[];let complete=null;
  try {
    for(const line of processResult.stdout.trim().split('\n').filter(Boolean)) {
      const row=JSON.parse(line);
      if(row.type==='complete') {if(complete)throw Error('Duplicate completion');complete=row;}
      else if(row.type==='obligation') {if(complete||!expected.includes(row.id)||rows.some(r=>r.id===row.id)||!['PASS','FAIL'].includes(row.status))throw Error('Invalid obligation');rows.push(row);}
      else throw Error('Unknown report event');
    }
    const counts=complete?.counts;
    const finished=complete&&counts?.tests===expected.length&&counts.cancelled===0&&counts.skipped===0&&counts.todo===0&&counts.passed===rows.filter(r=>r.status==='PASS').length&&counts.failed===rows.filter(r=>r.status==='FAIL').length&&rows.length===expected.length&&expected.length>0&&expected.every(id=>rows.some(r=>r.id===id))&&!processResult.error&&!processResult.signal&&[0,1].includes(processResult.status);
    if(!finished)return {R:null,status:'unproven',obligations:rows,reason:'Missing, partial or interrupted independent checks'};
    const passed=rows.every(r=>r.status==='PASS');
    if((passed&&processResult.status!==0)||(!passed&&processResult.status!==1))return {R:null,status:'unproven',obligations:rows,reason:'Contradictory process completion'};
    return {R:passed,status:passed?'PASS':'FAIL',obligations:rows};
  }catch(error){return {R:null,status:'unproven',obligations:rows,reason:error.message};}
}

export function deliveryFacts({runtime,capture,stop,requests,workflow,nativeEvidence,patchApplied,mode='task'}) {
  const providerConfirmed=Array.isArray(requests)&&requests.some(r=>r.forwarded)&&requests.filter(r=>r.forwarded).every(r=>r.terminalResponse?.status==='completed'&&!r.responseBindingError&&r.clientDelivery==='stream-forwarded');
  const stages=workflow?.stages?.filter(s=>s.role==='author')??[],termination=workflow?.termination;
  let authorCompleted=stages.length>0&&new Set(stages.map(s=>s.messageID)).size===stages.length&&stages.every(stage=>{
    const matches=nativeEvidence?.messages?.filter(m=>m.id===stage.messageID)??[],message=matches[0]?.data;
    return matches.length===1&&message?.role==='assistant'&&message.finish==='stop'&&!message.error&&Number.isFinite(message.time?.completed)&&message.time.completed>=message.time.created&&message.path?.cwd===capture?.delivery;
  })&&termination?.verified===true&&['abortRequests','pendingTools','queuedTools','activeTools'].every(k=>termination[k]===0)&&Array.isArray(termination.abortErrors)&&termination.abortErrors.length===0;
  if(mode==='plain') {
    const roots=nativeEvidence?.sessions?.filter(s=>s.parent_id===null)??[];
    const messages=roots.length===1?(nativeEvidence.messages??[]).filter(m=>m.session_id===roots[0].id&&m.data?.role==='assistant').sort((a,b)=>a.data.time.created-b.data.time.created):[];
    const message=messages.at(-1)?.data;
    authorCompleted=messages.length>0&&new Set(messages.map(m=>m.id)).size===messages.length&&message.finish==='stop'&&!message.error&&Number.isFinite(message.time?.completed)&&message.time.completed>=message.time.created&&message.path?.cwd===capture?.delivery&&(nativeEvidence.tools??[]).every(t=>['completed','error'].includes(t.data?.state?.status));
  }
  const delivered=patchApplied===true&&runtime?.nativeCompleted===true&&runtime?.continuationApplied===false&&capture?.roundtripVerified===true&&(mode==='plain'||capture?.hasArtifacts===true)&&typeof capture.delivery==='string'&&path.isAbsolute(capture.delivery)&&capture.delivery===runtime.delivery&&stop?.terminationVerified===true&&stop?.captureSaved===true&&stop?.relayRemoved===true&&stop?.forwardingClosed===true&&stop?.activeProviderHandlers===0&&providerConfirmed&&authorCompleted;
  return {delivery:delivered,providerConfirmed,authorCompleted,internalStatus:workflow?.status??null,corrections:workflow?.repairs??null};
}

export function evaluationBinding(task,patch) {
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  return {task:task.id,patchSha256:sha(patch),sourceSha256:sha(JSON.stringify(manifest(task.source))),taskSha256:hashFile(path.join(task.directory,'task.json')).sha256,acceptanceSha256:hashFile(path.join(task.directory,'acceptance.test.mjs')).sha256,reporterSha256:hashFile(path.join(directory,'reporter.mjs')).sha256,evaluatorSha256:hashFile(fileURLToPath(import.meta.url)).sha256};
}

export function readEvaluation({task,patch,output,contained=true,executionImage=image}) {
  let result=null;
  try {
    result=JSON.parse(fs.readFileSync(path.join(output,'evaluation.json')));
    for(const [key,value] of Object.entries(evaluationBinding(task,patch)))if(result[key]!==value)throw Error('Evaluation binding mismatch: '+key);
    if(result.contained!==contained||result.cleanupVerified!==true||result.terminationVerified!==true||result.evaluationComplete!==true)throw Error('Evaluation containment/completion/cleanup unproven');
    if(contained) {
      const container=JSON.parse(fs.readFileSync(path.join(output,'session/container.json'))),cleanup=JSON.parse(fs.readFileSync(path.join(output,'session/cleanup.json')));
      if(result.executionImage!==executionImage||container.image!==executionImage||cleanup.status!==0)throw Error('Evaluation container/image cleanup unproven');
      for(const target of ['/judge','/input'])if(!container.argv.some(a=>a.includes('target='+target+',readonly')))throw Error('Evaluation read-only mounts unproven');
    }
    const file=path.join(output,'check-process.json');
    if(hashFile(file).sha256!==result.processSha256)throw Error('Evaluation process evidence changed');
    const scored=scoreOutput(task,JSON.parse(fs.readFileSync(file)));
    if(scored.R===null||scored.R!==result.R||scored.status!==result.status||JSON.stringify(scored.obligations)!==JSON.stringify(result.obligations)||result.patchApplied!==true)throw Error('Evaluation process completion/obligations unproven');
    if(![result.evaluationElapsedMs,result.cleanupElapsedMs].every(v=>Number.isFinite(v)&&v>=0))throw Error('Evaluation timing missing');
    return {proven:true,result};
  }catch(error){return {proven:false,result,reason:error.message};}
}

export async function evaluatePatch({task,patch,output,toolchain,contained=true}) {
  const started=performance.now(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'feedback-evaluate-'));
  let session,result,applied=false,terminationVerified=false;
  fs.mkdirSync(output,{recursive:true,mode:0o700});
  try {
    const source=path.join(temp,'source'),judge=path.join(temp,'judge');
    try {applyPatch(task.source,patch,source);applied=true;}
    catch(error){result={R:false,status:'patch_rejected',obligations:[],reason:error.message};return result;}
    fs.mkdirSync(judge);
    fs.copyFileSync(path.join(task.directory,'acceptance.test.mjs'),path.join(judge,'acceptance.test.mjs'));
    fs.copyFileSync(path.join(directory,'reporter.mjs'),path.join(judge,'reporter.mjs'));
    let run;
    if(contained) {
      // A new container, after author termination. /judge is never an author mount.
      for(const dir of [source,judge]) {
        const accessible=dir=>{fs.chmodSync(dir,0o755);for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.name==='.git')continue;const file=path.join(dir,entry.name);if(entry.isDirectory())accessible(file);else if(entry.isFile())fs.chmodSync(file,fs.statSync(file).mode|0o444);}};
        accessible(dir);
      }
      session=await startContainer({source,toolchain,template:null,evaluationDirectory:judge,output:path.join(output,'session'),onRequest:()=>{throw Error('Scoring cannot access any provider');}});
      const boundary=session.exec(['node','-e',"const fs=require('fs'),assert=require('assert/strict');assert.throws(()=>fs.writeFileSync('/judge/acceptance.test.mjs','tampered'),e=>e.code==='EROFS');assert.throws(()=>fs.writeFileSync('/judge/reporter.mjs','tampered'),e=>e.code==='EROFS');"]);
      if(boundary.status!==0)throw Error('Independent acceptance/reporter mount is not read-only');
      const script=`const {spawnSync}=require('child_process');const r=spawnSync(process.execPath,['--test','--test-reporter=/judge/reporter.mjs','/judge/acceptance.test.mjs'],{cwd:'/work/repo',env:{...process.env,FEEDBACK_PROJECT_ROOT:'/work/repo'},encoding:'utf8',timeout:${config.evaluationTimeoutMs},killSignal:'SIGKILL',maxBuffer:1048576});console.log(JSON.stringify({status:r.status,signal:r.signal,error:r.error?.code??null,stdout:r.stdout??'',stderr:r.stderr??''}));`;
      const outer=session.exec(['node','-e',script]);
      if(outer.status!==0||outer.error||outer.signal)run={status:outer.status,signal:outer.signal,error:outer.error?.message??outer.stderr,stdout:''};
      else run=JSON.parse(outer.stdout);
      const termination=stopWorkload(session);
      terminationVerified=termination.terminationVerified===true;
      if(!termination.terminationVerified)run.error='Scoring termination unverified';
    }else {
      // Only repository-owned model-free controls use this fast verification path.
      run=spawnSync(process.execPath,['--test','--test-reporter='+path.join(judge,'reporter.mjs'),path.join(judge,'acceptance.test.mjs')],{cwd:source,env:{...cleanEnvironment(),FEEDBACK_PROJECT_ROOT:source,HOME:temp},encoding:'utf8',timeout:config.evaluationTimeoutMs,killSignal:'SIGKILL',maxBuffer:1024*1024});
      run={status:run.status,signal:run.signal,error:run.error?.code??null,stdout:run.stdout??'',stderr:run.stderr??''};
      terminationVerified=!run.error&&!run.signal;
    }
    privateJSON(path.join(output,'check-process.json'),run);
    result={...scoreOutput(task,run),...evaluationBinding(task,patch),processSha256:hashFile(path.join(output,'check-process.json')).sha256,patchApplied:applied,contained,executionImage:contained?image:null,terminationVerified};
    result.evaluationComplete=typeof result.R==='boolean';
    return result;
  }finally {
    const evaluationElapsedMs=performance.now()-started,cleanupStarted=performance.now();
    let cleanup=true;
    try {if(session&&session.close()!==0)cleanup=false;}
    finally {fs.rmSync(temp,{recursive:true,force:true});}
    if(result) {result.patchApplied=applied;result.evaluationElapsedMs=evaluationElapsedMs;result.cleanupElapsedMs=performance.now()-cleanupStarted;result.cleanupVerified=cleanup;privateJSON(path.join(output,'evaluation.json'),result);}
    if(!cleanup)throw Error('Independent scoring cleanup failed');
  }
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [id,patchFile,output,toolchain]=process.argv.slice(2),task=tasks.find(t=>t.id===id);
  if(!task||![patchFile,output,toolchain].every(p=>p&&path.isAbsolute(p)))throw Error('Usage: evaluate.mjs TASK_ID ABS_PATCH ABS_OUTPUT ABS_TOOLCHAIN');
  console.log(JSON.stringify(await evaluatePatch({task,patch:fs.readFileSync(patchFile),output,toolchain})));
}
