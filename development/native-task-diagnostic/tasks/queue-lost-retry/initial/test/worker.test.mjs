import {test} from 'node:test';import assert from 'node:assert/strict';
import {queue} from '../src/queue.mjs';import {work} from '../src/worker.mjs';
test('success, retry and idle',()=>{
 const q=queue([{id:'a',payload:1}]);
 assert.deepEqual(work(q,()=>true),{sent:['a'],retried:[]});
 assert.deepEqual(q.snapshot(),{ready:[],leased:[]});
 const expected=q.snapshot().ready.map(x=>x.id);
 assert.deepEqual(work(q,job=>!expected.includes(job.id)).retried,expected);
 assert.deepEqual(q.snapshot().ready.map(x=>x.id),expected);
 assert.deepEqual(work(q,()=>true),{sent:[],retried:[]});
});
