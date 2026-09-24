import {test} from 'node:test';import assert from 'node:assert/strict';
import {summarize} from '../src/summary.mjs';test('aggregate outputs',()=>{assert.deepEqual(summarize([1,3]),{count:2,sum:4,min:1,max:3,mean:2});assert.deepEqual(summarize([]),{count:0,sum:0,min:null,max:null,mean:null});assert.throws(()=>summarize([1.2]),RangeError);});
