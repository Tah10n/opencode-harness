import assert from 'node:assert/strict';import {test} from 'node:test';
import {Outbox,MemoryStore,counts} from '../src/index.mjs';
test('legacy enqueue survives reopening',()=>{const s=new MemoryStore(),q=new Outbox(s,async()=>{});q.enqueue('a',{n:1});assert.equal(new Outbox(s,async()=>{}).enqueue('a',{n:2}).payload.n,1);assert.deepEqual(counts(q),{pending:1,sent:0});});
test('one bounded drain and retry on later drain',async()=>{
 const calls=[];let fail=true;const q=new Outbox(new MemoryStore(),async r=>{calls.push(r.id);if(r.id==='a'&&fail)throw Error('offline');});q.enqueue('a',1);q.enqueue('b',2);
 assert.deepEqual(await q.drain(),{sent:['b'],failed:['a'],remaining:['a']});fail=false;assert.deepEqual(await q.drain(),{sent:['a'],failed:[],remaining:[]});assert.deepEqual(calls,['a','b','a']);await q.close();assert.throws(()=>q.enqueue('c',3));
});
