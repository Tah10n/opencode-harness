import assert from 'node:assert/strict'; import {test} from 'node:test';import {mergeConfig} from '../src/config.mjs';
test('merge no longer changes reusable defaults',()=>{
 const defaults={server:{port:80,tls:false}}, before=structuredClone(defaults);
 assert.deepEqual(mergeConfig(defaults,{server:{tls:true}}),{server:{port:80,tls:true}});
 assert.deepEqual(defaults,before);
});
test('existing replacement and undefined rules',()=>{
 assert.deepEqual(mergeConfig({x:1,items:[1]},{x:undefined,items:[2]}),{x:1,items:[2]});
 assert.deepEqual(mergeConfig({x:1},{x:null}),{x:null});
});
