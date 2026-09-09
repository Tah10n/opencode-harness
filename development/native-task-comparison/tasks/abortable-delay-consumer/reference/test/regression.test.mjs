import {test} from 'node:test';import assert from 'node:assert/strict';
import {delay} from '../src/delay.mjs';
function clock(){const callbacks=new Map(),scheduled=[],cleared=[];let next=0;return {scheduled,cleared,callbacks,setTimeout(fn,ms){const id=next++;callbacks.set(id,fn);scheduled.push([id,ms]);return id;},clearTimeout(id){cleared.push(id);callbacks.delete(id);},fire(id){const fn=callbacks.get(id);callbacks.delete(id);fn?.();}};}
function observedSignal(){const controller=new AbortController(),signal=controller.signal,live=new Set(),originalAdd=signal.addEventListener.bind(signal),originalRemove=signal.removeEventListener.bind(signal);
 signal.addEventListener=(type,fn,options)=>{if(type==='abort')live.add(fn);return originalAdd(type,fn,options);};
 signal.removeEventListener=(type,fn,options)=>{if(type==='abort')live.delete(fn);return originalRemove(type,fn,options);};
 return {controller,signal,live};}
test('successful completion is asynchronous and cleans listener',async()=>{
 const c=clock(),s=observedSignal();const result=delay(12,{...c,signal:s.signal});let done=false;result.then(()=>{done=true;});
 assert.deepEqual(c.scheduled,[[0,12]]);assert.equal(s.live.size,1);await Promise.resolve();assert.equal(done,false);
 c.fire(0);assert.equal(await result,undefined);assert.equal(s.live.size,0);assert.deepEqual(c.cleared,[]);
 s.controller.abort('late');assert.deepEqual(c.cleared,[]);
});
test('active abort keeps reason identity and cancels zero handle',async()=>{
 const c=clock(),s=observedSignal(),reason={why:'stop'};const result=delay(4,{...c,signal:s.signal});const reject=assert.rejects(result,e=>e===reason);
 const late=c.callbacks.get(0);s.controller.abort(reason);await reject;
 assert.deepEqual(c.cleared,[0]);assert.equal(c.callbacks.size,0);assert.equal(s.live.size,0);late();assert.deepEqual(c.cleared,[0]);
});
test('pre-aborted signal creates no work or listener',async()=>{
 const c=clock(),s=observedSignal();s.controller.abort(new Error('already'));await assert.rejects(delay(0,{...c,signal:s.signal}),e=>e===s.signal.reason);
 assert.deepEqual(c.scheduled,[]);assert.deepEqual(c.cleared,[]);assert.equal(s.live.size,0);
});
test('invalid durations reject without touching timers/listeners',async()=>{
 const c=clock(),s=observedSignal();for(const ms of [-1,1.5,NaN,Infinity,1000001,'2'])await assert.rejects(delay(ms,{...c,signal:s.signal}),RangeError);
 assert.deepEqual(c.scheduled,[]);assert.equal(s.live.size,0);
});
test('no signal and independent pending calls',async()=>{
 const c=clock(),a=observedSignal(),b=observedSignal();const pa=delay(0,{...c,signal:a.signal}),pb=delay(2,{...c,signal:b.signal}),pc=delay(3,c);
 const rejected=assert.rejects(pa,e=>e===a.signal.reason);a.controller.abort();await rejected;c.fire(1);c.fire(2);
 assert.equal(await pb,undefined);assert.equal(await pc,undefined);assert.deepEqual(c.cleared,[0]);assert.equal(b.live.size,0);
});
