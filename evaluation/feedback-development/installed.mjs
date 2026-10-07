// Real installed OpenCode and real native tools; only transport replies are scripted.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {manifest} from '../support/manifest.mjs';
import {privateJSON,hashFile} from '../support/output-files.mjs';
import {prepare} from './prepare.mjs';
import {runPrepared} from './run.mjs';
import {report} from './report.mjs';
import {evaluatePatch} from './evaluate.mjs';
import {tasks,config,command,directory} from './suite.mjs';

function response(id,call,text='') {
  const item=call?{type:'function_call',id:'fc_'+id,call_id:'call_'+id,name:call.name,arguments:JSON.stringify(call.args),status:'completed'}:{type:'message',id:'msg_'+id,role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]};
  const base={id:'resp_'+id,object:'response',created_at:1,model:'gpt-5.6-luna',status:'in_progress',output:[]};
  const events=[{type:'response.created',response:base},{type:'response.output_item.added',output_index:0,item:call?{...item,arguments:'',status:'in_progress'}:{...item,content:[],status:'in_progress'}}];
  if(call)events.push({type:'response.function_call_arguments.delta',item_id:item.id,output_index:0,delta:item.arguments});
  else events.push({type:'response.content_part.added',item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:text},{type:'response.output_text.done',item_id:item.id,output_index:0,content_index:0,text});
  const completed={...base,status:'completed',output:[item],usage:{input_tokens:10,output_tokens:5,total_tokens:15,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}};
  events.push({type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:completed});
  return new Response(events.map((event,index)=>'event: '+event.type+'\ndata: '+JSON.stringify({...event,sequence_number:index})+'\n\n').join(''),{status:200,headers:{'content-type':'text/event-stream'}});
}
const userText=body=>{
  const message=body.input?.findLast(item=>item.role==='user');
  return typeof message?.content==='string'?message.content:(message?.content??[]).map(part=>part.text??'').join('\n');
};
const isTitle=body=>(body.input??[]).some(item=>['developer','system'].includes(item.role)&&(typeof item.content==='string'?item.content:JSON.stringify(item.content)).startsWith('You are a title generator.'));
const bash=command=>({name:'bash',args:{command,description:'Local scripted fixture public observation'}});
const read=filePath=>({name:'read',args:{filePath}});
const edit=(filePath,oldString,newString)=>({name:'edit',args:{filePath,oldString,newString}});
function nativeCall(call,tools) {
  if(!call||call.name!=='edit'||tools.some(t=>t.name==='edit'))return call;
  assert.ok(tools.some(t=>t.name==='apply_patch'),'The selected native model must advertise its actual mutation tool');
  const {filePath,oldString,newString}=call.args;
  return {name:'apply_patch',args:{patchText:'*** Begin Patch\n*** Update File: '+filePath+'\n@@\n'+oldString.trimEnd().split('\n').map(line=>'-'+line).join('\n')+'\n'+newString.trimEnd().split('\n').map(line=>'+'+line).join('\n')+'\n*** End Patch'}};
}

export async function installed({output,bundle,toolchain,executionImage,plain}) {
  const arms=plain?['P','H0','H1']:config.arms;
  const before=manifest(bundle),task=tasks[0];
  const f=prepare({output,model:'openai/gpt-5.6-luna',variant:'high',bundle,dependencies:plain,toolchain,executionImage,fixture:true,fixtureArms:arms});
  const counters=new Map(),inventories=[],frames=[];let requests=0;
  const baseline=Object.fromEntries(['validate','pricing','export'].map(name=>[name,fs.readFileSync(path.join(task.source,'src',name+'.mjs'),'utf8')]));
  const quantity="  if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new RangeError('quantity');\n";
  const wrong={
    validate:baseline.validate.replace(quantity,'').replace('  return {name:line.name, quantity:line.quantity, unitCents:line.unitCents};',"  if (line.discountPercent !== undefined && (!Number.isFinite(line.discountPercent) || line.discountPercent < 0 || line.discountPercent > 100)) throw new RangeError('discountPercent');\n  return {name:line.name, quantity:line.quantity, unitCents:line.unitCents,...(line.discountPercent === undefined ? {} : {discountPercent:line.discountPercent})};"),
    pricing:baseline.pricing.replace('totalCents:line.quantity*line.unitCents','totalCents:Math.round(line.quantity*line.unitCents*(1-(line.discountPercent ?? 0)/100))'),
    export:baseline.export.replace('({name,quantity,unitCents,totalCents})=>({name,quantity,unitCents,totalCents})','({name,quantity,unitCents,totalCents,...discount})=>({name,quantity,unitCents,totalCents,...discount})'),
  };
  const probe=`node -e 'const fs=require("fs"),assert=require("assert/strict"),cp=require("child_process");assert.equal(fs.existsSync("/judge"),false);for(const p of ["/input/acceptance.test.mjs","/input/gold.patch","/input/wrong.patch","/template/acceptance.test.mjs"])assert.equal(fs.existsSync(p),false);assert.equal(cp.execFileSync("git",["rev-list","--all","--count"],{encoding:"utf8"}).trim(),"1");console.log("PUBLIC_INPUT_ONLY");'`;
  const calls=[bash(probe),...['validate','pricing','export'].flatMap(name=>[read('src/'+name+'.mjs'),edit('src/'+name+'.mjs',baseline[name],wrong[name])]),bash('npm test'),bash('git diff --check')];
  let currentArm=arms[0],fixtureError=null;
  const fetchImpl=async(url,options)=>{
    try {
      assert.equal(url,'https://chatgpt.com/backend-api/codex/responses');
      const body=JSON.parse(options.body),text=userText(body),all=JSON.stringify(body);requests++;
      assert.equal(body.model,'gpt-5.6-luna');assert.equal(body.reasoning?.effort,'high');
      // Never send independent acceptance identities/results or reference artifacts.
      assert.doesNotMatch(all,/fd01\.(discount-roundtrip|discount-validation|legacy-shape-and-validation)|FEEDBACK_PRIVATE_SENTINEL/);
      if(isTitle(body)) {frames.push({stage:'title',model:body.model,effort:body.reasoning.effort});return response(requests,null,'Local fixture title');}
      const stage=currentArm==='P'?'plain':text.includes('Corrective pass')?'correction':text.includes('Implement the complete original task')?'author':'bootstrap';
      frames.push({stage,model:body.model,effort:body.reasoning.effort});
      const key=currentArm+':'+stage,n=counters.get(key)??0;counters.set(key,n+1);
      inventories.push({arm:currentArm,stage,index:n,tools:body.tools.map(t=>t.name).sort()});
      for(const forbidden of ['harness_sense','harness_investigate','harness_check'])assert.ok(!body.tools.some(t=>t.name===forbidden));
      if(stage==='bootstrap') {
        const call=n===0?{name:'harness_task',args:{}}:null;
        const result=response(requests,call,'Actual native result retained.');
        if(n===1)currentArm=arms[arms.indexOf(currentArm)+1];
        return result;
      }
      for(const tool of ['bash','read','glob','grep'])assert.ok(body.tools.some(t=>t.name===tool),tool);
      assert.ok(body.tools.some(t=>['edit','apply_patch'].includes(t.name)));
      if(stage==='author'||stage==='plain') {
        if(n>0)assert.doesNotMatch(JSON.stringify(body.input?.filter(item=>item.type==='function_call_output').at(-1)),/PermissionDenied|Tool execution aborted/);
        if(n>7)assert.match(all,/legacy invoice and empty collection|Missing expected exception/,'Actual public failure reaches the author');
        if(stage==='plain') {assert.ok(body.tools.some(t=>t.name==='task'),'Plain keeps its native task capability');assert.ok(!body.tools.some(t=>t.name==='harness_task'));}
        const reply=response(requests,nativeCall(calls[n],body.tools),'Implementation finished; public receipts record the failure.');
        if(stage==='plain'&&n>=calls.length)currentArm=arms[1];
        return reply;
      }
      assert.ok(['D','H1'].includes(currentArm),'Direct/Plain must never get an externally added corrective pass');
      assert.match(text,/legacy invoice and empty collection|Missing expected exception|not ok/,'D gets specific public feedback');
      const line="  if (typeof line.name !== 'string' || !line.name.trim()) throw new RangeError('name');\n";
      const corrections=[read('src/validate.mjs'),edit('src/validate.mjs',line,line+quantity),bash('npm test'),bash('git diff --check')];
      return response(requests,nativeCall(corrections[n],body.tools),'Public regression repaired; independent grading remains outside this session.');
    }catch(error){fixtureError=error;throw error;}
  };
  const outcome=await runPrepared(output,{scriptedFetch:fetchImpl,readAuth:()=>({access:'scripted-not-a-credential',accountId:'scripted-local'})});
  if(fixtureError)throw fixtureError;
  assert.equal(outcome.status,'finished',JSON.stringify(outcome));
  let unexpectedCalls=0;
  await assert.rejects(()=>runPrepared(output,{scriptedFetch:()=>{unexpectedCalls++;throw Error('No retry provider');},readAuth:()=>{unexpectedCalls++;throw Error('No retry auth');}}),/Previously created slot/);
  assert.equal(unexpectedCalls,0);
  // Continue after an interrupted evaluation, without rerunning either author.
  const directArm=plain?'H0':'direct',candidateArm=plain?'H1':'D';
  const directOut=path.join(output,'runs',task.id+'-'+directArm),candidateOut=path.join(output,'runs',task.id+'-'+candidateArm);
  await evaluatePatch({task,patch:fs.readFileSync(path.join(directOut,'model.patch')),output:path.join(directOut,'independent'),toolchain});
  const completedDirect=manifest(path.join(directOut,'independent'));
  fs.mkdirSync(path.join(candidateOut,'independent/session'),{recursive:true});
  fs.writeFileSync(path.join(candidateOut,'independent/interrupted-fixture.txt'),'Retain partial grading; allocate a new evaluation directory.');
  const result=await report(output),repeated=await report(output);
  assert.deepEqual(repeated,result,'Default report reentry must preserve meaningful results');
  assert.deepEqual(manifest(path.join(directOut,'independent')),completedDirect);
  assert.equal(fs.readFileSync(path.join(candidateOut,'independent/interrupted-fixture.txt'),'utf8'),'Retain partial grading; allocate a new evaluation directory.');
  assert.equal(fs.readdirSync(candidateOut).filter(n=>n.startsWith('independent-')).length,1);
  assert.equal(result.rows.length,arms.length);
  const direct=result.rows.find(r=>r.arm===directArm),candidate=result.rows.find(r=>r.arm===candidateArm);
  assert.equal(direct.delivery,true);assert.equal(direct.R,false);assert.equal(direct.Q,false);assert.equal(direct.corrections,0);
  assert.equal(candidate.delivery,true);assert.equal(candidate.R,true);assert.equal(candidate.Q,true);assert.equal(candidate.corrections,1);
  assert.equal(inventories.filter(r=>r.arm===directArm&&r.stage==='correction').length,0);
  assert.ok(inventories.some(r=>r.arm===candidateArm&&r.stage==='correction'));
  for(const stage of ['title','bootstrap','author','correction'])assert.ok(frames.some(f=>f.stage===stage),'Actual installed frame missing: '+stage);
  for(const inventory of inventories.filter(r=>!['bootstrap','plain'].includes(r.stage))) {
    assert.ok(!inventory.tools.includes('task')&&!inventory.tools.includes('harness_task'),'Native child prevents recursion');
    assert.deepEqual(inventory.tools,inventories.find(r=>r.stage==='author').tools);
  }
  assert.deepEqual(manifest(bundle),before);
  const boundaries=[];
  if(plain) {const row=result.rows.find(r=>r.arm==='P');assert.equal(row.delivery,true);assert.equal(row.R,false);assert.equal(row.Q,false);assert.equal(row.corrections,null);const capture=JSON.parse(fs.readFileSync(path.join(output,'runs',task.id+'-P/patch-capture.json')));assert.equal(capture.hasArtifacts,false);}
  for(const arm of arms) {
    const out=path.join(output,'runs',task.id+'-'+arm),container=JSON.parse(fs.readFileSync(path.join(out,'session/container.json'))),finished=JSON.parse(fs.readFileSync(path.join(out,'session/finished.json')));
    assert.ok(container.argv.includes('--network')&&container.argv.includes('none'));
    assert.ok(!container.argv.some(a=>a.includes('target=/judge')));
    if(arm==='P')assert.ok(container.argv.some(a=>a.includes('source='+plain+',target=/template,readonly')));
    const stop=JSON.parse(fs.readFileSync(path.join(out,'stop-verification.json')));
    assert.equal(finished.timing.deadlineAt,stop.timing.deadlineAt);
    assert.ok(finished.timing.budgetMs<=f.budgetMs&&finished.timing.budgetMs>0);
    boundaries.push({arm,container:container.name,deadline:finished.timing.deadlineAt,budgetMs:f.budgetMs,terminationVerified:finished.termination.terminationVerified});
  }
  const evidence={passed:true,modelFree:true,realProviderCalls:0,model:f.model,variant:f.variant,frames,reportRepeated:true,partialEvaluationResumed:true,preparationSha256:hashFile(path.join(directory,'frozen-manifest.json')).sha256,scriptedRequests:requests,syntheticUsage:true,bundleUnchanged:true,bundleManifest:before,...(plain?{plainManifest:manifest(plain),plainNativeToolsPreserved:true,plainWithoutHarnessArtifacts:true}:{}),configDifference:plain?'Plain without core/plugin; H0/H1 differ by HARNESS_TASK_STRATEGY':'HARNESS_TASK_STRATEGY only',runtimeVersion:config.runtimeVersion,binarySha256:hashFile(path.join(toolchain,'package/bin/opencode')).sha256,executionImage,rows:result.rows,boundaries,inventories};
  privateJSON(path.join(output,'installed.json'),evidence);console.log(JSON.stringify(evidence));return evidence;
}
export async function deadlineControls({output,bundle,toolchain,executionImage,plain}) {
  const controls=[];
  for(const arm of plain?['P','H0','H1']:config.arms) {
    const root=path.join(output,arm);
    const f=prepare({output:root,model:'openai/gpt-5.6-luna',variant:'high',bundle,dependencies:plain,toolchain,executionImage,fixture:true,fixtureArms:plain?['P','H0','H1']:undefined});
    // A separate stop fixture, not a development assignment or changed product budget.
    f.budgetMs=5000;f.attempts=[{...f.attempts[0],arm}];privateJSON(path.join(root,'freeze.json'),f);
    let requests=0,hangIssued=false;
    const outcome=await runPrepared(root,{readAuth:()=>({access:'scripted-not-a-credential',accountId:'scripted-local'}),scriptedFetch:async(_,options)=>{
      const body=JSON.parse(options.body),text=userText(body);requests++;
      assert.equal(body.model,'gpt-5.6-luna');assert.equal(body.reasoning?.effort,'high');
      if(isTitle(body))return response(requests,null,'Deadline fixture title');
      if(text.includes('Corrective pass'))throw Error('No corrective work after stop');
      if(arm==='P'||text.includes('Implement the complete original task')) {hangIssued=true;return response(requests,bash("node -e 'setInterval(()=>{},1000)'"));}
      return response(requests,{name:'harness_task',args:{}});
    }});
    const run=path.join(root,'runs',tasks[0].id+'-'+arm);
    // Preserve the primary stop evidence before a secondary missing-result error.
    if(!fs.existsSync(path.join(run,'result.json'))) {
      const finished=JSON.parse(fs.readFileSync(path.join(run,'session/finished.json')));
      throw Error('Deadline control stopped without result: '+JSON.stringify({outcome,termination:finished.termination,stopReason:finished.stopReason}));
    }
    const runtime=JSON.parse(fs.readFileSync(path.join(run,'result.json'))),stop=JSON.parse(fs.readFileSync(path.join(run,'stop-verification.json')));
    assert.equal(hangIssued,true);assert.equal(runtime.timedOut,true);assert.equal(runtime.nativeCompleted,false);
    assert.equal(stop.ownTaskDeadlineTriggered,true);assert.equal(stop.terminationVerified,true);assert.equal(stop.relayRemoved,true);assert.equal(stop.activeProviderHandlers,0);
    const final=await report(root);assert.equal(final.rows[0].delivery,false);assert.equal(final.rows[0].Q,false);
    controls.push({arm,hangIssued,requests,outcome,runtime,stop,row:final.rows[0]});
  }
  const evidence={passed:true,preparationSha256:hashFile(path.join(directory,'frozen-manifest.json')).sha256,fixtureBudgetMs:5000,developmentBudgetMs:config.budgetMs,realProviderCalls:0,executionImage,binarySha256:hashFile(path.join(toolchain,'package/bin/opencode')).sha256,bundleManifest:manifest(bundle),controls};privateJSON(path.join(output,'deadline-controls.json'),evidence);return evidence;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [output,bundle,toolchain]=process.argv.slice(2);
  if(![output,bundle,toolchain].every(p=>p&&path.isAbsolute(p)))throw Error('Usage: installed.mjs ABS_FRESH_OUTPUT ABS_BUNDLE ABS_TOOLCHAIN (EVALUATION_IMAGE required)');
  const plainAt=process.argv.indexOf('--plain');const plain=plainAt<0?undefined:process.argv[plainAt+1];if(plainAt>=0&&(!plain||!path.isAbsolute(plain)))throw Error('Absolute Plain assets required');
  const options={output,bundle,toolchain,plain,executionImage:process.env.EVALUATION_IMAGE};
  if(!process.argv.includes('--deadline-only'))await installed(options);
  await deadlineControls({...options,output:output+'-deadline'});
}
