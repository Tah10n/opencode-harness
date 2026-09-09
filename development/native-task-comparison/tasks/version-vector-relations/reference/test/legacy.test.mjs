import {test} from 'node:test';import assert from 'node:assert/strict';
import {compare,createClock} from '../src/vector.mjs';test('empty and tick',()=>{assert.equal(compare({},{}),'equal');const c=createClock();assert.equal(c.tick('a'),1);assert.deepEqual({...c.snapshot()},{a:1});});
