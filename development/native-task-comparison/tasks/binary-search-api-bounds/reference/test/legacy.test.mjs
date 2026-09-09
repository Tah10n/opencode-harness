import {test} from 'node:test';import assert from 'node:assert/strict';
import {bounds} from '../src/search.mjs';import {locate} from '../src/lookup.mjs';test('numeric search',()=>{assert.deepEqual(bounds([1,2,2,4],2),{lower:1,upper:3});assert.deepEqual(locate([1,3],2),{found:false,index:1,count:0});});
