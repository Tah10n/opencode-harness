import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const {collect}=await import(path.join(process.env.PILOT_SOURCE,'src/collect.mjs'));
test('both source kinds and awaited mapping',async()=>{
 assert.deepEqual(await collect([Promise.resolve(2),3],{map:async(v,i)=>v*2+i}),[4,7]);
 async function* values(){yield 5;yield 7;}assert.deepEqual(await collect(values(),{map:(v,i)=>v+i}),[5,8]);
 assert.deepEqual(await collect([]),[]);
});
test('early stop awaits cleanup exactly once without excess next',async()=>{
 let next=0,closed=0,finished=false;
 const source={[Symbol.asyncIterator](){return {next:async()=>({value:++next,done:false}),return:async()=>{closed++;await Promise.resolve();finished=true;return {done:true};}};}};
 assert.deepEqual(await collect(source,{limit:2}),[1,2]);assert.equal(next,2);assert.equal(closed,1);assert.equal(finished,true);
 let syncClosed=0;function* sync(){try{yield 1;yield 2;}finally{syncClosed++;}}
 assert.deepEqual(await collect(sync(),{limit:1}),[1]);assert.equal(syncClosed,1);
});
test('source and mapper failures preserve identity and cleanup',async()=>{
 const failure=new Error('source');async function* source(){yield 1;throw failure;}
 await assert.rejects(collect(source()),e=>e===failure);
 const syncFailure=new Error('sync');function* broken(){throw syncFailure;}await assert.rejects(collect(broken()),e=>e===syncFailure);
 const mapperFailure=new Error('map');let closed=0;
 async function* values(){try{yield 1;yield 2;}finally{closed++;}}
 await assert.rejects(collect(values(),{map:async()=>{throw mapperFailure;}}),e=>e===mapperFailure);assert.equal(closed,1);
 const cleanupFailure=new Error('cleanup');const cleanup={[Symbol.asyncIterator](){return {next:async()=>({value:1,done:false}),return:async()=>{throw cleanupFailure;}};}};
 await assert.rejects(collect(cleanup,{limit:1}),e=>e===cleanupFailure);
});
test('zero and invalid limits do not acquire source',async()=>{
 let reads=0;const source={get [Symbol.iterator](){reads++;throw new Error('acquired');}};
 assert.deepEqual(await collect(source,{limit:0}),[]);
 for(const limit of [-1,1.2,NaN,-Infinity,Number.MAX_SAFE_INTEGER+1])await assert.rejects(collect(source,{limit}),RangeError);
 assert.equal(reads,0);
});
test('async protocol preferred and natural exhaustion does not return',async()=>{
 let returns=0,n=0;
 const source={[Symbol.iterator](){throw new Error('wrong protocol');},[Symbol.asyncIterator](){return {next:async()=>n++===0?{value:9,done:false}:{done:true},return:async()=>{returns++;return {done:true};}};}};
 assert.deepEqual(await collect(source),[9]);assert.equal(returns,0);
});

test('mapper failure wins over failing cleanup',async()=>{
 const body=new Error('body'),cleanup=new Error('cleanup');let closed=0;
 const source={[Symbol.asyncIterator](){return {next:async()=>({value:1,done:false}),return:async()=>{closed++;throw cleanup;}};}};
 await assert.rejects(collect(source,{map:()=>{throw body;}}),e=>e===body);assert.equal(closed,1);
});
