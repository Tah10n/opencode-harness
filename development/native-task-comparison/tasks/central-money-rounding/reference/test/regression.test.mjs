import {test} from 'node:test';import assert from 'node:assert/strict';
import {roundRatio} from '../src/money-core.mjs';import {taxCents} from '../src/tax.mjs';import {shareCents} from '../src/share.mjs';import {invoiceTotal} from '../src/totals.mjs';
test('signed half ties toward positive infinity, zero normalized',()=>{
 for(const [n,d,expected]of [[1,2,1],[3,2,2],[5,2,3],[-1,2,0],[-3,2,-1],[-5,2,-2],[149,100,1],[150,100,2],[-149,100,-1],[-150,100,-1],[-151,100,-2],[0,7,0],[-0,3,0]]){assert.equal(roundRatio(n,d),expected);if(expected===0)assert.equal(Object.is(roundRatio(n,d),0),true);}
 assert.equal(roundRatio(999999999999999,1000000),1000000000);
 assert.equal(roundRatio(-999999999999999,1000000),-1000000000);
});
test('billing consumers preserve negative ties and per-line totals',()=>{
 assert.equal(taxCents(5,1000),1);assert.equal(taxCents(-5,1000),0);assert.equal(taxCents(-15,1000),-1);
 assert.equal(shareCents(3,1,2),2);assert.equal(shareCents(-3,1,2),-1);assert.equal(shareCents(7,0,3),0);
 const lines=Object.freeze([5,5]);assert.deepEqual(invoiceTotal(lines,1000),{subtotal:10,tax:2,total:12});assert.deepEqual(lines,[5,5]);
 assert.deepEqual(invoiceTotal([-5,-15],1000),{subtotal:-20,tax:-1,total:-21});assert.deepEqual(invoiceTotal([],1000),{subtotal:0,tax:0,total:0});
});
test('bounded ratio and helper validation',()=>{
 for(const [n,d]of [[1,0],[1,-1],[1,1000001],[1.5,2],[Infinity,2],[1000000000000001,2],['1',2]])assert.throws(()=>roundRatio(n,d),RangeError);
 for(const args of [[1000000001,1],[1,-1],[1,100001],[1,'1']])assert.throws(()=>taxCents(...args),RangeError);
 for(const args of [[1,1,0],[1,2,1],[1,-1,2],[1,1,1000001],[1,1.5,2]])assert.throws(()=>shareCents(...args),RangeError);
 assert.equal(taxCents(1000000000,100000),10000000000);assert.equal(shareCents(-1000000000,1000000,1000000),-1000000000);
});
