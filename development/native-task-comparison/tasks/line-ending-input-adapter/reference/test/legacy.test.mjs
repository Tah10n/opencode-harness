import {test} from 'node:test';import assert from 'node:assert/strict';
import {splitLines} from '../src/lines.mjs';test('LF lines',()=>{assert.deepEqual(splitLines('a\nb\n'),['a','b']);assert.deepEqual(splitLines('a\n\nb'),['a','','b']);assert.deepEqual(splitLines(''),[]);});
