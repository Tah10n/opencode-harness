import {test} from 'node:test';import assert from 'node:assert/strict';
import {label} from '../src/label.mjs';test('chapter',()=>assert.equal(label(4),'Chapter IV'));