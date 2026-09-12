import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const {shuffleWithRandom}=await import(path.join(process.env.PILOT_SOURCE,'src/shuffle-core.mjs'));const {shuffle}=await import(path.join(process.env.PILOT_SOURCE,'src/shuffle.mjs'));
test('fixed draws give original Fisher-Yates sequence',()=>{
 const values=Object.freeze(['a','b','c','d']),draws=[0,.5,.999999];let calls=0;
 assert.deepEqual(shuffleWithRandom(values,function(){assert.equal(arguments.length,0);assert.equal(this,undefined);return draws[calls++];}),['d','c','b','a']);assert.equal(calls,3);assert.deepEqual(values,['a','b','c','d']);
 assert.deepEqual(shuffle([1,2,3],{random:()=>0}),[2,3,1]);
 assert.deepEqual(shuffleWithRandom([1,2,3],()=>.999999),[1,2,3]);
});
test('empty and singleton fresh copies use no draws',()=>{
 const random=()=>assert.fail('unnecessary random');
 for(const input of [[],[{}]]){const out=shuffleWithRandom(input,random);assert.deepEqual(out,input);assert.notEqual(out,input);if(input.length)assert.equal(out[0],input[0]);}
});
test('invalid draws reject without source mutation and stop sampling',()=>{
 for(const draw of [-1,1,Infinity,NaN,'0',null,undefined]){
 const input=[1,2,3];let calls=0;assert.throws(()=>shuffleWithRandom(input,()=>{calls++;return draw;}),RangeError);assert.equal(calls,1);assert.deepEqual(input,[1,2,3]);}
 let n=0;const input=[1,2,3];assert.throws(()=>shuffleWithRandom(input,()=>n++===0?0:1),RangeError);assert.equal(n,2);assert.deepEqual(input,[1,2,3]);
 const failure={why:'random'};assert.throws(()=>shuffle(input,{random:()=>{throw failure;}}),e=>e===failure);assert.deepEqual(input,[1,2,3]);
});
test('default source at call time and no ambient draws when injected',()=>{
 const original=Math.random;let calls=0;Math.random=()=>{calls++;return 0;};
 try{assert.deepEqual(shuffle([1,2]),[2,1]);assert.equal(calls,1);assert.deepEqual(shuffle([1,2],{random:()=>.9}),[1,2]);assert.equal(calls,1);}finally{Math.random=original;}
});
test('duplicates and reference identity remain a permutation',()=>{
 const a={},b={},input=[a,b,a],out=shuffleWithRandom(input,()=>-0);assert.equal(out.length,3);assert.equal(out.filter(x=>x===a).length,2);assert.equal(out.filter(x=>x===b).length,1);assert.deepEqual(input,[a,b,a]);
});
