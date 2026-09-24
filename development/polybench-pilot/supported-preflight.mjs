// Reused existing scripted fixture only; never sent to a real model or benchmark author.
// Existing scheduler/capture with an in-process scripted fetch; no credentials/network.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {run} from '../native-type-compat-offline-subscribe/run.mjs';import {manifest} from '../native-task-integrated/run.mjs';
const root=path.resolve('local/polybench-pilot/recorder-fixture'),out=root+'/preflight',dev=path.resolve('development/native-type-compat-comparison');fs.mkdirSync(out,{mode:0o700});
const attempts=[['A','OFF'],['A','ON']].map(([task,arm],i)=>({slot:i+1,task,arm,project:'primus/eventemitter3',source:root+'/inputs/'+task}));
const inputManifests={};for(const a of attempts)inputManifests[a.task+'-'+a.arm]=manifest(a.source);
fs.writeFileSync(out+'/freeze.json',JSON.stringify({version:1,experimentKind:'subscribe-offline',runtimeSha:'e18db1fe10223db52dcc05b3e769bca140367c2b',model:'openai/gpt-5.6-luna',variant:'high',budgetMs:1800000,strategy:'direct',preflightPassed:true,streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,toolchain:path.resolve('../verified-change-harness/local/template-toolchain-20260908'),template:root+'/bundle',dependencies:root+'/bundle',config:JSON.parse(fs.readFileSync(root+'/experiment-config.json')),attempts,inputManifests,files:{}}));
let seq=0;const states=new Map(),failures=[];
const result=await run(out,{readAuth:()=>({access:'scripted-no-credential',accountId:'scripted'}),fetchImpl:async(url,settings)=>{
 assert.equal(url,'https://chatgpt.com/backend-api/codex/responses');const body=JSON.parse(settings.body),all=JSON.stringify(body);
 const attempt=attempts.find(a=>fs.existsSync(out+'/runs/'+a.task+'-'+a.arm+'/started.json')&&!fs.existsSync(out+'/runs/'+a.task+'-'+a.arm+'/completed.json'));assert.ok(attempt);const key=attempt.task+'-'+attempt.arm;
 const state=states.get(key)??{author:0,parent:0};states.set(key,state);
 let call;
 if(body.tools?.length){const names=body.tools.map(t=>t.name);assert.ok(!names.includes('webfetch'));for(const n of ['bash','read','apply_patch','glob','grep'])assert.ok(names.includes(n),n);}
 const title=!body.tools?.length,author=all.includes('Implement the complete original task');
 if(!title&&!author){if(state.parent++===0)call={name:'harness_task',args:{}};}
 if(author){
  assert.ok(all.includes(JSON.stringify(fs.readFileSync(attempt.source+'/TASK.md','utf8').trim()).slice(1,-1)),'Original full task absent');
  const n=state.author++,ref=path.resolve('local/native-type-compat-comparison/batch')+(attempt.task==='A'?'/calibration/':'/waitfor-calibration/')+attempt.task+'/reference';
  const old=fs.readFileSync(attempt.source+'/index.d.ts','utf8'),good=fs.readFileSync(ref+'/index.d.ts','utf8');
  const bad=good.replace('Array<EventEmitter.EventListener<EventTypes, T>>','Array<(this: Context, ...args: EventEmitter.EventArgs<EventTypes, T>) => void>');
  const outputs=(body.input??[]).filter(x=>x.type==='function_call_output');
  if(n===10){const text=JSON.stringify(outputs);if(attempt.arm==='ON')assert.ok(text.includes('Type compatibility observation')&&text.includes('2684'),'Compiler evidence missing from actual next request');else assert.ok(!text.includes('Type compatibility observation'));}
  const bash=command=>({name:'bash',args:{command,workdir:'.',description:'Local scripted preflight',timeout:120000}});
  const patch=(file,before,after)=>({name:'apply_patch',args:{patchText:'*** Begin Patch\n*** Update File: '+file+'\n@@\n'+before.trimEnd().split('\n').map(l=>'-'+l).join('\n')+'\n'+after.trimEnd().split('\n').map(l=>'+'+l).join('\n')+'\n*** End Patch'}});
  const cli='/usr/local/bin/node /template/node_modules/typescript/lib/tsc.js --ignoreConfig --noEmit --strict --target es2020 --module commonjs --moduleResolution node --ignoreDeprecations 6.0 ';
  const goodExample="import E from './index'; const e = new E<{data: [string]}>(); e.on('data', value => value.toUpperCase()); const p: Promise<string> = Promise.resolve('ready'); void p;\n";
  const checks=[bash('/usr/local/bin/node --version'),bash("cat > compiler-ready.ts <<'TS'\n"+goodExample+"TS\n"+cli+'compiler-ready.ts'),bash("printf '%s' 'const value: number = \"invalid\";' > compiler-error.ts; "+cli+'compiler-error.ts'),bash('rm compiler-ready.ts compiler-error.ts')];
  const calls=[bash('pwd'),...checks,patch('index.d.ts',old,bad),patch('index.js',fs.readFileSync(attempt.source+'/index.js','utf8'),fs.readFileSync(ref+'/index.js','utf8')),bash('npm run test-esm'),bash('npm run rollup'),bash('npm test'),patch('index.d.ts',bad,good),bash('npm test')];call=calls[n];
 }
 const id='resp_scripted_'+(++seq),item=call?{id:'fc_'+seq,type:'function_call',call_id:'call_'+seq,name:call.name,arguments:JSON.stringify(call.args),status:'completed'}:{id:'msg_'+seq,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Local scripted preflight finished; no model quality claim.',annotations:[]}]};
 const base={id,object:'response',created_at:1,model:body.model,status:'in_progress',output:[]},events=[{type:'response.created',response:base},{type:'response.output_item.added',output_index:0,item:call?{...item,arguments:'',status:'in_progress'}:{...item,status:'in_progress',content:[]}}];
 if(call)events.push({type:'response.function_call_arguments.delta',item_id:item.id,output_index:0,delta:item.arguments});else events.push({type:'response.content_part.added',item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:item.content[0].text});events.push({type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{...base,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}});
 return new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''),{status:200,headers:{'content-type':'text/event-stream'}});
}});
assert.equal(result.status,'finished',JSON.stringify(result));
const checks=[];for(const a of attempts){const d=out+'/runs/'+a.task+'-'+a.arm,r=JSON.parse(fs.readFileSync(d+'/result.json'));assert.ok(r.nativeCompleted&&r.termination.terminationVerified);const art=d+'/candidate/.git/harness-task',folder=art+'/'+fs.readdirSync(art)[0];
 const report=JSON.parse(fs.readFileSync(folder+'/result.json'));assert.ok(report.termination.verified);const patch=fs.readFileSync(folder+'/terminal.patch');assert.ok(patch.length);const applied=out+'/applied-'+a.task+'-'+a.arm;fs.cpSync(a.source,applied,{recursive:true,verbatimSymlinks:true});execFileSync('git',['apply','--binary','-'],{cwd:applied,input:patch});assert.equal(fs.readFileSync(d+'/candidate/index.js','utf8'),fs.readFileSync(a.source+'/index.js','utf8'));
 const metadata=JSON.parse(fs.readFileSync(d+'/provider-metadata.json'));assert.ok(metadata.every(q=>q.usage&&q.serverCompletion==='completed'&&fs.existsSync(d+'/response-'+q.requestIndex+'.sse')&&fs.existsSync(d+'/request-'+q.requestIndex+'.json')));
 let compat=null;if(a.arm==='ON'){compat=JSON.parse(fs.readFileSync(folder+'/type-compat.json'));assert.equal(compat.runs.length,2);assert.equal(compat.runs[0].status,'reproduced-incompatibility');assert.equal(compat.runs[1].status,'no-difference-in-checked-scope');for(const run of compat.runs){assert.ok(run.snapshot&&run.baselineSnapshot);assert.ok(fs.readdirSync(d).filter(n=>n.startsWith('request-')).some(n=>fs.readFileSync(d+'/'+n,'utf8').includes(run.snapshot)));}}
 else assert.ok(!fs.existsSync(folder+'/type-compat.json'));
 checks.push({task:a.task,arm:a.arm,requests:metadata.length,portablePatch:true,sourcePreserved:true,capture:true,termination:true,compat:compat?.runs.map(x=>({status:x.status,snapshot:x.snapshot}))});
}
fs.writeFileSync(root+'/preflight.json',JSON.stringify({passed:true,checks,realProviderRequests:0},null,2));console.log('Scripted preflight and capture verified');
