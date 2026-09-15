// Real isolated OpenCode processes; scripted upstream only, zero paid calls.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {startContainer} from './container-session.mjs';import {captureCandidate} from './capture-candidate.mjs';import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';import {runTask} from './native-run.mjs';import {runComparison,responseObserver,knownResponseTerminal} from './run-comparison.mjs';
const original=JSON.parse(fs.readFileSync(path.resolve(process.argv[2],'freeze.json'))),replayPath=path.resolve(process.argv[2],'runs/ufo-query-sort-r1-H00/response-10.sse');
const output=path.resolve(process.argv[3]);fs.mkdirSync(output,{recursive:false});
const sha=b=>createHash('sha256').update(b).digest('hex');const delay=ms=>new Promise(r=>setTimeout(r,ms));
const usage={input_tokens:2,output_tokens:3,total_tokens:5,input_tokens_details:{cached_tokens:1},output_tokens_details:{reasoning_tokens:2}};
function events(id,{status='completed',call=null,withUsage=true}={}){
 const base={id,object:'response',created_at:1,model:'gpt-5.6-luna',status:'in_progress',output:[]};
 const item=call?{id:'fc_'+id,type:'function_call',call_id:'call_'+id,name:call.name,arguments:JSON.stringify(call.args),status:'completed'}:{id:'msg_'+id,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Scripted native completion.',annotations:[]}]};
 const rows=[{type:'response.created',response:base},{type:'response.output_item.added',output_index:0,item:call?{...item,arguments:'',status:'in_progress'}:{...item,content:[],status:'in_progress'}}];
 if(call)rows.push({type:'response.function_call_arguments.delta',item_id:item.id,output_index:0,delta:item.arguments});else rows.push({type:'response.content_part.added',item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:item.content[0].text});
 rows.push({type:'response.output_item.done',output_index:0,item},{type:'response.'+status,response:{...base,status,output:[item],...(withUsage?{usage}:{})}});return rows;
}
const encode=rows=>Buffer.from(rows.map(e=>'event: '+e.type+'\r\ndata: '+JSON.stringify(e)+'\r\n\r\n').join(''));
// Small protocol checks supplement real process scenarios, including malformed/binding conflicts.
for(const status of ['completed','failed','incomplete']){const r={usage:null},o=responseObserver(r);const bytes=encode(events('resp_'+status,{status}));for(let i=0;i<bytes.length;i+=7)o.push(bytes.subarray(i,i+7));o.end();assert.equal(r.serverCompletion,status);assert.ok(knownResponseTerminal(r));assert.equal(r.usage.total_tokens,5);}
for(const mode of ['unbound','different-id','different-terminal','event-type-mismatch','fake-output','malformed']){
 const r={usage:null},o=responseObserver(r);let rows=events('resp_a');
 if(mode==='unbound')rows=rows.slice(-1);if(mode==='different-id')rows.at(-1).response.id='resp_b';if(mode==='different-terminal')rows.push({...rows.at(-1),type:'response.failed',response:{...rows.at(-1).response,status:'failed'}});if(mode==='fake-output')rows=[{type:'response.output_text.delta',delta:'response.completed',response:{id:'resp_a',status:'completed',usage}}];
 let b=encode(rows);if(mode==='event-type-mismatch')b=Buffer.from(b.toString().replace('event: response.completed','event: response.failed'));if(mode==='malformed')b=Buffer.concat([Buffer.from('data: {bad}\n\n'),b]);o.push(b);o.end();assert.equal(knownResponseTerminal(r),false,mode);
}
{const record={usage:null},observer=responseObserver(record);observer.push(encode(events('resp_incomplete_utf8')));observer.push(Buffer.from([0xc3]));assert.throws(()=>observer.end());assert.equal(knownResponseTerminal(record),false);assert.equal(record.terminalResponse.status,'completed');assert.equal(record.usage.total_tokens,5);}
let checks=[];
for(const mode of ['completed-abort','in-progress-abort','previous-completed-new-abort','late-native-completion','active-tool-unverified','duplicate-terminal','completed-no-usage','authorization','quota','slot18-replay']){
 const root=path.join(output,mode);fs.mkdirSync(root);const source=path.join(root,'source');fs.mkdirSync(source);fs.writeFileSync(path.join(source,'TASK.md'),'Read this task and finish. This is a scripted local lifecycle check.');
 const input={'TASK.md':{sha256:sha(fs.readFileSync(path.join(source,'TASK.md'))),executable:false}};
 const attempts=original.attempts.map(a=>({...a,source}));const f={...original,files:{},runtimeManifests:{},attempts,inputManifests:Object.fromEntries(attempts.map(a=>[a.task+'-'+a.arm,input]))};fs.writeFileSync(path.join(root,'freeze.json'),JSON.stringify(f));
 let current=0,sequence=0,started=[],work=new Map(),stops=[],unknownToolObserved=false;
 const start=async args=>{current=attempts.find(a=>!started.includes(a.slot)).slot;started.push(current);const s=await startContainer(args);s.testSlot=current;return s;};
 const stop=s=>{stops.push({slot:s.testSlot,at:Date.now()});return stopWorkload(s);};
 const fetchImpl=async(url,options)=>{
  assert.equal(url,'https://chatgpt.com/backend-api/codex/responses');const body=JSON.parse(options.body),slot=current;sequence++;const isWork=!!body.tools?.length,n=work.get(slot)??0;if(isWork)work.set(slot,n+1);
  if(slot>=3||slot===1&&['authorization','quota'].includes(mode))return new Response(JSON.stringify({error:{type:mode==='authorization'?'unauthorized':'usage_limit_reached',message:'Scripted refusal'}}),{status:mode==='authorization'?401:429});
  const bootstrap=slot===2&&isWork&&n===0;let call=bootstrap?{name:'harness_task',args:{}}:null;
  if(slot===1&&isWork&&n===0&&mode==='previous-completed-new-abort')call={name:'read',args:{filePath:'TASK.md'}};
  if(slot===1&&isWork&&n===0&&mode==='active-tool-unverified')call={name:'bash',args:{command:"node -e 'setInterval(()=>{},1000)'",description:'Scripted still-active tool'}};
  const id='resp_local_'+sequence;let rows=events(id,{call,withUsage:!(mode==='completed-no-usage'&&slot===1&&isWork)});
  const aborting=slot===1&&isWork&&(['completed-abort','in-progress-abort','completed-no-usage','slot18-replay'].includes(mode)||mode==='previous-completed-new-abort'&&n===1);
  if(slot===1&&isWork&&(mode==='in-progress-abort'||mode==='previous-completed-new-abort'&&n===1))rows=rows.slice(0,1);
  if(slot===1&&isWork&&mode==='duplicate-terminal')rows.push(rows.at(-1));
  const bytes=mode==='slot18-replay'&&slot===1&&isWork?fs.readFileSync(replayPath):encode(rows);
  return {status:200,headers:new Headers({'content-type':'text/event-stream'}),body:(async function*(){
   for(let i=0;i<bytes.length;i+=23)yield bytes.subarray(i,i+23);
   if(mode==='late-native-completion'&&slot===1&&isWork){await delay(1500);assert.equal(stops.length,0,'No premature kill while native stream settles');}
   if(aborting){await delay(30);throw Object.assign(Error('Scripted post-chunk transport abort'),{name:'AbortError'});}
  })()};
 };
 const run=async(session,options)=>{
  if(mode==='active-tool-unverified'&&session.testSlot===1){
   const check=setTimeout(()=>{assert.deepEqual(started,[1]);const result=session.exec(['node','-e',"const fs=require('fs');console.log(fs.readdirSync('/proc').filter(n=>/^\\d+$/.test(n)).map(n=>{try{return fs.readFileSync('/proc/'+n+'/cmdline','utf8')}catch{return ''}}).filter(s=>s.includes('setInterval')).length)"]);unknownToolObserved=Number(result.stdout)>0;},1800);
   try{const r=await runTask(session,{...options,limitMs:3000,deadline:Date.now()+3000});return {...r,termination:{terminationVerified:false}};}finally{clearTimeout(check);}
  }
  return runTask(session,{...options,limitMs:30000,deadline:Date.now()+30000});
 };
 const result=await runComparison({root,startContainer:start,captureCandidate,stopWorkload:stop,readAuth:()=>({access:'scripted-not-a-credential',accountId:'scripted'}),fetchImpl,runTaskImplementation:run});
 const first=path.join(root,'runs',attempts[0].task+'-r1-P'),records=JSON.parse(fs.readFileSync(path.join(first,'provider-metadata.json'))),scored=records.filter(r=>r.requestKind==='work');
 const canAdvance=['completed-abort','late-native-completion','duplicate-terminal','completed-no-usage','slot18-replay'].includes(mode);assert.deepEqual(started,canAdvance?[1,2,3]:[1],mode);
 if(['completed-abort','completed-no-usage','slot18-replay'].includes(mode)){assert.equal(scored[0].serverCompletion,'completed');assert.equal(scored[0].error,'AbortError');assert.ok(!JSON.parse(fs.readFileSync(path.join(first,'result.json'))).nativeCompleted);assert.equal(scored[0].usage?.total_tokens??null,mode==='completed-no-usage'?null:mode==='slot18-replay'?28810:5);}
 if(mode==='in-progress-abort')assert.equal(scored[0].serverCompletion,'unknown');
 if(mode==='previous-completed-new-abort'){assert.equal(scored[0].serverCompletion,'completed');assert.equal(scored[1].serverCompletion,'unknown');}
 if(mode==='duplicate-terminal'){assert.equal(scored[0].terminalEvents,1);assert.equal(scored[0].duplicateTerminalEvents,1);assert.equal(scored[0].usage.total_tokens,5);}
 if(mode==='late-native-completion')assert.equal(JSON.parse(fs.readFileSync(path.join(first,'result.json'))).nativeCompleted,true);
 if(mode==='active-tool-unverified')assert.ok(unknownToolObserved);
 checks.push({mode,startedSlots:started,scriptedRequests:sequence,realProviderRequests:0,status:result.status,unknownToolObserved,firstResponseFacts:scored.map(r=>({responseStatus:r.responseStatus,serverCompletion:r.serverCompletion,usage:r.usage,error:r.error,terminalEvents:r.terminalEvents,duplicateTerminalEvents:r.duplicateTerminalEvents}))});console.log(JSON.stringify(checks.at(-1)));
}
fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify({passed:true,realProviderRequests:0,slot18ReplaySha256:sha(fs.readFileSync(replayPath)),checks},null,2));
