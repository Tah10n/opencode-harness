import {test} from 'node:test';import assert from 'node:assert/strict';
import {responseRows} from '../src/project.mjs';test('scalar rename',()=>assert.deepEqual(responseRows([{name:'Ada',private:'secret'}],[{path:['name'],as:'label'}]).map(row=>({...row})),[{label:'Ada'}]));
