import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
const base=process.env.PILOT_SOURCE;
const load=n=>import(path.join(base,n));
const {drafts}=await load('src/drafts.mjs'),{apply}=await load('src/editor.mjs');
test('cancel retains published revision and other drafts',()=>{const s=drafts();s.stage('a','live');s.publish('a');s.stage('a','replacement');s.stage('b','other');assert.deepEqual(apply(s,[{type:'cancel',id:'a'},{type:'cancel',id:'a'}]),[true,false]);assert.deepEqual(s.read(),{staged:{b:'other'},published:{a:'live'}});});
test('ordered publish/cancel and absent',()=>{const s=drafts();s.stage('a','A');s.stage('b','B');assert.deepEqual(apply(s,[{type:'cancel',id:'a'},{type:'publish',id:'a'},{type:'publish',id:'b'},{type:'cancel',id:'b'}]),[true,false,true,false]);assert.deepEqual(s.read(),{staged:{},published:{b:'B'}});assert.deepEqual(apply(s,[]),[]);});
test('validate entire batch before mutation',()=>{for(const bad of [null,{type:'x',id:'a'},{type:'cancel',id:''},{type:'cancel',id:1}]){const s=drafts();s.stage('a','A');assert.throws(()=>apply(s,[{type:'publish',id:'a'},bad]),TypeError);assert.deepEqual(s.read(),{staged:{a:'A'},published:{}});}assert.throws(()=>apply(drafts(),null),TypeError);});
