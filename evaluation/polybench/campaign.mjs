import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const qualityCampaign=name=>['evidence-backed-core-development-v1','evidence-backed-core-h2-v1','quality-confirmation-v1'].includes(name);
export const nativeCampaign=name=>['consolidated-v1','consolidated-remaining-v1'].includes(name)||qualityCampaign(name);
export function qualitySpecification(name){
 const specifications={
  'evidence-backed-core-development-v1':{arms:['P','C0','H1'],tasks:6,slots:18},
  'evidence-backed-core-h2-v1':{arms:['H2'],tasks:6,slots:6},
  'quality-confirmation-v1':{arms:['P','H'],tasks:30,slots:60},
 };
 if(!qualityCampaign(name))throw Error('Unsupported quality stage');
 return specifications[name];
}
export function qualityTemplates(config){
 return Object.fromEntries(config.arms.map(arm=>[arm,path.resolve(config.local_directory,arm==='P'?'plain-dependencies':arm==='C0'?'core-bundle':'candidate-core-bundle')]));
}
function confirmationSelection(directory,selected,protocol){
 const preregistered=fs.readFileSync(directory+'/selection.json');
 assert.equal(createHash('sha256').update(preregistered).digest('hex'),'c8e5e73bf00e137c65b2cc66275c335c2a92d62618a25de35c41738a5aa5f2b2','Original preregistered selection changed');
 assert.equal(createHash('sha256').update(fs.readFileSync(directory+'/selection-protocol.json')).digest('hex'),'3fc3edcea0af2651054f18287251e72d2b61b1e97624cd89dbdf7a364d36efc7','Original preregistration protocol changed');
 const original=JSON.parse(preregistered);
 const invalidities=selected.common_invalidities??[],invalid=new Map(),pool=[...original.selected,...original.reserve_order];
 for(const record of invalidities){
  assert.ok(pool.some(row=>row.instance_id===record.instance_id)&&!invalid.has(record.instance_id));
  assert.ok(['baseline','gold','environment'].includes(record.control)&&record.reason?.trim()&&record.before_first_model_request===true);
  const proof=fs.readFileSync(record.evidence.path);assert.equal(createHash('sha256').update(proof).digest('hex'),record.evidence.sha256);
  const evidence=JSON.parse(proof);assert.equal(evidence.instance_id,record.instance_id);assert.equal(evidence.status,'preparation_error');assert.equal(evidence.common_control,true);assert.equal(evidence.control,record.control);assert.equal(evidence.model_requests,0);
  invalid.set(record.instance_id,record);
 }
 const expected=structuredClone(original.selected),used=new Set(expected.map(row=>row.instance_id)),replacements=[];
 for(let position=0;position<expected.length;position++){
  const row=expected[position];if(!invalid.has(row.instance_id))continue;
  const decisions=[];let replacement;
  for(const reserve of original.reserve_order){
   let reason=used.has(reserve.instance_id)?'already_used':invalid.has(reserve.instance_id)?'common_control_invalid':reserve.language!==row.language?'language_mismatch':null;
   if(!reason){const trial=expected.map((value,i)=>i===position?reserve:value),repos=new Map();for(const value of trial)repos.set(value.repo,(repos.get(value.repo)??0)+1);if(repos.size<protocol.min_repositories||[...repos.values()].some(n=>n>protocol.max_per_repository))reason='repository_bounds';}
   decisions.push({instance_id:reserve.instance_id,disposition:reason?'rejected':'selected',reason});
   if(!reason){replacement=reserve;break;}
  }
  assert.ok(replacement,'Fixed reserve pool cannot prepare 30 valid tasks');
  expected[position]=replacement;used.add(replacement.instance_id);
  replacements.push({position:position+1,original_instance_id:row.instance_id,replacement_instance_id:replacement.instance_id,reason:invalid.get(row.instance_id).reason,reserve_decisions:decisions});
 }
 assert.deepEqual(selected.selected,expected,'Confirmation must preserve the preregistered pool, replacement order and metadata');
 assert.deepEqual(selected.replacements??[],replacements,'Missing objective replacement journal');
 assert.ok(expected.every(row=>!invalid.has(row.instance_id)));
}
export function qualityAssignments(name,directory=path.resolve('evaluation/polybench/campaigns',name)){
 const config=JSON.parse(fs.readFileSync(directory+'/campaign.json'));
 const selectionFile=config.selection_file??'selection.json';
 assert.ok(['selection.json','prepared-selection.json'].includes(selectionFile),'Invalid stage selection path');
 const selected=JSON.parse(fs.readFileSync(directory+'/'+selectionFile)),spec=qualitySpecification(name);
 assert.equal(config.name,name);
 assert.equal(config.local_directory,{'evidence-backed-core-development-v1':'local/polybench-evidence-backed-core-development','evidence-backed-core-h2-v1':'local/polybench-evidence-backed-core-h2','quality-confirmation-v1':'local/polybench-quality-confirmation'}[name],'Quality stage must use its canonical private directory');
 assert.deepEqual(config.arms,spec.arms);assert.equal(config.task_count,spec.tasks);assert.equal(config.slot_count,spec.slots);
 assert.equal(config.model,'openai/gpt-5.6-luna');assert.equal(config.effort,'high');assert.equal(config.opencode,'1.18.26');assert.equal(config.task_budget_seconds,1800);
 assert.match(config.product_sha,/^[a-f0-9]{40}$/);
 assert.deepEqual(config.arm_products,Object.fromEntries(spec.arms.map(arm=>[arm,arm==='P'?null:arm==='C0'?'358cb0a3fecce7f8b3af75d7ae6d6d4052257c04':config.product_sha])));
 assert.equal(selected.dataset_revision,'b3fca77b637379f0c01ad86d18753a7ac1998b53');
 assert.equal(selected.dataset_sha256,'0c8138e73c34fa29a5276b675b146b72d78ce001fcc4560d76302c908b4808a5');
 assert.equal(selected.selected.length,spec.tasks);assert.equal(new Set(selected.selected.map(r=>r.instance_id)).size,spec.tasks);
 if(name==='quality-confirmation-v1'){
  assert.equal(selectionFile,'prepared-selection.json','Confirmation preparation must preserve the original preregistration');
  for(const language of ['JavaScript','TypeScript'])assert.equal(selected.selected.filter(r=>r.language===language).length,15);
  const repositories=new Map();for(const row of selected.selected)repositories.set(row.repo,(repositories.get(row.repo)??0)+1);
  assert.ok(repositories.size>=5&&[...repositories.values()].every(count=>count<=6));
  const protocol=JSON.parse(fs.readFileSync(directory+'/selection-protocol.json'));
  assert.ok(selected.selected.every(row=>!protocol.excluded_instance_ids.includes(row.instance_id)));
  confirmationSelection(directory,selected,protocol);
 }else{
  assert.deepEqual(selected.selected.map(row=>row.instance_id),['mrdoob__three.js-24461','serverless__serverless-8159','mui__material-ui-42412','microsoft__vscode-108964','mui__material-ui-18683','microsoft__vscode-135805']);
 }
 const expected=selected.selected.flatMap((row,i)=>{
  const order=name==='quality-confirmation-v1'?(i%2?['H','P']:['P','H']):spec.arms.slice(i%spec.arms.length).concat(spec.arms.slice(0,i%spec.arms.length));
  return order.map((arm,j)=>({slot:i*spec.arms.length+j+1,instance_id:row.instance_id,arm}));
 });
 assert.deepEqual(selected.slots.map(({slot,instance_id,arm})=>({slot,instance_id,arm})),expected);
 assert.equal(new Set(expected.map(s=>s.instance_id+'-'+s.arm)).size,spec.slots);
 assert.deepEqual(config.arm_modes,Object.fromEntries(spec.arms.map(arm=>[arm,arm==='P'?'plain':'core'])));
 assert.equal(selected.configuration_sha256,createHash('sha256').update(fs.readFileSync(directory+'/campaign.json')).digest('hex'),'Stage configuration changed');
 if(name!=='evidence-backed-core-development-v1'){
  const screening=fs.readFileSync(config.screening.path);
  assert.equal(createHash('sha256').update(screening).digest('hex'),config.screening.sha256,'Screening decision changed');
  const decision=JSON.parse(screening);
  assert.equal(decision.completed_eligible_batch,true);assert.equal(decision.admission_stop,false);
  assert.equal(decision.selected,name==='quality-confirmation-v1','Stage requires the prescribed screening disposition');
  if(name==='quality-confirmation-v1')assert.equal(decision.product_sha,config.product_sha);
  if(name==='evidence-backed-core-h2-v1'){
   const controls=fs.readFileSync(config.fresh_controls.path);
   assert.equal(createHash('sha256').update(controls).digest('hex'),config.fresh_controls.sha256,'Fresh controls changed');
  }
 }
 return {config,selected,slots:expected};
}
export function remainingAssignments(){
 const directory=path.resolve('evaluation/polybench/campaigns/consolidated-remaining-v1');
 const get=file=>JSON.parse(fs.readFileSync(file));
 const config=get(directory+'/campaign.json'),selection=get(directory+'/selection.json'),origin=config.origin;
 assert.deepEqual(config.arms,['P','C','T']);assert.equal(config.task_count,8);assert.equal(config.slot_count,24);
 assert.deepEqual(origin.original_slots,[...Array.from({length:21},(_,i)=>i+31),58,59,60]);
 const sources={};for(const kind of ['selection','results']){
  const bytes=fs.readFileSync(origin[kind+'_path']);assert.equal(createHash('sha256').update(bytes).digest('hex'),origin[kind+'_sha256'],'Historical source changed');sources[kind]=JSON.parse(bytes);
 }
 const slots=origin.original_slots.map((original_slot,i)=>{
  const assigned=sources.selection.slots.find(s=>s.slot===original_slot),result=sources.results.slots.find(s=>s.slot===original_slot);
  assert.equal(result.instance_id,assigned.instance_id);assert.equal(result.arm,assigned.arm);
  assert.equal(result.status,'not_started');assert.equal(result.usage.requests,0);assert.equal(result.provider_outcome,'not_started');assert.equal(result.prediction_exported,false);
  return {...assigned,slot:i+1,original_slot};
 });
 assert.deepEqual(selection.slots,slots,'Remaining slots must match historical assignments exactly');
 const ids=[...new Set(slots.map(s=>s.instance_id))];assert.equal(ids.length,8);
 assert.deepEqual(selection.selected,ids.map(id=>sources.selection.selected.find(r=>r.instance_id===id)));
 assert.equal(selection.configuration_sha256,createHash('sha256').update(fs.readFileSync(directory+'/campaign.json')).digest('hex'));
 return slots;
}
export const configPath=process.env.POLYBENCH_CAMPAIGN?path.resolve(process.env.POLYBENCH_CAMPAIGN):null;
export const campaign=configPath?JSON.parse(fs.readFileSync(configPath)):null;
export const local=path.resolve(campaign?.local_directory??'local/polybench');
if(campaign&&(!local.startsWith(path.resolve('local')+path.sep)||local===path.resolve('local/polybench')))throw Error('New campaigns require a distinct private local directory');
if(campaign?.selection_file&&!['selection.json','prepared-selection.json'].includes(campaign.selection_file))throw Error('Invalid stage selection path');
export const selectionPath=configPath?path.join(path.dirname(configPath),campaign?.selection_file??'selection.json'):path.resolve('evaluation/polybench/selection.json');
export const arms=campaign?.arms??['P','H0','H1'];
