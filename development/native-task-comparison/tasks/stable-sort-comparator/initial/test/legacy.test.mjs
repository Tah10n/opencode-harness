import {test} from 'node:test';import assert from 'node:assert/strict';
import {sorted} from '../src/sort.mjs';test('default lexical order and fresh copy',()=>{const input=[2,10,1];assert.deepEqual(sorted(input),[1,10,2]);assert.deepEqual(input,[2,10,1]);assert.notEqual(sorted(input),input);});
