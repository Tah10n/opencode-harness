// Bounded model-free preflight of the six diagnostic development tasks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../development/native-task-pilot/tasks');
const tasks=fs.readdirSync(root).sort();assert.equal(tasks.length,6);
const summaries=[];
for(const task of tasks){
 const directory=path.join(root,task),cases={};
 for(const kind of ['initial','reference']){
  const source=path.join(directory,kind);
  const ordinary=spawnSync('npm',['test'],{cwd:source,encoding:'utf8',timeout:30000});
  assert.equal(ordinary.status,0,`${task}/${kind} ordinary checks\n${ordinary.stdout}\n${ordinary.stderr}`);
  const acceptance=spawnSync(process.execPath,['--test',path.join(directory,'acceptance/acceptance.test.mjs')],{env:{...process.env,PILOT_SOURCE:source},encoding:'utf8',timeout:30000});
  if(kind==='reference')assert.equal(acceptance.status,0,`${task} reference acceptance\n${acceptance.stdout}\n${acceptance.stderr}`);
  else assert.equal(acceptance.status,1,`${task} must discriminate against missing baseline requirements`);
  const counts=Object.fromEntries(['tests','pass','fail','cancelled','skipped'].map(k=>[k,Number(new RegExp(`(?:# |ℹ )${k} (\\d+)`).exec(acceptance.stdout)?.[1])]));
  assert.ok(counts.tests>0,`${task}: no test registration is not a pass`);
  assert.equal(counts.cancelled,0);assert.equal(counts.skipped,0);
  cases[kind]={ordinaryPassed:true,acceptance:counts};
 }
 summaries.push({task,...cases});
}
console.log(JSON.stringify({passed:true,realProviderRequests:0,tasks:summaries},null,2));
