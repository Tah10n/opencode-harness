import {test} from 'node:test';import assert from 'node:assert/strict';
import {quote} from '../src/quote.mjs';test('actual weight quote',()=>assert.deepEqual(quote([{id:'p',length:1,width:1,height:1,grams:150}],{divisor:10,maxSide:50,base:5,stepGrams:100,stepCents:7}),[{id:'p',status:'quoted',grams:150,cents:19}]));
