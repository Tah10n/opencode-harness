import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=process.env.FEEDBACK_PROJECT_ROOT;const api=await import(pathToFileURL(path.join(root,'src/index.mjs')));
test('fd23.feature',async()=>{assert.match(fs.readFileSync(path.join(root,'src/field.mjs'),'utf8'),/requireField\(row,key\)/);const m=await import(pathToFileURL(path.join(root,'src/required.mjs')));assert.throws(()=>m.requireField({},'z'),{name:'RangeError',message:'missing field: z'});});
test('fd23.preservation',()=>{assert.throws(()=>api.column([{n:2},{}],'n'),{name:'RangeError',message:'missing field: n'});assert.equal(api.first([{n:null}],'n'),null);assert.equal(api.first([{n:false}],'n'),false);});
