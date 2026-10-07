import assert from 'node:assert/strict';
import {test} from 'node:test';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const load=n=>import(pathToFileURL(path.join(process.env.FEEDBACK_PROJECT_ROOT,n)).href);

const {Cache,Client,memorySource}=await load('src/index.mjs');
const tick=async()=>{for(let n=0;n<8;n++)await Promise.resolve();};
test('fd11.generation-and-coalescing',async()=>{
 const loads=[];const c=new Cache((key,options)=>new Promise((resolve,reject)=>loads.push({key,options,resolve,reject})));const old=c.get('asset');await tick();c.invalidate('asset');const current=c.get('asset'),same=c.get('asset');await tick();assert.equal(loads.length,2);
 loads[1].resolve({version:2});assert.deepEqual(await current,{version:2});assert.deepEqual(await same,{version:2});loads[0].resolve({version:1});assert.deepEqual(await old,{version:1});assert.deepEqual(c.peek('asset'),{version:2});
 const beforeClear=c.get('new');await tick();c.clear();const afterClear=c.get('new');await tick();loads[2].reject(Error('old failure'));await assert.rejects(beforeClear,/old failure/);assert.equal(c.has('new'),false);loads[3].resolve(7);assert.equal(await afterClear,7);assert.equal(c.peek('new'),7);
});
test('fd11.subscriber-cancellation',async()=>{
 const loads=[];const c=new Cache((key,{signal})=>new Promise(resolve=>loads.push({resolve,signal})));const a=new AbortController(),b=new AbortController();const p=c.get('shared',{signal:a.signal}),q=c.get('shared',{signal:b.signal});await tick();assert.equal(loads.length,1);
 const denied=assert.rejects(p,e=>e.name==='AbortError');a.abort();await denied;assert.equal(loads[0].signal.aborted,false);loads[0].resolve({v:3});assert.deepEqual(await q,{v:3});
 const all=new AbortController(),abandoned=c.get('orphan',{signal:all.signal});await tick();const rejected=assert.rejects(abandoned,e=>e.name==='AbortError');all.abort();await rejected;assert.equal(loads[1].signal.aborted,true);const fresh=c.get('orphan');await tick();loads[1].resolve('stale');loads[2].resolve('fresh');assert.equal(await fresh,'fresh');assert.equal(c.peek('orphan'),'fresh');
 const pre=new AbortController();pre.abort();await assert.rejects(c.get('shared',{signal:pre.signal}),e=>e.name==='AbortError');assert.equal(loads.length,3);
});
test('fd11.legacy-clones-errors-and-client',async()=>{
 const input={a:{x:[1]}};const c=new Cache(memorySource(input));input.a.x.push(2);const values=await new Client(c).loadMany(['a','a']);values[0].x.push(3);assert.deepEqual(values[1],{x:[1]});assert.deepEqual(c.peek('a'),{x:[1]});assert.deepEqual(await new Client(c).loadMany([]),[]);
 for(const key of ['',null,3])await assert.rejects(c.get(key),TypeError);await assert.rejects(c.get('absent'),/missing asset/);
 let n=0;const retry=new Cache(()=>{if(++n===1)throw Error('sync');return 9;});await assert.rejects(retry.get('x'),/sync/);assert.equal(await retry.get('x'),9);assert.equal(n,2);
});
