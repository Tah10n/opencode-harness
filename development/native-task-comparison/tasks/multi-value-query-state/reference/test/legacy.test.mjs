import {test} from 'node:test';import assert from 'node:assert/strict';
import {createQuery} from '../src/query.mjs';test('plain key',()=>{const q=createQuery('a=1');assert.deepEqual(q.getAll('a'),['1']);assert.equal(q.serialize(),'a=1');});
