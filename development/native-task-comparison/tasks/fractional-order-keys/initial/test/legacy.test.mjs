import {test} from 'node:test';import assert from 'node:assert/strict';
import {compare} from '../src/positions.mjs';test('simple integer keys',()=>{assert.equal(compare('1/1','2/1'),-1);assert.equal(compare('2/1','2/1'),0);});
