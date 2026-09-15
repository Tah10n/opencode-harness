import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseMediaType} from '../src/media-type.mjs';test('token parameters',()=>{assert.deepEqual(checked('text/plain;charset=UTF-8'),{type:'text',subtype:'plain',parameters:{charset:'UTF-8'}});assert.deepEqual(checked('application/json'),{type:'application',subtype:'json',parameters:{}});});

function normalized(result){return {type:result.type,subtype:result.subtype,parameters:Object.fromEntries(Object.entries(result.parameters))};}
function checked(text){let result;assert.doesNotThrow(()=>{result=parseMediaType(text);});return normalized(result);}
