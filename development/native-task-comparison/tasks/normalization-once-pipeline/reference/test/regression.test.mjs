import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeName} from '../src/normalize.mjs';import {validateNormalized,displayNormalized} from '../src/name-core.mjs';import {processName,validateName,displayName} from '../src/names.mjs';
test('pipeline normalizes once and reuses exact returned string',()=>{
 let calls=0;const seen=[];const result=processName(' RAW ',{normalize:function(raw){assert.equal(this,undefined);assert.equal(arguments.length,1);seen.push(raw);calls++;return calls===1?'first':'wrong';}});
 assert.deepEqual(result,{ok:true,name:'first',label:'@first'});assert.equal(calls,1);assert.deepEqual(seen,[' RAW ']);
});
test('invalid pipeline still normalizes exactly once and propagates errors',()=>{
 for(const [value,error]of [['','empty'],['x'.repeat(21),'too_long'],['bad name','invalid']]){
 let calls=0;assert.deepEqual(processName('raw',{normalize:()=>{calls++;return value;}}),{ok:false,error});assert.equal(calls,1);}
 const failure={why:'normalize'};assert.throws(()=>processName('raw',{normalize:()=>{throw failure;}}),e=>e===failure);
});
test('legacy raw wrappers and default normalization preserved',()=>{
 assert.equal(normalizeName(' \tAlice_X\n '),'alice_x');assert.equal(normalizeName(' É '),'É');
 assert.equal(validateName(' Alice-X '),null);assert.equal(displayName(' Alice-X '),'@alice-x');assert.equal(displayName(' '),'@');
 assert.deepEqual(processName(' Bob_2 '),{ok:true,name:'bob_2',label:'@bob_2'});
 assert.deepEqual(processName('123'),{ok:false,error:'invalid'});assert.deepEqual(processName('x'.repeat(21)),{ok:false,error:'too_long'});
});
test('normalized core never transforms its input',()=>{
 assert.equal(validateNormalized('UPPER'),'invalid');assert.equal(displayNormalized('UPPER'),'@UPPER');
 assert.equal(validateNormalized(' x '),'invalid');assert.equal(validateNormalized('x'.repeat(20)),null);
 assert.equal(validateNormalized(''), 'empty');assert.equal(displayNormalized(''), '@');
});
