import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDiagnosticMapper} from '../src/diagnostics.mjs';test('direct diagnostics',()=>{const map=createDiagnosticMapper([{generated:{line:1,column:0},original:{source:'a.js',line:10,column:2}}]);assert.deepEqual(map({message:'oops',line:1,column:3}),{message:'oops',source:'a.js',line:10,column:5,mapped:true});});
