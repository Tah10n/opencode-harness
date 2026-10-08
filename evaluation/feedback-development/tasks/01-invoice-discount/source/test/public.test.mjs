import assert from 'node:assert/strict';
import {test} from 'node:test';
import {invoice} from '../src/pricing.mjs';
import {exportInvoice} from '../src/export.mjs';
test('discount travels from validation through pricing to export',()=>{
 const lines=[{name:'Tea',quantity:2,unitCents:125,discountPercent:20}];
 assert.equal(invoice(lines).totalCents,200);
 assert.equal(JSON.parse(exportInvoice(lines)).lines[0].discountPercent,20);
});
test('legacy invoice and empty collection',()=>{
 const line={name:'Cup',quantity:3,unitCents:99};
 assert.deepEqual(invoice([line]),{items:[{...line,totalCents:297}],totalCents:297});
 assert.equal(invoice([]).totalCents,0);
 assert.throws(()=>invoice([{...line,quantity:0}]));
});
