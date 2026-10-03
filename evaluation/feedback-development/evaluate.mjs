import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {startContainer} from '../support/container-session.mjs';
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

export function deliveryFacts({runtime,capture,stop,requests,workflow,nativeEvidence,patchApplied}) {
  const providerConfirmed=Array.isArray(requests)&&requests.some(r=>r.forwarded)&&requests.filter(r=>r.forwarded).every(r=>r.terminalResponse?.status==='completed'&&!r.responseBindingError&&r.clientDelivery==='stream-forwarded');
  const stages=workflow?.stages?.filter(s=>s.role==='author')??[],termination=workflow?.termination;
  const authorCompleted=stages.length>0&&new Set(stages.map(s=>s.messageID)).size===stages.length&&stages.every(stage=>{
    const matches=nativeEvidence?.messages?.filter(m=>m.id===stage.messageID)??[],message=matches[0]?.data;
    return matches.length===1&&message?.role==='assistant'&&message.finish==='stop'&&!message.error&&Number.isFinite(message.time?.completed)&&message.time.completed>=message.time.created&&message.path?.cwd===capture?.delivery;
  })&&termination?.verified===true&&['abortRequests','pendingTools','queuedTools','activeTools'].every(k=>termination[k]===0)&&Array.isArray(termination.abortErrors)&&termination.abortErrors.length===0;
  const delivered=patchApplied===true&&runtime?.nativeCompleted===true&&runtime?.continuationApplied===false&&capture?.roundtripVerified===true&&capture?.hasArtifacts===true&&typeof capture.delivery==='string'&&path.isAbsolute(capture.delivery)&&capture.delivery===runtime.delivery&&stop?.terminationVerified===true&&stop?.captureSaved===true&&stop?.relayRemoved===true&&stop?.forwardingClosed===true&&stop?.activeProviderHandlers===0&&providerConfirmed&&authorCompleted;
  return {delivery:delivered,providerConfirmed,authorCompleted,internalStatus:workflow?.status??null,corrections:workflow?.repairs??null};
}

export async function evaluatePatch({task,patch,output,toolchain,contained=true}) {
  const started=performance.now(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'feedback-evaluate-'));
  let session,result,applied=false;
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
      if(!termination.terminationVerified)run.error='Scoring termination unverified';
    }else {
      // Only repository-owned model-free controls use this fast verification path.
      run=spawnSync(process.execPath,['--test','--test-reporter='+path.join(judge,'reporter.mjs'),path.join(judge,'acceptance.test.mjs')],{cwd:source,env:{...cleanEnvironment(),FEEDBACK_PROJECT_ROOT:source,HOME:temp},encoding:'utf8',timeout:config.evaluationTimeoutMs,killSignal:'SIGKILL',maxBuffer:1024*1024});
      run={status:run.status,signal:run.signal,error:run.error?.code??null,stdout:run.stdout??'',stderr:run.stderr??''};
    }
    privateJSON(path.join(output,'check-process.json'),run);
    result={...scoreOutput(task,run),patchApplied:applied,patchSha256:createHash('sha256').update(patch).digest('hex'),acceptanceSha256:hashFile(path.join(task.directory,'acceptance.test.mjs')).sha256,contained};
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
