import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {runComparison} from './run-comparison.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),base=fs.mkdtempSync(path.join(os.tmpdir(),'h00-continuation-'));
const reports=[];
try{
for(const mode of ['valid','mismatched-identity','unverified-stop','old-artifact-change','unstarted-run','unknown-run','prior-quota','existing-new-run','wrong-launcher','wrong-freeze','live-old-container']){
 const root=path.join(base,mode);fs.mkdirSync(root);const source=path.join(root,'source');fs.mkdirSync(source);fs.writeFileSync(path.join(source,'TASK.md'),'Scripted task');
 const names=Array.from({length:12},(_,i)=>'task'+i),attempts=[];for(const repetition of [1,2])for(const [i,task]of names.entries())for(const arm of (i%2===0?['P','H00']:['H00','P']))attempts.push({slot:attempts.length+1,task,project:'project'+Math.floor(i/2),repetition,arm,source});
 const launcher=path.resolve('development/native-task-ab/run-comparison.mjs'),digest=sha(fs.readFileSync(launcher));const f={experimentKind:'h00-transfer',model:'openai/gpt-5.6-luna',variant:'high',budgetMs:900000,preflightPassed:true,streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,attempts,files:{[launcher]:digest},inputManifests:Object.fromEntries(attempts.map(a=>[a.task+'-'+a.arm,{}]))};fs.writeFileSync(root+'/freeze.json',JSON.stringify(f));fs.writeFileSync(root+'/scheduling-paused.json',JSON.stringify({kind:'unknown_submission',slot:18,error:'AbortError'}));fs.writeFileSync(root+'/outcome.json',JSON.stringify({status:'paused'}));
 const historicalFiles={};
 for(const a of attempts.slice(0,18)){
  const dir=path.join(root,'runs',a.task+'-r'+a.repetition+'-'+a.arm);fs.mkdirSync(dir+'/session',{recursive:true});
  for(const name of ['started.json','completed.json','result.json'])fs.writeFileSync(dir+'/'+name,JSON.stringify(a));
  fs.writeFileSync(dir+'/stop-verification.json',JSON.stringify({terminationVerified:true,captureSaved:true,forwardingClosed:true,relayRemoved:true,activeProviderHandlers:0}));fs.writeFileSync(dir+'/provider-metadata.json','[]');fs.writeFileSync(dir+'/candidate.tar','scripted-capture');fs.writeFileSync(dir+'/session/container.json',JSON.stringify({name:'historical-'+a.slot}));fs.writeFileSync(dir+'/session/cleanup.json','{"status":0}');
  for(const name of ['started.json','completed.json','result.json','stop-verification.json','provider-metadata.json','candidate.tar','session/container.json','session/cleanup.json'])historicalFiles[path.relative(root,dir+'/'+name)]=sha(fs.readFileSync(dir+'/'+name));
 }
 const amendment={version:1,firstSlot:19,lastSlot:48,originalFreezeSha256:sha(fs.readFileSync(root+'/freeze.json')),originalPauseSha256:sha(fs.readFileSync(root+'/scheduling-paused.json')),launcherFiles:{[launcher]:{before:digest,after:digest}},historicalFiles};
 const first=path.join(root,'runs',attempts[0].task+'-r1-P');
 if(mode==='mismatched-identity')fs.writeFileSync(first+'/started.json','{"slot":2}');
 if(mode==='unverified-stop')fs.writeFileSync(first+'/stop-verification.json','{"terminationVerified":false}');
 if(mode==='old-artifact-change')fs.appendFileSync(first+'/candidate.tar','changed');
 if(mode==='unstarted-run'){const a=attempts[18];fs.mkdirSync(path.join(root,'runs',a.task+'-r'+a.repetition+'-'+a.arm));}
 if(mode==='unknown-run')fs.mkdirSync(root+'/runs/unknown');
 if(mode==='prior-quota'){fs.writeFileSync(root+'/scheduling-paused.json','{"kind":"incomplete_quota","slot":18}');amendment.originalPauseSha256=sha(fs.readFileSync(root+'/scheduling-paused.json'));}
 if(mode==='existing-new-run')fs.mkdirSync(root+'/continuation-19-48');
 if(mode==='wrong-launcher')amendment.launcherFiles[launcher].after='wrong';
 if(mode==='wrong-freeze')amendment.originalFreezeSha256='wrong';
 fs.writeFileSync(root+'/amendment.json',JSON.stringify(amendment));let started=0,quiescence=false;
 let result,error;try{result=await runComparison({root,continuationFile:root+'/amendment.json',verifyQuiescence:rows=>{assert.equal(rows.length,18);quiescence=true;if(mode==='live-old-container')throw Error('Container remains');},startContainer:async({output})=>{started++;fs.mkdirSync(output);return {setTaskBudget(){},exec(args){if(args[0]==='/opt/opencode')return {status:0,stdout:'1.18.26'};return {status:0,stdout:args[2].includes('DatabaseSync')?'{"sessions":[],"messages":[],"tools":[]}':'{}'};},close:()=>0};},captureCandidate:(s,out)=>{fs.writeFileSync(out+'/candidate.tar','new scripted capture');return {status:0};},stopWorkload:()=>({terminationVerified:true}),readAuth:()=>{throw Error('No request expected');},fetchImpl:()=>{throw Error('No provider calls permitted');},runTaskImplementation:async()=>({exitCode:0,termination:{terminationVerified:true}})});}catch(e){error=e.message;}
 assert.equal(started,mode==='valid'?30:0,mode);
 if(mode==='valid'){
  assert.equal(result.status,'finished');assert.equal(quiescence,true);assert.equal(fs.readFileSync(root+'/outcome.json','utf8'),'{"status":"paused"}');assert.ok(fs.existsSync(root+'/scheduling-paused.json'));for(const [relative,digest]of Object.entries(historicalFiles))assert.equal(sha(fs.readFileSync(root+'/'+relative)),digest);
  assert.equal(fs.readdirSync(root+'/continuation-19-48/runs').length,30);
 }else assert.ok(error,mode);
 reports.push({mode,started,quiescence,error:error??null,realProviderRequests:0});
}
console.log(JSON.stringify({passed:true,reports},null,2));
}finally{fs.rmSync(base,{recursive:true,force:true});}
