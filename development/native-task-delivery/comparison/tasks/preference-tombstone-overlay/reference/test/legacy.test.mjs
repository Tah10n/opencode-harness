import {test} from 'node:test';import assert from 'node:assert/strict';
import {overlay} from '../src/preferences.mjs';test('replace scalar',()=>assert.deepEqual(overlay({x:1},{x:2}),{x:2}));