import assert from 'node:assert/strict';import {test} from 'node:test';
import {Catalog,MemoryStorage,command} from '../src/index.mjs';
const item=(id,n)=>({id,name:id,priceCents:n,tags:['sale']});
test('legacy upsert and formats',()=>{const c=new Catalog(new MemoryStorage());c.upsert(item('a',20));assert.equal(command(c,{action:'list',format:'text'}),'a\ta\t20');assert.equal(c.revision(),1);});
test('atomic batch and filtered command',()=>{
 const s=new MemoryStorage(),c=new Catalog(s);c.upsert(item('a',20));
 assert.deepEqual(command(c,{action:'batch',expectedRevision:1,operations:[{type:'upsert',product:item('b',50)},{type:'delete',id:'a'}]}),{revision:2,products:[item('b',50)]});
 assert.equal(command(c,{action:'list',minPrice:60}),'[]');const before=s.read();
 assert.throws(()=>c.applyBatch({expectedRevision:2,operations:[{type:'delete',id:'b'},{type:'delete',id:'missing'}]}));assert.deepEqual(s.read(),before);
});
