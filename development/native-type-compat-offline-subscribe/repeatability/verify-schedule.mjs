// Pure validation of the only scheduler change; no container or provider request.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const text=fs.readFileSync('development/native-task-ab/run-comparison.mjs','utf8'),start=text.indexOf('function verify(){'),end=text.indexOf('\n\nverify();',start),code=text.slice(start,end)+'\nverify();';
const original=JSON.parse(fs.readFileSync('local/native-type-compat-offline-subscribe/repeatability/freeze.json'));
const base={...original,files:{},runtimeManifests:{}};
const check=f=>vm.runInNewContext(code,{f,amendment:null,repeatedContinuation:false});
check(base);
const pair={...base,repeatability:undefined,attempts:[{slot:1,task:'A',arm:'OFF'},{slot:2,task:'A',arm:'ON'}]};check(pair);
for(const mutate of [f=>f.attempts.pop(),f=>f.attempts.push({...f.attempts[0],slot:5}),f=>f.attempts.reverse(),f=>f.attempts[0].arm='OFF',f=>f.attempts[0].repetition=2,f=>f.budgetMs++,f=>f.variant='low',f=>f.model='other',f=>f.runtimeSha='other',f=>f.repeatability=false]){const f=structuredClone(base);mutate(f);assert.throws(()=>check(f));}
console.log('Four-slot validation accepts exact order only; prior pair preserved; ten invalid configurations rejected; zero provider requests.');
