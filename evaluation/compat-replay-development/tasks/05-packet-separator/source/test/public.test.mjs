import test from 'node:test';import assert from 'node:assert/strict';import * as api from '../src/index.mjs';
test('ordinary public examples',()=>{
assert.equal(api.packet(['alpha','beta']),'alpha|beta');assert.equal(api.packet([]),'');
});
