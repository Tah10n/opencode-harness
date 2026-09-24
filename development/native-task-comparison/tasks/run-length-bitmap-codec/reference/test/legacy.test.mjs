import {test} from 'node:test';import assert from 'node:assert/strict';
import {encode,decode} from '../src/bitmap.mjs';test('single bit',()=>{const p=encode(1,1,[1]);assert.deepEqual(p,{width:1,height:1,start:1,runs:[1]});assert.deepEqual(decode(p),[1]);});
