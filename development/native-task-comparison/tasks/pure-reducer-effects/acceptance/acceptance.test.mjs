import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const {reduceCounter}=await import(path.join(process.env.PILOT_SOURCE,'src/counter-core.mjs'));const {createCounter}=await import(path.join(process.env.PILOT_SOURCE,'src/controller.mjs'));
test('pure clamped transition without input mutation',()=>{
 const state=Object.freeze({value:95,savedValue:4}),event=Object.freeze({type:'add',amount:10});const out=reduceCounter(state,event);
 assert.deepEqual(out,{state:{value:100,savedValue:4},effects:[{type:'notify',event:{type:'changed',value:100}}]});assert.deepEqual(state,{value:95,savedValue:4});
 out.state.value=7;out.effects[0].event.value=7;assert.deepEqual(reduceCounter(state,event).state,{value:100,savedValue:4});
 assert.deepEqual(reduceCounter({value:100,savedValue:1},{type:'add',amount:10}).effects,[]);
 assert.deepEqual(reduceCounter({value:-95,savedValue:4},{type:'add',amount:-10}).state,{value:-100,savedValue:4});
});
test('save effects ordered and emitted even when already saved',()=>{
 const state={value:3,savedValue:3};assert.deepEqual(reduceCounter(state,{type:'save'}),{state:{value:3,savedValue:3},effects:[{type:'persist',value:3},{type:'notify',event:{type:'saved',value:3}}]});
 assert.deepEqual(reduceCounter(state,{type:'reset'}),{state:{value:0,savedValue:3},effects:[{type:'notify',event:{type:'changed',value:0}}]});
});
test('controller executes effects in order after committing state',()=>{
 const log=[];let counter;counter=createCounter(0,{persist:value=>{log.push(['persist',value,counter.getState()]);},notify:event=>log.push(['notify',event,counter.getState()])});
 counter.dispatch({type:'add',amount:2});assert.deepEqual(counter.dispatch({type:'save'}),{value:2,savedValue:2});
 assert.deepEqual(log,[['notify',{type:'changed',value:2},{value:2,savedValue:0}],['persist',2,{value:2,savedValue:2}],['notify',{type:'saved',value:2},{value:2,savedValue:2}]]);
 const snapshot=counter.getState();snapshot.value=99;assert.equal(counter.getState().value,2);
});
test('effect error propagates with committed state and no later effects',()=>{
 const failure={why:'storage'},log=[];const counter=createCounter(1,{persist:()=>{log.push('persist');throw failure;},notify:()=>log.push('notify')});
 counter.dispatch({type:'add',amount:1});log.length=0;assert.throws(()=>counter.dispatch({type:'save'}),e=>e===failure);
 assert.deepEqual(log,['persist']);assert.deepEqual(counter.getState(),{value:2,savedValue:2});
});
test('invalid event leaves controller state and effects unchanged',()=>{
 const log=[],counter=createCounter(4,{persist:x=>log.push(x),notify:x=>log.push(x)});
 for(const event of [{type:'bad'},{type:'add',amount:NaN},{type:'add',amount:201},{type:'add',amount:'1'}]){assert.throws(()=>reduceCounter({value:4,savedValue:4},event),TypeError);assert.throws(()=>counter.dispatch(event),TypeError);}
 assert.deepEqual(counter.getState(),{value:4,savedValue:4});assert.deepEqual(log,[]);
 assert.deepEqual(reduceCounter({value:0,savedValue:4},{type:'reset'}).effects,[]);
});

test('unchanged signed zero preserves legacy state identity',()=>{
 for(const event of [{type:'add',amount:0},{type:'add',amount:-0},{type:'reset'}]){
 const pure=reduceCounter({value:-0,savedValue:-0},event);assert.equal(Object.is(pure.state.value,-0),true);assert.equal(Object.is(pure.state.savedValue,-0),true);assert.deepEqual(pure.effects,[]);
 const c=createCounter(-0,{persist:()=>assert.fail('persist'),notify:()=>assert.fail('notify')});assert.equal(Object.is(c.dispatch(event).value,-0),true);}
});
