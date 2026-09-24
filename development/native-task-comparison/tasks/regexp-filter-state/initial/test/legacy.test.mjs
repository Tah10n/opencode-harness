import {test} from 'node:test';import assert from 'node:assert/strict';
import {filterNames} from '../src/filter.mjs';test('literal substring',()=>{const names=['a.b','axb','a.b'];assert.deepEqual(filterNames(names,'.'),['a.b','a.b']);assert.deepEqual(filterNames(names,''),names);assert.deepEqual(names,['a.b','axb','a.b']);});
