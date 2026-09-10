import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import readline from 'node:readline';
// Uses the existing external native execution adapters and installed fixture.
// This process never reads authorization and forwards only to its local fixture.
const base=path.resolve('.'),root=path.resolve(process.argv[2]);
const f=JSON.parse(fs.readFileSync(path.join(root,'freeze.json')));
const {startContainer}=await import(f.containerAdapter);
const {captureCandidate}=await import(f.captureAdapter);
const {runOpenCode}=await import(f.nativeAdapter);
const fixture=spawn(process.execPath,['scripts/verify-native-task-fixture.mjs'],{cwd:base,env:{PATH:process.env.PATH,NATIVE_TASK_FIXTURE_PROVIDER_ONLY:'1'},stdio:['ignore','pipe','pipe']});
let stderr='';fixture.stderr.on('data',x=>stderr+=x);
let session,requests=0;
try{
 const lines=readline.createInterface({input:fixture.stdout});
 const info=await new Promise((resolve,reject)=>{lines.once('line',line=>resolve(JSON.parse(line)));fixture.once('exit',code=>reject(Error('Fixture exited '+code+': '+stderr)));});
 assert.match(info.fixtureURL,/^http:\/\/127\.0\.0\.1:\d+$/);
 session=await startContainer({source:info.project,toolchain:f.toolchain,template:f.template,output:path.join(root,'preflight-session'),onRequest:async(frame,send,signal)=>{
   assert.equal(frame.path,'/v1/chat/completions');requests++;
   const response=await fetch(info.fixtureURL+frame.path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(frame.body),signal,redirect:'error'});
   send({type:'headers',status:response.status,contentType:response.headers.get('content-type')});for await(const chunk of response.body)send({type:'chunk',data:Buffer.from(chunk).toString('base64')});send({type:'end'});
 }});
 const setup=session.exec(['node','-e',"const fs=require('fs');fs.mkdirSync('/work/bin');fs.copyFileSync('/template/rg','/work/bin/rg');fs.chmodSync('/work/bin/rg',0o755);fs.mkdirSync('/work/config/opencode',{recursive:true});for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync('/template/'+n,'/work/config/opencode/'+n,{recursive:true});"]);assert.equal(setup.status,0,setup.stderr);
 assert.equal(session.exec(['/opt/opencode','--version']).stdout.trim(),'1.18.26');
 const config={model:'local-fixture/fixture',small_model:'local-fixture/fixture',provider:{'local-fixture':{npm:'@ai-sdk/openai-compatible',name:'Scripted fixture',options:{baseURL:'http://127.0.0.1:4099/v1',apiKey:'not-a-credential'},models:{fixture:{name:'fixture',limit:{context:200000,output:10000}}}}},permission:{external_directory:'deny'}};
 const result=await runOpenCode(session,{config,task:fs.readFileSync(path.join(info.project,'TASK.md'),'utf8'),enabled:true,model:'local-fixture/fixture',variant:'low',limitMs:900000,command:'harness-task'});
 assert.equal(result.exitCode,0,result.stderr);assert.equal(result.termination.terminationVerified,true);
 const evidence=session.exec(['node','-e',"const fs=require('fs'),p='/work/repo/.git/harness-task';const ids=fs.readdirSync(p);if(ids.length!==1)throw Error('Expected one workflow');const dir=p+'/'+ids[0];console.log(JSON.stringify({report:JSON.parse(fs.readFileSync(dir+'/result.json')),files:fs.readdirSync(dir),events:JSON.parse(fs.readFileSync(dir+'/tool-events.json'))}));"]);assert.equal(evidence.status,0,evidence.stderr);
 const saved=JSON.parse(evidence.stdout);assert.equal(saved.report.status,'reviewed_delivery',JSON.stringify(saved.report));assert.ok(saved.files.includes('D0.patch'));assert.ok(saved.files.includes('terminal.patch'));
 for(const tool of ['read','glob','edit','bash'])assert.ok(saved.events.some(e=>e.tool===tool&&e.state==='completed'),tool);
 assert.ok(saved.events.some(e=>e.tool==='bash'&&e.exit===0));assert.ok(saved.report.stages.some(s=>s.role==='author'));assert.ok(saved.report.stages.some(s=>s.role==='reviewer'));
 assert.equal(captureCandidate(session,root).status,0);
 fs.writeFileSync(path.join(root,'preflight-result.json'),JSON.stringify({status:'passed',requests,realProviderCalls:0,elapsedMs:result.elapsedMs,terminationVerified:true,report:saved.report},null,2));
 console.log(JSON.stringify({containerPreflight:'passed',scriptedRequests:requests,realProviderCalls:0,elapsedMs:result.elapsedMs}));
}finally{
 if(session)assert.equal(session.close(),0,'Container cleanup');
 fixture.kill('SIGTERM');await new Promise(resolve=>fixture.once('exit',resolve));
}
