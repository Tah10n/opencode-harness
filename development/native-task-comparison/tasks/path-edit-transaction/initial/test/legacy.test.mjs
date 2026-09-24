import {test} from 'node:test';import assert from 'node:assert/strict';
import {edit} from '../src/edit.mjs';test('simple set',()=>assert.deepEqual(edit({a:1},[{op:'set',path:['a'],value:2}]),{a:2}));
