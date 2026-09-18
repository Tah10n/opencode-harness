import {test} from 'node:test';import assert from 'node:assert/strict';
import {unwrap} from '../src/result.mjs';
test('legacy direct values and lookalike objects',()=>{
 const fallback={default:true};for(const value of [null,false,0,'',()=>1,{kind:'none'},{kind:'error',error:'x'}])assert.equal(unwrap(value,fallback),value);
 assert.equal(unwrap(undefined,fallback),fallback);const obj={kind:'some',value:7};assert.equal(unwrap(obj,0,{tagged:false}),obj);
});
test('some preserves any explicit value including undefined',()=>{
 for(const value of [undefined,null,false,0,'',{},Promise.resolve(1)]){
 const packet=Object.freeze({kind:'some',value,extra:2});assert.equal(unwrap(packet,'fallback',{tagged:true}),value);assert.equal(packet.value,value);}
 const f=()=>1;assert.equal(unwrap({kind:'none'},f,{tagged:true}),f);
});
test('error throws exact value including undefined, never returns fallback',()=>{
 for(const error of [new Error('x'),{code:2},undefined,null,false,0,'']){
 let caught=false,value='not thrown';try{unwrap({kind:'error',error},'fallback',{tagged:true});}catch(e){caught=true;value=e;}
 assert.equal(caught,true);assert.equal(value,error);}
});
test('malformed protocol fails instead of treating as absence',()=>{
 for(const input of [null,undefined,4,'none',{},[],{kind:'other'},{kind:'some'},{kind:'error'},{kind:undefined},Object.create({kind:'none'})])assert.throws(()=>unwrap(input,9,{tagged:true}),TypeError);
 const inherited=Object.create({value:8});inherited.kind='some';assert.throws(()=>unwrap(inherited,9,{tagged:true}),TypeError);
 const inheritedError=Object.create({error:'x'});inheritedError.kind='error';assert.throws(()=>unwrap(inheritedError,9,{tagged:true}),TypeError);
});
test('none ignores unrelated payload and frozen/null prototype packets',()=>{
 const packet=Object.assign(Object.create(null),{kind:'none',value:'not chosen',error:'not thrown'});Object.freeze(packet);
 const fallback={x:1};assert.equal(unwrap(packet,fallback,{tagged:true}),fallback);assert.deepEqual(Reflect.ownKeys(packet),['kind','value','error']);
 assert.equal(unwrap({kind:'some',value:2,error:'ignored'},3,{tagged:true}),2);
});
