import {test} from 'node:test';import assert from 'node:assert/strict';
import {encodeComponent,decodeComponent} from '../src/component-codec.mjs';import {renderQuery,parseQuery} from '../src/query.mjs';
test('component UTF8 policy and literal plus',()=>{
 assert.equal(encodeComponent("AZaz09-._~ !'()*+/=&雪😀"),'AZaz09-._~%20%21%27%28%29%2A%2B%2F%3D%26%E9%9B%AA%F0%9F%98%80');
 assert.equal(decodeComponent('a+b%20c%2bd'),'a+b c+d');assert.equal(decodeComponent('%e9%9b%aa'),'雪');assert.equal(decodeComponent('x=y'),'x=y');
 for(const text of ['','a b','%','\0','é','𐀀'])assert.equal(decodeComponent(encodeComponent(text)),text);
});
test('query pair ordering, repeats and empty components',()=>{
 const entries=Object.freeze([Object.freeze(['a','1']),Object.freeze(['a','2']),Object.freeze(['','']),Object.freeze(['__proto__','x=y&z']),Object.freeze(['雪','+'])]);
 const wire='a=1&a=2&=&__proto__=x%3Dy%26z&%E9%9B%AA=%2B';assert.equal(renderQuery(entries),wire);assert.deepEqual(parseQuery(wire),entries);assert.deepEqual(parseQuery('x=a=b&x=+'),[['x','a=b'],['x','+']]);assert.equal(renderQuery([]),'');assert.deepEqual(parseQuery(''),[]);
});
test('invalid input retains precise error classes',()=>{
 for(const value of [2,null,{}]){assert.throws(()=>encodeComponent(value),TypeError);assert.throws(()=>decodeComponent(value),TypeError);assert.throws(()=>parseQuery(value),TypeError);}
 assert.throws(()=>encodeComponent('\ud800'),URIError);
 for(const wire of ['%','%GG','%C0%AF','%ED%A0%80','%E2%82']){assert.throws(()=>decodeComponent(wire),URIError);assert.throws(()=>parseQuery('x='+wire),URIError);}
 for(const wire of ['a','a=1&','&a=1'])assert.throws(()=>parseQuery(wire),SyntaxError);
});
