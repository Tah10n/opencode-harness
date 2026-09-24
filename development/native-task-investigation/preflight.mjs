import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {startContainer} from '../native-task-ab/container-session.mjs';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
import {runTask} from '../native-task-ab/native-run.mjs';

const root=path.resolve(process.argv[2]??'local/native-task-ab'),toolchain=path.resolve(process.argv[3]);
const config=JSON.parse(fs.readFileSync(path.join(root,'experiment-config.json')));
const sensitivity=process.env.PREFLIGHT_SENSITIVITY==='1';
const denqueReplay=process.env.PREFLIGHT_DENQUE_REPLAY==='1';
const attention=process.env.PREFLIGHT_ATTENTION==='1';
const investigation=process.env.PREFLIGHT_INVESTIGATION==='1';
const investigationMode=process.env.PREFLIGHT_INVESTIGATION_MODE??'accept';
const quickReplay=process.env.PREFLIGHT_QUICK_LRU==='1';
const replaySensitivity=process.env.PREFLIGHT_REPLAY_SENSITIVITY==='1';
const cancelSensitivity=process.env.PREFLIGHT_CANCEL_SENSITIVITY==='1';
if(cancelSensitivity&&!sensitivity)throw Error('Sensitivity cancellation requires sensitivity');
const runName=process.env.PREFLIGHT_DIRECTORY??'preflight';
const source=path.join(root,'scripted-input-'+runName);fs.mkdirSync(source);
for(const [name,text]of Object.entries({
 'TASK.md':'ORIGINAL_TASK_AB_FIXTURE: Change exported value 1 to 2; retain legacy() = 7; update the public regression and run node --test.',
 'value.mjs':'export const value = 1; export const legacy = () => 7;\n',
 'index.mjs':"export {value,legacy} from './value.mjs';\n",
 'consumer.test.mjs':"import {value,legacy} from './index.mjs';import test from 'node:test';import assert from 'node:assert/strict';test('consumer',()=>{assert.equal(value,1);assert.equal(legacy(),7)});\n",
 'package.json':JSON.stringify({private:true,scripts:{test:'node --test'}}),
 '.gitignore':'node_modules\n',
}))fs.writeFileSync(path.join(source,name),text);
if(sensitivity){
 fs.writeFileSync(path.join(source,'value.mjs'),'export const value = 1; export const legacy = () => { return 7; };\n');
 fs.writeFileSync(path.join(source,'consumer.test.mjs'),fs.readFileSync(path.join(source,'consumer.test.mjs'),'utf8').replace('assert.equal(legacy(),7)',''));
}
if(cancelSensitivity)fs.writeFileSync(path.join(source,'consumer.test.mjs'),"import fs from 'node:fs';fs.writeFileSync('sleeper.pid',String(process.pid));setInterval(()=>{},1000);\n");
if(denqueReplay||quickReplay){
 for(const name of fs.readdirSync(source))fs.unlinkSync(path.join(source,name));
 fs.cpSync(path.resolve(quickReplay?'local/native-sensitivity/targeted-20260914/inputs/case-b':'local/native-sensitivity/usage-20260914/inputs/case-1'),source,{recursive:true,verbatimSymlinks:true});
}
let seq=0;const results=[];
for(const arm of (attention?['R']:investigation?['H']:sensitivity?['H1']:process.env.PREFLIGHT_H00_ONLY==='1'?['P','H00']:['P','H00','H10','H01','H11'])){
 const enabled=arm!=='P',A=['H10','H11'].includes(arm),B=['H01','H11'].includes(arm),counts=new Map(),requests=[],failures=[];
 let session;
 try{
  session=await startContainer({source,toolchain,workMemoryMb:1536,memoryMb:3072,template:path.join(root,enabled?(process.env.PREFLIGHT_BUNDLE??'bundle'):(process.env.PREFLIGHT_PLAIN_BUNDLE??'plain-dependencies')),output:path.join(root,runName+'-'+arm),onRequest:async(frame,send)=>{
   try{
    const body=frame.body,inputs=body.input??[],last=inputs.filter(x=>x.role==='user').at(-1),content=typeof last?.content==='string'?last.content:last?.content?.map(p=>p.text??'').join('\n')??'';
    const stage=!body.tools?.length?'title':content.includes('Investigate this concrete behavior question')?'investigator':(content.includes('Implement the complete original task')||content.includes('Check completeness against the complete ORIGINAL TASK'))?'author':enabled?'bootstrap':'author';
    requests.push({stage,model:body.model,effort:body.reasoning?.effort});
    assert.equal(body.model,'gpt-5.6-luna');assert.equal(body.reasoning?.effort,'high');assert.equal(frame.path,'/v1/responses');
    const n=counts.get(stage)??0;counts.set(stage,n+1);if(stage==='author'&&n===0&&process.env.PREFLIGHT_DELAY_MS)await new Promise(resolve=>setTimeout(resolve,Number(process.env.PREFLIGHT_DELAY_MS)));let call=null;
    if(stage==='bootstrap'&&n===0)call={name:'harness_task',args:{}};
    if(stage==='investigator') {
     assert.ok(content.includes(fs.readFileSync(path.join(source,'TASK.md'),'utf8')));
     const regression = "import {test} from 'node:test';import assert from 'node:assert/strict';import {legacy} from './index.mjs';test('public legacy contract',()=>assert.equal(legacy(),"+(investigationMode==='unjustified'?'8':'7')+"));";
     const calls=[{name:'read',args:{filePath:'index.mjs'}},{name:'apply_patch',args:{patchText:'*** Begin Patch\n*** Add File: legacy.test.mjs\n+'+regression+'\n*** End Patch'}},{name:'bash',args:{command:'npm test',workdir:'.',description:'Project regression check'}},...(sensitivity?[{name:'harness_sense',args:{path:'value.mjs',check:'npm test'}}]:[])];
     if(investigationMode==='allowed') calls.splice(1,1);
     if(investigationMode==='cancel') calls.splice(1,calls.length,{name:'apply_patch',args:{patchText:'*** Begin Patch\n*** Add File: sleeper.test.mjs\n+import fs from \'node:fs\';fs.writeFileSync(\'sleeper.pid\',String(process.pid));setInterval(()=>{},1000);\n*** End Patch'}},{name:'harness_sense',args:{path:'value.mjs',check:'npm test'}});
     if(investigationMode==='recursive') calls.splice(1,calls.length,{name:'harness_investigate',args:{action:'investigate',question:'Another child',location:'value.mjs',reason:'forbidden recursion'}});
     if(investigationMode==='production') calls.splice(1,calls.length,{name:'apply_patch',args:{patchText:'*** Begin Patch\n*** Update File: value.mjs\n@@\n-export const value = 2; export const legacy = () => { return 7; };\n+export const value = 2; export const legacy = () => { return 8; };\n*** End Patch'}});
     call=calls[n]??null;
    }
    if(stage==='author'){
     if(!investigation)assert.ok(!body.tools.some(t=>t.name==='harness_investigate'));
     const all=JSON.stringify(inputs);assert.ok(all.includes(JSON.stringify(fs.readFileSync(path.join(source,'TASK.md'),'utf8')).slice(1,-1)),'Complete original task must reach author unchanged');fs.writeFileSync(path.join(root,runName+'-'+arm,'request-'+seq+'.json'),JSON.stringify(body),{mode:0o600});const toolOutputs=inputs.filter(x=>x.type==='function_call_output').map(x=>x.output).join('\n');
     const read=filePath=>({name:'read',args:{filePath}}),edit=(filePath,oldString,newString)=>{
       const before=fs.readFileSync(path.join(source,filePath),'utf8').trimEnd(),after=before.replace(oldString,newString);
       return {name:'apply_patch',args:{patchText:'*** Begin Patch\n*** Update File: '+filePath+'\n@@\n-'+before+'\n+'+after+'\n*** End Patch'}};
     };
     const check={name:'bash',args:{command:B?'harness-check value.mjs':'npm run test',workdir:'.',description:'Real early project check'}};
     const calls=(denqueReplay||quickReplay)?[]:[read('value.mjs'),edit('value.mjs','value = 1','value = 2'),check,read('consumer.test.mjs'),edit('consumer.test.mjs','value,1','value,2'),check,read('value.mjs'),{name:'bash',args:{command:'node --test',workdir:'.',description:'Final ordinary native check'}}];
     if(investigation) {
      assert.ok(body.tools.some(t=>t.name==='harness_investigate'),'Installed author must receive native investigation schema');
      const investigate={name:'harness_investigate',args:{action:'investigate',question:'Does the existing exported legacy API still return 7 through the public module after the value change? Add a justified public regression if needed.',location:'index.mjs and value.mjs',reason:'The original task explicitly preserves legacy() = 7.'}};
      const disposition={name:'harness_investigate',args:{action:investigationMode==='unjustified'?'decline':'accept',rationale:investigationMode==='unjustified'?'The original contract says 7; an expectation of 8 is unjustified.':'The original task explicitly preserves legacy() = 7 and the new test imports the public entry point.'}};
      calls.splice(6,2,...(sensitivity?[{name:'harness_sense',args:{path:'value.mjs',check:'npm test'}}]:[]),investigate,disposition,check);
      if(investigationMode==='unused') calls.splice(6,sensitivity?3:2);
      if(n===(sensitivity?8:7)&&!['unused','production','recursive','cancel'].includes(investigationMode))assert.ok(toolOutputs.includes('remainingDiagnosticMs'));
      if(n===(sensitivity?9:8)&&investigationMode==='accept')assert.ok(toolOutputs.includes('"accepted":true'));
     }else if(quickReplay){
      assert.ok(body.tools.some(t=>t.name==='harness_sense'));
      const reports=inputs.filter(x=>x.type==='function_call_output').flatMap(x=>{const text=String(x.output),start=text.indexOf('{"kind":"sensitivity"');return start<0?[]:[JSON.parse(text.slice(start).split('\nSensitivity state:')[0])];});
      const selected=reports.flatMap(r=>r.variants).find(m=>m.status==='passed'&&m.original==='this.#deleteIfExpired(key, item) === false'&&m.replacement==='this.#deleteIfExpired(key, item) !== false');
      const regression = "test('computed retains unexpired undefined hit', t => {\n\tconst cache = new QuickLRU({maxSize: 4});\n\tcache.set('key', undefined);\n\tlet calls = 0;\n\tt.true(cache.has('key'));\n\tconst result = cache.getOrInsertComputed('key', () => {\n\t\tcalls++;\n\t\treturn 'computed';\n\t});\n\tt.is(result, undefined);\n\tt.is(calls, 0);\n});\n";
      const before = "test('.get() / .set()', t => {";
      calls.push(check,{name:'harness_sense',args:{path:'index.js',check:'npm test'}}, {name:'apply_patch',args:{patchText:'*** Begin Patch\n*** Update File: test.js\n@@\n+'+regression.split('\n').join('\n+')+'\n '+before+'\n*** End Patch'}}, check, {name:'harness_sense',args:selected?.replay??{}},check);
      if(n===2){assert.equal(reports[0].baseline.status,'passed');assert.ok(selected?.ref);}
      if(n===5){const r=reports.at(-1);assert.equal(r.baseline.status,'passed');assert.equal(r.variants[0].status,'command-rejected');assert.match(r.variants[0].output,/computed retains|computed|undefined/);}
     }else if(denqueReplay){
      const reports=inputs.filter(x=>x.type==='function_call_output').flatMap(x=>{const text=String(x.output),start=text.indexOf('{"kind":"sensitivity"');return start<0?[]:[JSON.parse(text.slice(start).split('\nSensitivity state:')[0])];});
      const selected=reports.flatMap(r=>r.variants).find(m=>m.mutatorName==='BooleanLiteral'&&m.original==='false'&&m.replacement==='true');
      const regression="var assert = require('assert'); var Denque = require('../');\ndescribe('empty removeWhere contract', function () { it('visits no absent values', function () { var calls = 0; var removed = new Denque().removeWhere(function () { calls++; return false; }); assert.strictEqual(calls, 0, 'empty queue must not call predicate'); assert.strictEqual(removed, 0); }); });\n";
      calls.splice(0,calls.length,check,{name:'harness_sense',args:{path:'index.js',check:'npm test'}},{name:'apply_patch',args:{patchText:'*** Begin Patch\n*** Add File: test/empty.js\n'+regression.trimEnd().split('\n').map(x=>'+'+x).join('\n')+'\n*** End Patch'}},check,{name:'harness_sense',args:selected?.replay??{}},check);
      if(n===2){assert.equal(selected?.status,'passed');assert.ok(selected.ref);}
      if(n===5){const r=reports.at(-1);assert.equal(r.baseline.status,'passed');assert.equal(r.variants.length,1);assert.equal(r.cost.commands,2);assert.equal(r.variants[0].ref,selected.ref);assert.equal(r.variants[0].status,'command-rejected');assert.match(r.variants[0].output,/empty queue must not call predicate/);}
     }else if(cancelSensitivity){calls.splice(0,calls.length,edit('value.mjs','value = 1','value = 2'),{name:'harness_sense',args:{path:'value.mjs'}});if(n>1)throw Error('Cancellation did not interrupt sleeping diagnostic');}
     else if(sensitivity){
      assert.ok(body.tools.some(t=>t.name==='harness_sense'&&t.parameters?.properties?.check),'Native sensitivity schema must reach the author');
      const sense={name:'harness_sense',args:{path:'value.mjs'}};
      const strengthened=fs.readFileSync(path.join(source,'consumer.test.mjs'),'utf8').trimEnd().replace('value,1','value,2').replace('assert.equal(value,2);','assert.equal(value,2);assert.equal(legacy(),7);');
      const weak=strengthened.replace('assert.equal(legacy(),7);','');
      const reports=inputs.filter(x=>x.type==='function_call_output').flatMap(x=>{const text=String(x.output),start=text.indexOf('{"kind":"sensitivity"');return start<0?[]:[JSON.parse(text.slice(start).split('\nSensitivity state:')[0])];});
      const selected=reports.flatMap(r=>r.variants).find(m=>m.status==='passed'&&m.replacement==='{}');
      const replay=replaySensitivity?{name:'harness_sense',args:selected?.replay??{}}:sense;
      calls.splice(6,2,sense,{name:'apply_patch',args:{patchText:'*** Begin Patch\n*** Update File: consumer.test.mjs\n@@\n-'+weak+'\n+'+strengthened+'\n*** End Patch'}},check,replay,{name:'bash',args:{command:'node --test',workdir:'.',description:'Final ordinary native check'}});
      if(n===7)assert.ok(toolOutputs.includes('Tests still pass.'),'Real survivor reached same native author');
      if(n===10){assert.ok(toolOutputs.includes('Variant rejected by command; cause requires inspection'),'Fresh stronger regression result reached author');if(replaySensitivity){const r=reports.at(-1);assert.equal(r.engineExecuted,false);assert.equal(r.cost.commands,2);assert.equal(r.variants.length,1);assert.equal(r.variants[0].ref,selected.ref);assert.match(r.variants[0].output,/AssertionError|ERR_ASSERTION/);}}
     }
     if(!denqueReplay&&!quickReplay&&!cancelSensitivity&&n===1){assert.equal(toolOutputs.includes('Computed code context A'),A);if(A){assert.ok(toolOutputs.includes('6.0.3'));assert.ok(toolOutputs.includes('consumer.test.mjs'));}}
     if(!denqueReplay&&!quickReplay&&!cancelSensitivity&&n===3){assert.ok(toolOutputs.includes('ERR_ASSERTION')||toolOutputs.includes('AssertionError'));assert.equal(toolOutputs.includes('Project check B'),B);}
     if(n===6&&B)assert.ok(toolOutputs.includes('"status":"passed"'));
     if(!enabled)assert.ok(!all.includes('Code context A is enabled')&&!all.includes('Project checks B is enabled'));
     call=calls[n]??null;
    }
    const id='resp_fixture_'+(++seq),item=call?{id:'fc_'+seq,type:'function_call',call_id:'call_'+seq,name:call.name,arguments:JSON.stringify(call.args),status:'completed'}:{id:'msg_'+seq,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Scripted execution ended; actual command evidence retained.',annotations:[]}]};
    const base={id,object:'response',created_at:1,model:body.model,status:'in_progress',output:[]};const events=[{type:'response.created',response:base},{type:'response.output_item.added',output_index:0,item:call?{...item,arguments:'',status:'in_progress'}:{...item,status:'in_progress',content:[]}}];
    if(call)events.push({type:'response.function_call_arguments.delta',item_id:item.id,output_index:0,delta:item.arguments});else events.push({type:'response.content_part.added',item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:item.content[0].text});
    events.push({type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{...base,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}});
    send({type:'headers',status:200,contentType:'text/event-stream'});send({type:'chunk',data:Buffer.from(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')).toString('base64')});send({type:'end'});
   }catch(error){failures.push(error.message);send({type:'headers',status:403,contentType:'text/plain'});send({type:'end'});}
  }});
  if(denqueReplay||quickReplay){const seed=fs.readFileSync(quickReplay?'development/native-task-sensitivity/targeted-20260914/inputs/case-b/input.patch':'development/native-task-h00-transfer/continuation-20260914/patches/27-denque-remove-where-r2-P.patch','utf8');const applied=session.exec(['node','-e',`const r=require('child_process').spawnSync('git',['apply','-'],{input:${JSON.stringify(seed)},encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);`]);assert.equal(applied.status,0,applied.stderr);}
  const setup=session.exec(['node','-e',"const fs=require('fs');fs.mkdirSync('/work/bin');fs.copyFileSync('/template/rg','/work/bin/rg');fs.chmodSync('/work/bin/rg',0o755);fs.mkdirSync('/work/config/opencode',{recursive:true});for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync('/template/'+n,'/work/config/opencode/'+n,{recursive:true,verbatimSymlinks:true});"]);assert.equal(setup.status,0,setup.stderr);
  assert.equal(session.exec(['/opt/opencode','--version']).stdout.trim(),'1.18.26');
  if(process.env.PREFLIGHT_H00_ONLY==='1')session.setTaskBudget(900000);
  const controller=new AbortController();let monitor,sleeper;
  if(cancelSensitivity||investigationMode==='cancel')monitor=setInterval(()=>{
    const found=session.exec(['node','-e',"const fs=require('fs');for(const n of fs.readdirSync('/work/tmp').filter(n=>n.startsWith('harness-sense-'))){const root='/work/tmp/'+n;const p=fs.readdirSync(root,{recursive:true}).find(p=>p.endsWith('/sleeper.pid'));if(p){console.log(fs.readFileSync(root+'/'+p,'utf8'));break;}}"]);
    if(found.status===0&&/^\d+$/.test(found.stdout.trim())){sleeper=Number(found.stdout.trim());clearInterval(monitor);controller.abort();}
  },100);
  let result;
  try{result=await runTask(session,{config,task:fs.readFileSync(path.join(source,'TASK.md'),'utf8'),enabled,arm,model:'openai/gpt-5.6-luna',variant:'high',limitMs:cancelSensitivity?20000:900000,signal:controller.signal,stopWorkload});}
  finally{clearInterval(monitor);}
  assert.deepEqual(failures,[]);assert.equal(result.termination.terminationVerified,true);
  if(cancelSensitivity||investigationMode==='cancel'){
    assert.ok(sleeper>1,'A real diagnostic baseline must start before cancellation');assert.equal(result.stopReason.kind,'cancelled');
    const gone=session.exec(['node','-e',`try{process.kill(${sleeper},0);throw Error('Diagnostic child remains');}catch(e){if(e.code!=='ESRCH')throw e;}`]);assert.equal(gone.status,0,gone.stderr);
    results.push({arm,...result,requests,sleeper,diagnosticChildTerminated:true,realProviderRequests:0});continue;
  }
  if(investigation&&['production','recursive'].includes(investigationMode)) {
    // Completion may be normal after a safe pre-execution rejection; bytes and sessions are authoritative.
    const e=session.exec(['node','-e',"const fs=require('fs'),p='/work/repo/.git/harness-task',a=p+'/'+fs.readdirSync(p)[0];const patch=fs.readFileSync(a+'/terminal.patch','utf8');if(!patch.includes('value = 2')||patch.includes('return 8'))throw Error('Author work lost or production violation accepted');const events=JSON.parse(fs.readFileSync(a+'/investigation-tool-events.json'));if(!events.some(e=>e.state==='error'||e.tool==='invalid'))throw Error('Missing rejected investigator operation');console.log(JSON.stringify({patch,result:JSON.parse(fs.readFileSync(a+'/result.json'))}));"]);assert.equal(e.status,0,e.stderr);fs.writeFileSync(path.join(root,runName+'-rejection.json'),e.stdout);
    results.push({arm,...result,requests,rejected:investigationMode,authorPatchPreserved:true,realProviderRequests:0});continue;
  }
  assert.equal(result.nativeCompleted,true,JSON.stringify(result));
  if(sensitivity&&!investigation){
    const evidence=session.exec(['node','-e',"const fs=require('fs'),assert=require('assert/strict'),{spawnSync}=require('child_process');const root='/work/repo/.git/harness-task',artifacts=root+'/'+fs.readdirSync(root)[0];const events=JSON.parse(fs.readFileSync(artifacts+'/sensitivity-events.json'));assert.equal(events.length,2);for(const e of events){const r=JSON.parse(e.output);assert.equal(r.baseline.status,'passed');assert.equal(r.engineExecuted,!r.selectedVariant);assert.ok(r.variants.length);assert.equal(r.terminationVerified,true);}const patch=fs.readFileSync(artifacts+'/terminal.patch','utf8');assert.ok(!/native-sensitivity|harness-sense-|stryker/.test(patch));fs.cpSync('/input','/work/patch-check',{recursive:true,verbatimSymlinks:true});for(const args of [['apply','--check','-'],['apply','-']]){const r=spawnSync('git',args,{cwd:'/work/patch-check',input:patch,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}const test=spawnSync('npm',['test'],{cwd:'/work/patch-check',encoding:'utf8'});assert.equal(test.status,0,test.stdout+test.stderr);console.log(JSON.stringify({events,patch,ordinaryPatchPassed:true}));"]);
    assert.equal(evidence.status,0,evidence.stderr);fs.writeFileSync(path.join(root,runName+'-evidence.json'),evidence.stdout);
  }
  if(investigation){const e=session.exec(['node','-e',"const fs=require('fs'),p='/work/repo/.git/harness-task',a=p+'/'+fs.readdirSync(p)[0];console.log(JSON.stringify({result:fs.existsSync(a+'/investigation-result.json')?JSON.parse(fs.readFileSync(a+'/investigation-result.json')):null,diagnostics:fs.existsSync(a+'/sensitivity-events.json')?JSON.parse(fs.readFileSync(a+'/sensitivity-events.json')):[],patch:fs.readFileSync(a+'/terminal.patch','utf8')}));"]);assert.equal(e.status,0,e.stderr);const evidence=JSON.parse(e.stdout);
    if(investigationMode==='unused')assert.equal(evidence.result,null);
    else {assert.equal(evidence.result.disposition,investigationMode==='unjustified'?'declined':'accepted');assert.equal(evidence.result.usable,true);}
    if(investigationMode==='accept'){assert.match(evidence.patch,/legacy.test.mjs/);const authorMs=evidence.diagnostics.reduce((n,e)=>n+e.elapsedMs,0),childMs=evidence.result.commands.filter(e=>e.sensitivity).reduce((n,e)=>n+e.sensitivity.elapsedMs,0);if(sensitivity)assert.ok(authorMs>0&&childMs>0);else assert.equal(authorMs+childMs,0);assert.equal(evidence.result.remainingDiagnosticMs,180000-authorMs-childMs);}
    else assert.doesNotMatch(evidence.patch,/legacy.test.mjs/);
    fs.writeFileSync(path.join(root,runName+'-investigation.json'),e.stdout);
    const applied=session.exec(['node','-e',`const fs=require('fs'),{spawnSync}=require('child_process');fs.cpSync('/input','/work/ordinary',{recursive:true,verbatimSymlinks:true});for(const args of [['apply','--check','-'],['apply','-']]){const r=spawnSync('git',args,{cwd:'/work/ordinary',input:${JSON.stringify(evidence.patch)},encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);}const r=spawnSync('npm',['test'],{cwd:'/work/ordinary',encoding:'utf8'});if(r.status!==0)throw Error(r.stdout+r.stderr);`]);assert.equal(applied.status,0,applied.stderr);}
  const check=(denqueReplay||quickReplay)?session.exec(['node','-e',"const fs=require('fs'),assert=require('assert/strict');const root='/work/repo/.git/harness-task',a=root+'/'+fs.readdirSync(root)[0],r=JSON.parse(fs.readFileSync(a+'/result.json'));assert.equal(r.termination.verified,true);assert.equal(r.repairs,0);assert.ok(fs.existsSync(a+'/terminal.patch'));console.log(JSON.stringify({verified:true,knownOfflineCounterexample:true,artifacts:a}));"]):session.exec(['node','-e',`const fs=require('fs'),assert=require('assert/strict');let dir='/work/repo',artifacts;if(${enabled}){artifacts=dir+'/.git/harness-task/'+fs.readdirSync(dir+'/.git/harness-task')[0];const r=JSON.parse(fs.readFileSync(artifacts+'/result.json'));assert.equal(r.termination.verified,true);assert.equal(r.repairs,0);dir=artifacts+'/worktree';assert.equal(fs.existsSync(artifacts+'/component-context.json'),${A});assert.equal(fs.existsSync(artifacts+'/component-checks.json'),${B});assert.ok(fs.readFileSync('/work/repo/value.mjs','utf8').includes('value = 1'));}assert.ok(fs.readFileSync(dir+'/value.mjs','utf8').includes('value = 2'));assert.ok(fs.readFileSync(dir+'/consumer.test.mjs','utf8').includes('value,2'));console.log(JSON.stringify({verified:true,artifacts:artifacts??null}));`]);assert.equal(check.status,0,check.stderr);
  results.push({arm,...result,requests,verified:JSON.parse(check.stdout),realProviderRequests:0});console.log(JSON.stringify({arm,nativeCompleted:result.nativeCompleted,requests:requests.length,realProviderRequests:0}));
 }finally{if(session)assert.equal(session.close(),0);}
}
const final={passed:true,opencode:'1.18.26',model:'openai/gpt-5.6-luna',variant:'high',realProviderRequests:0,results};
fs.writeFileSync(path.join(root,runName+'-result.json'),JSON.stringify(final,null,2)+'\n');
fs.writeFileSync(path.join(root,cancelSensitivity?'installed-preflight-cancel.json':'installed-preflight.json'),JSON.stringify(final,null,2)+'\n');
