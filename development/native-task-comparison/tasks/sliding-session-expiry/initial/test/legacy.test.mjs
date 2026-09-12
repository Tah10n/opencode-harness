import {test} from 'node:test';import assert from 'node:assert/strict';
import {createSession,serialize,restore} from '../src/session.mjs';test('creation round trip',()=>{const s=createSession(10,5,20);assert.deepEqual(s,{created:10,lastSeen:10,idle:5,maxAge:20});assert.deepEqual(restore(serialize(s)),s);});
