import {test} from 'node:test';import assert from 'node:assert/strict';
import {createReservoir} from '../src/reservoir.mjs';test('initial bounded sample',()=>{const r=createReservoir(3,7);r.addAll([1,2,3]);assert.deepEqual(r.values(),[1,2,3]);assert.equal(r.snapshot().count,3);assert.equal(r.snapshot().rng,7);});
