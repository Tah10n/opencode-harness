import {test} from 'node:test';import assert from 'node:assert/strict';
import {parse,format} from '../src/time.mjs';test('UTC round trip',()=>assert.equal(format(parse('2024-01-01T00:00:00Z')),'2024-01-01T00:00:00Z'));
