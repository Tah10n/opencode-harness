import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDecoder} from '../src/decoder.mjs';test('complete ASCII',()=>assert.deepEqual(createDecoder().push({type:'text',fin:true,data:new TextEncoder().encode('hello')}),[{type:'message',text:'hello'}]));
