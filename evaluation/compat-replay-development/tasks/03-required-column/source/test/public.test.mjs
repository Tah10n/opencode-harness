import test from 'node:test';import assert from 'node:assert/strict';import * as api from '../src/index.mjs';
test('ordinary public examples',()=>{
assert.deepEqual(api.column([{n:1},{n:2}],'n'),[1,2]);assert.equal(api.first([],'n'),null);
});
