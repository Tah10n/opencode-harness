import {test} from 'node:test';import assert from 'node:assert/strict';
import {createGrid} from '../src/grid.mjs';test('empty and scalar',()=>{const g=createGrid();assert.equal(g.serialize(),'[]');g.set(1,2,'x');assert.equal(g.get(1,2),'x');assert.equal(g.has(0,0),false);});
