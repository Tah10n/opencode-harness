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
const {runWorkflow, formatSource, conserveFormat, determineOutcome, adaptReview} = await import('../lib/native-task-workflow.mjs');
const fs = await import('node:fs');
const result = value => ({info:{finish:'stop'},parts:[{type:'text',text:typeof value==='string'?value:JSON.stringify(value)}]});
const valid = {findings:[],obligations:[{requirement:'Keep public behavior',status:'delivered',evidence:'actual check'}],unverified:[],evidenceLimitations:[],coverageLost:[],checks:[{callID:'check',purpose:'preservation',basis:'public check'}],proposedVerificationFiles:[]};
function fake() {
 const saved=new Map(), calls=[];let cancelled=false;
 return {saved,calls,cancel:()=>cancelled=true,capture:()=>({status:'captured',snapshotSha256:'S',diff:'',task:'Keep public behavior'}),save:(n,v)=>saved.set(n,v),checkActive:()=>{if(cancelled)throw Error('cancelled');},aborted:()=>cancelled,events:()=>[check],messages:async()=>[],verificationScope:()=>({allowed:[],rejected:[]}),prompt:async()=>{throw Error('Unexpected research/implementation');}};
}
for(const name of ['catalog-cache','dual-config','bookmark-migration','expense-export','lazy-pagination']) {
 const raw=fs.readFileSync(new URL(`./fixtures/native-task-review/${name}.txt`,import.meta.url),'utf8');
 const old=formatSource(raw), before=JSON.stringify(old), io=fake();let scopeCalled=false, reproduction=false, formatCalls=0;
 io.format=async()=>{formatCalls++;throw Error('Forbidden format call for supported legacy');};
 io.verificationScope=paths=>{scopeCalled=true;assert.deepEqual(paths,old.verificationFiles);return{allowed:paths.filter(p=>p.startsWith('test/')),rejected:paths.filter(p=>!p.startsWith('test/'))};};
 io.prompt=async(role,prompt)=>{const payload=JSON.parse(prompt);assert.equal(role,'author');assert.ok(payload.instruction.startsWith('Investigate the concrete'));reproduction=true;assert.deepEqual(payload.review.unverified,old.unverified);throw Error('Reached reproduction boundary');};
 const report=await runWorkflow(io,{initialReview:result(raw),maxRepairs:1});
 const converted=io.saved.get('review-0-adapted.json');
 assert.equal(JSON.stringify(old),before);assert.deepEqual(adaptReview(converted),converted);
 assert.equal(converted.findings.length,old.findings.length);assert.deepEqual(converted.obligations,old.obligations);assert.deepEqual(converted.unverified,old.unverified);assert.deepEqual(converted.proposedVerificationFiles,old.verificationFiles);
 old.findings.forEach((f,i)=>{const c=converted.findings[i];for(const k of ['id','classification','basis','expected'])assert.deepEqual(c[k],f[k]);assert.deepEqual(c.affectedFiles,f.files);assert.equal(c.verification,f.reproduction);assert.equal(c.kind,'unresolved');});
 assert.equal(io.saved.get('review-0-original.json').parts[0].text,raw);
 assert.equal(scopeCalled,old.findings.some(f=>f.classification==='concrete')||old.obligations.some(o=>o.status==='missing')||old.coverageLost.length>0);
 assert.equal(formatCalls,0);assert.equal(reproduction,scopeCalled);assert.ok(!report.stages.some(s=>s.formatOnly));
 if(name==='bookmark-migration'){assert.deepEqual([converted.findings.length,converted.obligations.length,converted.unverified.length,converted.proposedVerificationFiles.length],[2,7,4,8]);assert.equal(reproduction,true);}
}
assert.strictEqual(adaptReview(valid),valid);
const legacyRaw=fs.readFileSync(new URL('./fixtures/native-task-review/bookmark-migration.txt',import.meta.url),'utf8'),legacy=JSON.parse(legacyRaw), adapted=adaptReview(legacy);
for(const conflict of [{...legacy,proposedVerificationFiles:[]},{...legacy,findings:[{...legacy.findings[0],affectedFiles:[]},legacy.findings[1]]},{...legacy,findings:[{...legacy.findings[0],verification:'different'},legacy.findings[1]]}]){
 const io=fake();io.format=async()=>{assert.fail('Conflict must not call format');};
 const report=await runWorkflow(io,{initialReview:result(conflict)});assert.match(report.failure.message,/Review compatibility conflict/);
}
for(const changed of [{...adapted,findings:adapted.findings.slice(1)},{...adapted,unverified:[]},{...adapted,proposedVerificationFiles:[]},{...adapted,findings:adapted.findings.map(f=>({...f,kind:'behavior'}))}])assert.throws(()=>conserveFormat(legacyRaw,changed,reviewSchema));
// Substantive resolution may establish kind, but unresolved findings cannot
// admit production repair without actual failing native evidence.
for(const mode of ['no-evidence','production-mutation','grounded-behavior']){
 const io=fake();let events=[check],mutated=false,repair=false;
 io.events=()=>events;io.format=async()=>{assert.fail('Legacy input must not call format');};
 io.capture=()=>({status:'captured',snapshotSha256:mutated?'T':'S',diff:mutated?source:'',task:'Keep public behavior'});
 io.verificationScope=()=>({allowed:['test/a.test.mjs'],rejected:legacy.verificationFiles});
 io.prompt=async(role,prompt)=>{const p=JSON.parse(prompt);if(p.instruction.startsWith('Investigate')){
  if(mode==='production-mutation')mutated=true;
  if(mode==='grounded-behavior')events.push({...check,callID:'failure',exit:1,output:'AssertionError: expected 2 actual 1'});
  return result({dispositions:[{id:'F-001',decision:'grounded',kind:'behavior',basis:'original requirement',expectedReason:'literal requirement',explanation:'investigated',evidenceCallID:'failure'}],limitations:[]});
 }if(p.instruction.startsWith('Repair ONLY')){repair=true;throw Error('Reached admitted repair');}return result(valid);};
 const report=await runWorkflow(io,{initialReview:result(legacyRaw),maxRepairs:1});assert.equal(repair,mode==='grounded-behavior');
 if(mode==='production-mutation')assert.match(report.failure.message,/Production changed before reproduction/);
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
console.log(JSON.stringify({passed:true,retainedPilotResponses:5,legacyFormatCalls:0,bookmarkReachesReproduction:true,formatRepairBound:1,missingMeaningFails:true,provenanceSeparated:true,realProviderRequests:0}));

const {probeSchema,prepareFormatSession}=await import('../lib/native-task-workflow.mjs');
const uncertain={...valid,unverified:['Consumer compatibility was not checked']};
assert.throws(()=>conserveFormat(JSON.stringify(uncertain),{...uncertain,unverified:[],evidenceLimitations:uncertain.unverified},reviewSchema));
const behaviorFinding={id:'F',classification:'concrete',kind:'behavior',basis:'public requirement',affectedFiles:['src/value.mjs'],verification:'project test',expected:'2'};
assert.throws(()=>conserveFormat(JSON.stringify({...valid,findings:[behaviorFinding]}),{...valid,findings:[{...behaviorFinding,kind:'test'}]},reviewSchema));
const dispositions={dispositions:[{id:'F',decision:'grounded',basis:'public',expectedReason:'literal requirement',explanation:'observed',kind:'behavior',evidenceCallID:'missing'}],limitations:['unverified consumer']};
for(const altered of [{...dispositions,limitations:[]},{...dispositions,dispositions:[{...dispositions.dispositions[0],evidenceCallID:'real-failed-call'}]},{...dispositions,dispositions:[{...dispositions.dispositions[0],kind:'test'}]}])assert.throws(()=>conserveFormat(JSON.stringify(dispositions),altered,probeSchema));
for(const boundary of ['create','tools']){
 let cancelled=false,modelRequests=0,registered=false,enter,release;
 const entered=new Promise(r=>enter=r),barrier=new Promise(r=>release=r);
 const checkActive=()=>{if(cancelled)throw Error('cancelled');};
 const pending=(async()=>{await prepareFormatSession({checkActive,create:async()=>{if(boundary==='create'){enter();await barrier;}return{id:'fixture'};},register:()=>registered=true,tools:async()=>{if(boundary==='tools'){enter();await barrier;}return[];}});checkActive();modelRequests++;})();
 await entered;cancelled=true;release();await assert.rejects(pending,/cancelled/);assert.equal(modelRequests,0);assert.equal(registered,true);
}
console.log(JSON.stringify({passed:true,formatCannotReclassifyUncertainty:true,admissionEvidenceConserved:true,cancellationBarriers:['session.create','tool.ids'],realProviderRequests:0}));

assert.equal(determineOutcome({...valid,checks:[...valid.checks,{callID:'failed',purpose:'discriminating',basis:'required regression'}]},[check,{...check,callID:'failed',exit:1}],{snapshotSha256:'S'}).status,'incomplete');

const unclearProbe={dispositions:[{id:'F',decision:'unverified',basis:'unclear requirement',explanation:'No expected result established'}],limitations:['Expected behavior unknown']};
assert.throws(()=>conserveFormat(JSON.stringify(unclearProbe),{...unclearProbe,dispositions:[{...unclearProbe.dispositions[0],decision:'grounded',kind:'behavior',expectedReason:'invented',evidenceCallID:'fiction'}]},probeSchema));
