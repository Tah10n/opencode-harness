// No native process, auth read, network or model. Negative admission controls.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {runComparison} from '../../native-task-ab/run-comparison.mjs';
const root=path.resolve('local/investigation-inspect-full-task/schedule-controls');fs.mkdirSync(root,{mode:0o700});
const prepared=JSON.parse(fs.readFileSync('local/investigation-inspect-full-task/prepared.json'));
const cases=[['second-slot',f=>f.attempts.push({...f.attempts[0],slot:2})],['wrong-runtime',f=>f.runtimeSha='0'.repeat(40)],['extra-time',f=>f.budgetMs++],['wrong-arm',f=>f.attempts[0].arm='I0'],['old-profile',f=>f.recordingProfile='research-full-v1'],['wrong-bound',f=>f.recordingBounds.totalBytes++],['foreign-campaign',f=>f.experimentKind='investigation-direct-ledger-pair'],['arbitrary-profile',f=>f.recordingProfile='unlimited']];
const results=[];
for(const [name,change]of cases){const dir=root+'/'+name;fs.mkdirSync(dir,{mode:0o700});const f=structuredClone(prepared);f.runtimeManifests={};change(f);fs.writeFileSync(dir+'/freeze.json',JSON.stringify(f));let entered=false;
 await assert.rejects(runComparison({root:dir,startContainer:async()=>{entered=true;throw Error('Unexpected admission');}}),/Invalid|Unknown recording|not assigned/);assert.equal(entered,false);assert.ok(!fs.existsSync(dir+'/runs'));results.push({name,rejectedBeforeNative:true});}
fs.writeFileSync('development/investigation-direct-ledger-pair/inspect-full-task/schedule-verification.json',JSON.stringify({passed:true,realProviderRequests:0,controls:results},null,2)+'\n');console.log(JSON.stringify({passed:true,controls:results.length}));
