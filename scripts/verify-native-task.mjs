import assert from 'node:assert/strict';
import { finalChecks, productionDiff, reproducedFailure, validateOutput, reviewSchema } from '../lib/native-task-workflow.mjs';
const check={tool:'bash',state:'completed',exit:0,before:'S',after:'S',callID:'check'};
assert.equal(finalChecks([check,{before:'S',after:'T'},{before:'T',after:'S'}],{snapshotSha256:'S'}).length,0,'restoring bytes does not restore old verification');
assert.equal(finalChecks([{before:'S',after:'T'}, {...check,before:'T',after:'T'}],{snapshotSha256:'T'}).length,1);
for(const event of [{tool:'bash',state:'completed',exit:127,output:'command not found'},{tool:'bash',state:'completed',exit:1,output:'Error: Cannot find module test.mjs'},{tool:'bash',state:'completed',exit:1,output:'SyntaxError: not ok'}]) assert.equal(reproducedFailure(event),false);
assert.equal(reproducedFailure({tool:'bash',state:'completed',exit:1,output:'not ok 1 - public behavior\nAssertionError: expected 2 actual 1'}),true);
const source='diff --git a/src/a.mjs b/src/a.mjs\n-source\n+changed\n';
const test='diff --git a/test/a.test.mjs b/test/a.test.mjs\n-old test\n+new test\n';
assert.equal(productionDiff({diff:source+test},['test/a.test.mjs']),source);
assert.throws(()=>productionDiff({diff:source},['src/a.mjs']));
assert.throws(()=>productionDiff({diff:source},['../private/test/a.test.mjs']));
assert.throws(()=>validateOutput({findings:[]},reviewSchema));
assert.throws(()=>validateOutput({findings:[],obligations:[{requirement:'x',status:'safe',evidence:'yes'}],unverified:[],coverageLost:[],checks:[],verificationFiles:[]},reviewSchema));
console.log(JSON.stringify({passed:true,checks:['verification after final mutation, including reverted bytes','environment failure is not reproduction','production immutable during probe','restricted verification paths','malformed report cannot complete'],providerRequests:0}));

// Exact retained reviewer text is a development regression input, not a new
// evaluation or rewritten historical result.
const {runWorkflow, formatSource, conserveFormat, determineOutcome} = await import('../lib/native-task-workflow.mjs');
const fs = await import('node:fs');
const result = value => ({info:{finish:'stop'},parts:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value)}]});
const valid = {findings:[],obligations:[{requirement:'Keep public behavior',status:'delivered',evidence:'actual check'}],unverified:[],evidenceLimitations:[],coverageLost:[],checks:[{callID:'check',purpose:'preservation',basis:'public check'}],proposedVerificationFiles:[]};
function fake() {
 const saved=new Map(), calls=[];let cancelled=false;
 return {saved,calls,cancel:()=>cancelled=true,capture:()=>({status:'captured',snapshotSha256:'S',diff:'',task:'Keep public behavior'}),save:(n,v)=>saved.set(n,v),checkActive:()=>{if(cancelled)throw Error('cancelled');},aborted:()=>cancelled,events:()=>[check],messages:async()=>[],verificationScope:()=>({allowed:[],rejected:[]}),prompt:async()=>{throw Error('Unexpected research/implementation');}};
}
for(const name of ['catalog-cache','dual-config','bookmark-migration','expense-export','lazy-pagination']) {
 const raw=fs.readFileSync(new URL(`./fixtures/native-task-review/${name}.txt`,import.meta.url),'utf8');
 const old=formatSource(raw);
 const converted={...old,findings:old.findings.map(f=>({id:f.id,classification:f.classification,kind:f.expected?'behavior':'test',basis:f.basis,affectedFiles:f.files,verification:f.reproduction??f.basis,...(f.expected?{expected:f.expected}:{})})),evidenceLimitations:[],proposedVerificationFiles:old.verificationFiles};delete converted.verificationFiles;
 const io=fake();io.format=async payload=>{io.calls.push(payload);assert.equal(payload.originalResponse,raw);return result(converted);};
 const report=await runWorkflow(io,{initialReview:result(raw),maxRepairs:0});
 assert.equal(io.calls.length,1,name);assert.deepEqual(report.review,converted,name);assert.equal(report.failure,undefined,name);
 assert.equal(io.saved.get('review-0-original.json').parts[0].text,raw);
}
for(const mode of ['missing','repeated','cancel']) {
 const io=fake();const raw=mode==='missing'?JSON.stringify({findings:[]}):JSON.stringify(valid).replace(/}$/,',}');
 io.format=async()=>{io.calls.push('format');if(mode==='cancel')io.cancel();return result(mode==='repeated'?'{broken':valid);};
 const report=await runWorkflow(io,{initialReview:result(raw)});
 assert.equal(io.calls.length,1);assert.notEqual(report.status,'reviewed_delivery');assert.equal(report.status,mode==='cancel'?'cancelled':'incomplete');
 assert.ok(!report.stages.some(s=>s.label.startsWith('repair')||s.label.startsWith('reproduce')));
}
assert.equal(determineOutcome({...valid,evidenceLimitations:['Reviewer did not run commands']},[check],{snapshotSha256:'S'}).status,'reviewed_delivery');
assert.equal(determineOutcome({...valid,unverified:['Consumer not verified']},[check],{snapshotSha256:'S'}).status,'incomplete');
assert.throws(()=>conserveFormat(JSON.stringify({...valid,findings:[{id:'F',classification:'concrete',basis:'uncertain'}]}),{...valid,findings:[{id:'F',classification:'concrete',kind:'behavior',basis:'uncertain',expected:'invented'}]},reviewSchema));
console.log(JSON.stringify({passed:true,retainedPilotResponses:5,formatRepairBound:1,missingMeaningFails:true,provenanceSeparated:true,realProviderRequests:0}));
