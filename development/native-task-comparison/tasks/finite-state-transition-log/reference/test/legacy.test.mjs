import {test} from 'node:test';import assert from 'node:assert/strict';
import {createMachine} from '../src/machine.mjs';test('initial and transition',()=>{const m=createMachine(['a','b'],'a',[{from:'a',type:'go',to:'b'}]);assert.deepEqual(m.history(),[]);assert.deepEqual(m.apply({id:'1',type:'go'}),{applied:true,state:'b'});});
