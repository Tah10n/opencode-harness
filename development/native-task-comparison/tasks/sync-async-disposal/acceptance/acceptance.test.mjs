import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const {withResources}=await import(path.join(process.env.PILOT_SOURCE,'src/resources.mjs'));
async function rejectsExactly(promise,expected){let caught=false,actual;try{await promise;}catch(error){caught=true;actual=error;}assert.equal(caught,true);assert.equal(actual,expected);}
test('mixed disposal priority receiver and LIFO',async()=>{
 const log=[],value={ok:1};
 const a={dispose(){assert.equal(this,a);log.push('legacy');}};
 const b={[Symbol.dispose](){assert.equal(this,b);log.push('sync');},dispose(){assert.fail('lower priority');}};
 const c={[Symbol.asyncDispose]:async function(){assert.equal(this,c);assert.equal(arguments.length,0);log.push('async');},[Symbol.dispose](){assert.fail('lower priority');}};
 assert.equal(await withResources(Object.freeze([a,null,b,undefined,c]),()=>{log.push('body');return value;}),value);assert.deepEqual(log,['body','async','sync','legacy']);
});
test('cleanup awaited serially after asynchronous body',async()=>{
 let release,entered;const waiting=new Promise(r=>{entered=r;}),log=[];
 const a={dispose(){log.push('a');}},b={[Symbol.asyncDispose](){log.push('b-start');entered();return new Promise(r=>{release=()=>{log.push('b-end');r();};});}};
 const result=withResources([a,b],async()=>{await Promise.resolve();log.push('body');return 7;});
 await waiting;assert.deepEqual(log,['body','b-start']);release();assert.equal(await result,7);assert.deepEqual(log,['body','b-start','b-end','a']);
});
test('body failure wins but every cleanup still runs',async()=>{
 const bodyError=undefined,cleanupError={why:'cleanup'},log=[];
 const a={dispose(){log.push('a');throw cleanupError;}},b={dispose(){log.push('b');throw 0;}};
 await rejectsExactly(withResources([a,b],()=>{throw bodyError;}),bodyError);assert.deepEqual(log,['b','a']);
});
test('first cleanup failure in LIFO order wins after success',async()=>{
 const first=0,second={why:'later'},log=[];
 const a={dispose(){log.push('a');throw second;}},b={[Symbol.asyncDispose](){log.push('b');return Promise.reject(first);}};
 await rejectsExactly(withResources([a,b],()=>9),first);assert.deepEqual(log,['b','a']);
});
test('occurrences disposed separately, no resources and thenable legacy cleanup',async()=>{
 let count=0;const r={dispose(){count++;return {then(resolve){resolve();}};}};
 assert.equal(await withResources([r,r],()=>undefined),undefined);assert.equal(count,2);
 assert.equal(await withResources([],()=>3),3);assert.equal(await withResources([null,undefined],()=>4),4);
});

test('body invoked with no arguments',async()=>{
 let calls=0;assert.equal(await withResources([],function(){assert.equal(arguments.length,0);calls++;return 8;}),8);assert.equal(calls,1);
});
