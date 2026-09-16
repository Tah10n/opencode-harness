const assert = require('node:assert/strict');
const E = require(process.cwd() + '/index.js');
function check(EE) {
 const e = new EE(), ctx = {}, calls=[];
 function fn(...args){calls.push([this,args]);}
 e.on('x',fn,ctx);const first=e.subscribe('x',fn,ctx),second=e.subscribe('x',fn,ctx);e.once('x',fn,ctx);
 assert.deepEqual(e.listeners('x'),[fn,fn,fn,fn]);first();first();assert.equal(e.listenerCount('x'),3);
 e.emit('x',1,2,3,4,5,6,7);assert.equal(calls.length,3);for(const [self,args]of calls){assert.equal(self,ctx);assert.deepEqual(args,[1,2,3,4,5,6,7]);}
 second();assert.equal(e.listenerCount('x'),1);assert.equal(e.emit('empty'),false);
 for(const remove of ['off','removeListener','removeAllListeners']){
   const x=new EE(), cancel=x.subscribe('x',fn);x[remove]('x',fn);x.on('x',fn);cancel();assert.equal(x.listenerCount('x'),1,remove);
 }
 const s=Symbol('s'),x=new EE();let count=0;const cancel=x.subscribe(s,function(){assert.equal(this,x);count++;});
 x.emit(s);assert.equal(count,1);assert.deepEqual(x.eventNames(),[s]);cancel();assert.equal(x.listenerCount(s),0);assert.deepEqual(x.eventNames(),[]);cancel();
 assert.throws(()=>x.subscribe('bad',null));assert.deepEqual(x.eventNames(),[]);
 const r=new EE();let recur=0;const stop=r.subscribe('__proto__',()=>{recur++;stop();r.emit('__proto__');});r.emit('__proto__');assert.equal(recur,1);assert.deepEqual(r.eventNames(),[]);
 const during=new EE(),order=[];let c;during.on('x',()=>{order.push('first');c();});c=during.subscribe('x',()=>order.push('second'));during.on('x',()=>order.push('last'));
 during.emit('x');assert.deepEqual(order,['first','second','last']);order.length=0;during.emit('x');assert.deepEqual(order,['first','last']);
 const defaults=new EE();for(const context of [undefined,null,false,0,'']){const d=defaults.subscribe('x',function(){assert.equal(this,defaults);},context);defaults.emit('x');d();}
}
check(E);
import(require('node:url').pathToFileURL(process.cwd()+'/index.mjs').href).then(m=>{check(m.default);console.log('independent CJS/ESM subscription contracts passed');}).catch(e=>{console.error(e);process.exitCode=1;});
