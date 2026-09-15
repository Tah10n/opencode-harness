import {test} from 'node:test';import assert from 'node:assert/strict';
import {checksum} from '../src/checksum.mjs';test('unsigned byte sum',()=>{const x=Uint8Array.of(1,200,255);assert.equal(checksum(x),456);assert.deepEqual([...x],[1,200,255]);assert.equal(checksum(new Uint8Array(0)),0);});
