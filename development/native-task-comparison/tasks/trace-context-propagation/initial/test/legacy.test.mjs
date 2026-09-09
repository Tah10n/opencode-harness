import {test} from 'node:test';import assert from 'node:assert/strict';
import {childHeaders} from '../src/headers.mjs';test('fresh context',()=>assert.deepEqual(childHeaders({},[],'1'.repeat(32),'2'.repeat(16)),{traceparent:'00-'+'1'.repeat(32)+'-'+'2'.repeat(16)+'-00'}));
