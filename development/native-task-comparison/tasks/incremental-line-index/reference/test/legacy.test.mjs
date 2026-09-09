import {test} from 'node:test';import assert from 'node:assert/strict';
import {createIndex} from '../src/lines.mjs';test('LF coordinates',()=>{const i=createIndex('ab\nc');assert.deepEqual(i.starts(),[0,3]);assert.deepEqual(i.locate(3),{line:1,column:0});assert.equal(i.offset(0,2),2);});
