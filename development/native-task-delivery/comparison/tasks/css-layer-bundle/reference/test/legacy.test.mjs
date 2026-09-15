import {test} from 'node:test';import assert from 'node:assert/strict';
import {bundle} from '../src/bundle.mjs';test('one layer',()=>assert.equal(bundle([{name:'a',css:'x'}],[]),'@layer a { x }'));