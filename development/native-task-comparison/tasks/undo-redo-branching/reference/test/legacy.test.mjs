import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHistory} from '../src/history.mjs';test('initial state',()=>{const h=createHistory(1,2);assert.deepEqual(h.snapshot(),{value:1,undo:0,redo:0});assert.deepEqual(h.undo(),{changed:false,value:1});});
