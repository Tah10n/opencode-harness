import {test} from 'node:test';import assert from 'node:assert/strict';
import {formatRange} from '../src/range.mjs';test('positional progression',()=>{assert.equal(formatRange(1,3),'1,2,3');assert.equal(formatRange(4,0,-2),'4,2,0');assert.equal(formatRange(3,1),'');});
