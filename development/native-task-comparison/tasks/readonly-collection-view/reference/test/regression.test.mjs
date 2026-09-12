import {test} from 'node:test';import assert from 'node:assert/strict';
import {viewMap} from '../src/view.mjs';
test('live source updates and insertion order',()=>{
 const source=new Map([['a',1],['b',2]]),view=viewMap(source);assert.equal(view.size,2);assert.equal(view.get('a'),1);assert.equal(view.has('z'),false);
 source.set('a',3);source.delete('b');source.set('c',4);
 assert.equal(view.size,2);assert.deepEqual([...view],[['a',3],['c',4]]);assert.deepEqual([...view.keys()],['a','c']);assert.deepEqual([...view.values()],[3,4]);
 source.clear();assert.equal(view.size,0);assert.equal(view.get('a'),undefined);
});
test('mutators reject and source preserved',()=>{
 const source=new Map([['x',1]]),view=viewMap(source);
 for(const act of [()=>view.set('y',2),()=>view.delete('x'),()=>view.clear()])assert.throws(act,TypeError);
 assert.deepEqual([...source],[['x',1]]);assert.equal(Object.isFrozen(view),true);
});
test('forEach callback receives view not source and receiver',()=>{
 const source=new Map([['a',1],['b',2]]),view=viewMap(source),receiver={x:1},seen=[];
 const returned=view.forEach(function(value,key,map){assert.equal(this,receiver);assert.equal(map,view);assert.notEqual(map,source);assert.throws(()=>map.set('bad',9),TypeError);seen.push([key,value]);},receiver);
 assert.equal(returned,undefined);assert.deepEqual(seen,[['a',1],['b',2]]);assert.equal(source.has('bad'),false);
});
test('native live iteration during callbacks and error identity',()=>{
 const source=new Map([['a',1],['b',2]]),view=viewMap(source),seen=[];
 view.forEach((value,key)=>{seen.push(key);if(key==='a'){source.delete('b');source.set('c',3);}});
 assert.deepEqual(seen,['a','c']);const failure={why:'callback'};assert.throws(()=>view.forEach(()=>{throw failure;}),e=>e===failure);
 const iterator=view.entries();assert.deepEqual(iterator.next().value,['a',1]);source.set('d',4);assert.deepEqual([...iterator],[['c',3],['d',4]]);
});
test('Map key semantics and shallow values',()=>{
 const key={},value={n:1},source=new Map([[key,value],[NaN,2],[-0,3],['u',undefined]]),view=viewMap(source);
 assert.equal(view.get(key),value);assert.equal(view.get(NaN),2);assert.equal(view.get(0),3);assert.equal(view.has('u'),true);assert.equal(view.get('u'),undefined);
 value.n=4;assert.equal(view.get(key).n,4);assert.equal(source.get(key),value);
 for(const x of [null,{},[],undefined])assert.throws(()=>viewMap(x),TypeError);
});

test('owner supplied self-reference remains ordinary shallow data',()=>{
 const source=new Map();source.set('self',source);const view=viewMap(source);
 assert.equal(view.get('self'),source);
});
