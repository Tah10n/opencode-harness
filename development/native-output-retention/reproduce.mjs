import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {startContainer} from '../native-task-integrated/container-session.mjs';
import {runNativePhase} from '../native-task-abc/native-run.mjs';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
const originalCollector=spawnSync('git',['show','dd2dc79fc149a6800963b4e847da44adbb862aa7:development/polybench-pilot/capture.mjs'],{encoding:'utf8'});assert.equal(originalCollector.status,0);
const originalSource=originalCollector.stdout.replace("fileURLToPath(new URL('../native-task-ab/extract-candidate.py',import.meta.url))",JSON.stringify(path.resolve('development/native-task-ab/extract-candidate.py')));
const {captureCandidate}=await import('data:text/javascript;base64,'+Buffer.from(originalSource).toString('base64'));
import {responseBytes,config,longCommand} from './scripted.mjs';
process.umask(0o077);
const root=path.resolve('local/native-output-retention/baseline-'+Date.now());fs.mkdirSync(root,{recursive:true,mode:0o700});
const source=root+'/source';fs.mkdirSync(source);fs.writeFileSync(source+'/hello.js','console.log("fixture");\n');
let seq=0,work=0,session;
try{
 session=await startContainer({source,toolchain:path.resolve('../verified-change-harness/local/template-toolchain-20260908'),template:path.resolve('local/native-task-integrated/plain-dependencies'),output:root+'/session',onRequest:async(frame,send)=>{
  const n=++seq;fs.writeFileSync(root+'/request-'+n+'.json',JSON.stringify(frame.body));
  const call=frame.body.tools?.length&&work++===0?{name:'bash',args:{command:longCommand,description:'Deterministic long native output'}}:null;
  send({type:'headers',status:200,contentType:'text/event-stream'});send({type:'chunk',data:responseBytes(frame.body,n,call).toString('base64')});send({type:'end'});
 }});
 assert.equal(session.exec(['/opt/opencode','--version']).stdout.trim(),'1.18.26');session.baseline=session.exec(['git','rev-parse','HEAD']).stdout.trim();session.arm='P';
 const prep=session.exec(['node','-e',"const fs=require('fs');fs.mkdirSync('/work/config/opencode',{recursive:true});for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync('/template/'+n,'/work/config/opencode/'+n,{recursive:true,verbatimSymlinks:true});"]);assert.equal(prep.status,0,prep.stderr);
 const result=await runNativePhase(session,{config,task:'Run the scripted fixture.',enabled:false,model:config.model,limitMs:60000,stopWorkload});assert.equal(result.exitCode,0,JSON.stringify(result));assert.ok(result.termination.terminationVerified);
 const native=session.exec(['node','-e',"const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/work/data/opencode/opencode.db',{readOnly:true});console.log(JSON.stringify(db.prepare('SELECT session_id,data FROM part').all().map(x=>({...x,data:JSON.parse(x.data)})).filter(x=>x.data.type==='tool')));db.close()"]);assert.equal(native.status,0,native.stderr);fs.writeFileSync(root+'/native-tools.json',native.stdout);
 const tools=JSON.parse(native.stdout),bash=tools.find(t=>t.data.tool==='bash');assert.ok(bash.data.state.output.includes('truncat'));
 const listing=session.exec(['node','-e',"const fs=require('fs'),{createHash}=require('crypto');console.log(JSON.stringify(fs.readdirSync('/work/data/opencode/tool-output').map(n=>{const b=fs.readFileSync('/work/data/opencode/tool-output/'+n);return {name:n,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),hidden:b.includes('HIDDEN_MIDDLE')}})))"]);assert.equal(listing.status,0,listing.stderr);const files=JSON.parse(listing.stdout);assert.ok(files.some(f=>f.hidden));
 assert.equal(captureCandidate(session,root).status,0);
 assert.ok(!spawnSync('tar',['-tf',root+'/candidate.tar'],{encoding:'utf8'}).stdout.includes('tool-output'));
 assert.equal(session.close(),0);session=null;
 const report={originalCollectorLossReproduced:true,files,scriptedRequests:seq,realProviderRequests:0,root,metadataKeys:Object.keys(bash.data.state.metadata),outputPath:bash.data.state.metadata.outputPath};fs.writeFileSync(root+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(session)session.close();}
