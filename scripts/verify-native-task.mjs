import assert from 'node:assert/strict';
import { finalChecks, productionDiff, reproducedFailure, validateOutput, reviewSchema } from '../lib/native-task-workflow.mjs';
const check={tool:'bash',state:'completed',exit:0,before:'S',after:'S',callID:'check'};
assert.equal(finalChecks([check,{before:'S',after:'T'},{before:'T',after:'S'}],{snapshotSha256:'S'}).length,0,'restoring bytes does not restore old verification');
assert.equal(finalChecks([{before:'S',after:'T'}, {...check,before:'T',after:'T'}],{snapshotSha256:'T'}).length,1);
for(const event of [{tool:'bash',state:'completed',exit:127,output:'command not found'},{tool:'bash',state:'completed',exit:1,output:'Error: Cannot find module test.mjs'},{tool:'bash',state:'completed',exit:1,output:'SyntaxError: not ok'}]) assert.equal(reproducedFailure(event),false);
assert.equal(reproducedFailure({tool:'bash',state:'completed',exit:1,output:'not ok 1 - public behavior\nAssertionError: expected 2 actual 1'}),false);
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
  if(mode==='grounded-behavior')events.push({...check,callID:'failure',exit:1,nodeTest:{runner:'node:test',failed:true},output:'AssertionError: expected 2 actual 1'});
  return result({dispositions:[{id:'F-001',decision:'grounded',kind:'behavior',basis:'original requirement',expectedReason:'literal requirement',explanation:'investigated',evidenceCallID:'failure'},...['F-002','obligation-0'].map(id=>({id,decision:'unverified',basis:'remaining obligation',explanation:'not resolved'}))],limitations:[]});
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

const {assessDispositions}=await import('../lib/native-task-workflow.mjs');
const rawDisposition=fs.readFileSync(new URL('./fixtures/native-task-review/bookmark-reproduction.txt',import.meta.url),'utf8');
for(const mode of ['correct-once','omit-other','immediate','wrong-again','print-only','unknown','cancel','budget','permission']) {
 const io=fake();let events=[],state='S',repairs=0,corrections=0,reviews=0,stop=false;
 const originalCapture=io.capture;io.capture=()=>({...originalCapture(),snapshotSha256:state});io.events=()=>events;
 io.format=async()=>assert.fail('Unexpected format request');
 io.checkActive=()=>{if(stop)throw Error(mode==='budget'?'budget exhausted':'cancelled');};io.aborted=()=>stop;
 const failed=()=>{events.push({tool:'write',before:state,after:'T'});state='T';events.push({...check,before:state,after:state,callID:'actual-failure',exit:1,nodeTest:{runner:'node:test',failed:true},output:'AssertionError: expected 2 actual 1'});};
 const dispositions=()=>({dispositions:[{id:'F-001',decision:'grounded',kind:'behavior',basis:'original no data loss requirement',expectedReason:'input fields are data',explanation:'observed failing assertion',evidenceCallID:'actual-failure'},{id:'F-002',decision:'unverified',basis:'test delivery pending',explanation:'not addressed'},{id:'obligation-0',decision:'unverified',basis:'tests pending',explanation:'not addressed'}],limitations:[]});
 io.prompt=async(role,prompt)=>{
  const p=JSON.parse(prompt);
  if(p.instruction.startsWith('Investigate')){
   if(mode==='immediate'){failed();return result(dispositions());}
   events.push({...check,callID:'current-print',output:'{"sameBytes":true}'});
   if(mode==='permission')events.push({tool:'bash',state:'error',before:state,after:state,callID:'denied',output:'permission denied',permissionDenied:true});
   if(['cancel','budget'].includes(mode))stop=true;
   const d=JSON.parse(rawDisposition);if(mode==='unknown')d.dispositions[0]={...d.dispositions[0],decision:'unverified',expectedReason:''};
   if(mode==='print-only')d.dispositions.forEach(d=>d.evidenceCallID='current-print');return result(d);
  }
  if(p.instruction.startsWith('Correct reproduction evidence')){
   corrections++;assert.equal(role,'author');assert.equal(p.originalTask,'Keep public behavior');
   assert.ok(p.admissionDecisions.some(d=>d.reasons.includes(mode==='print-only'?'no_executed_failing_assertion':'evidence_not_in_current_stage')));
   assert.equal(p.currentEvents[0].callID,'current-print');
   if(mode==='wrong-again'||mode==='print-only')return result(rawDisposition);
   failed();const corrected=dispositions();if(mode==='omit-other')corrected.dispositions=corrected.dispositions.slice(0,1);return result(corrected);
  }
  if(p.instruction.startsWith('Repair ONLY')){repairs++;events.push({tool:'write',before:state,after:'U'});state='U';events.push({...check,before:state,after:state});return result('repaired');}
  reviews++;return result({...valid,checks:[{callID:'check',purpose:'discriminating',basis:'final assertion'},{callID:'check',purpose:'preservation',basis:'old tests'}]});
 };
 const report=await runWorkflow(io,{initialReview:result(legacyRaw),maxRepairs:1});
 assert.equal(repairs,['correct-once','immediate'].includes(mode)?1:0,mode);
 assert.equal(corrections,['correct-once','omit-other','wrong-again','print-only'].includes(mode)?1:0,mode);
 if(repairs)assert.equal(report.status,'reviewed_delivery',JSON.stringify(report));
 assert.ok(report.evidenceCorrections<=1);assert.equal(io.saved.get('D0.json').snapshotSha256,'S');
}
for(const [event,reason]of [[{...check,callID:'e',before:'OLD'},'evidence_wrong_file_state'],[{...check,callID:'e',state:'error'},'command_not_completed'],[{...check,callID:'e',exit:1,output:'ENOENT'},'environment_failure'],[{...check,callID:'e',output:'grounded expected AssertionError'},'no_executed_failing_assertion']]){
 const a=assessDispositions([behaviorFinding],[{id:'F',decision:'grounded',kind:'behavior',basis:'task',expectedReason:'task',evidenceCallID:'e'}],[event],{snapshotSha256:'S'});assert.ok(a[0].reasons.includes(reason));assert.equal(a[0].admitted,false);
}
console.log(JSON.stringify({passed:true,evidenceCorrectionLimit:1,replayRepairAndFinalChecks:true,currentEvidenceReasons:true,realProviderRequests:0}));

const {nativePermissionDenial}=await import('../lib/native-task-workflow.mjs');
for(const name of ['permissions.mjs','rejected-events.test.mjs','protected-fields.mjs']) {
 const output=`File not found: /repo/src/${name}`;
 assert.equal(nativePermissionDenial(output),false);
 const io=fake();let calls=0;const events=[{tool:'read',state:'error',callID:'missing',before:'S',after:'S',output}, {...check,callID:'failure',exit:1,nodeTest:{runner:'node:test',failed:true},output:'AssertionError: expected 2 actual 1'}];
 io.events=()=>events;io.format=async()=>assert.fail('No format');io.prompt=async(role,prompt)=>{const p=JSON.parse(prompt);if(p.instruction.startsWith('Investigate')){events.push({...events[0],callID:'missing-current'},{...events[1],callID:'failure-current'});return result({dispositions:[{id:'F',decision:'grounded',kind:'behavior',basis:'task',expectedReason:'literal task',explanation:'assertion',evidenceCallID:'failure-current'}],limitations:[]});}if(p.instruction.startsWith('Repair ONLY')){calls++;events.push(check);return result('done');}return result({...valid,checks:[...valid.checks,{callID:'check',purpose:'discriminating',basis:'final assertion'}]});};
 const report=await runWorkflow(io,{initialReview:result({...valid,findings:[behaviorFinding] }),maxRepairs:1});assert.equal(calls,1);assert.equal(report.evidenceCorrections,0);assert.equal(report.status,'reviewed_delivery');
}
assert.equal(nativePermissionDenial('The user rejected permission to use this specific tool call.'),true);
assert.equal(nativePermissionDenial('The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules [{"permission":"bash","pattern":"node *","action":"deny"}]'),true);
assert.equal(nativePermissionDenial('File not found: The user rejected permission to use this specific tool call.'),false);

// State continuity replay: original null endpoints are never rewritten.
const {stateTransition}=await import('../lib/native-task-workflow.mjs');
for(const name of ['transactional-settings','document-backup']){
 const retained=JSON.parse(fs.readFileSync(new URL(`./fixtures/native-task-state/${name}.json`,import.meta.url)));
 const original=JSON.stringify(retained);
 const current={snapshotSha256:retained.snapshotSha256};
 assert.equal(determineOutcome(retained.review,retained.events,current).status,'incomplete','Old logs alone cannot prove rejection provenance');
 // This augmentation simulates the independently tested current host path;
 // it is explicitly separate from immutable historical events.
 const replay=retained.events.map(e=>e.before===null&&e.state==='error'&&e.output==='Mutation/check tools must execute sequentially; source reads may run together'
   ? {...e,stateObservation:{basis:'host-rejected-before-execution',snapshot:e.after}} : e);
 assert.equal(determineOutcome(retained.review,replay,current).status,'reviewed_delivery');
 assert.equal(JSON.stringify(retained),original);
}
const rejected={callID:'blocked',tool:'bash',state:'error',before:null,after:'S',stateObservation:{basis:'host-rejected-before-execution',snapshot:'S'}};
for(const kind of ['behavior','test','documentation']){
 const e={...check,callID:'current',...(kind==='behavior'?{exit:1,nodeTest:{runner:'node:test',failed:true},output:'AssertionError: expected 2 actual 1'}:kind==='documentation'?{tool:'read',output:'Required docs'}:{})};
 const f={...behaviorFinding,kind},d={id:'F',kind,decision:'grounded',basis:'Original task',expectedReason:'Original task',evidenceCallID:e.callID};
 for(const [tail,ok]of [[[rejected],true],[[{...rejected,stateObservation:undefined}],false],[[{...rejected,stateObservation:{basis:'model-says-unchanged',snapshot:'S'}}],false],[[{...rejected,after:'T'}],false],[[{before:'S',after:'T'},{before:'T',after:'S'}],false],[[{before:'S',after:'T'}],false],[[{...rejected,permissionDenied:true}],false],[[{...rejected,scopeViolation:true}],false],[[{...rejected,cancelled:true}],false]]){
  const events=[e,...tail];assert.equal(assessDispositions([f],[d],events,{snapshotSha256:'S'})[0].admitted,ok,kind+JSON.stringify(tail));
  const report={...valid,checks:[{callID:e.callID,purpose:kind==='documentation'?'documentation':'preservation',basis:'Task check'}]};
  if(kind!=='behavior')assert.equal(determineOutcome(report,events,{snapshotSha256:'S'}).status,ok?'reviewed_delivery':'incomplete');
 }
 assert.equal(assessDispositions([f],[{...d,evidenceCallID:'blocked'}],[e,rejected],{snapshotSha256:'S'})[0].admitted,false,'Error cannot itself be evidence');
}
assert.equal(stateTransition(rejected),'unchanged');assert.equal(stateTransition({...rejected,stateObservation:undefined}),'unknown');assert.equal(stateTransition({before:'S',after:'T'}),'changed');
assert.equal(assessDispositions([behaviorFinding],[{id:'F',kind:'behavior',decision:'grounded',basis:'Task',expectedReason:'Task',evidenceCallID:'print'}],[{...check,callID:'print',output:'2'},rejected],{snapshotSha256:'S'})[0].admitted,false);
console.log(JSON.stringify({stateContinuityReplay:true,retainedHistoricalForms:2,realProviderRequests:0}));

// Real Node child processes: output is collected from the runner, never a
// hand-labelled failure. Synthetic journal tests above cover the state machine.
{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
 const {spawnSync}=await import('node:child_process');
 const {observeNodeTest,assessDispositions}=await import('../lib/native-task-workflow.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'node-failure-evidence-'));
 try{
  fs.mkdirSync(path.join(dir,'test'));fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({scripts:{test:'node --test test/*.test.mjs'}}));
  const run=(source,test,command='npm test')=>{
   fs.writeFileSync(path.join(dir,'service.mjs'),source);
   fs.writeFileSync(path.join(dir,'test','behavior.test.mjs'),"import {test,it,describe} from 'node:test'; import assert from 'node:assert/strict'; import {lookup} from '../service.mjs';\n"+test);
   const r=spawnSync('bash',['-c',command],{cwd:dir,encoding:'utf8'});
   const e={tool:'bash',state:'completed',exit:r.status,args:{command,workdir:dir},output:r.stdout+r.stderr,callID:'now',before:'S',after:'S'};
   e.nodeTest=observeNodeTest(e,dir);return e;
  };
  const positive=[['export const lookup=()=>{throw Object.assign(Error("domain operation failed"),{code:"ENOENT"});};',"test('contract',()=>assert.equal(lookup(),2));"],['export const lookup=()=>1;',"test('contract',()=>assert.equal(lookup(),2));"],['export const lookup=()=>null.value;',"test('contract',()=>assert.equal(lookup(),2));"],['export const lookup=async()=>{throw Error("rejected");};',"test('contract',async()=>assert.equal(await lookup(),2));"]];
  for(const named of [false,true])for(const nested of [false,true])for(const defect of ['assertion','exception','rejection']){
   const source=defect==='assertion'?'export const lookup=()=>1;':defect==='exception'?'export const lookup=()=>null.value;':'export const lookup=async()=>{await Promise.resolve();throw Error("rejected");};';
   const async=defect==='rejection';
   const callback=`${async?'async ':''}${named?'function namedContract()':'() =>'} { assert.equal(${async?'await ':''}lookup(),2); }`;
   const test=nested?`describe('group',()=>{it('contract',${callback});});`:`test('contract',${callback});`;
   for(const reporter of ['tap','spec']){
    const command=`node --test --test-reporter=${reporter} test/behavior.test.mjs`;
    const event=run(source,test,command);assert.equal(reproducedFailure(event),true,JSON.stringify({named,nested,defect,reporter,event}));
    assert.equal(event.nodeTest.failure,defect==='assertion'?'assertion':'product-exception');
    assert.equal(event.nodeTest.origin,defect==='assertion'?'test/behavior.test.mjs':'service.mjs');
    const fixed=run('export const lookup=()=>2;',test,command);assert.equal(fixed.exit,0);assert.equal(reproducedFailure(fixed),false);
   }
  }
  for(const reporter of ['tap','spec']){
   const command=`node --test --test-reporter=${reporter} test/behavior.test.mjs`;
   // Different failures in separate results: a hook's assertion/source stack
   // must not validate the unrelated artificial throw, in either order.
   const hook=`describe('setup',()=>{before(()=>assert.equal(lookup(),99));it('never reached',()=>{});});`;
   const artificial=`it('artificial',function unrelated(){throw Error('not behavior');});`;
   for(const suite of [hook+artificial,artificial+hook]){
    const event=run('export const lookup=()=>2;',`import {before} from 'node:test';describe('mixed',()=>{it('passing',()=>assert.equal(2,2));${suite}});`,command);
    assert.equal(event.exit,1);assert.equal(reproducedFailure(event),false,JSON.stringify(event));
   }
   const mixed=run('export const lookup=()=>null.value;',`describe('mixed',()=>{it('passing',()=>assert.equal(2,2));it('artificial',()=>{throw Error('not behavior');});it('real defect',function checkProduct(){lookup();});});`,command);
   assert.equal(reproducedFailure(mixed),true,JSON.stringify(mixed));assert.equal(mixed.nodeTest.origin,'service.mjs');
  }
  for(const [source,test]of positive)for(const command of ['npm test','node --test --test-reporter=tap test/behavior.test.mjs']){
   const event=run(source,test,command);assert.equal(reproducedFailure(event),true,JSON.stringify(event));
   const d={id:'F',decision:'grounded',kind:'behavior',basis:'Public contract requires lookup to return 2',expectedReason:'Original requirement',evidenceCallID:'now'};
   assert.equal(assessDispositions([{id:'F',kind:'behavior'}],[d],[event],{snapshotSha256:'S'})[0].admitted,true);
   for(const changed of [{...d,decision:'unverified'},{...d,basis:''},{...d,evidenceCallID:'historical'}])assert.equal(assessDispositions([{id:'F',kind:'behavior'}],[changed],[event],{snapshotSha256:'S'})[0].admitted,false);
   for(const changed of [{...event,after:'OLD'},{...event,permissionDenied:true},{...event,state:'error'}])assert.equal(assessDispositions([{id:'F',kind:'behavior'}],[d],[changed],{snapshotSha256:'S'})[0].admitted,false);
   assert.equal(reproducedFailure(run('export const lookup=()=>2;',test,command)),false);
  }
  for(const [source,test]of [
   ['export const lookup=()=>{throw TypeError("documented");};',"test('contract',()=>assert.throws(lookup,TypeError));"],
   ['export const lookup=async()=>{throw Error("documented");};',"test('contract',async()=>assert.rejects(lookup));"],
   ['export const lookup=()=>2;',"test('bad test',()=>{throw TypeError('artificial');});"],
   ['export const lookup=()=>2;',"test('bad test',()=>{throw Error('ERR_ASSERTION');});"],
   ['export const lookup=()=>2;',"throw Error('setup'); test('contract',()=>lookup());"],
   ['export const lookup=()=>{throw Error("bad setup");};',"import {beforeEach} from 'node:test';beforeEach(()=>lookup());test('contract',()=>assert.equal(1,1));"],
   ['export const lookup=async()=>{await Promise.resolve();throw Error("async setup");};',"import {beforeEach} from 'node:test';beforeEach(async function namedSetup(){await lookup();});test('contract',()=>assert.equal(1,1));"],
   ["import 'missing-dependency';export const lookup=()=>2;","test('contract',()=>lookup());"]
  ] )for(const reporter of ['tap','spec']){const e=run(source,test,`node --test --test-reporter=${reporter} test/behavior.test.mjs`);assert.equal(reproducedFailure(e),false,JSON.stringify(e));}
  for(const command of ["node -e \"console.log('TypeError AssertionError FAIL not ok')\"","node -e \"console.log('AssertionError');process.exit(1)\"",'missing-native-executable'])assert.equal(reproducedFailure(run('export const lookup=()=>2;',"test('ok',()=>lookup());",command)),false);
  console.log(JSON.stringify({realNodeTestFailures:true,callbackReporterCases:24,mixedResultBoundaries:true,assertion:true,productException:true,rejectedPromise:true,setupAndUnsupportedEvidenceRejected:true,realProviderCalls:0}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
