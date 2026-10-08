import assert from 'node:assert/strict';import {test} from 'node:test';
import {createRegistry} from '../src/index.mjs';
test('legacy callback and unregister',async()=>{const r=createRegistry();assert.equal(r.register({name:'double',run(x,done){done(null,x*2);}}),r);assert.equal(await new Promise((resolve,reject)=>r.execute('double',3,(e,v)=>e?reject(e):resolve(v))),6);assert.deepEqual(r.list(),['double']);assert.equal(r.unregister('double'),true);});
test('aliases and promise plugins',async()=>{const r=createRegistry();r.register({name:'echo',aliases:['e'],run:async x=>x});assert.deepEqual(await r.execute('e',{n:1}),{n:1});assert.deepEqual(r.describe('e'),{name:'echo',aliases:['e']});assert.equal(r.unregister('e'),true);assert.deepEqual(r.list(),[]);});
