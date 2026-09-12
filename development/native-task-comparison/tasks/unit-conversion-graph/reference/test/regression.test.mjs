import {test} from 'node:test';import assert from 'node:assert/strict';
import {compileUnitGraph} from '../src/unit-graph.mjs';import {createConverter} from '../src/convert.mjs';
const edge=(from,to,numerator,denominator=1)=>({from,to,numerator,denominator});const near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-12*Math.max(1,Math.abs(b)),a+' vs '+b);
test('multihop/reverse conversion and frozen snapshot',()=>{
 const edges=Object.freeze([edge('m','cm',100),edge('cm','mm',10),edge('inch','mm',127,5),edge('foot','inch',12),edge('m','mm',1000),edge('kg','g',1000)].map(Object.freeze));
 const convert=createConverter(edges);assert.equal(convert(2,'m','mm'),2000);near(convert(1,'foot','m'),.3048);near(convert(convert(12,'inch','cm'),'cm','inch'),12);assert.equal(convert(7,'m','m'),7);assert.ok(Object.is(convert(-0,'m','m'),-0));assert.throws(()=>convert(1,'m','g'),{name:'RangeError',message:'disconnected units'});assert.throws(()=>convert(1,'unknown','unknown'),{name:'RangeError',message:'unknown unit'});
 const mutable=[edge('a','b',2)],snapshot=compileUnitGraph(mutable);mutable[0].numerator=9;mutable.push(edge('b','c',3));assert.equal(snapshot(1,'a','b'),2);assert.throws(()=>snapshot(1,'a','c'),RangeError);
});
test('all components checked for exact rational consistency',()=>{
 assert.throws(()=>createConverter([edge('a','b',2),edge('b','c',3),edge('a','c',7)]),{name:'RangeError',message:'inconsistent conversions'});
 assert.throws(()=>compileUnitGraph([edge('m','cm',100),edge('x','y',1),edge('x','y',1000000,999999)]),RangeError);
 const good=compileUnitGraph([edge('a','b',2,3),edge('b','c',3,5),edge('a','c',2,5),edge('a','c',4,10)]);near(good(10,'a','c'),4);assert.throws(()=>compileUnitGraph([edge('a','a',2)]),RangeError);
});
test('domain errors and nontrivial rational chains',()=>{
 for(const bad of [edge('a','b',0),edge('A','b',2),edge('a','b',1,0)])assert.throws(()=>compileUnitGraph([bad]),TypeError);
 const convert=compileUnitGraph([edge('a','b',2)]);for(const x of [NaN,Infinity,1000001,'1',null])assert.throws(()=>convert(x,'a','b'),TypeError);assert.throws(()=>compileUnitGraph([])(1,'a','a'),RangeError);
 const edges=[];for(let i=0;i<30;i++)edges.push(edge('u'+String.fromCharCode(97+i%26)+String.fromCharCode(97+Math.floor(i/26)),'u'+String.fromCharCode(97+(i+1)%26)+String.fromCharCode(97+Math.floor((i+1)/26)),999983,999979));const c=compileUnitGraph(edges);near(c(1,edges[0].from,edges.at(-1).to),Math.pow(999983/999979,30));
});
