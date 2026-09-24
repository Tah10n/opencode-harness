import {test} from 'node:test';import assert from 'node:assert/strict';
import {render} from '../src/table.mjs';test('one row',()=>assert.equal(render([['a','b']]),'a | b'));