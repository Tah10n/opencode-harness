import {test} from 'node:test';import assert from 'node:assert/strict';
import {applyPatch} from '../src/patch.mjs';test('single replacement',()=>assert.deepEqual(applyPatch(['a','b'],[{at:1,remove:['b'],insert:['B']}]).lines,['a','B']));
