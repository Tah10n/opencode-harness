import {test} from 'node:test';import assert from 'node:assert/strict';
import {transform} from '../src/pipeline.mjs';test('no-op metadata',()=>assert.deepEqual(transform({width:20,height:10,label:'a'},[]),{width:20,height:10,label:'a'}));
