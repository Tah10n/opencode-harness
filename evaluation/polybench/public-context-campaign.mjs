// Four explicit input cells within the existing PolyBench adapter.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const contextCampaign=name=>name==='public-context-development-v1';
export const contextModes={P0:'plain',P1:'plain',C0:'core',C1:'core'};
export const contextVariants={P0:'original',P1:'public-context-v2',C0:'original',C1:'public-context-v2'};
export const contextOrders=[['P0','P1','C0','C1'],['P1','C0','C1','P0'],['C0','C1','P0','P1'],['C1','P0','P1','C0']];
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const contextTemplates=local=>Object.fromEntries(Object.entries(contextModes).map(([arm,mode])=>[arm,path.join(local,mode==='plain'?'plain-dependencies':'core-bundle')]));
export function contextAssignments(directory=path.resolve('evaluation/polybench/campaigns/public-context-development-v1')){
 const config=JSON.parse(fs.readFileSync(path.join(directory,'campaign.json'))),selection=JSON.parse(fs.readFileSync(path.join(directory,'selection.json')));
 assert.equal(config.name,'public-context-development-v1');assert.equal(config.product_sha,'ffbf979b4fdae958b71796e22e6b7a81a0edce50');
 assert.equal(config.local_directory,'local/public-context-development-v1');
 assert.deepEqual(config.arms,Object.keys(contextModes));assert.deepEqual(config.arm_modes,contextModes);assert.deepEqual(config.input_variants,contextVariants);assert.deepEqual(config.orders,contextOrders);
 assert.equal(config.model,'openai/gpt-6-luna');assert.equal(config.effort,'high');assert.equal(config.opencode,'1.18.26');assert.equal(config.task_budget_seconds,1800);assert.equal(config.repeats,1);assert.equal(config.concurrency,1);
 assert.equal(selection.configuration_sha256,digest(fs.readFileSync(path.join(directory,'campaign.json'))));
 assert.equal(selection.selected.length,4);assert.equal(new Set(selection.selected.map(r=>r.instance_id)).size,4);
 assert.equal(selection.dataset_revision,'b3fca77b637379f0c01ad86d18753a7ac1998b53');assert.equal(selection.dataset_sha256,'0c8138e73c34fa29a5276b675b146b72d78ce001fcc4560d76302c908b4808a5');
 const repos=new Map();for(const r of selection.selected){assert.ok(!config.excluded_instance_ids.includes(r.instance_id));repos.set(r.repo,(repos.get(r.repo)??0)+1);}
 assert.ok(repos.size>=2&&[...repos.values()].every(n=>n<=2));
 const slots=selection.selected.flatMap((r,i)=>contextOrders[i].map((arm,j)=>({slot:4*i+j+1,instance_id:r.instance_id,arm,mode:contextModes[arm],input_variant:contextVariants[arm]})));
 assert.deepEqual(selection.slots,slots);return {config,selection,slots};
}
export function verifyContextSchedule(f){
 const {config,slots}=contextAssignments(),real=f.experimentKind==='polybench';
 assert.equal(f.model,config.model);assert.equal(f.variant,config.effort);assert.equal(f.budgetMs,1800000);assert.equal(f.runtimeSha,config.product_sha);
 assert.equal(f.strategy,'direct');assert.equal(f.streamLimit,'remaining-task-budget');assert.equal(f.connectionTimeoutMs,30000);
 assert.deepEqual(f.armModes,contextModes);assert.deepEqual(f.templates,contextTemplates(path.resolve(config.local_directory)));
 assert.equal(f.attempts.length,real?16:4);
 if(real)assert.deepEqual(f.attempts.map(a=>({slot:a.slot,instance_id:a.task,arm:a.arm,mode:contextModes[a.arm],input_variant:contextVariants[a.arm]})),slots);
 else assert.deepEqual(f.attempts.map(a=>a.arm),Object.keys(contextModes));
 const groups=new Map();for(const a of f.attempts){assert.equal(a.preparationStatus,'ready');if(!groups.has(a.task))groups.set(a.task,[]);groups.get(a.task).push(a);}
 assert.equal(groups.size,real?4:1);
 for(const [task,group] of groups){
  const by=Object.fromEntries(group.map(a=>[a.arm,a])),binding=f.inputVariants?.[task];assert.ok(binding);
  for(const [arm,a] of Object.entries(by))assert.equal(a.source,binding[contextVariants[arm]].source);
  assert.equal(by.P0.source,by.C0.source);assert.equal(by.P1.source,by.C1.source);assert.notEqual(by.P0.source,by.P1.source);
  const original=fs.readFileSync(path.join(by.P0.source,'TASK.md')),augmented=fs.readFileSync(path.join(by.P1.source,'TASK.md'));
  assert.equal(digest(original),binding.original.taskSha256);assert.equal(digest(augmented),binding['public-context-v2'].taskSha256);
  assert.ok(augmented.length<=131071&&augmented.length>original.length&&augmented.subarray(0,original.length).equals(original));
  // The only permitted source difference is TASK.md; dependency entries/modes/links stay equal.
  const withoutTask=entries=>Object.fromEntries(Object.entries(entries).filter(([name])=>name!=='TASK.md'));
  const a=f.runtimeManifests?.[by.P0.source]??f.inputManifests[task+'-P0'],b=f.runtimeManifests?.[by.P1.source]??f.inputManifests[task+'-P1'];
  assert.deepEqual(withoutTask(a),withoutTask(b));
  assert.deepEqual(f.environments[by.P0.source],f.environments[by.P1.source]);
 }
}
