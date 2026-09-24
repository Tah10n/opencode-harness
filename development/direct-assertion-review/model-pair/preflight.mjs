// Scripted native OpenCode sessions; no auth read and no external model calls.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {run} from './run.mjs';
import {captureCandidate} from '../../polybench-pilot/capture.mjs';
import {manifest} from '../../native-task-integrated/run.mjs';
const local=path.resolve('local/direct-assertion-review-model-pair'),out=local+'/preflight-verified';
fs.mkdirSync(out,{mode:0o700});
const frozen=JSON.parse(fs.readFileSync(local+'/prepared.json')),attempts=frozen.attempts,task=attempts[0].task,source=attempts[0].source;
// A tiny technical project carries the exact complete ledger TASK unchanged.
const fixture=local+'/fixture-verified';fs.mkdirSync(fixture);fs.writeFileSync(fixture+'/TASK.md',fs.readFileSync(source+'/TASK.md'));
fs.writeFileSync(fixture+'/index.cjs','module.exports = 1;\n');
fs.writeFileSync(fixture+'/index.test.cjs',"require('node:test')('fixture',()=>require('node:assert/strict').equal(require('./index.cjs'),2));\n");
for(const a of attempts){a.source=fixture;frozen.inputManifests[task+'-'+a.arm]=manifest(fixture);}
const inventories={};const actualPrompts={};
const dependencyCheck='git --version && test "$(git rev-list --all --count)" = 1 && test -z "$(git remote)" && node -e \'require("node:sqlite"); console.log("PREPARED_WORKTREE_OK")\'';
const publicCheck='node --test';
fs.writeFileSync(out+'/freeze.json',JSON.stringify(frozen));
let seq=0;const states=new Map();
const outcome=await run(out,{captureCandidate:(session,dir)=>{
 const result=captureCandidate(session,dir);assert.equal(result.status,0);
 const native=JSON.parse(fs.readFileSync(dir+'/native-evidence.json'));const delivered=JSON.parse(native.tools.find(t=>t.data.tool==='harness_task').data.state.output);
 const observed=session.exec(['node','-e',`const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process'),{createHash}=require('crypto');const base='/work/repo/.git/harness-task';const ids=fs.readdirSync(base).filter(n=>fs.existsSync(path.join(base,n,'result.json')));if(ids.length!==1)throw Error('Expected one direct result');const p=path.join(base,ids[0]),r=${JSON.stringify(delivered)};if(r.executionDirectory!==p+'/worktree')throw Error('Execution directory mismatch');const inventory={};function visit(d,rel=''){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==='.git')continue;const f=path.join(d,e.name),key=rel+e.name,st=fs.lstatSync(f);if(st.isDirectory())visit(f,key+'/');else inventory[key]={sha256:createHash('sha256').update(fs.readFileSync(f)).digest('hex'),executable:!!(st.mode&0o111)};}}visit(r.executionDirectory);if(fs.readFileSync('/work/repo/index.cjs','utf8')!=='module.exports = 1;\\n')throw Error('Original changed');console.log(JSON.stringify({executionDirectory:r.executionDirectory,inventory,terminalPatch:fs.readFileSync(p+'/terminal.patch','utf8'),report:r}));`]);
 assert.equal(observed.status,0,observed.stderr);const info=JSON.parse(observed.stdout);fs.writeFileSync(dir+'/delivery-observation.json',JSON.stringify(info));
 const capture=JSON.parse(fs.readFileSync(dir+'/patch-capture.json'));assert.equal(capture.delivery,info.executionDirectory);
 assert.equal(fs.readFileSync(dir+'/model.patch','utf8'),info.terminalPatch);
 assert.deepEqual(info.report.stages.map(x=>[x.role,x.label]),[['author','implementation']]);
 return result;
},readAuth:()=>({access:'scripted-no-credential',accountId:'scripted'}),fetchImpl:async(url,settings)=>{
 assert.equal(url,'https://chatgpt.com/backend-api/codex/responses');const body=JSON.parse(settings.body),all=JSON.stringify(body);
 const a=attempts.find(a=>fs.existsSync(out+'/runs/'+task+'-'+a.arm+'/started.json')&&!fs.existsSync(out+'/runs/'+task+'-'+a.arm+'/completed.json'));assert.ok(a);
 const state=states.get(a.arm)??{parent:0,author:0};states.set(a.arm,state);
 const names=(body.tools??[]).map(t=>t.name),title=!names.length,author=a.arm==='P'||all.includes('Implement the complete original task');let call;
 if(names.length){assert.ok(!names.includes('webfetch'));for(const name of ['read','bash','glob','grep','apply_patch'])assert.ok(names.includes(name));}
 if(a.arm==='P'){assert.ok(!names.includes('harness_task'));assert.ok(!all.includes('Native task workflow'));}
 if(!title&&!author){assert.ok(names.includes('harness_task'));if(state.parent++===0)call={name:'harness_task',args:{}};}
 if(!title&&author){
  const original=fs.readFileSync(source+'/TASK.md','utf8');
  const nativeTexts=(body.input??[]).flatMap(x=>Array.isArray(x.content)?x.content.map(c=>c.text??''):[x.content??'']);
  const decoded=nativeTexts.map(t=>t.startsWith('\"')&&t.endsWith('\"')?t.slice(1,-1).replaceAll('\\\"','\"'):t);
  assert.ok(decoded.some(t=>t.includes(original.trim()))||all.includes(JSON.stringify(original.trim()).slice(1,-1)),'Full original prompt missing');
  if(state.author===0){inventories[a.arm]=body.tools;actualPrompts[a.arm]=nativeTexts;}
  const n=state.author++;
  const calls=[{name:'read',args:{filePath:'index.cjs'}},{name:'bash',args:{command:'node --version && '+dependencyCheck,description:'Verify toolchain and fresh Git',timeout:120000}},
   {name:'apply_patch',args:{patchText:'*** Begin Patch\n*** Update File: index.cjs\n@@\n-module.exports = 1;\n+module.exports = 2;\n*** End Patch'}},
   {name:'bash',args:{command:publicCheck,description:'Run technical fixture',timeout:120000}},
   {name:'bash',args:{command:"node -e 'for(let i=0;i<2400;i++)console.log(\"PAIR_SPILL_\"+i)'",description:'Exercise native spill retention',timeout:120000}}];
  call=calls[n];
 }
 const id='resp_scripted_'+(++seq),item=call?{id:'fc_'+seq,type:'function_call',call_id:'call_'+seq,name:call.name,arguments:JSON.stringify(call.args),status:'completed'}:{id:'msg_'+seq,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Scripted preparation finished.',annotations:[]}]};
 const base={id,object:'response',created_at:1,model:body.model,status:'in_progress',output:[]};
 const events=[{type:'response.created',response:base},{type:'response.output_item.added',output_index:0,item:call?{...item,arguments:'',status:'in_progress'}:{...item,status:'in_progress',content:[]}}];
 if(call)events.push({type:'response.function_call_arguments.delta',item_id:item.id,output_index:0,delta:item.arguments});else events.push({type:'response.content_part.added',item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:item.content[0].text});
 events.push({type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{...base,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}});
 return new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''),{status:200,headers:{'content-type':'text/event-stream'}});
}});
assert.equal(outcome.status,'finished',JSON.stringify(outcome));
const checks=[];
for(const a of attempts){
 const dir=out+'/runs/'+task+'-'+a.arm,r=JSON.parse(fs.readFileSync(dir+'/result.json')),native=JSON.parse(fs.readFileSync(dir+'/native-evidence.json'));
 assert.ok(r.nativeCompleted&&r.termination.terminationVerified);
 assert.ok(native.tools.some(t=>t.data.tool==='bash'&&t.data.state?.metadata?.exit===0&&t.data.state.output.includes('PREPARED_WORKTREE_OK')&&t.data.state.output.includes('v24.19.0')));
 assert.ok(native.tools.some(t=>t.data.tool==='bash'&&t.data.state?.input?.command===publicCheck&&t.data.state?.metadata?.exit===0),'Public test command must run successfully in actual delivery worktree');
 assert.ok(fs.readFileSync(dir+'/model.patch','utf8').includes('+module.exports = 2;'));
 const retained=JSON.parse(fs.readFileSync(dir+'/native-output/manifest.json'));assert.equal(retained.evidenceComplete,true);assert.ok(retained.files.some(f=>f.archiveComplete&&f.size>20000&&f.linkStatus==='linked'));
 checks.push({arm:a.arm,nativeStop:true,nodeAndGitAvailable:true,originalTestsPassed:true,gitDiff:true});
}
assert.deepEqual(inventories.AR0,inventories.AR1);
fs.writeFileSync(out+'/actual-initial-prompts.json',JSON.stringify(actualPrompts));
fs.writeFileSync(out+'/verification.json',JSON.stringify({passed:true,checks,realProviderRequests:0},null,2));
console.log('Single scripted pair preflight passed');
