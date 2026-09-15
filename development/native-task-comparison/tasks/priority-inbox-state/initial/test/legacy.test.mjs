import {test} from 'node:test';import assert from 'node:assert/strict';
import {createInbox} from '../src/inbox.mjs';test('empty and ready item',()=>{const i=createInbox();assert.equal(i.claim(0),null);assert.equal(i.enqueue('a','payload',1,0),1);assert.deepEqual(i.claim(0),{id:'a',payload:'payload',priority:1,readyAt:0,sequence:1});});
