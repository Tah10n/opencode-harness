import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const {copyValues}=await import(path.join(process.env.PILOT_SOURCE,'src/copy.mjs'));
test('symbols and strings preserve shallow identities',()=>{
 const same=Symbol('same'),other=Symbol('same'),hidden=Symbol('hidden'),nested={n:1};
 const source={a:nested,[same]:nested,[other]:2};Object.defineProperty(source,hidden,{value:3});
 const result=copyValues(source);assert.deepEqual(Reflect.ownKeys(result),['a',same,other]);
 assert.equal(result.a,nested);assert.equal(result[same],nested);assert.equal(result[other],2);assert.equal(result[hidden],undefined);assert.notEqual(result,source);
});
test('enumerability ownership and getter values',()=>{
 const key=Symbol('value'),skipped=Symbol('skip');let reads=0;
 const proto={inherited:2};const source=Object.create(proto);
 Object.defineProperty(source,'a',{get(){reads++;assert.equal(this,source);return 7;},enumerable:true});
 Object.defineProperty(source,key,{get(){reads++;assert.equal(this,source);return 8;},enumerable:true});
 Object.defineProperty(source,skipped,{get(){throw new Error('hidden');},enumerable:false});
 const out=copyValues(source);assert.equal(reads,2);assert.equal(out.a,7);assert.equal(out[key],8);assert.equal(Object.hasOwn(out,'inherited'),false);
 for(const k of ['a',key]){const d=Object.getOwnPropertyDescriptor(out,k);assert.equal(d.get,undefined);assert.equal(d.writable,true);assert.equal(d.enumerable,true);assert.equal(d.configurable,true);}
 assert.equal(typeof Object.getOwnPropertyDescriptor(source,'a').get,'function');
});
test('own __proto__ is data and null prototype source works',()=>{
 const s=Object.create(null);const payload={sentinel:1};s.__proto__=payload;s.constructor='value';s.toString='text';
 const out=copyValues(s);assert.equal(Object.hasOwn(out,'__proto__'),true);assert.equal(out.__proto__,payload);assert.equal(out.constructor,'value');assert.equal(out.toString,'text');
 assert.equal(Object.getPrototypeOf(out),Object.prototype);assert.equal(out.sentinel,undefined);
});
test('standard own-key read order and errors',()=>{
 const log=[],s1=Symbol('s1'),s2=Symbol('s2'),source={};
 for(const k of ['z','10','2','a',s1,s2])Object.defineProperty(source,k,{enumerable:true,get(){log.push(k);return k;}});
 const out=copyValues(source);assert.deepEqual(log,['2','10','z','a',s1,s2]);assert.deepEqual(Reflect.ownKeys(out),log);
 const failure={why:'getter'};let later=0;const bad={get first(){throw failure;},get second(){later++;return 1;}};
 assert.throws(()=>copyValues(bad),e=>e===failure);assert.equal(later,0);
});
test('frozen sources and nonenumerable string exclusions',()=>{
 const source=Object.freeze({a:1});const out=copyValues(source);out.a=2;assert.equal(source.a,1);
 const hidden={};Object.defineProperty(hidden,'x',{get(){throw new Error('hidden');}});
 assert.deepEqual(copyValues(hidden),{});assert.deepEqual(copyValues({}),{});
});
