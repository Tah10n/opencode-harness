import {test} from 'node:test';import assert from 'node:assert/strict';
import {collect} from '../src/collect.mjs';test('array clone',async()=>{const a=[1,2];const b=await collect(a);assert.deepEqual(b,a);assert.notEqual(b,a);assert.deepEqual(a,[1,2]);});
