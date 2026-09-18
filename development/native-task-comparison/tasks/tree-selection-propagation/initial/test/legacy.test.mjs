import {test} from 'node:test';import assert from 'node:assert/strict';
import {createSelection} from '../src/selection.mjs';test('single leaf',()=>{const s=createSelection([{id:'a',children:[]}]);s.toggle('a',true);assert.deepEqual(s.status('a'),{checked:true,indeterminate:false});assert.deepEqual(s.snapshot(),['a']);});
