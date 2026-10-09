import test from 'node:test';import assert from 'node:assert/strict';import * as api from '../src/index.mjs';
test('ordinary public examples',()=>{
assert.deepEqual(api.transform([[1,2]],{scale:2}),[[2,4]]);assert.deepEqual(api.transform([]),[]);
});
