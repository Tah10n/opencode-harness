import assert from 'node:assert/strict';
import {test} from 'node:test';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const load=n=>import(pathToFileURL(path.join(process.env.FEEDBACK_PROJECT_ROOT,n)).href);

const {Outbox,MemoryStore,counts}=await load('src/index.mjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('fd10.overlap-order-and-close',async()=>{
 const hold=deferred(),entered=deferred(),calls=[],s=new MemoryStore();
 const q=new Outbox(s,async r=>{calls.push(structuredClone(r));if(r.id==='first'){entered.resolve();await hold.promise;}r.payload.x=99;});
 q.enqueue('first',{x:1});q.enqueue('second',{x:2});const a=q.drain({limit:1});await entered.promise;const b=q.drain();q.enqueue('third',{x:3});
 assert.deepEqual(counts(q),{pending:3,sent:0});assert.equal(s.load().records[0].status,'inflight');assert.equal(s.load().records[0].attempts,1);
 let closed=false;const done=q.close().then(()=>closed=true);await Promise.resolve();assert.equal(closed,false);assert.throws(()=>q.enqueue('later',{}));await assert.rejects(q.drain());hold.resolve();
 assert.deepEqual(await a,{sent:['first'],failed:[],remaining:['second','third']});assert.deepEqual(await b,await a);await done;await q.close();assert.deepEqual(calls,[{id:'first',payload:{x:1},sequence:1}]);assert.equal(s.load().records[0].payload.x,1);
 const resumed=new Outbox(s,async r=>calls.push(r));assert.deepEqual(await resumed.drain(),{sent:['second','third'],failed:[],remaining:[]});assert.deepEqual(calls.map(r=>r.id),['first','second','third']);
});
test('fd10.failure-recovery-and-limits',async()=>{
 const s=new MemoryStore({nextSequence:3,records:[{id:'recovered',payload:4,sequence:1,status:'inflight',attempts:2,lastError:null},{id:'done',payload:5,sequence:2,status:'sent',attempts:1,lastError:null}]}),calls=[];let fail=true;
 const q=new Outbox(s,async r=>{calls.push(r.id);if(fail)throw Error('network down');});assert.equal(q.snapshot().records[0].status,'pending');assert.equal(q.enqueue('next',6).sequence,3);
 assert.deepEqual(await q.drain({limit:0}),{sent:[],failed:[],remaining:['recovered','next']});for(const limit of [-1,1.5,'1',NaN])await assert.rejects(q.drain({limit}),RangeError);
 assert.deepEqual(await q.drain({limit:1}),{sent:[],failed:['recovered'],remaining:['recovered','next']});assert.equal(q.snapshot().records[0].attempts,3);assert.equal(q.snapshot().records[0].lastError,'network down');fail=false;
 assert.deepEqual(await q.drain(),{sent:['recovered','next'],failed:[],remaining:[]});assert.deepEqual(calls,['recovered','recovered','next']);assert.equal(q.snapshot().records[0].lastError,null);
});
test('fd10.legacy-id-and-snapshot',()=>{
 const q=new Outbox(new MemoryStore(),async()=>{}),payload={a:[1]};const r=q.enqueue('same',payload);payload.a.push(2);r.payload.a.push(3);assert.deepEqual(q.enqueue('same',99),{id:'same',payload:{a:[1]},sequence:1,status:'pending',attempts:0,lastError:null});
 assert.equal(q.enqueue('other',0).sequence,2);const s=q.snapshot();s.records.length=0;assert.equal(q.snapshot().records.length,2);for(const id of ['',null,4])assert.throws(()=>q.enqueue(id,0),TypeError);
});
