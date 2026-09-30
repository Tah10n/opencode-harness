// Actual container/scheduler path, generated inputs only; no native/model run.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {startContainer} from './container-session.mjs';import {runComparison as currentComparison} from './scheduler.mjs';
import {spawn,spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {captureInputManifest,compareInputManifest,inputLimits} from './input-manifest.mjs';
import {verifyPreparedSession} from '../polybench/input-preflight.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'large-input-'));
let runComparison=currentComparison;
if(process.argv.includes('--expect-original-failure')){
 const r=spawnSync('git',['show','25a446eaa7d5cb5c5776ab30d45ca338eb9ad581:evaluation/support/scheduler.mjs'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const code=r.stdout.replace(/from '(\.\/[^']+)'/g,(_,name)=>'from '+JSON.stringify(pathToFileURL(path.resolve(import.meta.dirname,name)).href));
 const file=root+'/original-scheduler.mjs';fs.writeFileSync(file,code);runComparison=(await import(pathToFileURL(file))).runComparison;
}
const empty=createHash('sha256').update('').digest('hex'),expected={};
const names=Array.from({length:204288},(_,i)=>'node_modules/d'+String(Math.floor(i/1000)).padStart(3,'0')+'/'+String(i).padStart(6,'0')+'-'+ 'x'.repeat(109)+'.js');
for(const n of names)expected[n]={sha256:empty,executable:false};
Object.assign(expected,{'TASK.md':{sha256:createHash('sha256').update('Synthetic input\n').digest('hex'),executable:false},'zz-executable':{sha256:empty,executable:true},'zz-link':{symlink:'zz-executable'},'zz-tail':{sha256:empty,executable:false}});
const expectedBytes=Buffer.byteLength(JSON.stringify(expected));assert.ok(expectedBytes>43229958);assert.equal(Object.keys(expected).length,204292);
let calls=0,sessionName,containerID;const started=Date.now(),negativeChecks=[];
try{
 fs.mkdirSync(root+'/source');fs.chmodSync(root+'/source',0o755);fs.writeFileSync(root+'/source/TASK.md','Synthetic input\n');
 fs.mkdirSync(root+'/toolchain/package/bin',{recursive:true});fs.writeFileSync(root+'/toolchain/package/bin/opencode','#!/bin/sh\necho 1.18.26\n',{mode:0o755});
 fs.mkdirSync(root+'/template/node_modules',{recursive:true});for(const n of ['package.json','package-lock.json'])fs.writeFileSync(root+'/template/'+n,'{}');fs.writeFileSync(root+'/template/rg','synthetic');
 fs.copyFileSync(path.resolve(import.meta.dirname,'../../lib/native-review-context.mjs'),root+'/template/native-review-context.mjs');
 fs.mkdirSync(root+'/batch');fs.mkdirSync(root+'/batch/runs');
 const f={experimentKind:'fixture',preflightPassed:true,model:'openai/scripted',variant:'high',budgetMs:120000,files:{},toolchain:root+'/toolchain',template:root+'/template',dependencies:root+'/template',config:{},attempts:[{slot:1,task:'synthetic',arm:'P',source:root+'/source'}],inputManifests:{'synthetic-P':expected}};
 fs.writeFileSync(root+'/batch/freeze.json',JSON.stringify(f));
 const result=await runComparison({root:root+'/batch',startContainer:async options=>{
  const s=await startContainer(options);sessionName=s.name;containerID=s.evidenceIdentity.id;
  try{const r=s.exec(['node','-e',`const fs=require('fs');for(let i=0;i<204288;i++){const dir='/work/repo/node_modules/d'+String(Math.floor(i/1000)).padStart(3,'0');if(i%1000===0)fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/'+String(i).padStart(6,'0')+'-'+'x'.repeat(109)+'.js','');}fs.writeFileSync('/work/repo/zz-executable','',{mode:0o755});fs.symlinkSync('zz-executable','/work/repo/zz-link');fs.writeFileSync('/work/repo/zz-tail','');`]);assert.equal(r.status,0,r.stderr);
   if(!process.argv.includes('--expect-original-failure')){
    const prep=s.exec(['node','-e',`const fs=require('fs'),cp=require('child_process');fs.writeFileSync('.git/info/exclude',${JSON.stringify('node_modules/\nzz*\n')});for(const args of [['add','-f',...Array.from({length:20},(_,i)=>'node_modules/d'+String(i).padStart(3,'0'))],['-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','Synthetic prepared input']]){const r=cp.spawnSync('git',args,{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);}`]);assert.equal(prep.status,0,prep.stderr);
    const check=root+'/prepared-input';fs.mkdirSync(check);const verification=await verifyPreparedSession(s,check,expected);assert.ok(verification.passed);assert.equal(verification.git.diffBytes,0);negativeChecks.push('actual prepared manifest + task Git preflight');
   }
   return s;
  }catch(e){s.close();throw e;}
 },fetchImpl:()=>{throw Error('Provider prohibited');},readAuth:()=>{throw Error('Auth prohibited');},stopWorkload:()=>({terminationVerified:true}),captureCandidate:()=>({status:0}),runTaskImplementation:async s=>{
  calls++;
  const run=script=>{const r=s.exec(['node','-e',script]);assert.equal(r.status,0,r.stderr);};
  const capture=async(name,options={})=>{const dir=root+'/'+name;fs.mkdirSync(dir);try{return await captureInputManifest(s,dir,options);}finally{assert.ok(!fs.readdirSync(dir).some(n=>n.endsWith('.tmp')));}};
  for(const [name,change,restore] of [
   ['changed-tail',"fs.writeFileSync('/work/repo/zz-tail','changed');","fs.writeFileSync('/work/repo/zz-tail','');"],
   ['deleted-tail',"fs.unlinkSync('/work/repo/zz-tail');","fs.writeFileSync('/work/repo/zz-tail','');"],
   ['added-tail',"fs.writeFileSync('/work/repo/zzz-extra','');","fs.unlinkSync('/work/repo/zzz-extra');"],
   ['mode-tail',"fs.chmodSync('/work/repo/zz-executable',0o644);","fs.chmodSync('/work/repo/zz-executable',0o755);"],
   ['symlink-tail',"fs.unlinkSync('/work/repo/zz-link');fs.symlinkSync('zz-tail','/work/repo/zz-link');","fs.unlinkSync('/work/repo/zz-link');fs.symlinkSync('zz-executable','/work/repo/zz-link');"]
  ]){run("const fs=require('fs');"+change);const got=await capture(name);assert.throws(()=>compareInputManifest(got.manifest,expected),/input mismatch/);run("const fs=require('fs');"+restore);negativeChecks.push(name);}
  for(const [name,bounds] of [['byte-limit',{...inputLimits,bytes:1024}],['entry-limit',{...inputLimits,entries:204291}],['time-limit',{...inputLimits,milliseconds:1}]]){await assert.rejects(capture(name,{bounds}));negativeChecks.push(name);}
  for(const name of ['truncated','corrupt','nonzero-exit']){
   await assert.rejects(capture(name,{spawnProcess:(cmd,args,options)=>{
    if(name==='nonzero-exit')args=[...args.slice(0,-1),args.at(-1)+';process.exitCode=7;'];
    const child=spawn(cmd,args,options);
    if(name!=='nonzero-exit')child.once('close',()=>{const fd=options.stdio[1];if(name==='truncated')fs.ftruncateSync(fd,fs.fstatSync(fd).size-1);else fs.writeSync(fd,Buffer.from('!'),0,1,0);});
    return child;
   }}));negativeChecks.push(name);
  }
  const abort=new AbortController();let producerPID;
  await assert.rejects(capture('cancelled',{signal:abort.signal,spawnProcess:(cmd,args,options)=>{
   const child=spawn(cmd,args,options);child.stderr.once('data',b=>{producerPID=JSON.parse(b.toString().split('\n')[0]).pid;abort.abort(Error('Scripted cancellation'));});return child;
  }}),/Scripted cancellation/);
  assert.ok(producerPID>1);run(`const fs=require('fs');try{const st=fs.readFileSync('/proc/${producerPID}/stat','utf8');if(st.slice(st.lastIndexOf(') ')+2)[0]!=='Z')throw Error('Producer remains alive');}catch(e){if(e.code!=='ENOENT')throw e;}`);negativeChecks.push('cancelled; producer absent');
  const r=s.exec(['node','-e',`const fs=require('fs');fs.mkdirSync('/work/data/opencode',{recursive:true});const {DatabaseSync}=require('node:sqlite'),d=new DatabaseSync('/work/data/opencode/opencode.db');d.exec('CREATE TABLE session(id,parent_id,directory,agent,model,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write);CREATE TABLE message(id,session_id,data);CREATE TABLE part(id,message_id,session_id,data);');d.close();`]);assert.equal(r.status,0,r.stderr);return {exitCode:0,timedOut:false,termination:{terminationVerified:true}};
 }});
 const out=root+'/batch/runs/synthetic-P';
 if(process.argv.includes('--expect-original-failure')){assert.equal(calls,0);assert.equal(result.status,'paused');assert.ok(!fs.existsSync(out+'/input-verification.json'));console.log(JSON.stringify({originalFailure:JSON.parse(fs.readFileSync(out+'/error.json')).message,expectedBytes,entries:Object.keys(expected).length,elapsedMs:Date.now()-started}));}
 else{assert.equal(result.status,'finished',JSON.stringify(result));assert.equal(calls,1);assert.equal(JSON.parse(fs.readFileSync(out+'/input-verification.json')).matched,true);console.log(JSON.stringify({passed:true,expectedBytes,entries:Object.keys(expected).length,negativeChecks,containerID,sessionName,elapsedMs:Date.now()-started,realProviderRequests:0}));}
}finally{fs.rmSync(root,{recursive:true,force:true});}
