import {test} from 'node:test';import assert from 'node:assert/strict';
import {canonical,digest} from '../src/canonical.mjs';import {createHash} from 'node:crypto';test('primitive and array order',()=>{assert.equal(canonical([true,null,3]),'[true,null,3]');assert.equal(canonical('hello'),'"hello"');assert.equal(digest([1,2]),createHash('sha256').update('[1,2]').digest('hex'));});
