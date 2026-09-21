// Tiny isolated technical fixture, using the actual shared scheduler lifecycle.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {startContainer} from '../native-task-integrated/container-session.mjs';
import {runNativePhase} from '../native-task-abc/native-run.mjs';
import {runComparison} from '../native-task-ab/run-comparison.mjs';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
import {captureCandidate} from '../polybench-pilot/capture.mjs';
import {hashFile} from './output-files.mjs';
import {responseBytes,config,longCommand} from './scripted.mjs';
process.umask(0o077);
const mode=process.argv[2]??'success';
assert.ok(['success','copy-failure','limit','corrupt','patch-failure','metadata-failure','cancel'].includes(mode));
const root=path.resolve('local/native-output-retention/'+mode+'-'+Date.now());fs.mkdirSync(root,{recursive:true,mode:0o700});
const source=root+'/source';fs.mkdirSync(source);fs.writeFileSync(source+'/hello.js','export const value = 1;\n');fs.writeFileSync(source+'/check.sh','#!/bin/sh\nnode --input-type=module -e "import {value} from \'./hello.js\'; if(value!==2)process.exit(1)"\n',{mode:0o755});fs.writeFileSync(source+'/TASK.md','Change value to 2 and run the scripted verification.');
const original=Object.fromEntries(fs.readdirSync(source).map(n=>[n,{sha256:hashFile(source+'/'+n).sha256,executable:!!(fs.statSync(source+'/'+n).mode&0o111)}]));
// New local fixture manifest only. No historical freeze or task runner is loaded.
const attempts=['P','H0','H1'].map((arm,i)=>({slot:i+1,task:'output-fixture',project:'synthetic/local',arm,source}));
const freeze={experimentKind:'polybench-pilot-preflight',runtimeSha:'e18db1fe10223db52dcc05b3e769bca140367c2b',strategy:'direct',streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,budgetMs:1800000,model:config.model,variant:'high',preflightPassed:true,files:{},runtimeManifests:{},attempts,config,toolchain:path.resolve('../verified-change-harness/local/template-toolchain-20260908'),template:path.resolve('local/native-task-integrated/plain-dependencies'),dependencies:path.resolve('local/native-task-integrated/plain-dependencies'),inputManifests:Object.fromEntries(attempts.map(a=>[a.task+'-'+a.arm,original]))};
fs.writeFileSync(root+'/freeze.json',JSON.stringify(freeze));
let sequence=0,current=0,work=0;const sessions=[],requests=[],checks=[],aborts=[];
const calls=[{name:'read',args:{filePath:'hello.js'}},{name:'apply_patch',args:{patchText:'*** Begin Patch\n*** Update File: hello.js\n@@\n-export const value = 1;\n+export const value = 2;\n*** End Patch'}},{name:'bash',args:{command:longCommand,description:'Native long combined output'}},{name:'bash',args:{command:'./check.sh',description:'Portable executable test'}}];
const outcome=await runComparison({root,readAuth:()=>({access:'scripted-not-a-credential',accountId:'synthetic'}),
 startContainer:async args=>{current++;work=0;const s=await startContainer(args);s.baseline=s.exec(['git','rev-parse','HEAD']).stdout.trim();s.arm='P';s.evidenceRequired=true;s.evidenceBaseline=s.baseline;sessions.push(s);return s;},
 stopWorkload,
 fetchImpl:async(url,options)=>{assert.equal(url,'https://chatgpt.com/backend-api/codex/responses');const body=JSON.parse(options.body),n=++sequence;requests.push({slot:current,body});let call=body.tools?.length?calls[work++]:null;
  if(call?.name==='bash'&&call.args.command===longCommand){call={...call,args:{...call.args,command:current===2?'printf SHORT_OUTPUT':longCommand+(current===3?'; exit 7':'')}};if(mode==='cancel')call.args.command=longCommand+"; node -e 'setInterval(()=>console.log(\"ACTIVE\"),50)'";}
  return new Response(responseBytes(body,n,call),{status:200,headers:{'content-type':'text/event-stream'}});},
 runTaskImplementation:async(s,options)=>{const controller=new AbortController();const result=await runNativePhase(s,{config,task:options.task,enabled:false,model:config.model,variant:'high',limitMs:mode==='cancel'?3500:30000,signal:controller.signal,stopWorkload});
  if(mode==='patch-failure')s.baseline='invalid';
  if(mode==='metadata-failure'){const exec=s.exec;s.exec=args=>args[2]?.includes('DatabaseSync')?{status:1,stderr:'Injected metadata extraction failure'}:exec(args);}
  return {...result,events:undefined,stderr:undefined};},
 captureCandidate:(s,out)=>{const opts={};if(mode==='copy-failure')opts.copy=()=>({status:1,stderr:Buffer.from('injected disk write failure')});if(mode==='limit')opts.bounds={fileBytes:10,totalBytes:20,files:128,exportMs:30000};if(mode==='corrupt')opts.copy=(cmd,args,options)=>{const r=spawnSync(cmd,args,options);fs.writeSync(options.stdio[1],Buffer.from('CORRUPTION'));return r;};
  const snapshot=()=>{const r=s.exec(['node','-e',"const fs=require('fs'),{createHash}=require('crypto'),{spawnSync}=require('child_process');console.log(JSON.stringify({index:createHash('sha256').update(fs.readFileSync('/work/repo/.git/index')).digest('hex'),status:spawnSync('git',['status','--porcelain=v1'],{encoding:'utf8'}).stdout,source:createHash('sha256').update(fs.readFileSync('/work/repo/hello.js')).digest('hex')}))"]);assert.equal(r.status,0);return r.stdout;};
  const before=snapshot();const result=captureCandidate(s,out,opts);assert.equal(snapshot(),before,'Collector preserves source and original index');checks.push({slot:current,result,out});return result;}
});
for(const timer of aborts)clearTimeout(timer);
if(mode==='success')assert.equal(outcome.status,'finished',JSON.stringify(outcome));else assert.equal(outcome.status,'paused',JSON.stringify(outcome));
for(const check of checks){const s=sessions[check.slot-1],manifest=JSON.parse(fs.readFileSync(check.out+'/native-output/manifest.json'));const exists=spawnSync('docker',['inspect',s.name],{encoding:'utf8'}).status===0;
 if(mode==='success'){
  assert.equal(exists,false,'Successful source must be removed');assert.equal(manifest.evidenceComplete,true);assert.equal(manifest.files.length,check.slot===2?0:1);
  const native=JSON.parse(fs.readFileSync(check.out+'/native-evidence.json'));const events=fs.readFileSync(check.out+'/session/events.jsonl','utf8').trim().split('\n').map(s=>JSON.parse(s));for(const tool of native.tools){const event=events.find(e=>e.part?.callID===tool.data.callID&&e.part?.state?.status==='completed');if(event)assert.equal(event.part.state.output,tool.data.state.output,'Original receipt preserved');}const bash=native.tools.find(t=>t.data.tool==='bash'&&t.data.state?.input?.description==='Native long combined output');assert.ok(bash);
  if(manifest.files.length){const entry=manifest.files[0];assert.equal(entry.archiveComplete,true);assert.equal(entry.linkStatus,'linked');assert.equal(entry.links[0].callID,bash.data.callID);assert.deepEqual(hashFile(check.out+'/'+entry.destination),{size:entry.size,sha256:entry.sha256});const expected=Buffer.from(Array.from({length:5000},(_,i)=>(i===0?'BEGIN':i===2500?'HIDDEN_MIDDLE':i===4999?'END':'LINE')+':'+i+':'+'x'.repeat(60)+'\n').join(''));assert.deepEqual(fs.readFileSync(check.out+'/'+entry.destination),expected);assert.ok(!bash.data.state.output.includes('HIDDEN_MIDDLE'));assert.equal(bash.data.state.metadata.exit,check.slot===3?7:0);}
  const savedRequests=fs.readdirSync(check.out).filter(n=>/^request-\d+\.json$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0])).map(n=>JSON.parse(fs.readFileSync(check.out+'/'+n)));
  assert.deepEqual(savedRequests,requests.filter(r=>r.slot===check.slot).map(r=>r.body));
  assert.ok(!JSON.stringify(savedRequests).includes('HIDDEN_MIDDLE:2500:'),'Hidden output never added to request');
  const applied=root+'/applied-'+check.slot;fs.cpSync(source,applied,{recursive:true});assert.equal(spawnSync('git',['init','-q'],{cwd:applied}).status,0);assert.equal(spawnSync('git',['apply','--binary',check.out+'/model.patch'],{cwd:applied}).status,0);assert.equal(spawnSync('./check.sh',[],{cwd:applied}).status,0);assert.ok(fs.statSync(applied+'/check.sh').mode&0o111);
 }else if(mode==='cancel'){assert.equal(sessions.length,1);assert.equal(exists,false);const r=JSON.parse(fs.readFileSync(check.out+'/result.json'));assert.equal(r.timedOut,true);const native=JSON.parse(fs.readFileSync(check.out+'/native-evidence.json'));assert.ok(native.tools.some(t=>t.data.tool==='bash'&&t.data.state.status!=='completed'));assert.ok(manifest.files.every(f=>f.sourceCompleteness!=='complete'));
 }else {assert.equal(sessions.length,1,'Capture failure must stop next slot');assert.equal(exists,true,'Failed export sole source remains');assert.ok(s.retainedResource);}
}
for(const [n,entry]of Object.entries(original))assert.deepEqual({sha256:hashFile(source+'/'+n).sha256,executable:!!(fs.statSync(source+'/'+n).mode&0o111)},entry);
const report={mode,root,outcome,scriptedRequests:sequence,realProviderRequests:0,containers:sessions.map(s=>({name:s.name,retained:!!s.retainedResource})),checks:checks.map(c=>({slot:c.slot,...c.result,manifest:JSON.parse(fs.readFileSync(c.out+'/native-output/manifest.json'))}))};fs.writeFileSync(root+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({mode,root,requests:sequence,outcome,containers:report.containers}));
