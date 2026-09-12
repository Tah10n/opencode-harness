import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const root=process.env.PILOT_SOURCE;const {planChannels}=await import(path.join(root,'src/channels.mjs'));const {createNotifier}=await import(path.join(root,'src/notifier.mjs'));
test('pure ordered routing and unknown fallback deduplication',()=>{
 const requested=Object.freeze(['email','missing','sms','email','other','log']),available=Object.freeze(['email','sms','log']);assert.deepEqual(planChannels(requested,available),['email','log','sms']);assert.deepEqual(planChannels([],[]),[]);assert.deepEqual(planChannels(['unknown'],['safe'],'safe'),['safe']);assert.throws(()=>planChannels(['email','bad'],['email']),{name:'RangeError',message:'unknown channel: bad'});
 assert.deepEqual(planChannels(['__proto__','constructor'],['__proto__','constructor']),['__proto__','constructor']);
});
test('snapshot injected handlers, serial order and payload/results identity',async()=>{
 const seen=[],message=Object.freeze({text:'hello'}),response={delivered:true};let release;const gate=new Promise(r=>release=r);const handlers={email:async function(value){assert.equal(this,undefined);assert.equal(value,message);seen.push('email');await gate;return response;},log(value){assert.equal(value,message);seen.push('log');return 0;}};
 const notify=createNotifier(handlers);handlers.email=()=>assert.fail('replacement must not run');const pending=notify(message,['email','missing','log']);assert.deepEqual(seen,['email']);await Promise.resolve();assert.deepEqual(seen,['email']);release();const result=await pending;assert.deepEqual(result,[{channel:'email',result:response},{channel:'log',result:0}]);assert.equal(result[0].result,response);assert.deepEqual(seen,['email','log']);
});
test('plan before dispatch, inherited handlers ignored and no error failover',async()=>{
 let calls=0;const notify=createNotifier(Object.assign(Object.create({inherited:()=>assert.fail('inherited')}),{email:()=>calls++}));await assert.rejects(notify({},['email','inherited']),{name:'RangeError',message:'unknown channel: inherited'});assert.equal(calls,0);
 const failure={offline:true},seen=[];const fail=createNotifier({email(){seen.push('email');throw failure;},log(){seen.push('log');}});await assert.rejects(fail({},['email','log']),e=>e===failure);assert.deepEqual(seen,['email']);assert.deepEqual(await fail({},[]),[]);assert.throws(()=>createNotifier({log:2}),TypeError);
});
