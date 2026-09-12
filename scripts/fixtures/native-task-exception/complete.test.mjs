import {test} from 'node:test';import assert from 'node:assert/strict';
import {timed} from '../src/timing.mjs';test('plain timing',()=>{let n=0;const events=[];const fn=timed(x=>x*2,{now:()=>n++*5,record:e=>events.push(e)});assert.equal(fn(3),6);assert.deepEqual(events,[{duration:5,outcome:'return'}]);});

test('preserves receiver, arguments, and return identity',()=>{
  const events=[]; let tick=0;
  const value={result:true};
  const method=timed(function(...args){
    assert.equal(this.name,'receiver');
    assert.deepEqual(args,[undefined,0]);
    return value;
  },{now:()=>tick++ * 3,record:event=>events.push(event)});

  assert.strictEqual(method.call({name:'receiver'},undefined,0),value);
  assert.deepEqual(events,[{duration:3,outcome:'return'}]);
});

test('preserves thrown identity and handles Promise results synchronously',()=>{
  const events=[]; let tick=0;
  const thrown={error:true};
  const fail=timed(()=>{throw thrown;},{now:()=>tick++ * 4,record:event=>events.push(event)});
  assert.throws(()=>fail(),error=>error===thrown);
  assert.deepEqual(events,[{duration:4,outcome:'throw'}]);

  const promise=Promise.resolve('value');
  const wrapped=timed(()=>promise,{now:()=>tick++ * 4,record:event=>events.push(event)});
  assert.strictEqual(wrapped(),promise);
  assert.deepEqual(events,[{duration:4,outcome:'throw'},{duration:4,outcome:'return'}]);
});

test('invokes callable functions with an overridden apply property',()=>{
  const value={ok:true};
  function fn(){return value;}
  fn.apply=null;
  const wrapped=timed(fn,{now:()=>0,record:()=>{}});
  assert.strictEqual(wrapped(),value);
});
