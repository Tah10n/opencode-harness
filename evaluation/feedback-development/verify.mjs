import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {tasks,schedule,config,frozenManifest,directory,repository,realBatch,runId,conditionsHead} from './suite.mjs';
import {verifyFrozenSchedule,runComparison} from '../support/scheduler.mjs';
import {preflight} from './preflight.mjs';
import {providerConfig,prepare} from './prepare.mjs';
import {summarize,report} from './report.mjs';
import {runPrepared,verifyRealAdmission,verifyUnstarted} from './run.mjs';
import {manifest} from '../support/manifest.mjs';
import {hashFile} from '../support/output-files.mjs';
import {image} from '../support/container-session.mjs';
import {verifyReport} from './verify-report.mjs';
import {verifyPreparation} from './verify-preparation.mjs';
import {verifyAuth} from './verify-auth.mjs';
import {verifyCalibration} from './calibration/verify.mjs';
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
  const admitted={...f,runId,suite:config.suite,model:'openai/gpt-5.6-luna',variant:'high',modelRunsAuthorized:true,runtimeVersion:config.runtimeVersion,nodeVersion:config.nodeVersion,executionImage:testImage,sourceCommit,config:providerConfig('openai/gpt-5.6-luna','high'),attempts:schedule.map(a=>({...a,source:path.join(realBatch,'inputs',a.task)})),files:Object.fromEntries(Object.entries({...plan.files,...plan.product}).map(([name,value])=>[path.join(repository,name),value.sha256])),inputManifests:Object.fromEntries(schedule.map(a=>[a.task+'-'+a.arm,manifest(tasks.find(t=>t.id===a.task).source)]))};
  const seal={runId,conditionsHead,reviewedHead:sourceCommit,preRunSourceCommit:sourceCommit,freezeSha256:digest,sourceCommit,executionImage:testImage};
  // This is admission validation only, with no runner, auth or network call.
  verifyRealAdmission(realBatch,admitted,seal,digest,testImage);
  for(const changed of [{runId:'development-run-v1'},{modelRunsAuthorized:false},{model:'openai/other'},{variant:'low'},{nodeVersion:'24.18.0'},{runtimeVersion:'1.18.25'},{executionImage:'sha256:'+'c'.repeat(64)},{config:{}},{inputManifests:{}},{files:{}},{attempts:admitted.attempts.slice(1)}])assert.throws(()=>verifyRealAdmission(realBatch,{...admitted,...changed},seal,digest,testImage));
  for(const change of [
    {suite:'other suite'},
    {attempts:admitted.attempts.map((a,i)=>i<2?{...a,task:'other task'}:a)},
    {attempts:admitted.attempts.map((a,i)=>i<2?{...a,source:'/same-but-other-source'}:a)},
    {attempts:admitted.attempts.map((a,i)=>({...a,task:i<4?admitted.attempts[(i+2)%4].task:a.task}))},
    {config:{...admitted.config,permission:{...admitted.config.permission,external_directory:'allow'}}},
    {config:{...admitted.config,instructions:['changed instructions']}},
    {config:{...admitted.config,provider:{openai:{...admitted.config.provider.openai,options:{baseURL:'https://unexpected.example'}}}}},
    {inputManifests:{...admitted.inputManifests,[schedule[0].task+'-direct']:{'TASK.md':{sha256:'different'}}}},
    {files:{...admitted.files,[path.join(repository,'evaluation/feedback-development/config.json')]:'different'}},
  ])assert.throws(()=>verifyRealAdmission(realBatch,{...admitted,...change},seal,digest,testImage));
  for(const change of [{runId:'development-run-v1'},{conditionsHead:'old'},{reviewedHead:'old'},{preRunSourceCommit:'old'},{freezeSha256:'other'},{sourceCommit:'c'.repeat(40)},{executionImage:'sha256:'+'e'.repeat(64)}])assert.throws(()=>verifyRealAdmission(realBatch,admitted,{...seal,...change},digest,testImage));
  assert.equal(providerConfig('openai/gpt-5.6-luna','high').provider.openai.models['gpt-5.6-luna'].options.reasoningEffort,'high');
  assert.throws(()=>verifyRealAdmission(realBatch,admitted,seal,'changed',testImage),/Changed execution freeze/);
  assert.throws(()=>verifyRealAdmission(temp,admitted,seal,digest,testImage),/canonical/);
  assert.throws(()=>verifyRealAdmission(path.join(repository,'local/feedback-development-run-v1/batch'),admitted,seal,digest,testImage),/canonical/);
  assert.throws(()=>verifyRealAdmission(path.join(repository,'local/feedback-development-run-v2/batch'),admitted,seal,digest,testImage),/canonical/);
  const replay=path.join(temp,'v2-replay');fs.mkdirSync(replay);verifyUnstarted(replay);
  for(const marker of ['admission-started.json','scheduling-paused.json','runs/01-invoice-discount-direct/started.json']) {
    const file=path.join(replay,marker);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'{}');
    assert.throws(()=>verifyUnstarted(replay),/never be retried/);fs.rmSync(file);
  }
  fs.rmSync(path.join(replay,'runs'),{recursive:true});verifyUnstarted(replay);
  const runtimeDirectory=path.join(temp,'runtime');fs.mkdirSync(runtimeDirectory);
  const runtimeFile=path.join(runtimeDirectory,'installed-runtime');fs.writeFileSync(runtimeFile,'frozen runtime bytes');
  const runtimeFreeze={...admitted,runtimeManifests:{[runtimeDirectory]:manifest(runtimeDirectory)}};
  verifyRealAdmission(realBatch,runtimeFreeze,seal,digest,testImage);
  fs.writeFileSync(runtimeFile,'changed runtime bytes');
  assert.throws(()=>verifyRealAdmission(realBatch,runtimeFreeze,seal,digest,testImage),/Runtime\/dependencies\/input changed/);
  // Exercise the actual scheduler guard with work frames, before any auth/transport.
  for(const body of [{model:'gpt-5.6-luna',reasoning:{effort:'none'}},{model:'other-model',reasoning:{effort:'high'}}]) {
    const root=path.join(temp,'work-boundary-'+body.model+'-'+body.reasoning.effort);fs.mkdirSync(root);
    const task=tasks[0],attempt={slot:1,task:task.id,arm:'direct',source:task.source};
    fs.writeFileSync(path.join(root,'freeze.json'),JSON.stringify({...f,experimentKind:'fixture',model:'openai/gpt-5.6-luna',attempts:[attempt],inputManifests:{[task.id+'-direct']:manifest(task.source)}}));
    let auth=0,calls=0;
    const outcome=await runComparison({root,fetchImpl:()=>{calls++;throw Error('No provider');},readAuth:()=>{auth++;throw Error('No credentials');},readInput:async()=>({manifest:manifest(task.source),receipt:{fixture:true}}),startContainer:async({output,onRequest})=>{
      fs.mkdirSync(output);return {name:'work-boundary',output,onRequest,setTaskBudget(){},exec(argv){return {status:0,stdout:argv[0]==='/opt/opencode'?'1.18.26':argv[2]?.includes('DatabaseSync')?'{"sessions":[],"messages":[],"tools":[]}':''};},close(){return 0;}};
    },runTaskImplementation:async session=>{await session.onRequest({path:'/v1/responses',body:{...body,stream:true,tools:[{name:'bash'}]}},()=>{},new AbortController().signal);return {exitCode:0};},stopWorkload:()=>({terminationVerified:true}),captureCandidate:()=>({status:0})});
    assert.equal(outcome.pause?.kind,'boundary_refusal');assert.equal(auth,0);assert.equal(calls,0);
  }
  const rows=tasks.flatMap((t,i)=>[{task:t.id,arm:'direct',R:i<2,Q:i<2,evaluationProven:true},{task:t.id,arm:'D',R:i===0||i===2,Q:i===0||i===2,evaluationProven:true}]);
  const paired=summarize(rows);assert.equal(paired.candidateWins,1);assert.equal(paired.candidateLosses,1);assert.equal(paired.ties,6);assert.equal(paired.deltaQPercentagePoints,0);
  assert.equal(summarize(rows.slice(1)).deltaQPercentagePoints,null);
  assert.equal(summarize([...rows,rows[0]]).pairs[0].result,'unknown');
  const partial=path.join(temp,'partial');fs.mkdirSync(path.join(partial,'runs',tasks[0].id+'-direct'),{recursive:true});
  fs.writeFileSync(path.join(partial,'freeze.json'),JSON.stringify({experimentKind:'fixture',attempts:[schedule[0]]}));
  fs.writeFileSync(path.join(partial,'runs',tasks[0].id+'-direct','provider-metadata.json'),JSON.stringify([{forwarded:true,usage:{input_tokens:10,output_tokens:5,cached_tokens:0,reasoning_tokens:0}},{forwarded:true}]));
  const incomplete=(await report(partial,{evaluate:false})).rows[0];
  assert.equal(incomplete.requests,2);assert.equal(incomplete.tokens.input_tokens,null);assert.equal(incomplete.knownTokens.input_tokens,10);assert.equal(incomplete.Q,null);
  // The completed campaign's manifest is historical evidence, not the current
  // runtime freeze. Preserve its exact bytes and all unchanged source entries;
  // only the product presentation/cleanup and live fixture checks may differ.
  const historicalFile=path.join(directory,'frozen-manifest.json');
  assert.equal(hashFile(historicalFile).sha256,'b458d3d4f0efd49dcf71c31ee98e21b7e88deeed352ceaef14078ba9bcb9f3c3');
  const historical=JSON.parse(fs.readFileSync(historicalFile)),comparison=frozenManifest();
  for(const [section,file] of [['product','lib/native-task-plugin.mjs'],['product','lib/native-task-workflow.mjs'],['files','evaluation/feedback-development/verify.mjs'],['files','evaluation/feedback-development/prepare.mjs'],['files','evaluation/feedback-development/verify-title.mjs']]) {
    // A retained hash must still be rejected for admission against current
    // source bytes; the compatibility check below never changes that boundary.
    if(plan[section][file].sha256!==historical[section][file].sha256)
      assert.throws(()=>verifyRealAdmission(realBatch,{...admitted,files:{...admitted.files,[path.join(repository,file)]:historical[section][file].sha256}},seal,digest,testImage),/Unfrozen adapter\/product file/);
    comparison[section][file].sha256=historical[section][file].sha256;
  }
  assert.deepEqual(comparison,historical);
  await verifyReport(path.join(temp,'report-regressions'));
  await verifyAuth(path.join(temp,'auth-regressions'));
  verifyPreparation(path.join(temp,'preparation-regressions'));
  await preflight(path.join(temp,'preflight'));
  await verifyCalibration(path.join(temp,'calibration'));
  console.log('PASS feedback development allocation, explicit configuration, model admission and controls');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
