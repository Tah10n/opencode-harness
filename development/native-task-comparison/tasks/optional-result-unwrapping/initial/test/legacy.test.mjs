import {test} from 'node:test';import assert from 'node:assert/strict';
import {unwrap} from '../src/result.mjs';test('direct values',()=>{assert.equal(unwrap(undefined,7),7);assert.equal(unwrap(null,7),null);assert.equal(unwrap(0,7),0);const x={a:1};assert.equal(unwrap(x,7),x);});
