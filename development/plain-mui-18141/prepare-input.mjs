// Reuse the exact historical public input and plain dependencies, no model requests.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {manifest} from '../native-task-integrated/run.mjs';
const local=path.resolve('local/plain-mui-18141'),pilot=path.resolve('local/polybench-pilot'),id='mui__material-ui-18141';
const get=p=>JSON.parse(fs.readFileSync(p)),sha=b=>createHash('sha256').update(b).digest('hex'),save=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const task=get('development/polybench-pilot/frozen-manifest.json').tasks.find(x=>x.instance_id===id),source=pilot+'/author-inputs/'+id+'/source';
assert.equal(sha(fs.readFileSync(source+'/TASK.md')),task.promptSha256);
assert.ok(fs.readFileSync(source+'/TASK.md').equals(fs.readFileSync('development/polybench-pilot/prompts/'+id+'.md')));
for(const [name,h]of Object.entries(task.archives))assert.equal(sha(fs.readFileSync(pilot+'/author-inputs/'+id+'/'+name)),h);
assert.equal(sha(fs.readFileSync(pilot+'/'+id+'.csv')),task.originalRowCsvSha256);
const old=get(pilot+'/batch/freeze.json'),input=manifest(source);assert.deepEqual(input,old.inputManifests[id+'-P']);
const isolation=get(pilot+'/author-inputs/'+id+'/image-isolation.json');assert.equal(isolation.passed,true);assert.equal(isolation.image,task.authorImage);
const dependencies=old.dependencies,dependencyManifest=manifest(dependencies);assert.deepEqual(dependencyManifest,old.runtimeManifests[dependencies]);
const attempts=[{slot:1,task:id,arm:'P',project:'mui/material-ui',source}];
const prepared={version:1,experimentKind:'plain-mui-18141-preflight',runtimeSha:old.runtimeSha,model:old.model,variant:old.variant,budgetMs:1800000,strategy:'direct',preflightPassed:true,streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,toolchain:old.toolchain,template:dependencies,dependencies,config:old.config,attempts,environments:{[source]:old.environments[source]},inputManifests:{[id+'-P']:input},runtimeManifests:{[dependencies]:dependencyManifest},files:{}};
save(local+'/prepared.json',prepared);save(local+'/input-receipt.json',{task,sourceManifestSha256:sha(JSON.stringify(input)),plainDependencyManifestSha256:sha(JSON.stringify(dependencyManifest)),promptBytes:fs.statSync(source+'/TASK.md').size,promptUnchanged:true,realProviderRequests:0});
console.log('Exact public source, prompt, dependency archives and plain runtime bindings verified.');
