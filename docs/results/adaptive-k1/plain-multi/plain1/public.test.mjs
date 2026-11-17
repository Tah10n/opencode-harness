import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeRanges} from './ranges.mjs';
test('overlap',()=>assert.deepEqual(mergeRanges([[2,5],[1,3]]),[[1,5]]));
test('adjacent opt-in',()=>assert.deepEqual(mergeRanges([[1,2],[2,3]],{joinAdjacent:true}),[[1,3]]));
test('adjacent default',()=>assert.deepEqual(mergeRanges([[1,2],[2,3]]),[[1,2],[2,3]]));
test('input stays unchanged',()=>{const pairs=[[2,4],[1,3]];mergeRanges(pairs);assert.deepEqual(pairs,[[2,4],[1,3]]);});
test('invalid endpoints',()=>assert.throws(()=>mergeRanges([[1,1]]),TypeError));
