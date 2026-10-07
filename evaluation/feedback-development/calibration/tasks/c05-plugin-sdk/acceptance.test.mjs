import assert from 'node:assert/strict';
import {test} from 'node:test';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const load=n=>import(pathToFileURL(path.join(process.env.FEEDBACK_PROJECT_ROOT,n)).href);

import {createRequire} from 'node:module';
const api=await load('src/index.mjs');const require=createRequire(path.join(process.env.FEEDBACK_PROJECT_ROOT,'package.json'));const cjs=require('./src/index.cjs');
test('fd13.alias-atomicity-and-copying',async()=>{
 const r=api.createRegistry(),aliases=['short'];r.register({name:'main',aliases,run(x){return {canonical:this.name,value:x};}});aliases.push('late');assert.deepEqual(r.list(),['main']);assert.equal(r.describe('late'),undefined);
 const d=r.describe('short');d.aliases.push('bad');assert.deepEqual(r.describe('main'),{name:'main',aliases:['short']});
 assert.throws(()=>r.register({name:'new',aliases:['unused','short'],run:x=>x}));assert.equal(r.describe('unused'),undefined);assert.deepEqual(r.list(),['main']);
 assert.deepEqual(await r.execute('short',4),{canonical:'main',value:4});assert.equal(r.unregister('short'),true);assert.equal(r.unregister('main'),false);r.register({name:'short',run:()=>0});assert.equal(await r.execute('short',9),0);
 for(const plugin of [{name:'BAD',run(){}},{name:'valid',aliases:'x',run(){}},{name:'valid',aliases:['same','same'],run(){}},{name:'valid'}])assert.throws(()=>r.register(plugin));
});
test('fd13.mixed-settlement-and-clones',async()=>{
 const r=api.createRegistry();let raw;
 r.register({name:'mixed',run(input,done){input.n=7;raw={result:input};done(null,raw);done(Error('late'));return Promise.reject(Error('late promise'));}});
 const input={n:1};const out=await r.execute('mixed',input);assert.deepEqual(input,{n:1});assert.deepEqual(out,{result:{n:7}});raw.result.n=8;assert.equal(out.result.n,7);
 let callbacks=0,synchronous=true;await new Promise((resolve,reject)=>{r.execute('mixed',input,(e,v)=>{callbacks++;try{assert.equal(synchronous,false);assert.equal(e,null);assert.deepEqual(v,{result:{n:7}});resolve();}catch(x){reject(x);}});synchronous=false;});assert.equal(callbacks,1);
 r.register({name:'boom',run(){throw Error('boom');}});await assert.rejects(r.execute('boom',0),/boom/);await assert.rejects(r.execute('unknown',0),/unknown plugin/);assert.throws(()=>r.execute('mixed',0,2),TypeError);
 for(const value of [false,null,0]){const name='v'+(value===false?'false':value===null?'null':'zero');r.register({name,run:()=>value});assert.equal(await r.execute(name,99),value);}
});
test('fd13.legacy-exports-and-callbacks',async()=>{
 assert.equal(api.Registry,cjs.Registry);assert.equal(api.createRegistry,cjs.createRegistry);assert.equal(api.default,cjs);
 const r=new cjs.Registry();r.register({name:'legacy',run(x,done){done(null,x+1);}});assert.deepEqual(r.list(),['legacy']);assert.equal(await new Promise((resolve,reject)=>r.execute('legacy',10,(e,v)=>e?reject(e):resolve(v))),11);assert.equal(r.unregister('missing'),false);assert.equal(r.unregister('legacy'),true);
});
