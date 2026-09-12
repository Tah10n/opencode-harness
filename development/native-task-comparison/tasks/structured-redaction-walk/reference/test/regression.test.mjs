import {test} from 'node:test';import assert from 'node:assert/strict';
import {copyRedacted} from '../src/structure.mjs';import {redact} from '../src/redact.mjs';
test('nested redaction, alias/cycle preservation and no mutation',()=>{
 const shared={name:'Ada',TOKEN:'secret'},root={left:shared,right:shared,list:[shared,null,3],password:{hidden:'value'}};root.self=root;const result=redact(root);
 assert.notEqual(result,root);assert.equal(result.self,result);assert.equal(result.left,result.right);assert.equal(result.list[0],result.left);assert.notEqual(result.left,shared);assert.equal(result.left.TOKEN,'[REDACTED]');assert.equal(result.password,'[REDACTED]');assert.deepEqual(result.list.slice(1),[null,3]);assert.equal(shared.TOKEN,'secret');assert.equal(root.password.hidden,'value');
});
test('own special keys, null prototype and frozen inputs',()=>{
 const object=Object.create(null);object.__proto__={password:'x'};object.keep=undefined;Object.freeze(object);const result=redact(object,{keys:['PASSWORD'],mask:'X'});assert.equal(Object.getPrototypeOf(result),null);assert.equal(Object.hasOwn(result,'__proto__'),true);assert.deepEqual(result.__proto__,{password:'X'});assert.equal(Object.hasOwn(result,'keep'),true);assert.equal(result.keep,undefined);
 const ordinary=JSON.parse('{"__proto__":"secret","constructor":"name"}');const copied=redact(ordinary,{keys:['__proto__']});assert.equal(Object.getPrototypeOf(copied),Object.prototype);assert.equal(copied.__proto__,'[REDACTED]');assert.equal(copied.constructor,'name');
});
test('structural helper leaves policy external and skips redacted subtrees',()=>{
 const seen=[],input={skip:{mustNotVisit:1},keep:[{visible:2}]};const result=copyRedacted(input,function(key){assert.equal(this,undefined);seen.push(key);return key==='skip';},'MASK');assert.deepEqual(result,{skip:'MASK',keep:[{visible:2}]});assert.equal(seen.includes('mustNotVisit'),false);assert.equal(seen.includes('0'),false);assert.deepEqual([...seen].sort(),['keep','skip','visible']);
 assert.equal(redact('password'),'password');assert.equal(redact(null),null);assert.deepEqual(redact({password:'x'},{keys:[]}),{password:'x'});
});
