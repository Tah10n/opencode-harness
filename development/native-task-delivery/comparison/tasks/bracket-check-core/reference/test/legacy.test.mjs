import {test} from 'node:test';import assert from 'node:assert/strict';
import {check} from '../src/check.mjs';test('balanced',()=>assert.equal(check('a([b])'),'ok'));