import {test} from 'node:test';import assert from 'node:assert/strict';
import {redact} from '../src/redact.mjs';test('redact secrets',()=>{const input={name:'Ada',password:'secret'};assert.deepEqual(redact(input),{name:'Ada',password:'[REDACTED]'});assert.equal(input.password,'secret');});
