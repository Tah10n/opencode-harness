// Offline only, after all admitted runs. Applies each terminal patch to original
// public inputs. The behavioral evaluator receives a task and anonymous alias.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {startContainer} from '../native-task-ab/container-session.mjs';import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
const root=path.resolve(process.argv[2]),f=JSON.parse(fs.readFileSync(root+'/freeze.json')),outputs=root+'/grading';fs.mkdirSync(outputs,{recursive:true});
const git=(cwd,args)=>{const r=spawnSync('git',['-c','core.hooksPath=/dev/null',...args],{cwd,encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout;};
const publicCopy=(src,dst)=>fs.cpSync(src,dst,{recursive:true,verbatimSymlinks:true,filter:file=>!path.relative(src,file).split(path.sep).some(n=>['.git','node_modules'].includes(n))});
const deliveries=[];
for(const a of f.attempts){
 const run=root+'/runs/'+a.task+'-'+a.arm;if(!fs.existsSync(run+'/completed.json'))continue;
 let patch,artifacts=null;
 if(a.arm==='P'){
  const scratch=outputs+'/plain-capture';fs.mkdirSync(scratch);publicCopy(a.source,scratch);git(scratch,['init','-q']);git(scratch,['add','.']);git(scratch,['-c','user.name=Evaluator','-c','user.email=evaluator@localhost','commit','-qm','original']);
  for(const entry of fs.readdirSync(scratch))if(entry!=='.git')fs.rmSync(scratch+'/'+entry,{recursive:true,force:true});publicCopy(run+'/candidate',scratch);git(scratch,['add','-A']);patch=git(scratch,['diff','--cached','--binary','--full-index','HEAD']);fs.rmSync(scratch,{recursive:true});
 }else{const parent=run+'/candidate/.git/harness-task';const ids=fs.readdirSync(parent);assert.equal(ids.length,1);artifacts=parent+'/'+ids[0];patch=fs.existsSync(artifacts+'/terminal.patch')?fs.readFileSync(artifacts+'/terminal.patch','utf8'):'';}
 const alias=createHash('sha256').update(a.task+'\0'+patch).digest('hex').slice(0,12)+'-'+a.slot;deliveries.push({...a,run,patch,artifacts,alias});
}
for(const d of deliveries.sort((a,b)=>a.alias.localeCompare(b.alias))){
 const out=outputs+'/'+d.alias;fs.mkdirSync(out);fs.writeFileSync(out+'/terminal.patch',d.patch);
 let session;const checks=[];
 try{
  session=await startContainer({source:d.source,toolchain:f.toolchain,output:out+'/session',onRequest(){throw Error('No provider during grading');},workMemoryMb:1536,memoryMb:3072});
  const apply=session.exec(['node','-e',`const {spawnSync}=require('child_process');const patch=${JSON.stringify(d.patch)};if(!patch)process.exit(0);for(const args of [['apply','--check','-'],['apply','-']]){const r=spawnSync('git',args,{input:patch,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);}`]);checks.push({name:'patch-application',exit:apply.status,output:apply.stdout+apply.stderr});
  if(apply.status===0){
   for(const argv of [['npm','test'],...(d.task==='eventemitter-collect'?[['npm','run','test-esm']]:[])]){const r=session.exec(argv);checks.push({name:argv.join(' '),exit:r.status,output:r.stdout+r.stderr});}
   const setup=session.exec(['node','-e',`require('fs').writeFileSync('/work/evaluate.mjs',${JSON.stringify(fs.readFileSync('development/native-task-investigation/evaluate-behavior.mjs','utf8'))})`]);assert.equal(setup.status,0,setup.stderr);
   const behavior=session.exec(['node','/work/evaluate.mjs',d.task,'/work/repo']);checks.push({name:'independent-contract',exit:behavior.status,output:behavior.stdout+behavior.stderr});
   if(d.task==='eventemitter-collect'){
    const type="import EventEmitter from './index.js';const e=new EventEmitter<{data:[number]}>();const values:unknown[]=e.emitCollect('data',1);void values;\n// @ts-expect-error invalid event\ne.emitCollect('missing',1);\n// @ts-expect-error wrong argument\ne.emitCollect('data','wrong');\n// @ts-expect-error unknown results cannot be numbers\nconst numbers:number[]=e.emitCollect('data',1);\n";
    session.exec(['node','-e',`require('fs').writeFileSync('__rubric_types.ts',${JSON.stringify(type)})`]);const r=session.exec(['node','node_modules/typescript/bin/tsc','--strict','--noEmit','--skipLibCheck','--module','node16','--moduleResolution','node16','--target','es2022','__rubric_types.ts']);checks.push({name:'independent-types',exit:r.status,output:r.stdout+r.stderr});
   }
  }
  const termination=stopWorkload(session);assert.equal(termination.terminationVerified,true);
  fs.writeFileSync(out+'/checks.json',JSON.stringify({alias:d.alias,task:d.task,checks,termination,realProviderRequests:0},null,2));
  console.log(JSON.stringify({alias:d.alias,task:d.task,checks:checks.map(c=>({name:c.name,exit:c.exit}))}));
 }finally{if(session)assert.equal(session.close(),0);}
}
fs.writeFileSync(outputs+'/mapping.json',JSON.stringify(deliveries.map(({patch,...d})=>d),null,2));
