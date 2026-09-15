import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const {batches}=await import(path.join(process.env.PILOT_SOURCE,'src/batches.mjs'));
test('ordinary array-like values and shallow identity',()=>{
 const value={x:1},input=Object.freeze({0:value,1:'a',2:undefined,3:'b',length:4});
 const out=batches(input,3);assert.deepEqual(out,[[value,'a',undefined],['b']]);assert.equal(out[0][0],value);assert.notEqual(out[0],input);
 assert.deepEqual(input,{0:value,1:'a',2:undefined,3:'b',length:4});assert.deepEqual(batches({length:0},3),[]);
});
test('holes versus present undefined and inherited index',()=>{
 const proto={2:'inherited'},input=Object.create(proto);input.length=6;input[0]='a';input[3]=undefined;
 const out=batches(input,2);assert.equal(out.length,3);assert.deepEqual(Object.keys(out[0]),['0']);assert.equal(out[0][0],'a');
 assert.deepEqual(out[1],['inherited',undefined]);assert.equal(out[2].length,2);assert.deepEqual(Object.keys(out[2]),[]);
 assert.equal(Object.hasOwn(input,2),false);assert.equal(Object.hasOwn(input,1),false);
});
test('length once, indexed getters once ascending with receiver',()=>{
 const log=[],input={};Object.defineProperty(input,'length',{get(){log.push('length');return 4;}});
 for(const i of [0,2,3])Object.defineProperty(input,i,{get(){assert.equal(this,input);log.push(i);return i;}});
 const out=batches(input,2);assert.deepEqual(log,['length',0,2,3]);assert.deepEqual(Object.keys(out[0]),['0']);assert.deepEqual(out[1],[2,3]);
});
test('string batching uses UTF16 units',()=>{
 assert.deepEqual(batches('A😀B',2),[['A','\ud83d'],['\ude00','B']]);assert.deepEqual(batches('',1),[]);
 const sparse=new Array(3);sparse[2]=7;Object.freeze(sparse);const result=batches(sparse,2);assert.equal(result[0].length,2);assert.deepEqual(Object.keys(result[0]),[]);assert.deepEqual(result[1],[7]);
});
test('validation before access and failure identity',()=>{
 let reads=0;const input={get length(){reads++;return 1;}};
 for(const size of [0,-1,1.5,10001,NaN,'2'])assert.throws(()=>batches(input,size),RangeError);assert.equal(reads,0);
 for(const value of [null,undefined,4,()=>1])assert.throws(()=>batches(value,1),TypeError);
 for(const length of [-1,1.2,10001,undefined,'2',Infinity])assert.throws(()=>batches({length},1),RangeError);
 const failure={why:'getter'};let later=0;const bad={length:3,get 0(){throw failure;},get 1(){later++;return 1;}};
 assert.throws(()=>batches(bad,2),e=>e===failure);assert.equal(later,0);
});
