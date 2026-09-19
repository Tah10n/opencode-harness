import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import plugin from '../lib/native-task-plugin.mjs';
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'preservation-hooks-'))),savedEnv={...process.env};
const modes=['parallel','cancel-in-hook','denial','off','second-workflow','combined'];
const receipts=[];
try {
Object.assign(process.env,{HARNESS_TASK_STRATEGY:'direct',HARNESS_TASK_CONTEXT:'0',HARNESS_TASK_CHECKS:'0',HARNESS_TASK_TYPE_COMPAT:'0',HARNESS_TASK_COMMAND_HINTS:'0',HARNESS_TASK_SENSITIVITY:'0',HARNESS_TASK_INVESTIGATION:'0'});
for(const [flag,strategy] of [['invalid','direct'],['1','D'],['1','check-first']]) {
 process.env.HARNESS_TASK_PRESERVATION_NUDGE=flag;process.env.HARNESS_TASK_STRATEGY=strategy;
 const hooks=await plugin({client:{},directory:temp});
 await assert.rejects(hooks['command.execute.before']({command:'harness-task',arguments:'',sessionID:flag+strategy}),/PRESERVATION|Preservation/);
}
for(const mode of modes) {
 const directory=temp+'/'+mode;fs.mkdirSync(directory);fs.mkdirSync(directory+'/test');
 const old='exports.value = n => n + 1;\n';fs.writeFileSync(directory+'/index.js',old);
 fs.writeFileSync(directory+'/test/old.test.js',"const test = require('node:test'), api = require('../index'); test('old',()=>{});\n");
 fs.writeFileSync(directory+'/package.json',JSON.stringify({scripts:{test:'node --test'}}));fs.writeFileSync(directory+'/TASK.md','Add new double behavior and preserve value.');
 const command=(bin,args,cwd=directory)=>{const r=spawnSync(bin,args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
 command('git',['init','-q']);command('git',['add','.']);command('git',['-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base']);
 Object.assign(process.env,{HARNESS_TASK_FILE:directory+'/TASK.md',HARNESS_TASK_STRATEGY:'direct',HARNESS_TASK_TIMEOUT_MS:'240000',HARNESS_TASK_PRESERVATION_NUDGE:mode==='off'?'0':'1',HARNESS_TASK_TYPE_COMPAT:mode==='combined'?'1':'0',HARNESS_TASK_COMMAND_HINTS:mode==='combined'?'1':'0'});
 let hooks,worktree,output;const controller=new AbortController(),child='child-'+mode,parent='parent-'+mode;
 const input=(callID,tool)=>({sessionID:child,callID,tool});
 const client={app:{agents:async()=>({data:[{name:'build',permission:[{permission:'*',pattern:'*',action:'allow'}]}]})},session:{
 get:async()=>({data:{permission:[]}}),create:async({query})=>{worktree=query.directory;return{data:{id:child}};},abort:async()=>({data:true}),messages:async()=>({data:[]}),
 prompt:async()=>{
  const editArgs={filePath:'index.js'};
  await hooks['tool.execute.before'](input('edit','edit'),{args:editArgs});fs.writeFileSync(worktree+'/index.js',old+'exports.double = n => n * 2;\n');fs.writeFileSync(worktree+'/test/feature.test.js',"const test = require('node:test'), assert = require('node:assert/strict'), api = require('../index'); test('feature',()=>assert.equal(api.double(2),4));\n");
  await hooks['tool.execute.after']({...input('edit','edit'),args:editArgs},{output:'edited',metadata:{}});
  const args={command:'node --test test/feature.test.js',workdir:'.'};
  await hooks['tool.execute.before'](input('check','bash'),{args});await hooks['shell.env']({...input('check','bash'),cwd:worktree},{env:{}});
  const raw=command(process.execPath,['--test','test/feature.test.js'],worktree);output={output:raw,metadata:{exit:0}};
  let admitted=false;
  const queued=hooks['tool.execute.before'](input('next','bash'),{args}).then(()=>{admitted=true;},e=>{assert.match(e.message,/cancel|budget|permission/i);});
  await Promise.resolve();assert.equal(admitted,false);
  if(mode==='denial')await hooks.event({event:{type:'permission.replied',properties:{sessionID:child,reply:'reject'}}});
  const write=fs.writeFileSync;
  try {
   if(mode==='cancel-in-hook')fs.writeFileSync=function(file,data,...rest){const result=write.call(this,file,data,...rest);if(String(file).endsWith('/preservation-nudge.json')&&JSON.parse(data).status==='eligible')controller.abort();return result;};
   await hooks['tool.execute.after']({...input('check','bash'),args},output);
  } finally {fs.writeFileSync=write;}
  await queued;
  if(admitted){await hooks['shell.env']({...input('next','bash'),cwd:worktree},{env:{}});const second={output:command(process.execPath,['--test','test/feature.test.js'],worktree),metadata:{exit:0}};await hooks['tool.execute.after']({...input('next','bash'),args},second);assert.ok(!second.output.includes('Preservation advisory:'));}
  assert.equal(output.output.includes('Preservation advisory:'),['parallel','second-workflow','combined'].includes(mode));
  return{data:{info:{finish:'stop'},parts:[{type:'text',text:'Fixture finished'}]}};
 }}};
 hooks=await plugin({client,directory});await hooks['command.execute.before']({command:'harness-task',arguments:'',sessionID:parent});
 try {
  await hooks['chat.message']({sessionID:parent},{message:{agent:'build',model:{providerID:'fixture',modelID:'fixture'}}});
  const result=JSON.parse(await hooks.tool.harness_task.execute({},{sessionID:parent,abort:controller.signal,ask:async()=>{},metadata:async()=>{}}));
  assert.equal(result.termination.verified,true);
  const raw=JSON.parse(fs.readFileSync(result.artifacts+'/tool-events.json'));assert.ok(!JSON.stringify(raw).includes('Preservation advisory:'));
  const file=result.artifacts+'/preservation-nudge.json';const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
  if(['cancel-in-hook','denial'].includes(mode))assert.equal(state.attachedBlocks,0);
  if(mode==='off')assert.equal(state,null);
  assert.ok(!fs.existsSync(result.artifacts+'/permission-continuations.json'));
  receipts.push({mode,status:result.status,attached:state?.attachedBlocks??0,queueReleased:true});
 } finally {await hooks.event({event:{type:'command.executed',properties:{name:'harness-task',sessionID:parent}}});}
}
} finally {for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key];Object.assign(process.env,savedEnv);fs.rmSync(temp,{recursive:true,force:true});}
console.log(JSON.stringify({passed:true,invalidConfigurations:3,receipts,realProviderCalls:0}));
