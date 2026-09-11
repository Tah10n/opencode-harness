import {test} from 'node:test';import assert from 'node:assert/strict';
import {drafts} from '../src/drafts.mjs';import {apply} from '../src/editor.mjs';
test('publish, cancel replacement and absent',()=>{
 const s=drafts();s.stage('x','original');assert.deepEqual(apply(s,[{type:'publish',id:'x'}]),[true]);assert.deepEqual(s.read().published,{x:'original'});
 s.stage('x','replacement');s.stage('other','keep');s.cancel('x');
 apply(s,[{type:'cancel',id:'x'}]);
 assert.deepEqual(s.read(),{staged:{other:'keep'},published:{x:'original'}});
 assert.deepEqual(apply(s,[{type:'cancel',id:'missing'}]),[false]);
 assert.deepEqual(apply(s,[{type:'unknown',id:'other'}]),[false]);assert.deepEqual(s.read().staged,{other:'keep'});
});
