import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const project=process.env.FEEDBACK_PROJECT_ROOT;
const load=name=>import(pathToFileURL(path.join(project,name)).href);
const {withQuery}=await load('src/query.mjs');
const parsed=s=>new URL(s,'https://example.test');
test('fd05.repeated-array-values',()=>{
 const updates={tag:['a b','c&d',0,false]}, before=structuredClone(updates);
 const output=withQuery('../p%20ath?tag=x&tag=y&keep=1&keep=2#exact%20fragment',updates);
 assert.equal(output.split(/[?#]/,1)[0],'../p%20ath');
 assert.equal(output.slice(output.indexOf('#')),'#exact%20fragment');
 const url=parsed(output);
 assert.deepEqual(url.searchParams.getAll('tag'),['a b','c&d','0','false']);
 assert.deepEqual(url.searchParams.getAll('keep'),['1','2']); assert.equal(url.hash,'#exact%20fragment');
 assert.deepEqual(updates,before);
 assert.equal(withQuery('/p?tag=x#f',{tag:[]}),'/p#f');
});
test('fd05.invalid-arrays',()=>{
 for(const values of [[null],[undefined],[{}],[Infinity],[NaN]])assert.throws(()=>withQuery('/p',{q:values}));
});
test('fd05.scalar-and-unrelated-contracts',()=>{
 const output=withQuery('https://host.test/p?keep=1&keep=2&q=x#x',{q:0,new:false,keep:undefined});
 const url=parsed(output); assert.equal(url.origin,'https://host.test');assert.equal(url.pathname,'/p');assert.equal(url.hash,'#x');
 assert.deepEqual(url.searchParams.getAll('keep'),['1','2']);assert.equal(url.searchParams.get('q'),'0');assert.equal(url.searchParams.get('new'),'false');
 assert.equal(withQuery('/p?x=1&x=2#f',{x:null}),'/p#f');
});
