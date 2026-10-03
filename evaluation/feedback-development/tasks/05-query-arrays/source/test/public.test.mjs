import assert from 'node:assert/strict'; import {test} from 'node:test';
import {withQuery} from '../src/query.mjs';
test('array produces repeated values',()=>{
 const output=withQuery('/items?tag=old',{tag:['a','b']});
 assert.deepEqual(new URL(output,'https://example.test').searchParams.getAll('tag'),['a','b']);
});
test('scalar, deletion and fragments stay compatible',()=>{
 assert.equal(withQuery('/x?q=a#frag',{q:'b'}),'/x?q=b#frag');
 assert.equal(withQuery('/x?q=a',{q:null}),'/x');
 assert.equal(withQuery('/x?q=a',{q:undefined}),'/x?q=a');
});
