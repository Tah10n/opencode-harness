import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const {createRecord}=await import(path.join(process.env.PILOT_SOURCE,'src/records.mjs'));
test('injected source once after valid input and unchanged input',()=>{
 const input=Object.freeze({name:'  Alice  '}),ids=new Set(['old']);let calls=0;
 const result=createRecord(input,ids,{nextId:function(){assert.equal(arguments.length,0);assert.equal(this,undefined);calls++;return 'id-1';}});
 assert.deepEqual(result,{id:'id-1',name:'Alice'});assert.equal(calls,1);assert.deepEqual([...ids],['old','id-1']);assert.equal(input.name,'  Alice  ');
});
test('invalid name causes no allocation or set change',()=>{
 const ids=new Set(['old']);let calls=0;const options={nextId:()=>{calls++;return 'new';}};
 for(const name of ['', ' \t ',null,undefined,3,'x'.repeat(81)])assert.throws(()=>createRecord({name},ids,options),TypeError);
 assert.equal(calls,0);assert.deepEqual([...ids],['old']);
 assert.equal(createRecord({name:'x'.repeat(80)},ids,options).name.length,80);assert.equal(calls,1);
});
test('collision and invalid allocated IDs have no retry or set mutation',()=>{
 const ids=new Set(['taken']);let calls=0;assert.throws(()=>createRecord({name:'x'},ids,{nextId:()=>{calls++;return 'taken';}}),e=>e.code==='ID_COLLISION');assert.equal(calls,1);
 for(const id of ['', 'space id','a.b','é','x'.repeat(65),null,undefined,2]){
 let n=0;assert.throws(()=>createRecord({name:'x'},ids,{nextId:()=>{n++;return id;}}),TypeError);assert.equal(n,1);}
 assert.deepEqual([...ids],['taken']);
});
test('allocator failure identity and independent records',()=>{
 const ids=new Set(),failure={why:'allocator'};assert.throws(()=>createRecord({name:'x'},ids,{nextId:()=>{throw failure;}}),e=>e===failure);assert.equal(ids.size,0);
 let n=0;const nextId=()=>String(++n);const a=createRecord({name:'same'},ids,{nextId}),b=createRecord({name:'same'},ids,{nextId});
 assert.notEqual(a,b);assert.equal(a.id,'1');assert.equal(b.id,'2');assert.deepEqual([...ids],['1','2']);
});
test('default UUID source and legacy two-argument form',()=>{
 const ids=new Set(),a=createRecord({name:' A '},ids),b=createRecord({name:'B'},ids,{nextId:undefined});
 assert.match(a.id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.notEqual(a.id,b.id);assert.equal(a.name,'A');assert.equal(ids.has(a.id),true);assert.equal(ids.size,2);
});
