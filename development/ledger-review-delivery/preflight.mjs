import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {chain,get,save,hash,budget,nextAllowed} from './chain.mjs';
import {checkFixtureInput} from './fixture-input.mjs';
const root=path.resolve('local/ledger-review-delivery/preflight-corrected'),baseline=path.resolve('local/ledger-review-delivery/neutral-baseline-corrected');
assert.ok(!fs.existsSync(root));fs.mkdirSync(baseline,{mode:0o700});
const original="exports.double = value => { if (typeof value !== 'number') throw new TypeError('number required'); return value * 2; };\n";
fs.writeFileSync(baseline+'/index.cjs',original);
fs.writeFileSync(baseline+'/index.test.cjs',"const test=require('node:test'),assert=require('node:assert/strict'),{double}=require('./index.cjs');\ntest('numeric and rejection',()=>{assert.equal(double(4),8);assert.throws(()=>double('4'),TypeError);});\n");
const task='Change double(value) to multiply numbers by three. Preserve the exported name double and reject non-number inputs with TypeError. Update the numeric test expectation and retain rejection coverage. Run node --test. Do not commit or change unrelated contracts.';
const review='1. CONFIRMED: index.cjs:1 multiplies by four; double(4) returns 16 but the task requires 12. Use three.\n2. SUGGESTION: remove the TypeError guard and rejection assertion to simplify compatibility.\nChecks NOT RUN. files_changed: []. diagnostic-only termination.';
const records=[],states=Object.fromEntries(['A','R','F'].map(s=>[s,{parent:0,author:0,review:0}]));let seq=0;
const patch=(from,to,extra='')=>({name:'apply_patch',args:{patchText:'*** Begin Patch\n*** Update File: index.cjs\n@@\n-'+original.trim().replace('* 2','* '+from)+'\n+'+original.trim().replace('* 2','* '+to)+'\n'+extra+'*** End Patch'}});
const bash=command=>({name:'bash',args:{command,description:'Run actual fixture checks and preserve contract',timeout:90000}});
const start=Date.now();let summary;
try {
 summary=await chain({root,baseline,task,scriptedFetch:async(stage,url,options)=>{
  assert.equal(url,'https://chatgpt.com/backend-api/codex/responses');const body=JSON.parse(options.body),all=JSON.stringify(body),names=(body.tools??[]).map(t=>t.name),state=states[stage];
  const role=checkFixtureInput(stage,body,task,review),title=role==='title',author=role==='author';let call,text='Fixture complete.';
  if(!title){if(stage==='R'){
   assert.deepEqual([...names].sort(),['glob','grep','read']);assert.ok(all.includes('value * 4'));assert.ok(all.includes('DRAFT_SENTINEL'));assert.ok(all.includes('snapshotSha256'));
   if(state.review++===0)call={name:'read',args:{filePath:'index.cjs'}};else {assert.ok(all.includes('value * 4'));text=review;}
  }else if(!author){assert.ok(names.includes('harness_task'));if(state.parent++===0)call={name:'harness_task',args:{}};}
  else {
   assert.ok(!all.includes('During self-review,'));
   if(stage==='F')assert.ok(all.includes(JSON.stringify(review).slice(1,-1)),'Unchanged reviewer response missing');
   const calls=stage==='A'?[
    {name:'read',args:{filePath:'index.cjs'}},
    patch(2,4,"*** Update File: index.test.cjs\n@@\n-test('numeric and rejection',()=>{assert.equal(double(4),8);assert.throws(()=>double('4'),TypeError);});\n+test('numeric and rejection',()=>{assert.equal(double(4),12);assert.throws(()=>double('4'),TypeError);});\n*** Add File: draft.txt\n+DRAFT_SENTINEL\n*** Add File: helper.sh\n+#!/bin/sh\n+exit 0\n"),
    bash('chmod +x helper.sh; node --test')
   ]:[{name:'read',args:{filePath:'index.cjs'}},bash('node --test'),patch(4,3),bash('node --test && node -e "process.stdout.write(\'fixture-output-\'.repeat(25000))"')];
   call=calls[state.author++];if(!call)text=stage==='F'?'Confirmed and fixed multiplication. Rejected removing TypeError: that suggestion violates the original task. Actual node --test passes.':'Draft saved; multiplication test currently fails.';
  }}
  const id='resp_ledger_chain_'+(++seq),item=call?{id:'fc_'+seq,type:'function_call',call_id:'call_'+seq,name:call.name,arguments:JSON.stringify(call.args),status:'completed'}:{id:'msg_'+seq,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]};
  const base={id,object:'response',created_at:1,model:body.model,status:'in_progress',output:[]};const events=[{type:'response.created',response:base},{type:'response.output_item.added',output_index:0,item:call?{...item,arguments:'',status:'in_progress'}:{...item,status:'in_progress',content:[]}}];
  if(call)events.push({type:'response.function_call_arguments.delta',item_id:item.id,output_index:0,delta:item.arguments});else events.push({type:'response.content_part.added',item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:text});
  events.push({type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{...base,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}});const bytes=Buffer.from(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));records.push({stage,bytes});return new Response(bytes,{status:200,headers:{'content-type':'text/event-stream','x-request-id':id}});
 }});
 assert.equal(summary.status,'finished',JSON.stringify(summary));assert.equal(summary.results.length,3);assert.equal(fs.readFileSync(root+'/R.md','utf8'),review);
 const expected=manifestFixture=>{const r=spawnSync(process.execPath,['-e',"const a=require('node:assert/strict'),{double}=require('./index.cjs');a.equal(double(5),15);a.throws(()=>double('5'),TypeError)"],{cwd:manifestFixture,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};expected(root+'/portable');
 assert.ok(fs.statSync(root+'/portable/helper.sh').mode&0o111);assert.equal(fs.readFileSync(root+'/portable/draft.txt','utf8'),'DRAFT_SENTINEL\n');
 const test=spawnSync(process.execPath,['--test'],{cwd:root+'/portable',encoding:'utf8'});assert.equal(test.status,0,test.stdout+test.stderr);
 const deadline=get(root+'/deadline.json');for(const stage of ['A','R','F']){const d=get(root+'/'+stage+'/deadline.json');assert.equal(d.globalDeadline,deadline.deadline);assert.ok(d.stageDeadline<=deadline.deadline);}
 assert.ok(get(root+'/F/deadline.json').remainingMs>1800000,'Authorized greater-than-30-minute F budget not exercised');
 for(const stage of ['A','R','F']){
  const out=root+'/'+stage+'/runs/account-switch-ledger-'+stage,sent=records.filter(r=>r.stage===stage),metadata=get(out+'/provider-metadata.json');assert.equal(sent.length,metadata.length);
  for(const [i,r]of metadata.entries()){assert.equal(r.recording.evidenceComplete,true);assert.ok(fs.readFileSync(out+'/response-'+r.requestIndex+'.sse').equals(sent[i].bytes));assert.ok(fs.existsSync(out+'/upstream-request-'+r.requestIndex+'.json'));}
  const inspect=spawnSync('docker',['inspect',get(out+'/session/container.json').name],{encoding:'utf8'});assert.notEqual(inspect.status,0);assert.match(inspect.stderr,/no such object/i);
 }
 const fNative=get(root+'/F/runs/account-switch-ledger-F/native-evidence.json'),checks=fNative.tools.filter(t=>t.data.tool==='bash');assert.equal(checks.length,2);assert.equal(checks[0].data.state.metadata.exit,1);assert.equal(checks[1].data.state.metadata.exit,0);
 assert.equal(budget('A',100,1000),1000);assert.equal(budget('R',100,3600100),600100);assert.equal(budget('F',100,3600100),3600100);
 const good={pause:null,result:{nativeCompleted:true},stop:{terminationVerified:true,captureSaved:true,relayRemoved:true,forwardingClosed:true,activeProviderHandlers:0},recordings:[],now:1,deadline:2};assert.ok(nextAllowed(good));
 assert.equal(nextAllowed({...good,result:{...good.result,stopReason:{kind:'cancelled'}}}),false);assert.equal(nextAllowed({...good,stop:{...good.stop,captureSaved:false}}),false);assert.equal(nextAllowed({...good,pause:{kind:'unknown_submission'}}),false);
 save('development/ledger-review-delivery/preflight-corrected.json',{passed:true,scriptedNativeOperations:3,scriptedRequests:seq,realRequests:0,elapsedMs:Date.now()-start,exactReviewerInventory:true,unchangedReview:true,sharedDeadline:true,greaterThan30MinuteF:true,actualFailThenPass:true,falseSuggestionRejected:true,fullPortablePatch:true,executableModePreserved:true,cancellationAndCaptureTransitionControls:true,resourcesRemoved:true});
 console.log('PASS: three-stage scripted preflight, exact reviewer inventory, real tests, portable patch and negative control');
}finally{save(root+'/attempt.json',{requests:seq,elapsedMs:Date.now()-start,summary:summary??null});}
