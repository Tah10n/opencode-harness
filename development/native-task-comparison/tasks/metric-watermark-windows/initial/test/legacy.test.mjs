import {test} from 'node:test';import assert from 'node:assert/strict';
import {createMetrics} from '../src/metrics.mjs';import {windowStart,summarize} from '../src/windows.mjs';test('empty and helper',()=>{assert.deepEqual(createMetrics(10).advance(10),[]);assert.equal(windowStart(19,10),10);assert.deepEqual(summarize('a',0,10,[2,3]),{key:'a',start:0,end:10,count:2,sum:5});});
