// Scripted native OpenCode sessions; no auth read and no external model calls.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {run} from './run.mjs';
const local=path.resolve('local/plain-ledger-native-high'),out=local+'/preflight';
fs.mkdirSync(out,{mode:0o700});
const frozen=JSON.parse(fs.readFileSync(local+'/prepared.json')),attempts=frozen.attempts,task=attempts[0].task,source=attempts[0].source;
const dependencyCheck='git --version && test "$(git rev-list --all --count)" = 1 && test -z "$(git remote)" && node -e \'require("node:sqlite"); console.log("PREPARED_WORKTREE_OK")\'';
const publicCheck='node --test packages/connector/test/readers.test.mjs packages/connector/test/config.test.mjs packages/connector/test/protocol.test.mjs';
fs.writeFileSync(out+'/freeze.json',JSON.stringify(frozen));
let seq=0;const states=new Map();
const outcome=await run(out,{readAuth:()=>({access:'scripted-no-credential',accountId:'scripted'}),fetchImpl:async(url,settings)=>{
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
  const n=state.author++;
  const calls=[{name:'read',args:{filePath:'/work/repo/packages/connector/lib/readers.mjs'}},{name:'bash',args:{command:'node --version && npm --version && '+dependencyCheck,description:'Verify prepared project toolchain',timeout:120000}},
   {name:'apply_patch',args:{patchText:'*** Begin Patch\n*** Add File: preflight-marker.txt\n+scripted recorder check, not a model solution\n*** End Patch'}},
   {name:'bash',args:{command:publicCheck,description:'Run an original public baseline test',timeout:120000}}];
  calls.push({name:'bash',args:{command:'git diff --no-index -- /dev/null preflight-marker.txt; test -f preflight-marker.txt',description:'Inspect ordinary Git diff',timeout:120000}});
  calls.push({name:'bash',args:{command:"node -e 'for(let i=0;i<2400;i++)console.log(\"PLAIN_SPILL_\"+i)'",description:'Exercise native spill retention',timeout:120000}});
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
 assert.ok(fs.readFileSync(dir+'/model.patch','utf8').includes('preflight-marker.txt'));
 assert.equal(fs.readdirSync(dir+'/task-artifacts').length,0);
 assert.ok(native.tools.some(t=>t.data.tool==='bash'&&t.data.state?.input?.command.startsWith('git diff')&&t.data.state?.metadata?.exit===0&&t.data.state.output.includes('scripted recorder check')));
 const retained=JSON.parse(fs.readFileSync(dir+'/native-output/manifest.json'));assert.equal(retained.evidenceComplete,true);assert.ok(retained.files.some(f=>f.archiveComplete&&f.size>20000&&f.linkStatus==='linked'));
 checks.push({arm:a.arm,nativeStop:true,nodeAndGitAvailable:true,originalTestsPassed:true,gitDiff:true});
}
fs.writeFileSync(out+'/verification.json',JSON.stringify({passed:true,checks,realProviderRequests:0},null,2));
console.log('Single scripted plain preflight passed');
