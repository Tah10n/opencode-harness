import {test} from 'node:test';import assert from 'node:assert/strict';
import {timed} from '../src/timing.mjs';
test('dynamic receiver and exact arguments',()=>{
 const events=[],times=[5,12,20,23];let index=0;const now=()=>times[index++];
 const fn=function(...args){assert.equal(args.length,3);assert.equal(args[0],token);assert.equal(args[1],undefined);assert.equal(args[2],4);assert.ok(this&&Object.hasOwn(this,'value'));return this.value;};
 const token={};const wrapped=timed(fn,{now,record:e=>events.push(e)}),a={value:token,wrapped},b={value:7};
 assert.equal(a.wrapped(token,undefined,4),token);assert.equal(wrapped.call(b,token,undefined,4),7);
 assert.equal(index,4);assert.deepEqual(events,[{duration:7,outcome:'return'},{duration:3,outcome:'return'}]);
});
test('thrown value unchanged and event follows invocation',()=>{
 const log=[],failure={reason:'x'};let time=0;
 const wrapped=timed(function(){log.push('body');throw failure;},{now:()=>{log.push('clock');return time++*3;},record:e=>{log.push(e);}});
 assert.throws(()=>wrapped(),e=>e===failure);assert.deepEqual(log,['clock','body','clock',{duration:3,outcome:'throw'}]);
});
test('promise remains identical and measures synchronous call only',async()=>{
 let resolve;const promise=new Promise(r=>{resolve=r;});let clock=0;const events=[];
 const wrapped=timed(()=>promise,{now:()=>clock++,record:e=>events.push(e)});
 assert.equal(wrapped(),promise);assert.deepEqual(events,[{duration:1,outcome:'return'}]);assert.equal(clock,2);
 resolve(9);await promise;assert.equal(events.length,1);assert.equal(clock,2);
});
test('plain calls, zero args and no function mutation',()=>{
 const fn=function(){assert.equal(this,undefined);assert.equal(arguments.length,0);return undefined;};Object.freeze(fn);
 const keys=Reflect.ownKeys(fn),events=[];const wrapped=timed(fn,{now:()=>4,record:e=>events.push(e)});
 assert.notEqual(wrapped,fn);assert.equal(wrapped(),undefined);assert.deepEqual(events,[{duration:0,outcome:'return'}]);assert.deepEqual(Reflect.ownKeys(fn),keys);
});
test('nested wrappers record each synchronous invocation',()=>{
 let tick=0;const log=[];const now=()=>tick++;
 const inner=timed(x=>x+1,{now,record:e=>log.push(['inner',e])});
 const outer=timed(x=>inner(x)*2,{now,record:e=>log.push(['outer',e])});
 assert.equal(outer(3),8);assert.deepEqual(log,[['inner',{duration:1,outcome:'return'}],['outer',{duration:3,outcome:'return'}]]);
});

test('callable own apply member does not replace invocation',()=>{
 const fn=function(x){return this.base+x;};fn.apply=null;const events=[];let t=0;
 const wrapped=timed(fn,{now:()=>t++,record:e=>events.push(e)});
 let value;assert.doesNotThrow(()=>{value=wrapped.call({base:4},3);});assert.equal(value,7);assert.deepEqual(events,[{duration:1,outcome:'return'}]);assert.equal(fn.apply,null);
});
