import {test} from 'node:test';import assert from 'node:assert/strict';
import {composeMail} from '../src/mail.mjs';test('plain mail',()=>assert.deepEqual(composeMail('<p>Hello</p>',[]),{html:'<p>Hello</p>',parts:[]}));
