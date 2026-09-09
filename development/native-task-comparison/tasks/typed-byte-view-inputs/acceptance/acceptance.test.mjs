import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const {checksum}=await import(path.join(process.env.PILOT_SOURCE,'src/checksum.mjs'));
test('only visible bytes from views',()=>{
 const backing=Uint8Array.of(90,1,2,3,4,80);
 assert.equal(checksum(backing.buffer),180);
 assert.equal(checksum(backing.subarray(1,5)),10);
 assert.equal(checksum(new DataView(backing.buffer,2,2)),5);
 assert.equal(checksum(Buffer.from(backing.buffer,1,3)),6);
 assert.deepEqual([...backing],[90,1,2,3,4,80]);
});
test('all numeric views mean bytes not elements',()=>{
 const buffer=new ArrayBuffer(32);const bytes=new Uint8Array(buffer);bytes.set([1,2,3,4,5,6,7,8],8);
 for(const C of [Int8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array]){
 const view=new C(buffer,8,8/C.BYTES_PER_ELEMENT);assert.equal(checksum(view),36,C.name);}
 assert.equal(checksum(new DataView(buffer,8,8)),36);
});
test('empty and live backing changes',()=>{
 const b=new Uint8Array([4,5]);const view=b.subarray(1,1);assert.equal(checksum(view),0);
 assert.equal(checksum(new ArrayBuffer(0)),0);assert.equal(checksum(new DataView(b.buffer,2,0)),0);
 assert.equal(checksum(b),9);b[1]=10;assert.equal(checksum(b),14);
});
test('reject lookalikes, arrays and shared storage',()=>{
 for(const input of [null,undefined,[1,2],'ab',{}, {buffer:new ArrayBuffer(2),byteOffset:0,byteLength:2},new SharedArrayBuffer(2),new Uint8Array(new SharedArrayBuffer(2))])assert.throws(()=>checksum(input),TypeError);
});
test('unsigned modular overflow',()=>{
 const bytes=new Uint8Array(16843010);bytes.fill(255);
 assert.equal(checksum(bytes),254);
});
