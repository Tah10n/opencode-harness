import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const {formatError}=await import(path.join(process.env.PILOT_SOURCE,'src/error-view.mjs'));
test('nested native nonenumerable causes and legacy head',()=>{
 const inner=new TypeError('bad'),outer=new Error('load',{cause:inner});
 assert.equal(Object.prototype.propertyIsEnumerable.call(outer,'cause'),false);
 assert.equal(formatError(outer),'Error: load\nCaused by: TypeError: bad');
 const top=new RangeError('outer',{cause:outer});assert.equal(formatError(top),'RangeError: outer\nCaused by: Error: load\nCaused by: TypeError: bad');
});
test('primitive causes retain falsy values and undefined terminates',()=>{
 for(const [value,text]of [[null,'null'],[false,'false'],[0,'0'],['',''],[12n,'12'],[Symbol('x'),'Symbol(x)']]){
 assert.equal(formatError(new Error('x',{cause:value})),'Error: x\nCaused by: '+text);}
 assert.equal(formatError(new Error('x',{cause:undefined})),'Error: x');
});
test('cycles by identity and repeated messages are distinct',()=>{
 const a=new Error('a'),b=new Error('b');a.cause=b;b.cause=a;
 assert.equal(formatError(a),'Error: a\nCaused by: Error: b\nCaused by: [Circular cause]');
 const self=new Error('self');self.cause=self;assert.equal(formatError(self),'Error: self\nCaused by: [Circular cause]');
 const first=new Error('same',{cause:new Error('same')});assert.equal(formatError(first),'Error: same\nCaused by: Error: same');
 assert.equal(a.cause,b);assert.equal(b.cause,a);
});
test('inherited cause ignored and frozen errors preserved',()=>{
 const error=new Error('own');const proto=Object.create(Error.prototype);Object.defineProperty(proto,'cause',{get(){throw new Error('inherited read');}});
 Object.setPrototypeOf(error,proto);Object.freeze(error);assert.equal(formatError(error),'Error: own');
 const inner=Object.freeze(new Error('i')),outer=Object.freeze(new Error('o',{cause:inner}));assert.equal(formatError(outer),'Error: o\nCaused by: Error: i');assert.equal(outer.cause,inner);
});
test('exact unescaped names and messages, root type',()=>{
 const e=new Error('a\nb');e.name='Custom';assert.equal(formatError(e),'Custom: a\nb');
 const blank=new Error('');blank.name='';assert.equal(formatError(blank),': ');
 for(const value of [null,undefined,'x',{},42])assert.throws(()=>formatError(value),TypeError);
});
