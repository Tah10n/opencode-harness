// Independent development rubric inputs. Never mounted in an author container.
const common = `import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getEventListeners} from 'node:events';
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {let resolve; const promise=new Promise(r=>{resolve=r}); return {promise,resolve}};
`;
export const cases = {
  'limit-function-controls': common + `import {limitFunction} from './index.js';
test('live wrapper capacity and independent instances', {timeout:3000}, async()=>{
 const gate=deferred(),calls=[]; const f=limitFunction(async n=>{calls.push(n);await gate.promise;return n*2},{concurrency:1});
 const a=f(2),b=f(3); await tick();
 assert.equal(f.activeCount,1);assert.equal(f.pendingCount,1);assert.deepEqual(calls,[2]);assert.equal(f.concurrency,1);
 const separate=limitFunction(async x=>x+1,{concurrency:1});assert.equal(await separate(8),9);assert.equal(separate.activeCount,0);assert.equal(f.activeCount,1);
 f.concurrency=2;await tick();assert.equal(f.activeCount,2);assert.equal(f.pendingCount,0);assert.deepEqual(calls,[2,3]);
 for(const invalid of [0,-1,1.2,NaN])assert.throws(()=>{f.concurrency=invalid});assert.equal(f.concurrency,2);
 assert.throws(()=>{f.activeCount=99});assert.throws(()=>{f.pendingCount=99});
 gate.resolve();assert.deepEqual(await Promise.all([a,b]),[4,6]);await tick();assert.equal(f.activeCount,0);assert.equal(f.pendingCount,0);
 const reason={x:1};const fail=limitFunction(async()=>{throw reason},{concurrency:1});await assert.rejects(fail(),e=>e===reason);
});
test('wrapper still clears pending rejections', {timeout:3000}, async()=>{
 const gate=deferred();const f=limitFunction(async()=>gate.promise,{concurrency:1,rejectOnClear:true});const a=f(),b=f();const check=assert.rejects(b,e=>e.name==='AbortError');
 await tick();assert.equal(f.activeCount,1);assert.equal(f.pendingCount,1);f.clearQueue();await check;assert.equal(f.pendingCount,0);gate.resolve();await a;
});
`,
  'clear-queue-reason': common + `import pLimit,{limitFunction} from './index.js';
for(const api of ['limit','wrapper'])for(const reason of [{identity:1},null,false,0,'stop',undefined])test(api+' clears '+String(reason),{timeout:3000},async()=>{
 const gate=deferred();let called=0;const fn=async x=>{called++;if(x==='active')await gate.promise;return x};
 const f=api==='limit'?pLimit({concurrency:1,rejectOnClear:true}):limitFunction(fn,{concurrency:1,rejectOnClear:true});const call=x=>api==='limit'?f(fn,x):f(x);
 const active=call('active'),a=call('queued'),b=call('queued2');
 const settled=[a,b].map(p=>p.then(()=>({ok:true}),error=>({error})));await tick();assert.equal(called,1);
 f.clearQueue(reason);const results=await Promise.all(settled);for(const result of results){assert.equal(result.ok,undefined);if(reason===undefined)assert.equal(result.error.name,'AbortError');else assert.equal(result.error,reason)}
 assert.equal(called,1);gate.resolve();assert.equal(await active,'active');assert.equal(await call('later'),'later');assert.equal(called,2);
});
for(const api of ['limit','wrapper'])test(api+' disabled option retains pending promise semantics',{timeout:3000},async()=>{
 const gate=deferred();let calls=0,settled=false;const fn=async()=>{calls++;await gate.promise};const f=api==='limit'?pLimit(1):limitFunction(fn,{concurrency:1});const call=()=>api==='limit'?f(fn):f();
 const a=call(),b=call();b.then(()=>settled=true,()=>settled=true);await tick();assert.equal(calls,1);f.clearQueue({why:'ignored'});gate.resolve();await a;await tick();assert.equal(calls,1);assert.equal(settled,false);await call();assert.equal(calls,2);
});
`,
  'bind-methods-atomic': common + `import Emittery from './index.js';
test('normal conflicts preserve all target descriptors',()=>{
 const e=new Emittery();
 const own={emit:1};const frozen={};Object.defineProperty(frozen,'emit',{value:undefined});
 const inherited=Object.create({emit:()=>{}});const sealed=Object.preventExtensions({});
 for(const target of [own,frozen,inherited,sealed]){const before=Object.getOwnPropertyDescriptors(target);assert.throws(()=>e.bindMethods(target,['on','emit']));assert.deepEqual(Object.getOwnPropertyDescriptors(target),before)}
 const bad={};assert.throws(()=>e.bindMethods(bad,['on','notARealMethod']));assert.deepEqual(bad,{});
});
test('duplicates bind once, undefined configurable properties and receiver survive',async()=>{
 const e=new Emittery(),other=new Emittery(),target={};e.bindMethods(target,['on','emit','on']);
 for(const name of ['on','emit']){const d=Object.getOwnPropertyDescriptor(target,name);assert.equal(d.enumerable,false);assert.equal(d.writable,false);assert.equal(d.configurable,false);assert.equal(typeof d.value,'function')}
 const seen=[];const off=target.on('event',x=>seen.push(x));await target.emit('event',5);await other.emit('event',9);assert.deepEqual(seen,[{name:'event',data:5}]);off();await target.emit('event',8);assert.deepEqual(seen,[{name:'event',data:5}]);
 const replacement={emit:undefined};e.bindMethods(replacement,['emit']);const replaced=Object.getOwnPropertyDescriptor(replacement,'emit');assert.equal(typeof replaced.value,'function');assert.equal(replaced.enumerable,false);assert.equal(replaced.configurable,true);assert.equal(replaced.writable,true);
});
`,
  'listener-count-deduplicate': common + `import Emittery from './index.js';
test('identity deduplication preserves additive distinct-event and iterator counts',async()=>{
 const e=new Emittery(),a=Symbol('same'),b=Symbol('same');const off=[e.on('x',()=>{}),e.on(a,()=>{}),e.on(b,()=>{}),e.onAny(()=>{})];
 const iterator=e.events('x'),all=e.anyEvent();const total=e.listenerCount(),x=e.listenerCount('x'),ac=e.listenerCount(a),bc=e.listenerCount(b);
 assert.equal(e.listenerCount(['x','x']),x);assert.equal(e.listenerCount([a,a,b]),ac+bc);assert.equal(e.listenerCount(['x',a,'x',a,b,b]),x+ac+bc);assert.equal(e.listenerCount([]),0);
 assert.throws(()=>e.listenerCount(['x','x',null]));assert.equal(e.listenerCount(),total);assert.equal(e.listenerCount('x'),x);
 await iterator.return();await all.return();for(const f of off)f();assert.equal(e.listenerCount(),0);
});
`,
  'clear-queue-count': common + `import PQueue from './source/index.ts';
test('clear reports queued count and preserves active work and waiters',{timeout:3000},async()=>{
 const q=new PQueue({concurrency:1});const gate=deferred();let calls=0;const active=q.add(async()=>{calls++;await gate.promise;return 7});
 q.add(()=>{calls++});q.add(()=>{calls++});await tick();assert.equal(q.pending,1);assert.equal(q.size,2);
 let empty=0,idle=0,next=0;q.on('empty',()=>empty++);q.on('idle',()=>idle++);q.on('next',()=>next++);let idleDone=false;const e=q.onEmpty(),i=q.onIdle().then(()=>idleDone=true);
 assert.equal(q.clear(),2);await e;await tick();assert.equal(q.size,0);assert.equal(q.pending,1);assert.equal(calls,1);assert.equal(idleDone,false);assert.equal(q.clear(),0);assert.ok(empty>=1&&next>=1);assert.equal(idle,0);
 gate.resolve();assert.equal(await active,7);await i;assert.equal(idleDone,true);assert.equal(q.runningTasks.length,0);
});
test('paused/custom queue and discarded promise compatibility',{timeout:3000},async()=>{
 class Custom {items=[];get size(){return this.items.length}enqueue(run,options){this.items.push({run,options})}dequeue(){return this.items.shift()?.run}filter(){return this.items.map(x=>x.run)}setPriority(){}}
 for(const options of [{autoStart:false},{autoStart:false,queueClass:Custom}]){
  const q=new PQueue(options),signal=new AbortController();let calls=0,settled=false;q.add(()=>calls++,{signal:signal.signal}).then(()=>settled=true,()=>settled=true);q.add(()=>calls++);await tick();assert.equal(q.size,2);assert.equal(q.pending,0);
  assert.equal(q.clear(),2);assert.equal(q.clear(),0);assert.equal(getEventListeners(signal.signal,'abort').length,0);signal.abort();q.start();await tick();assert.equal(calls,0);assert.equal(settled,false);assert.equal(await q.add(()=>9),9);
 }
});
`,
  'abortable-queue-waiters': common + `import PQueue from './source/index.ts';
for(const method of ['onEmpty','onIdle','onPendingZero'])test(method+' cancellation isolates the waiter',{timeout:3000},async()=>{
 const q=new PQueue({concurrency:1}),gate=deferred();let calls=0;const active=q.add(async()=>{calls++;await gate.promise;return 1});q.add(()=>{calls++;return 2});await tick();assert.equal(q.pending,1);assert.equal(q.size,1);
 const controller=new AbortController(),reason={method};const event={onEmpty:'empty',onIdle:'idle',onPendingZero:'pendingZero'}[method],prior=q.listenerCount(event);
 const completedController=new AbortController();const aborted=q[method]({signal:controller.signal});const rejected=assert.rejects(aborted,e=>e===reason);const other=q[method]({signal:completedController.signal});await tick();assert.ok(q.listenerCount(event)>prior);
 controller.abort(reason);await rejected;assert.equal(getEventListeners(controller.signal,'abort').length,0);assert.equal(q.pending,1);assert.equal(q.size,1);assert.equal(calls,1);
 gate.resolve();await active;await other;await q.onIdle();assert.equal(calls,2);assert.equal(q.listenerCount(event),prior);assert.equal(getEventListeners(completedController.signal,'abort').length,0);completedController.abort('after completion');
});
for(const method of ['onEmpty','onIdle','onPendingZero'])test(method+' initial condition and cleanup',{timeout:3000},async()=>{
 const q=new PQueue();const reason=Symbol('abort');await assert.rejects(q[method]({signal:AbortSignal.abort(reason)}),e=>e===reason);
 const c=new AbortController();await q[method]({signal:c.signal});assert.equal(getEventListeners(c.signal,'abort').length,0);c.abort();await q[method]();
});
test('empty is distinct from idle and paused pending zero ignores queued work',{timeout:3000},async()=>{
 const q=new PQueue({concurrency:1}),gate=deferred();const active=q.add(()=>gate.promise);await tick();assert.equal(q.size,0);assert.equal(q.pending,1);await q.onEmpty({signal:new AbortController().signal});
 let idle=false;q.onIdle().then(()=>idle=true);await tick();assert.equal(idle,false);q.pause();q.add(()=>2);assert.equal(q.size,1);const c=new AbortController(),pending=q.onPendingZero({signal:c.signal});gate.resolve();await active;await pending;assert.equal(q.size,1);assert.equal(q.pending,0);assert.equal(getEventListeners(c.signal,'abort').length,0);assert.equal(idle,false);q.start();await q.onIdle();
});
`,
};

export const types = {
 'limit-function-controls': `import {limitFunction} from './index.js'; const f=limitFunction(async(n:number)=>n,{concurrency:1}); const a:number=f.activeCount;const b:number=f.pendingCount;f.concurrency=2;const c:number=f.concurrency;const p:Promise<number>=f(1);\n// @ts-expect-error count is readonly\nf.activeCount=2;\n// @ts-expect-error count is readonly\nf.pendingCount=2;\n`,
 'clear-queue-reason': `import pLimit,{limitFunction} from './index.js'; const reason:unknown={why:1};const l=pLimit({concurrency:1,rejectOnClear:true});l.clearQueue(reason);l.clearQueue();const f=limitFunction(async()=>1,{concurrency:1});f.clearQueue(reason);f.clearQueue(undefined);\n`,
 'bind-methods-atomic': `import Emittery from './index.js';new Emittery().bindMethods({},['on','emit','on'] as const);\n`,
 'listener-count-deduplicate': `import Emittery from './index.js';const key=Symbol();const e=new Emittery<{x:number;[key]:string}>();const n:number=e.listenerCount(['x',key,'x']);\n`,
 'clear-queue-count': `import PQueue from './source/index.js';const q=new PQueue();const n:number=q.clear();\n`,
 'abortable-queue-waiters': `import PQueue from './source/index.js';const q=new PQueue();const c=new AbortController();for(const p of [q.onEmpty(),q.onIdle(),q.onPendingZero(),q.onEmpty({signal:c.signal}),q.onIdle({}),q.onPendingZero({signal:c.signal})]){const checked:Promise<void>=p;}\n`,
};
