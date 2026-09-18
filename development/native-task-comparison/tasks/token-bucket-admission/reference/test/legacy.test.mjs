import {test} from 'node:test';import assert from 'node:assert/strict';
import {createGate} from '../src/gate.mjs';test('initial admission',()=>assert.deepEqual(createGate(2,1,()=>0,x=>x*2)(3),{allowed:true,retryAfterMs:0,value:6}));
