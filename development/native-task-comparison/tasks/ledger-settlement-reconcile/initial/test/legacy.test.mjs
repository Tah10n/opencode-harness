import {test} from 'node:test';import assert from 'node:assert/strict';
import {reconcile} from '../src/settlement.mjs';test('balanced transfer',()=>assert.deepEqual(reconcile([{id:'1',account:'a',currency:'USD',delta:-5},{id:'2',account:'b',currency:'USD',delta:5}]),[{currency:'USD',accounts:[{account:'a',delta:-5},{account:'b',delta:5}],total:0,balanced:true}]));
