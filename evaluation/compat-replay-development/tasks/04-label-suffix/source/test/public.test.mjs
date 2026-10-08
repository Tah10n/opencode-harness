import test from 'node:test';import assert from 'node:assert/strict';import * as api from '../src/index.mjs';
test('ordinary public examples',()=>{
assert.equal(api.label('abcdef',3),'abc…');assert.equal(api.label('ab',3),'ab');
});
