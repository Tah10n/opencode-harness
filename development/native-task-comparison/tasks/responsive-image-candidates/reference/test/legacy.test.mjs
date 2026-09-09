import {test} from 'node:test';import assert from 'node:assert/strict';
import {selectImage} from '../src/image.mjs';import {parseCandidates} from '../src/srcset.mjs';test('empty fallback',()=>{assert.deepEqual(parseCandidates('  '),[]);assert.equal(selectImage('',100,2,'fallback.png'),'fallback.png');});
