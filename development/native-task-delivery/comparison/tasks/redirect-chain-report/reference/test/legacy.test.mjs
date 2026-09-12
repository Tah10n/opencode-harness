import {test} from 'node:test';import assert from 'node:assert/strict';
import {report} from '../src/report.mjs';test('no redirects',()=>assert.equal(report(['home'],{}),'home'));