import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const nativeCampaign=name=>['consolidated-v1','consolidated-remaining-v1'].includes(name);
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
export const selectionPath=configPath?path.join(path.dirname(configPath),'selection.json'):path.resolve('evaluation/polybench/selection.json');
export const arms=campaign?.arms??['P','H0','H1'];
