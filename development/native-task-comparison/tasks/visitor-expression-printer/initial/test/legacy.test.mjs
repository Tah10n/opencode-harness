import {test} from 'node:test';import assert from 'node:assert/strict';
import {printExpression} from '../src/printer.mjs';test('expression text',()=>{assert.equal(printExpression({type:'binary',op:'+',left:{type:'literal',value:2},right:{type:'literal',value:3}}),'2 + 3');assert.equal(printExpression({type:'literal',value:'x'}),'"x"');});
