import {test} from 'node:test';import assert from 'node:assert/strict';
import {evaluate} from '../src/evaluate.mjs';test('arithmetic',()=>{assert.equal(evaluate('2+3*4'),14);assert.equal(evaluate('(2+3)*4'),20);assert.throws(()=>evaluate('1+'),{name:'SyntaxError',message:'Expected expression at 2'});});
