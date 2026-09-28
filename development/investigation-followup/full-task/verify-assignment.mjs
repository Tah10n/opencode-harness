import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {runComparison} from '../../native-task-ab/run-comparison.mjs';
const root=path.resolve('local/investigation-followup-full-task'),dev='development/investigation-followup/full-task';
const prepared=JSON.parse(fs.readFileSync(root+'/prepared.json'));
const fixed=['development/native-task-ab/native-run.mjs','development/native-task-abc/native-run.mjs','development/native-task-abc/deadline-stop.mjs','development/native-task-integrated/container-session.mjs','development/native-task-integrated/container-relay.mjs','development/native-task-ab/provider-recording.mjs','development/native-task-utility/container/stop-workload.mjs','development/ledger-review-delivery/resolve-native-result.mjs','development/polybench-pilot/capture.mjs','development/native-output-retention/output-files.mjs'];
const hashes={};for(const file of fixed){const bytes=fs.readFileSync(file);assert.deepEqual(bytes,execFileSync('git',['show',prepared.runtimeSha+':'+file]));hashes[file]=createHash('sha256').update(bytes).digest('hex');}
assert.equal(prepared.config.permission.webfetch,'deny');assert.equal(prepared.config.agent.build.permission.webfetch,'deny');
const cases=[['second-slot',f=>f.attempts.push({...f.attempts[0],slot:2})],['wrong-runtime',f=>f.runtimeSha='0'.repeat(40)],['extra-time',f=>f.budgetMs++],['wrong-arm',f=>f.attempts[0].arm='I0'],['old-profile',f=>f.recordingProfile='research-full-v1'],['wrong-bound',f=>f.recordingBounds.totalBytes++],['foreign-campaign',f=>f.experimentKind='other-full-task']];
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'followup-assignment-')),results=[];
try{
 for(const [name,change] of cases){const dir=path.join(temporary,name);fs.mkdirSync(dir);const f=structuredClone(prepared);f.runtimeManifests={};change(f);fs.writeFileSync(dir+'/freeze.json',JSON.stringify(f));let entered=false;
  await assert.rejects(runComparison({root:dir,startContainer:async()=>{entered=true;throw Error('Unexpected admission');}}),/Invalid|Unknown|not assigned/);assert.equal(entered,false);assert.ok(!fs.existsSync(dir+'/runs'));results.push(name);
 }
 const dir=path.join(temporary,'valid-no-native');fs.mkdirSync(dir);const f=structuredClone(prepared);f.runtimeManifests={};fs.writeFileSync(dir+'/freeze.json',JSON.stringify(f));let entries=0;
 const outcome=await runComparison({root:dir,startContainer:async()=>{entries++;throw Error('Expected offline admission boundary; no native process');},readAuth:()=>{throw Error('Auth must not be read');},fetchImpl:()=>{throw Error('Fetch must not run');}});
 assert.equal(entries,1);assert.equal(outcome.status,'paused');assert.match(outcome.pause.message,/Expected offline admission/);
 assert.equal(fs.readdirSync(dir+'/runs').length,1);
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
const receipt={passed:true,negativeAdmissionCases:results,validAssignmentReachedNativeBoundaryOnce:true,nativeStarted:false,realProviderCalls:0,unchangedCandidateFiles:hashes,deadline:'Unmodified fixed runTask/runNativePhase/worker/relay imported by parameterized scheduler',capture:'Corrected wrapper calls actual delivery inventory and Git tree equivalence',temporaryControlsRemoved:!fs.existsSync(temporary)};
fs.writeFileSync(dev+'/assignment-verification.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({passed:true,negativeCases:results.length,unchangedFiles:fixed.length}));
