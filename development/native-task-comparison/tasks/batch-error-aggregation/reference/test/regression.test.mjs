import {test} from 'node:test';import assert from 'node:assert/strict';
import {collectErrors} from '../src/collect.mjs';import {validate,validateAll} from '../src/validation.mjs';
test('generic collection ordered identities and falsey errors',()=>{
 const value={},a={code:'a'},b={code:'b'},calls=[];
 const rules=[function(input){assert.equal(this,undefined);assert.equal(arguments.length,1);assert.equal(input,value);calls.push(1);return null;},()=>{calls.push(2);return a;},()=>{calls.push(3);return b;}];
 assert.deepEqual(collectErrors(value,rules),[a,b]);assert.deepEqual(calls,[1,2,3]);calls.length=0;
 const first=collectErrors(value,rules,{firstOnly:true});assert.deepEqual(first,[a]);assert.equal(first[0],a);assert.deepEqual(calls,[1,2]);
 assert.deepEqual(collectErrors(0,[()=>undefined,()=>0,()=>false,()=>'',()=>null]),[0,false,'']);
});
test('first-only and throws never run later rules',()=>{
 const failure={why:'rule'};let later=0;assert.throws(()=>collectErrors(0,[()=>{throw failure;},()=>{later++;}]),e=>e===failure);assert.equal(later,0);
 assert.deepEqual(collectErrors(0,[]),[]);const first=collectErrors(0,[()=>0,()=>{later++;}],{firstOnly:true});assert.deepEqual(first,[0]);assert.equal(later,0);
});
test('all field errors in original priority and fail-fast wrapper',()=>{
 const record=Object.freeze({name:' ',age:17,email:'bad',newsletter:true}),expected=[{field:'name',code:'required'},{field:'age',code:'invalid'},{field:'email',code:'invalid'}];
 assert.deepEqual(validateAll(record),expected);assert.deepEqual(validate(record),expected[0]);
 assert.deepEqual(record,{name:' ',age:17,email:'bad',newsletter:true});
});
test('required, bounds and exact local email grammar',()=>{
 assert.deepEqual(validateAll({name:'x'.repeat(41),age:121,newsletter:true}),[{field:'name',code:'too_long'},{field:'age',code:'invalid'},{field:'email',code:'required'}]);
 assert.deepEqual(validateAll({name:'x'.repeat(40),age:18,email:' A+tag@Example.TEST ',newsletter:true}),[]);
 assert.equal(validate({name:'ok',age:120,email:null}),null);
 assert.deepEqual(validateAll({name:null,age:'18',email:4}),[{field:'name',code:'required'},{field:'age',code:'invalid'},{field:'email',code:'invalid'}]);
 assert.deepEqual(validateAll({name:'ok',age:20,email:' \t ',newsletter:false}),[]);
});
test('fresh errors and results cannot change future validation',()=>{
 const record={name:'',age:10},a=validateAll(record);a[0].code='changed';a.push('bad');assert.deepEqual(validateAll(record),[{field:'name',code:'required'},{field:'age',code:'invalid'}]);
});
