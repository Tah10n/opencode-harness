import assert from 'node:assert/strict';import {test} from 'node:test';
import {textReport} from '../src/text.mjs';import {jsonReport} from '../src/json.mjs';
test('defaults and explicit options',()=>{
 assert.equal(textReport(),'attempts=3; timeout=250');assert.deepEqual(jsonReport({attempts:2,timeout:0}),{attempts:2,timeout:0});
 assert.equal(textReport({attempts:2,timeout:0}),'attempts=2; timeout=0');
});
test('both entrypoints keep validation',()=>{
 for(const fn of [textReport,jsonReport])for(const bad of [{attempts:0},{attempts:11},{timeout:-1},{timeout:Infinity}])assert.throws(()=>fn(bad),RangeError);
});
