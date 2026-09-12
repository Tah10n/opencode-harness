import {test} from 'node:test';import assert from 'node:assert/strict';
import {createSet} from '../src/set.mjs';test('empty and add',()=>{const s=createSet();assert.deepEqual(s.values(),[]);s.add('a','t1');assert.deepEqual(s.values(),['a']);});
