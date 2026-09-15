import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const root=process.env.PILOT_SOURCE;const {parseColor,shiftColor,formatColor}=await import(path.join(root,'src/color-core.mjs'));const {adjustColor}=await import(path.join(root,'src/color.mjs'));
test('hex parsing/canonical output and alpha',()=>{
 for(const [text,rgba,canonical]of [['#abc',{r:170,g:187,b:204,a:255},'#aabbcc'],['#1234',{r:17,g:34,b:51,a:68},'#11223344'],['#00FF0080',{r:0,g:255,b:0,a:128},'#00ff0080'],['#123456ff',{r:18,g:52,b:86,a:255},'#123456']]){assert.deepEqual(parseColor(text),rgba);assert.equal(formatColor(rgba),canonical);assert.equal(adjustColor(text,0),canonical);}
 for(const bad of ['abc','#12','#12345','#ggg','#abc ',' #abc',null])assert.throws(()=>parseColor(bad),TypeError);
});
test('pure clamped-endpoint channel shift preserves alpha',()=>{
 const color=Object.freeze({r:0,g:100,b:255,a:17});assert.deepEqual(shiftColor(color,.5),{r:128,g:178,b:255,a:17});assert.deepEqual(shiftColor(color,-.5),{r:0,g:50,b:128,a:17});assert.deepEqual(shiftColor(color,-1),{r:0,g:0,b:0,a:17});assert.deepEqual(shiftColor(color,1),{r:255,g:255,b:255,a:17});assert.notEqual(shiftColor(color,0),color);assert.deepEqual(color,{r:0,g:100,b:255,a:17});
 assert.equal(adjustColor('#1234',.5),'#88919944');
});
test('amount errors and parse-before-transform order',()=>{
 for(const amount of [-1.01,1.01,NaN,Infinity,'0',null])assert.throws(()=>shiftColor({r:1,g:2,b:3,a:255},amount),RangeError);
 assert.throws(()=>adjustColor('bad',NaN),TypeError);assert.throws(()=>adjustColor('#fff',NaN),RangeError);
});
