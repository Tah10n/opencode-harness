import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {runPilot} from '../development/native-task-launcher/run-pilot.mjs';
// Exact public type/message recorded at the historical first refusal; account
// plan/reset metadata is deliberately omitted from this scripted response.
const quota={error:{type:'usage_limit_reached',message:'The usage limit has been reached'}};
async function scenario(status,body){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'quota-launcher-'));
 try{
 const source=path.join(root,'input');fs.mkdirSync(path.join(source,'test'),{recursive:true});fs.mkdirSync(path.join(root,'acceptance'));fs.writeFileSync(path.join(source,'TASK.md'),'Original task');fs.writeFileSync(path.join(source,'test','old.mjs'),'old assertions');fs.writeFileSync(path.join(root,'acceptance','acceptance.test.mjs'),'independent checks');fs.writeFileSync(path.join(root,'run-config.json'),'{}');
 const attempts=Array.from({length:200},(_,i)=>({slot:i+1,task:'task'+Math.floor(i/2),arm:i%2?'B':'A',source}));
 fs.writeFileSync(path.join(root,'freeze.json'),JSON.stringify({files:{},attempts,preflightPassed:true,candidateCommit:'3750b0d448fbfa7db80c459029a98fd221e86f94',model:'openai/gpt-5.6-luna',variant:'low',budgetMs:900000,expectedPreservationTests:{task99:1},expectedAcceptanceTests:{task99:1}}));
 for(const a of attempts.slice(0,198)){const out=path.join(root,'runs',a.task+'-'+a.arm);fs.mkdirSync(path.join(out,'session'),{recursive:true});fs.writeFileSync(path.join(out,'completed.json'),JSON.stringify({...a,terminationVerified:true}));fs.writeFileSync(path.join(out,'session','cleanup.json'),'{"status":0}');}
 const before=fs.readFileSync(path.join(root,'runs/task0-A/completed.json'));
 let started=0,forwarded=0,stops=0,closed=0,onRequest;
 const result=await runPilot({root,readAuth:()=>({access:'scripted',accountId:'scripted'}),fetchImpl:async()=>{forwarded++;return new Response(JSON.stringify(body),{status});},stopWorkload:()=>{stops++;return {terminationVerified:true};},
 startContainer:async options=>{started++;onRequest=options.onRequest;fs.mkdirSync(options.output);return {output:options.output,close:()=>{closed++;return 0;},exec:argv=>{const text=argv.join(' ');if(text.includes('--version'))return {status:0,stdout:'1.18.26'};if(text.includes('DatabaseSync'))return {status:0,stdout:JSON.stringify({sessions:[],messages:[],tools:[]})};if(text.includes('Retained')||text.includes('readdirSync(p)'))return {status:0,stdout:'[]'};return {status:0,stdout:'# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n'};}};},
 runOpenCode:async session=>{const frame={path:'/v1/responses',body:{model:'gpt-5.6-luna',stream:true}};await onRequest(frame,()=>{},new AbortController().signal);if(status===429)await onRequest(frame,()=>{},new AbortController().signal);const result={termination:{terminationVerified:true},elapsedMs:1};fs.writeFileSync(path.join(session.output,'finished.json'),JSON.stringify(result));return result;},
 captureCandidate:(_session,out)=>{fs.mkdirSync(path.join(out,'candidate'));fs.writeFileSync(path.join(out,'candidate','partial.patch'),'retained partial output');return {status:0};}});
 assert.deepEqual(fs.readFileSync(path.join(root,'runs/task0-A/completed.json')),before);
 assert.equal(fs.readFileSync(path.join(root,'runs/task99-A/candidate/partial.patch'),'utf8'),'retained partial output');
 assert.equal(started,status===429?1:2);assert.equal(closed,started);assert.equal(forwarded,started);assert.equal(stops,status===429?1:0);
 const metadata=JSON.parse(fs.readFileSync(path.join(root,'runs/task99-A/provider-metadata.json')));assert.equal(metadata[0].status,status);assert.equal(metadata[0].usage,null);
 if(status===429){assert(!fs.existsSync(path.join(root,'runs/task99-B')));assert.equal(result.status,body.error?.type==='usage_limit_reached'?'incomplete_quota':'paused_unknown_429');assert.equal(metadata[1].forwarded,false);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'scheduling-paused.json'))).message,body.error?.message??null);}
 else {assert.equal(result.status,'finished');assert(!fs.existsSync(path.join(root,'scheduling-paused.json')));}
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
await scenario(429,quota);await scenario(429,{error:{type:'rate_limit',message:'Temporary rate limit'}});await scenario(200,{output:'Wrong answer mentioning usage_limit_reached'});
console.log('Scripted external launcher: quota/unknown pause, no next slot, no retry forwarding, retained partial and prior records; real provider calls = 0');

// New bounded schedules use the same runner entry point and freeze verification.
for(const kind of ['original-requirement-development','fixed-20-pair-full-native-comparison']){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'launcher-plan-'));
 try{
  const dev=kind==='original-requirement-development';
  const attempts=Array.from({length:dev?4:40},(_,i)=>({slot:i+1,task:'task'+(dev?i:Math.floor(i/2)),arm:dev?'B':i%2?'B':'A'}));
  const manifest={kind,version:1,files:{},attempts,preflightPassed:true,candidateCommit:'a'.repeat(40),model:'openai/gpt-5.6-luna',variant:'low',budgetMs:900000};
  fs.writeFileSync(path.join(root,'freeze.json'),JSON.stringify(manifest));
  // Existing pause gate is reached only after a valid schedule. Never launch a tool.
  fs.writeFileSync(path.join(root,'scheduling-paused.json'),'{}');
  await assert.rejects(runPilot({root}),/Scheduling is paused/);
  if(dev)manifest.attempts[0].arm='A';else manifest.attempts.pop();
  fs.writeFileSync(path.join(root,'freeze.json'),JSON.stringify(manifest));
  await assert.rejects(runPilot({root}),/Invalid (development schedule|freeze)/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
console.log('Bounded development/comparison schedule validation passed; provider calls = 0');

// Confirmed startup failure stops the shared environment before slot two.
{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'launcher-startup-'));let started=0,closed=0;
 try{
  fs.writeFileSync(path.join(root,'run-config.json'),'{}');fs.writeFileSync(path.join(root,'TASK.md'),'Original task');
  const attempts=Array.from({length:4},(_,i)=>({slot:i+1,task:'startup'+i,arm:'B',source:root}));
  fs.writeFileSync(path.join(root,'freeze.json'),JSON.stringify({kind:'original-requirement-development',version:1,files:{},attempts,preflightPassed:true,candidateCommit:'a'.repeat(40),model:'openai/gpt-5.6-luna',variant:'low',budgetMs:900000}));
  const result=await runPilot({root,readAuth:()=>assert.fail('No auth'),fetchImpl:()=>assert.fail('No provider'),
   startContainer:async({output})=>{started++;fs.mkdirSync(output);return {output,close:()=>{closed++;return 0;},exec:argv=>{const text=argv.join(' ');if(text.includes('--version'))return {status:0,stdout:'1.18.26'};if(text.includes('DatabaseSync'))return {status:0,stdout:JSON.stringify({sessions:[],messages:[],tools:[]})};if(text.includes('readdirSync(p)'))return {status:0,stdout:'[]'};return {status:0,stdout:''};}};},
   runOpenCode:async session=>{const result={exitCode:1,elapsedMs:1,termination:{terminationVerified:true}};fs.writeFileSync(path.join(session.output,'finished.json'),JSON.stringify(result));return result;},
   captureCandidate:(_session,out)=>{fs.mkdirSync(path.join(out,'candidate'));return {status:0};}});
  assert.equal(result.status,'paused_startup_failure');assert.equal(started,1);assert.equal(closed,1);assert(!fs.existsSync(path.join(root,'runs/startup1-B')));assert(fs.existsSync(path.join(root,'runs/startup0-B/result.json')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
const {prepareContainerBundle}=await import('../development/native-task-launcher/prepare-container-bundle.mjs');
{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'container-bundle-'));const source=path.join(root,'source');fs.mkdirSync(source);
 try{
  for(const n of ['core.md','plugin.mjs','package.json','package-lock.json','rg'])fs.writeFileSync(path.join(source,n),'fixture');fs.mkdirSync(path.join(source,'node_modules'));
  const config={instructions:[path.join(source,'core.md')],plugin:['file://'+path.join(source,'plugin.mjs')],permission:{edit:'deny'}};
  const bytes=JSON.stringify(config);fs.writeFileSync(path.join(source,'opencode.json'),bytes);
  const dest=path.join(root,'copy'),converted=prepareContainerBundle(source,dest);
  assert.deepEqual(converted,{...config,instructions:['/template/core.md'],plugin:['file:///template/plugin.mjs']});assert.equal(fs.readFileSync(path.join(source,'opencode.json'),'utf8'),bytes);assert(!fs.existsSync(path.join(source,'.gitignore')));assert(fs.existsSync(path.join(dest,'.gitignore')));
  assert.throws(()=>prepareContainerBundle(source,dest),/already exists/);
  fs.writeFileSync(path.join(source,'opencode.json'),JSON.stringify({...config,instructions:['/missing/host-path']}));assert.throws(()=>prepareContainerBundle(source,path.join(root,'bad')),/outside source bundle/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
console.log('Startup stop and immutable container preparation regressions passed; provider calls = 0');
