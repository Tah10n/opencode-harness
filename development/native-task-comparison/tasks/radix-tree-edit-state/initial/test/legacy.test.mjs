import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDictionary} from '../src/dictionary.mjs';test('empty and exact',()=>{assert.deepEqual(createDictionary().entries(),[]);assert.equal(createDictionary([{key:'a',value:1}]).get('a'),1);assert.equal(createDictionary().get('missing'),undefined);});
