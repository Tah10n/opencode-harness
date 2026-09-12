import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseMediaType} from '../src/media-type.mjs';
test('quoted parameters and legacy token cases',()=>{for(const [input,expected]of [[" Text/Plain ; Charset = UTF-8 ", {"type": "text", "subtype": "plain", "parameters": {"charset": "UTF-8"}}], ["application/x-demo; title=\"a;b=c\"; quote=\"x\\\"y\"; slash=\"a\\\\b\"", {"type": "application", "subtype": "x-demo", "parameters": {"title": "a;b=c", "quote": "x\"y", "slash": "a\\b"}}], ["text/plain;empty=\"\";x=\" \tvalue \";X=last", {"type": "text", "subtype": "plain", "parameters": {"empty": "", "x": "last"}}], ["a/b; x=\"\\;\\=\\z\"", {"type": "a", "subtype": "b", "parameters": {"x": ";=z"}}]])assert.deepEqual(checked(input),expected);});
test('duplicate normalized parameter names last wins and own special keys',()=>{
 const result=parseMediaType('Text/Plain; A=one;a="two";__proto__="data";constructor=x');
 assert.equal(result.parameters.a,'two');assert.equal(Object.hasOwn(result.parameters,'__proto__'),true);assert.equal(result.parameters.__proto__,'data');assert.equal(result.parameters.constructor,'x');
 assert.equal(result.type,'text');assert.equal(result.subtype,'plain');
});
test('strict rejected grammar and quoted character limits',()=>{
 for(const input of ['', 'text', 'text /plain','text/ plain','text/plain;','text/plain; x=','text/plain; =x','text/plain; x="open','text/plain; x="bad\\','text/plain; x="ok"tail','text/plain; x=a b','text/plain; x="a\nb"','text/plain; x="a\rb"','text/plain; x="a\0b"','text/plain; x="é"','text/plain;\u00a0x=a','text/plain\n'])assert.throws(()=>parseMediaType(input),TypeError);
 for(const input of [null,undefined,3,{}])assert.throws(()=>parseMediaType(input),TypeError);
});
test('empty quoted value, no generic trimming inside quotes',()=>{
 assert.equal(parseMediaType('a/b; x=""').parameters.x,'');assert.equal(parseMediaType('a/b;x=" \t "').parameters.x,' \t ');
 assert.deepEqual(checked('a/b').parameters,{});
});

function normalized(result){return {type:result.type,subtype:result.subtype,parameters:Object.fromEntries(Object.entries(result.parameters))};}
function checked(text){let result;assert.doesNotThrow(()=>{result=parseMediaType(text);});return normalized(result);}
