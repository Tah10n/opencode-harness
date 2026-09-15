import {test} from 'node:test';import assert from 'node:assert/strict';
import {invoice} from '../src/invoice.mjs';test('bands and capped credit',()=>assert.deepEqual(invoice([{id:'x',units:5},{id:'y',units:1}],[{upTo:2,cents:10},{upTo:null,cents:4}],99),{lines:[{id:'x',cents:32},{id:'y',cents:10}],subtotal:42,appliedCredit:42,due:0}));
test('credit deducted once for multiple lines',()=>assert.deepEqual(invoice([{id:'x',units:5},{id:'y',units:1}],[{upTo:2,cents:10},{upTo:null,cents:4}],5),{lines:[{id:'x',cents:32},{id:'y',cents:10}],subtotal:42,appliedCredit:5,due:37}));
