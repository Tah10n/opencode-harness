import {test} from 'node:test';import assert from 'node:assert/strict';
import {enabledFlags} from '../src/flags.mjs';test('full rollout',()=>assert.deepEqual(enabledFlags({z:{enabled:true,basisPoints:10000,seed:'s',overrides:{}},a:{enabled:false,basisPoints:10000,seed:'s',overrides:{}}},'u'),['z']));
