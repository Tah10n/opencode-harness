import {test} from 'node:test';import assert from 'node:assert/strict';
import {validate} from '../src/validation.mjs';test('first-error validation',()=>{assert.deepEqual(validate({name:'',age:1}),{field:'name',code:'required'});assert.deepEqual(validate({name:'ok',age:17}),{field:'age',code:'invalid'});assert.equal(validate({name:'ok',age:18,email:'a@b.co'}),null);});
