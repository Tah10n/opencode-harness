import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseConfig} from '../src/config.mjs';test('configuration',()=>{assert.deepEqual(parseConfig('host=local\nport = 8080 # development'),{host:'local',port:'8080'});assert.throws(()=>parseConfig('host=a\nhost=b'),{name:'SyntaxError',message:'Duplicate key at 2:1'});});
