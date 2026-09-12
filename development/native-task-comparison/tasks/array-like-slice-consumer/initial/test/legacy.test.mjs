import {test} from 'node:test';import assert from 'node:assert/strict';
import {batches} from '../src/batches.mjs';test('array groups and remainder',()=>{const input=[1,2,3,4,5];assert.deepEqual(batches(input,2),[[1,2],[3,4],[5]]);assert.deepEqual(input,[1,2,3,4,5]);assert.deepEqual(batches([],2),[]);});
