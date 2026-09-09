import {test} from 'node:test';import assert from 'node:assert/strict';
import {taxCents} from '../src/tax.mjs';import {shareCents} from '../src/share.mjs';import {invoiceTotal} from '../src/totals.mjs';test('billing rounding',()=>{assert.equal(taxCents(-15,1000),-1);assert.equal(shareCents(3,1,2),2);assert.deepEqual(invoiceTotal([5,5],1000),{subtotal:10,tax:2,total:12});});
