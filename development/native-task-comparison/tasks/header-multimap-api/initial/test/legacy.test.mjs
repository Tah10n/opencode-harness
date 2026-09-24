import {test} from 'node:test';import assert from 'node:assert/strict';
import {headers} from '../src/headers.mjs';test('legacy lookup',()=>{const h=headers({'content-type':'text/plain','x-id':'7'});assert.equal(h.get('content-type'),'text/plain');assert.equal(h.get('x-id'),'7');assert.equal(h.get('absent'),undefined);});
