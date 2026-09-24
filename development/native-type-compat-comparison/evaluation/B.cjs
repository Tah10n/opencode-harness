const assert=require('node:assert/strict');
async function check(E){
 for(const event of ['x','__proto__',Symbol('event')])for(const count of [0,1,2,5,6,9]){
  const e=new E(),obj={},args=Array.from({length:count},(_,i)=>i===0?obj:i);let old=0;const fn=()=>old++;e.on(event,fn);
  const a=e.waitFor(event),b=e.waitFor(event);assert.equal(e.listenerCount(event),3);assert.equal(e.listeners(event)[0],fn);assert.equal(e.emit(event,...args),true);
  const ar=await a,br=await b;assert.deepEqual(ar,args);assert.deepEqual(br,args);assert.notEqual(ar,br);if(count)assert.equal(ar[0],obj);assert.equal(e.listenerCount(event),1);assert.equal(old,1);e.emit(event);assert.equal(old,2);
 }
 const r=new E();const wait=r.waitFor('x');r.once('x',()=>r.emit('x','nested'));r.emit('x','outer');assert.deepEqual(await wait,['outer']);assert.deepEqual(r.eventNames(),[]);
 const tracked=()=>{const controller=new AbortController(),signal=controller.signal,add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal),active=new Set();signal.addEventListener=(type,fn,...rest)=>{if(type==='abort')active.add(fn);return add(type,fn,...rest);};signal.removeEventListener=(type,fn,...rest)=>{if(type==='abort')active.delete(fn);return remove(type,fn,...rest);};return{controller,signal,active};};
 for(const reason of [new Error('exact'),{},null,17]){
  const e=new E(),t=tracked();t.controller.abort(reason);const p=e.waitFor('x',{signal:t.signal});await assert.rejects(p,err=>err===reason);assert.equal(e.listenerCount('x'),0);assert.equal(t.active.size,0);
  const pending=tracked(),other=e.waitFor('x'),rejecting=e.waitFor('x',{signal:pending.signal});const rejected=assert.rejects(rejecting,err=>err===reason);assert.equal(pending.active.size,1);pending.controller.abort(reason);await rejected;assert.equal(pending.active.size,0);assert.equal(e.listenerCount('x'),1);e.emit('x','other');assert.deepEqual(await other,['other']);
 }
 {const e=new E(),t=tracked(),p=e.waitFor('x',{signal:t.signal});e.emit('x',7);assert.equal(t.active.size,0);t.controller.abort('late');assert.deepEqual(await p,[7]);assert.deepEqual(e.eventNames(),[]);}
 for(const remove of ['off','removeAllListeners']){const e=new E(),t=tracked(),reason={},p=e.waitFor('x',{signal:t.signal}),rejected=assert.rejects(p,err=>err===reason);e[remove]('x');let n=0;const fn=()=>n++;e.on('x',fn);t.controller.abort(reason);await rejected;assert.equal(t.active.size,0);assert.deepEqual(e.listeners('x'),[fn]);e.emit('x');assert.equal(n,1);}
 const e=new E(),ctx={};e.on('x',function(){assert.equal(this,ctx);},ctx);const p=e.waitFor('x');e.emit('x');await p;
}
const watchdog=setTimeout(()=>{console.error('waitFor acceptance timed out');process.exitCode=1;process.exit(1);},5000);
(async()=>{await check(require(process.cwd()+'/index.js'));const m=await import(require('node:url').pathToFileURL(process.cwd()+'/index.mjs').href);await check(m.default);console.log('independent CJS/ESM waitFor contracts passed');})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));
