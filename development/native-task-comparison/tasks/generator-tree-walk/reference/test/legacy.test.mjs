import {test} from 'node:test';import assert from 'node:assert/strict';
import {collectTree} from '../src/tree.mjs';test('preorder list',()=>{const root={id:'a',children:[{id:'b'},{id:'c'}]};assert.deepEqual(collectTree(root).map(x=>x.id),['a','b','c']);assert.deepEqual(collectTree(root,{prune:n=>n.id==='a'}),[root]);});
