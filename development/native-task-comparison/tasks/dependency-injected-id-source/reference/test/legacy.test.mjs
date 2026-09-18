import {test} from 'node:test';import assert from 'node:assert/strict';
import {createRecord} from '../src/records.mjs';test('record creation',()=>{const ids=new Set(),record=createRecord({name:' Alice '},ids);assert.equal(record.name,'Alice');assert.equal(ids.has(record.id),true);assert.equal(ids.size,1);assert.throws(()=>createRecord({name:' '},ids),TypeError);assert.equal(ids.size,1);});
