import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {installedRuntime,plainArm,harnessArm} from './arms.mjs';import {materializeTask} from './inputs.mjs';import {prepareGrader,classifyCheck} from './grading.mjs';
const enabled=process.env.VERIFIED_CHANGE_EVAL_INSTALLED;
test('installed A/B/C path: immutable D0, independent author, repair and independent grading',{skip:!enabled,timeout:240000},async()=>{
 const runtime=await installedRuntime(enabled),image=await runtime.resolveImage('node:24.19.0-bookworm-slim');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'verified-eval-e2e-')),task='The exported value must equal 2. Preserve the numeric API.';
 const original=await runtime.inspectWorkspace(materializeTask({files:{'README.md':'A numeric API.','src/api.mjs':'export const value=0;\n','test/public.test.mjs':"import test from 'node:test';import assert from 'node:assert/strict';import {value} from '../src/api.mjs';test('public',()=>assert.equal(typeof value,'number'));"}},image));
 const acceptance="import test from 'node:test';import assert from 'node:assert/strict';import {value} from '/workspace/src/api.mjs';test('requirement',()=>assert.equal(value,2));";
 const manifest=[{id:'value',kind:'node-test',files:['value.test.mjs'],confidence:'unambiguous',basis:{source:'task',quote:'The exported value must equal 2.'}}];
 const quote=s=>"'"+s.replaceAll("'","'\\''")+"'",shell=code=>'node -e '+quote(code);
 const writeValue=n=>shell("const fs=require('fs');if(fs.existsSync('/grader'))throw Error('grader leak');fs.writeFileSync('/workspace/src/api.mjs',"+JSON.stringify('export const value='+n+';\n')+");");
 const commands={
  A:writeValue(1),
  B:shell("if(!require('fs').readFileSync('/workspace/src/api.mjs','utf8').includes('value=1'))throw Error('wrong B draft')")+' && '+writeValue(2),
  author:shell("const fs=require('fs');if(!fs.readFileSync('/workspace/src/api.mjs','utf8').includes('value=0'))throw Error('author saw D0');if(fs.existsSync('/grader'))throw Error('hidden leak');fs.writeFileSync('/acceptance/value.test.mjs',"+JSON.stringify(acceptance)+");fs.writeFileSync('/acceptance/manifest.json',"+JSON.stringify(JSON.stringify(manifest))+");"),
  assessment:shell("require('fs').writeFileSync('/assessment/decision.json',JSON.stringify({disputed:[]}))"),
  repair:writeValue(2)
 };
 const calls={},seen=[];
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  if(!req.url?.endsWith('/chat/completions')){res.writeHead(404).end();return;}
  try{
   const body=JSON.parse(raw),last=JSON.stringify(body.messages?.filter(m=>m.role==='user').at(-1));
   let role=last.includes('Prepare a small independent')?'author':last.includes('Audit your acceptance')?'audit':last.includes('Assess reproduced')?'assessment':last.includes('Fix only the reproduced')?'repair':last.includes('Review the existing draft')?'B':'A';
   const auxiliary=!body.tools?.length||role==='audit';
   const number=auxiliary?0:(calls[role]??0);if(!auxiliary){calls[role]=number+1;seen.push(role);}
   const toolTurn=!auxiliary&&number%2===0;
   if(toolTurn)assert.ok(body.tools.some(t=>t.function?.name==='repository_shell'));
   res.writeHead(200,{'content-type':'text/event-stream'});
   const base={id:'local-'+seen.length,object:'chat.completion.chunk',created:1,model:'fixture'};
   const delta=toolTurn?{role:'assistant',tool_calls:[{index:0,id:'call-'+seen.length,type:'function',function:{name:'repository_shell',arguments:JSON.stringify({command:commands[role]})}}]}:{role:'assistant',content:'Completed. oauth credential permission.'};
   res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta,finish_reason:null}]})+'\n\n');
   res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:toolTurn?'tool_calls':'stop'}]})+'\n\n');res.end('data: [DONE]\n\n');
  }catch(error){res.writeHead(500).end(error.message);}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const config=path.join(temp,'opencode.json'),previous=process.env.OPENCODE_CONFIG;
 fs.writeFileSync(config,JSON.stringify({provider:{'verified-eval-local':{npm:'@ai-sdk/openai-compatible',name:'Local runner check',options:{baseURL:'http://127.0.0.1:'+server.address().port+'/v1',apiKey:'local-fixture-only'},models:{fixture:{name:'fixture',limit:{context:100000,output:10000}}}}}}));
 process.env.OPENCODE_CONFIG=config;
 try{
  const common={original,task,image,model:'verified-eval-local/fixture',variant:'low',budgetMs:90000};
  const A=await plainArm(runtime,common);assert.equal(A.status,'completed',JSON.stringify(A));
  const B=await plainArm(runtime,{...common,initialSnapshot:A.snapshot});assert.equal(B.status,'completed',JSON.stringify(B));
  const C=await harnessArm(runtime,{...common,initialSnapshot:A.snapshot});assert.equal(C.status,'completed',JSON.stringify(C));
  assert.equal(C.report.draftImported,true);assert.equal(C.report.repairs,1);assert.equal(C.snapshot.name,'D1');assert.equal(C.isolationVerified,true);
  assert.equal(C.report.snapshots[0].snapshot.fingerprint,A.snapshot.fingerprint);assert.equal(runtime.treeFingerprint(A.snapshot.directory),A.snapshot.fingerprint);
  assert.notEqual(A.usage.sessionID,B.usage.sessionID);assert.deepEqual(calls,{A:2,B:2,author:2,assessment:2,repair:2});
  const grader=prepareGrader(temp,acceptance),scores=[];
  for(const arm of [A,B,C]){
   const publicCheck=await runtime.runCheck({id:'public',kind:'node-test',files:['test/public.test.mjs']},{image,workspace:arm.snapshot.directory});
   const hidden=await runtime.runCheck({id:'hidden',kind:'node-test',files:['hidden.test.mjs']},{image,workspace:arm.snapshot.directory,checkRoot:'/grader',extraMounts:[{source:grader,target:'/grader'}]});
   scores.push(Number(classifyCheck(publicCheck).success&&classifyCheck(hidden).success));
  }
  assert.deepEqual(scores,[0,1,1]);assert.equal((await runtime.inspectWorkspace(original.workspace)).head,original.head);
  fs.writeFileSync(path.join(temp,'evidence.json'),JSON.stringify({purpose:'model-free installed runner mechanism; not final evaluation',A,B,C,scores},null,2),{mode:0o600});
 }finally{if(previous===undefined)delete process.env.OPENCODE_CONFIG;else process.env.OPENCODE_CONFIG=previous;await new Promise(resolve=>server.close(resolve));}
});
