import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const project=process.env.FEEDBACK_PROJECT_ROOT;
const load=name=>import(pathToFileURL(path.join(project,name)).href);
const {mergeConfig}=await load('src/config.mjs');
test('fd07.input-isolation-and-repeat',()=>{
 const defaults={server:{tls:{enabled:false,ports:[80]}},list:[{x:1}]}, overrides={server:{tls:{enabled:true}},newList:[{y:2}]};
 const a=structuredClone(defaults),b=structuredClone(overrides),merged=mergeConfig(defaults,overrides);
 assert.deepEqual(defaults,a);assert.deepEqual(overrides,b);
 assert.deepEqual(merged.server.tls,{enabled:true,ports:[80]});
 merged.server.tls.ports.push(443);merged.list[0].x=9;merged.newList[0].y=7;
 assert.deepEqual(defaults,a);assert.deepEqual(overrides,b);assert.deepEqual(mergeConfig(defaults,{}),a);
});
test('fd07.recursive-undefined-and-arrays',()=>{
 const d={nested:{a:1,b:{c:2}},items:[1,2],empty:{}},o={nested:{a:undefined,b:{d:3}},items:[4],added:null};
 assert.deepEqual(mergeConfig(d,o),{nested:{a:1,b:{c:2,d:3}},items:[4],empty:{},added:null});
});
test('fd07.original-value-contracts',()=>{
 assert.deepEqual(mergeConfig({a:1,b:[1]},{a:null,b:[]}),{a:null,b:[]});
 assert.deepEqual(mergeConfig({a:1},{a:undefined}),{a:1});
 assert.deepEqual(mergeConfig({},{}),{});assert.deepEqual(mergeConfig({a:1},{b:2}),{a:1,b:2});
});
