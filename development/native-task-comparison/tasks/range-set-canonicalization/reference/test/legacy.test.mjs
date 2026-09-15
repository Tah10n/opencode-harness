import {test} from 'node:test';import assert from 'node:assert/strict';
import {createRanges} from '../src/ranges.mjs';test('isolated half-open interval',()=>{const r=createRanges([[1,3]]);assert.equal(r.contains(1),true);assert.equal(r.contains(3),false);assert.deepEqual(r.snapshot(),[[1,3]]);});
