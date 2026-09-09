import {test} from 'node:test';import assert from 'node:assert/strict';
import {words} from '../src/words.mjs';test('ASCII words',()=>{assert.deepEqual(words(' one\t two\nthree '),['one','two','three']);assert.deepEqual(words(''),[]);});
