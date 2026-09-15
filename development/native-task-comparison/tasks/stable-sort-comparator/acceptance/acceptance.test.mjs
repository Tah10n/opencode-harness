import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const {sorted}=await import(path.join(process.env.PILOT_SOURCE,'src/sort.mjs'));
test('custom comparator stable ties and immutable input',()=>{
 const a={n:2,id:'a'},b={n:1,id:'b'},c={n:2,id:'c'},d={n:1,id:'d'};const input=Object.freeze([a,b,c,d]);
 const out=sorted(input,(x,y)=>x.n-y.n);assert.deepEqual(out,[b,d,a,c]);assert.notEqual(out,input);assert.deepEqual(input,[a,b,c,d]);assert.equal(out[0],b);
 assert.deepEqual(sorted(input,()=>NaN),input);assert.deepEqual(sorted(input,()=>-0),input);
 assert.deepEqual(sorted([1,3,2],(a,b)=>a>b?-Infinity:a<b?Infinity:0),[3,2,1]);
});
test('holes remain holes after undefined and comparator never sees undefined',()=>{
 const values=new Array(7);values[0]=3;values[2]=undefined;values[4]=1;values[5]=undefined;
 const seen=[];const result=sorted(values,(a,b)=>{assert.notEqual(a,undefined);assert.notEqual(b,undefined);seen.push([a,b]);return a-b;});
 assert.equal(result.length,7);assert.deepEqual(Object.keys(result),['0','1','2','3']);assert.equal(result[0],1);assert.equal(result[1],3);
 assert.equal(result[2],undefined);assert.equal(result[3],undefined);assert.equal(4 in result,false);assert.ok(seen.length>0);
 assert.deepEqual(Object.keys(values),['0','2','4','5']);assert.equal(values[0],3);
});
test('default lexical conversion and empty or all-hole arrays',()=>{
 assert.deepEqual(sorted([20,3,100]),[100,20,3]);assert.deepEqual(sorted(['b','a','b']),['a','b','b']);
 assert.deepEqual(sorted([]),[]);const out=sorted(new Array(3));assert.equal(out.length,3);assert.deepEqual(Object.keys(out),[]);
 const input=[undefined,null,false,2];assert.deepEqual(sorted(input),[2,false,null,undefined]);
});
test('comparator error identity and caller state preserved',()=>{
 const input=[3,1,2],failure={why:'compare'};assert.throws(()=>sorted(input,()=>{throw failure;}),e=>e===failure);assert.deepEqual(input,[3,1,2]);
});
