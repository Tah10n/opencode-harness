import {test} from 'node:test';import assert from 'node:assert/strict';
import {upload} from '../src/upload.mjs';test('upload contract',async()=>{const out=[];assert.deepEqual(await upload(Uint8Array.from([1,2,3]),{chunkSize:2,send:c=>out.push([...c])}),{bytes:3,chunks:2});assert.deepEqual(out,[[1,2],[3]]);});
