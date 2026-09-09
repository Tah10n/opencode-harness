import {test} from 'node:test';import assert from 'node:assert/strict';
import {createConverter} from '../src/convert.mjs';test('direct units',()=>{const c=createConverter([{from:'m',to:'cm',numerator:100,denominator:1}]);assert.equal(c(2,'m','cm'),200);assert.equal(c(250,'cm','m'),2.5);assert.equal(c(3,'m','m'),3);});
