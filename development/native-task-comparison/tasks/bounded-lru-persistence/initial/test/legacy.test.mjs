import {test} from 'node:test';import assert from 'node:assert/strict';
import {createCache} from '../src/cache.mjs';test('single value and miss',()=>{const c=createCache(2);assert.equal(c.get('none'),undefined);c.put('a',1);assert.equal(c.get('a'),1);});
