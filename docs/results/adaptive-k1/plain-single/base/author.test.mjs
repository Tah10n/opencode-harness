import {test} from 'node:test';import assert from 'node:assert/strict';import {mergeRanges} from './ranges.mjs';test('author overlap check',()=>assert.deepEqual(mergeRanges([[1,4],[2,3]]),[[1,4]]));
