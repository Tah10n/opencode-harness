import {test} from 'node:test';import assert from 'node:assert/strict';
import {createGate} from '../src/gate.mjs';test('refill and no rejected side effects',()=>{let t=0,calls=0;const gate=createGate(2,2,()=>t,()=>++calls);gate('x',2);t=250;assert.deepEqual(gate('x'),{allowed:false,retryAfterMs:250});assert.equal(calls,1);t=500;assert.equal(gate('x').allowed,true);});
