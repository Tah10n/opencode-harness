import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const root=process.env.PILOT_SOURCE;const {flattenValues}=await import(path.join(root,'src/flatten-core.mjs'));const {flatten}=await import(path.join(root,'src/flatten.mjs'));
test('depth, holes, undefined and opaque identities',()=>{
 const object={x:1},inner=[,undefined,[object]],input=[,1,inner,,2];
 assert.deepEqual(flattenValues(input,0),[1,inner,2]);assert.equal(flattenValues(input,0)[1],inner);
 assert.deepEqual(flatten(input,1),[1,undefined,[object],2]);assert.deepEqual(flatten(input),[1,undefined,object,2]);assert.equal(flatten(input)[2],object);assert.equal(Object.hasOwn(input,0),false);assert.equal(Object.hasOwn(inner,0),false);
 const shared=[3];assert.deepEqual(flatten([shared,shared]),[3,3]);assert.deepEqual(flattenValues(Object.freeze([Object.freeze([1]),2])),[1,2]);
});
test('deep nesting stack safety and finite cut-off',()=>{
 let nested=7;for(let i=0;i<30000;i++)nested=[nested];assert.deepEqual(flatten(nested),[7]);const finite=flatten(nested,2);assert.equal(finite.length,1);assert.equal(finite[0],nested[0][0][0]);
});
test('validation and depth-first getter order',()=>{
 for(const depth of [-1,NaN,1.5,'1',null])assert.throws(()=>flatten([],depth),TypeError);assert.throws(()=>flattenValues({}),TypeError);
 const seen=[],a=[];Object.defineProperty(a,0,{get(){seen.push('inner');return 2;},enumerable:true});const input=[];Object.defineProperty(input,0,{get(){seen.push('outer0');return a;},enumerable:true});Object.defineProperty(input,1,{get(){seen.push('outer1');return 3;},enumerable:true});assert.deepEqual(flatten(input),[2,3]);assert.deepEqual(seen,['outer0','inner','outer1']);
});
