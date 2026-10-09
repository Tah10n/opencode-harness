// Pure controller validation only: no project code is executed on the host.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tasks,schedule} from './suite.mjs';
import {addObservation,probe,pinInputs,validateCorpus} from './probe.mjs';
const facts={reasons:[],correctionReasons:[],limits:[],checksCurrent:true};
const mismatch={status:'different',snapshotSha256:'current',differences:[{entrypoint:'src/index.mjs#example',id:'1'}],limits:[]};
assert.equal(addObservation(facts,mismatch,'current').correctionReasons.length,1);
assert.equal(addObservation(facts,mismatch,'later').correctionReasons.length,0);
for(const status of ['matched','unsupported','unproven'])assert.equal(addObservation(facts,{status,snapshotSha256:'current',differences:[],limits:['fixture']},'current').correctionReasons.length,0);
assert.deepEqual(facts,{reasons:[],correctionReasons:[],limits:[],checksCurrent:true});
assert.equal(tasks.length,6);assert.equal(schedule.length,12);
for(const t of tasks){validateCorpus(JSON.parse(fs.readFileSync(t.source+'/compat.json')));assert.ok(pinInputs(t.source).baselineSha256);}
assert.throws(()=>validateCorpus({revision:1,preserved:'x',excluded:'x',cases:[{id:'1',module:'../outside.mjs',export:'x',args:[]}]}));
if(!fs.existsSync('/.dockerenv'))assert.match(probe({baseline:tasks[0].source,candidate:tasks[0].source,pins:pinInputs(tasks[0].source),snapshotSha256:'host',remainingMs:()=>1000}).limits.join(),/host project execution refused/);
console.log('PASS compatibility controller, stale signal, fail-closed states and six-task allocation (no project execution)');
const {verifyFrozenSchedule}=await import('../support/scheduler.mjs');
const f={experimentKind:'compat-replay-development',model:'openai/gpt-5.6-luna',variant:'high',budgetMs:600000,strategy:'per-slot',streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,preflightPassed:true,files:{},attempts:schedule.map(a=>({...a,source:tasks.find(t=>t.id===a.task).source}))};
verifyFrozenSchedule(f,()=>{});
for(const invalid of [{...f,budgetMs:600001},{...f,model:'openai/other'},{...f,attempts:f.attempts.slice(1)},{...f,attempts:f.attempts.map((a,i)=>i===1?{...a,source:'/other'}:a)},{...f,attempts:f.attempts.map((a,i)=>i===0?{...a,arm:'candidate'}:a)}])assert.throws(()=>verifyFrozenSchedule(invalid,()=>{}));

const {summarizePairs}=await import('./report.mjs');
const delivered={task:tasks[0].id,arm:'control',status:'completed',evaluationProven:true,R:true,Q:true};
const interrupted={...delivered,arm:'candidate',status:'unknown',Q:false};
assert.equal(summarizePairs([delivered,interrupted])[0].result,'unknown','A captured interrupted patch is not a completed model pair');
assert.equal(summarizePairs([delivered,{...interrupted,status:'completed'}])[0].result,'loss','Completed proven failures remain measurable');
assert.equal(summarizePairs([delivered,{...interrupted,status:'completed',Q:true}])[0].result,'tie');
assert.equal(summarizePairs([delivered,{...interrupted,status:'completed',R:null}])[0].result,'unknown');

// Resolve the repository wrapper imports; installed scripted checks cover the bundle.
assert.equal(typeof (await import('./plugin.mjs')).default,'function');
