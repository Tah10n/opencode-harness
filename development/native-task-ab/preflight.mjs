import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {startContainer} from './container-session.mjs';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
import {runTask} from './native-run.mjs';

const root=path.resolve(process.argv[2]??'local/native-task-ab'),toolchain=path.resolve(process.argv[3]);
const config=JSON.parse(fs.readFileSync(path.join(root,'experiment-config.json')));
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
let seq=0;const results=[];
for(const arm of ['P','H00','H10','H01','H11']){
 const enabled=arm!=='P',A=['H10','H11'].includes(arm),B=['H01','H11'].includes(arm),counts=new Map(),requests=[],failures=[];
 let session;
 try{
  session=await startContainer({source,toolchain,template:path.join(root,enabled?'bundle':'plain-dependencies'),output:path.join(root,runName+'-'+arm),onRequest:async(frame,send)=>{
   try{
    const body=frame.body,inputs=body.input??[],last=inputs.filter(x=>x.role==='user').at(-1),content=typeof last?.content==='string'?last.content:last?.content?.map(p=>p.text??'').join('\n')??'';
    const stage=!body.tools?.length?'title':content.includes('Implement the complete original task')?'author':enabled?'bootstrap':'author';
    requests.push({stage,model:body.model,effort:body.reasoning?.effort});
    assert.equal(body.model,'gpt-5.6-luna');assert.equal(body.reasoning?.effort,'high');assert.equal(frame.path,'/v1/responses');
    const n=counts.get(stage)??0;counts.set(stage,n+1);let call=null;
    if(stage==='bootstrap'&&n===0)call={name:'harness_task',args:{}};
    if(stage==='author'){
     const all=JSON.stringify(inputs),toolOutputs=inputs.filter(x=>x.type==='function_call_output').map(x=>x.output).join('\n');
     const read=filePath=>({name:'read',args:{filePath}}),edit=(filePath,oldString,newString)=>{
       const before=fs.readFileSync(path.join(source,filePath),'utf8').trimEnd(),after=before.replace(oldString,newString);
       return {name:'apply_patch',args:{patchText:'*** Begin Patch\n*** Update File: '+filePath+'\n@@\n-'+before+'\n+'+after+'\n*** End Patch'}};
     };
     const check={name:'bash',args:{command:B?'harness-check value.mjs':'npm run test',workdir:'.',description:'Real early project check'}};
     const calls=[read('value.mjs'),edit('value.mjs','value = 1','value = 2'),check,read('consumer.test.mjs'),edit('consumer.test.mjs','value,1','value,2'),check,read('value.mjs'),{name:'bash',args:{command:'node --test',workdir:'.',description:'Final ordinary native check'}}];
     if(n===1){assert.equal(toolOutputs.includes('Computed code context A'),A);if(A){assert.ok(toolOutputs.includes('6.0.3'));assert.ok(toolOutputs.includes('consumer.test.mjs'));}}
     if(n===3){assert.ok(toolOutputs.includes('ERR_ASSERTION')||toolOutputs.includes('AssertionError'));assert.equal(toolOutputs.includes('Project check B'),B);}
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
  const setup=session.exec(['node','-e',"const fs=require('fs');fs.mkdirSync('/work/bin');fs.copyFileSync('/template/rg','/work/bin/rg');fs.chmodSync('/work/bin/rg',0o755);fs.mkdirSync('/work/config/opencode',{recursive:true});for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync('/template/'+n,'/work/config/opencode/'+n,{recursive:true,verbatimSymlinks:true});"]);assert.equal(setup.status,0,setup.stderr);
  assert.equal(session.exec(['/opt/opencode','--version']).stdout.trim(),'1.18.26');
  const result=await runTask(session,{config,task:fs.readFileSync(path.join(source,'TASK.md'),'utf8'),enabled,arm,model:'openai/gpt-5.6-luna',variant:'high',limitMs:900000,stopWorkload});
  assert.deepEqual(failures,[]);assert.equal(result.nativeCompleted,true,JSON.stringify(result));assert.equal(result.termination.terminationVerified,true);
  const check=session.exec(['node','-e',`const fs=require('fs'),assert=require('assert/strict');let dir='/work/repo',artifacts;if(${enabled}){artifacts=dir+'/.git/harness-task/'+fs.readdirSync(dir+'/.git/harness-task')[0];const r=JSON.parse(fs.readFileSync(artifacts+'/result.json'));assert.equal(r.termination.verified,true);assert.equal(r.repairs,0);dir=artifacts+'/worktree';assert.equal(fs.existsSync(artifacts+'/component-context.json'),${A});assert.equal(fs.existsSync(artifacts+'/component-checks.json'),${B});assert.ok(fs.readFileSync('/work/repo/value.mjs','utf8').includes('value = 1'));}assert.ok(fs.readFileSync(dir+'/value.mjs','utf8').includes('value = 2'));assert.ok(fs.readFileSync(dir+'/consumer.test.mjs','utf8').includes('value,2'));console.log(JSON.stringify({verified:true,artifacts:artifacts??null}));`]);assert.equal(check.status,0,check.stderr);
  results.push({arm,...result,requests,verified:JSON.parse(check.stdout),realProviderRequests:0});console.log(JSON.stringify({arm,nativeCompleted:result.nativeCompleted,requests:requests.length,realProviderRequests:0}));
 }finally{if(session)assert.equal(session.close(),0);}
}
fs.writeFileSync(path.join(root,'installed-preflight.json'),JSON.stringify({passed:true,opencode:'1.18.26',model:'openai/gpt-5.6-luna',variant:'high',realProviderRequests:0,results},null,2)+'\n');
