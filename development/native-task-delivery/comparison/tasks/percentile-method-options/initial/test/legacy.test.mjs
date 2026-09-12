import {test} from 'node:test';import assert from 'node:assert/strict';
import {percentile} from '../src/percentile.mjs';test('nearest',()=>assert.equal(percentile([30,10,20],0.5),20));