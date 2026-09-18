import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const {formatRange}=await import(path.join(process.env.PILOT_SOURCE,'src/range.mjs'));
test('legacy positional and equivalent options',()=>{
 for(const [a,b,s]of [[1,7,2],[7,1,-2],[2,2,5],[4,1,1],[1,4,-1],[-3,2,2]]){
 assert.equal(formatRange({start:a,end:b,step:s}),formatRange(a,b,s));}
 assert.equal(formatRange(1,5,2),'1,3,5');assert.equal(formatRange(5,0,-2),'5,3,1');
 assert.equal(formatRange(2,2,-1),'2');assert.equal(formatRange(3,1),'');
});
test('options defaults, falsey separator and zero start',()=>{
 assert.equal(formatRange({end:3}),'0,1,2,3');assert.equal(formatRange({start:0,end:2,step:undefined,separator:undefined}),'0,1,2');
 assert.equal(formatRange({start:-2,end:2,separator:''}),'-2-1012');
 assert.equal(formatRange({start:2,end:0,step:-1,separator:' → '}),'2 → 1 → 0');
 assert.equal(formatRange({start:-0,end:0}),'0');assert.equal(formatRange({start:undefined,end:0}),'0');
});
test('no option mutation and exact endpoint without overshoot',()=>{
 const options=Object.freeze({start:1,end:6,step:2,separator:'|'});assert.equal(formatRange(options),'1|3|5');assert.deepEqual(options,{start:1,end:6,step:2,separator:'|'});
 assert.equal(formatRange({start:-10000,end:10000,step:20000}),'-10000,10000');
 assert.equal(formatRange({start:10000,end:-10000,step:-20000}),'10000,-10000');
});
test('invalid values never silently coerce/default',()=>{
 for(const options of [{end:1,step:0},{end:1,step:-0},{end:1,step:null},{end:1,start:null},{end:'2'},{},{end:NaN},{end:10001},{end:0,start:-10001},{end:0,step:20001},{end:0,step:1.5}])assert.throws(()=>formatRange(options),RangeError);
 for(const separator of [null,0,false,[]])assert.throws(()=>formatRange({end:1,separator}),TypeError);
 for(const args of [[0,1,0],['0',1],[0,Infinity],[null,1],[0,1,null]])assert.throws(()=>formatRange(...args),RangeError);
});
