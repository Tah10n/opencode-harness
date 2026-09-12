import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const {createReader}=await import(path.join(process.env.PILOT_SOURCE,'src/reader.mjs'));
function observedSignal(){const controller=new AbortController(),signal=controller.signal,live=new Set(),add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);
 signal.addEventListener=(type,fn,options)=>{if(type==='abort')live.add(fn);return add(type,fn,options);};signal.removeEventListener=(type,fn,options)=>{if(type==='abort')live.delete(fn);return remove(type,fn,options);};return {controller,signal,live};}
test('legacy and options signatures preserve exact callback arguments',()=>{
 const data=Buffer.from('x'),seen=[];const read=createReader((path,cb)=>{assert.equal(path,'file');cb(null,data);cb(new Error('duplicate'));return 42;});
 const result=read('file',function(error,value){assert.equal(this,undefined);assert.equal(arguments.length,2);seen.push([error,value]);});
 assert.equal(result,undefined);assert.deepEqual(seen,[[null,data]]);assert.equal(seen[0][1],data);
 const s=observedSignal();read('file',{signal:s.signal},(error,value)=>{assert.equal(error,null);assert.equal(value,data);assert.equal(s.live.size,0);});assert.equal(s.live.size,0);
});
test('active abort delivers once, late underlying callback ignored',()=>{
 let underlying;const s=observedSignal(),reason={why:'cancel'},calls=[];const read=createReader((path,cb)=>{underlying=cb;});
 read('x',{signal:s.signal},(error,data)=>calls.push([error,data]));assert.equal(s.live.size,1);s.controller.abort(reason);
 assert.deepEqual(calls,[[reason,undefined]]);assert.equal(s.live.size,0);underlying(null,'late');underlying(new Error('later'));
 assert.deepEqual(calls,[[reason,undefined]]);
});
test('pre-abort synchronous notification and no underlying request',()=>{
 const s=observedSignal();s.controller.abort();let reads=0,called=false;
 const read=createReader(()=>{reads++;});read('x',{signal:s.signal},(error,data)=>{called=true;assert.equal(error,s.signal.reason);assert.equal(data,undefined);});
 assert.equal(called,true);assert.equal(reads,0);assert.equal(s.live.size,0);
});
test('underlying failure wins before later abort and requests independent',()=>{
 const callbacks=[],read=createReader((path,cb)=>callbacks.push(cb)),a=observedSignal(),b=observedSignal(),seen=[],failure={code:'read'};
 read('a',{signal:a.signal},(error,data)=>seen.push(['a',error,data]));read('b',{signal:b.signal},(error,data)=>seen.push(['b',error,data]));
 callbacks[0](failure,undefined);a.controller.abort();callbacks[1](null,'ok');assert.deepEqual(seen,[['a',failure,undefined],['b',null,'ok']]);assert.equal(a.live.size,0);assert.equal(b.live.size,0);
});
test('synchronous throw and callback throw retain identity and cleanup',()=>{
 const failure={why:'throw'},s=observedSignal();let called=0;
 assert.throws(()=>createReader(()=>{throw failure;})('x',{signal:s.signal},()=>called++),e=>e===failure);
 assert.equal(called,0);assert.equal(s.live.size,0);
 const s2=observedSignal();assert.throws(()=>createReader((p,cb)=>cb(null,'x'))('x',{signal:s2.signal},()=>{throw failure;}),e=>e===failure);assert.equal(s2.live.size,0);
});
test('missing callback rejected before I/O',()=>{
 let reads=0;const read=createReader(()=>reads++);assert.throws(()=>read('x',{}),TypeError);assert.equal(reads,0);
});
