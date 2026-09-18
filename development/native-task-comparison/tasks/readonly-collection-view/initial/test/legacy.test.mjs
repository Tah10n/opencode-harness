import {test} from 'node:test';import assert from 'node:assert/strict';
import {viewMap} from '../src/view.mjs';test('Map reads',()=>{const source=new Map([['a',1],['b',2]]),view=viewMap(source);assert.equal(view.get('a'),1);assert.equal(view.has('b'),true);assert.equal(view.size,2);assert.deepEqual([...view],[['a',1],['b',2]]);assert.notEqual(view,source);});
