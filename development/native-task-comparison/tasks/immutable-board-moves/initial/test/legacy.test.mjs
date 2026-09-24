import {test} from 'node:test';import assert from 'node:assert/strict';
import {moveInPlace} from '../src/board.mjs';test('move preserves board',()=>{const b=[['x',null],[null,null]],r=b[0];assert.equal(moveInPlace(b,[0,0],[1,1]),b);assert.equal(b[0],r);assert.deepEqual(b,[[null,null],[null,'x']]);});
