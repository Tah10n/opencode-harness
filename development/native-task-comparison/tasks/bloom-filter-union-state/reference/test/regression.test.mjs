import {test} from 'node:test';import assert from 'node:assert/strict';
import {createFilter,restoreFilter} from '../src/filter.mjs';
test('fixed multi-hash bitmap and JSON continuation',()=>{
 const f=createFilter(64,4);for(const s of ['alpha','雪',''])f.add(s);assert.deepEqual(f.snapshot(),{version:1,bits:64,hashes:4,data:"IoxQASAYAEA="});for(const s of ['alpha','雪',''])assert.equal(f.has(s),true);
 const snap=JSON.parse(JSON.stringify(f.snapshot())),restored=restoreFilter(snap);restored.add('next');f.add('next');assert.deepEqual(restored.snapshot(),f.snapshot());snap.data=Buffer.alloc(8).toString('base64');assert.equal(restored.has('alpha'),true);
});
test('union preserves both memberships, commutes and is idempotent',()=>{
 const a=createFilter(256,3),b=createFilter(256,3);a.add('left');b.add('right');const sa=a.snapshot(),sb=b.snapshot();a.union(sb);b.union(sa);assert.deepEqual(a.snapshot(),b.snapshot());assert.equal(a.has('left'),true);assert.equal(a.has('right'),true);const joined=a.snapshot();a.union(joined);assert.deepEqual(a.snapshot(),joined);assert.deepEqual(sa,restoreFilter(sa).snapshot());
});
test('all-one false positives are valid; mismatches reject atomically',()=>{
 const saturated=restoreFilter({version:1,bits:8,hashes:8,data:'/w=='});assert.equal(saturated.has('never inserted'),true);
 const f=createFilter(64,4);f.add('keep');const before=f.snapshot();for(const other of [createFilter(128,4).snapshot(),createFilter(64,3).snapshot(),{...before,data:before.data+' '},{...before,version:2}]){assert.throws(()=>f.union(other),TypeError);assert.deepEqual(f.snapshot(),before);}
 for(const value of [null,2,{}]){assert.throws(()=>f.add(value),TypeError);assert.throws(()=>f.has(value),TypeError);assert.deepEqual(f.snapshot(),before);}
 for(const [bits,hashes]of [[7,3],[16,0],[8200,2],[32,9]])assert.throws(()=>createFilter(bits,hashes),TypeError);
 assert.throws(()=>restoreFilter({...before,data:'AA=='}),TypeError);
});

test('non-power-of-two bit count uses unwrapped final hash sum',()=>{const f=createFilter(72,8);for(const value of ['alpha','snow',''])f.add(value);assert.equal(f.snapshot().data,"EQCIAEiWJCMA");const surrogate=createFilter(64,4),replacement=createFilter(64,4);surrogate.add('\ud800');replacement.add('\ufffd');assert.deepEqual(surrogate.snapshot(),replacement.snapshot());});
