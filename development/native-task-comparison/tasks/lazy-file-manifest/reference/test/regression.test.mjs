import {test} from 'node:test';import assert from 'node:assert/strict';
import {selectPaths} from '../src/selection.mjs';import {buildManifest} from '../src/manifest.mjs';
test('pure selection sorting, segment exclusions and no mutation',()=>{
 const paths=Object.freeze(['b.txt','cache/a','cache','cached/a','a.txt','b.txt']),exclude=Object.freeze(['cache']);assert.deepEqual(selectPaths(paths,exclude),['a.txt','b.txt','cached/a']);assert.deepEqual(selectPaths([],[]),[]);
 for(const bad of ['','/a','a//b','a/','a/../b','./a','a\\b','a\0b'])assert.throws(()=>selectPaths([bad]),TypeError);
});
test('only selected files are read, in sorted serial order',async()=>{
 const calls=[],bytes={a:Buffer.from('abc'),z:Buffer.from(''),dir:Buffer.from('directory')};let release;const gate=new Promise(r=>release=r);const fs={async stat(file){calls.push('stat:'+file);if(file==='/repo/a')await gate;return{isFile:()=>file!=='/repo/dir'};},async readFile(file){calls.push('read:'+file);return bytes[file.slice(6)];}};
 const result=buildManifest('/repo',['z','ignored/x','dir','a','a'],{exclude:['ignored'],fs});assert.deepEqual(calls,['stat:/repo/a']);release();assert.deepEqual(await result,[{path:'a',bytes:3,sha256:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'},{path:'z',bytes:0,sha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}]);assert.deepEqual(calls,['stat:/repo/a','read:/repo/a','stat:/repo/dir','stat:/repo/z','read:/repo/z']);
});
test('all paths validated before IO and first IO failure stops',async()=>{
 let calls=0;const fs={stat(){calls++;return{isFile:()=>true};},readFile(){calls++;return Buffer.from('x');}};await assert.rejects(buildManifest('/repo',['a','../bad'],{fs}),TypeError);assert.equal(calls,0);await assert.rejects(buildManifest('/repo',['a'],{exclude:['bad/'],fs}),TypeError);assert.equal(calls,0);
 for(const stage of ['stat','readFile']){const failure={stage},seen=[];const mock={stat(f){seen.push('stat:'+f);if(stage==='stat')throw failure;return{isFile:()=>true};},readFile(f){seen.push('read:'+f);throw failure;}};await assert.rejects(buildManifest('/repo',['z','a'],{fs:mock}),e=>e===failure);assert.ok(seen.every(x=>x.endsWith('/a')));}
});
