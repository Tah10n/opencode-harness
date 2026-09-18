import {test} from 'node:test';import assert from 'node:assert/strict';
import {wrap} from '../src/promise.mjs';test('then and catch',async()=>{assert.equal(await wrap(2).then(x=>x*3),6);assert.equal(await wrap(Promise.reject('x')).catch(x=>x+'!'),'x!');});
