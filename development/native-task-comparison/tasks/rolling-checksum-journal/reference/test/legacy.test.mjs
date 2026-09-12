import {test} from 'node:test';import assert from 'node:assert/strict';
import {replay} from '../src/journal.mjs';test('empty journal',()=>assert.deepEqual(replay([]),{values:[],checkpoint:'00000000'}));
