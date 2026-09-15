import {test} from 'node:test';import assert from 'node:assert/strict';
import {shuffle} from '../src/shuffle.mjs';test('legacy permutation',()=>{const original=Math.random;Math.random=()=>0;try{const input=[1,2,3];assert.deepEqual(shuffle(input),[2,3,1]);assert.deepEqual(input,[1,2,3]);assert.deepEqual(shuffle([]),[]);}finally{Math.random=original;}});
