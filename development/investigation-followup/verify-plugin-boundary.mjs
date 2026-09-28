import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
// Use the locally materialized dependency-bearing plugin, no installation/network.
process.env.HARNESS_TASK_INVESTIGATION='1';process.env.HARNESS_TASK_STRATEGY='direct';process.env.HARNESS_TASK_TIMEOUT_MS='130000';
const {default:plugin}=await import(pathToFileURL(path.resolve('local/investigation-followup/installed/bundle/native-task-plugin.mjs')));
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'investigation-boundary-')));
const checks=[];
try{
 fs.writeFileSync(root+'/value.mjs','export const value=1;\n');fs.writeFileSync(root+'/TASK.md','Keep value one');process.env.HARNESS_TASK_FILE=root+'/TASK.md';
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};git('init','-q');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base');
 for(const mode of ['cancelled','sealed','expired-bootstrap']){
  let hooks,creates=0;const controller=new AbortController(),parent='parent-'+mode,id='author-'+mode;
  const client={app:{agents:async()=>({data:[{name:'build',permission:[{permission:'*',pattern:'*',action:'allow'}]}]})},session:{
   get:async()=>({data:{permission:[]}}),create:async()=>{creates++;return{data:{id}};},abort:async()=>({data:true}),messages:async()=>({data:[]}),
   prompt:async()=>{
    if(mode==='cancelled'){controller.abort();await assert.rejects(hooks.tool.harness_investigate.execute({action:'inspect',section:'patch',cursor:'0'},{sessionID:id}),/cancelled|budget/);checks.push('cancelled-inspect');}
    return{data:{info:{id:'message-'+mode,sessionID:id,finish:'stop'},parts:[{type:'text',text:'Local boundary fixture'}]}};
   }
  }};
  if(mode==='expired-bootstrap')process.env.HARNESS_TASK_DEADLINE_AT=String(Date.now()-1);else delete process.env.HARNESS_TASK_DEADLINE_AT;
  hooks=await plugin({client,directory:root});
  await hooks['command.execute.before']({command:'harness-task',arguments:'',sessionID:parent},{parts:[]});
  await hooks['chat.message']({sessionID:parent},{message:{model:{providerID:'local',modelID:'scripted'},agent:'build'}});
  const run=()=>hooks.tool.harness_task.execute({},{sessionID:parent,abort:controller.signal,ask:async()=>{},metadata:async()=>{}});
  try{
   if(mode==='expired-bootstrap'){await assert.rejects(run(),/budget/);assert.equal(creates,0);checks.push(mode);}
   else {await run();await assert.rejects(hooks.tool.harness_investigate.execute({action:'inspect',section:'patch'},{sessionID:id}),/enabled main author/);checks.push('sealed-inspect');}
  }finally{await hooks.event({event:{type:'command.executed',properties:{name:'harness-task',sessionID:parent}}});}
 }
 console.log(JSON.stringify({passed:true,checks,realProviderCalls:0}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
