import {test} from 'node:test';import assert from 'node:assert/strict';
import {dispatch} from '../src/dispatch.mjs';test('literal handler',()=>{assert.equal(dispatch([{pattern:'/home',handle:()=>42}],'/home'),42);assert.equal(dispatch([], '/'),null);});
