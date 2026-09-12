import {test} from 'node:test';import assert from 'node:assert/strict';
import {createStore} from '../src/store.mjs';test('put get and absent',()=>{const s=createStore(2);assert.equal(s.get('missing'),null);s.put('a',Uint8Array.from([1,2,3]));assert.deepEqual(s.get('a'),Uint8Array.from([1,2,3]));});
