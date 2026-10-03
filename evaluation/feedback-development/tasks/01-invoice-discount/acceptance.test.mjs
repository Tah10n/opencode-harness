import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const project=process.env.FEEDBACK_PROJECT_ROOT;
const load=name=>import(pathToFileURL(path.join(project,name)).href);
const {invoice}=await load('src/pricing.mjs');
const {exportInvoice}=await load('src/export.mjs');
const {validateLine}=await load('src/validate.mjs');
test('fd01.discount-roundtrip',()=>{
 const input=[{name:'A',quantity:3,unitCents:101,discountPercent:12.5},{name:'B',quantity:1,unitCents:15,discountPercent:100},{name:'C',quantity:1,unitCents:50,discountPercent:0}];
 const copy=structuredClone(input), bill=invoice(input), encoded=JSON.parse(exportInvoice(input));
 assert.deepEqual(bill.items.map(l=>l.totalCents),[265,0,50]);
 assert.equal(bill.totalCents,315);
 assert.deepEqual(encoded.lines,bill.items); assert.equal(encoded.totalCents,315);
 assert.deepEqual(input,copy);
});
test('fd01.discount-validation',()=>{
 const base={name:'X',quantity:1,unitCents:25};
 for(const value of [-1,101,NaN,Infinity,'20',null]) {
  const line={...base,discountPercent:value}, before=structuredClone(line);
  assert.throws(()=>validateLine(line)); assert.deepEqual(line,before);
 }
 assert.equal(validateLine({...base,discountPercent:0}).discountPercent,0);
});
test('fd01.legacy-shape-and-validation',()=>{
 const line={name:'Legacy',quantity:2,unitCents:19}, copy={...line};
 assert.deepEqual(invoice([line]).items,[{...line,totalCents:38}]);
 assert.deepEqual(JSON.parse(exportInvoice([line])).lines,[{...line,totalCents:38}]);
 assert.deepEqual(line,copy); assert.deepEqual(invoice([]),{items:[],totalCents:0});
 for(const bad of [{...line,name:''},{...line,quantity:1.5},{...line,unitCents:-1}]) assert.throws(()=>invoice([bad]));
});
