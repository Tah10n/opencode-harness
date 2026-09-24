import {test} from 'node:test';import assert from 'node:assert/strict';
import {processName,validateName,displayName} from '../src/names.mjs';test('name pipeline',()=>{assert.deepEqual(processName(' Alice '),{ok:true,name:'alice',label:'@alice'});assert.equal(validateName(' '),'empty');assert.equal(displayName(' A_B '),'@a_b');});
