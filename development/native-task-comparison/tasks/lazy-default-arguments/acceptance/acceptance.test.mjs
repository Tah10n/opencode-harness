import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const {getSetting}=await import(path.join(process.env.PILOT_SOURCE,'src/settings.mjs'));
test('lazy factory called only for missing own property',()=>{
 let calls=0;const value={answer:42};const factory=key=>{calls++;assert.equal(key,'missing');return value;};
 const settings={a:undefined,b:null,c:false,d:0,e:''};
 for(const key of Object.keys(settings))assert.equal(getSetting(settings,key,()=>{assert.fail('present own key must not invoke factory');},{lazy:true}),settings[key]);
 assert.equal(calls,0);assert.equal(getSetting(settings,'missing',factory,{lazy:true}),value);assert.equal(calls,1);
 assert.equal(getSetting(settings,'missing',factory,{lazy:true}),value);assert.equal(calls,2);assert.equal(Object.hasOwn(settings,'missing'),false);
});
test('function fallback remains a value unless explicit lazy option',()=>{
 let calls=0;const fallback=()=>{calls++;};assert.equal(getSetting({},'x',fallback),fallback);
 assert.equal(getSetting({},'x',fallback,{lazy:false}),fallback);assert.equal(calls,0);
 assert.equal(getSetting({},'x'),undefined);
});
test('own getter read once and inherited getter skipped',()=>{
 let reads=0,inherited=0;const proto={get x(){inherited++;throw new Error('inherited');}};
 const settings=Object.create(proto);Object.defineProperty(settings,'y',{get(){reads++;assert.equal(this,settings);return undefined;}});
 assert.equal(getSetting(settings,'y',()=>{assert.fail('own getter result must not invoke factory');},{lazy:true}),undefined);assert.equal(reads,1);
 assert.equal(getSetting(settings,'x',key=>key+'!',{lazy:true}),'x!');assert.equal(inherited,0);
});
test('symbols, special names, frozen input and return identity',()=>{
 const key=Symbol('k');const settings=Object.create(null);settings.__proto__=null;settings[key]=1;Object.freeze(settings);
 assert.equal(getSetting(settings,'__proto__',2),null);assert.equal(getSetting(settings,key,2),1);
 let receiver='unset',arg;const missing=Symbol('missing'),promise=Promise.resolve(8);
 function factory(k){receiver=this;arg=k;return promise;}
 assert.equal(getSetting(settings,missing,factory,{lazy:true}),promise);assert.equal(arg,missing);assert.equal(receiver,undefined);
 assert.deepEqual(Reflect.ownKeys(settings),['__proto__',key]);
});
test('errors retain identity, no fallback on getter error',()=>{
 const failure={cause:'failed'};let calls=0;
 const settings={get x(){throw failure;}};
 assert.throws(()=>getSetting(settings,'x',()=>{calls++;return 1;},{lazy:true}),e=>e===failure);assert.equal(calls,0);
 assert.throws(()=>getSetting({},'x',()=>{throw failure;},{lazy:true}),e=>e===failure);
});
