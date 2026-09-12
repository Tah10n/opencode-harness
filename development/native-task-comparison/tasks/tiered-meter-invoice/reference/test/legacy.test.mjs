import {test} from 'node:test';import assert from 'node:assert/strict';
import {invoice} from '../src/invoice.mjs';test('flat invoice',()=>assert.deepEqual(invoice([{id:'a',units:3}],[{upTo:null,cents:7}]),{lines:[{id:'a',cents:21}],subtotal:21,appliedCredit:0,due:21}));
