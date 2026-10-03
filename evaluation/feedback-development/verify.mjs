import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {tasks,schedule,config,frozenManifest,directory,repository,realBatch} from './suite.mjs';
import {verifyFrozenSchedule} from '../support/scheduler.mjs';
import {preflight} from './preflight.mjs';
import {providerConfig,prepare} from './prepare.mjs';
import {summarize,report} from './report.mjs';
import {runPrepared,verifyRealAdmission} from './run.mjs';
import {manifest} from '../support/manifest.mjs';
import {image} from '../support/container-session.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'feedback-verify-'));
try {
  const f={experimentKind:'feedback-development',model:'openai/explicit-fixture',variant:'high',budgetMs:600000,strategy:'per-slot',streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,preflightPassed:true,files:{},attempts:schedule.map(a=>({...a,source:tasks.find(t=>t.id===a.task).source}))};
  verifyFrozenSchedule(f,()=>{});
  for(const mutation of [
    {...f,budgetMs:600001},{...f,variant:''},{...f,model:''},{...f,attempts:f.attempts.slice(1)},
    {...f,attempts:f.attempts.map((a,i)=>i===0?{...a,arm:'D'}:a)},
    {...f,attempts:f.attempts.map((a,i)=>i===1?{...a,source:'/different-initial-tree'}:a)},
    {...f,attempts:f.attempts.map((a,i)=>i===2||i===3?{...a,task:f.attempts[0].task}:a)},
  ])assert.throws(()=>verifyFrozenSchedule(mutation,()=>{}));
  for(const [model,variant] of [[undefined,'high'],['openai/x',undefined],['',''],['another/x','high']])assert.throws(()=>providerConfig(model,variant));
  assert.throws(()=>prepare({output:path.join(temp,'missing-model')}),/Explicit/);assert.ok(!fs.existsSync(path.join(temp,'missing-model')));
  await assert.rejects(()=>runPrepared(temp),/scripted provider/);
  let authReads=0,providerCalls=0;
  const deniedAuth=()=>{authReads++;throw Error('Credentials must remain unread');};
  const deniedProvider=()=>{providerCalls++;throw Error('Provider must remain unopened');};
  fs.writeFileSync(path.join(temp,'freeze.json'),JSON.stringify({...f,experimentKind:'fixture'}));
  await assert.rejects(()=>runPrepared(temp,{authorizeModelRuns:true,readAuth:deniedAuth}),/Fixtures require/);
  await assert.rejects(()=>runPrepared(temp,{scriptedFetch:fetch,readAuth:deniedAuth}),/real provider transport/);
  fs.writeFileSync(path.join(temp,'freeze.json'),JSON.stringify(f));
  await assert.rejects(()=>runPrepared(temp,{scriptedFetch:deniedProvider,readAuth:deniedAuth}),/explicit authorization/);
  assert.equal(authReads,0);assert.equal(providerCalls,0);
  const plan=frozenManifest(),digest='a'.repeat(64),sourceCommit='b'.repeat(40),testImage=image??'sha256:'+'d'.repeat(64);
  const admitted={...f,suite:config.suite,model:'openai/gpt-5.6-luna',variant:'high',modelRunsAuthorized:true,runtimeVersion:config.runtimeVersion,nodeVersion:config.nodeVersion,executionImage:testImage,sourceCommit,config:providerConfig('openai/gpt-5.6-luna','high'),attempts:schedule.map(a=>({...a,source:path.join(realBatch,'inputs',a.task)})),files:Object.fromEntries(Object.entries({...plan.files,...plan.product}).map(([name,value])=>[path.join(repository,name),value.sha256])),inputManifests:Object.fromEntries(schedule.map(a=>[a.task+'-'+a.arm,manifest(tasks.find(t=>t.id===a.task).source)]))};
  const seal={freezeSha256:digest,sourceCommit,executionImage:testImage};
  // This is admission validation only, with no runner, auth or network call.
  verifyRealAdmission(realBatch,admitted,seal,digest,testImage);
  for(const changed of [{modelRunsAuthorized:false},{model:'openai/other'},{variant:'low'},{nodeVersion:'24.18.0'},{runtimeVersion:'1.18.25'},{executionImage:'sha256:'+'c'.repeat(64)},{config:{}},{inputManifests:{}},{files:{}},{attempts:admitted.attempts.slice(1)}])assert.throws(()=>verifyRealAdmission(realBatch,{...admitted,...changed},seal,digest,testImage));
  assert.throws(()=>verifyRealAdmission(realBatch,admitted,seal,'changed',testImage),/Changed execution freeze/);
  assert.throws(()=>verifyRealAdmission(temp,admitted,seal,digest,testImage),/canonical/);
  const runtimeDirectory=path.join(temp,'runtime');fs.mkdirSync(runtimeDirectory);
  const runtimeFile=path.join(runtimeDirectory,'installed-runtime');fs.writeFileSync(runtimeFile,'frozen runtime bytes');
  const runtimeFreeze={...admitted,runtimeManifests:{[runtimeDirectory]:manifest(runtimeDirectory)}};
  verifyRealAdmission(realBatch,runtimeFreeze,seal,digest,testImage);
  fs.writeFileSync(runtimeFile,'changed runtime bytes');
  assert.throws(()=>verifyRealAdmission(realBatch,runtimeFreeze,seal,digest,testImage),/Runtime\/dependencies\/input changed/);
  const rows=tasks.flatMap((t,i)=>[{task:t.id,arm:'direct',Q:i<2},{task:t.id,arm:'D',Q:i===0||i===2}]);
  const paired=summarize(rows);assert.equal(paired.candidateWins,1);assert.equal(paired.candidateLosses,1);assert.equal(paired.ties,6);assert.equal(paired.deltaQPercentagePoints,0);
  assert.equal(summarize(rows.slice(1)).deltaQPercentagePoints,null);
  assert.equal(summarize([...rows,rows[0]]).pairs[0].result,'unknown');
  const partial=path.join(temp,'partial');fs.mkdirSync(path.join(partial,'runs',tasks[0].id+'-direct'),{recursive:true});
  fs.writeFileSync(path.join(partial,'freeze.json'),JSON.stringify({experimentKind:'fixture',attempts:[schedule[0]]}));
  fs.writeFileSync(path.join(partial,'runs',tasks[0].id+'-direct','provider-metadata.json'),JSON.stringify([{forwarded:true,usage:{input_tokens:10,output_tokens:5,cached_tokens:0,reasoning_tokens:0}},{forwarded:true}]));
  const incomplete=(await report(partial,{evaluate:false})).rows[0];
  assert.equal(incomplete.requests,2);assert.equal(incomplete.tokens.input_tokens,null);assert.equal(incomplete.knownTokens.input_tokens,10);assert.equal(incomplete.Q,null);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'frozen-manifest.json'))),frozenManifest());
  await preflight(path.join(temp,'preflight'));
  console.log('PASS feedback development allocation, explicit configuration, model admission and controls');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
