// Independent, model-hidden transfer checks. Never imported by the installed runtime.
const common = `import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const gate=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
`;
export const cases = {
'promise-clear-queue': common + `import pDebounce from './index.js';
for(const reason of [undefined,null,false,0,{exact:1}])test('clear queued callers with exact/default reason '+String(reason),{timeout:3000},async()=>{
 const activeGate=gate(),calls=[];const fn=pDebounce.promise(async function(x){calls.push([this?.id,x]);if(x==='active')await activeGate.promise;return x},{after:true});
 const active=fn.call({id:1},'active');const a=fn.call({id:2},'discard-a'),b=fn.call({id:3},'discard-b');
 const settled=[a,b].map(p=>p.then(value=>({ok:true,value}),error=>({ok:false,error})));
 await tick();assert.deepEqual(calls,[[1,'active']]);assert.equal(fn.clearQueue(reason),2);assert.equal(fn.clearQueue(),0);
 for(const r of await Promise.all(settled)){assert.equal(r.ok,false);if(reason===undefined)assert.equal(r.error.name,'AbortError');else assert.equal(r.error,reason)}
 let activeSettled=false;active.then(()=>activeSettled=true,()=>activeSettled=true);await tick();assert.equal(activeSettled,false);
 const later1=fn.call({id:4},'later-a'),later2=fn.call({id:5},'later-b');activeGate.resolve();assert.deepEqual(await Promise.all([active,later1,later2]),['active','later-b','later-b']);assert.deepEqual(calls,[[1,'active'],[5,'later-b']]);assert.equal(await fn.call({id:6},'idle'),'idle');
});
test('default mode preserves active sharing and rejection',{timeout:3000},async()=>{
 const blocked=gate(),reason={active:true};let calls=0;const fn=pDebounce.promise(async()=>{calls++;await blocked.promise;throw reason});const a=fn(),b=fn();const observed=[a,b].map(p=>p.then(()=>false,e=>e));await tick();assert.equal(calls,1);assert.equal(fn.clearQueue('ignored'),0);blocked.resolve();for(const r of await Promise.all(observed))assert.equal(r,reason);assert.equal(calls,1);
});
test('later active batch excluded, future queued calls discarded, wrappers independent',{timeout:3000},async()=>{
 const first=gate(),second=gate(),otherGate=gate(),calls=[];const fn=pDebounce.promise(async x=>{calls.push(x);await (x===1?first.promise:second.promise);return x},{after:true});
 const a=fn(1),b=fn(2);let firstSettled=false;a.then(()=>firstSettled=true);first.resolve();await tick();assert.deepEqual(calls,[1,2]);assert.equal(firstSettled,false);assert.equal(fn.clearQueue(),0);
 const c=fn(3),d=fn(4),reason=Symbol('stop');const rejected=[c,d].map(p=>p.then(()=>false,e=>e));
 const other=pDebounce.promise(async x=>{await otherGate.promise;return x},{after:true});const oa=other('a'),ob=other('b');
 assert.equal(fn.clearQueue(reason),2);for(const r of await Promise.all(rejected))assert.equal(r,reason);second.resolve();assert.deepEqual(await Promise.all([a,b]),[1,2]);assert.deepEqual(calls,[1,2]);otherGate.resolve();assert.deepEqual(await Promise.all([oa,ob]),['a','b']);
});
test('after true active rejection remains exact after clearing',{timeout:3000},async()=>{
 const blocked=gate(),activeReason={active:1};let calls=0;const fn=pDebounce.promise(async()=>{calls++;await blocked.promise;throw activeReason},{after:true});const a=fn(),b=fn();const ar=a.then(()=>false,e=>e),br=b.then(()=>false,e=>e);await tick();assert.equal(calls,1);assert.equal(fn.clearQueue(null),1);assert.equal(await br,null);blocked.resolve();assert.equal(await ar,activeReason);assert.equal(calls,1);
});
`,
 'throttle-callback-receivers': common + `import pThrottle from './index.js';
for(const strict of [false,true])test('receivers per immediate/delayed weighted call '+strict,{timeout:3000},async()=>{
 const weights=[],delays=[],calls=[];const a={id:'a',cost:1},b={id:'b',cost:1};const fn=pThrottle({limit:1,interval:40,strict,weight:function(...args){weights.push([this,...args]);return this.cost},onDelay:function(...args){delays.push([this,...args])}})(function(...args){calls.push([this,...args]);return this.id+args[0]});
 const p=fn.call(a,'first',1),q=fn.call(b,'second',2);assert.deepEqual(weights,[[a,'first',1],[b,'second',2]]);assert.deepEqual(delays,[[b,'second',2]]);assert.equal(fn.queueSize,1);assert.deepEqual(calls,[[a,'first',1]]);assert.deepEqual(await Promise.all([p,q]),['afirst','bsecond']);assert.deepEqual(calls,[[a,'first',1],[b,'second',2]]);assert.equal(fn.queueSize,0);
});
test('plain unbound receiver and disabled bypass',{timeout:3000},async()=>{
 const weights=[],delays=[],calls=[];const fn=pThrottle({limit:1,interval:40,weight:function(){weights.push(this);return 1},onDelay:function(){delays.push(this)}})(function(x){calls.push([this,x]);return x});
 const a=fn(1),b=fn(2);assert.deepEqual(weights,[undefined,undefined]);assert.deepEqual(delays,[undefined]);await Promise.all([a,b]);fn.isEnabled=false;const receiver={id:3};assert.equal(await fn.call(receiver,3),3);assert.equal(weights.length,2);assert.equal(delays.length,1);assert.deepEqual(calls,[[undefined,1],[undefined,2],[receiver,3]]);
});
test('weight throw unchanged and onDelay throw ignored',{timeout:3000},async()=>{
 const reason={error:1},receiver={id:1};let calls=0,delays=0;const bad=pThrottle({limit:1,interval:40,weight:function(){assert.equal(this,receiver);throw reason},onDelay(){delays++}})(()=>{calls++});const rejected=await bad.call(receiver).then(()=>false,e=>e);assert.equal(rejected,reason);assert.equal(bad.queueSize,0);assert.equal(calls,0);assert.equal(delays,0);
 const seen=[];const fn=pThrottle({limit:1,interval:40,onDelay:function(x){assert.equal(this,receiver);seen.push(x);throw reason}})(function(x){assert.equal(this,receiver);return x});const a=fn.call(receiver,1),b=fn.call(receiver,2);assert.equal(fn.queueSize,1);assert.deepEqual(seen,[2]);assert.deepEqual(await Promise.all([a,b]),[1,2]);assert.equal(fn.queueSize,0);
});
`
};
export const types={
'promise-clear-queue':`import pDebounce from './index.js'; const f=pDebounce.promise(function(this:{id:number},x:number){return this.id+x},{after:true});const result:Promise<number>=f.call({id:1},2);const count:number=f.clearQueue({reason:1});f.clearQueue();f.clearQueue(undefined);f.clearQueue(null);const g=pDebounce.promise(async()=>1);const other:number=g.clearQueue(false);void [result,count,other];\n`,
 'throttle-callback-receivers':`import pThrottle from './index.js';type Context={cost:number;id:string};const f=pThrottle({limit:2,interval:40,weight:function(this:Context,x:number){return this.cost+x},onDelay:function(this:Context,x:number){const y:string=this.id;void [x,y]}})(async function(this:Context,x:number){return this.id+x});const p:Promise<string>=f.call({id:'a',cost:1},1);void p;\n`
};
