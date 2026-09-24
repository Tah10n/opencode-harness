import {test} from 'node:test';import assert from 'node:assert/strict';
import {splitLines,LineDecoder} from '../src/lines.mjs';
test('whole input CRLF and bare CR semantics',()=>{
 assert.deepEqual(splitLines('a\r\nb\n\nc\r'),['a','b','','c\r']);
 assert.deepEqual(splitLines('\r\r\n'),['\r']);assert.deepEqual(splitLines('\n'),['']);
 assert.deepEqual(splitLines(''),[]);assert.deepEqual(splitLines('\r'),['\r']);
 assert.deepEqual(splitLines('a\rb'),['a\rb']);
});
test('split CRLF across pushes and empty chunks',()=>{
 const d=new LineDecoder();assert.deepEqual(d.push('a\r'),[]);assert.deepEqual(d.push(''),[]);
 assert.deepEqual(d.push('\nb\n\r'),['a','b']);assert.deepEqual(d.push('\nlast'),['']);
 assert.deepEqual(d.finish(),['last']);assert.deepEqual(d.finish(),[]);
});
test('every partition agrees including UTF16 fragments',()=>{
 const text='A😀\r\n\rB\n\nC\r';const expected=['A😀','\rB','','C\r'];
 for(let a=0;a<=text.length;a++)for(let b=a;b<=text.length;b++){
 const d=new LineDecoder();assert.deepEqual([...d.push(text.slice(0,a)),...d.push(text.slice(a,b)),...d.push(text.slice(b)),...d.finish()],expected);}
});
test('finish once, fresh results and state separation',()=>{
 const a=new LineDecoder(),b=new LineDecoder();const first=a.push('one\n');first[0]='changed';
 assert.deepEqual(b.push('two'),[]);assert.deepEqual(a.push('three\n'),['three']);assert.deepEqual(a.finish(),[]);assert.deepEqual(b.finish(),['two']);
 assert.throws(()=>a.push(''),e=>e.code==='LINE_DECODER_CLOSED');assert.deepEqual(a.finish(),[]);
 const empty=new LineDecoder();assert.deepEqual(empty.finish(),[]);assert.throws(()=>empty.push('x'),e=>e.code==='LINE_DECODER_CLOSED');
});
