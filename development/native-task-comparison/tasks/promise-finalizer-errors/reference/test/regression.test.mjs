import {test} from 'node:test';import assert from 'node:assert/strict';
import {wrap} from '../src/promise.mjs';
test('fulfillment and rejection preserve original identity with no callback arguments',async()=>{
 const value={x:1};let count=0;
 const result=await wrap(value).finally(function(){assert.equal(this,undefined);assert.equal(arguments.length,0);count++;return 99;});
 assert.equal(result,value);assert.equal(count,1);
 const reason={why:'original'};await assert.rejects(Promise.resolve(wrap(Promise.reject(reason)).finally(()=>{count++;return 'ignored';})),e=>e===reason);assert.equal(count,2);
});
test('waits for returned thenable before downstream delivery',async()=>{
 let release,started,observed=false;const entered=new Promise(r=>{started=r;}),gate={then(resolve){release=resolve;started();}};
 const result=wrap(7).finally(()=>gate).then(value=>{observed=true;return value;});
 await entered;assert.equal(observed,false);release('unused');assert.equal(await result,7);assert.equal(observed,true);
});
test('finalizer throw or rejection overrides both outcomes',async()=>{
 const original={why:'original'},failure={why:'cleanup'};
 for(const initial of [5,Promise.reject(original)]){
 await assert.rejects(Promise.resolve(wrap(initial).finally(()=>{throw failure;})),e=>e===failure);}
 for(const initial of [5,Promise.reject(original)]){
 await assert.rejects(Promise.resolve(wrap(initial).finally(()=>Promise.reject(failure))),e=>e===failure);}
});
test('nonfunctions ignored without thenable assimilation',async()=>{
 const ignored={get then(){throw new Error('must not inspect');}};
 for(const value of [undefined,null,4,ignored])assert.equal(await wrap(3).finally(value),3);
 const reason={why:'x'};await assert.rejects(Promise.resolve(wrap(Promise.reject(reason)).finally(ignored)),e=>e===reason);
});
test('then catch finally stay chainable and separate branches independent',async()=>{
 const root=wrap(2),log=[];const a=root.then(x=>x+1).finally(()=>log.push('a'));const b=root.then(()=>{throw 'bad';}).catch(e=>e+'!').finally(()=>log.push('b'));
 assert.equal(await a,3);assert.equal(await b,'bad!');assert.deepEqual(log.sort(),['a','b']);assert.equal(await root,2);
});
