import {test} from 'node:test';import assert from 'node:assert/strict';
import {invoice} from '../src/invoice.mjs';test('whole period',()=>assert.deepEqual(invoice(0,30,{id:'basic',price:900},[],900),{lines:[{plan:'basic',start:0,end:30,cents:900}],total:900,adjustment:0}));
