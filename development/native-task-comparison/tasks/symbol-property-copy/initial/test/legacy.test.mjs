import {test} from 'node:test';import assert from 'node:assert/strict';
import {copyValues} from '../src/copy.mjs';test('plain shallow copy',()=>{const nested={x:1};const source={a:nested,b:2};const out=copyValues(source);assert.deepEqual(out,source);assert.notEqual(out,source);assert.equal(out.a,nested);});
