import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateProfile} from '../src/profile.mjs';test('profile rules',()=>{assert.deepEqual(validateProfile({name:'Ada',email:'a@b',phone:''}),{ok:true,errors:[]});assert.deepEqual(validateProfile({name:'',email:'a@b',phone:''}),{ok:false,errors:['name required']});});
