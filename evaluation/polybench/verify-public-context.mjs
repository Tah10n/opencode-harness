import {verifyFrozenSchedule} from '../support/scheduler.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {contextAssignments,contextModes,contextVariants,contextTemplates,digest,verifyContextSchedule} from './public-context-campaign.mjs';
import {manifest} from '../support/manifest.mjs';
const {config,selection,slots}=contextAssignments();
const root=fs.mkdtempSync(path.join(os.tmpdir(),'public-context-cells-'));
try{
 const f={campaign:config.name,files:{},preflightPassed:true,experimentKind:'polybench',model:config.model,variant:config.effort,budgetMs:1800000,runtimeSha:config.product_sha,strategy:'direct',streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,armModes:contextModes,templates:contextTemplates(path.resolve(config.local_directory)),attempts:[],inputVariants:{},inputManifests:{},runtimeManifests:{},environments:{}};
 for(const r of selection.selected){
  const task=r.instance_id,a=path.join(root,task+'-original'),b=path.join(root,task+'-context');fs.mkdirSync(a);fs.mkdirSync(b);
  const original=Buffer.from('Original task\r\nEnvironment facts\r\n'),augmented=Buffer.concat([original,Buffer.from('\nPublic discussion fixture')]);
  for(const p of [a,b])fs.writeFileSync(p+'/source.js','unchanged source');fs.writeFileSync(a+'/TASK.md',original);fs.writeFileSync(b+'/TASK.md',augmented);
  f.inputVariants[task]={original:{source:a,taskSha256:digest(original)},'public-context-v2':{source:b,taskSha256:digest(augmented)}};
  for(const p of [a,b]){f.runtimeManifests[p]=manifest(p);f.environments[p]={image:'fixture-only',dependencyDirectories:[]};}
 }
 f.attempts=slots.map(s=>({slot:s.slot,task:s.instance_id,arm:s.arm,source:f.inputVariants[s.instance_id][contextVariants[s.arm]].source,preparationStatus:'ready'}));
 verifyContextSchedule(f);verifyFrozenSchedule(f,()=>{},async()=>{});
 const reject=change=>{const mutated=structuredClone(f);change(mutated);assert.throws(()=>verifyContextSchedule(mutated));assert.throws(()=>verifyFrozenSchedule(mutated,()=>{},async()=>{}));};
 reject(x=>x.attempts.reverse());reject(x=>x.attempts.pop());reject(x=>x.attempts[0].preparationStatus='preparation_error');
 reject(x=>x.armModes.P1='core');reject(x=>x.templates.P1=x.templates.C1);reject(x=>x.model='openai/substitute');
 reject(x=>x.attempts[0].source=x.attempts[1].source);
 const id=selection.selected[0].instance_id,source=f.inputVariants[id]['public-context-v2'].source;
 reject(x=>x.runtimeManifests[source]['source.js'].sha256='changed');reject(x=>x.environments[source]={image:'different'});
 fs.writeFileSync(source+'/TASK.md','edited original\nPublic discussion');
 reject(x=>x.inputVariants[id]['public-context-v2'].taskSha256=digest(fs.readFileSync(source+'/TASK.md')));
 console.log('PASS four-cell allocation, input-pair equality, source/environment invariance, model/product bounds and fail-closed mutations; provider requests: 0');
}finally{fs.rmSync(root,{recursive:true,force:true});}
