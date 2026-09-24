// No native launches or provider requests. Verify the narrow amendment and saved stop.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {checkFixtureInput} from './fixture-input.mjs';import {budget,nextAllowed,get,hash} from './chain.mjs';
await import('./verify-code.mjs');
const source=fs.readFileSync('development/native-task-integrated/container-session.mjs','utf8');
const begin=source.indexOf('setTaskBudget(milliseconds){'),end=source.indexOf('}};',begin);assert.ok(begin>0&&end>begin);
const sent=[];const set=new Function('send','return ({'+source.slice(begin,end+1)+'}).setTaskBudget')(frame=>sent.push(frame));
for(const ms of [1,1800000,3150000,3600000])set(ms);
for(const ms of [0,-1,3600001,Infinity,NaN,'3150000'])assert.throws(()=>set(ms),/Invalid relay task budget/);
assert.deepEqual(sent.map(x=>x.milliseconds),[1,1800000,3150000,3600000]);
assert.equal(budget('A',100,3600100),1800100);assert.equal(budget('R',100,3600100),600100);assert.equal(budget('F',100,3600100),3600100);
assert.equal(budget('A',100,900),900);assert.equal(budget('F',100,900),900);
const good={pause:null,result:{nativeCompleted:true},stop:{terminationVerified:true,captureSaved:true,relayRemoved:true,forwardingClosed:true,activeProviderHandlers:0},recordings:[],now:1,deadline:2};assert.ok(nextAllowed(good));
for(const override of [{pause:{kind:'unknown_submission'}},{result:{nativeCompleted:true,stopReason:{kind:'cancelled'}}},{stop:{...good.stop,captureSaved:false}},{stop:{...good.stop,activeProviderHandlers:1}},{now:2},{recordings:[{forwarded:true,recording:{evidenceComplete:false}}]}])assert.equal(nextAllowed({...good,...override}),false);
const root='local/ledger-review-delivery/preflight',out=root+'/A/runs/account-switch-ledger-A';
const task=fs.readFileSync(root+'/A/input/TASK.md','utf8');
for(const [index,role]of [[1,'title'],[2,'parent']]){const body=get(out+'/upstream-request-'+index+'.json');assert.equal(checkFixtureInput('A',body,task,''),role);assert.equal(JSON.stringify(body).includes(task),false);}
const author={tools:[{name:'read'}],input:[{text:'Implement the complete original task\n'+task}]};assert.equal(checkFixtureInput('A',author,task,''),'author');assert.throws(()=>checkFixtureInput('A',{...author,input:[{text:'Implement the complete original task'}]},task,''));
const review='Untrusted fixture reviewer text';assert.equal(checkFixtureInput('F',{...author,input:[{text:'Implement the complete original task\n'+task+'\n'+review}]},task,review),'author');assert.throws(()=>checkFixtureInput('F',author,task,review));
const stopped=get(root+'/chain-result.json');assert.equal(stopped.pause.kind,'unknown_submission');assert.equal(stopped.results.length,1);assert.equal(stopped.stages.R,'not_started');assert.equal(stopped.stages.F,'not_started');assert.ok(!fs.existsSync(root+'/R'));assert.ok(!fs.existsSync(root+'/F'));
const captured=get(out+'/evidence-capture.json');assert.equal(captured.status,0);assert.equal(get(out+'/session/cleanup.json').status,0);
const native=get(out+'/native-evidence.json');assert.equal(native.tools.length,0);assert.ok(!native.sessions.some(s=>s.parent_id));
const result={passed:true,scope:'model-free amendment and original failed-attempt replay',hostCeilingAccepts3150000And3600000:true,outOfBoundsRejected:true,stageAndGlobalBudgetArithmetic:true,transitionStops:true,recordedParentAndTitleReplay:true,missingAuthorTaskRejected:true,missingFinalReviewRejected:true,nativeAuthorStarts:0,realProviderRequests:0,originalPreflight:'FAILED; original session never resumed',reviewerInventory:'NOT RUN',patchApplication:'NOT RUN',unknownSyntheticResponsePreserved:true,collectorCaptureComplete:true,deliveryAssertionFailed:true};
fs.writeFileSync('development/ledger-review-delivery/amendment-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
