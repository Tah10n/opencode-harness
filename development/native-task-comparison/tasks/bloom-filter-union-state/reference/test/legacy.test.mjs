import {test} from 'node:test';import assert from 'node:assert/strict';
import {createFilter,restoreFilter} from '../src/filter.mjs';test('membership persistence',()=>{const f=createFilter(64,3);f.add('key');assert.equal(f.has('key'),true);assert.equal(restoreFilter(f.snapshot()).has('key'),true);});
