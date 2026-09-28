// Installed/real HTTP/SSE/process controls. Network-none container and local replies only.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {performance} from 'node:perf_hooks';
import {startContainer} from '../native-task-integrated/container-session.mjs';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
import {captureCandidate} from '../polybench-pilot/capture.mjs';
import {runTask} from '../native-task-ab/native-run.mjs';
import {runNativePhase} from '../native-task-abc/native-run.mjs';
const root=path.resolve(process.argv[2]??'local/investigation-followup/timeouts');fs.mkdirSync(root,{recursive:true});
const installed=path.resolve('local/investigation-followup/installed');
const config=JSON.parse(fs.readFileSync(installed+'/experiment-config.json'));
const toolchain=path.resolve('../verified-change-harness/local/template-toolchain-20260908');
const modes=process.env.DEADLINE_CASES?.split(',')??['stream','command','blocked-loop','investigator'];
const receipts=[];
for(const mode of modes){
 const source=root+'/'+mode+'-source';fs.mkdirSync(source);fs.writeFileSync(source+'/TASK.md','Keep legacy() = 7; investigate its public behavior and finish the task.');fs.writeFileSync(source+'/value.mjs','export const legacy=()=>7;\n');fs.writeFileSync(source+'/package.json','{"type":"module","scripts":{"test":"node --test"}}');
 let session,budgetMs,deadline,deadlineMono,blockTimer,seq=0,authorCalls=0,childCalls=0;const sent=[],partial=[];
 const emit=(send,event)=>send({type:'chunk',data:Buffer.from('data: '+JSON.stringify(event)+'\n\n').toString('base64')});
 try{
  session=await startContainer({source,toolchain,template:installed+'/bundle',output:root+'/'+mode,onRequest:async(frame,send)=>{
   const now=performance.now();assert.ok(now<deadlineMono,'No request after deadline');
   const text=JSON.stringify(frame.body.input),role=!frame.body.tools?.length?'title':text.includes('Investigate this concrete behavior question')?'investigator':text.includes('Implement the complete original task')?'author':'bootstrap';
   sent.push({role,at:new Date().toISOString(),elapsedMs:now-(deadlineMono-budgetMs)});
   const id='resp_local_'+(++seq),base={id,object:'response',created_at:1,model:frame.body.model,status:'in_progress',output:[]};
   send({type:'headers',status:200,contentType:'text/event-stream'});emit(send,{type:'response.created',response:base});
   if(mode==='stream'&&role==='author'){partial.push('partial local stream');emit(send,{type:'response.output_text.delta',delta:'partial local stream'});return;}
   let call;
   if(role==='bootstrap')call={name:'harness_task',arguments:'{}'};
   if(role==='author'){
    assert.equal(authorCalls++,0,'No further author operation');
    call=mode==='investigator'?{name:'harness_investigate',arguments:JSON.stringify({action:'investigate',question:'Does legacy return 7?',location:'value.mjs',reason:'Original public contract.'})}:{name:'bash',arguments:JSON.stringify({command:"node -e \"console.log('partial native command');setInterval(()=>{},1000)\"",workdir:'.',description:'Controlled unfinished native command'})};
   }
   if(role==='investigator'){assert.equal(childCalls++,0);call={name:'bash',arguments:JSON.stringify({command:"node -e \"console.log('partial investigator command');setInterval(()=>{},1000)\"",workdir:'.',timeout:300000,description:'Controlled unfinished investigator'})};}
   const item=call?{id:'fc_'+seq,type:'function_call',call_id:'call_'+seq,...call,status:'completed'}:{id:'msg_'+seq,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'local fixture',annotations:[]}]};
   emit(send,{type:'response.output_item.added',output_index:0,item:call?{...item,arguments:'',status:'in_progress'}:{...item,status:'in_progress',content:[]}});
   if(call)emit(send,{type:'response.function_call_arguments.delta',item_id:item.id,output_index:0,delta:item.arguments});
   else {emit(send,{type:'response.content_part.added',item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}});emit(send,{type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:'local fixture'});}
   emit(send,{type:'response.output_item.done',output_index:0,item});emit(send,{type:'response.completed',response:{...base,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}});send({type:'end'});
  }});
  session.baseline=session.exec(['git','rev-parse','HEAD']).stdout.trim();session.arm='I1';session.evidenceRequired=true;session.evidenceBaseline=session.baseline;
  assert.equal(session.exec(['/opt/opencode','--version']).stdout.trim(),'1.18.26');
  const setup=session.exec(['node','-e',"const fs=require('fs');fs.mkdirSync('/work/bin');fs.copyFileSync('/template/rg','/work/bin/rg');fs.chmodSync('/work/bin/rg',0o755);fs.mkdirSync('/work/config/opencode',{recursive:true});for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync('/template/'+n,'/work/config/opencode/'+n,{recursive:true,verbatimSymlinks:true});"]);assert.equal(setup.status,0,setup.stderr);
  // Investigator keeps the existing >=120s admission rule. No shortened threshold.
  budgetMs=mode==='investigator'?130000:mode==='blocked-loop'?1000:mode==='near-complete'?1500:4000;
  deadline=Date.now()+budgetMs;deadlineMono=performance.now()+budgetMs;session.setTaskBudget(budgetMs,deadline);
  let result;
  if(mode==='blocked-loop'||mode==='near-complete'){
   result=await runNativePhase(session,{config,deadline,deadlineMono,limitMs:budgetMs,stopGraceMs:3000,stopWorkload},{spawnProcess:()=>{
    const script=mode==='near-complete'?`console.log(JSON.stringify({type:'partial',text:'workload running'}));setTimeout(()=>console.log(JSON.stringify({type:'step_finish',part:{reason:'stop'}})),Math.max(0,${deadline}-Date.now()-100));`:"console.log(JSON.stringify({type:'partial',text:'workload running'}));setInterval(()=>{},1000)";
    const p=spawn('docker',['exec',session.name,'node','-e',script],{stdio:['ignore','pipe','pipe']});
    if(mode==='blocked-loop')blockTimer=setTimeout(()=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2200),200);return p;
   }});
  }else result=await runTask(session,{config,task:fs.readFileSync(source+'/TASK.md','utf8'),enabled:true,arm:'I1',model:'openai/gpt-5.6-luna',variant:'high',deadline,deadlineMono,limitMs:budgetMs,stopWorkload,stopGraceMs:3000});
  clearTimeout(blockTimer);
  assert.equal(result.timedOut,mode!=='near-complete');assert.equal(result.termination.terminationVerified,true);
  const independent=JSON.parse(fs.readFileSync(session.output+'/deadline-stop.json'));
  assert.equal(independent.termination.terminationVerified,true);
  const cancelLatencyMs=independent.cancellationStarted.monotonicMs-deadlineMono,stopLatencyMs=independent.stopSettled.monotonicMs-deadlineMono;
  if(mode==='near-complete'){assert.equal(result.exitCode,0);assert.ok(result.completedAt<deadline);assert.equal(independent.trigger,'normal_cleanup');assert.deepEqual(independent.termination.killed,[]);}
  assert.ok(cancelLatencyMs<250,'Independent cancel latency <=250ms');assert.ok(stopLatencyMs<3000,'Local stop <=3000ms grace');
  const confirmation=stopWorkload(session);assert.equal(confirmation.terminationVerified,true);assert.deepEqual(confirmation.killed,[],'No owned workload processes remain in container');
  if(mode==='investigator')assert.equal(childCalls,1);
  const native=session.exec(['node','-e',"const {DatabaseSync}=require('node:sqlite'),fs=require('fs');if(!fs.existsSync('/work/data/opencode/opencode.db')){console.log(JSON.stringify({sessions:[],messages:[],tools:[]}));}else{const db=new DatabaseSync('/work/data/opencode/opencode.db',{readOnly:true});console.log(JSON.stringify({sessions:db.prepare('SELECT id,parent_id,directory FROM session').all(),messages:db.prepare('SELECT id,session_id,data FROM message').all().map(x=>({...x,data:JSON.parse(x.data)})),tools:db.prepare('SELECT id,message_id,session_id,data FROM part').all().map(x=>({...x,data:JSON.parse(x.data)})).filter(x=>x.data.type==='tool')}));db.close();}"]);
  assert.equal(native.status,0,native.stderr);fs.writeFileSync(session.output+'/native-evidence.json',native.stdout);
  assert.equal(captureCandidate(session,session.output).status,0,'Capture before cleanup');
  const outputs=JSON.parse(fs.readFileSync(session.output+'/native-output/manifest.json'));
  const nativeText=JSON.stringify(JSON.parse(native.stdout).tools.map(t=>({output:t.data.state?.output,metadata:t.data.state?.metadata})))+outputs.files.filter(f=>f.archiveComplete).map(f=>fs.readFileSync(session.output+'/'+f.destination,'utf8')).join('');
  const partialRetained=mode==='stream'?partial.length>0:['blocked-loop','near-complete'].includes(mode)?fs.readFileSync(session.output+'/events.jsonl','utf8').includes('workload running'):nativeText.includes(mode==='investigator'?'partial investigator command':'partial native command');
  assert.ok(partialRetained,'Actual partial native/stream bytes retained');
  const receipt={mode,passed:true,budgetMs,cancelToleranceMs:250,stopGraceMs:3000,cancelLatencyMs,stopLatencyMs,independent,hostTiming:result.timing,requests:sent,investigatorStarts:childCalls,providerTerminal:mode==='stream'?'unknown for final author stream; previous scripted responses completed':'scripted tool responses completed; local command interrupted',partialStream:partial,partialRetained,nativeOutputFiles:outputs.files.length,noWorkloadProcesses:true,realProviderCalls:0};
  fs.writeFileSync(session.output+'/receipt.json',JSON.stringify(receipt,null,2)+'\n');receipts.push(receipt);console.log(JSON.stringify({mode,passed:true,cancelLatencyMs,stopLatencyMs}));
 }finally{clearTimeout(blockTimer);if(session)assert.equal(session.close(),0);}
}
fs.writeFileSync(root+'/receipts.json',JSON.stringify(receipts,null,2)+'\n');
