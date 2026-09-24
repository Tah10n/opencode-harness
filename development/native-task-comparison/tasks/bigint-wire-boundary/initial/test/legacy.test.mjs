import {test} from 'node:test';import assert from 'node:assert/strict';
import {stringify,parse} from '../src/wire.mjs';test('ordinary JSON',()=>{const input={a:1,b:['x',null]};assert.equal(stringify(input),JSON.stringify(input));assert.deepEqual(parse(stringify(input)),input);assert.throws(()=>parse('{bad'),SyntaxError);});
