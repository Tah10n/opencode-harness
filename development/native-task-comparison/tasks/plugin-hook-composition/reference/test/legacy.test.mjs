import {test} from 'node:test';import assert from 'node:assert/strict';
import {runHooks} from '../src/hooks.mjs';test('empty and single async',async()=>{assert.deepEqual(await runHooks([],3),{value:3,trace:[],stopped:false});assert.deepEqual(await runHooks([{id:'a',after:[],run:async x=>({value:x+2})}],1),{value:3,trace:['a'],stopped:false});});
