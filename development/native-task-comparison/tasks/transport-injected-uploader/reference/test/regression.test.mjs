import {test} from 'node:test';import assert from 'node:assert/strict';
import {chunkBytes} from '../src/chunks.mjs';import {upload} from '../src/upload.mjs';
test('independent visible byte chunks',()=>{
 const backing=Uint8Array.from([99,1,2,3,4,5,88]),input=backing.subarray(1,6);const got=chunkBytes(input,2);
 assert.deepEqual(got.map(x=>[...x]),[[1,2],[3,4],[5]]);assert.ok(got.every(x=>x instanceof Uint8Array));got[0][0]=77;assert.deepEqual([...input],[1,2,3,4,5]);assert.deepEqual([...got[1]],[3,4]);
 assert.deepEqual(chunkBytes(new Uint8Array(),3),[]);
 for(const n of [0,-1,1.2,Infinity,1048577])assert.throws(()=>chunkBytes(input,n),TypeError);
});
test('serial injected transport and eager snapshot',async()=>{
 const input=Uint8Array.from([1,2,3,4,5]),calls=[];let release;const gate=new Promise(r=>release=r);
 const running=upload(input,{chunkSize:2,send:async function(chunk,meta){assert.equal(this,undefined);calls.push({bytes:[...chunk],meta});if(meta.index===0)await gate;}});
 assert.equal(calls.length,1);input.fill(9);await Promise.resolve();assert.equal(calls.length,1);release();assert.deepEqual(await running,{bytes:5,chunks:3});
 assert.deepEqual(calls,[{bytes:[1,2],meta:{index:0,offset:0,total:5,final:false}},{bytes:[3,4],meta:{index:1,offset:2,total:5,final:false}},{bytes:[5],meta:{index:2,offset:4,total:5,final:true}}]);
});
test('transport failure stops later sends, including falsy errors',async()=>{
 for(const failure of [new Error('offline'),undefined,0]){let calls=0;await assert.rejects(upload(Uint8Array.from([1,2,3]),{chunkSize:1,send(){calls++;if(calls===2)throw failure;}}),e=>e===failure);assert.equal(calls,2);}
 let calls=0;assert.deepEqual(await upload(new Uint8Array(),{send(){calls++;}}),{bytes:0,chunks:0});assert.equal(calls,0);
 await assert.rejects(upload(Uint8Array.of(1),{chunkSize:0,send(){calls++;}}),TypeError);assert.equal(calls,0);
 await assert.rejects(upload(new Uint8Array(),{}),TypeError);
});
