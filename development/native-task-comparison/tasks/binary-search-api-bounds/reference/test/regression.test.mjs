import {test} from 'node:test';import assert from 'node:assert/strict';
import {bounds} from '../src/search.mjs';import {locate} from '../src/lookup.mjs';
test('numeric duplicate boundaries and absent insertion points',()=>{
 const values=[1,2,2,2,4];for(const [target,expected]of [[0,{lower:0,upper:0}],[1,{lower:0,upper:1}],[2,{lower:1,upper:4}],[3,{lower:4,upper:4}],[5,{lower:5,upper:5}]])assert.deepEqual(bounds(values,target),expected);
 assert.deepEqual(locate(values,2),{found:true,index:1,count:3});assert.deepEqual(locate(values,3),{found:false,index:4,count:0});
 assert.deepEqual(bounds([],1),{lower:0,upper:0});assert.deepEqual(bounds([2,2],2),{lower:0,upper:2});
});
test('key extractor and descending comparator reach consumer',()=>{
 const rows=Object.freeze([{n:9},{n:5},{n:5},{n:1}]);const options=Object.freeze({key:x=>x.n,compare:(a,b)=>b-a});
 assert.deepEqual(bounds(rows,5,options),{lower:1,upper:3});assert.deepEqual(locate(rows,5,options),{found:true,index:1,count:2});
 assert.deepEqual(locate(rows,6,options),{found:false,index:1,count:0});assert.deepEqual(locate(rows,0,options),{found:false,index:4,count:0});
 assert.deepEqual(rows,[{n:9},{n:5},{n:5},{n:1}]);
});
test('string keys, target already extracted and explicit undefined defaults',()=>{
 const rows=[{name:'A'},{name:'a'},{name:'B'}];let targetExtracted=false;
 const options={key:x=>{if(typeof x!=='object')targetExtracted=true;return x.name.toLowerCase();},compare:(a,b)=>a<b?-1:a>b?1:0};
 assert.deepEqual(locate(rows,'a',options),{found:true,index:0,count:2});assert.equal(targetExtracted,false);
 assert.deepEqual(bounds([1,2],2,{key:undefined,compare:undefined}),{lower:1,upper:2});
});
test('errors unchanged, empty input avoids callbacks',()=>{
 const failure={why:'key'},values=[1,2];assert.throws(()=>locate(values,1,{key:()=>{throw failure;}}),e=>e===failure);
 assert.throws(()=>bounds(values,1,{compare:()=>{throw failure;}}),e=>e===failure);assert.deepEqual(values,[1,2]);
 assert.deepEqual(locate([],0,{key:()=>assert.fail('key'),compare:()=>assert.fail('compare')}),{found:false,index:0,count:0});
});
test('logarithmic comparison bound with large duplicate runs',()=>{
 const values=Array.from({length:65536},(_,i)=>Math.floor(i/16));let calls=0;
 assert.deepEqual(bounds(values,1234,{compare:(a,b)=>{calls++;return a-b;}}),{lower:19744,upper:19760});
 assert.ok(calls<=4*Math.ceil(Math.log2(values.length+1))+4,calls+' comparisons');
});
