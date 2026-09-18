import {test} from 'node:test';import assert from 'node:assert/strict';
import {encode,createDecoder} from '../src/tlv.mjs';test('single record wire',()=>{const bytes=encode([{type:7,data:Uint8Array.from([1,2])}]);assert.deepEqual([...bytes],[7,0,2,1,2]);assert.deepEqual(createDecoder().push(bytes),[{type:7,data:Uint8Array.from([1,2])}]);});
