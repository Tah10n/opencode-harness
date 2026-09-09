import {test} from 'node:test';import assert from 'node:assert/strict';
import {validate,errorSummary} from '../src/form.mjs';import {valueAt} from '../src/fields.mjs';test('empty form and nested lookup',()=>{assert.deepEqual(validate({a:1},[]),[]);assert.deepEqual(errorSummary([]),[]);assert.equal(valueAt({person:{name:'Ada'}},['person','name']),'Ada');});
