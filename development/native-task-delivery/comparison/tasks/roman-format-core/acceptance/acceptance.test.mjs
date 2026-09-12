import {test} from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';const root=process.env.PILOT_SOURCE;
const m0=await import(path.join(root,"src/roman.mjs"));const m1=await import(path.join(root,"src/label.mjs"));
test("subtractive core and consumer prefix",()=>{assert.equal(m0.roman(1994),'MCMXCIV');assert.equal(m1.label(49,''),'XLIX');assert.equal(m1.label(3999,'#'),'#MMMCMXCIX');});
test("invalid input consistently rejects",()=>{for(const n of [0,-1,4000,1.5,NaN]){assert.throws(()=>m0.roman(n),{name:'RangeError',message:'roman'});assert.throws(()=>m1.label(n),RangeError);}});
test("repeat calls have no state",()=>{assert.equal(m0.roman(9),'IX');assert.equal(m0.roman(1),'I');assert.equal(m1.label(9),'Chapter IX');});