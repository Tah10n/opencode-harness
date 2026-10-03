import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {tasks,schedule,config,frozenManifest,directory} from './suite.mjs';
import {verifyFrozenSchedule} from '../support/scheduler.mjs';
import {preflight} from './preflight.mjs';
import {providerConfig,prepare} from './prepare.mjs';
import {summarize,report} from './report.mjs';
import {runPrepared} from './run.mjs';
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
