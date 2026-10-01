// Model-free schedule contract: fixed P/C/T allocation, equal preparation exclusion,
// isolated arm bundles and no provider/credential discovery.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {manifest} from '../support/manifest.mjs';
import {runComparison} from '../support/scheduler.mjs';
import {inputManifestScript} from '../support/input-manifest.mjs';
import {remainingAssignments} from './campaign.mjs';
import {qualityAssignments,qualitySpecification,qualityTemplates} from './campaign.mjs';
import {createHash} from 'node:crypto';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'consolidated-schedule-'));
try{
 const source=root+'/source';fs.mkdirSync(source);fs.writeFileSync(source+'/TASK.md','Scripted scheduler contract only.');
 fs.mkdirSync(source+'/test/node_modules',{recursive:true});fs.symlinkSync('../..',source+'/test/node_modules/self');
 fs.symlinkSync('test',source+'/internal');
 const input=manifest(source);assert.deepEqual(input['test/node_modules/self'],{symlink:'../..'});
 let actualInputScript;
 const arms=['P','C','T'];const attempts=Array.from({length:20},(_,i)=>arms.slice(i%3).concat(arms.slice(0,i%3)).map((arm,j)=>({slot:i*3+j+1,task:'task-'+i,arm,source,preparationStatus:i===0?'preparation_error':'ready'}))).flat();
 const freeze={experimentKind:'polybench',campaign:'consolidated-v1',model:'openai/gpt-5.6-luna',variant:'high',strategy:'direct',budgetMs:1800000,streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,preflightPassed:true,templates:{P:'plain-only',C:'core-only',T:'task-only'},files:{},attempts,inputManifests:Object.fromEntries(attempts.map(a=>[a.task+'-'+a.arm,input]))};
 const execute=async(f,folder,seen)=>{
  fs.mkdirSync(folder);fs.writeFileSync(folder+'/freeze.json',JSON.stringify(f));
  return runComparison({root:folder,fetchImpl:()=>{throw Error('No provider call allowed');},readAuth:()=>{throw Error('No auth read allowed');},
   readInput:async()=>{actualInputScript=inputManifestScript({root:source,run:'fixture'});const r=spawnSync(process.execPath,['-e',actualInputScript],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return {manifest:JSON.parse(r.stdout),receipt:{fixture:true}};},
   startContainer:async options=>{
    const a=f.attempts.find(a=>options.output.endsWith('/'+a.task+'-'+a.arm+'/session'));assert.ok(a);assert.equal(options.template,f.templates[a.arm]);seen.push(a.slot);
    return {setTaskBudget(){},exec(argv){if(argv[2]?.includes("visit('/work/repo')")){actualInputScript=argv[2].replaceAll('/work/repo',source);return spawnSync(process.execPath,['-e',actualInputScript],{encoding:'utf8'});}return {status:0,stdout:argv[0]==='/opt/opencode'?'1.18.26':argv[2].includes('DatabaseSync')?' {"sessions":[],"messages":[],"tools":[]}':''};},close(){return 0;}};
   },runTaskImplementation:async()=>({nativeCompleted:true,termination:{terminationVerified:true}}),stopWorkload:()=>({terminationVerified:true}),captureCandidate:()=>({status:0})});
 };
 const seen=[];assert.equal((await execute(freeze,root+'/good',seen)).status,'finished');
 assert.deepEqual(seen,Array.from({length:57},(_,i)=>i+4));
 const compact={...freeze,inputManifests:{},runtimeManifests:{[source]:input}};
 const compactSeen=[];assert.equal((await execute(compact,root+'/compact',compactSeen)).status,'finished');assert.deepEqual(compactSeen,seen);
 const changed={...compact,runtimeManifests:{[source]:{...input,'TASK.md':{...input['TASK.md'],sha256:'wrong'}}}};
 const changedSeen=[];await assert.rejects(execute(changed,root+'/changed-input',changedSeen),/Runtime\/dependencies\/input changed/);assert.deepEqual(changedSeen,[]);
 for(const target of ['../outside','../source-sibling','/outside']){
  fs.symlinkSync(target,source+'/escape');
  assert.throws(()=>manifest(source),/External symlink/);
  const rejected=spawnSync(process.execPath,['-e',actualInputScript],{encoding:'utf8'});
  assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/External dependency link/);
  fs.unlinkSync(source+'/escape');
 }
 for(const [name,mutate]of [['mixed-preparation',f=>{f.attempts[0].preparationStatus='ready';}],['wrong-order',f=>{f.attempts[4].arm='P';}],['wrong-count',f=>{f.attempts.pop();}],['missing-bundle',f=>{delete f.templates.C;}]]){
  const f=structuredClone(freeze);mutate(f);const started=[];
  await assert.rejects(execute(f,root+'/'+name,started));assert.deepEqual(started,[]);
 }
 console.log('Consolidated fixed schedule, equal exclusions and arm bundles passed; provider requests: 0');
 const slots=remainingAssignments();assert.equal(slots.length,24);
 assert.deepEqual(slots.map(s=>s.original_slot),[...Array.from({length:21},(_,i)=>i+31),58,59,60]);
 assert.equal(new Set(slots.map(s=>s.instance_id+'-'+s.arm)).size,24);
 const remaining={...compact,campaign:'consolidated-remaining-v1',attempts:slots.map(s=>({slot:s.slot,original_slot:s.original_slot,task:s.instance_id,arm:s.arm,source,preparationStatus:'ready'}))};
 const remainingSeen=[];assert.equal((await execute(remaining,root+'/remaining',remainingSeen)).status,'finished');assert.deepEqual(remainingSeen,Array.from({length:24},(_,i)=>i+1));
 for(const [name,mutate]of [['extra',f=>{f.attempts.push({...f.attempts[0],slot:25});}],['duplicate',f=>{f.attempts[1]={...f.attempts[0],slot:2};}],['wrong-origin',f=>{f.attempts[23].original_slot=54;}],['wrong-task',f=>{f.attempts[0].task='historical-evaluated-task';}],['historical-arms',f=>{f.attempts[0].arm='H0';}],['remaining-mixed-preparation',f=>{f.attempts[0].preparationStatus='preparation_error';}],['remaining-missing-bundle',f=>{delete f.templates.C;}]]){
  const f=structuredClone(remaining);mutate(f);const started=[];await assert.rejects(execute(f,root+'/'+name,started));assert.deepEqual(started,[]);
 }
 // A pre-existing attempt anywhere closes the party before earlier slots run.
 const used=root+'/used';fs.mkdirSync(used+'/runs/'+remaining.attempts[23].task+'-'+remaining.attempts[23].arm,{recursive:true});fs.writeFileSync(used+'/freeze.json',JSON.stringify(remaining));
 await assert.rejects(runComparison({root:used,runTaskImplementation:async()=>{throw Error('Never execute');},fetchImpl:()=>{throw Error('Never forward');},startContainer:()=>{throw Error('Never prepare');}}),/never be retried/);
 console.log('Remaining exact 24 assignments, original slots, P/C/T bundles and extra/duplicate/executed refusal passed; provider requests: 0');
 const development=qualityAssignments('evidence-backed-core-development-v1');assert.equal(development.slots.length,18);
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 const qualityCase=(name,mutate=()=>{})=>{
  const directory=fs.mkdtempSync(path.join(root,'quality-')),spec=qualitySpecification(name);
  const config={...development.config,name,arms:spec.arms,task_count:spec.tasks,slot_count:spec.slots,arm_modes:Object.fromEntries(spec.arms.map(arm=>[arm,arm==='P'?'plain':'core'])),arm_products:Object.fromEntries(spec.arms.map(arm=>[arm,arm==='P'?null:arm==='C0'?development.config.arm_products.C0:development.config.product_sha]))};
  config.local_directory={'evidence-backed-core-development-v1':'local/polybench-evidence-backed-core-development','evidence-backed-core-h2-v1':'local/polybench-evidence-backed-core-h2','quality-confirmation-v1':'local/polybench-quality-confirmation'}[name];
  let selected;
  if(name==='quality-confirmation-v1'){
   selected=JSON.parse(fs.readFileSync('evaluation/polybench/campaigns/quality-confirmation-v1/selection.json'));
   fs.copyFileSync('evaluation/polybench/campaigns/quality-confirmation-v1/selection-protocol.json',directory+'/selection-protocol.json');
   fs.copyFileSync('evaluation/polybench/campaigns/quality-confirmation-v1/selection.json',directory+'/selection.json');config.selection_file='prepared-selection.json';
  }else{selected=structuredClone(development.selected);selected.slots=selected.selected.flatMap((row,i)=>spec.arms.slice(i%spec.arms.length).concat(spec.arms.slice(0,i%spec.arms.length)).map((arm,j)=>({slot:i*spec.arms.length+j+1,instance_id:row.instance_id,arm})));}
  if(name!==development.config.name){
   const file=directory+'/screening.json';fs.writeFileSync(file,JSON.stringify({completed_eligible_batch:true,admission_stop:false,selected:name==='quality-confirmation-v1',product_sha:config.product_sha}));config.screening={path:file,sha256:sha(fs.readFileSync(file))};
  }
  if(name==='evidence-backed-core-h2-v1'){const file=directory+'/controls.json';fs.writeFileSync(file,JSON.stringify({campaign:development.config.name,outcome:{status:'finished'},scheduling_pause:null,assigned:18,slots:development.slots}));config.fresh_controls={path:file,sha256:sha(fs.readFileSync(file))};}
  mutate(config,selected,directory);fs.writeFileSync(directory+'/campaign.json',JSON.stringify(config));selected.configuration_sha256=sha(fs.readFileSync(directory+'/campaign.json'));fs.writeFileSync(directory+'/'+(config.selection_file??'selection.json'),JSON.stringify(selected));
  return ()=>qualityAssignments(name,directory);
 };
 for(const [name,count] of [['evidence-backed-core-development-v1',18],['evidence-backed-core-h2-v1',6],['quality-confirmation-v1',60]]){
  assert.equal(qualityCase(name)().slots.length,count);
  for(const mutate of [(c,s)=>s.slots.pop(),(c,s)=>s.slots[1]={...s.slots[0],slot:2},c=>c.model='openai/different',c=>c.effort='low',c=>c.task_budget_seconds=1801,c=>c.arm_modes[c.arms.at(-1)]='task',c=>c.arm_products[c.arms.at(-1)]='0'.repeat(40)])assert.throws(qualityCase(name,mutate));
 }
 assert.throws(qualityCase('quality-confirmation-v1',(c,s)=>s.selected[0].language='not-JS-or-TS'));
 assert.throws(qualityCase('quality-confirmation-v1',(c,s)=>s.selected.forEach(row=>row.repo='single/repository')));
 assert.throws(qualityCase('quality-confirmation-v1',(c,s,d)=>fs.writeFileSync(d+'/screening.json','{}')));
 assert.throws(qualityCase('evidence-backed-core-h2-v1',(c,s,d)=>{const file=d+'/controls.json';fs.writeFileSync(file,'{}');c.fresh_controls.sha256=sha(fs.readFileSync(file));}));
 assert.throws(qualityCase('quality-confirmation-v1',(c,s)=>{const i=s.selected.findIndex(row=>row.repo==='mui/material-ui');s.selected[i]=s.reserve_order.find(row=>row.repo==='mui/material-ui');s.slots=s.selected.flatMap((row,i)=>(i%2?['H','P']:['P','H']).map((arm,j)=>({slot:i*2+j+1,instance_id:row.instance_id,arm})));}));
 assert.equal(qualityCase('quality-confirmation-v1',(c,s,d)=>{
  const i=s.selected.findIndex(row=>row.repo==='mui/material-ui'),original=s.selected[i],reserve=s.reserve_order[0];assert.equal(reserve.language,original.language);
  const proof=d+'/invalidity.json';fs.writeFileSync(proof,JSON.stringify({instance_id:original.instance_id,status:'preparation_error',common_control:true,control:'baseline',model_requests:0}));
  s.common_invalidities=[{instance_id:original.instance_id,control:'baseline',reason:'Synthetic common baseline failure',before_first_model_request:true,evidence:{path:proof,sha256:sha(fs.readFileSync(proof))}}];
  s.selected[i]=reserve;s.replacements=[{position:i+1,original_instance_id:original.instance_id,replacement_instance_id:reserve.instance_id,reason:s.common_invalidities[0].reason,reserve_decisions:[{instance_id:reserve.instance_id,disposition:'selected',reason:null}]}];
  s.slots=s.selected.flatMap((row,i)=>(i%2?['H','P']:['P','H']).map((arm,j)=>({slot:i*2+j+1,instance_id:row.instance_id,arm})));
 })().slots.length,60);
 const q={...compact,campaign:development.config.name,runtimeSha:development.config.product_sha,armModes:development.config.arm_modes,armProducts:development.config.arm_products,templates:qualityTemplates(development.config),attempts:development.slots.map(s=>({slot:s.slot,task:s.instance_id,arm:s.arm,source,preparationStatus:'ready'}))};
 const qualitySeen=[];assert.equal((await execute(q,root+'/quality-development',qualitySeen)).status,'finished');assert.deepEqual(qualitySeen,Array.from({length:18},(_,i)=>i+1));
 for(const mutate of [f=>f.attempts.pop(),f=>f.attempts[1].arm='H1',f=>delete f.templates.C0,f=>{[f.templates.C0,f.templates.H1]=[f.templates.H1,f.templates.C0];},f=>f.armModes.H1='task',f=>f.budgetMs=1800001]){const bad=structuredClone(q);mutate(bad);const seen=[];await assert.rejects(execute(bad,fs.mkdtempSync(path.join(root,'bad-quality-'))+'/batch',seen));assert.deepEqual(seen,[]);}
 const copied=fs.mkdtempSync(path.join(root,'copied-quality-'));fs.writeFileSync(copied+'/freeze.json',JSON.stringify(q));await assert.rejects(runComparison({root:copied,runTaskImplementation:async()=>{throw Error('Never repeat');}}),/canonical batch root/);
 await assert.rejects(runComparison({root:root+'/quality-development',runTaskImplementation:async()=>{throw Error('Never repeat');},fetchImpl:()=>{throw Error('Never forward');}}),/never be retried/);
 console.log('Quality 18/6/60 schedules, fixed source/arms/model/deadline, screening gates and no-repeat refusal passed; provider requests: 0');
}finally{fs.rmSync(root,{recursive:true,force:true});}
