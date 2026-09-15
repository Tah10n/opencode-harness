import {test} from 'node:test';import assert from 'node:assert/strict';
import {createSummary,summarize} from '../src/summary.mjs';
test('empty and known aggregate results',()=>{
 assert.deepEqual(summarize([]),{count:0,sum:0,min:null,max:null,mean:null});
 assert.deepEqual(summarize([2,-1,2]),{count:3,sum:3,min:-1,max:2,mean:1});
 assert.deepEqual(summarize([1000000000,-1000000000,3]),{count:3,sum:3,min:-1000000000,max:1000000000,mean:1});
});
test('incremental snapshots detached and input sequence not replayed',()=>{
 const state=createSummary();assert.equal(state.add(4),undefined);const snapshot=state.snapshot();assert.deepEqual(snapshot,{count:1,sum:4,min:4,max:4,mean:4});
 snapshot.sum=999;state.add(-2);assert.deepEqual(state.snapshot(),{count:2,sum:2,min:-2,max:4,mean:1});
 let acquisitions=0,reads=0;const values={[Symbol.iterator](){acquisitions++;if(acquisitions>1)throw new Error('replayed');let n=0;return {next(){reads++;return n<3?{value:++n,done:false}:{done:true};}};}};
 assert.deepEqual(summarize(values),{count:3,sum:6,min:1,max:3,mean:2});assert.equal(acquisitions,1);assert.equal(reads,4);
});
test('invalid values leave accumulator unchanged',()=>{
 const state=createSummary();state.add(5);const before=state.snapshot();
 for(const value of [1.5,NaN,Infinity,-Infinity,1000000001,-1000000001,'3',null,undefined]){assert.throws(()=>state.add(value),RangeError);assert.deepEqual(state.snapshot(),before);}
 state.add(-5);assert.equal(state.snapshot().sum,0);
});
test('count boundary and exact integer sum',()=>{
 const state=createSummary();for(let i=0;i<100000;i++)state.add(1000000000);
 assert.deepEqual(state.snapshot(),{count:100000,sum:100000000000000,min:1000000000,max:1000000000,mean:1000000000});
 const before=state.snapshot();assert.throws(()=>state.add(0),RangeError);assert.deepEqual(state.snapshot(),before);
});
test('signed-zero extrema and source errors preserve semantics',()=>{
 const single=summarize([-0]);assert.equal(Object.is(single.min,-0),true);assert.equal(Object.is(single.max,-0),true);assert.equal(Object.is(single.sum,0),true);assert.equal(Object.is(single.mean,0),true);
 const mixed=summarize([0,-0]);assert.equal(Object.is(mixed.min,-0),true);assert.equal(Object.is(mixed.max,0),true);
 const failure={why:'source'};function* broken(){yield 1;throw failure;}assert.throws(()=>summarize(broken()),e=>e===failure);
 const input=Object.freeze([1,2]);assert.deepEqual(summarize(input),{count:2,sum:3,min:1,max:2,mean:1.5});assert.deepEqual(input,[1,2]);
});

test('first invalid value stops before later source activity',()=>{
 let later=false;function* values(){yield 1;yield 1.5;later=true;throw new Error('later');}
 assert.throws(()=>summarize(values()),RangeError);assert.equal(later,false);
});
