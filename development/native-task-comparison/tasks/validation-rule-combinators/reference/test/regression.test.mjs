import {test} from 'node:test';import assert from 'node:assert/strict';
import {allOf,anyOf} from '../src/rules.mjs';import {validateProfile} from '../src/profile.mjs';
test('AND stops first failure and OR first success',()=>{
 const seen=[],input=Object.freeze({x:1}),error={code:'first'},failed=Object.freeze({ok:false,errors:Object.freeze([error])});
 const rule=n=>function(value){assert.equal(this,undefined);assert.equal(value,input);seen.push(n);return n===2?failed:{ok:true,errors:[]};};
 const result=allOf([rule(1),rule(2),rule(3)])(input);assert.deepEqual(seen,[1,2]);assert.equal(result.ok,false);assert.equal(result.errors[0],error);assert.notEqual(result.errors,failed.errors);result.errors.push('new');assert.equal(failed.errors.length,1);
 seen.length=0;assert.deepEqual(anyOf([rule(2),rule(1),rule(3)])(input),{ok:true,errors:[]});assert.deepEqual(seen,[2,1]);
});
test('nested failures, identity, empty and thrown values',()=>{
 const e1={n:1},e2={n:2};const left=allOf([()=>({ok:false,errors:[e1]})]),right=()=>({ok:false,errors:[e2]});const result=anyOf([left,right])('x');assert.deepEqual(result,{ok:false,errors:[e1,e2]});assert.equal(result.errors[0],e1);assert.equal(result.errors[1],e2);
 assert.deepEqual(allOf([])(null),{ok:true,errors:[]});assert.deepEqual(anyOf([])(null),{ok:false,errors:[]});
 for(const compose of [allOf,anyOf]){let called=false;assert.throws(()=>compose([()=>{throw 0;},()=>{called=true;return{ok:true,errors:[]};}])(null),e=>e===0);assert.equal(called,false);}
});
test('profile compatibility: name precedence and either contact',()=>{
 assert.deepEqual(validateProfile({name:'',email:'bad',phone:'bad'}),{ok:false,errors:['name required']});assert.deepEqual(validateProfile({name:'x'.repeat(21),email:'a@b',phone:''}),{ok:false,errors:['name too long']});assert.deepEqual(validateProfile({name:'Ada',email:'a@b',phone:''}),{ok:true,errors:[]});assert.deepEqual(validateProfile({name:'Ada',email:'bad',phone:'123456'}),{ok:true,errors:[]});assert.deepEqual(validateProfile({name:'Ada',email:'bad',phone:'x'}),{ok:false,errors:['email invalid','phone invalid']});
});

test('large error arrays do not use argument spreading',()=>{const error={code:'x'},errors=Array(200000).fill(error);const result=anyOf([()=>({ok:false,errors})])(null);assert.equal(result.errors.length,200000);assert.equal(result.errors[0],error);assert.equal(result.errors.at(-1),error);assert.notEqual(result.errors,errors);});
