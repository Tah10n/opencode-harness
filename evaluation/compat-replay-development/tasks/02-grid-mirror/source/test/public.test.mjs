import test from 'node:test';import assert from 'node:assert/strict';import * as api from '../src/index.mjs';
test('ordinary public examples',()=>{
assert.deepEqual(api.mirror([1,2]),[2,1]);assert.deepEqual(api.mirrorGrid([[1,2],[3,4]]),[[2,1],[4,3]]);
});
