import test from 'node:test';import assert from 'node:assert/strict';import * as api from '../src/index.mjs';
test('ordinary public examples',()=>{
assert.deepEqual(api.encode(['a','a','b']),[{value:'a',count:2},{value:'b',count:1}]);assert.equal(api.summary([]),'');
});
