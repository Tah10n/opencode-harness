import assert from 'node:assert/strict';
import {test} from 'node:test';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const load=n=>import(pathToFileURL(path.join(process.env.FEEDBACK_PROJECT_ROOT,n)).href);

import fs from 'node:fs';import os from 'node:os';import {spawnSync} from 'node:child_process';
const api=await load('src/index.mjs');const collect=async generator=>{const all=[];for await(const r of generator)all.push(r);return all;};
test('fd12.stream-boundaries-and-limits',async()=>{
 const bytes=Buffer.from('\uFEFF\n{"id":"東京💡","count":8,"ignore":true}\r\n\r\n{"id":"tail","count":1}');async function* one(){for(const byte of bytes)yield Buffer.from([byte]);}
 assert.deepEqual(await api.importRecords(one(),{format:'stream'}),{records:[{id:'東京💡',count:8},{id:'tail',count:1}],total:9});
 const valid=Buffer.from('{"id":"é","count":1}');async function* chunk(){yield valid;yield Buffer.from('\r');yield Buffer.from('\n');}
 assert.deepEqual(await collect(api.parseStream(chunk(),{maxLineBytes:valid.length})),[{id:'é',count:1}]);await assert.rejects(collect(api.parseStream(chunk(),{maxLineBytes:valid.length-1})),e=>e instanceof RangeError&&/line 1:/.test(e.message));
 for(const maxLineBytes of [0,1.5,Infinity,'10'])await assert.rejects(collect(api.parseStream(chunk(),{maxLineBytes})),RangeError);
});
test('fd12.errors-and-iterator-cleanup',async()=>{
 let closed=false,reads=0;async function* input(){try{reads++;yield Buffer.from('{"id":"first","count":1}\n');reads++;yield Buffer.from('bad\n');}finally{closed=true;}}
 for await(const r of api.parseStream(input())){assert.deepEqual(r,{id:'first',count:1});break;}assert.equal(closed,true);assert.equal(reads,1);
 let badClosed=false;async function* bad(){try{yield Buffer.from('\n\r\n{"id":"x","count":-2}\n');}finally{badClosed=true;}}
 await assert.rejects(collect(api.parseStream(bad())),e=>e instanceof RangeError&&/line 3:/.test(e.message));assert.equal(badClosed,true);
 async function* syntax(){yield Buffer.from('\nnot-json');}await assert.rejects(collect(api.parseStream(syntax())),e=>e instanceof SyntaxError&&/line 2:/.test(e.message));
 async function* invalid(){yield Buffer.from([0xc3,0x28]);}await assert.rejects(collect(api.parseStream(invalid())),TypeError);
});
test('fd12.legacy-api-and-cli',async()=>{
 assert.deepEqual(api.parseText('\r\n{"id":"old","count":0,"x":1}\n'),[{id:'old',count:0}]);assert.deepEqual(await api.importRecords('{"id":"old","count":2}'),{records:[{id:'old',count:2}],total:2});assert.throws(()=>api.parseText('bad'),SyntaxError);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fc04-cli-'));try{const file=path.join(dir,'input.ndjson');fs.writeFileSync(file,'{"id":"cli","count":5}\n');const r=spawnSync(process.execPath,[path.join(process.env.FEEDBACK_PROJECT_ROOT,'bin/import.mjs'),file],{encoding:'utf8',timeout:1000});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{records:[{id:'cli',count:5}],total:5});assert.equal(r.stderr,'');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('fd12.cli-stream-and-errors',async()=>{
 await assert.rejects(api.importRecords('',{format:'bad'}),RangeError);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fc04-cli-stream-'));try{const file=path.join(dir,'input.ndjson');fs.writeFileSync(file,'{"id":"stream","count":7}\n');const r=spawnSync(process.execPath,[path.join(process.env.FEEDBACK_PROJECT_ROOT,'bin/import.mjs'),file,'--stream'],{encoding:'utf8',timeout:1000});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{records:[{id:'stream',count:7}],total:7});for(const opts of [['--bad'],['--stream','--stream']]){const bad=spawnSync(process.execPath,[path.join(process.env.FEEDBACK_PROJECT_ROOT,'bin/import.mjs'),file,...opts],{encoding:'utf8',timeout:1000});assert.equal(bad.status,1);assert.equal(bad.stdout,'');}}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
