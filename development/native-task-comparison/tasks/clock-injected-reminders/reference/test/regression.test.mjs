import {test} from 'node:test';import assert from 'node:assert/strict';
import {selectDue} from '../src/reminder-core.mjs';import {dueReminders} from '../src/reminders.mjs';
test('inclusive due boundary and original order/identity',()=>{
 const a={id:'a',dueAt:10,enabled:true},b={id:'b',dueAt:9,enabled:false},c={id:'c',dueAt:null,enabled:true},d={id:'d',dueAt:11,enabled:true},e={id:'e',dueAt:0,enabled:true};const input=Object.freeze([a,b,c,d,e]);
 const result=selectDue(input,10);assert.deepEqual(result,[a,e]);assert.equal(result[0],a);assert.notEqual(result,input);assert.deepEqual(input,[a,b,c,d,e]);
});
test('one injected clock observation for full list including empty',()=>{
 let reads=0;const clock=()=>{reads++;return reads===1?5:100;};
 const items=[{id:'a',dueAt:5,enabled:true},{id:'b',dueAt:6,enabled:true}];
 assert.deepEqual(dueReminders(items,{clock}),[items[0]]);assert.equal(reads,1);
 assert.deepEqual(dueReminders([],{clock}),[]);assert.equal(reads,2);
});
test('pure core and injected wrapper never read ambient time',()=>{
 const original=Date.now;let ambient=0;Date.now=()=>{ambient++;throw new Error('ambient');};
 try{const item={id:'x',dueAt:2,enabled:true};assert.deepEqual(selectDue([item],2),[item]);assert.deepEqual(dueReminders([item],{clock:()=>2}),[item]);assert.equal(ambient,0);}finally{Date.now=original;}
});
test('default clock selected at call time and errors propagate',()=>{
 const original=Date.now;let reads=0;Date.now=()=>{reads++;return 7;};
 try{const item={id:'x',dueAt:7,enabled:true};assert.deepEqual(dueReminders([item]),[item]);assert.equal(reads,1);}finally{Date.now=original;}
 const failure={why:'clock'};assert.throws(()=>dueReminders([],{clock:()=>{throw failure;}}),e=>e===failure);
 for(const now of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){assert.throws(()=>selectDue([],now),RangeError);assert.throws(()=>dueReminders([],{clock:()=>now}),RangeError);}
 assert.deepEqual(selectDue([],Number.MAX_SAFE_INTEGER),[]);
});
