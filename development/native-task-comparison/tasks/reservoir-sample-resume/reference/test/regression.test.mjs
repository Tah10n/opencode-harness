import {test} from 'node:test';import assert from 'node:assert/strict';
import {createReservoir,restoreReservoir} from '../src/reservoir.mjs';
test('fixed Algorithm R vectors and continuation after round-trip',()=>{
 const vectors=[{"n": 3, "rng": 7, "sample": [1, 2, 3]}, {"n": 5, "rng": 470389255, "sample": [5, 2, 3]}, {"n": 10, "rng": 258808762, "sample": [10, 2, 3]}, {"n": 20, "rng": 3134329325, "sample": [10, 13, 15]}],r=createReservoir(3,7);for(let n=1;n<=20;n++){r.add(n);const expected=vectors.find(x=>x.n===n);if(expected){assert.deepEqual(r.values(),expected.sample);assert.equal(r.snapshot().rng,expected.rng);assert.equal(r.snapshot().count,n);}}
 const whole=createReservoir(3,7);whole.addAll(Array.from({length:20},(_,i)=>i+1));const first=createReservoir(3,7);first.addAll([1,2,3,4,5,6,7]);const snapshot=JSON.parse(JSON.stringify(first.snapshot())),resumed=restoreReservoir(snapshot);resumed.addAll(Array.from({length:13},(_,i)=>i+8));assert.deepEqual(resumed.snapshot(),whole.snapshot());assert.equal(snapshot.count,7);
});
test('deep ownership at input, values, snapshot and restore',()=>{
 const input={nested:{x:1}},r=createReservoir(2,1);r.add(input);input.nested.x=9;assert.equal(r.values()[0].nested.x,1);const values=r.values();values[0].nested.x=8;assert.equal(r.values()[0].nested.x,1);const snap=r.snapshot(),restored=restoreReservoir(snap);snap.sample[0].nested.x=7;assert.equal(restored.values()[0].nested.x,1);assert.equal(r.values()[0].nested.x,1);
});
test('snapshot validation and atomic count limit',()=>{
 const base={version:1,capacity:1,count:999999,rng:7,sample:['kept']},r=restoreReservoir(base),before=r.snapshot();assert.throws(()=>r.addAll(['a','b']),RangeError);assert.deepEqual(r.snapshot(),before);r.add('a');assert.equal(r.snapshot().count,1000000);const final=r.snapshot();assert.throws(()=>r.add('b'),RangeError);assert.deepEqual(r.snapshot(),final);
 for(const patch of [{version:2},{capacity:0},{rng:0},{count:-1},{sample:[]}])assert.throws(()=>restoreReservoir({...base,...patch}),TypeError);assert.throws(()=>createReservoir(2,0),TypeError);assert.throws(()=>createReservoir(0,1),TypeError);
});

test('signed zero normalizes recursively for JSON continuation',()=>{const r=createReservoir(2);r.add({value:-0,list:[-0]});assert.ok(Object.is(r.values()[0].value,0));assert.ok(Object.is(r.values()[0].list[0],0));const resumed=restoreReservoir(JSON.parse(JSON.stringify(r.snapshot())));r.add(1);resumed.add(1);assert.deepEqual(resumed.snapshot(),r.snapshot());});
