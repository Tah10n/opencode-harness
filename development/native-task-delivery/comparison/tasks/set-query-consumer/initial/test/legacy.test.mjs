import {test} from 'node:test';import assert from 'node:assert/strict';
import {names} from '../src/query.mjs';test('array query',()=>assert.deepEqual(names([{name:'a',tags:['x']}],['x']),['a']));