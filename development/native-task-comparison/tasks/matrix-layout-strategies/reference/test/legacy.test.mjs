import {test} from 'node:test';import assert from 'node:assert/strict';
import {layout,renderLayout} from '../src/layout.mjs';test('layout text',()=>{assert.equal(renderLayout(layout([{id:'A',w:1,h:1},{id:'B',w:1,h:1}],{rows:1,cols:3})),'A B .');});
