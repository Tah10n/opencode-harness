import {test} from 'node:test';import assert from 'node:assert/strict';
import {filterNames} from '../src/filter.mjs';
test('stateful expressions restart at zero for each entry',()=>{
 const names=['aba','aba','xba','aba',''];const re=/a/g;re.lastIndex=2;
 assert.deepEqual(filterNames(names,re),['aba','aba','xba','aba']);assert.equal(re.lastIndex,2);
 const sticky=/a/y;sticky.lastIndex=1;
 assert.deepEqual(filterNames(names,sticky),['aba','aba','aba']);assert.equal(sticky.lastIndex,1);
 assert.deepEqual(names,['aba','aba','xba','aba','']);
});
test('flags, empty matches and literal strings remain distinct',()=>{
 assert.deepEqual(filterNames(['A','a','b'],/a/i),['A','a']);
 assert.deepEqual(filterNames(['x\nA','xA'],/^a/im),['x\nA']);
 assert.deepEqual(filterNames(['a\nb','ab'],/a.b/s),['a\nb']);
 assert.deepEqual(filterNames(['x','','x'],/(?:)/g),['x','','x']);
 assert.deepEqual(filterNames(['a.b','axb','a.b'],'.'),['a.b','a.b']);
 assert.deepEqual(filterNames(['x','','x'],''),['x','','x']);
});
test('frozen caller regex is never assigned',()=>{
 const re=/x/g;re.lastIndex=5;Object.freeze(re);
 let result;assert.doesNotThrow(()=>{result=filterNames(['x','x','y'],re);});assert.deepEqual(result,['x','x']);assert.equal(re.lastIndex,5);
});
test('fresh result and strict accepted forms',()=>{
 const input=Object.freeze(['a','a']);const result=filterNames(input,/a/);assert.deepEqual(result,['a','a']);assert.notEqual(result,input);
 for(const value of [null,undefined,1,{source:'a',flags:''},()=>true])assert.throws(()=>filterNames([],value),TypeError);
 const re=/z/g;re.lastIndex=99;assert.deepEqual(filterNames([],re),[]);assert.equal(re.lastIndex,99);
});
