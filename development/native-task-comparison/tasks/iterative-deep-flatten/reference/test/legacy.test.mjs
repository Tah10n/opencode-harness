import {test} from 'node:test';import assert from 'node:assert/strict';
import {flatten} from '../src/flatten.mjs';test('flatten order',()=>{assert.deepEqual(flatten([1,[2,[3]],4]),[1,2,3,4]);assert.deepEqual(flatten([1,[2,[3]],4],1),[1,2,[3],4]);});
